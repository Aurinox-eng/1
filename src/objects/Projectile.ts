import Phaser from 'phaser';
import { artImage, bakeArt, squareBox } from '../art';
import { CONFIG } from '../config';
import { COLORS } from '../theme';
import type { TowerStats } from '../towerStats';
import type { Bacterium } from './Bacterium';
import type { TowerId } from './Tower';

/** Рамка рисунка снаряда (капля сиропа тянется хвостом влево до −26). */
const SHOT_BOX = squareBox(28);

/** Рисует снаряд башни: таблетка (капсула), капля сиропа, шарик шипучки. Вправо, потом поворачивается по полёту. */
function drawShot(gfx: Phaser.GameObjects.Graphics, id: TowerId): void {
  if (id === 'syrup') {
    gfx.fillStyle(COLORS.syrup, 1).fillCircle(0, 0, 10).fillCircle(-13, 0, 6.5).fillCircle(-22, 0, 3.5);
    gfx.lineStyle(2, COLORS.syrupDark, 1).strokeCircle(0, 0, 10);
    gfx.fillStyle(0xffffff, 0.6).fillCircle(3, -3.5, 3);
  } else if (id === 'fizz') {
    gfx.fillStyle(COLORS.fizz, 1).fillCircle(0, 0, 14);
    gfx.lineStyle(2.5, COLORS.fizzDark, 1).strokeCircle(0, 0, 14);
    gfx.fillStyle(0xffffff, 0.85).fillCircle(-4, -5, 3.5).fillCircle(4, 5, 2.5).fillCircle(5, -4, 2);
  } else {
    gfx.fillStyle(COLORS.pill, 1).fillRoundedRect(-15, -5, 30, 10, 5);
    gfx.lineStyle(1.5, COLORS.pillEdge, 1).strokeRoundedRect(-15, -5, 30, 10, 5);
    gfx.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(0, -5, 15, 10, { tl: 0, bl: 0, tr: 5, br: 5 });
  }
}

/** Снаряд (таблетка, капля сиропа, шарик шипучки): летит за своей целью. Если цель уже уничтожена другим выстрелом, долетает до последнего её места и исчезает. */
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
    /** Какая башня выстрелила: по ней сцена берёт урон, замедление и взрыв из таблицы `towers`. */
    readonly towerId: TowerId,
    private readonly speed: number,
    /** Числа башни на момент выстрела (уровень и мутации): снаряд в полёте не меняется, даже если башню слили или продали. */
    readonly stats: TowerStats,
  ) {
    this.x = x;
    this.y = y;
    this.lastX = target.x;
    this.lastY = target.y;
    const key = bakeArt(scene, `shot-${towerId === 'syrup' || towerId === 'fizz' ? towerId : 'pill'}`, SHOT_BOX, (g) => drawShot(g, towerId));
    // Снаряд сильной башни крупнее: до ×1,7 при уроне в 6 раз выше, чем у башни 1-го уровня (сила видна на глаз)
    const ratio = stats.damage / CONFIG.towers[towerId].damage;
    const size = ratio > 1 ? Math.min(1.7, 1 + 0.28 * Math.log2(ratio)) : 1;
    this.container = scene.add.container(x, y, [artImage(scene, key, SHOT_BOX)]).setScale(size);
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
