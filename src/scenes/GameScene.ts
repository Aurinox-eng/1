import Phaser from 'phaser';
import { CameraRig } from '../cameraRig';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { t } from '../i18n';
import { LEVEL, PATH_TILES, ROUTES, WORLD, cellKey, worldToCell } from '../level';
import { addMap } from '../mapArt';
import { MapGestures } from '../mapGestures';
import { Bacterium } from '../objects/Bacterium';
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
/** Какую башню даёт кнопка на панели (пока одна; остальные откроются на следующих этапах). */
const PANEL_TOWER: TowerId = 'pill';

type State = 'playing' | 'paused' | 'won' | 'lost';
type WavePhase = 'countdown' | 'spawning' | 'pause' | 'done';

export class GameScene extends Phaser.Scene {
  private state: State = 'playing';
  private elapsed = 0;
  private coins = 0;
  private lives = 0;
  private kills = 0;
  private leaked = 0;
  private shots = 0;
  private spawned = 0;

  private bacteria: Bacterium[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  /** Занятые клетки (ключ «колонка,ряд»). */
  private occupied = new Set<string>();
  /** Какая башня выбрана на панели (тап по клетке поставит её). */
  private selected: TowerId | null = null;

  // Волны
  private phase: WavePhase = 'countdown';
  private phaseTimer = 0;
  /** Сколько волн уже началось. */
  private waveIdx = 0;
  private waveSpawned = 0;
  private waveCount = 0;
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
    this.leaked = 0;
    this.shots = 0;
    this.spawned = 0;
    this.bacteria = [];
    this.towers = [];
    this.projectiles = [];
    this.occupied = new Set();
    this.selected = null;
    this.phase = 'countdown';
    this.phaseTimer = CONFIG.waves.firstDelaySec;
    this.waveIdx = 0;
    this.waveSpawned = 0;
    this.waveCount = 0;
    this.spawnTimer = 0;
    this.plannedTotal = 0;
    for (let i = 0; i < CONFIG.waves.total; i++) this.plannedTotal += CONFIG.waves.firstCount + CONFIG.waves.countStep * i;
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
    this.panel = new Panel(this, { onTower: () => this.toggleTower(), onPause: () => this.togglePause() });
    this.panel.init();
    this.panel.setCoins(this.coins);
    this.panel.setAffordable(this.coins >= CONFIG.towers[PANEL_TOWER].price);
    this.panel.setHint(t('hintPlace'));
    this.refreshPanel();

    new MapGestures(this, this.rig, VIEW_W, {
      isActive: () => this.state === 'playing',
      onTap: (sx, sy) => this.onTap(sx, sy),
      onHover: (sx, sy) => this.onHover(sx, sy),
      onHoverEnd: () => this.ghost.setVisible(false),
    });
    this.input.on('pointerdown', this.onScreenTap, this);

    exposeDebug({
      getState: () => this.snapshot(),
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
    if (this.state !== 'playing') return;

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE;
    this.elapsed += dt;
    this.updateWaves(dt);

    for (const bacterium of this.bacteria) bacterium.update(dt);
    for (const tower of this.towers) {
      tower.update(dt, this.bacteria, (target, x, y) => {
        this.projectiles.push(new Projectile(this, this.projectileLayer, x, y, target, tower.cfg.damage, tower.cfg.projectileSpeed));
        this.shots++;
        sfx.shoot();
      });
    }
    this.updateProjectiles(dt);
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
      if (this.waveIdx >= CONFIG.waves.total) {
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
    this.waveCount = w.firstCount + w.countStep * i;
    const k = w.total > 1 ? i / (w.total - 1) : 0;
    this.waveInterval = w.intervalStartSec + (w.intervalEndSec - w.intervalStartSec) * k;
    this.waveIdx++;
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.phase = 'spawning';
    sfx.wave();
  }

  /** Бактерия выходит справа; какой из четырёх маршрутов (вход и выход) — случайно. Правила развилки — этап 2. */
  private spawnBacterium(): void {
    const routeIndex = Math.floor(Math.random() * ROUTES.length);
    this.bacteria.push(new Bacterium(this, this.bacteriaLayer, 'coccus', ROUTES[routeIndex], routeIndex));
    this.spawned++;
  }

  // ---------------------------------------------------------------- бой

  private updateProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const result = projectile.update(dt);
      if (result === 'flying') return true;
      if (result === 'hit') this.hitBacterium(projectile);
      projectile.destroy();
      return false;
    });
  }

