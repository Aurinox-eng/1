import Phaser from 'phaser';
import { CameraRig } from '../cameraRig';
import { CONFIG } from '../config';
import { exposeDebug, NO_PLAQUES, QA_MODE, STRESS, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { num, t, type TextKey } from '../i18n';
import { aimAngle, BLOCKED_TILES, EDGES, ENTRANCE_EDGES, LEVEL, PATH_TILES, WORLD, cellKey, worldToCell } from '../level';
import { isPortraitPhone } from '../orientation';
import { CURRENT_LEVEL, isTowerOpen, newTowersOfLevel, unlockLevel } from '../progress';
import { addMap } from '../mapArt';
import { MapGestures } from '../mapGestures';
import { Bacterium, type BacteriumKind } from '../objects/Bacterium';
import { GroundShot } from '../objects/GroundShot';
import { Projectile } from '../objects/Projectile';
import { Puddle } from '../objects/Puddle';
import { beamReach, createTowerArt, defaultAim, drawAimLine, Tower, type TowerId } from '../objects/Tower';
import { pointAt, tileCenter, type Edge } from '../pathing';
import { sfx } from '../sound';
import { MAX_TOWER_LEVEL, mutationOptions, type TowerStats } from '../towerStats';
import { COLORS, FONT, TEXT_COLORS } from '../theme';
import { FPS_ENABLED, FpsMeter, frameReport, installFrameStats } from '../perf';
import { Panel, VIEW_W } from '../ui/Panel';
import { Plaque, type PlaqueModel } from '../ui/Plaque';

const { width: W, height: H } = CONFIG.screen;
/** Самое сильное отдаление камеры: карта помещается целиком и по ширине, и по высоте (≈ 0,499). */
const ZOOM_MIN = Math.min(VIEW_W / WORLD.w, H / WORLD.h);
/** Тап по плашке не закрывает её раньше, чем через столько миллисекунд после показа (реальные часы): чтобы не закрыть случайным тапом. */
const PLAQUE_LOCK_MS = 400;
/** Что игрок уже видел на плашках с момента загрузки страницы («б:тип» — бактерия, «т:башня» — башня): повторные партии подряд их не повторяют. */
const seenPlaques = new Set<string>();
/** Защита от «прыжков» после сворачивания вкладки: один кадр не длиннее 50 мс. */
const MAX_FRAME_MS = 50;
/** Если кадр очень длинный, за него выйдет не больше стольких бактерий (защита от лавины). */
const MAX_SPAWNS_PER_FRAME = 10;
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
/** Цепной взрыв: пауза до второго взрыва, секунд; радиус поиска бактерии для него, пикселей. */
const CHAIN_DELAY_SEC = 0.3;
const CHAIN_REACH_PX = 160;
/** Откуда на экране начинается вспышка луча «Шприца» (от центра башни), пикселей: чуть дальше кончика ствола. */
const BEAM_START_PX = 50;
/** Во что распадается делящаяся (правило игры, не число баланса). */
const SPLITS_INTO: BacteriumKind = 'coccus';
/** Кого рожает матка (правило игры; сколько и как часто — в таблице типов). */
const BREWS_INTO: BacteriumKind = 'swarm';
/** Стресс-сценарий (`?qa&stress`): сколько башен, сколько бактерий держится на карте, скорость игры, во сколько раз прочнее бактерии (чтобы жили дольше). */
const STRESS_TOWERS = 40;
const STRESS_BACTERIA = 200;
const STRESS_SPEED = 3;
const STRESS_HP_MUL = 3;
/** Сколько бактерий стресс-сценарий добавляет за кадр взамен погибших. */
const STRESS_REFILL_PER_FRAME = 20;
/** Новые бактерии стресс-сценария появляются не ближе стольких клеток к организму. */
const STRESS_ORGANISM_GAP_TILES = 3;

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
  /** Номер удара в очереди (с нуля): «Спираль» усиливает каждый следующий. */
  index: number;
}
/** Второй взрыв «Цепной» Шипучки: через сколько секунд, где и с какими числами. */
interface ChainBlast {
  left: number;
  x: number;
  y: number;
  stats: TowerStats;
}

