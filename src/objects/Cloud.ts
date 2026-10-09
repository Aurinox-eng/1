import Phaser from 'phaser';
import { artImage, bakeArt, squareBox } from '../art';
import { COLORS } from '../theme';

/** Сколько секунд в конце облако бледнеет. */
const FADE_SEC = 0.7;

/**
 * Облако токсина: остаётся на месте гибели бактерии `seconds` секунд; башни, чей центр в облаке, не стреляют (это решает сцена).
 * Рисунок — болотно-зелёное полупрозрачное пятно из нескольких перекрывающихся кругов с жёлтыми пузырями и светлой обводкой; перед исчезновением бледнеет.
 */
export class Cloud {
  /** Сколько секунд облако ещё живёт. */
  left: number;
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly x: number,
    readonly y: number,
    readonly radius: number,
    seconds: number,
  ) {
    this.left = seconds;
    // Рисунок — одна картинка на радиус
    const box = squareBox(radius + 4);
    const key = bakeArt(scene, `cloud-${Math.round(radius * 10) / 10}`, box, (g) => {
      g.fillStyle(COLORS.cloud, 0.3).fillCircle(0, 0, radius);
      // «клубы»: перекрывающиеся круги темнее по краям складываются в неровное пятно
      for (const [dx, dy, dr] of [[-0.45, -0.25, 0.5], [0.4, -0.3, 0.45], [0.3, 0.4, 0.5], [-0.35, 0.4, 0.42], [0.0, 0.0, 0.55]] as const) {
        g.fillStyle(COLORS.cloud, 0.2).fillCircle(dx * radius, dy * radius, dr * radius);
      }
      g.lineStyle(3, COLORS.cloudEdge, 0.85).strokeCircle(0, 0, radius);
      // пузыри
      for (const [bx, by, br] of [[-0.5, -0.1, 0.09], [0.15, -0.5, 0.07], [0.45, 0.2, 0.1], [-0.15, 0.45, 0.06], [0.05, 0.05, 0.12], [-0.6, 0.35, 0.05]] as const) {
        g.lineStyle(2.5, COLORS.cloudBubble, 0.85).strokeCircle(bx * radius, by * radius, br * radius);
        g.fillStyle(COLORS.cloudBubble, 0.25).fillCircle(bx * radius, by * radius, br * radius);
      }
    });
    this.container = scene.add.container(x, y, [artImage(scene, key, box)]).setScale(0.4);
    layer.add(this.container);
    scene.tweens.add({ targets: this.container, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  /** Накрывает ли облако точку (центр башни). */
  covers(x: number, y: number): boolean {
    return Math.hypot(x - this.x, y - this.y) <= this.radius;
  }

  /** Время вышло? Последние секунды облако бледнеет. */
  update(dt: number): boolean {
    this.left -= dt;
    if (this.left < FADE_SEC) this.container.setAlpha(Math.max(0, this.left / FADE_SEC));
    return this.left > 0;
  }

  destroy(): void {
    this.container.destroy();
  }
}
