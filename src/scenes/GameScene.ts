import Phaser from 'phaser';
import { CameraRig } from '../cameraRig';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { t, type TextKey } from '../i18n';
import { aimAngle, BLOCKED_TILES, EDGES, ENTRANCE_EDGES, LEVEL, PATH_TILES, WORLD, cellKey, worldToCell } from '../level';
import { isPortraitPhone } from '../orientation';
import { addMap } from '../mapArt';
import { MapGestures } from '../mapGestures';
import { Bacterium, type BacteriumKind } from '../objects/Bacterium';
import { GroundShot } from '../objects/GroundShot';
import { Projectile } from '../objects/Projectile';
import { Puddle } from '../objects/Puddle';
import { beamReach, createTowerArt, defaultAim, drawAimLine, Tower, type TowerId } from '../objects/Tower';
import { tileCenter, type Edge } from '../pathing';
import { sfx } from '../sound';
import { COLORS, FONT, TEXT_COLORS } from '../theme';
import { Panel, VIEW_W } from '../ui/Panel';

const { width: W, height: H } = CONFIG.screen;
/** Защита от «прыжков» после сворачивания вкладки: один кадр не длиннее 50 мс. */
const MAX_FRAME_MS = 50;
/** Если кадр очень длинный, за него выйдет не больше стольких бактерий (защита от лавины). */
const MAX_SPAWNS_PER_FRAME = 10;
/** Строка таблицы башен. */
type TowerCfg = (typeof CONFIG.towers)[TowerId];
/** Все типы бактерий в порядке появления в игре. */
const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];
/** Сообщение при первом появлении типа (у кокка нет: он с первой волны). */
const NEW_TYPE_TEXT: Partial<Record<BacteriumKind, TextKey>> = {
  rod: 'newTypeRod',
  splitter: 'newTypeSplitter',
  armored: 'newTypeArmored',
  spore: 'newTypeSpore',
  swarm: 'newTypeSwarm',
  runner: 'newTypeRunner',
  healer: 'newTypeHealer',
  slick: 'newTypeSlick',
  regen: 'newTypeRegen',
  commander: 'newTypeCommander',
  brood: 'newTypeBrood',
  giant: 'newTypeGiant',
};
/** Сколько миллисекунд держится сообщение о новом типе. */
const NEW_TYPE_TOAST_MS = 4200;
/** Откуда на экране начинается вспышка луча «Шприца» (от центра башни), пикселей: чуть дальше кончика ствола. */
const BEAM_START_PX = 50;
/** Во что распадается делящаяся (правило игры, не число баланса). */
const SPLITS_INTO: BacteriumKind = 'coccus';
/** Кого рожает матка (правило игры; сколько и как часто — в таблице типов). */
const BREWS_INTO: BacteriumKind = 'swarm';

/** Кто выходит следующим в волне: тип, вход (null — случайный) и сколько секунд ждать до следующего (в пачке — короткая пауза). */
interface SpawnItem {
  kind: BacteriumKind;
  edge: Edge | null;
  gapSec: number;
}
/** Очередь луча «Шприца»: сколько ударов ещё осталось и сколько секунд до следующего. */
interface BeamBurst {
  tower: Tower;
  left: number;
  timer: number;
}

type State = 'playing' | 'paused' | 'won' | 'lost';
type WavePhase = 'countdown' | 'spawning' | 'pause' | 'done';

export class GameScene extends Phaser.Scene {
  private state: State = 'playing';
  private elapsed = 0;
  private coins = 0;
  private lives = 0;
  private kills = 0;
  private splits = 0;
  private disables = 0;
  private leaked = 0;
  private shots = 0;
  private slows = 0;
  private spawned = 0;
  /** Накопленный урон по жизням от «дробных» бактерий (рой): целые жизни списываются, остаток ждёт следующих. */
  private lifePool = 0;
  /** Скорость игры, выбранная игроком кнопкой (1, 2, 3 …): множитель времени сверх тестового `?speed`. */
  private userSpeed = 1;