type State = 'playing' | 'paused' | 'info' | 'won' | 'lost';
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
  /** Накопленная дробная часть наград (`economy.rewardMul`): целые монеты зачисляются, остаток ждёт следующих бактерий. */
  private rewardPool = 0;

  private bacteria: Bacterium[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  /** Капли сиропа в полёте к дорожке, лужи на дорожках и очереди луча «Шприца». */
  private groundShots: GroundShot[] = [];
  private puddles: Puddle[] = [];
  private bursts: BeamBurst[] = [];
  private chains: ChainBlast[] = [];
  /** Занятые клетки (ключ «колонка,ряд»). */
  private occupied = new Set<string>();
  /** Какая башня выбрана на панели (тап по клетке поставит её). */
  private selected: TowerId | null = null;
  /** Поставленная башня, выбранная на карте (её карточка — в правой панели), и идёт ли выбор пары для слияния. */
  private selectedTower: Tower | null = null;
  private mergeMode = false;
  private merges = 0;
  private sells = 0;
  private mutationsPicked = 0;
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
  /** Плашки, ждущие показа (по одной за тап), и когда можно закрыть текущую (реальные часы, мс). */
  private infoQueue: PlaqueModel[] = [];
  private infoClosableAt = 0;
  private plaque!: Plaque;
  /** Кнопка «Заново» на экране конца уровня (центр и размер на экране игры), пока экран не показан — null. */
  private endButton: { x: number; y: number; w: number; h: number } | null = null;
  private waveInterval = 1;
  private spawnTimer = 0;
  private plannedTotal = 0;
  private panelKey = '';

  /** Тап по экрану паузы не закрывает её раньше этого момента (реальные часы, мс) — иначе тап по кнопке «пауза» сразу её снимет. */
  private resumeAllowedAt = 0;
  /** Кнопка «Заново» не срабатывает раньше этого момента (реальные часы, мс) — чтобы не нажать случайно, продолжая быстро тапать. */
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
    this.rewardPool = 0;
    this.infoQueue = [];
    this.infoClosableAt = 0;
    this.endButton = null;
    this.bacteria = [];
    this.towers = [];
    this.projectiles = [];
    this.groundShots = [];
    this.puddles = [];
    this.bursts = [];
    this.chains = [];
    this.occupied = new Set();
    this.selected = null;
    this.selectedTower = null;
    this.mergeMode = false;
    this.merges = 0;
    this.sells = 0;
    this.mutationsPicked = 0;
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

    this.rig = new CameraRig(this.world, { w: VIEW_W, h: H }, WORLD, { min: ZOOM_MIN, max: CONFIG.camera.zoomMax });
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
      onMerge: () => this.toggleMerge(),
      onSell: () => this.sellSelected(),
      onPick: (index) => this.pickMutation(index),
      onRotate: (dir) => this.rotateSelected(dir),
      onCardClose: () => this.deselectTower(),
    });
    this.panel.init();
    this.plaque = new Plaque(this);
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
    if (STRESS) this.setupStress();
    else this.announceStart();
    if (FPS_ENABLED || QA_MODE) installFrameStats(this.game);
    if (FPS_ENABLED) new FpsMeter(this);

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
      showPlaque: (kind, id) => {
        this.infoQueue.push(kind === 'tower' ? this.towerPlaque(id as TowerId) : this.bacteriumPlaque(id as BacteriumKind));
        if (this.state === 'playing') {
          this.state = 'info';
          this.ghost.setVisible(false);
          this.showInfo();
        }
      },
      getPerf: (reset) => {
        let objects = 0;
        const count = (list: Phaser.GameObjects.GameObject[]): void => {
          for (const obj of list) {
            if ((obj as unknown as { visible?: boolean }).visible === false) continue;
            objects++;
            if (obj instanceof Phaser.GameObjects.Container) count(obj.list);
          }
        };
        count(this.children.list);
        return {
          ...frameReport(reset),
          objects,
          bacteria: this.bacteria.length,
          towers: this.towers.length,
          renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
        };
      },
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
    if (this.state !== 'playing') return;

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
    this.updateChains(dt);
    this.resolveArrivals();
    if (this.state !== 'playing') return;

    if (this.phase === 'done' && this.bacteria.length === 0) this.endGame(true);
    this.refreshPanel();
  }

  // ---------------------------------------------------------------- волны

  private updateWaves(dt: number): void {
    if (STRESS) {
      this.refillStress(STRESS_REFILL_PER_FRAME);
      return;
    }
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
        this.announceWave(this.waveIdx);
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

  /** Множитель наград текущей волны по кривой `economy.rewardCurve` (точки [волна, множитель], между ними — по прямой). */
  private rewardFactor(): number {
    const pts = CONFIG.economy.rewardCurve;
    const w = Math.max(1, this.waveIdx);
    if (w <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [wb, fb] = pts[i];
      if (w <= wb) {
        const [wa, fa] = pts[i - 1];
        return fa + ((fb - fa) * (w - wa)) / (wb - wa);
      }
    }
    return pts[pts.length - 1][1];
  }

  /** Во сколько раз прочнее бактерии текущей волны (рост `waves.hpGrowthPerWave` после волны `hpGrowthFromWave`); 1 — как в таблице типов. */
  private waveHpMul(): number {
    const { hpGrowthPerWave, hpGrowthFromWave } = CONFIG.waves;
    return 1 + hpGrowthPerWave * Math.max(0, this.waveIdx - hpGrowthFromWave);
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
    this.bacteria.push(new Bacterium(this, this.bacteriaLayer, kind, edge, 0, this.waveHpMul()));
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
   * Выстрел башни; возвращает, состоялся ли он. «По радиусу» и «по площади» — снаряд летит за целью; «лужа» — капля (или две, мутация «Две капли»)
   * летит в точку дорожки впереди бактерии (если там уже есть лужа — выстрела нет); «луч» — запускается очередь ударов по линии.
   * Числа берутся из `tower.stats` (уровень и мутации уже учтены).
   */
  private fire(tower: Tower, target: Bacterium, muzzleX: number, muzzleY: number): boolean {
    const st = tower.stats;
    if (st.targeting === 'puddle') {
      const puddle = { radius: st.puddleRadius, seconds: st.puddleSec, slowFactor: st.slowFactor, slowSec: st.slowSec, poison: st.poisonPerSec };
      let launched = 0;
      for (let k = 0; k < st.puddleCount; k++) {
        const spot = this.puddleSpot(tower, target, st.puddleLeadPx + k * st.puddleRadius * 1.6);
        const taken = (x: number, y: number): boolean => Math.hypot(x - spot.x, y - spot.y) < st.puddleRadius * 0.8;
        if (this.puddles.some((p) => taken(p.x, p.y)) || this.groundShots.some((shot) => taken(shot.tx, shot.ty))) continue;
        this.groundShots.push(new GroundShot(this, this.projectileLayer, muzzleX, muzzleY, spot.x, spot.y, st.projectileSpeed, puddle));
        launched++;
      }
      if (launched === 0) return false;
    } else if (st.targeting === 'beam') {
      this.bursts.push({ tower, left: st.beamPulses, timer: 0, index: 0 });
    } else {
      this.projectiles.push(new Projectile(this, this.projectileLayer, muzzleX, muzzleY, target, tower.id, st.projectileSpeed, st));
    }
    this.shots++;
    sfx.shoot(tower.id);
    return true;
  }

  /** Куда класть лужу: на дорожке впереди бактерии на `lead` пикселей, но так, чтобы место было в радиусе башни (если дальше — ближе к бактерии). */
  private puddleSpot(tower: Tower, target: Bacterium, lead: number): { x: number; y: number } {
    const { range, puddleRadius } = tower.stats;
    for (let d = lead; d > 0; d -= 20) {
      const p = target.pointAhead(d);
      if (Math.hypot(p.x - tower.x, p.y - tower.y) <= range + puddleRadius * 0.5) return p;
    }
    return { x: target.x, y: target.y };
  }

  private updateProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const result = projectile.update(dt);
      if (result === 'flying') return true;
      if (projectile.stats.targeting === 'area') this.explode(projectile.x, projectile.y, projectile.stats);
      else if (result === 'hit') this.damageBacterium(projectile.target, projectile.stats);
      projectile.destroy();
      return false;
    });
  }

  /** Капли сиропа летят в точку дорожки; долетев, оставляют лужу. */
  private updateGroundShots(dt: number): void {
    this.groundShots = this.groundShots.filter((shot) => {
      if (!shot.update(dt)) return true;
      const { radius, seconds, slowFactor, slowSec, poison } = shot.puddle;
      this.puddles.push(new Puddle(this, this.puddleLayer, shot.tx, shot.ty, radius, seconds, slowFactor, slowSec, poison));
      this.effects.splat(shot.tx, shot.ty, radius);
      sfx.splash();
      shot.destroy();
      return false;
    });
  }

  /** Лужи: каждая бактерия в луже замедляется (и ещё немного после выхода), в «едкой» луже ещё и теряет HP; когда время лужи вышло, она исчезает. */
  private updatePuddles(dt: number): void {
    if (this.puddles.length === 0) return;
    for (const bacterium of [...this.bacteria]) {
      for (const puddle of this.puddles) {
        if (bacterium.hp <= 0 || !puddle.covers(bacterium)) continue;
        if (puddle.poison > 0 && bacterium.drain(puddle.poison * dt)) {
          this.killBacterium(bacterium);
          break;
        }
        if (CONFIG.types[bacterium.kind].slowImmune > 0) continue;
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
        const child = new Bacterium(this, this.bacteriaLayer, BREWS_INTO, mother.edge, mother.s, this.waveHpMul());
        child.moveForward(i * CONFIG.types[BREWS_INTO].radius * 2);
        this.bacteria.push(child);
      }
      this.effects.flash(mother.x, mother.y, mother.radius * 0.8, COLORS.egg);
    }
  }

  /** Очереди луча: каждые beamGapMs — удар по всем, кто сейчас на линии башни; заглушенная спорой (или проданная) башня очередь бросает. */
  private updateBursts(dt: number): void {
    this.bursts = this.bursts.filter((burst) => {
      if (burst.tower.isDisabled || !this.towers.includes(burst.tower)) return false;
      burst.timer -= dt;
      while (burst.timer <= 0 && burst.left > 0) {
        this.beamPulse(burst.tower, burst.index);
        burst.index++;
        burst.left--;
        burst.timer += burst.tower.stats.beamGapMs / 1000;
      }
      return burst.left > 0;
    });
  }

  /** Один удар луча (номер в очереди — index): линия (две, если «Второй луч») вспыхивает, каждая бактерия на ней получает урон башни («Спираль» — сильнее с каждым ударом). */
  private beamPulse(tower: Tower, index: number): void {
    const st = tower.stats;
    for (const dir of tower.beamDirections()) {
      const angle = aimAngle(dir);
      const reach = beamReach(tower.x, tower.y, angle, st.beamLengthPx);
      this.effects.beam(tower.x + Math.cos(angle) * BEAM_START_PX, tower.y + Math.sin(angle) * BEAM_START_PX, angle, Math.max(0, reach - BEAM_START_PX));
    }
    sfx.zap();
    const damage = st.damage + index * st.spiral * CONFIG.towerLevels[Math.min(tower.level, CONFIG.towerLevels.length) - 1].damageMul;
    for (const bacterium of tower.beamHits(this.bacteria)) this.damageBacterium(bacterium, st, true, damage);
  }

  /** Попадание: урон (у бронированных броня вычитается, если мутация не «бронебойная»); «кислота» делает следующие удары сильнее. Если бактерия погибла — монеты, частицы, распад делящейся. */
  private damageBacterium(bacterium: Bacterium, st: TowerStats, quiet = false, damage: number = st.damage): void {
    if (bacterium.hp <= 0) return;
    if (bacterium.hit(damage, st.armorPierce)) {
      this.killBacterium(bacterium);
      return;
    }
    if (st.acidSec > 0) bacterium.expose(st.acidMul, st.acidSec);
    this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.6, st.targeting === 'beam' ? COLORS.needle : COLORS.hit);
    if (!quiet) sfx.hit(bacterium.kind);
  }

  /**
   * Взрыв «Шипучки»: урон всем бактериям, которых касается круг взрыва (в том числе когда цель уже погибла от другого выстрела).
   * Мутация «Цепная»: через 0,3 с второй взрыв (радиус ×0,7, урон ×0,6) на ближайшей бактерии рядом (`allowChain` — только у первого).
   */
  private explode(x: number, y: number, st: TowerStats, radiusMul = 1, damageMul = 1, allowChain = true): void {
    const radius = st.blastRadius * radiusMul;
    this.effects.blast(x, y, radius);
    sfx.blast();
    for (const bacterium of [...this.bacteria]) {
      if (bacterium.hp <= 0) continue;
      if (Math.hypot(bacterium.x - x, bacterium.y - y) - bacterium.radius > radius) continue;
      this.damageBacterium(bacterium, st, true, st.damage * damageMul);
    }
    if (allowChain && st.chain) this.chains.push({ left: CHAIN_DELAY_SEC, x, y, stats: st });
  }

  /** Вторые взрывы «Цепной» Шипучки. */
  private updateChains(dt: number): void {
    this.chains = this.chains.filter((chain) => {
      chain.left -= dt;
      if (chain.left > 0) return true;
      let best: Bacterium | null = null;
      for (const b of this.bacteria) {
        if (b.hp <= 0) continue;
        const d = Math.hypot(b.x - chain.x, b.y - chain.y);
        if (d <= CHAIN_REACH_PX && (!best || d < Math.hypot(best.x - chain.x, best.y - chain.y))) best = b;
      }
      if (best) this.explode(best.x, best.y, chain.stats, 0.7, 0.6, false);
      return false;
    });
  }

  private killBacterium(bacterium: Bacterium): void {
    this.kills++;
    // «Дефляция»: награда умножается на economy.rewardMul и множитель волны из economy.rewardCurve, дробная часть копится до целой монеты
    this.rewardPool += bacterium.reward * CONFIG.economy.rewardMul * this.rewardFactor();
    const gain = Math.floor(this.rewardPool + 1e-9);
    this.rewardPool -= gain;
    this.coins += gain;
    this.effects.burst(bacterium.x, bacterium.y, bacterium.kind);
    if (gain > 0) this.effects.popup(bacterium.x, bacterium.y, t('coinsPopup', { n: gain }));
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
      const child = new Bacterium(this, this.bacteriaLayer, SPLITS_INTO, parent.edge, parent.s, this.waveHpMul());
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
    // Стресс-сценарий: жизни не убывают (вспышка и тряска остаются — это тоже нагрузка)
    if (!STRESS) this.lives = Math.max(0, this.lives - whole);
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
    if (!isTowerOpen(id)) {
      this.deny(t('hintLocked', { n: unlockLevel(id) }));
      return;
    }
    this.deselectTower();
    this.selected = this.selected === id ? null : id;
    this.panel.setSelected(this.selected);
    if (this.selected) this.setGhostArt(this.selected);
    else this.ghost.setVisible(false);
    this.updateHint();
  }

  /** Нижняя подсказка: у новых башен — как они бьют; у таблетки и до первой башни — «выберите башню и тапните по клетке». */
  private updateHint(): void {
    if (this.mergeMode) {
      this.panel.setHint(t('hintMerge'));
      return;
    }
    const info = this.selected ? this.towerInfo(this.selected) : null;
    this.panel.setHint(info ?? (this.placedAny || this.selectedTower ? null : t('hintPlace')));
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

  /**
   * Тап по карте. Идёт выбор пары для слияния: по подсвеченной башне — слить, мимо — отмена. Иначе тап по поставленной башне выбирает её
   * (карточка в панели); по уже выбранной башне с лучом — поворачивает её на 45° (по правой половине — по часовой, по левой — против).
   * Тап по пустой клетке: если выбрана башня на панели — ставим её; если нет — снимаем выбор башни.
   */
  private onTap(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = worldToCell(world.x, world.y);
    const own = cell ? this.towerAt(cell[0], cell[1]) : null;
    if (this.mergeMode && this.selectedTower) {
      if (own && this.mergeCandidates(this.selectedTower).includes(own)) this.doMerge(this.selectedTower, own);
      else this.cancelMerge();
      return;
    }
    if (own) {
      if (own === this.selectedTower && own.isBeam) {
        own.rotateAim(world.x < own.x ? -1 : 1);
        sfx.rotate();
        this.refreshCard();
      } else {
        this.selectTower(own);
      }
      return;
    }
    if (!this.selected) {
      if (this.selectedTower) this.deselectTower();
      return;
    }
    if (!cell) {
      this.deny(t('hintCantBuild'));
      return;
    }
    this.tryPlace(this.selected, cell[0], cell[1]);
  }

  // ---------------------------------------------------------------- выбор башни, слияние, мутации, продажа

  /** Выбрать поставленную башню: золотое кольцо, карточка в панели; выбор башни для постройки на панели снимается. */
  private selectTower(tower: Tower): void {
    if (this.selected) {
      this.selected = null;
      this.panel.setSelected(null);
      this.ghost.setVisible(false);
    }
    if (this.selectedTower && this.selectedTower !== tower) this.selectedTower.setSelected(false);
    this.cancelMerge(false);
    this.selectedTower = tower;
    tower.setSelected(true);
    sfx.select();
    this.refreshCard();
    this.updateHint();
  }

  private deselectTower(): void {
    this.cancelMerge(false);
    this.selectedTower?.setSelected(false);
    this.selectedTower = null;
    this.panel.hideCard();
    this.updateHint();
  }

  /** С какими башнями можно слить эту: другие того же вида и уровня (если уровень не высший). */
  private mergeCandidates(tower: Tower): Tower[] {
    if (tower.level >= MAX_TOWER_LEVEL) return [];
    return this.towers.filter((other) => other !== tower && other.id === tower.id && other.level === tower.level);
  }

  /** Кнопка «Слить» / «Отмена» в карточке. */
  private toggleMerge(): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    if (this.mergeMode) {
      this.cancelMerge();
      return;
    }
    const candidates = this.mergeCandidates(this.selectedTower);
    if (candidates.length === 0) return;
    this.mergeMode = true;
    for (const tower of candidates) tower.setMergeCandidate(true);
    sfx.select();
    this.refreshCard();
    this.updateHint();
  }

  private cancelMerge(update = true): void {
    if (!this.mergeMode) return;
    this.mergeMode = false;
    for (const tower of this.towers) tower.setMergeCandidate(false);
    if (update) {
      this.refreshCard();
      this.updateHint();
    }
  }

  /** Слияние: `target` становится уровнем выше (его направление луча и мутации остаются), `source` исчезает, клетка освобождается. Бесплатно. */
  private doMerge(source: Tower, target: Tower): void {
    this.merges++;
    this.cancelMerge(false);
    this.removeTower(source);
    target.upgrade();
    this.effects.merged(target.x, target.y);
    sfx.merge();
    this.selectedTower = null;
    this.selectTower(target);
    this.panel.toast(t(target.pendingTier !== null ? 'toastPickMutation' : 'toastMerged', { n: target.level }));
  }

  /** Убирает башню с карты (слияние или продажа): клетка свободна, её очередь луча обрывается. */
  private removeTower(tower: Tower): void {
    this.towers = this.towers.filter((other) => other !== tower);
    this.occupied.delete(cellKey(tower.col, tower.row));
    this.bursts = this.bursts.filter((burst) => burst.tower !== tower);
    if (this.selectedTower === tower) {
      this.selectedTower = null;
      this.panel.hideCard();
    }
    tower.destroy();
  }

  /** Сколько монет вернёт продажа: доля цены × число обычных башен, «вложенных» в эту (2^(уровень−1)). */
  private sellValue(tower: Tower): number {
    return Math.round(tower.cfg.price * 2 ** (tower.level - 1) * CONFIG.economy.sellRefund);
  }

  private sellSelected(): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    const tower = this.selectedTower;
    const value = this.sellValue(tower);
    this.cancelMerge(false);
    this.coins += value;
    this.sells++;
    this.effects.popup(tower.x, tower.y - 30, t('coinsPopup', { n: value }));
    this.effects.placed(tower.x, tower.y);
    this.removeTower(tower);
    sfx.sell();
    this.panel.setCoins(this.coins);
    this.panel.toast(t('toastSold', { n: value }));
    this.updateHint();
    for (const other of this.towers) other.setMergeCandidate(false);
  }

  private pickMutation(index: number): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    if (!this.selectedTower.pickMutation(index)) return;
    this.mutationsPicked++;
    this.effects.merged(this.selectedTower.x, this.selectedTower.y);
    sfx.mutation();
    this.refreshCard();
  }

  private rotateSelected(dir: 1 | -1): void {
    if (this.state !== 'playing' || !this.selectedTower?.isBeam) return;
    this.selectedTower.rotateAim(dir);
    sfx.rotate();
    this.refreshCard();
  }

  /** Числа для карточки: у каждой башни свои три строки. */
  private cardStats(tower: Tower): string[] {
    const st = tower.stats;
    const n = (x: number): string => num(Math.round(x * 10) / 10);
    const pause = t('statCooldown', { n: n(st.cooldownMs / 1000) });
    if (st.targeting === 'puddle') return [t('statPuddle', { r: Math.round(st.puddleRadius), s: n(st.puddleSec) }), t('statSlow', { n: n(st.slowFactor) }), pause];
    if (st.targeting === 'beam') return [t('statDamage', { n: n(st.damage) }), t(st.secondBeam ? 'statBeams' : 'statBeam', { n: st.secondBeam ? 2 : st.beamPulses }), pause];
    if (st.targeting === 'area') return [t('statDamage', { n: n(st.damage) }), t('statBlast', { r: Math.round(st.blastRadius) }), pause];
    return [t('statDamage', { n: n(st.damage) }), pause, t('statRange', { n: Math.round(st.range) })];
  }

  /** Перерисовать карточку выбранной башни (или скрыть, если башня не выбрана). */
  private refreshCard(): void {
    const tower = this.selectedTower;
    if (!tower) {
      this.panel.hideCard();
      return;
    }
    const label = (id: string): { name: string; desc: string } => {
      const key = id.charAt(0).toUpperCase() + id.slice(1);
      return { name: t(`mut${key}` as TextKey), desc: t(`mutd${key}` as TextKey) };
    };
    const tier = tower.pendingTier;
    const merge = tower.level >= MAX_TOWER_LEVEL ? 'max' : this.mergeMode ? 'active' : this.mergeCandidates(tower).length > 0 ? 'ready' : 'none';
    this.panel.showCard({
      name: t(`tower${tower.id.charAt(0).toUpperCase()}${tower.id.slice(1)}` as TextKey),
      level: tower.level,
      maxLevel: MAX_TOWER_LEVEL,
      stats: this.cardStats(tower),
      pending: tier === null ? null : mutationOptions(tower.id, tier).map((m) => label(m.id)),
      picked: tower.picks.map(label),
      beam: tower.isBeam,
      merge,
      sell: this.sellValue(tower),
    });
  }

  private tryPlace(id: TowerId, col: number, row: number): void {
    if (!isTowerOpen(id)) return;
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
    this.refreshCard();
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

  /** Любое касание экрана: на паузе — продолжить, на плашке — закрыть её. После конца уровня тап по экрану ничего не делает: заново — только кнопкой. */
  private onScreenTap(): void {
    if (isPortraitPhone()) return;
    const now = performance.now();
    if (this.state === 'paused' && now >= this.resumeAllowedAt) this.togglePause();
    else if (this.state === 'info' && now >= this.infoClosableAt) this.advanceInfo();
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

  // ---------------------------------------------------------------- плашки с описанием (игра на паузе)

  // ---------------------------------------------------------------- стресс-сценарий (замер скорости)

  /** 40 башен всех видов (уровни 1–4, мутации выбраны) по свободным клеткам, ≈200 бактерий всех типов по всей сети, скорость ×3. */
  private setupStress(): void {
    this.userSpeed = STRESS_SPEED;
    this.panel.setSpeed(this.userSpeed);
    const ids = Object.keys(CONFIG.towers) as TowerId[];
    const free: [number, number][] = [];
    for (let row = 0; row < LEVEL.rows; row++) {
      for (let col = 0; col < LEVEL.cols; col++) {
        const key = cellKey(col, row);
        if (!PATH_TILES.has(key) && !BLOCKED_TILES.has(key)) free.push([col, row]);
      }
    }
    // Клетки берутся равномерно по всему списку, чтобы башни стояли по всей карте
    const count = Math.min(STRESS_TOWERS, free.length);
    for (let i = 0; i < count; i++) {
      const [col, row] = free[Math.floor((i * free.length) / count)];
      const center = tileCenter(col, row);
      const tower = new Tower(this, this.towerLayer, ids[i % ids.length], col, row, center.x, center.y);
      for (let level = 1; level < 1 + (Math.floor(i / ids.length) % MAX_TOWER_LEVEL); level++) tower.upgrade();
      while (tower.pendingTier !== null) tower.pickMutation(i % 2);
      this.occupied.add(cellKey(col, row));
      this.towers.push(tower);
    }
    this.placedAny = true;
    this.updateHint();
    this.refillStress(STRESS_BACTERIA);
  }

  /** Добавляет бактерий случайных типов в случайные места сети (не больше `limit` за раз), пока их меньше STRESS_BACTERIA. */
  private refillStress(limit: number): void {
    for (let n = 0; n < limit && this.bacteria.length < STRESS_BACTERIA; n++) {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      // Место — случайная точка сети не ближе STRESS_ORGANISM_GAP_TILES клеток к организму (иначе потеря жизни шла бы каждый кадр)
      let edge = EDGES[0];
      let s = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        edge = EDGES[Math.floor(Math.random() * EDGES.length)];
        s = Math.random() * edge.length;
        if (pointAt(edge, s).x > CONFIG.map.orgW + STRESS_ORGANISM_GAP_TILES * CONFIG.map.tile) break;
      }
      this.bacteria.push(new Bacterium(this, this.bacteriaLayer, kind, edge, s, STRESS_HP_MUL));
      this.spawned++;
    }
  }

  /** В начале уровня: плашки башен, открывшихся на этом уровне (на 1-м — Таблетка и Сироп), затем плашки бактерий 1-й волны. */
  private announceStart(): void {
    if (NO_PLAQUES) return;
    for (const id of newTowersOfLevel(Object.keys(CONFIG.towers))) {
      if (seenPlaques.has(`t:${id}`)) continue;
      seenPlaques.add(`t:${id}`);
      this.infoQueue.push(this.towerPlaque(id as TowerId));
    }
    this.announceWave(0);
  }

  /** Перед волной с номером `index` (с нуля): плашки типов бактерий, которых игрок ещё не видел; пауза перед волной после них длиннее. */
  private announceWave(index: number): void {
    if (NO_PLAQUES) return;
    if (index < this.waveTotal()) {
      const present = new Set(this.waveKinds(index));
      let fresh = 0;
      for (const kind of KINDS) {
        if (!present.has(kind) || seenPlaques.has(`b:${kind}`)) continue;
        seenPlaques.add(`b:${kind}`);
        this.infoQueue.push(this.bacteriumPlaque(kind));
        fresh++;
      }
      if (fresh > 0) this.phaseTimer += CONFIG.waves.newTypePauseSec;
    }
    if (this.infoQueue.length === 0 || this.state !== 'playing') return;
    this.state = 'info';
    this.ghost.setVisible(false);
    this.showInfo();
  }

  private showInfo(): void {
    this.plaque.show(this.infoQueue[0]);
    this.infoClosableAt = performance.now() + PLAQUE_LOCK_MS;
    sfx.newType();
  }

  /** Тап по плашке: следующая плашка из очереди или, если очередь кончилась, игра продолжается. */
  private advanceInfo(): void {
    this.infoQueue.shift();
    if (this.infoQueue.length > 0) {
      this.showInfo();
      return;
    }
    this.plaque.hide();
    this.state = 'playing';
  }

  private bacteriumPlaque(kind: BacteriumKind): PlaqueModel {
    const key = kind.charAt(0).toUpperCase() + kind.slice(1);
    return {
      kind: 'bacterium',
      id: kind,
      title: t('plaqueBacteria'),
      name: t(`bacName${key}` as TextKey),
      lines: [
        { label: t('plaqueAbility'), text: t(`bacAbility${key}` as TextKey) },
        { label: t('plaqueCounter'), text: t(`bacCounter${key}` as TextKey) },
      ],
      hint: t('tapToResume'),
    };
  }

  private towerPlaque(id: TowerId): PlaqueModel {
    const key = id.charAt(0).toUpperCase() + id.slice(1);
    const vars = { pct: Math.round((1 - CONFIG.towers.syrup.slowFactor) * 100) };
    return {
      kind: 'tower',
      id,
      title: t('plaqueTower'),
      name: t(`tower${key}` as TextKey),
      lines: [
        { label: t('plaqueDoes'), text: t(`towerDoes${key}` as TextKey, vars) },
        { label: t('plaqueVs'), text: t(`towerVs${key}` as TextKey) },
      ],
      hint: t('tapToResume'),
    };
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
    this.chains = [];
    this.deselectTower();
    if (won) sfx.win();
    else sfx.lose();
    this.showOverlay(won ? t('victory') : t('gameOver'), TEXT_COLORS.accent, t('killed', { n: this.kills }));
    this.addRestartButton();
  }

  /** Кнопка «Заново» на экране конца уровня: перезапуск только ею (тап мимо кнопки уровень не перезапускает). */
  private addRestartButton(): void {
    const w = 320;
    const h = 76;
    const x = W / 2;
    const y = H / 2 + 120;
    const g = this.add.graphics();
    g.fillStyle(0x2a8a4a, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    g.lineStyle(4, COLORS.merge, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    const label = this.add.text(x, y, t('restart'), this.textStyle(34)).setOrigin(0.5);
    const zone = this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (performance.now() >= this.restartAllowedAt) this.scene.restart();
      });
    this.overlay?.add([g, label, zone]);
    this.endButton = { x, y, w, h };
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
      camera: { zoom: this.rig.zoom, cx: this.rig.cx, cy: this.rig.cy, zoomMin: ZOOM_MIN, zoomMax: CONFIG.camera.zoomMax },
      level: CURRENT_LEVEL,
      info: { ...this.plaque.geometry(), queue: this.infoQueue.length },
      endButton: this.endButton ? { ...this.endButton } : null,
      selected: this.selected,
      towers: this.towers.map((tw) => ({
        id: tw.id,
        col: tw.col,
        row: tw.row,
        x: tw.x,
        y: tw.y,
        disabled: tw.isDisabled,
        remaining: tw.remaining,
        aim: tw.aim,
        level: tw.level,
        picks: [...tw.picks],
        pending: tw.pendingTier,
        stats: {
          damage: tw.stats.damage,
          cooldownMs: tw.stats.cooldownMs,
          range: tw.stats.range,
          beamPulses: tw.stats.beamPulses,
          blastRadius: tw.stats.blastRadius,
          puddleRadius: tw.stats.puddleRadius,
          slowFactor: tw.stats.slowFactor,
        },
      })),
      selectedTower: this.selectedTower ? { col: this.selectedTower.col, row: this.selectedTower.row } : null,
      mergeMode: this.mergeMode,
      maxTowerLevel: MAX_TOWER_LEVEL,
      merges: this.merges,
      sells: this.sells,
      mutationsPicked: this.mutationsPicked,
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
