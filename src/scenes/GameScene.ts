import Phaser from 'phaser';
import { CONFIG } from '../config';
import { exposeDebug, TIME_SCALE, type DebugSnapshot } from '../debug';
import { Effects } from '../effects';
import { t } from '../i18n';
import { Bacterium, extentOf, KINDS, type BacteriumKind } from '../objects/Bacterium';
import { Pill } from '../objects/Pill';
import { sfx } from '../sound';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;
/** Y красной линии: бактерия, коснувшаяся её, отнимает жизнь. */
const LOSE_LINE_Y = H - CONFIG.field.loseLineFromBottom;
/** Откуда вылетают таблетки. */
const PILL_START_Y = H - CONFIG.pill.startFromBottom;
/** Защита от «прыжков» после сворачивания вкладки: один кадр не длиннее 50 мс. */
const MAX_FRAME_MS = 50;
/** Если кадр очень длинный, за него появится не больше стольких бактерий (защита от лавины). */
const MAX_SPAWNS_PER_FRAME = 10;
/** Во что распадается бактерия при уничтожении (правило игры, не число баланса). */
const SPLITS_INTO: Partial<Record<BacteriumKind, BacteriumKind>> = { splitter: 'coccus' };
/** Типы в порядке появления в партии. */
const KINDS_BY_INTRO = [...KINDS].sort((a, b) => CONFIG.types[a].introSec - CONFIG.types[b].introSec);

export class GameScene extends Phaser.Scene {
  private bacteria: Bacterium[] = [];
  private pills: Pill[] = [];
  private state: 'playing' | 'over' = 'playing';
  private elapsed = 0;
  private level = 0;
  private score = 0;
  private lives = 0;
  private hits = 0;
  private kills = 0;
  private splits = 0;
  private selfSplits = 0;
  private shots = 0;
  private spawnIn = 0;
  /** Какие типы бактерий уже появлялись (в порядке появления). */
  private introduced = new Set<BacteriumKind>();
  /** Когда каждый палец (или мышь) стрелял в последний раз, по реальным часам, мс. */
  private lastShotAt = new Map<string, number>();
  /** Раньше этого момента (реальные часы, мс) тап по экрану проигрыша не перезапускает игру. */
  private restartAllowedAt = 0;
  /** Сколько обработчиков нажатия навешено (для проверки на утечки при рестарте). */
  private tapListeners = 0;

  private effects!: Effects;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private hearts!: Phaser.GameObjects.Graphics;

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
    this.lives = CONFIG.lives.start;
    this.hits = 0;
    this.kills = 0;
    this.splits = 0;
    this.selfSplits = 0;
    this.shots = 0;
    this.lastShotAt = new Map();
    this.restartAllowedAt = 0;
    this.spawnIn = CONFIG.spawn.intervalStartSec;
    this.introduced = new Set();

    this.drawField();
    this.drawHud();
    this.effects = new Effects(this);
    this.setUpInput();

    // Типы с introSec = 0 есть с самого начала; остальные появятся по расписанию, каждый — один раз в одиночку
    for (const kind of KINDS_BY_INTRO) if (CONFIG.types[kind].introSec <= 0) this.introduced.add(kind);
    if (this.introduced.size === 0) this.introduced.add(KINDS_BY_INTRO[0]);
    this.spawnStartingBacteria();

