import Phaser from 'phaser';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { t } from '../i18n';
import { Bacterium, NEXT_SIZE, type BacteriumSize } from '../objects/Bacterium';
import { Pill } from '../objects/Pill';
import { sfx } from '../sound';
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
  private hits = 0;
  private kills = 0;
  private splits = 0;
  private selfSplits = 0;
  private shots = 0;
  private spawnIn = 0;
  /** Когда каждый палец (или мышь) стрелял в последний раз, по реальным часам, мс. */
  private lastShotAt = new Map<string, number>();
  /** Раньше этого момента (реальные часы, мс) тап по экрану проигрыша не перезапускает игру. */
  private restartAllowedAt = 0;
  /** Сколько обработчиков нажатия навешено (для проверки на утечки при рестарте). */
  private tapListeners = 0;

  private effects!: Effects;
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
    this.hits = 0;
    this.kills = 0;
    this.splits = 0;
    this.selfSplits = 0;
    this.shots = 0;
    this.lastShotAt = new Map();
    this.restartAllowedAt = 0;
    this.spawnIn = CONFIG.spawn.intervalStartSec;

    this.drawField();
    this.drawHud();
    this.effects = new Effects(this);
    this.setUpInput();
    this.spawnStartingBacteria();

    exposeDebug(() => this.snapshot());
  }

  update(_time: number, deltaMs: number): void {
    if (this.state !== 'playing') return;

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE;
    this.elapsed += dt;
    this.updateLevel();

    // Появление новых бактерий сверху (если кадр длинный, может появиться сразу несколько)
    this.spawnIn -= dt;
    let spawned = 0;
    while (this.spawnIn <= 0 && spawned < MAX_SPAWNS_PER_FRAME) {
      if (this.bacteria.length < CONFIG.split.maxOnScreen) this.spawnFromTop();
      this.spawnIn += this.nextSpawnInterval();
      spawned++;
    }
    this.spawnIn = Math.max(this.spawnIn, 0);

    // Движение, попадания, самоделение
    const levelFactor = CONFIG.difficulty.speedMultiplier ** this.level;
    for (const bacterium of this.bacteria) bacterium.update(dt, levelFactor);
    for (const pill of this.pills) pill.update(dt);
    this.resolveHits();
    this.splitNeglected();
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

  // ---------------------------------------------------------------- появление бактерий

  /** На старте на экране уже 3–4 бактерии, расставленные по верхней части поля. */
  private spawnStartingBacteria(): void {
    const { startCountMin, startCountMax, startZoneTop, startZoneBottom } = CONFIG.spawn;
    const count = Phaser.Math.Between(startCountMin, startCountMax);
    const band = (startZoneBottom - startZoneTop) / Math.max(count, 1);
    for (let i = 0; i < count; i++) {
      const size = this.pickSize();
      const y = startZoneTop + band * (i + 0.15 + Math.random() * 0.7);
      this.bacteria.push(new Bacterium(this, size, this.freeX(CONFIG.sizes[size].radius, y), y));
    }
  }

  private spawnFromTop(): void {
    const size = this.pickSize();
    const radius = CONFIG.sizes[size].radius;
    const y = -radius;
    this.bacteria.push(new Bacterium(this, size, this.freeX(radius, y), y));
  }

  /** Размер новой бактерии — случайно, по долям из config.spawn.mix. */
  private pickSize(): BacteriumSize {
    const { large, medium, small } = CONFIG.spawn.mix;
    let roll = Math.random() * (large + medium + small);
    if ((roll -= large) < 0) return 'large';
    if ((roll -= medium) < 0) return 'medium';
    return 'small';
  }

  /** Пауза до следующей бактерии: плавно сокращается от intervalStartSec до intervalEndSec. */
  private nextSpawnInterval(): number {
    const { intervalStartSec, intervalEndSec, rampSec, jitter } = CONFIG.spawn;
    const progress = Math.min(1, this.elapsed / Math.max(rampSec, 0.001));
    const base = intervalStartSec + (intervalEndSec - intervalStartSec) * progress;
    return Math.max(0.05, base * (1 + (Math.random() * 2 - 1) * jitter));
  }

  /** Подбирает место по горизонтали, где новая бактерия не сядет прямо на другую. */
  private freeX(radius: number, y: number): number {
    const margin = radius + CONFIG.bacteria.wobbleAmplitude + 8;
    let best = W / 2;
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Phaser.Math.Between(margin, W - margin);
      let gap = Infinity;
      for (const b of this.bacteria) gap = Math.min(gap, Math.hypot(b.x - x, b.y - y) - b.radius - radius);
      if (gap >= 6) return x;
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- правила

  /** Растёт ли сложность: каждые N секунд бактерии становятся быстрее. */
  private updateLevel(): void {
    const level = Math.floor(this.elapsed / CONFIG.difficulty.speedUpEverySec);
    if (level > this.level) {
      this.level = level;
      this.showNotice(t('speedUp'));
    }
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
        this.onHit(target);
        pill.destroy();
      } else {
        survivors.push(pill);
      }
    }
    this.pills = survivors;
  }

  /** Попадание: очки, вспышка, «+очки»; большая и средняя делятся, малая гибнет. */
  private onHit(bacterium: Bacterium): void {
    this.hits++;
    this.score += bacterium.points;
    this.scoreText.setText(t('score', { n: this.score }));

    this.effects.burst(bacterium.x, bacterium.y, bacterium.radius, bacterium.size);
    this.effects.popup(bacterium.x, bacterium.y - bacterium.radius * 0.3, bacterium.points, bacterium.size);

    const next = NEXT_SIZE[bacterium.size];
    if (next === null) {
      this.kills++;
      sfx.kill();
    } else {
      this.splits++;
      this.effects.shake();
      sfx.split(bacterium.size as 'large' | 'medium');
    }
    this.divide(bacterium);
  }

  /** Бактерии, до которых давно не добрались, делятся сами (без очков и тряски — только «блоп»). */
  private splitNeglected(): void {
    for (const bacterium of [...this.bacteria]) {
      if (!bacterium.readyToSplit || this.bacteria.length >= CONFIG.split.maxOnScreen) continue;
      this.selfSplits++;
      this.effects.burst(bacterium.x, bacterium.y, bacterium.radius, bacterium.size);
      sfx.selfSplit();
      this.divide(bacterium);
    }
  }

  /** Убирает бактерию; если у неё есть следующий размер — на её месте две «дочки», разлетающиеся в стороны. */
  private divide(parent: Bacterium): void {
    this.bacteria = this.bacteria.filter((b) => b !== parent);
    parent.destroy();

    const next = NEXT_SIZE[parent.size];
    if (next === null) return;
    const offset = CONFIG.sizes[next].radius * 0.7;
    const kick = CONFIG.split.kickSpeed;
    this.bacteria.push(
      new Bacterium(this, next, Phaser.Math.Clamp(parent.x - offset, 0, W), parent.y, -kick),
      new Bacterium(this, next, Phaser.Math.Clamp(parent.x + offset, 0, W), parent.y, kick),
    );
  }

  private endGame(): void {
    this.state = 'over';
    this.restartAllowedAt = performance.now() + CONFIG.gameOver.restartLockMs;
    sfx.lose();

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
      hits: this.hits,
      kills: this.kills,
      splits: this.splits,
      selfSplits: this.selfSplits,
      shots: this.shots,
      elapsed: this.elapsed,
      level: this.level,
      lang: document.documentElement.lang,
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
      tapListeners: this.tapListeners,
      width: W,
      height: H,
      loseLineY: LOSE_LINE_Y,
      bacteria: this.bacteria.map((b) => ({ x: b.x, y: b.y, r: b.radius, age: b.age, size: b.size })),
      pills: this.pills.map((p) => ({ x: p.x, y: p.y })),
      effects: { bursts: this.effects.bursts, popups: this.effects.popups, shakes: this.effects.shakes },
      sound: { state: sfx.state, played: sfx.played },
    };
  }
}