  private bacteria: Bacterium[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  /** Капли сиропа в полёте к дорожке, лужи на дорожках и очереди луча «Шприца». */
  private groundShots: GroundShot[] = [];
  private puddles: Puddle[] = [];
  private bursts: BeamBurst[] = [];
  /** Занятые клетки (ключ «колонка,ряд»). */
  private occupied = new Set<string>();
  /** Какая башня выбрана на панели (тап по клетке поставит её). */
  private selected: TowerId | null = null;
  /** Подсказка «тапните по Шприцу — повернуть» уже показана в этой партии. */
  private rotateHinted = false;
  /** Поставлена ли уже хоть одна башня (после этого общая подсказка «Выберите башню…» больше не нужна). */
  private placedAny = false;

  // Волны
  private phase: WavePhase = 'countdown';
  private phaseTimer = 0;
  /** Сколько волн уже началось. */
  private waveIdx = 0;
  private waveSpawned = 0;
  private waveCount = 0;
  /** Кто выйдет в текущей волне, по порядку выхода. */
  private waveQueue: SpawnItem[] = [];
  /** Какие типы бактерий уже появлялись (в порядке появления). */
  private introduced: BacteriumKind[] = [];
  private waveInterval = 1;
  private spawnTimer = 0;
  private plannedTotal = 0;
  private panelKey = '';

  /** Тап по экрану паузы не закрывает её раньше этого момента (реальные часы, мс) — иначе тап по кнопке «пауза» сразу её снимет. */
  private resumeAllowedAt = 0;
  /** Тап по экрану конца уровня не перезапускает игру раньше этого момента (реальные часы, мс). */
  private restartAllowedAt = 0;

  private world!: Phaser.GameObjects.Container;
  private puddleLayer!: Phaser.GameObjects.Container;
  private towerLayer!: Phaser.GameObjects.Container;
  private bacteriaLayer!: Phaser.GameObjects.Container;
  private projectileLayer!: Phaser.GameObjects.Container;
  private ghostLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Container;
  private ghostArt!: Phaser.GameObjects.Container;
  private ghostRange!: Phaser.GameObjects.Graphics;
  private ghostAim!: Phaser.GameObjects.Graphics;
  private ghostBarrel!: Phaser.GameObjects.Container;
  private ghostCell!: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Container | null = null;
  private rig!: CameraRig;
  private effects!: Effects;
  private panel!: Panel;

  constructor() {
    super('Game');
  }

  create(): void {
    // Сцена при перезапуске не создаётся заново, поэтому всё обнуляем вручную.
    this.state = 'playing';
    this.elapsed = 0;
    this.coins = CONFIG.economy.startCoins;
    this.lives = CONFIG.lives.start;
    this.kills = 0;
    this.splits = 0;
    this.disables = 0;
    this.leaked = 0;
    this.shots = 0;
    this.slows = 0;
    this.spawned = 0;
    this.lifePool = 0;
    this.bacteria = [];
    this.towers = [];
    this.projectiles = [];
    this.groundShots = [];
    this.puddles = [];
    this.bursts = [];
    this.occupied = new Set();
    this.selected = null;
    this.placedAny = false;
    this.rotateHinted = false;
    this.phase = 'countdown';
    this.phaseTimer = CONFIG.waves.firstDelaySec;
    this.waveIdx = 0;
    this.waveSpawned = 0;
    this.waveCount = 0;
    this.waveQueue = [];
    this.introduced = [];
    this.spawnTimer = 0;
    this.plannedTotal = 0;
    for (let i = 0; i < this.waveTotal(); i++) this.plannedTotal += this.waveKinds(i).length;
    this.panelKey = '';
    this.resumeAllowedAt = 0;
    this.restartAllowedAt = 0;
    this.overlay = null;

    this.input.mouse?.disableContextMenu();
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Мир: карта и всё, что на ней. Камера двигает и масштабирует этот контейнер; панель лежит поверх и не двигается.
    this.world = this.add.container(0, 0);
    const mapLayer = this.add.container(0, 0);
    this.puddleLayer = this.add.container(0, 0);
    this.ghostLayer = this.add.container(0, 0);
    this.towerLayer = this.add.container(0, 0);
    this.bacteriaLayer = this.add.container(0, 0);
    this.projectileLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.world.add([mapLayer, this.puddleLayer, this.ghostLayer, this.towerLayer, this.bacteriaLayer, this.projectileLayer, this.fxLayer]);
    addMap(this, mapLayer);

    this.rig = new CameraRig(this.world, { w: VIEW_W, h: H }, WORLD, { min: CONFIG.camera.zoomMin, max: CONFIG.camera.zoomMax });
    const start = tileCenter(LEVEL.startCenter[0], LEVEL.startCenter[1]);
    this.rig.set(CONFIG.camera.zoomStart, start.x, start.y);

    this.effects = new Effects(this, this.fxLayer);
    this.buildGhost();
    this.userSpeed = this.loadSpeed();
    this.panel = new Panel(this, {
      onTower: (id) => this.toggleTower(id),
      onPause: () => this.togglePause(),
      onSpeed: () => this.cycleSpeed(),
      onWave: () => this.startWaveNow(),
    });
    this.panel.init();
    this.panel.setSpeed(this.userSpeed);
    this.panel.setCoins(this.coins);
    this.updateHint();
    this.refreshPanel();

    new MapGestures(this, this.rig, VIEW_W, {
      isActive: () => this.state === 'playing' && !isPortraitPhone(),
      onTap: (sx, sy) => this.onTap(sx, sy),
      onHover: (sx, sy) => this.onHover(sx, sy),
      onHoverEnd: () => this.ghost.setVisible(false),
    });
    this.input.on('pointerdown', this.onScreenTap, this);

    exposeDebug({
      getState: () => this.snapshot(),
      getGraph: () => ({
        edges: EDGES.map((e) => ({ id: e.id, from: e.from, to: e.to, length: e.length, pts: e.pts.map((p): [number, number] => [p.x, p.y]) })),
        entrances: ENTRANCE_EDGES.map((e) => e.id),
        exits: Object.keys(LEVEL.nodes).filter((n) => !EDGES.some((e) => e.from === n)),
        blockedCells: [...BLOCKED_TILES].map((key): [number, number] => {
          const [col, row] = key.split(',').map(Number);
          return [col, row];
        }),
      }),
      gameToClient: (gx, gy) => this.gameToClient(gx, gy),
      worldToClient: (wx, wy) => {
        const s = this.rig.worldToScreen(wx, wy);
        return this.gameToClient(s.x, s.y);
      },
      cellToClient: (col, row) => {
        const p = tileCenter(col, row);
        const s = this.rig.worldToScreen(p.x, p.y);
        return this.gameToClient(s.x, s.y);
      },
    });
  }

  update(time: number, deltaMs: number): void {
    this.updateChip(time / 1000);
    if (this.state !== 'playing' || isPortraitPhone()) return;

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE * this.userSpeed;
    this.elapsed += dt;
    this.updateWaves(dt);

    this.updatePuddles(dt);
    this.applyHealing(dt);
    this.applyHaste();
    for (const bacterium of this.bacteria) bacterium.update(dt);
    this.updateBrood(dt);
    this.applySpores();
    for (const tower of this.towers) tower.update(dt, this.bacteria, (target, x, y) => this.fire(tower, target, x, y));
    this.updateProjectiles(dt);
    this.updateGroundShots(dt);
    this.updateBursts(dt);
    this.resolveArrivals();
    if (this.state !== 'playing') return;

    if (this.phase === 'done' && this.bacteria.length === 0) this.endGame(true);
    this.refreshPanel();
  }

  // ---------------------------------------------------------------- волны

  private updateWaves(dt: number): void {
    if (this.phase === 'done') return;
    if (this.phase === 'countdown' || this.phase === 'pause') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.startWave();
      return;
    }
    // Бактерии волны выходят по одной; если кадр длинный, за него выйдет сразу несколько
    this.spawnTimer -= dt;
    let count = 0;
    while (this.spawnTimer <= 0 && this.waveSpawned < this.waveCount && count < MAX_SPAWNS_PER_FRAME) {
      const item = this.waveQueue[this.waveSpawned];
      this.spawnBacterium(item);
      this.waveSpawned++;
      this.spawnTimer += item.gapSec;
      count++;
    }
    if (this.waveSpawned >= this.waveCount) {
      if (this.waveIdx >= this.waveTotal()) {
        this.phase = 'done';
      } else {
        this.phase = 'pause';
        this.phaseTimer = CONFIG.waves.pauseSec;
      }
    }
  }

