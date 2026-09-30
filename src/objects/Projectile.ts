import Phaser from 'phaser';
import { COLORS } from '../theme';
import type { Bacterium } from './Bacterium';

/** Таблетка-снаряд: летит за своей целью. Если цель уже уничтожена другим выстрелом, долетает до последнего её места и исчезает. */
export class Projectile {
  x: number;
  y: number;
  private lastX: number;
  private lastY: number;
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    readonly target: Bacterium,
    readonly damage: number,
    private readonly speed: number,
  ) {
    this.x = x;
    this.y = y;
    this.lastX = target.x;
    this.lastY = target.y;
    const gfx = scene.add.graphics();
    gfx.fillStyle(COLORS.pill, 1).fillRoundedRect(-15, -5, 30, 10, 5);
    gfx.lineStyle(1.5, COLORS.pillEdge, 1).strokeRoundedRect(-15, -5, 30, 10, 5);
    gfx.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(0, -5, 15, 10, { tl: 0, bl: 0, tr: 5, br: 5 });
    this.container = scene.add.container(x, y, [gfx]);
    layer.add(this.container);
  }

  /** Двигает снаряд. Возвращает 'hit' — попал в цель, 'gone' — цели уже нет, снаряд долетел до пустого места, 'flying' — летит. */
  update(dt: number): 'flying' | 'hit' | 'gone' {
    const alive = this.target.hp > 0;
    if (alive) {
      this.lastX = this.target.x;
      this.lastY = this.target.y;
    }
    const dx = this.lastX - this.x;
    const dy = this.lastY - this.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * dt;
    // «Попал» — когда до центра осталось меньше радиуса бактерии, иначе быстрый снаряд пролетал бы мимо
    if (distance <= step || distance <= (alive ? this.target.radius * 0.6 : 4)) {
      this.x = this.lastX;
      this.y = this.lastY;
      return alive ? 'hit' : 'gone';
    }
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
    this.container.setPosition(this.x, this.y).setRotation(Math.atan2(dy, dx));
    return 'flying';
  }

  destroy(): void {
    this.container.destroy();
  }
}