  private hitBacterium(projectile: Projectile): void {
    const bacterium = projectile.target;
    if (bacterium.hp <= 0) return;
    if (bacterium.hit(projectile.damage)) {
      this.killBacterium(bacterium);
    } else {
      this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.6);
      sfx.hit(bacterium.kind);
    }
  }

  private killBacterium(bacterium: Bacterium): void {
    this.kills++;
    this.coins += bacterium.reward;
    this.effects.burst(bacterium.x, bacterium.y, bacterium.kind);
    this.effects.popup(bacterium.x, bacterium.y, t('coinsPopup', { n: bacterium.reward }));
    sfx.destroy();
    this.removeBacterium(bacterium);
    this.panel.setCoins(this.coins);
    this.panel.setAffordable(this.coins >= CONFIG.towers[PANEL_TOWER].price);
  }

  private removeBacterium(bacterium: Bacterium): void {
    this.bacteria = this.bacteria.filter((b) => b !== bacterium);
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

  /** Кнопка башни на панели: выбрать или снять выбор. */
  private toggleTower(): void {
    if (this.state !== 'playing') return;
    this.selected = this.selected ? null : PANEL_TOWER;
    this.panel.setSelected(this.selected !== null);
    if (!this.selected) this.ghost.setVisible(false);
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
    if (this.rig.zoom < CONFIG.camera.placeMinZoom) {
      this.deny(t('hintZoomIn'));
      return;
    }
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
    this.panel.setAffordable(this.coins >= CONFIG.towers[PANEL_TOWER].price);
    this.panel.setHint(null);
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
    const art = this.add.container(0, 0).setAlpha(0.65);
    createTowerArt(this, art);
    this.ghost = this.add.container(0, 0, [this.ghostRange, this.ghostCell, art]).setVisible(false);
    this.ghostLayer.add(this.ghost);
  }

  /** Любое касание экрана: на паузе — продолжить, после конца уровня — начать заново. */
  private onScreenTap(): void {
    const now = performance.now();
    if (this.state === 'paused' && now >= this.resumeAllowedAt) this.togglePause();
    else if ((this.state === 'won' || this.state === 'lost') && now >= this.restartAllowedAt) this.scene.restart();
  }

  private togglePause(): void {
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
    this.panel.setWave(Math.max(1, this.waveIdx), CONFIG.waves.total, progress, next);
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
      waveTotal: CONFIG.waves.total,
      spawned: this.spawned,
      kills: this.kills,
      leaked: this.leaked,
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
      towers: this.towers.map((tw) => ({ id: tw.id, col: tw.col, row: tw.row, x: tw.x, y: tw.y })),
      bacteria: this.bacteria.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        r: b.radius,
        kind: b.kind,
        hp: b.hp,
        maxHp: b.maxHp,
        route: b.routeIndex,
        s: b.s,
      })),
      projectiles: this.projectiles.length,
      ui: this.panel.geometry(),
      pointerListeners: this.input.listenerCount('pointerdown'),
      effects: {
        flashes: this.effects.flashes,
        bursts: this.effects.bursts,
        popups: this.effects.popups,
        placements: this.effects.placements,
        lifeLosses: this.effects.lifeLosses,
      },
      sound: { state: sfx.state, played: sfx.played },
    };
  }
}
