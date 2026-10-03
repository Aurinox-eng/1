import Phaser from 'phaser';
import { artImage, bakeArt, squareBox } from '../art';
import { COLORS } from '../theme';

/** Рамка рисунка капли (хвост тянется влево до −27). */
const DROP_BOX = squareBox(30);

/** Капля сиропа, летящая в точку дорожки (не за бактерией): по прилёте сцена кладёт на это место лужу. */
export class GroundShot {
  x: number;
  y: number;
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    /** Куда летит и что получится на месте (лужа). */
    readonly tx: number,
    readonly ty: number,
    private readonly speed: number,
    readonly puddle: { radius: number; seconds: number; slowFactor: number; slowSec: number; poison: number },
  ) {
    this.x = x;
    this.y = y;
    const key = bakeArt(scene, 'shot-ground', DROP_BOX, (gfx) => {
      gfx.fillStyle(COLORS.syrup, 1).fillCircle(0, 0, 11).fillCircle(-14, 0, 7).fillCircle(-23, 0, 3.5);
      gfx.lineStyle(2, COLORS.syrupDark, 1).strokeCircle(0, 0, 11);
      gfx.fillStyle(0xffffff, 0.6).fillCircle(3, -4, 3);
    });
    this.container = scene.add.container(x, y, [artImage(scene, key, DROP_BOX)]).setRotation(Math.atan2(ty - y, tx - x));
    layer.add(this.container);
  }

  /** Двигает каплю; true — долетела. */
  update(dt: number): boolean {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (distance <= step) {
      this.x = this.tx;
      this.y = this.ty;
      return true;
    }
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
    this.container.setPosition(this.x, this.y);
    return false;
  }

  destroy(): void {
    this.container.destroy();
  }
}
