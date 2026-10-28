import Phaser from 'phaser';
import { bakeCanvasArt, type ArtBox } from '../art';
import { COLORS, TOWER_ART, TOWER_MARK } from '../theme';
import { capsule, css, darken, drawBasePilot, lighten, rrPath, softShadow, vGrad } from './pilotTowerArt';

/**
 * Рисунки уровней V–VIII (решение владельца 25 октября 2026, сообщение 2, п. 3): у Таблетки, Сиропа и Шприца свои основание, ствол и верх каждого уровня.
 * Рисуется Canvas 2D один раз в картинку (как pilotTowerArt.ts); глаз нет (поручение владельца 25 октября 2026), тёмной втулки в центре нет — светлая заклёпка (28 октября 2026, сообщение 1, п. 6.2).
 * Пока только лист образцов (`?qa&artsheet=l`, `l2` — остальные семь башен) и стресс-сцена `?qa&stress=high`: в игре слияние — до IV (строки `towerLevels`).
 * У остальных семи башен свой ствол V–VIII не рисуется: ствол IV и свечение цвета уровня за ним (`Tower.ts`), основание, верх и ореол — общие.
 * Цвет уровня: V — бирюзовый, VI — салатовый, VII — алый, VIII — радужный; IV — фиолетовый, дальше серебро, золото. Знаки уровня нарастают:
 *   V — второе кольцо и второй ряд точек, VI — лучи по контуру, VII — ореол (отдельная картинка, вращается целиком), VIII — эмблема вида в центре.
 * Геометрия — как у уровня IV: дуло там же, где у IV (точка вылета снаряда считается по IV), размеры картинок прежние.
 */

const A = TOWER_ART;

/** Виды, у которых есть рисунки V–VIII (остальные башни на V–VIII пока рисуются как IV). */
export function hasHighArt(id: string): boolean {
  return id === 'pill' || id === 'syrup' || id === 'syringe';
}

/** Цвет кольца и акцентов уровня V–VIII; у VIII кольцо радужное, а это — основной золотистый цвет акцентов. */
export const HIGH_ACCENT: Record<number, number> = { 5: 0x2fe0d0, 6: 0x9dea32, 7: 0xff4466, 8: 0xffe27a };
/** Радужные цвета кольца VIII уровня. */
const RAINBOW = [0xff5a5a, 0xffb03a, 0xffe85a, 0x5ae87a, 0x3ac8ff, 0x8a7aff, 0xff6ae0, 0xff5a5a];

/** Размер картинки ореола: центр в центре башни. */
export const HALO_BOX: ArtBox = { x: -58, y: -58, w: 116, h: 116 };

