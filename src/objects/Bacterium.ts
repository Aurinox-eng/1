import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

const W = CONFIG.screen.width;

export type BacteriumSize = keyof typeof CONFIG.sizes;

/** Во что превращается бактерия при делении. У малой следующего размера нет — она погибает. */
export const NEXT_SIZE: Record<BacteriumSize, BacteriumSize | null> = {
  large: 'medium',
  medium: 'small',
  small: null,
};

/** Бактерия: падает сверху вниз, покачиваясь; при делении «дети» разлетаются в стороны. */
export class Bacterium {
  readonly size: BacteriumSize;
  readonly radius: number;
  readonly points: number;
  readonly shape: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  /** Сколько секунд бактерия живёт на поле. */
  age = 0;

  private baseX: number;
  /** Скорость бокового разлёта после деления (затухает). */
  private vx: number;
  private readonly fallFactor: number;
  private readonly wobblePhase = Math.random() * Math.PI * 2;
  /** Возраст, в котором бактерия разделится сама (Infinity — сама не делится). */
  private readonly selfSplitAt: number;
  private warning = false;

  /**
   * @param kickVx боковая скорость разлёта (для «детей» после деления), пикселей в секунду
   */
  constructor(scene: Phaser.Scene, size: BacteriumSize, x: number, y: number, kickVx = 0) {
    const cfg = CONFIG.sizes[size];
    this.size = size;
    this.radius = cfg.radius;
    this.points = cfg.points;
    this.fallFactor = cfg.speedFactor * (1 + (Math.random() * 2 - 1) * CONFIG.bacteria.speedSpread);
    this.selfSplitAt = cfg.selfSplitSec > 0 ? cfg.selfSplitSec : Infinity;
    this.vx = kickVx;

    // Так, чтобы в первый момент бактерия оказалась ровно там, где её создали (с учётом покачивания)
    this.baseX = x - Math.sin(this.wobblePhase) * CONFIG.bacteria.wobbleAmplitude;
    this.x = x;
    this.y = y;

    this.shape = scene.add
      .circle(x, y, this.radius, COLORS.bacteria[size])
      .setStrokeStyle(5, COLORS.bacteriaEdge);
  }

  /** @param dt секунды с прошлого кадра; @param levelFactor множитель скорости от уровня сложности */
  update(dt: number, levelFactor: number): void {
    const { startSpeed, wobbleAmplitude, wobbleSpeed } = CONFIG.bacteria;
    this.age += dt;
    this.y += startSpeed * this.fallFactor * levelFactor * dt;

    // Боковой разлёт после деления: затухает и отскакивает от стенок поля
    if (this.vx !== 0) {
      this.baseX += this.vx * dt;
      this.vx *= Math.exp(-CONFIG.split.kickDecay * dt);
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }
    const min = this.radius + wobbleAmplitude;
    const max = W - this.radius - wobbleAmplitude;
    if (this.baseX < min) {
      this.baseX = min;
      this.vx = Math.abs(this.vx);
    } else if (this.baseX > max) {
      this.baseX = max;
      this.vx = -Math.abs(this.vx);
    }
    this.x = this.baseX + Math.sin(this.age * wobbleSpeed + this.wobblePhase) * wobbleAmplitude;

    this.shape.setPosition(this.x, this.y);
    this.updateWarning();
  }

  /** Пора ли делиться самой (бактерию давно не трогали). */
  get readyToSplit(): boolean {
    return this.age >= this.selfSplitAt;
  }

  /** Нижняя точка бактерии — по ней проверяем касание красной линии. */
  get bottom(): number {
    return this.y + this.radius;
  }

  /** Перед самоделением бактерия подрагивает и желтеет — игрок успевает среагировать. */
  private updateWarning(): void {
    const left = this.selfSplitAt - this.age;
    if (left > CONFIG.split.warnSec) return;
    if (!this.warning) {
      this.warning = true;
      this.shape.setStrokeStyle(7, COLORS.warn);
    }
    this.shape.setScale(1 + 0.07 * Math.sin(this.age * 26));
  }

  destroy(): void {
    this.shape.destroy();
  }
}