    exposeDebug(() => this.snapshot());
  }

  update(_time: number, deltaMs: number): void {
    if (this.state !== 'playing') return;

    const dt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE;
    this.elapsed += dt;
    this.updateLevel();
    this.checkIntroductions();

    // Появление новых бактерий сверху (если кадр длинный, может появиться сразу несколько)
    this.spawnIn -= dt;
    let spawned = 0;
    while (this.spawnIn <= 0 && spawned < MAX_SPAWNS_PER_FRAME) {
      if (this.bacteria.length < CONFIG.split.maxOnScreen) this.spawnAtTop(this.pickKind());
      this.spawnIn += this.nextSpawnInterval();
      spawned++;
    }
    this.spawnIn = Math.max(this.spawnIn, 0);

    // Движение, попадания, самоделение, дошедшие до линии
    const levelFactor = CONFIG.difficulty.speedMultiplier ** this.level;
    for (const bacterium of this.bacteria) bacterium.update(dt, levelFactor);
    for (const pill of this.pills) pill.update(dt);
    this.resolveHits();
    this.splitNeglected();
    this.pills = this.pills.filter((pill) => {
      if (pill.isOffScreen) pill.destroy();
      return !pill.isOffScreen;
    });
    this.resolveLine();
    if (this.state !== 'playing') return;

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
      const kind = this.pickKind();
      const y = startZoneTop + band * (i + 0.15 + Math.random() * 0.7);
      this.bacteria.push(new Bacterium(this, kind, this.freeX(kind, y), y));
    }
  }

  private spawnAtTop(kind: BacteriumKind): void {
    const y = -extentOf(kind);
    this.bacteria.push(new Bacterium(this, kind, this.freeX(kind, y), y));
  }

  /** Тип новой бактерии — случайно, по весам из таблицы, только из уже появившихся типов. */
  private pickKind(): BacteriumKind {
    const kinds = [...this.introduced];
    const total = kinds.reduce((sum, kind) => sum + CONFIG.types[kind].weight, 0);
    if (total <= 0) return kinds[0];
    let roll = Math.random() * total;
    for (const kind of kinds) {
      roll -= CONFIG.types[kind].weight;
      if (roll < 0) return kind;
    }
    return kinds[kinds.length - 1];
  }

  /** Пора ли вводить новый тип: он появляется ОДИН, и какое-то время других новых бактерий нет. */
  private checkIntroductions(): void {
    for (const kind of KINDS_BY_INTRO) {
      if (this.introduced.has(kind) || this.elapsed < CONFIG.types[kind].introSec) continue;
      this.introduced.add(kind);
      this.spawnAtTop(kind);
      this.spawnIn = Math.max(this.spawnIn, CONFIG.spawn.introPauseSec);
      sfx.arrival();
    }
  }

  /** Пауза до следующей бактерии: плавно сокращается от intervalStartSec до intervalEndSec. */
  private nextSpawnInterval(): number {
    const { intervalStartSec, intervalEndSec, rampSec, jitter } = CONFIG.spawn;
    const progress = Math.min(1, this.elapsed / Math.max(rampSec, 0.001));
    const base = intervalStartSec + (intervalEndSec - intervalStartSec) * progress;
    return Math.max(0.05, base * (1 + (Math.random() * 2 - 1) * jitter));
  }

  /** Подбирает место по горизонтали, где новая бактерия не сядет прямо на другую. */
  private freeX(kind: BacteriumKind, y: number): number {
    const extent = extentOf(kind);
    const margin = extent + Math.max(CONFIG.bacteria.wobbleAmplitude, CONFIG.types[kind].zigzagPx) + 8;
    let best = W / 2;
    let bestGap = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Phaser.Math.Between(margin, W - margin);
      let gap = Infinity;
      for (const b of this.bacteria) gap = Math.min(gap, Math.hypot(b.x - x, b.y - y) - b.boundingRadius - extent);
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
   * таблетка не «пролетала сквозь») касается любого из кругов, из которых состоит тело бактерии.
   */
  private resolveHits(): void {
    const halfWidth = CONFIG.pill.width / 2;
    const survivors: Pill[] = [];

    for (const pill of this.pills) {
      const top = pill.y - CONFIG.pill.height / 2;
      const bottom = pill.prevY + CONFIG.pill.height / 2;

      let target: Bacterium | undefined;
      for (const b of this.bacteria) {
        const touches = b.circles().some((c) => {
          // ближайшая к центру круга точка таблетки
          const nearestX = Phaser.Math.Clamp(c.x, pill.x - halfWidth, pill.x + halfWidth);
          const nearestY = Phaser.Math.Clamp(c.y, top, bottom);
          return (c.x - nearestX) ** 2 + (c.y - nearestY) ** 2 <= c.r ** 2;
        });
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

  /**
   * Попадание: вспышка, «+очки», короткий звук. Если HP кончилось — бактерия уничтожена (частицы),
   * а делящаяся ещё и распадается на два кокка (лёгкая тряска экрана).
   */
  private onHit(bacterium: Bacterium): void {
    this.hits++;
    const cfg = CONFIG.types[bacterium.kind];
    const destroyed = bacterium.hit(CONFIG.pill.damage);
    const gained = destroyed ? cfg.points : cfg.hitPoints;
    this.score += gained;
    this.scoreText.setText(t('score', { n: this.score }));

    const { x, y } = bacterium;
    this.effects.flash(x, y, bacterium.boundingRadius * 0.85);
    if (gained > 0) this.effects.popup(x, y - bacterium.boundingRadius * 0.3, gained, bacterium.kind);

    if (!destroyed) {
      sfx.hit(bacterium.kind);
      return;
    }
    this.kills++;
    this.effects.burst(x, y, bacterium.kind);
    if (SPLITS_INTO[bacterium.kind]) {
      this.splits++;
      this.effects.shake();
      sfx.split();
    } else {
      sfx.destroy();
    }
    this.divide(bacterium);
  }

  /** Делящаяся, до которой давно не добрались, делится сама (без очков). */
  private splitNeglected(): void {
    for (const bacterium of [...this.bacteria]) {
      if (!bacterium.readyToSplit || this.bacteria.length >= CONFIG.split.maxOnScreen) continue;
      this.selfSplits++;
      this.effects.flash(bacterium.x, bacterium.y, bacterium.boundingRadius * 0.85);
      this.effects.shake();
      sfx.selfSplit();
      this.divide(bacterium);
    }
  }

  /** Убирает бактерию; если она распадается, на её месте появляются «дети», разлетающиеся в стороны. */
  private divide(parent: Bacterium): void {
    this.bacteria = this.bacteria.filter((b) => b !== parent);
    parent.destroy();

    const child = SPLITS_INTO[parent.kind];
    if (!child) return;
    const offset = CONFIG.types[child].radius * 0.8;
    const kick = CONFIG.split.kickSpeed;
    this.bacteria.push(
      new Bacterium(this, child, Phaser.Math.Clamp(parent.x - offset, 0, W), parent.y, -kick),
      new Bacterium(this, child, Phaser.Math.Clamp(parent.x + offset, 0, W), parent.y, kick),
    );
  }

  /** Бактерии, коснувшиеся красной линии, исчезают и отнимают жизни; жизни кончились — проигрыш. */
  private resolveLine(): void {
    let damage = 0;
    for (const bacterium of [...this.bacteria]) {
      if (bacterium.bottom < LOSE_LINE_Y) continue;
      damage += CONFIG.types[bacterium.kind].lifeDamage;
      this.bacteria = this.bacteria.filter((b) => b !== bacterium);
      bacterium.destroy();
    }
    if (damage === 0) return;

    this.lives = Math.max(0, this.lives - damage);
    this.drawHearts();
    this.effects.lifeLost(LOSE_LINE_Y);
    sfx.lifeLost();
    if (this.lives <= 0) this.endGame();
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
    this.hearts = this.add.graphics().setDepth(5);
    this.drawHearts();
  }

  /** Жизни: сердечки по центру сверху; потерянные — тёмные. */
  private drawHearts(): void {
    const total = CONFIG.lives.start;
    const gap = 66;
    this.hearts.clear();
    for (let i = 0; i < total; i++) {
      const cx = W / 2 + (i - (total - 1) / 2) * gap;
      const cy = 58;
      this.hearts.fillStyle(i < this.lives ? COLORS.heart : COLORS.heartLost, 1);
      this.hearts.fillCircle(cx - 12, cy - 6, 14);
      this.hearts.fillCircle(cx + 12, cy - 6, 14);
      this.hearts.fillTriangle(cx - 25, cy - 1, cx + 25, cy - 1, cx, cy + 28);
    }
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
      lives: this.lives,
      maxLives: CONFIG.lives.start,
      introduced: [...this.introduced],
      shots: this.shots,
      elapsed: this.elapsed,
      level: this.level,
      lang: document.documentElement.lang,
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
      tapListeners: this.tapListeners,
      width: W,
      height: H,
      loseLineY: LOSE_LINE_Y,
      bacteria: this.bacteria.map((b) => ({
        x: b.x,
        y: b.y,
        r: b.boundingRadius,
        bottom: b.bottom,
        age: b.age,
        kind: b.kind,
        hp: b.hp,
        maxHp: b.maxHp,
      })),
      pills: this.pills.map((p) => ({ x: p.x, y: p.y })),
      effects: {
        flashes: this.effects.flashes,
        bursts: this.effects.bursts,
        popups: this.effects.popups,
        shakes: this.effects.shakes,
        lifeLosses: this.effects.lifeLosses,
      },
      sound: { state: sfx.state, played: sfx.played },
    };
  }
}
