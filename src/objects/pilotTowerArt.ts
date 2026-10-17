import Phaser from 'phaser';
import { bakeCanvasArt, type ArtBox } from '../art';
import { COLORS, TOWER_ART } from '../theme';

/**
 * Пилот этапа 8 (17 октября 2026): новый рисунок Таблетки 1-го и 4-го уровня и Сиропа 1-го уровня — объём, мягкие тени, глаза у таблеток (docs/art-style.md).
 * Рисуется стандартным Canvas 2D (bakeCanvasArt) один раз в картинку. Геометрия — прежняя: дуло там, где точка вылета снаряда (MUZZLE, MUZZLE_PER_LEVEL в Tower.ts),
 * знаки уровня (кольцо и точки под башней) рисует прежний topTexture. Прежние функции рисования остаются в Tower.ts до утверждения стиля.
 */

const A = TOWER_ART;

/** Входит ли башня этого вида и уровня в пилот: Таблетка 1 и 4 уровня, Сироп 1 уровня. */
export function isPilotTower(id: string, level: number): boolean {
  return (id === 'pill' && (level === 1 || level === 4)) || (id === 'syrup' && level === 1);
}

// ---------------------------------------------------------------- цвет и фигуры

const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (c: number, to: number, k: number): number => {
  const [r, g, b] = channels(c);
  const [r2, g2, b2] = channels(to);
  const f = (a: number, z: number): number => Math.round(a + (z - a) * k);
  return (f(r, r2) << 16) | (f(g, g2) << 8) | f(b, b2);
};
const lighten = (c: number, k: number): number => mix(c, 0xffffff, k);
const darken = (c: number, k: number): number => mix(c, 0x000000, k);
const css = (c: number, a = 1): string => {
  const [r, g, b] = channels(c);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

/** Путь скруглённого прямоугольника. */
function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

/** Тень под фигурой: рисует заливку path с мягкой тенью (размеры тени — в пикселях текстуры, поэтому умножаются на плотность d). */
function softShadow(ctx: CanvasRenderingContext2D, d: number, blur: number, offY: number, alpha: number, fill: () => void): void {
  ctx.save();
  ctx.shadowColor = `rgba(3,8,22,${alpha})`;
  ctx.shadowBlur = blur * d;
  ctx.shadowOffsetY = offY * d;
  ctx.fillStyle = '#000';
  fill();
  ctx.restore();
}

/** Вертикальный градиент от y0 до y1. */
function vGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: readonly (readonly [number, number])[]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, color] of stops) g.addColorStop(at, css(color));
  return g;
}

// ---------------------------------------------------------------- основание

