import Phaser from 'phaser';
import { COLORS } from '../theme';
import type { Bacterium } from './Bacterium';
import type { TowerId } from './Tower';

/** Длина светящегося следа за кончиком иглы, пикселей. */
const TAIL = 90;

/**
 * Игла «Шприца»: летит от башни по прямой и проходит НАСКВОЗЬ: каждая бактерия, которую она задела по пути, получает урон
 * (один раз). Кончик иглы летит со скоростью `speed`; бактерия задета, когда линия проходит через её тело, а кончик уже дошёл
 * до неё. Игла исчезает, когда кончик пролетел всю дальность башни.
 */
export class Needle {
  /** Кого игла уже задела (каждую бактерию — один раз). */
  private readonly hit = new Set<Bacterium>();
  private readonly ux: number;
  private readonly uy: number;
  /** Расстояние от центра башни до кончика иглы, пикселей. */
  private tip: number;
  private readonly container: Phaser.GameObjects.Container;

  /**
   * @param ox, oy центр башни
   * @param angle направление выстрела, радианы
   * @param length на какое расстояние от башни бьёт игла (дальность башни), пикселей
   * @param muzzle откуда вылетает кончик (длина ствола), пикселей
   */
  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly ox: number,
    readonly oy: number,
    angle: number,
    readonly length: number,
    muzzle: number,
    readonly towerId: TowerId,
    private readonly speed: number,
  ) {
    this.ux = Math.cos(angle);
    this.uy = Math.sin(angle);
    this.tip = muzzle;
    const gfx = scene.add.graphics();
    gfx.fillStyle(COLORS.needle, 0.3).fillRoundedRect(-TAIL, -5, TAIL, 10, 5);
    gfx.fillStyle(COLORS.needle, 0.8).fillRoundedRect(-TAIL * 0.55, -3.5, TAIL * 0.55, 7, 3.5);
    gfx.fillStyle(0xffffff, 1).fillRoundedRect(-24, -2.5, 24, 5, 2.5).fillCircle(0, 0, 5.5);
    this.container = scene.add.container(ox + this.ux * muzzle, oy + this.uy * muzzle, [gfx]).setRotation(angle);
    layer.add(this.container);
  }

  /** Двигает иглу. Возвращает бактерий, которых она задела в этом кадре, и закончился ли полёт. */
  update(dt: number, bacteria: readonly Bacterium[]): { hits: Bacterium[]; done: boolean } {
    this.tip = Math.min(this.length, this.tip + this.speed * dt);
    const hits: Bacterium[] = [];
    for (const b of bacteria) {
      if (b.hp <= 0 || this.hit.has(b)) continue;
      const vx = b.x - this.ox;
      const vy = b.y - this.oy;
      const along = vx * this.ux + vy * this.uy;
      const across = Math.abs(vx * this.uy - vy * this.ux);
      if (across > b.radius || along - b.radius > this.tip || along < -b.radius) continue;
      this.hit.add(b);
      hits.push(b);
    }
    this.container.setPosition(this.ox + this.ux * this.tip, this.oy + this.uy * this.tip);
    return { hits, done: this.tip >= this.length };
  }

  destroy(): void {
    this.container.destroy();
  }
}
