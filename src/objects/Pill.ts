import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

/** Таблетка: вылетает снизу и летит строго вверх. */
export class Pill {
  readonly shape: Phaser.GameObjects.Rectangle;
  readonly x: number;
  y: number;
  /** Положение в прошлом кадре — нужно, чтобы быстрая таблетка не «пролетала сквозь» бактерию. */
  prevY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevY = y;
    this.shape = scene.add
      .rectangle(x, y, CONFIG.pill.width, CONFIG.pill.height, COLORS.pill)
      .setStrokeStyle(3, COLORS.pillEdge);
  }

  update(dt: number): void {
    this.prevY = this.y;
    this.y -= CONFIG.pill.speed * dt;
    this.shape.setY(this.y);
  }

  get isOffScreen(): boolean {
    return this.y < -CONFIG.pill.height;
  }

  destroy(): void {
    this.shape.destroy();
  }
}