/** Обводка окружности цветом уровня (у VIII — радужная, если браузер умеет конический градиент). */
function strokeRing(ctx: CanvasRenderingContext2D, r: number, width: number, lv: number, alpha = 1): void {
  ctx.lineWidth = width;
  const conic = (ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
  if (lv === 8 && typeof conic === 'function') {
    const grad = conic.call(ctx, 0, 0, 0);
    RAINBOW.forEach((c, i) => grad.addColorStop(i / (RAINBOW.length - 1), css(c, alpha)));
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = css(HIGH_ACCENT[lv], alpha);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Цвет n-го элемента акцента: у V–VII — цвет уровня, у VIII — по кругу радуги. */
export function accentAt(lv: number, i: number): number {
  return lv === 8 ? RAINBOW[i % (RAINBOW.length - 1)] : HIGH_ACCENT[lv];
}

// ---------------------------------------------------------------- основание

function drawHighBase(ctx: CanvasRenderingContext2D, d: number, id: string, lv: number): void {
  drawBasePilot(ctx, d, id, 0);
  const c = HIGH_ACCENT[lv];
  const n = 6 + 2 * (lv - 5); // сегменты: 6, 8, 10, 12
  if (lv >= 7) {
    ctx.save();
    ctx.shadowColor = css(c, 0.8);
    ctx.shadowBlur = 10 * d;
    strokeRing(ctx, 34.5, 2.2, lv, 0.9);
    ctx.restore();
  }
  if (id === 'syrup') {
    // капли по краю: больше с уровнем, обводка цветом уровня
    const drops = 6 + 2 * (lv - 4);
    for (let i = 0; i < drops; i++) {
      const a = (i / drops) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * 31;
      const y = Math.sin(a) * 31;
      ctx.save();
      ctx.shadowColor = css(A.glowOrange, 0.7);
      ctx.shadowBlur = 6 * d;
      ctx.fillStyle = vGrad(ctx, y - 5, y + 5, [[0, lighten(COLORS.syrup, 0.35)], [1, COLORS.syrup]]);
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(lv === 8 ? accentAt(lv, i) : darken(c, 0.2));
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(c, 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (id === 'syringe') {
    // рельсы: радиальные планки вокруг центра, число растёт с уровнем
    const rails = 8 + 2 * (lv - 5);
    for (let i = 0; i < rails; i++) {
      ctx.save();
      ctx.rotate((i / rails) * Math.PI * 2);
      ctx.fillStyle = vGrad(ctx, -2.2, 2.2, [[0, lighten(A.syringeWhite, 0)], [1, A.syringeMetal]]);
      rrPath(ctx, 21, -2.2, 11, 4.4, 1.6);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = css(lv === 8 ? accentAt(lv, i) : c);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  // Таблетка: пластины вокруг центра, число растёт с уровнем; цвет пластин — цвет уровня; у остальных башен — пластины цвета башни
  // (рисунки V–VIII семи башен, решение владельца 28 октября 2026, сообщение 2, п. 2)
  const plate = id === 'pill' ? A.plate : darken(TOWER_MARK[id] ?? A.plate, 0.25);
  for (let i = 0; i < n; i++) {
    const a0 = (i * Math.PI * 2) / n + 0.05;
    const a1 = a0 + (Math.PI * 2 / n) * 0.66;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 12;
    ctx.strokeStyle = css(c, 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, 27, a0, a1);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = css(plate);
    ctx.beginPath();
    ctx.arc(0, 0, 27, a0, a1);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(accentAt(lv, i));
    ctx.beginPath();
    ctx.arc(0, 0, 31.4, a0, a1);
    ctx.stroke();
  }
}

export function highBaseKey(scene: Phaser.Scene, id: string, lv: number, box: ArtBox): string {
  return bakeCanvasArt(scene, `high-tower-base-${id}-${lv}`, box, (ctx, d) => drawHighBase(ctx, d, id, lv));
}

// ---------------------------------------------------------------- ствол: общие части

/** Светящийся шарик/ядро. */
function glowDot(ctx: CanvasRenderingContext2D, d: number, x: number, y: number, r: number, color: number, blur = 10): void {
  ctx.save();
  ctx.shadowColor = css(color, 0.9);
  ctx.shadowBlur = blur * d;
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

/** Многоугольник по точкам. */
function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Узкая полоса поперёк ствола цвета уровня (у VIII — радужная по номеру). */
function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: number): void {
  ctx.fillStyle = vGrad(ctx, y, y + h, [[0, lighten(color, 0.5)], [0.5, color], [1, darken(color, 0.3)]]);
  rrPath(ctx, x, y, w, h, 1.4);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(darken(color, 0.55));
  ctx.stroke();
}

// ---------------------------------------------------------------- ствол: Таблетка

function drawPillHigh(ctx: CanvasRenderingContext2D, d: number, lv: number): void {
  const c = HIGH_ACCENT[lv];
  const edge = darken(c, 0.5);
  const acc = (i: number): number => accentAt(lv, i);
  // крылья-стабилизаторы позади скобы: с VI
  if (lv >= 6) {
    for (const s of [-1, 1]) {
      softShadow(ctx, d, 4, 2, 0.4, () => {
        poly(ctx, [[-20, s * 24], [-46, s * (lv >= 7 ? 46 : 40)], [-34, s * 22], [-44, s * 30], [-24, s * 10]]);
        ctx.fill();
      });
      ctx.fillStyle = vGrad(ctx, -46, 46, [[0, lighten(c, 0.4)], [1, darken(c, 0.2)]]);
      poly(ctx, [[-20, s * 24], [-46, s * (lv >= 7 ? 46 : 40)], [-34, s * 22], [-44, s * 30], [-24, s * 10]]);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(edge);
      ctx.stroke();
    }
  }
  // скоба за куполом: выше, чем у IV
  const H = lv >= 7 ? 40 : 36;
  softShadow(ctx, d, 5, 2, 0.45, () => {
    rrPath(ctx, -21, -H, 16, H * 2, 6);
    ctx.fill();
  });
  ctx.fillStyle = vGrad(ctx, -H, H, [[0, lighten(A.steelDark, 0.3)], [0.5, A.steelDark], [1, darken(A.steelDark, 0.35)]]);
  rrPath(ctx, -21, -H, 16, H * 2, 6);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(c);
  ctx.stroke();
  // внешние стволы (с V) короче и тоньше, внутренние — как у IV
  for (const s of [-1, 1]) {
    capsule(ctx, d, -2, s * 35 - 6, lv >= 6 ? 44 : 36, 12, 18, COLORS.pillBlue, edge);
    band(ctx, 12, s * 35 - 6, 3.4, 12, acc(0));
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.arc(lv >= 6 ? 42 : 34, s * 35, 3, 0, Math.PI * 2);
    ctx.fill();
    capsule(ctx, d, -2, s * 21.5 - 7.5, 46, 15, 22, COLORS.pillBlue, edge);
    band(ctx, 16, s * 21.5 - 7.5, 3.6, 15, acc(1));
    ctx.fillStyle = css(COLORS.needle);
    ctx.beginPath();
    ctx.arc(43, s * 21.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // свечение под центральной капсулой
  ctx.save();
  ctx.shadowColor = css(c, 0.8);
  ctx.shadowBlur = (lv >= 7 ? 18 : 14) * d;
  ctx.fillStyle = css(c, 0.45);
  rrPath(ctx, -6, -14, 70, 28, 14);
  ctx.fill();
  ctx.restore();
  capsule(ctx, d, -6, -14, 70, 28, 34, COLORS.pillBlue, edge, false);
  band(ctx, 22, -14, 4.5, 28, acc(2));
  band(ctx, 46, -14, 4.5, 28, acc(3));
  // катушки вокруг центральной капсулы: с VII
  if (lv >= 7) {
    for (const x of [8, 34]) {
      ctx.save();
      ctx.shadowColor = css(c, 0.9);
      ctx.shadowBlur = 8 * d;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = css(c);
      ctx.beginPath();
      ctx.ellipse(x, 0, 4.2, 17.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  // кольцо дула: с VI
  if (lv >= 6) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(c);
    rrPath(ctx, 52, -9, 8, 18, 3);
    ctx.stroke();
  }
  // ядро дула и вспышка (крупнее с уровнем, но точка вылета остаётся x = 64)
  ctx.save();
  ctx.shadowColor = css(c, 0.95);
  ctx.shadowBlur = 12 * d;
  ctx.fillStyle = vGrad(ctx, -6, 6, [[0, 0xffffff], [0.5, c], [1, darken(c, 0.3)]]);
  rrPath(ctx, 52, -6, 14, 12, 6);
  ctx.fill();
  ctx.restore();
  const fr = 17 + (lv - 4) * 2;
  const flash = ctx.createRadialGradient(64, 0, 0, 64, 0, fr);
  flash.addColorStop(0, 'rgba(255,255,255,0.9)');
  flash.addColorStop(0.35, css(c, 0.5));
  flash.addColorStop(1, css(c, 0));
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(64, 0, fr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const spikes = lv >= 7 ? 16 : 8;
  for (let i = 0; i < spikes; i++) {
    const a = (i * 2 * Math.PI) / spikes;
    const rad = i % 2 ? 11 * 0.3 : 11 + (lv - 5);
    ctx.lineTo(64 + Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  // VIII: золотая корона на скобе
  if (lv === 8) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = s * (6 + i * 10);
        ctx.fillStyle = vGrad(ctx, -4, 4, [[0, lighten(COLORS.gold, 0.5)], [1, darken(COLORS.gold, 0.15)]]);
        poly(ctx, [[-21, y - 4], [-30, y], [-21, y + 4]]);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = css(COLORS.goldEdge);
        ctx.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------- ствол: Сироп

function drawSyrupHigh(ctx: CanvasRenderingContext2D, d: number, lv: number): void {
  const c = HIGH_ACCENT[lv];
  const edge = darken(c, 0.5);
  const dark = COLORS.syrupDark;
  const R = lv >= 6 ? 24 : 22;
  const cx = 6;
  // баки: два (V) или четыре (VI+) с полосами цвета уровня
  const tanks: [number, number, number, number][] = lv >= 6 ? [[-38, -44, 28, 20], [-38, -22, 28, 20], [-38, 2, 28, 20], [-38, 24, 28, 20]] : [[-34, -28, 26, 24], [-34, 4, 26, 24]];
  tanks.forEach(([x, ty, w, th], i) => {
    ctx.save();
    ctx.shadowColor = css(A.glowOrange, 0.6);
    ctx.shadowBlur = 8 * d;
    ctx.fillStyle = vGrad(ctx, ty, ty + th, [[0, lighten(A.tankGold, 0.4)], [0.5, A.tankGold], [1, darken(A.tankGold, 0.35)]]);
    rrPath(ctx, x, ty, w, th, 7);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(c);
    rrPath(ctx, x, ty, w, th, 7);
    ctx.stroke();
    for (const k of [0.33, 0.66]) {
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = css(lv === 8 ? accentAt(lv, i + (k > 0.5 ? 1 : 0)) : c, 0.95);
      ctx.beginPath();
      ctx.moveTo(x + 2, ty + th * k);
      ctx.lineTo(x + w - 2, ty + th * k);
      ctx.stroke();
    }
  });
  // трубка от баков к колбе
  ctx.fillStyle = vGrad(ctx, -4, 4, [[0, lighten(dark, 0.4)], [1, dark]]);
  rrPath(ctx, -10, -4.5, 16, 9, 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(c);
  ctx.stroke();
  // малые колбы-спутники: с VI
  if (lv >= 6) {
    for (const s of [-1, 1]) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = css(dark);
      ctx.beginPath();
      ctx.moveTo(cx, s * (R - 4));
      ctx.lineTo(cx + 12, s * 34);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = css(A.glowOrange, 0.7);
      ctx.shadowBlur = 8 * d;
      ctx.fillStyle = vGrad(ctx, s * 34 - 9, s * 34 + 9, [[0, lighten(COLORS.syrup, 0.4)], [1, darken(COLORS.syrup, 0.2)]]);
      ctx.beginPath();
      ctx.arc(cx + 14, s * 36, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = css(c);
      ctx.beginPath();
      ctx.arc(cx + 14, s * 36, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(cx + 11, s * 36 - 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // сопла веером: 5 (V, VI), 7 (VII, VIII)
  const n = lv >= 7 ? 7 : 5;
  const spread = lv >= 7 ? 66 : 54;
  for (let i = 0; i < n; i++) {
    const deg = -spread + (2 * spread * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    const len = i === (n - 1) / 2 ? 30 : 24;
    ctx.save();
    ctx.translate(cx + R - 2, 0);
    ctx.rotate(a);
    softShadow(ctx, d, 3, 1.5, 0.45, () => {
      rrPath(ctx, 0, -4.5, len, 9, 2);
      ctx.fill();
    });
    ctx.fillStyle = vGrad(ctx, -4.5, 4.5, [[0, lighten(dark, 0.5)], [1, dark]]);
    rrPath(ctx, 0, -4.5, len, 9, 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = css(A.syrupBrown);
    ctx.stroke();
    ctx.fillStyle = vGrad(ctx, -6, 6, [[0, lighten(COLORS.gold, 0.5)], [1, darken(COLORS.gold, 0.15)]]);
    rrPath(ctx, len - 5, -6, 6, 12, 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
    ctx.fillStyle = css(lv === 8 ? accentAt(lv, i) : A.syrupSoft);
    ctx.beginPath();
    ctx.arc(len + 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // колба
  ctx.save();
  ctx.shadowColor = css(A.glowOrange, 0.8);
  ctx.shadowBlur = 14 * d;
  ctx.fillStyle = css(COLORS.syrup);
  ctx.beginPath();
  ctx.arc(cx, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, 0, R - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = vGrad(ctx, -R, R, [[0, 0xfff4e0], [0.35, lighten(COLORS.syrup, 0.45)], [1, darken(COLORS.syrup, 0.1)]]);
  ctx.fillRect(cx - R, -R, R * 2, R * 2);
  // жидкость с волной
  ctx.beginPath();
  ctx.moveTo(cx - R, 4);
  for (let x = cx - R; x <= cx + R; x += 2) ctx.lineTo(x, -3 + Math.sin((x - cx) * 0.28) * 2.4);
  ctx.lineTo(cx + R, R);
  ctx.lineTo(cx - R, R);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, -4, R, [[0, A.syrupSoft], [0.5, COLORS.syrup], [1, darken(COLORS.syrup, 0.3)]]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [bx, by, br] of [[-4, 9, 3], [8, 12, 2.4], [14, 6, 3.2], [2, 15, 1.8], [-10, 3, 2]] as const) {
    ctx.beginPath();
    ctx.arc(cx + bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(dark);
  ctx.beginPath();
  ctx.arc(cx, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx, 0, R - 3, Math.PI * 1.08, Math.PI * 1.55);
  ctx.stroke();
  // катушка цвета уровня вокруг колбы: с VII
  if (lv >= 7) {
    ctx.save();
    ctx.shadowColor = css(c, 0.9);
    ctx.shadowBlur = 8 * d;
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = css(c);
    for (const k of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(cx + k * R * 0.9, 0, 3.4, R * Math.sqrt(1 - (k * 0.9) ** 2) + 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(c);
    ctx.beginPath();
    ctx.arc(cx, 0, R + 1.2, -0.7, 0.7);
    ctx.stroke();
  }
  // пробка; у VIII — золотая корона на колбе
  ctx.fillStyle = vGrad(ctx, -R - 8, -R + 2, [[0, lighten(COLORS.gold, 0.5)], [1, darken(COLORS.gold, 0.2)]]);
  rrPath(ctx, cx - 7, -R - 6, 14, 8, 3);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(COLORS.goldEdge);
  ctx.stroke();
  if (lv === 8) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      const x = cx + Math.cos(a) * (R + 1);
      const y = Math.sin(a) * (R + 1);
      ctx.fillStyle = css(COLORS.gold);
      poly(ctx, [[x - 3.2, y + 1], [x, y - 8], [x + 3.2, y + 1]]);
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = css(COLORS.goldEdge);
      ctx.stroke();
      glowDot(ctx, d, x, y - 8, 1.7, accentAt(lv, i), 4);
    }
  }
  // пар сзади-сверху
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (const [x, y, r] of [[-6, -R - 9, 3.4], [3, -R - 14, 2.6]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  void edge;
}

// ---------------------------------------------------------------- ствол: Шприц

function drawSyringeHigh(ctx: CanvasRenderingContext2D, d: number, lv: number): void {
  const c = HIGH_ACCENT[lv];
  const E = COLORS.syringeEdge;
  const N = COLORS.needle;
  const acc = (i: number): number => accentAt(lv, i);
  const L = lv >= 6 ? 6 : 0; // корпус длиннее с VI
  // стабилизаторы-крылья позади: размах растёт
  const wing = lv >= 7 ? 38 : lv >= 6 ? 34 : 30;
  for (const s of [-1, 1]) {
    softShadow(ctx, d, 4, 2, 0.4, () => {
      poly(ctx, [[-8, s * 11], [-18, s * wing], [-36, s * wing], [-24, s * 16], [-4, s * 13]]);
      ctx.fill();
    });
    ctx.fillStyle = vGrad(ctx, -wing, wing, [[0, A.syringeWhite], [1, lighten(A.syringeMetal, 0.2)]]);
    poly(ctx, [[-8, s * 11], [-18, s * wing], [-36, s * wing], [-24, s * 16], [-4, s * 13]]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(c);
    ctx.stroke();
  }
  // кольцо-поршень сзади
  ctx.save();
  ctx.shadowColor = css(c, 0.8);
  ctx.shadowBlur = 8 * d;
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = css(c);
  ctx.beginPath();
  ctx.arc(-32, 0, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  rrPath(ctx, -26, -6, 14, 3, 1);
  ctx.fillStyle = css(E);
  ctx.fill();
  rrPath(ctx, -26, 3, 14, 3, 1);
  ctx.fill();
  rrPath(ctx, -14, -21, 5, 42, 2);
  ctx.fill();
  // прицел
  rrPath(ctx, 2, -28, 28 + L, 9, 3);
  ctx.fillStyle = css(A.scope);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(E);
  ctx.stroke();
  glowDot(ctx, d, 32 + L, -23.5, 5.5, c);
  // корпус-стекло
  softShadow(ctx, d, 5, 2, 0.5, () => {
    rrPath(ctx, -10, -15, 58 + L, 30, 9);
    ctx.fill();
  });
  ctx.fillStyle = vGrad(ctx, -15, 15, [[0, 0xffffff], [0.5, A.syringeWhite], [1, 0xb9cde8]]);
  rrPath(ctx, -10, -15, 58 + L, 30, 9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(E);
  ctx.stroke();
  // светящаяся жидкость: у VIII — радужная
  ctx.save();
  ctx.shadowColor = css(c, 0.8);
  ctx.shadowBlur = 12 * d;
  const liq = ctx.createLinearGradient(-4, 0, 44 + L, 0);
  if (lv === 8) RAINBOW.forEach((rc, i) => liq.addColorStop(i / (RAINBOW.length - 1), css(rc)));
  else {
    liq.addColorStop(0, css(darken(N, 0.1)));
    liq.addColorStop(0.5, css(lighten(c, 0.2)));
    liq.addColorStop(1, css(N));
  }
  ctx.fillStyle = liq;
  rrPath(ctx, -4, -8, 48 + L, 16, 8);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  rrPath(ctx, -3, -7, 46 + L, 5, 2.5);
  ctx.fill();
  // катушки: 4 (V), 4 (VI), 5 (VII), 5 (VIII) — по цвету уровня
  const coilXs = lv >= 7 ? [2, 12, 22, 32, 42] : [4, 15, 26, 37];
  coilXs.forEach((x, i) => {
    ctx.save();
    ctx.shadowColor = css(c, 0.7);
    ctx.shadowBlur = 6 * d;
    ctx.fillStyle = vGrad(ctx, -21, 21, [[0, 0xffffff], [1, lighten(A.syringeMetal, 0.4)]]);
    rrPath(ctx, x, -20, 6, 40, 3);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = css(c);
    rrPath(ctx, x, -20, 6, 40, 3);
    ctx.stroke();
    band(ctx, x + 1.4, -15, 3.2, 30, acc(i));
  });
  // плазменные дуги между катушками: с VII
  if (lv >= 7) {
    ctx.save();
    ctx.shadowColor = css(c, 0.9);
    ctx.shadowBlur = 8 * d;
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(lighten(c, 0.5));
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(8, s * 21);
      for (let k = 1; k <= 8; k++) ctx.lineTo(8 + k * 4.5, s * (21 + (k % 2 ? 3.5 : -1.2)));
      ctx.stroke();
    }
    ctx.restore();
  }
  // боковые иглы: 2 (V), 4 (VI+) — по две пары
  const pairs = lv >= 6 ? [17, 26] : [17];
  for (const yy of pairs) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = css(A.syringeWhite);
      rrPath(ctx, 38 + L, s * yy - 2, 22, 4, 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = css(E);
      ctx.stroke();
      poly(ctx, [[60 + L, s * yy - 2], [70 + L, s * yy], [60 + L, s * yy + 2]]);
      ctx.fillStyle = css(A.syringeWhite);
      ctx.fill();
      ctx.stroke();
    }
  }
  // главная игла и кристалл на острие (крупнее с уровнем)
  rrPath(ctx, 46 + L, -7, 10, 14, 3);
  ctx.fillStyle = css(A.syringeMetal);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = css(E);
  ctx.stroke();
  poly(ctx, [[56 + L, -2.8], [74, 0], [56 + L, 2.8]]);
  ctx.fillStyle = css(A.syringeWhite);
  ctx.fill();
  ctx.stroke();
  const big = 6 + (lv - 4) * 1.5;
  const tipX = 73 + (lv - 4) * 3;
  ctx.save();
  ctx.shadowColor = css(c, 0.95);
  ctx.shadowBlur = 16 * d;
  ctx.fillStyle = css(c);
  poly(ctx, [[66, 0], [tipX, -big], [tipX + 10 + (lv - 4) * 2, 0], [tipX, big]]);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  poly(ctx, [[66, 0], [tipX, -big], [tipX + 10 + (lv - 4) * 2, 0], [tipX, big]]);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  poly(ctx, [[70, 0], [tipX, -big * 0.5], [tipX + 6, 0], [tipX, big * 0.5]]);
  ctx.fill();
}

export function highBarrelKey(scene: Phaser.Scene, id: string, lv: number, box: ArtBox): string {
  return bakeCanvasArt(scene, `high-tower-barrel-${id}-${lv}`, box, (ctx, d) => {
    if (id === 'pill') drawPillHigh(ctx, d, lv);
    else if (id === 'syrup') drawSyrupHigh(ctx, d, lv);
    else drawSyringeHigh(ctx, d, lv);
  });
}

// ---------------------------------------------------------------- верх: кольцо, лучи, точки уровня, центр

/** Эмблема вида в центре (VIII): корона Таблетки, капля Сиропа, звезда-игла Шприца. */
function drawEmblem(ctx: CanvasRenderingContext2D, d: number, id: string): void {
  ctx.save();
  ctx.shadowColor = 'rgba(255,230,140,0.9)';
  ctx.shadowBlur = 8 * d;
  if (id === 'pill') {
    // золотая корона на светлом куполе
    ctx.fillStyle = vGrad(ctx, -9, 9, [[0, lighten(COLORS.gold, 0.55)], [1, darken(COLORS.gold, 0.15)]]);
    poly(ctx, [[-12, 8], [-13, -7], [-6.5, -1], [0, -11], [6.5, -1], [13, -7], [12, 8]]);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
    ctx.restore();
    for (const [x, y, col] of [[-13, -7, 0xff5a5a], [0, -11, 0x3ac8ff], [13, -7, 0x5ae87a]] as const) glowDot(ctx, d, x, y, 2.4, col, 4);
    return;
  }
  if (id === 'syrup') {
    ctx.fillStyle = vGrad(ctx, -12, 12, [[0, lighten(COLORS.gold, 0.45)], [1, darken(COLORS.gold, 0.2)]]);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = vGrad(ctx, -8, 8, [[0, A.syrupSoft], [1, darken(COLORS.syrup, 0.1)]]);
    ctx.beginPath();
    ctx.moveTo(0, -8.5);
    ctx.bezierCurveTo(7, -1, 7.5, 3, 0, 8);
    ctx.bezierCurveTo(-7.5, 3, -7, -1, 0, -8.5);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(COLORS.syrupDark);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-2.4, -1.5, 1.4, 2.6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (id !== 'syringe') {
    // остальные башни: светлый золотой диск и ромб-самоцвет цвета башни (ромб, не круг: не читается как глаз)
    const c = TOWER_MARK[id] ?? COLORS.gold;
    ctx.fillStyle = vGrad(ctx, -12, 12, [[0, lighten(COLORS.gold, 0.45)], [1, darken(COLORS.gold, 0.2)]]);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(COLORS.goldEdge);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = vGrad(ctx, -9, 9, [[0, lighten(c, 0.35)], [1, darken(c, 0.2)]]);
    poly(ctx, [[0, -9], [7, 0], [0, 9], [-7, 0]]);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(darken(c, 0.5));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    poly(ctx, [[0, -9], [7, 0], [0, -1.5], [-7, 0]]);
    ctx.fill();
    return;
  }
  // Шприц: четырёхлучевая звезда-игла на светлом золотом диске (тёмный диск читался как глаз)
  ctx.fillStyle = vGrad(ctx, -12, 12, [[0, lighten(COLORS.gold, 0.45)], [1, darken(COLORS.gold, 0.2)]]);
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(COLORS.goldEdge);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = css(A.steelDark);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? 3 : i % 4 === 0 ? 10 : 7;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = css(COLORS.needle);
  ctx.stroke();
}

/** Центр верха: втулка/купол и знак уровня (V — самоцвет, VI — зубцы, VII — гранёный камень, VIII — эмблема). */
function drawCenter(ctx: CanvasRenderingContext2D, d: number, id: string, lv: number): void {
  const c = HIGH_ACCENT[lv];
  if (id === 'pill') {
    // купол без глаз: перламутр, кольцо цвета уровня, капсула-метка
    softShadow(ctx, d, 5, 2, 0.5, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    });
    const dome = ctx.createRadialGradient(-7, -9, 2, 0, 0, 19);
    dome.addColorStop(0, '#ffffff');
    dome.addColorStop(0.55, css(0xe4ebf8));
    dome.addColorStop(1, css(0xa7b6d2));
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(lv === 8 ? COLORS.gold : c);
    ctx.beginPath();
    ctx.arc(0, 0, 16.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = css(darken(c, 0.5));
    ctx.beginPath();
    ctx.arc(0, 0, 18.2, 0, Math.PI * 2);
    ctx.stroke();
    if (lv < 8) {
      // метка: капсула наискосок
      ctx.save();
      ctx.rotate(-0.6);
      capsule(ctx, d, -9, -3.6, 18, 7.2, 0, COLORS.pillBlue, COLORS.pillEdge, false);
      ctx.restore();
      if (lv >= 6) for (let i = 0; i < 6; i++) glowDot(ctx, d, Math.cos((i * Math.PI) / 3) * 13, Math.sin((i * Math.PI) / 3) * 13, 1.5, c, 3);
    } else {
      drawEmblem(ctx, d, id);
    }
    return;
  }
  // светлая заклёпка вместо тёмной втулки: тёмный круг с бликом в центре читался как глаз (решение владельца 28 октября 2026, сообщение 1, п. 6.2)
  if (lv === 8) {
    drawEmblem(ctx, d, id);
    return;
  }
  if (lv >= 6) {
    for (let i = 0; i < (lv === 6 ? 6 : 8); i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / (lv === 6 ? 6 : 8));
      ctx.fillStyle = css(lighten(c, 0.2));
      poly(ctx, [[8.5, -2.6], [13.5, 0], [8.5, 2.6]]);
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = css(darken(c, 0.55));
      ctx.stroke();
      ctx.restore();
    }
  }
  if (lv === 7) {
    // гранёный камень
    ctx.save();
    ctx.shadowColor = css(c, 0.9);
    ctx.shadowBlur = 8 * d;
    ctx.fillStyle = css(c);
    poly(ctx, [[0, -7], [6.5, -3.5], [6.5, 3.5], [0, 7], [-6.5, 3.5], [-6.5, -3.5]]);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#ffffff';
    poly(ctx, [[0, -7], [6.5, -3.5], [6.5, 3.5], [0, 7], [-6.5, 3.5], [-6.5, -3.5]]);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    poly(ctx, [[0, -7], [6.5, -3.5], [0, 0], [-6.5, -3.5]]);
    ctx.fill();
    return;
  }
  if (lv === 5) {
    // V: четыре ромба цвета уровня крестом вокруг заклёпки
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
      ctx.fillStyle = css(lighten(c, 0.15));
      poly(ctx, [[5.5, 0], [9, -2.6], [12.5, 0], [9, 2.6]]);
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = css(darken(c, 0.55));
      ctx.stroke();
      ctx.restore();
    }
  }
  rivet(ctx, 3.2);
}

/** Светлая заклёпка в центре верха, как у Таблетки I–III. */
function rivet(ctx: CanvasRenderingContext2D, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 0.2, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, css(0xc9d6ee));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = css(COLORS.towerEdge);
  ctx.stroke();
}

function drawHighTop(ctx: CanvasRenderingContext2D, d: number, id: string, lv: number): void {
  const c = HIGH_ACCENT[lv];
  // лучи по контуру: VI — 12, VII — 16 (длинные и короткие), VIII — 16 радужных
  if (lv >= 6) {
    const n = lv === 6 ? 12 : 16;
    for (let i = 0; i < n; i++) {
      const long = lv === 6 || i % 2 === 0;
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / n);
      ctx.fillStyle = css(lighten(accentAt(lv, i), 0.2));
      poly(ctx, [[47, -2.8], [47 + (long ? 7.5 : 4.2), 0], [47, 2.8]]);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(darken(accentAt(lv, i), 0.55));
      ctx.stroke();
      ctx.restore();
    }
  }
  // основное кольцо и второе (тонкое) кольцо — с V
  ctx.save();
  ctx.shadowColor = css(c, 0.7);
  ctx.shadowBlur = 8 * d;
  strokeRing(ctx, 40, 4, lv, 0.95);
  ctx.restore();
  strokeRing(ctx, 44.6, 1.8, lv, 0.85);
  // точки уровня: нижний ряд — четыре, второй ряд — со второй точки V (lv − 4 штук)
  const dot = (x: number, y: number, i: number): void => {
    ctx.fillStyle = css(accentAt(lv, i));
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0b1020';
    ctx.stroke();
  };
  for (let i = 0; i < 4; i++) dot((i - 1.5) * 13, 46, i);
  const second = lv - 4;
  for (let i = 0; i < second; i++) dot((i - (second - 1) / 2) * 13, 57.5, 4 + i);
  drawCenter(ctx, d, id, lv);
}

export function highTopKey(scene: Phaser.Scene, id: string, lv: number, box: ArtBox): string {
  return bakeCanvasArt(scene, `high-tower-top-${id}-${lv}`, box, (ctx, d) => drawHighTop(ctx, d, id, lv));
}

// ---------------------------------------------------------------- ореол (VII, VIII): отдельная картинка, вращается целиком

function drawHalo(ctx: CanvasRenderingContext2D, d: number, lv: number): void {
  const n = lv === 7 ? 12 : 18;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    ctx.save();
    ctx.rotate(a);
    const col = accentAt(lv, i);
    const g = ctx.createLinearGradient(40, 0, 56, 0);
    g.addColorStop(0, css(col, 0));
    g.addColorStop(0.5, css(col, 0.55));
    g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g;
    poly(ctx, [[38, -4.2], [56, -1], [56, 1], [38, 4.2]]);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = css(HIGH_ACCENT[lv], 0.8);
  ctx.shadowBlur = 8 * d;
  ctx.setLineDash([5, 7]);
  strokeRing(ctx, 52.5, 2, lv, 0.7);
  ctx.restore();
}

export function highHaloKey(scene: Phaser.Scene, lv: number): string {
  return bakeCanvasArt(scene, `high-tower-halo-${lv}`, HALO_BOX, (ctx, d) => drawHalo(ctx, d, lv));
}

// ---------------------------------------------------------------- знак ранга: звезда с цифрой (★1–★7), у ★8 — другой вид

export const RANK_BOX: ArtBox = { x: -16, y: -16, w: 32, h: 32 };

/** Знак ранга 1–8: золотая звезда с цифрой; у ★8 — восьмилучевая радужная звезда в золотой оправе. */
export function rankMarkKey(scene: Phaser.Scene, rank: number): string {
  const r = Math.max(1, Math.min(8, Math.round(rank)));
  return bakeCanvasArt(scene, `rank-mark-${r}`, RANK_BOX, (ctx, d) => {
    const star = (points: number, outer: number, inner: number, rot: number): void => {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = rot + (i * Math.PI) / points;
        const rad = i % 2 ? inner : outer;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
    };
    if (r < 8) {
      softShadow(ctx, d, 2.5, 1, 0.5, () => {
        star(5, 14.5, 7, -Math.PI / 2);
        ctx.fill();
      });
      ctx.fillStyle = vGrad(ctx, -14, 14, [[0, lighten(COLORS.gold, 0.55)], [0.6, COLORS.gold], [1, darken(COLORS.gold, 0.25)]]);
      star(5, 14.5, 7, -Math.PI / 2);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(COLORS.goldEdge);
      ctx.stroke();
    } else {
      softShadow(ctx, d, 3, 1, 0.55, () => {
        star(8, 15, 8.4, -Math.PI / 8);
        ctx.fill();
      });
      const conic = (ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
      if (typeof conic === 'function') {
        const grad = conic.call(ctx, 0, 0, 0);
        RAINBOW.forEach((c, i) => grad.addColorStop(i / (RAINBOW.length - 1), css(c)));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = css(COLORS.gold);
      }
      star(8, 15, 8.4, -Math.PI / 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(COLORS.goldEdge);
      ctx.stroke();
      ctx.fillStyle = vGrad(ctx, -8, 8, [[0, lighten(COLORS.gold, 0.6)], [1, COLORS.gold]]);
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText(String(r), 0, r < 8 ? 1.2 : 0.4);
    ctx.fillStyle = '#3a2a00';
    ctx.fillText(String(r), 0, r < 8 ? 1.2 : 0.4);
  });
}