  private startWave(): void {
    const w = CONFIG.waves;
    const i = this.waveIdx;
    const k = w.intervalRampWaves > 1 ? Math.min(1, i / (w.intervalRampWaves - 1)) : 1;
    this.waveInterval = w.intervalStartSec + (w.intervalEndSec - w.intervalStartSec) * k;
    // Новый тип выходит первым и в одном экземпляре (остальные такого же типа — потом, вперемешку с прочими)
    const all = this.waveKinds(i);
    const fresh = KINDS.filter((kind) => !this.introduced.includes(kind) && all.includes(kind));
    const queue: SpawnItem[] = [];
    const rest = [...all];
    for (const kind of fresh) {
      queue.push({ kind, edge: null, gapSec: this.waveInterval });
      rest.splice(rest.indexOf(kind), 1);
    }
    // Остальные собираем в «блоки»: одиночные бактерии и пачки (рой выходит плотно, все по одному входу) — и перемешиваем блоки
    const blocks: SpawnItem[][] = [];
    for (const kind of KINDS) {
      let n = rest.filter((kindOfRest) => kindOfRest === kind).length;
      const gap = CONFIG.types[kind].spawnGapSec;
      if (gap > 0 && n > 0) {
        const packs = Math.ceil(n / w.packMax);
        for (let p = 0; p < packs; p++) {
          const size = Math.ceil(n / (packs - p));
          n -= size;
          const edge = ENTRANCE_EDGES[Math.floor(Math.random() * ENTRANCE_EDGES.length)];
          const pack: SpawnItem[] = [];
          for (let m = 0; m < size; m++) pack.push({ kind, edge, gapSec: m < size - 1 ? gap : this.waveInterval });
          blocks.push(pack);
        }
      } else {
        for (let m = 0; m < n; m++) blocks.push([{ kind, edge: null, gapSec: this.waveInterval }]);
      }
    }
    for (let a = blocks.length - 1; a > 0; a--) {
      const b = Math.floor(Math.random() * (a + 1));
      [blocks[a], blocks[b]] = [blocks[b], blocks[a]];
    }
    this.waveQueue = [...queue, ...blocks.flat()];
    this.waveCount = this.waveQueue.length;
    this.waveIdx++;
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.phase = 'spawning';
    sfx.wave();
  }

  /** Сколько волн идёт на уровне. */
  private waveTotal(): number {
    return Math.min(CONFIG.waves.total, CONFIG.waves.list.length);
  }

  /** Кто выйдет в волне i (по одному элементу на бактерию, в порядке таблицы типов). */
  private waveKinds(i: number): BacteriumKind[] {
    const row = CONFIG.waves.list[i] ?? {};
    const kinds: BacteriumKind[] = [];
    for (const kind of KINDS) for (let n = 0; n < (row[kind] ?? 0); n++) kinds.push(kind);
    return kinds;
  }