/** Круглая площадка башни: объём (свет сверху слева), мягкая тень, ободок и фаска; у Таблетки 4 уровня — кольцо бронепластин. */
function drawBasePilot(ctx: CanvasRenderingContext2D, d: number, id: string, lv: number): void {
  const R = 36;
  softShadow(ctx, d, 9, 4, 0.55, () => {
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
  });
  const grad = ctx.createRadialGradient(-12, -14, 4, 0, 0, R * 1.05);
  grad.addColorStop(0, css(lighten(COLORS.tower, 0.38)));
  grad.addColorStop(0.55, css(COLORS.tower));
  grad.addColorStop(1, css(darken(COLORS.tower, 0.4)));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(COLORS.towerEdge);
  ctx.beginPath();
  ctx.arc(0, 0, R - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  // фаска: светлая кромка и тёмная канавка внутри
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(0, 0, R - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, R - 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.arc(0, 0, R - 4.5, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  if (id === 'pill' && lv === 4) {
    for (let i = 0; i < 8; i++) {
      const a0 = (i * Math.PI) / 4 + 0.08;
      const a1 = a0 + 0.62;
      ctx.lineCap = 'butt';
      ctx.lineWidth = 12;
      ctx.strokeStyle = 'rgba(159,208,255,0.15)';
      ctx.beginPath();
      ctx.arc(0, 0, 27, a0, a1);
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = css(A.plate);
      ctx.beginPath();
      ctx.arc(0, 0, 27, a0, a1);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = css(COLORS.gold);
      ctx.beginPath();
      ctx.arc(0, 0, 31.2, a0, a1);
      ctx.stroke();
    }
  }
}

export function pilotBaseKey(scene: Phaser.Scene, id: string, lv: number, box: ArtBox): string {
  return bakeCanvasArt(scene, `pilot-tower-base-${id}-${lv}`, box, (ctx, d) => drawBasePilot(ctx, d, id, lv));
}

// ---------------------------------------------------------------- ствол

/** Капсула таблетки с объёмом: белая и цветная половины, шов, продольный блик и мягкая тень. */
function capsule(ctx: CanvasRenderingContext2D, d: number, x: number, y: number, w: number, h: number, split: number, blue: number, edge: number, shadow = true): void {
  const r = h / 2;
  if (shadow) {
    softShadow(ctx, d, 6, 1.5, 0.5, () => {
      rrPath(ctx, x, y, w, h, r);
      ctx.fill();
    });
  }
  ctx.save();
  rrPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = vGrad(ctx, y, y + h, [[0, 0xffffff], [0.45, 0xeef2f9], [1, 0xaab6cd]]);
  ctx.fillRect(x, y, split - x, h);
  ctx.fillStyle = vGrad(ctx, y, y + h, [[0, lighten(blue, 0.45)], [0.45, blue], [1, darken(blue, 0.35)]]);
  ctx.fillRect(split, y, x + w - split, h);
  // шов между половинами
  ctx.fillStyle = 'rgba(40,64,110,0.35)';
  ctx.fillRect(split - 0.8, y, 1.6, h);
  // нижняя тень по краю (круглый объём)
  const rim = ctx.createLinearGradient(0, y + h * 0.62, 0, y + h);
  rim.addColorStop(0, 'rgba(10,20,50,0)');
  rim.addColorStop(1, 'rgba(10,20,50,0.28)');
  ctx.fillStyle = rim;
  ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
  ctx.restore();
  // продольный блик
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  rrPath(ctx, x + h * 0.45, y + h * 0.16, Math.max(6, w - h * 1.1), Math.max(2.2, h * 0.14), h * 0.07);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(darken(edge, 0.3));
  rrPath(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawPillBarrel(ctx: CanvasRenderingContext2D, d: number, lv: number): void {
  if (lv <= 1) {
    // Таблетка 1 уровня: крупная капсула — главное тело башни; хвост под центром основания, кончик (дуло) в точке вылета x = 40
    capsule(ctx, d, -34, -17, 74, 34, 8, COLORS.pillBlue, COLORS.pillEdge);
    return;
  }
  // уровень 4: бронепластины, три ствола, светящееся ядро (рисунок и расположение — прежние, в новом стиле)
  for (const s of [-1, 1]) {
    const pts: [number, number][] = [[-2, s * 20], [-24, s * 36], [-20, s * 24], [-34, s * 30], [-12, s * 12]];
    softShadow(ctx, d, 4, 1.5, 0.4, () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    });
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -40, 40, [[0, 0xffffff], [1, mix(A.plate, 0x8fa3c4, 0.5)]]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
  }
  // скоба
  softShadow(ctx, d, 5, 2, 0.45, () => {
    rrPath(ctx, -21, -28, 16, 56, 6);
    ctx.fill();
  });
  ctx.fillStyle = vGrad(ctx, -28, 28, [[0, lighten(A.steelDark, 0.3)], [0.5, A.steelDark], [1, darken(A.steelDark, 0.35)]]);
  rrPath(ctx, -21, -28, 16, 56, 6);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(COLORS.gold);
  ctx.stroke();
  capsule(ctx, d, -2, -29, 46, 15, 20, COLORS.pillBlue, COLORS.goldEdge);
  capsule(ctx, d, -2, 14, 46, 15, 20, COLORS.pillBlue, COLORS.goldEdge);
  // свечение под центральным стволом
  ctx.save();
  ctx.shadowColor = css(COLORS.needle, 0.7);
  ctx.shadowBlur = 14 * d;
  ctx.fillStyle = css(COLORS.needle, 0.35);
  rrPath(ctx, -8, -12, 66, 24, 12);
  ctx.fill();
  ctx.restore();
  capsule(ctx, d, -8, -12, 66, 24, 32, COLORS.pillBlue, COLORS.goldEdge, false);
  // ядро дула
  ctx.save();
  ctx.shadowColor = css(COLORS.needle, 0.9);
  ctx.shadowBlur = 12 * d;
  ctx.fillStyle = vGrad(ctx, -5, 5, [[0, 0xffffff], [0.5, COLORS.needle], [1, darken(COLORS.needle, 0.3)]]);
  rrPath(ctx, 34, -5, 20, 10, 5);
  ctx.fill();
  ctx.restore();
  for (const x of [4, 17, 30]) {
    ctx.fillStyle = vGrad(ctx, -15, 15, [[0, 0xffffff], [1, mix(A.plateLight, 0x9aaccc, 0.45)]]);
    rrPath(ctx, x, -15, 7, 30, 3);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
    ctx.fillStyle = vGrad(ctx, -11, 11, [[0, lighten(COLORS.gold, 0.4)], [1, COLORS.gold]]);
    rrPath(ctx, x + 2, -11, 3, 22, 1);
    ctx.fill();
  }
  // дуло: мягкое свечение и звезда в точке вылета (x = 64)
  const flash = ctx.createRadialGradient(64, 0, 0, 64, 0, 17);
  flash.addColorStop(0, 'rgba(255,255,255,0.85)');
  flash.addColorStop(0.35, css(COLORS.needle, 0.45));
  flash.addColorStop(1, css(COLORS.needle, 0));
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(64, 0, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rad = i % 2 ? 11 * 0.3 : 11;
    ctx.lineTo(64 + Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = css(COLORS.needle);
    ctx.beginPath();
    ctx.arc(43, s * 21.5, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Сироп 1 уровня: стеклянная бутылочка с оранжевым сиропом (видна граница жидкости), горлышко и пробка у дула (x = 36…42). */
function drawSyrupBarrel(ctx: CanvasRenderingContext2D, d: number): void {
  const syrup = COLORS.syrup;
  const dark = COLORS.syrupDark;
  // стекло: корпус и горлышко
  softShadow(ctx, d, 6, 2, 0.5, () => {
    rrPath(ctx, -16, -17, 44, 34, 12);
    ctx.fill();
    rrPath(ctx, 24, -8, 14, 16, 3);
    ctx.fill();
  });
  ctx.save();
  rrPath(ctx, 24, -8, 14, 16, 3);
  ctx.clip();
  ctx.fillStyle = vGrad(ctx, -8, 8, [[0, 0xeef8ff], [1, 0x9ec4dd]]);
  ctx.fillRect(24, -8, 14, 16);
  ctx.restore();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = css(darken(0x9ec4dd, 0.45));
  rrPath(ctx, 24, -8, 14, 16, 3);
  ctx.stroke();
  ctx.save();
  rrPath(ctx, -16, -17, 44, 34, 12);
  ctx.clip();
  ctx.fillStyle = vGrad(ctx, -17, 17, [[0, 0xf4fbff], [0.5, 0xd7ebf7], [1, 0xa9cbe0]]);
  ctx.fillRect(-16, -17, 44, 34);
  // сироп: нижние две трети корпуса с волнистой границей (граница параллельна оси бутылочки)
  const top = -4;
  ctx.beginPath();
  ctx.moveTo(-18, top + 1.5);
  for (let x = -18; x <= 30; x += 2) ctx.lineTo(x, top + Math.sin((x + 18) * 0.34) * 1.6);
  ctx.lineTo(30, 20);
  ctx.lineTo(-18, 20);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, top, 17, [[0, lighten(syrup, 0.3)], [0.4, syrup], [1, darken(syrup, 0.3)]]);
  ctx.fill();
  // светлая линия границы жидкости
  ctx.beginPath();
  for (let x = -16; x <= 28; x += 2) {
    const y = top + Math.sin((x + 18) * 0.34) * 1.6;
    if (x === -16) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(255,240,205,0.9)';
  ctx.stroke();
  // пузырьки
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const [bx, by, br] of [[-6, 8, 1.8], [4, 11, 1.3], [14, 6, 1.5]] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // продольный блик на стекле и обводка
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  rrPath(ctx, -8, -13, 26, 4, 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(darken(0x9ec4dd, 0.45));
  rrPath(ctx, -16, -17, 44, 34, 12);
  ctx.stroke();
  // пробка
  softShadow(ctx, d, 3, 1, 0.4, () => {
    rrPath(ctx, 35, -7, 7, 14, 2.5);
    ctx.fill();
  });
  ctx.fillStyle = vGrad(ctx, -7, 7, [[0, lighten(A.syrupBrown, 0.55)], [0.5, mix(A.syrupBrown, dark, 0.2)], [1, darken(A.syrupBrown, 0.2)]]);
  rrPath(ctx, 35, -7, 7, 14, 2.5);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(darken(A.syrupBrown, 0.5));
  ctx.stroke();
}

export function pilotBarrelKey(scene: Phaser.Scene, id: string, lv: number, box: ArtBox): string {
  return bakeCanvasArt(scene, `pilot-tower-barrel-${id}-${lv}`, box, (ctx, d) => (id === 'pill' ? drawPillBarrel(ctx, d, lv) : drawSyrupBarrel(ctx, d)));
}

// ---------------------------------------------------------------- глаза Таблетки

/** Положение центров белков по уровню: у 1 уровня глаза крупнее, у 4 — меньше (вокруг ядра и короны). */
export const PILL_EYE_POS: Record<number, { x: number; rx: number; ry: number; pupil: number; look: number }> = {
  1: { x: 8.5, rx: 6.3, ry: 6.8, pupil: 2.9, look: 2.2 },
  4: { x: 7.4, rx: 5.1, ry: 5.5, pupil: 2.4, look: 1.7 },
};
const EYES_BOX: ArtBox = { x: -16, y: -16, w: 32, h: 32 };
const PUPIL_BOX: ArtBox = { x: -5, y: -5, w: 10, h: 10 };
export { EYES_BOX, PUPIL_BOX };

/** Белки обоих глаз: мягкий переход, тёмная обводка, маленькая тень от века. Зрачки — отдельные картинки (движутся за целью). */
export function pilotEyesKey(scene: Phaser.Scene, lv: number): string {
  const e = PILL_EYE_POS[lv] ?? PILL_EYE_POS[1];
  return bakeCanvasArt(scene, `pilot-tower-eyes-${lv}`, EYES_BOX, (ctx, d) => {
    for (const s of [-1, 1]) {
      const cx = s * e.x;
      softShadow(ctx, d, 2.5, 0.8, 0.35, () => {
        ctx.beginPath();
        ctx.ellipse(cx, 0, e.rx, e.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(cx - e.rx * 0.3, -e.ry * 0.4, 0, cx, 0, Math.max(e.rx, e.ry) * 1.1);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#d7e1ef');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, 0, e.rx, e.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = css(darken(COLORS.pillBlue, 0.6));
      ctx.stroke();
    }
  });
}

/** Зрачок со светлым бликом (одна картинка на уровень). */
export function pilotPupilKey(scene: Phaser.Scene, lv: number): string {
  const e = PILL_EYE_POS[lv] ?? PILL_EYE_POS[1];
  return bakeCanvasArt(scene, `pilot-tower-pupil-${lv}`, PUPIL_BOX, (ctx) => {
    ctx.fillStyle = '#17202e';
    ctx.beginPath();
    ctx.arc(0, 0, e.pupil, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(-e.pupil * 0.38, -e.pupil * 0.42, e.pupil * 0.36, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------- отдача и облачко при выстреле

/** Отдача: ствол отъезжает назад по своей оси на RECOIL_PX и возвращается за RECOIL_SEC секунд (ручной таймер в Tower.update). */
export const RECOIL_PX = 5;
export const RECOIL_SEC = 0.105;
