import Phaser from 'phaser';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { t } from '../i18n';
import { Bacterium } from '../objects/Bacterium';
import { Pill } from '../objects/Pill';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;
/** Y красной линии: если бактерия её коснулась — проигрыш. */
const LOSE_LINE_Y = H - CONFIG.field.loseLineFromBottom;
/** Откуда вылетают таблетки. */
const PILL_START_Y = H - CONFIG.pill.startFromBottom;
/** Защита от «прыжков» после сворачивания вкладки: один кадр не длиннее 50 мс. */
const MAX_FRAME_MS = 50;
/** Если кадр очень длинный, за него появится не больше стольких бактерий (защита от лавины). */
const MAX_SPAWNS_PER_FRAME = 10;

export class GameScene extends Phaser.Scene {
  private bacteria: Bacterium[] = [];
  private pills: Pill[] = [];
  private state: 'playing' | 'over' = 'playing';
  private elapsed = 0;
  private level = 0;
  private score = 0;
  private kills = 0;
  private shots = 0;
  private spawnIn = 0;
  /** Когда каждый палец (или мышь) стрелял в последний раз, по реальным часам, мс. */
  private lastShotAt = new Map<string, number>();
  /** Раньше этого момента (реальные часы, мс) тап по экрану проигрыша не перезапускает игру. */
  private restartAllowedAt = 0;
  /** Сколько обработчиков нажатия навешено (для проверки на утечки при рестарте). */
  private tapListeners = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    // Сцена при перезапуске не создаётся заново, поэтому всё обнуляем вручную.
    this.bacteria = [];
    this.pills = [];
    this.state = 'playing';
    this.elapsed = 0;
    this.level = 0;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.lastShotAt = new Map();
    this.restartAllowedAt = 0;
    this.spawnIn = CONFIG.bacteria.firstSpawnDelaySec;

    this.drawField();
    this.drawHud();
    this.setUpInput();