  /** Бактерия выходит справа; на какой из входов — случайно. Дальше на каждой развилке она сама выберет путь. */
  private spawnBacterium(item: SpawnItem): void {
    const { kind } = item;
    const edge = item.edge ?? ENTRANCE_EDGES[Math.floor(Math.random() * ENTRANCE_EDGES.length)];
    this.bacteria.push(new Bacterium(this, this.bacteriaLayer, kind, edge, 0));
    this.spawned++;
    if (!this.introduced.includes(kind)) {
      this.introduced.push(kind);
      const text = NEW_TYPE_TEXT[kind];
      if (text) {
        this.panel.toast(t(text), NEW_TYPE_TOAST_MS);
        sfx.newType();
      }
    }
  }

  // ---------------------------------------------------------------- бой

  /**
   * Выстрел башни; возвращает, состоялся ли он. «По радиусу» и «по площади» — снаряд летит за целью; «лужа» — капля летит в точку
   * дорожки впереди бактерии (если там уже есть лужа — выстрела нет); «луч» — запускается очередь ударов по линии.
   */
  private fire(tower: Tower, target: Bacterium, muzzleX: number, muzzleY: number): boolean {
    const { targeting, projectileSpeed, puddleRadius, puddleSec, slowFactor, slowSec, beamPulses } = tower.cfg;
    if (targeting === 'puddle') {
      const spot = this.puddleSpot(tower, target);
      const taken = (x: number, y: number): boolean => Math.hypot(x - spot.x, y - spot.y) < puddleRadius * 0.8;
      if (this.puddles.some((puddle) => taken(puddle.x, puddle.y)) || this.groundShots.some((shot) => taken(shot.tx, shot.ty))) return false;
      const puddle = { radius: puddleRadius, seconds: puddleSec, slowFactor, slowSec };
      this.groundShots.push(new GroundShot(this, this.projectileLayer, muzzleX, muzzleY, spot.x, spot.y, projectileSpeed, puddle));
    } else if (targeting === 'beam') {
      this.bursts.push({ tower, left: beamPulses, timer: 0 });
    } else {
      this.projectiles.push(new Projectile(this, this.projectileLayer, muzzleX, muzzleY, target, tower.id, projectileSpeed));
    }
    this.shots++;
    sfx.shoot(tower.id);
    return true;
  }

  /** Куда класть лужу: на дорожке впереди бактерии на puddleLeadPx, но так, чтобы место было в радиусе башни (если дальше — ближе к бактерии). */
  private puddleSpot(tower: Tower, target: Bacterium): { x: number; y: number } {
    const { range, puddleLeadPx, puddleRadius } = tower.cfg;
    for (let d = puddleLeadPx; d > 0; d -= 20) {
      const p = target.pointAhead(d);
      if (Math.hypot(p.x - tower.x, p.y - tower.y) <= range + puddleRadius * 0.5) return p;
    }
    return { x: target.x, y: target.y };
  }

