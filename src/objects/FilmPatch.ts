import Phaser from 'phaser';
import { CONFIG } from '../config';
import { filmPatchImage } from './chapter2Art';

/** Сколько секунд в конце плёнка бледнеет. */
const FADE_SEC = 0.6;

/**
 * Плёнка на дорожке (вид «Плёнка», глава 2; план docs/content-plan-2026-10-26.md, п. 1): остаётся под бактерией `seconds` секунд; бактерия, чей центр в круге плёнки радиуса `radius`,
 * получает от снарядов (`CONFIG.film.towers`) урон ×`CONFIG.film.damageMul` (это решает сцена). Рисунок — вытянутое вдоль дорожки полупрозрачное пятно с бликами (лист главы 2, принят
 * 3 ноября 2026); `wide` — жёлто-серая широкая плёнка мини-босса «Зубной камень». Картинка одна на размер (рисуется один раз), перед исчезновением бледнеет.
 */
export class FilmPatch {
  left: number;
  private readonly image: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly x: number,
    readonly y: number,
    angle: number,
    readonly radius: number,
    seconds: number,
    wide = false,
  ) {
    this.left = seconds;
    const len = Math.round(radius * 2.3);
    const wid = Math.round(Math.min(CONFIG.map.pathWidth * 0.92, radius * 1.4));
    this.image = filmPatchImage(scene, len, wid, wide).setPosition(x, y).setRotation(angle).setAlpha(0);
    layer.add(this.image);
    scene.tweens.add({ targets: this.image, alpha: 1, duration: 220 });
  }

  /** Стоит ли бактерия (её центр) на плёнке. */
  covers(x: number, y: number): boolean {
    return Math.hypot(x - this.x, y - this.y) <= this.radius;
  }

  /** Время вышло? В конце плёнка бледнеет. */
  update(dt: number): boolean {
    this.left -= dt;
    if (this.left < FADE_SEC) this.image.setAlpha(Math.max(0, this.left / FADE_SEC));
    return this.left > 0;
  }

  destroy(): void {
    this.image.destroy();
  }
}
