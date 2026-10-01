import Phaser from 'phaser';
import { CameraRig } from '../cameraRig';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { num, t, type TextKey } from '../i18n';
import { EDGES, ENTRANCE_EDGES, LEVEL, PATH_TILES, WORLD, cellKey, worldToCell } from '../level';
import { isPortraitPhone } from '../orientation';
import { addMap } from '../mapArt';
import { MapGestures } from '../mapGestures';
import { Bacterium, type BacteriumKind } from '../objects/Bacterium';
import { Needle } from '../objects/Needle';
import { Projectile } from '../objects/Projectile';
import { createTowerArt, Tower, type TowerId } from '../objects/Tower';
import { tileCenter } from '../pathing';
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
};
/** Сколько миллисекунд держится сообщение о новом типе. */
const NEW_TYPE_TOAST_MS = 4200;
/** Во что распадается делящаяся (правило игры, не число баланса). */
const SPLITS_INTO: BacteriumKind = 'coccus';

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

  private bacteria: Bacterium[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  /** Иглы «Шприца» в полёте. */
  private needles: Needle[] = [];
  /** Занятые клетки (ключ «колонка,ряд»). */
  private occupied = new Set<string>();
  /** Какая башня выбрана на панели (тап по клетке поставит её). */
  private selected: TowerId | null = null;
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
  private waveQueue: BacteriumKind[] = [];
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
  private towerLayer!: Phaser.GameObjects.Container;
  private bacteriaLayer!: Phaser.GameObjects.Container;
  private projectileLayer!: Phaser.GameObjects.Container;
  private ghostLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Container;
  private ghostArt!: Phaser.GameObjects.Container;
  private ghostRange!: Phaser.GameObjects.Graphics;
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
    this.bacteria = [];
    this.towers = [];
    this.projectiles = [];
    this.needles = [];
    this.occupied = new Set();
    this.selected = null;
    this.placedAny = false;
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
    this.ghostLayer = this.add.container(0, 0);
    this.towerLayer = this.add.container(0, 0);
    this.bacteriaLayer = this.add.container(0, 0);
    this.projectileLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.world.add([mapLayer, this.ghostLayer, this.towerLayer, this.bacteriaLayer, this.projectileLayer, this.fxLayer]);
    addMap(this, mapLayer);

    this.rig = new CameraRig(this.world, { w: VIEW_W, h: H }, WORLD, { min: CONFIG.camera.zoomMin, max: CONFIG.camera.zoomMax });
    const start = tileCenter(LEVEL.startCenter[0], LEVEL.startCenter[1]);
    this.rig.set(CONFIG.camera.zoomStart, start.x, start.y);

    this.effects = new Effects(this, this.fxLayer);
    this.buildGhost();
    this.panel = new Panel(this, { onTower: (id) => this.toggleTower(id), onPause: () => this.togglePause() });
    this.panel.init();
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

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE;
    this.elapsed += dt;
    this.updateWaves(dt);

    for (const bacterium of this.bacteria) bacterium.update(dt);
    this.applySpores();
    for (const tower of this.towers) tower.update(dt, this.bacteria, (target, x, y) => this.fire(tower, target, x, y));
    this.updateProjectiles(dt);
    this.updateNeedles(dt);
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
      this.spawnBacterium();
      this.waveSpawned++;
      this.spawnTimer += this.waveInterval;
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
    // Новый тип выходит первым и в одном экземпляре (остальные такого же типа — потом, вперемешку с прочими)
    const all = this.waveKinds(i);
    const fresh = KINDS.filter((kind) => !this.introduced.includes(kind) && all.includes(kind));
    const queue: BacteriumKind[] = [];
    const rest = [...all];
    for (const kind of fresh) {
      queue.push(kind);
      rest.splice(rest.indexOf(kind), 1);
    }
    for (let k = rest.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    this.waveQueue = [...queue, ...rest];
    this.waveCount = this.waveQueue.length;
    const total = this.waveTotal();
    const k = total > 1 ? i / (total - 1) : 0;
    this.waveInterval = w.intervalStartSec + (w.intervalEndSec - w.intervalStartSec) * k;
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
  private spawnBacterium(): void {
    const kind = this.waveQueue[this.waveSpawned];
    const edge = ENTRANCE_EDGES[Math.floor(Math.random() * ENTRANCE_EDGES.length)];
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

  /** Выстрел башни: «по радиусу» и «по площади» — снаряд летит за целью, «по линии» — игла летит насквозь. */
  private fire(tower: Tower, target: Bacterium, muzzleX: number, muzzleY: number): void {
    this.shots++;
    sfx.shoot(tower.id);
    const { targeting, range, projectileSpeed } = tower.cfg;
    if (targeting === 'line') {
      const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      const muzzle = Math.hypot(muzzleX - tower.x, muzzleY - tower.y);
      this.needles.push(new Needle(this, this.projectileLayer, tower.x, tower.y, angle, range, muzzle, tower.id, projectileSpeed));
    } else {
      this.projectiles.push(new Projectile(this, this.projectileLayer, muzzleX, muzzleY, target, tower.id, projectileSpeed));
    }
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

  /** Иглы летят насквозь: каждая задетая бактерия получает урон один раз. */
  private updateNeedles(dt: number): void {
    this.needles = this.needles.filter((needle) => {
      const { hits, done } = needle.update(dt, this.bacteria);
      const cfg = CONFIG.towers[needle.towerId];
      for (const bacterium of hits) this.damageBacterium(bacterium, cfg);
      if (!done) return true;
      needle.destroy();
      return false;
    });
  }

  /** Попадание: урон; у «Сиропа» ещё и замедление. Если бактерия погибла — монеты, частицы, распад делящейся. */
  private damageBacterium(bacterium: Bacterium, cfg: TowerCfg, quiet = false): void {
    if (bacterium.hp <= 0) return;
    if (bacterium.hit(cfg.damage)) {
      this.killBacterium(bacterium);
      return;
    }
    if (cfg.slowSec > 0) {
      bacterium.slow(cfg.slowFactor, cfg.slowSec);
      this.slows++;
    }
    this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.6, cfg.slowSec > 0 ? COLORS.syrup : COLORS.hit);
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

  /** Бактерии, дошедшие до красной линии организма, исчезают и отнимают жизни. */
  private resolveArrivals(): void {
    let damage = 0;
    for (const bacterium of [...this.bacteria]) {
      if (!bacterium.reachedOrganism) continue;
      damage += bacterium.lifeDamage;
      this.leaked++;
      this.removeBacterium(bacterium);
    }
    if (damage === 0) return;
    this.lives = Math.max(0, this.lives - damage);
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
    if (id === 'syrup') return t('infoSyrup', { pct: Math.round((1 - cfg.slowFactor) * 100), sec: num(cfg.slowSec) });
    if (id === 'fizz') return t('infoFizz');
    if (id === 'syringe') return t('infoSyringe');
    return null;
  }

  /** Тап по карте: если выбрана башня — ставим её в клетку под пальцем. */
  private onTap(sx: number, sy: number): void {
    if (!this.selected) return;
    const world = this.rig.screenToWorld(sx, sy);
    const cell = worldToCell(world.x, world.y);
    if (!cell) {
      this.deny(t('hintCantBuild'));
      return;
    }
    this.tryPlace(this.selected, cell[0], cell[1]);
  }

  private tryPlace(id: TowerId, col: number, row: number): void {
    const cfg = CONFIG.towers[id];
    const key = cellKey(col, row);
    if (PATH_TILES.has(key) || this.occupied.has(key)) {
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
  }

  private deny(message: string): void {
    sfx.denied();
    this.panel.toast(message);
  }

  /** Мышь над картой: показываем «призрак» выбранной башни и её радиус. */
  private onHover(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = this.selected ? worldToCell(world.x, world.y) : null;
    if (!this.selected || !cell || PATH_TILES.has(cellKey(cell[0], cell[1])) || this.occupied.has(cellKey(cell[0], cell[1]))) {
      this.ghost.setVisible(false);
      return;
    }
    const center = tileCenter(cell[0], cell[1]);
    const half = (CONFIG.map.tile - 6) / 2;
    this.ghost.setPosition(center.x, center.y).setVisible(true);
    this.ghostRange.clear();
    const range = CONFIG.towers[this.selected].range;
    this.ghostRange.fillStyle(COLORS.ghost, 0.1).fillCircle(0, 0, range);
    this.ghostRange.lineStyle(2.5, COLORS.ghostEdge, 1).strokeCircle(0, 0, range);
    this.ghostCell.clear();
    this.ghostCell.fillStyle(COLORS.ghost, 0.25).fillRoundedRect(-half, -half, half * 2, half * 2, 10);
    this.ghostCell.lineStyle(3, COLORS.ghostEdge, 1).strokeRoundedRect(-half, -half, half * 2, half * 2, 10);
  }

  private buildGhost(): void {
    this.ghostRange = this.add.graphics();
    this.ghostCell = this.add.graphics();
    this.ghostArt = this.add.container(0, 0).setAlpha(0.65);
    createTowerArt(this, this.ghostArt);
    this.ghost = this.add.container(0, 0, [this.ghostRange, this.ghostCell, this.ghostArt]).setVisible(false);
    this.ghostLayer.add(this.ghost);
  }

  /** «Призрак» рисуется как выбранная башня. */
  private setGhostArt(id: TowerId): void {
    this.ghostArt.removeAll(true);
    createTowerArt(this, this.ghostArt, id);
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
    for (const needle of this.needles) needle.destroy();
    this.needles = [];
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
      towers: this.towers.map((tw) => ({ id: tw.id, col: tw.col, row: tw.row, x: tw.x, y: tw.y, disabled: tw.isDisabled, remaining: tw.remaining })),
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
      projectiles: this.projectiles.length + this.needles.length,
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
      },
      sound: { state: sfx.state, played: sfx.played },
    };
  }
}
