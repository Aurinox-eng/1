import Phaser from 'phaser';
import { CONFIG } from '../config';
import { drawBody, SPLITTER_LOBE_OFFSET } from './bacteriumArt';

const W = CONFIG.screen.width;

export type BacteriumKind = keyof typeof CONFIG.types;
export const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];

/** Круг, из которых состоит «тело» для попаданий: палочка — цепочка из трёх, делящаяся — из двух. */
export interface HitCircle {
  x: number;
  y: number;
  r: number;
}

/** Радиус описанного круга типа (от центра до самой дальней точки), без учёта раздвижения долей. */
export function extentOf(kind: BacteriumKind): number {
  const { radius, length } = CONFIG.types[kind];
  if (kind === 'rod') return length / 2;
  if (kind === 'splitter') return radius * (1 + SPLITTER_LOBE_OFFSET);
  return radius;
}

/** Максимальный наклон палочки при зигзаге, радианы. */
const MAX_TILT = 0.55;

/**
 * Бактерия любого из пяти типов. Поведение задаётся таблицей `types` в config.ts:
 * кокк падает прямо, палочка — зигзагом, делящаяся делится сама, бронированная толстая и медленная,
 * спора быстрая. HP видно на самой бактерии: оболочка истончается и появляются трещины.
 */
export class Bacterium {
  readonly kind: BacteriumKind;
  readonly maxHp: number;
  hp: number;
  x: number;
  y: number;
  /** Сколько секунд бактерия живёт на поле. */
  age = 0;
  /** Сколько секунд бактерию не задевали (по нему делится сама делящаяся). */
  untouched = 0;

  private readonly cfg: (typeof CONFIG.types)[BacteriumKind];
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private baseX: number;
  /** Скорость бокового разлёта после деления (затухает). */
  private vx: number;
  private readonly fallFactor: number;
  private readonly phase = Math.random();
  private readonly seed = Math.random() * Math.PI * 2;
  private rot = 0;
  private spread = 0;
  private dirty = true;

