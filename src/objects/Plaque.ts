import Phaser from 'phaser';
import { CONFIG } from '../config';
import { cellKey } from '../level';
import { tileCenter } from '../pathing';
import { plaqueObstacleImage } from './chapter2Art';

/**
 * Налёт на карте (глава 2 «Рот и зубы», план docs/content-plan-2026-10-26.md, раздел 4): закрывает 2–3 клетки под постройку; башни, у которых в зоне нет бактерий, бьют его,
 * и после `CONFIG.obstacles.plaqueHits` ударов он разбит — клетки открываются. Рисунок — по листу главы 2 (принят 3 ноября 2026): целый, треть разбита, две трети разбиты.
 */
export class Plaque {
  hits = 0;
  readonly keys: string[];
  readonly x: number;
  readonly y: number;
  /** Половина длины и ширины прямоугольника налёта, пикселей (для «достаёт ли башня»). */
  readonly halfW: number;
  readonly halfH: number;
  private image: Phaser.GameObjects.Image;
  private stage: 0 | 1 | 2 = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    readonly cells: ReadonlyArray<readonly [number, number]>,
  ) {
    this.keys = cells.map(([c, r]) => cellKey(c, r));
    const pts = cells.map(([c, r]) => tileCenter(c, r));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    this.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const { tile } = CONFIG.map;
    this.halfW = (Math.max(...xs) - Math.min(...xs) + tile) / 2;
    this.halfH = (Math.max(...ys) - Math.min(...ys) + tile) / 2;
    this.image = this.draw();
  }

  get broken(): boolean {
    return this.hits >= CONFIG.obstacles.plaqueHits;
  }

  /** Расстояние от точки (x, y) до прямоугольника налёта, пикселей (0 — внутри). */
  distanceTo(x: number, y: number): number {
    const dx = Math.max(0, Math.abs(x - this.x) - this.halfW);
    const dy = Math.max(0, Math.abs(y - this.y) - this.halfH);
    return Math.hypot(dx, dy);
  }

  /** Один удар башни; возвращает true, если налёт разбит этим ударом. */
  hit(): boolean {
    if (this.broken) return false;
    this.hits++;
    const share = this.hits / CONFIG.obstacles.plaqueHits;
    const stage: 0 | 1 | 2 = share >= 2 / 3 ? 2 : share >= 1 / 3 ? 1 : 0;
    if (this.broken) {
      const img = this.image;
      this.scene.tweens.add({ targets: img, alpha: 0, scale: 1.08, duration: 260, onComplete: () => img.destroy() });
      return true;
    }
    if (stage !== this.stage) {
      this.stage = stage;
      this.image.destroy();
      this.image = this.draw();
    }
    return false;
  }

  private draw(): Phaser.GameObjects.Image {
    const { tile } = CONFIG.map;
    const vertical = this.halfH > this.halfW;
    const img = plaqueObstacleImage(this.scene, this.cells.length, tile - 6, tile, this.stage).setPosition(this.x, this.y);
    if (vertical) img.setRotation(Math.PI / 2);
    this.layer.add(img);
    return img;
  }

  destroy(): void {
    this.image.destroy();
  }
}
