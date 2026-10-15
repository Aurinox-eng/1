import Phaser from 'phaser';

/**
 * Фон и «кнопки» правой панели рисуются обычным canvas один раз (градиенты, свечение, скругления) и кладутся в игру картинками:
 * так выглядит одинаково и в WebGL, и в canvas-режиме. Размеры — в пикселях экрана игры.
 */

/** Запас вокруг карточки под свечение и тень, пикселей. */
export const GLOW = 12;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Создаёт canvas-текстуру, если её ещё нет, и рисует в неё `paint`; возвращает ключ. */
function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!texture) return key;
  paint(texture.getContext());
  texture.refresh();
  return key;
}

/** Круглая кнопка (скорость, пауза). */
export function roundButton(scene: Phaser.Scene, r: number): string {
  const size = (r + GLOW) * 2;
  return make(scene, `ui-round-${r}`, size, size, (ctx) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, size / 2 - r, 0, size / 2 + r);
    g.addColorStop(0, '#2b4a86');
    g.addColorStop(1, '#1a3163');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#5f8fd6';
    ctx.stroke();
  });
}

/** Зелёная кнопка «Начать волну»: скругление r (по умолчанию — «таблетка» на всю высоту). */
export function waveButton(scene: Phaser.Scene, w: number, h: number, r: number = h / 2): string {
  return make(scene, `ui-wave-btn-${w}x${h}-${r}`, w + GLOW * 2, h + GLOW * 2, (ctx) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, GLOW, GLOW, w, h, r);
    const g = ctx.createLinearGradient(0, GLOW, 0, GLOW + h);
    g.addColorStop(0, '#3fae5a');
    g.addColorStop(1, '#26803f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, GLOW, GLOW, w, h, r);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#8be5a0';
    ctx.stroke();
  });
}

/** Тёмная плашка под подсказкой или сообщением (скруглённая, полупрозрачная). */
export function drawPlate(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, alpha = 0.72): void {
  g.clear();
  g.fillStyle(0x0b1326, alpha).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  g.lineStyle(2, 0x3a5f9c, 0.8).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
}