  /**
   * @param kickVx боковая скорость разлёта (для «детей» после деления), пикселей в секунду
   */
  constructor(scene: Phaser.Scene, kind: BacteriumKind, x: number, y: number, kickVx = 0) {
    this.kind = kind;
    this.cfg = CONFIG.types[kind];
    this.maxHp = this.cfg.hp;
    this.hp = this.cfg.hp;
    this.fallFactor = 1 + (Math.random() * 2 - 1) * CONFIG.bacteria.speedSpread;
    this.vx = kickVx;
    this.x = x;
    this.y = y;
    // Так, чтобы в первый момент бактерия оказалась ровно там, где её создали (с учётом колебания)
    this.baseX = x - this.lateralAt(0);

    this.gfx = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.gfx]);
    this.redraw();
  }

  /** @param dt секунды с прошлого кадра; @param levelFactor множитель скорости от уровня сложности */
  update(dt: number, levelFactor: number): void {
    this.age += dt;
    this.untouched += dt;
    const fall = CONFIG.bacteria.startSpeed * this.cfg.speedFactor * this.fallFactor * levelFactor;
    this.y += fall * dt;

    // Боковой разлёт после деления: затухает и отскакивает от стенок поля
    if (this.vx !== 0) {
      this.baseX += this.vx * dt;
      this.vx *= Math.exp(-CONFIG.split.kickDecay * dt);
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }
    const margin = this.sideExtent() + this.lateralAmplitude();
    if (this.baseX < margin) {
      this.baseX = margin;
      this.vx = Math.abs(this.vx);
    } else if (this.baseX > W - margin) {
      this.baseX = W - margin;
      this.vx = -Math.abs(this.vx);
    }
    this.x = this.baseX + this.lateralAt(this.age);

    // Палочка наклоняется по направлению движения
    if (this.cfg.zigzagPx > 0) {
      const lateralSpeed = this.zigzagSlope(this.age) * ((4 * this.cfg.zigzagPx) / this.cfg.zigzagSec);
      const target = -Math.atan2(lateralSpeed, fall);
      const clamped = Math.max(-MAX_TILT, Math.min(MAX_TILT, target));
      this.rot += (clamped - this.rot) * Math.min(1, dt * 12);
    }

    this.updateSelfSplitWarning();
    if (this.dirty) this.redraw();
    this.container.setPosition(this.x, this.y).setRotation(this.rot);
  }

  /** Попадание. Возвращает true, если бактерия уничтожена. Любое попадание сбрасывает отсчёт самоделения. */
  hit(damage: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.untouched = 0;
    this.dirty = true;
    return this.hp <= 0;
  }

  /** Пора ли делиться самой: у делящейся её не трогали selfSplitSec секунд. */
  get readyToSplit(): boolean {
    return this.cfg.selfSplitSec > 0 && this.untouched >= this.cfg.selfSplitSec;
  }

  /** Круги, из которых состоит тело, в координатах поля — по ним считаются попадания. */
  circles(): HitCircle[] {
    const { radius, length } = this.cfg;
    if (this.kind === 'rod') {
      const step = Math.max(0, length / 2 - radius);
      const dx = -Math.sin(this.rot);
      const dy = Math.cos(this.rot);
      return [-step, 0, step].map((o) => ({ x: this.x + dx * o, y: this.y + dy * o, r: radius }));
    }
    if (this.kind === 'splitter') {
      const off = radius * SPLITTER_LOBE_OFFSET + this.spread;
      return [-off, off].map((o) => ({ x: this.x + o, y: this.y, r: radius }));
    }
    return [{ x: this.x, y: this.y, r: radius }];
  }

  /** Нижняя точка бактерии — по ней проверяем касание красной линии. */
  get bottom(): number {
    return Math.max(...this.circles().map((c) => c.y + c.r));
  }

  /** Радиус описанного круга (от центра до самой дальней точки). */
  get boundingRadius(): number {
    return extentOf(this.kind) + (this.kind === 'splitter' ? this.spread : 0);
  }

  destroy(): void {
    this.container.destroy();
  }

  // ---------------------------------------------------------------- внутреннее

  /** На сколько тело выступает вбок от центра (чтобы не вылезти за стенку поля). */
  private sideExtent(): number {
    if (this.kind === 'rod') return this.cfg.radius + this.cfg.length * 0.25;
    if (this.kind === 'splitter') return this.cfg.radius * (1 + SPLITTER_LOBE_OFFSET) + 16;
    return this.cfg.radius;
  }

  private lateralAmplitude(): number {
    return this.cfg.zigzagPx > 0 ? this.cfg.zigzagPx : CONFIG.bacteria.wobbleAmplitude;
  }

  /** Треугольная волна от -1 до 1 (резкий зигзаг, а не плавное покачивание). */
  private zigzagPhase(age: number): number {
    const u = age / this.cfg.zigzagSec + this.phase;
    return u - Math.floor(u);
  }

  /** Куда сейчас движется палочка: -1 влево, +1 вправо. */
  private zigzagSlope(age: number): number {
    return this.zigzagPhase(age) < 0.5 ? -1 : 1;
  }

  /** Смещение по горизонтали от линии падения в момент age. */
  private lateralAt(age: number): number {
    if (this.cfg.zigzagPx > 0) {
      const tri = 4 * Math.abs(this.zigzagPhase(age) - 0.5) - 1;
      return this.cfg.zigzagPx * tri;
    }
    const { wobbleAmplitude, wobbleSpeed } = CONFIG.bacteria;
    return Math.sin(age * wobbleSpeed + this.phase * Math.PI * 2) * wobbleAmplitude;
  }

  /** Перед самоделением делящаяся пульсирует и растягивается — игрок успевает среагировать. */
  private updateSelfSplitWarning(): void {
    if (this.cfg.selfSplitSec <= 0) return;
    const left = this.cfg.selfSplitSec - this.untouched;
    const warning = left <= CONFIG.split.warnSec;
    const spread = warning ? 4 + (1 - Math.max(left, 0) / CONFIG.split.warnSec) * 14 : 0;
    if (spread !== this.spread) {
      this.spread = spread;
      this.dirty = true;
    }
    this.container.setScale(warning ? 1 + 0.06 * Math.sin(this.age * 24) : 1);
  }

  private redraw(): void {
    drawBody(this.gfx, this.kind, { hp: this.hp, maxHp: this.maxHp, spread: this.spread, seed: this.seed });
    this.dirty = false;
  }
}
