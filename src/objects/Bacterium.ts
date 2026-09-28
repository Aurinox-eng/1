import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

/** Бактерия: медленно падает сверху вниз, слегка покачиваясь. */
export class Bacterium {
  readonly radius = CONFIG.bacteria.radius;
  readonly shape: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  /** Сколько секунд бактерия живёт на поле. */
  age = 0;

  private readonly baseX: number;
  private readonly speedFactor: number;
  private readonly wobblePhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, x: number) {
    const { speedSpread } = CONFIG.bacteria;
    this.baseX = x;
    this.x = x;
    this.y = -this.radius;
    this.speedFactor = 1 + (Math.random() * 2 - 1) * speedSpread;

    this.shape = scene.add
      .circle(this.x, this.y, this.radius, COLORS.bacteria)
      .setStrokeStyle(5, COLORS.bacteriaEdge);
  }

  /** @param dt секунды с прошлого кадра; @param levelFactor множитель скорости от уровня сложности */
  update(dt: number, levelFactor: number): void {
    const { startSpeed, wobbleAmplitude, wobbleSpeed } = CONFIG.bacteria;
    this.age += dt;
    this.y += startSpeed * this.speedFactor * levelFactor * dt;
    this.x = this.baseX + Math.sin(this.age * wobbleSpeed + this.wobblePhase) * wobbleAmplitude;
    this.shape.setPosition(this.x, this.y);
  }

  /** Нижняя точка бактерии — по ней проверяем касание красной линии. */
  get bottom(): number {
    return this.y + this.radius;
  }

  /** Короткая вспышка при попадании, потом объект удаляется. */
  pop(): void {
    this.shape.setFillStyle(COLORS.hit);
    this.shape.scene.tweens.add({
      targets: this.shape,
      scale: 1.5,
      alpha: 0,
      duration: 160,
      onComplete: () => this.shape.destroy(),
    });
  }

  destroy(): void {
    this.shape.destroy();
  }
}
