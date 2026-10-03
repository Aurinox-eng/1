import Phaser from 'phaser';
import { COLORS } from '../theme';
import type { Bacterium } from './Bacterium';

/**
 * Лужа сиропа на дорожке: живёт `seconds` секунд; бактерия, стоящая в луже, замедляется (это делает сцена каждый кадр).
 * Рисунок — тёмно-карамельное полупрозрачное пятно с пузырьками (не оранжевое: оранжевая делящаяся на нём терялась); перед исчезновением бледнеет.
 */
export class Puddle {
  /** Сколько секунд лужа ещё живёт. */
  left: number;
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly x: number,
    readonly y: number,
    readonly radius: number,
    seconds: number,
    /** Замедление в луже: во сколько раз медленнее и сколько секунд держится после выхода из неё. */
    readonly slowFactor: number,
    readonly slowSec: number,
    /** Яд (мутация «Едкая»): сколько HP в секунду теряют все в луже; 0 — лужа не жжёт. */
    readonly poison = 0,
  ) {
    this.left = seconds;
    const g = scene.add.graphics();
    g.fillStyle(poison > 0 ? COLORS.acid : COLORS.puddle, 0.42).fillCircle(0, 0, radius);
    g.fillStyle(0xd9902f, 0.24).fillCircle(-radius * 0.15, -radius * 0.1, radius * 0.7);
    g.lineStyle(3, 0xb8782a, 0.95).strokeCircle(0, 0, radius);
    // пузырьки: фиксированные по месту, чтобы пятно выглядело «липким»
    for (const [bx, by, br] of [[-0.45, -0.2, 0.1], [0.3, -0.45, 0.07], [0.35, 0.3, 0.12], [-0.2, 0.42, 0.06], [0.0, 0.0, 0.08]] as const) {
      g.lineStyle(2, 0xffffff, 0.45).strokeCircle(bx * radius, by * radius, br * radius);
    }
    this.container = scene.add.container(x, y, [g]).setScale(0.3);
    layer.add(this.container);
    scene.tweens.add({ targets: this.container, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  /** Бактерия стоит в луже (её центр не дальше радиуса лужи плюс треть радиуса бактерии). */
  covers(b: Bacterium): boolean {
    return Math.hypot(b.x - this.x, b.y - this.y) <= this.radius + b.radius * 0.35;
  }

  /** Время вышло? Последние секунды лужа бледнеет. */
  update(dt: number): boolean {
    this.left -= dt;
    if (this.left < 1.2) this.container.setAlpha(Math.max(0, this.left / 1.2));
    return this.left > 0;
  }

  destroy(): void {
    this.container.destroy();
  }
}