    exposeDebug(() => this.snapshot());
  }

  update(_time: number, deltaMs: number): void {
    if (this.state !== 'playing') return;

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE;
    this.elapsed += dt;
    this.updateLevel();

    // Появление бактерий (если кадр длинный, может появиться сразу несколько)
    this.spawnIn -= dt;
    let spawned = 0;
    while (this.spawnIn <= 0 && spawned < MAX_SPAWNS_PER_FRAME) {
      this.spawnBacterium();
      this.spawnIn += this.nextSpawnInterval();
      spawned++;
    }
    this.spawnIn = Math.max(this.spawnIn, 0);

    // Движение и попадания
    const levelFactor = CONFIG.difficulty.speedMultiplier ** this.level;
    for (const bacterium of this.bacteria) bacterium.update(dt, levelFactor);
    for (const pill of this.pills) pill.update(dt);
    this.resolveHits();
    this.pills = this.pills.filter((pill) => {
      if (pill.isOffScreen) pill.destroy();
      return !pill.isOffScreen;
    });

    // Проигрыш
    if (this.bacteria.some((b) => b.bottom >= LOSE_LINE_Y)) {
      this.endGame();
      return;
    }

    this.timeText.setText(t('time', { n: Math.floor(this.elapsed) }));
  }

  // ---------------------------------------------------------------- ввод

  private setUpInput(): void {
    this.input.mouse?.disableContextMenu();

    // Тап по самому полю обрабатывает Phaser
    this.input.on('pointerdown', this.onPhaserPointer, this);
    this.tapListeners = 1;

    // Тап мимо поля (по тёмным полям вокруг него) тоже стреляет: на высоких телефонах нижняя
    // тёмная полоса — как раз там, где лежит палец. Горизонталь считаем по положению поля.
    const onOutsideTap = (event: PointerEvent): void => {
      if (event.target === this.game.canvas) return; // это уже обработал Phaser
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rect = this.game.canvas.getBoundingClientRect();
      this.onTap(`dom${event.pointerId}`, ((event.clientX - rect.left) / rect.width) * W);
    };
    window.addEventListener('pointerdown', onOutsideTap);
    this.tapListeners++;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pointerdown', onOutsideTap);
      this.tapListeners--;
    });
  }

  private onPhaserPointer(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0) return; // только левая кнопка мыши или касание
    this.onTap(`phaser${pointer.id}`, pointer.x);
  }

  /** Любое нажатие: во время игры — выстрел, на экране проигрыша — рестарт. */
  private onTap(fingerId: string, x: number): void {
    if (this.state === 'over') {
      if (performance.now() >= this.restartAllowedAt) this.scene.restart();
      return;
    }
    this.shoot(fingerId, x);
  }

  private shoot(fingerId: string, x: number): void {
    // У каждого пальца своя пауза между выстрелами, считается по реальным часам: на слабом
    // телефоне (мало кадров в секунду) пауза не растягивается и тапы не пропадают.
    const now = performance.now();
    const cooldown = CONFIG.pill.cooldownMs / TIME_SCALE;
    if (now - (this.lastShotAt.get(fingerId) ?? -Infinity) < cooldown) return;
    if (this.lastShotAt.size > 50) this.lastShotAt.clear();
    this.lastShotAt.set(fingerId, now);

    const half = CONFIG.pill.width / 2;
    this.pills.push(new Pill(this, Phaser.Math.Clamp(x, half, W - half), PILL_START_Y));
    this.shots++;
  }

  // ---------------------------------------------------------------- правила

  /** Растёт ли сложность: каждые N секунд бактерии становятся быстрее и чаще. */
  private updateLevel(): void {
    const level = Math.floor(this.elapsed / CONFIG.difficulty.speedUpEverySec);
    if (level > this.level) {
      this.level = level;
      this.showNotice(t('speedUp'));
    }
  }

  private nextSpawnInterval(): number {
    const { spawnIntervalSec, spawnJitter } = CONFIG.bacteria;
    const { spawnIntervalMultiplier, minSpawnIntervalSec } = CONFIG.difficulty;
    const base = Math.max(minSpawnIntervalSec, spawnIntervalSec * spawnIntervalMultiplier ** this.level);
    return base * (1 + (Math.random() * 2 - 1) * spawnJitter);
  }

  private spawnBacterium(): void {
    const { radius, wobbleAmplitude } = CONFIG.bacteria;
    const margin = radius + wobbleAmplitude + 8;
    let x = Phaser.Math.Between(margin, W - margin);
    // Несколько попыток не появиться прямо поверх другой бактерии, которая ещё у верхнего края.
    for (let i = 0; i < 10; i++) {
      const overlaps = this.bacteria.some((b) => b.y < radius * 3 && Math.abs(b.x - x) < radius * 2.2);
      if (!overlaps) break;
      x = Phaser.Math.Between(margin, W - margin);
    }
    this.bacteria.push(new Bacterium(this, x));
  }

  /**
   * Каждая таблетка попадает не более чем в одну бактерию — в самую нижнюю из тех, что на её пути.
   * Попадание считаем честно: таблетка (прямоугольник, растянутый на путь за кадр, чтобы быстрая
   * таблетка не «пролетала сквозь») касается круга бактерии.
   */
  private resolveHits(): void {
    const halfWidth = CONFIG.pill.width / 2;
    const survivors: Pill[] = [];

    for (const pill of this.pills) {
      const top = pill.y - CONFIG.pill.height / 2;
      const bottom = pill.prevY + CONFIG.pill.height / 2;

      let target: Bacterium | undefined;
      for (const b of this.bacteria) {
        // ближайшая к центру бактерии точка таблетки
        const nearestX = Phaser.Math.Clamp(b.x, pill.x - halfWidth, pill.x + halfWidth);
        const nearestY = Phaser.Math.Clamp(b.y, top, bottom);
        const touches = (b.x - nearestX) ** 2 + (b.y - nearestY) ** 2 <= b.radius ** 2;
        if (touches && (!target || b.y > target.y)) target = b;
      }

      if (target) {
        this.bacteria = this.bacteria.filter((b) => b !== target);
        target.pop();
        pill.destroy();
        this.kills++;
        this.score += CONFIG.score.perBacteria;
        this.scoreText.setText(t('score', { n: this.score }));
      } else {
        survivors.push(pill);
      }
    }
    this.pills = survivors;
  }

  private endGame(): void {
    this.state = 'over';
    this.restartAllowedAt = performance.now() + CONFIG.gameOver.restartLockMs;

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8).setDepth(10);
    this.add
      .text(W / 2, H / 2 - 90, t('gameOver'), this.textStyle(76, TEXT_COLORS.accent))
      .setOrigin(0.5)
      .setDepth(11);
    this.add
      .text(W / 2, H / 2 + 10, t('finalScore', { n: this.score }), this.textStyle(46))
      .setOrigin(0.5)
      .setDepth(11);
    this.add
      .text(W / 2, H / 2 + 110, t('tapToRestart'), this.textStyle(34))
      .setOrigin(0.5)
      .setDepth(11);
  }

  // ---------------------------------------------------------------- рисование

  private drawField(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.rectangle(W / 2, LOSE_LINE_Y / 2, W, LOSE_LINE_Y, COLORS.safeZone);
    const dangerHeight = H - LOSE_LINE_Y;
    this.add.rectangle(W / 2, LOSE_LINE_Y + dangerHeight / 2, W, dangerHeight, COLORS.dangerZone);
    this.add.rectangle(W / 2, LOSE_LINE_Y, W, 6, COLORS.loseLine);
  }

  private drawHud(): void {
    this.scoreText = this.add
      .text(24, 20, t('score', { n: 0 }), this.textStyle(44))
      .setDepth(5);
    this.timeText = this.add
      .text(W - 24, 20, t('time', { n: 0 }), this.textStyle(44))
      .setOrigin(1, 0)
      .setDepth(5);
  }

  private showNotice(message: string): void {
    const notice = this.add
      .text(W / 2, H * 0.32, message, this.textStyle(84, TEXT_COLORS.accent))
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({
      targets: notice,
      alpha: 0,
      y: notice.y - 60,
      duration: 1400,
      onComplete: () => notice.destroy(),
    });
  }

  private textStyle(size: number, color: string = TEXT_COLORS.main): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: TEXT_COLORS.stroke,
      strokeThickness: Math.max(4, Math.round(size / 9)),
    };
  }

  // ---------------------------------------------------------------- проверка

  private snapshot(): DebugSnapshot {
    return {
      state: this.state,
      score: this.score,
      kills: this.kills,
      shots: this.shots,
      elapsed: this.elapsed,
      level: this.level,
      lang: document.documentElement.lang,
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
      tapListeners: this.tapListeners,
      width: W,
      height: H,
      loseLineY: LOSE_LINE_Y,
      bacteria: this.bacteria.map((b) => ({ x: b.x, y: b.y, r: b.radius, age: b.age })),
      pills: this.pills.map((p) => ({ x: p.x, y: p.y })),
    };
  }
}
