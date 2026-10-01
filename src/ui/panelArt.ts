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

/** Фон всей панели: тёмный вертикальный градиент, светлая линия слева, мягкий узор «клеток». */
export function panelBackground(scene: Phaser.Scene, w: number, h: number): string {
  return make(scene, 'ui-panel-bg', w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#13213f');
    g.addColorStop(0.5, '#0f1a34');
    g.addColorStop(1, '#0a1226');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // мягкий узор: полупрозрачные кружки (как клетки ткани)
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = `rgba(116,184,255,${0.015 + rnd() * 0.03})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 6 + rnd() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // левая граница со свечением
    const edge = ctx.createLinearGradient(0, 0, 14, 0);
    edge.addColorStop(0, 'rgba(116,184,255,0.55)');
    edge.addColorStop(1, 'rgba(116,184,255,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 14, h);
    ctx.fillStyle = '#3c64a0';
    ctx.fillRect(0, 0, 3, h);
  });
}

/** Карточка-подложка (волна, ресурсы): скруглённая, с градиентом, рамкой и светлой кромкой сверху. */
export function card(scene: Phaser.Scene, key: string, w: number, h: number): string {
  return make(scene, key, w + GLOW * 2, h + GLOW * 2, (ctx) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, GLOW, GLOW, w, h, 14);
    const g = ctx.createLinearGradient(0, GLOW, 0, GLOW + h);
    g.addColorStop(0, '#1b3260');
    g.addColorStop(1, '#14264b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, GLOW, GLOW, w, h, 14);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#33578f';
    ctx.stroke();
    // светлая кромка сверху
    ctx.beginPath();
    ctx.moveTo(GLOW + 14, GLOW + 1.5);
    ctx.lineTo(GLOW + w - 14, GLOW + 1.5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(190,220,255,0.22)';
    ctx.stroke();
  });
}

/** Кнопка башни: обычная или выбранная (золотая рамка со свечением). */
export function slot(scene: Phaser.Scene, selected: boolean, w: number, h: number): string {
  return make(scene, selected ? 'ui-slot-on' : 'ui-slot', w + GLOW * 2, h + GLOW * 2, (ctx) => {
    ctx.save();
    if (selected) {
      ctx.shadowColor = 'rgba(255,216,77,0.75)';
      ctx.shadowBlur = 16;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    roundRect(ctx, GLOW, GLOW, w, h, 16);
    const g = ctx.createLinearGradient(0, GLOW, 0, GLOW + h);
    g.addColorStop(0, selected ? '#2a4d8e' : '#1d366a');
    g.addColorStop(1, selected ? '#1e3a72' : '#152a53');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, GLOW, GLOW, w, h, 16);
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeStyle = selected ? '#ffd84d' : '#3a5f9c';
    ctx.stroke();
    if (!selected) {
      ctx.beginPath();
      ctx.moveTo(GLOW + 16, GLOW + 1.5);
      ctx.lineTo(GLOW + w - 16, GLOW + 1.5);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(190,220,255,0.2)';
      ctx.stroke();
    }
  });
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

/** Широкая зелёная кнопка «Начать волну». */
export function waveButton(scene: Phaser.Scene, w: number, h: number): string {
  return make(scene, 'ui-wave-btn', w + GLOW * 2, h + GLOW * 2, (ctx) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, GLOW, GLOW, w, h, h / 2);
    const g = ctx.createLinearGradient(0, GLOW, 0, GLOW + h);
    g.addColorStop(0, '#3fae5a');
    g.addColorStop(1, '#26803f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, GLOW, GLOW, w, h, h / 2);
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
