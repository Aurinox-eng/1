import Phaser from 'phaser';
import { CONFIG } from './config';

/**
 * Рисунки «один раз в картинку». Бактерии, башни, снаряды и лужи рисуются тем же кодом, что и раньше (команды Graphics), но не
 * каждый кадр, а один раз — в текстуру (generateTexture); на экран выводится готовая картинка (Image). Видеокарте так намного легче:
 * Graphics в WebGL заново разбивает каждую фигуру на треугольники в каждом кадре, а картинка — это один прямоугольник.
 * Готовые картинки хранятся в менеджере текстур игры по ключу и переиспользуются всеми объектами (и после перезапуска уровня).
 */

/** Во сколько раз картинка плотнее мира: при самом сильном приближении камеры рисунок остаётся чётким (как у карты). */
export const ART_DENSITY = CONFIG.camera.zoomMax;

/** Прямоугольник рисунка в его собственных координатах (центр объекта — 0,0): левый верхний угол и размер, пикселей мира. */
export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Квадрат с центром в 0,0 и половиной стороны half. */
export function squareBox(half: number): ArtBox {
  return { x: -half, y: -half, w: half * 2, h: half * 2 };
}

/**
 * Возвращает ключ текстуры с рисунком: при первом обращении рисует его функцией draw (в координатах объекта) в текстуру.
 * density — плотность картинки (по умолчанию ART_DENSITY).
 */
export function bakeArt(scene: Phaser.Scene, key: string, box: ArtBox, draw: (g: Phaser.GameObjects.Graphics) => void, density = ART_DENSITY): string {
  if (scene.textures.exists(key)) return key;
  const g = new Phaser.GameObjects.Graphics(scene);
  g.scaleCanvas(density, density);
  g.translateCanvas(-box.x, -box.y);
  draw(g);
  g.generateTexture(key, Math.max(1, Math.ceil(box.w * density)), Math.max(1, Math.ceil(box.h * density)));
  g.destroy();
  return key;
}

/** Картинка из готовой текстуры, поставленная так, что её точка 0,0 совпадает с центром объекта (как у прежнего рисунка Graphics). */
export function artImage(scene: Phaser.Scene, key: string, box: ArtBox, density = ART_DENSITY): Phaser.GameObjects.Image {
  return scene.add
    .image(0, 0, key)
    .setOrigin(-box.x / box.w, -box.y / box.h)
    .setScale(1 / density);
}

/** Меняет текстуру картинки на другую того же размера-рамки (origin пересчитывается по рамке). */
export function setArt(image: Phaser.GameObjects.Image, key: string, box: ArtBox, density = ART_DENSITY): void {
  image.setTexture(key).setOrigin(-box.x / box.w, -box.y / box.h).setScale(1 / density);
}
