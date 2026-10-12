import Phaser from 'phaser';
import { artImage, bakeArt, shCirc, shRR, type ArtBox } from '../art';
import { COLORS, TOWER_ART } from '../theme';
import type { Bacterium } from './Bacterium';

/** Сколько секунд в конце пластырь бледнеет. */
const FADE_SEC = 0.4;

/** Длина пластыря по размеру бактерии: чуть больше тела, но не меньше и не больше предела, пикселей. */
function plasterLength(radius: number): number {
  return Math.round(Math.max(84, Math.min(150, radius * 2 + 44)) / 4) * 4;
}

/**
 * Ловушка Пластыря: телесная липучка на дорожке под приклеенной бактерией (марлевая прокладка посередине, дырочки, красный крестик). Живёт, пока бактерия приклеена
 * (время и урон ведёт сама бактерия, `Bacterium.trap`); погибла или время вышло — пластырь исчезает. Рисунок — одна картинка на длину.
 */
export class Trap {
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    angle: number,
    readonly target: Bacterium,
  ) {
    const len = plasterLength(target.radius);
    const th = Math.round(len * 0.46);
    const box: ArtBox = { x: -len / 2 - 3, y: -th / 2 - 3, w: len + 6, h: th + 6 };
    const key = bakeArt(scene, `trap-${len}`, box, (g) => {
      // липкая полоса
      shRR(g, -len / 2, -th / 2, len, th, th / 2.4, COLORS.patch, COLORS.patchEdge, 3);
      // дырочки для воздуха по краям
      for (const sx of [-1, 1]) {
        for (const dy of [-0.26, 0, 0.26]) {
          shCirc(g, sx * len * 0.36, dy * th, 2.2, TOWER_ART.patchHole);
          shCirc(g, sx * len * 0.27, dy * th * 0.7 + 0, 1.6, TOWER_ART.patchHole);
        }
      }
      // марлевая прокладка
      const pad = th * 0.78;
      shRR(g, -pad / 2, -pad / 2, pad, pad, 5, COLORS.patchPad, COLORS.patchEdge, 2);
      g.lineStyle(2, TOWER_ART.patchRed, 0.9);
      g.lineBetween(-pad * 0.22, 0, pad * 0.22, 0);
      g.lineBetween(0, -pad * 0.22, 0, pad * 0.22);
    });
    this.container = scene.add.container(x, y, [artImage(scene, key, box)]).setRotation(angle).setScale(0.5).setAlpha(0.95);
    layer.add(this.container);
    scene.tweens.add({ targets: this.container, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  /** Жива ли ловушка: бактерия ещё приклеена. Последние мгновения пластырь бледнеет. */
  update(): boolean {
    const left = this.target.trapLeft;
    if (this.target.hp <= 0 || left <= 0) return false;
    if (left < FADE_SEC) this.container.setAlpha(0.95 * Math.max(0, left / FADE_SEC));
    return true;
  }

  destroy(): void {
    this.container.destroy();
  }
}