  private updateProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const result = projectile.update(dt);
      if (result === 'flying') return true;
      const cfg = CONFIG.towers[projectile.towerId];
      if (cfg.targeting === 'area') this.explode(projectile.x, projectile.y, cfg);
      else if (result === 'hit') this.damageBacterium(projectile.target, cfg);
      projectile.destroy();
      return false;
    });
  }

  /** Капли сиропа летят в точку дорожки; долетев, оставляют лужу. */
  private updateGroundShots(dt: number): void {
    this.groundShots = this.groundShots.filter((shot) => {
      if (!shot.update(dt)) return true;
      const { radius, seconds, slowFactor, slowSec } = shot.puddle;
      this.puddles.push(new Puddle(this, this.puddleLayer, shot.tx, shot.ty, radius, seconds, slowFactor, slowSec));
      this.effects.splat(shot.tx, shot.ty, radius);
      sfx.splash();
      shot.destroy();
      return false;
    });
  }

  /** Лужи: каждая бактерия в луже замедляется (и ещё немного после выхода); когда время лужи вышло, она исчезает. */
  private updatePuddles(dt: number): void {
    if (this.puddles.length === 0) return;
    for (const bacterium of this.bacteria) {
      for (const puddle of this.puddles) {
        if (!puddle.covers(bacterium) || CONFIG.types[bacterium.kind].slowImmune > 0) continue;
        if (!bacterium.slowed) this.slows++;
        bacterium.slow(puddle.slowFactor, puddle.slowSec);
      }
    }
    this.puddles = this.puddles.filter((puddle) => {
      if (puddle.update(dt)) return true;
      puddle.destroy();
      return false;
    });
  }

  /** Лекарь: пока жив, лечит всех остальных бактерий в радиусе healRadius на healPerSec HP в секунду. */
  private applyHealing(dt: number): void {
    for (const healer of this.bacteria) {
      const { healRadius, healPerSec } = CONFIG.types[healer.kind];
      if (healRadius <= 0 || healer.hp <= 0) continue;
      for (const bacterium of this.bacteria) {
        if (bacterium === healer) continue;
        if (Math.hypot(bacterium.x - healer.x, bacterium.y - healer.y) > healRadius) continue;
        bacterium.heal(healPerSec * dt);
      }
    }
  }

  /** Командир: все остальные бактерии в его кольце идут быстрее (берётся сильнейшее из ускорений); выставляется заново каждый кадр. */
  private applyHaste(): void {
    for (const bacterium of this.bacteria) bacterium.haste = 1;
    for (const commander of this.bacteria) {
      const { hasteRadius, hasteFactor } = CONFIG.types[commander.kind];
      if (hasteRadius <= 0 || commander.hp <= 0) continue;
      for (const bacterium of this.bacteria) {
        if (bacterium === commander) continue;
        if (Math.hypot(bacterium.x - commander.x, bacterium.y - commander.y) > hasteRadius) continue;
        bacterium.haste = Math.max(bacterium.haste, hasteFactor);
      }
    }
  }

  /** Матка: раз в brewEverySec секунд рожает brewCount бактерий роя на своём месте (чуть друг за другом). Рождённые в «вышло за волну» не считаются. */
  private updateBrood(dt: number): void {
    for (const mother of [...this.bacteria]) {
      const { brewEverySec, brewCount } = CONFIG.types[mother.kind];
      if (brewEverySec <= 0 || mother.hp <= 0) continue;
      mother.brewClock += dt;
      if (mother.brewClock < brewEverySec) continue;
      mother.brewClock -= brewEverySec;
      for (let i = 0; i < brewCount; i++) {
        const child = new Bacterium(this, this.bacteriaLayer, BREWS_INTO, mother.edge, mother.s);
        child.moveForward(i * CONFIG.types[BREWS_INTO].radius * 2);
        this.bacteria.push(child);
      }
      this.effects.flash(mother.x, mother.y, mother.radius * 0.8, COLORS.egg);
    }
  }

  /** Очереди луча: каждые beamGapMs — удар по всем, кто сейчас на линии башни; заглушенная спорой башня очередь бросает. */
  private updateBursts(dt: number): void {
    this.bursts = this.bursts.filter((burst) => {
      if (burst.tower.isDisabled) return false;
      burst.timer -= dt;
      while (burst.timer <= 0 && burst.left > 0) {
        this.beamPulse(burst.tower);
        burst.left--;
        burst.timer += burst.tower.cfg.beamGapMs / 1000;
      }
      return burst.left > 0;
    });
  }

  /** Один удар луча: линия вспыхивает, каждая бактерия на ней получает урон башни. */
  private beamPulse(tower: Tower): void {
    const angle = tower.aimRad;
    const start = BEAM_START_PX;
    const reach = beamReach(tower.x, tower.y, angle, tower.cfg.beamLengthPx);
    this.effects.beam(tower.x + Math.cos(angle) * start, tower.y + Math.sin(angle) * start, angle, Math.max(0, reach - start));
    sfx.zap();
    for (const bacterium of tower.beamHits(this.bacteria)) this.damageBacterium(bacterium, tower.cfg, true);
  }

  /** Попадание: урон (у бронированных броня вычитается). Если бактерия погибла — монеты, частицы, распад делящейся. */
  private damageBacterium(bacterium: Bacterium, cfg: TowerCfg, quiet = false): void {
    if (bacterium.hp <= 0) return;
    if (bacterium.hit(cfg.damage)) {
      this.killBacterium(bacterium);
      return;
    }
    this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.6, cfg.targeting === 'beam' ? COLORS.needle : COLORS.hit);
    if (!quiet) sfx.hit(bacterium.kind);
  }

  /** Взрыв «Шипучки»: урон всем бактериям, которых касается круг взрыва (в том числе когда цель уже погибла от другого выстрела). */
  private explode(x: number, y: number, cfg: TowerCfg): void {
    this.effects.blast(x, y, cfg.blastRadius);
    sfx.blast();
    for (const bacterium of [...this.bacteria]) {
      if (bacterium.hp <= 0) continue;
      if (Math.hypot(bacterium.x - x, bacterium.y - y) - bacterium.radius > cfg.blastRadius) continue;
      this.damageBacterium(bacterium, cfg, true);
    }
  }

  private killBacterium(bacterium: Bacterium): void {
    this.kills++;
    this.coins += bacterium.reward;
    this.effects.burst(bacterium.x, bacterium.y, bacterium.kind);
    this.effects.popup(bacterium.x, bacterium.y, t('coinsPopup', { n: bacterium.reward }));
    sfx.destroy();
    this.removeBacterium(bacterium);
    this.splitIntoChildren(bacterium);
    this.panel.setCoins(this.coins);
  }

  /** Делящаяся при гибели распадается: первый кокк появляется на её месте, каждый следующий — на splitGapPx дальше вперёд по
   *  дорожке (если место у конца ребра, кокк переходит на следующее ребро, на развилке выбирая путь случайно). */
  private splitIntoChildren(parent: Bacterium): void {
    const { splitCount, splitGapPx } = CONFIG.types[parent.kind];
    if (splitCount <= 0) return;
    this.splits++;
    sfx.split();
    for (let i = 0; i < splitCount; i++) {
      const child = new Bacterium(this, this.bacteriaLayer, SPLITS_INTO, parent.edge, parent.s);
      child.moveForward(i * splitGapPx);
      this.bacteria.push(child);
    }
  }

  /** Спора, проходя близко к башне, «глушит» её на несколько секунд; каждую башню одна спора глушит один раз. */
  private applySpores(): void {
    for (const bacterium of this.bacteria) {
      const { disableSec, disableRadius } = CONFIG.types[bacterium.kind];
      if (disableSec <= 0) continue;
      for (const tower of this.towers) {
        if (tower.isDisabled || bacterium.disabledTowers.has(tower)) continue;
        if (Math.hypot(tower.x - bacterium.x, tower.y - bacterium.y) > disableRadius) continue;
        bacterium.disabledTowers.add(tower);
        tower.disable(disableSec);
        this.disables++;
        this.effects.zap(tower.x, tower.y);
        sfx.disabled();
      }
    }
  }

  private removeBacterium(bacterium: Bacterium): void {
    this.bacteria = this.bacteria.filter((b) => b !== bacterium);
    // Убрана с карты (убита или дошла до организма): снаряды в полёте больше не должны считать её живой целью
    bacterium.hp = 0;
    bacterium.destroy();
  }

  /** Бактерии, дошедшие до красной линии организма, исчезают и отнимают жизни. Дробный урон (рой) копится: целая жизнь списывается, когда набралась. */
  private resolveArrivals(): void {
    let damage = 0;
    let lastY = 0;
    for (const bacterium of [...this.bacteria]) {
      if (!bacterium.reachedOrganism) continue;
      damage += bacterium.lifeDamage;
      lastY = bacterium.y;
      this.leaked++;
      this.removeBacterium(bacterium);
    }
    if (damage === 0) return;
    this.lifePool += damage;
    const whole = Math.floor(this.lifePool + 1e-9);
    this.lifePool -= whole;
    if (whole <= 0) {
      // Жизнь ещё не потеряна, но ощутимо: красная вспышка у линии организма
      this.effects.flash(CONFIG.map.orgW, lastY, 36, COLORS.loseLine);
      return;
    }
    this.lives = Math.max(0, this.lives - whole);
    this.panel.setLives(this.lives);
    this.effects.lifeLost();
    sfx.lifeLost();
    if (this.lives <= 0) this.endGame(false);
  }

  // ---------------------------------------------------------------- ввод

  /** Кнопка башни на панели: выбрать эту башню, а если она уже выбрана — снять выбор. */
  private toggleTower(id: TowerId): void {
    // Вертикальный телефон: поверх игры подсказка «Поверните телефон», касания сквозь неё ничего не делают
    if (this.state !== 'playing' || isPortraitPhone()) return;
    this.selected = this.selected === id ? null : id;
    this.panel.setSelected(this.selected);
    if (this.selected) this.setGhostArt(this.selected);
    else this.ghost.setVisible(false);
    this.updateHint();
  }

  /** Нижняя подсказка: у новых башен — как они бьют; у таблетки и до первой башни — «выберите башню и тапните по клетке». */
  private updateHint(): void {
    const info = this.selected ? this.towerInfo(this.selected) : null;
    this.panel.setHint(info ?? (this.placedAny ? null : t('hintPlace')));
  }

  private towerInfo(id: TowerId): string | null {
    const cfg = CONFIG.towers[id];
    if (id === 'syrup') return t('infoSyrup', { pct: Math.round((1 - cfg.slowFactor) * 100) });
    if (id === 'fizz') return t('infoFizz');
    if (id === 'syringe') return t('infoSyringe');
    return null;
  }

  /** Башня, стоящая в клетке (или null). */
  private towerAt(col: number, row: number): Tower | null {
    return this.towers.find((tower) => tower.col === col && tower.row === row) ?? null;
  }

  /** Тап по карте: по башне с лучом — поворачиваем её на 45° (по правой половине — по часовой, по левой — против); иначе, если выбрана башня, ставим её в клетку под пальцем. */
  private onTap(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = worldToCell(world.x, world.y);
    const own = cell ? this.towerAt(cell[0], cell[1]) : null;
    if (own?.isBeam) {
      // правая половина башни — повернуть на 45° по часовой стрелке, левая — против
      own.rotateAim(world.x < own.x ? -1 : 1);
      sfx.rotate();
      return;
    }
    if (!this.selected) return;
    if (!cell) {
      this.deny(t('hintCantBuild'));
      return;
    }
    this.tryPlace(this.selected, cell[0], cell[1]);
  }

  private tryPlace(id: TowerId, col: number, row: number): void {
    const cfg = CONFIG.towers[id];
    const key = cellKey(col, row);
    if (PATH_TILES.has(key) || BLOCKED_TILES.has(key) || this.occupied.has(key)) {
      this.deny(t('hintCantBuild'));
      return;
    }
    if (this.coins < cfg.price) {
      this.panel.flashCoins();
      this.deny(t('hintNoCoins'));
      return;
    }
    const center = tileCenter(col, row);
    this.coins -= cfg.price;
    this.occupied.add(key);
    this.towers.push(new Tower(this, this.towerLayer, id, col, row, center.x, center.y));
    this.effects.placed(center.x, center.y);
    sfx.place();
    this.panel.setCoins(this.coins);
    this.placedAny = true;
    this.updateHint();
    this.ghost.setVisible(false);
    if (cfg.targeting === 'beam' && !this.rotateHinted) {
      this.rotateHinted = true;
      this.panel.toast(t('hintRotate'), 3200);
    }
  }

  private deny(message: string): void {
    sfx.denied();
    this.panel.toast(message);
  }

  /** Мышь над картой: показываем «призрак» выбранной башни и её радиус. */
  private onHover(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = this.selected ? worldToCell(world.x, world.y) : null;
    if (!this.selected || !cell || PATH_TILES.has(cellKey(cell[0], cell[1])) || BLOCKED_TILES.has(cellKey(cell[0], cell[1])) || this.occupied.has(cellKey(cell[0], cell[1]))) {
      this.ghost.setVisible(false);
      return;
    }
    const center = tileCenter(cell[0], cell[1]);
    const half = (CONFIG.map.tile - 6) / 2;
    this.ghost.setPosition(center.x, center.y).setVisible(true);
    this.ghostRange.clear();
    this.ghostAim.clear();
    const cfg = CONFIG.towers[this.selected];
    if (cfg.targeting === 'beam') {
      // Луч: вместо круга радиуса — пунктир по лучшему направлению (так башня встанет, если не поворачивать)
      const angle = aimAngle(defaultAim(cfg, center.x, center.y));
      drawAimLine(this.ghostAim, beamReach(center.x, center.y, angle, cfg.beamLengthPx), 0.8);
      this.ghostAim.setRotation(angle);
      this.ghostBarrel.setRotation(angle);
    } else {
      this.ghostRange.fillStyle(COLORS.ghost, 0.1).fillCircle(0, 0, cfg.range);
      this.ghostRange.lineStyle(2.5, COLORS.ghostEdge, 1).strokeCircle(0, 0, cfg.range);
    }
    this.ghostCell.clear();
    this.ghostCell.fillStyle(COLORS.ghost, 0.25).fillRoundedRect(-half, -half, half * 2, half * 2, 10);
    this.ghostCell.lineStyle(3, COLORS.ghostEdge, 1).strokeRoundedRect(-half, -half, half * 2, half * 2, 10);
  }

  private buildGhost(): void {
    this.ghostRange = this.add.graphics();
    this.ghostAim = this.add.graphics();
    this.ghostCell = this.add.graphics();
    this.ghostArt = this.add.container(0, 0).setAlpha(0.65);
    this.ghostBarrel = createTowerArt(this, this.ghostArt);
    this.ghost = this.add.container(0, 0, [this.ghostRange, this.ghostAim, this.ghostCell, this.ghostArt]).setVisible(false);
    this.ghostLayer.add(this.ghost);
  }

  /** «Призрак» рисуется как выбранная башня. */
  private setGhostArt(id: TowerId): void {
    this.ghostArt.removeAll(true);
    this.ghostBarrel = createTowerArt(this, this.ghostArt, id);
  }

  /** Скорость игры из прошлой партии (браузер запоминает выбор игрока); без хранилища — обычная. */
  private loadSpeed(): number {
    try {
      const saved = Number(window.localStorage.getItem('pvb.speed'));
      if (CONFIG.ui.speeds.includes(saved)) return saved;
    } catch {
      /* хранилище недоступно (приватное окно и т. п.) — играем на обычной скорости */
    }
    return CONFIG.ui.speeds[0];
  }

  /** Кнопка скорости: ×1 → ×2 → ×3 → ×1 …; выбор запоминается. */
  private cycleSpeed(): void {
    if (this.state !== 'playing' || isPortraitPhone()) return;
    const speeds = CONFIG.ui.speeds;
    this.userSpeed = speeds[(Math.max(0, speeds.indexOf(this.userSpeed)) + 1) % speeds.length];
    this.panel.setSpeed(this.userSpeed);
    try {
      window.localStorage.setItem('pvb.speed', String(this.userSpeed));
    } catch {
      /* не страшно: просто не запомнится */
    }
  }

  /** Кнопка «Начать волну»: пропускает ожидание до волны, за каждую пропущенную секунду — монеты. */
  private startWaveNow(): void {
    if (this.state !== 'playing' || isPortraitPhone()) return;
    if (this.phase !== 'countdown' && this.phase !== 'pause') return;
    this.coins += this.skipBonus();
    this.panel.setCoins(this.coins);
    this.phaseTimer = 0;
  }

  /** Сколько монет даст досрочный вызов волны прямо сейчас. */
  private skipBonus(): number {
    return Math.max(0, Math.floor(this.phaseTimer * CONFIG.waves.skipBonusPerSec));
  }

  /** Любое касание экрана: на паузе — продолжить, после конца уровня — начать заново. */
  private onScreenTap(): void {
    if (isPortraitPhone()) return;
    const now = performance.now();
    if (this.state === 'paused' && now >= this.resumeAllowedAt) this.togglePause();
    else if ((this.state === 'won' || this.state === 'lost') && now >= this.restartAllowedAt) this.scene.restart();
  }

  private togglePause(): void {
    if (isPortraitPhone()) return;
    if (this.state === 'playing') {
      this.state = 'paused';
      this.resumeAllowedAt = performance.now() + 250;
      this.ghost.setVisible(false);
      this.showOverlay(t('paused'), TEXT_COLORS.accent, t('tapToResume'));
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.overlay?.destroy();
      this.overlay = null;
    }
  }

  // ---------------------------------------------------------------- конец уровня

  private endGame(won: boolean): void {
    this.state = won ? 'won' : 'lost';
    this.restartAllowedAt = performance.now() + CONFIG.gameOver.restartLockMs;
    this.ghost.setVisible(false);
    // Снаряды в полёте не должны «зависать» под экраном конца уровня
    for (const projectile of this.projectiles) projectile.destroy();
    this.projectiles = [];
    for (const shot of this.groundShots) shot.destroy();
    this.groundShots = [];
    this.bursts = [];
    if (won) sfx.win();
    else sfx.lose();
    this.showOverlay(won ? t('victory') : t('gameOver'), TEXT_COLORS.accent, t('killed', { n: this.kills }), t('tapToRestart'));
  }

  private showOverlay(title: string, titleColor: string, line2: string, line3?: string): void {
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78),
      this.add.text(W / 2, H / 2 - 90, title, this.textStyle(76, titleColor)).setOrigin(0.5),
      this.add.text(W / 2, H / 2 + 10, line2, this.textStyle(40)).setOrigin(0.5),
    ];
    if (line3) items.push(this.add.text(W / 2, H / 2 + 100, line3, this.textStyle(32)).setOrigin(0.5));
    this.overlay = this.add.container(0, 0, items).setDepth(200);
  }

  private textStyle(size: number, color: string = TEXT_COLORS.main): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: TEXT_COLORS.stroke,
      strokeThickness: Math.max(4, Math.round(size / 9)),
      resolution: 2,
    };
  }

  // ---------------------------------------------------------------- интерфейс

  /** Волна и прогресс на панели (обновляется, только когда что-то изменилось). */
  private refreshPanel(): void {
    const next = this.phase === 'countdown' || this.phase === 'pause' ? Math.max(0, this.phaseTimer) : null;
    const progress = this.plannedTotal > 0 ? this.spawned / this.plannedTotal : 0;
    const key = `${Math.max(1, this.waveIdx)}|${next === null ? '-' : Math.ceil(next)}|${Math.round(progress * 200)}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.setWave(Math.max(1, this.waveIdx), this.waveTotal(), progress, next);
    this.panel.setWaveButton(next !== null, next === null ? 0 : this.skipBonus());
  }

  /** Подсказка «◀ Организм»: показываем, когда организм за краем экрана; мигает, если бактерия близко к нему. */
  private updateChip(timeSec: number): void {
    const leftEdge = this.rig.cx - VIEW_W / 2 / this.rig.zoom;
    const visible = leftEdge > CONFIG.map.orgW;
    const danger = visible && this.bacteria.some((b) => b.x - CONFIG.map.orgW < CONFIG.ui.dangerDistancePx);
    this.panel.setChip(visible, danger, timeSec);
  }

  // ---------------------------------------------------------------- проверка

  private gameToClient(gx: number, gy: number): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: rect.left + (gx / W) * rect.width, y: rect.top + (gy / H) * rect.height };
  }

  private snapshot(): DebugSnapshot {
    return {
      state: this.state,
      coins: this.coins,
      lives: this.lives,
      maxLives: CONFIG.lives.start,
      wave: this.waveIdx,
      waveTotal: this.waveTotal(),
      spawned: this.spawned,
      kills: this.kills,
      leaked: this.leaked,
      introduced: [...this.introduced],
      splits: this.splits,
      disables: this.disables,
      slows: this.slows,
      shots: this.shots,
      speed: this.userSpeed,
      elapsed: this.elapsed,
      lang: document.documentElement.lang,
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
      width: W,
      height: H,
      viewW: VIEW_W,
      map: {
        cols: LEVEL.cols,
        rows: LEVEL.rows,
        tile: CONFIG.map.tile,
        orgW: CONFIG.map.orgW,
        worldW: WORLD.w,
        worldH: WORLD.h,
      },
      camera: { zoom: this.rig.zoom, cx: this.rig.cx, cy: this.rig.cy, zoomMin: CONFIG.camera.zoomMin, zoomMax: CONFIG.camera.zoomMax },
      selected: this.selected,
      towers: this.towers.map((tw) => ({ id: tw.id, col: tw.col, row: tw.row, x: tw.x, y: tw.y, disabled: tw.isDisabled, remaining: tw.remaining, aim: tw.aim })),
      puddles: this.puddles.map((p) => ({ x: p.x, y: p.y, r: p.radius, left: p.left })),
      lifePool: this.lifePool,
      bacteria: this.bacteria.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        r: b.radius,
        kind: b.kind,
        hp: b.hp,
        maxHp: b.maxHp,
        edge: b.edge.id,
        s: b.s,
        dashing: b.dashing,
        slowed: b.slowed,
        remaining: b.remaining,
      })),
      projectiles: this.projectiles.length + this.groundShots.length + this.bursts.length,
      ui: this.panel.geometry(),
      pointerListeners: this.input.listenerCount('pointerdown'),
      effects: {
        flashes: this.effects.flashes,
        bursts: this.effects.bursts,
        popups: this.effects.popups,
        placements: this.effects.placements,
        lifeLosses: this.effects.lifeLosses,
        zaps: this.effects.zaps,
        blasts: this.effects.blasts,
        beams: this.effects.beams,
        splats: this.effects.splats,
      },
      sound: { state: sfx.state, played: sfx.played },
    };
  }
}
