import Phaser from 'phaser';
import { artImage, bakeCanvasArt, squareBox, type ArtBox } from '../art';
import { CONFIG } from '../config';
import { COLORS } from '../theme';
import { shellWidth } from './bacteriumArt';

/**
 * Пилот этапа 8 (17 октября 2026): новый рисунок кокка, бронированной и Гиганта — объём, лица, движение на месте (docs/art-style.md).
 * Тело и лицо рисуются стандартным Canvas 2D (bakeCanvasArt) один раз в картинку; прежние функции рисования (bacteriumArt.ts) остаются до утверждения стиля.
 * Размеры, радиусы, точки попадания и толщина оболочки (shellWidth) — прежние: на баланс рисунок не влияет, рамка картинки шире только на мягкую тень.
 */

export type PilotKind = 'coccus' | 'armored' | 'giant';
const PILOT: ReadonlySet<string> = new Set(['coccus', 'armored', 'giant']);

export function isPilotKind(kind: string): kind is PilotKind {
  return PILOT.has(kind);
}

// ---------------------------------------------------------------- цвет

const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Смесь цвета c с цветом to в доле k (0 — c, 1 — to). */
const mixColor = (c: number, to: number, k: number): number => {
  const [r, g, b] = channels(c);
  const [r2, g2, b2] = channels(to);
  const f = (a: number, z: number): number => Math.round(a + (z - a) * k);
  return (f(r, r2) << 16) | (f(g, g2) << 8) | f(b, b2);
};
/** Светлее и темнее того же цвета: новые оттенки строятся от основного цвета вида (COLORS.kinds), обводка — тёмный оттенок, не чёрная. */
const lighten = (c: number, k: number): number => mixColor(c, 0xffffff, k);
const darken = (c: number, k: number): number => mixColor(c, 0x000000, k);
const css = (c: number, a = 1): string => {
  const [r, g, b] = channels(c);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

// ---------------------------------------------------------------- рамки

/** Запас рамки под мягкую тень, пикселей мира (на попадание не влияет: зоны попадания считаются по радиусу, а не по рамке). */
const SHADOW_PAD = 14;

/** Рамка картинки тела пилотного вида: прежняя рамка плюс запас под тень. */
export function pilotBodyBox(kind: PilotKind): ArtBox {
  const r = CONFIG.types[kind].radius;
  return squareBox(Math.ceil((kind === 'giant' ? r * 1.28 : r) + SHADOW_PAD));
}

/** Рамка картинки лица (глаза, рот, брови): квадрат со стороной около 1,6 радиуса. */
export function pilotFaceBox(kind: PilotKind): ArtBox {
  return squareBox(Math.ceil(CONFIG.types[kind].radius * 0.8));
}

// ---------------------------------------------------------------- тело

function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Тело: тень, шипы (Гигант), оболочка (кольцо; у бронированной — кольцо пластин), тело с переходом цвета, обводка, блик. Свет — сверху слева. */
function drawBodyCanvas(ctx: CanvasRenderingContext2D, d: number, kind: PilotKind, sw: number): void {
  const r = CONFIG.types[kind].radius;
  const col = COLORS.kinds[kind];
  const ri = Math.max(1, r - sw);
  const outline = darken(col.shell, 0.6);

  // шипы Гиганта (под телом): градиент от тёмного основания к светлому кончику, тёмная обводка
  if (kind === 'giant') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const bx = nx * (r - 4);
      const by = ny * (r - 4);
      const tx = nx * (r + r * 0.28);
      const ty = ny * (r + r * 0.28);
      const grad = ctx.createLinearGradient(bx, by, tx, ty);
      grad.addColorStop(0, css(darken(COLORS.spike, 0.35)));
      grad.addColorStop(1, css(lighten(COLORS.spike, 0.45)));
      ctx.beginPath();
      ctx.moveTo(bx - ny * r * 0.16, by + nx * r * 0.16);
      ctx.lineTo(bx + ny * r * 0.16, by - nx * r * 0.16);
      ctx.lineTo(tx, ty);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(darken(COLORS.spike, 0.6));
      ctx.stroke();
    }
  }

  // мягкая тень под телом (размеры тени в Canvas 2D — в пикселях текстуры, поэтому умножаются на плотность)
  ctx.save();
  ctx.shadowColor = 'rgba(4,8,22,0.5)';
  ctx.shadowBlur = r * 0.3 * d;
  ctx.shadowOffsetX = r * 0.05 * d;
  ctx.shadowOffsetY = r * 0.14 * d;
  ctx.fillStyle = css(col.shell);
  circlePath(ctx, 0, 0, r);
  ctx.fill();
  ctx.restore();

  // оболочка
  const shellGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  shellGrad.addColorStop(0, css(lighten(col.shell, 0.45)));
  shellGrad.addColorStop(0.5, css(col.shell));
  shellGrad.addColorStop(1, css(darken(col.shell, 0.4)));
  if (kind === 'armored') {
    // тёмная подложка (в щелях между пластинами) и кольцо из десяти пластин толщины sw
    ctx.fillStyle = css(darken(col.shell, 0.65));
    circlePath(ctx, 0, 0, r);
    ctx.fill();
    const plates = 10;
    const gap = 0.07;
    for (let i = 0; i < plates; i++) {
      const a0 = (i / plates) * Math.PI * 2 + gap / 2;
      const a1 = ((i + 1) / plates) * Math.PI * 2 - gap / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a1);
      ctx.arc(0, 0, ri, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = shellGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(outline);
      ctx.stroke();
      // светлая кромка пластины снаружи
      ctx.beginPath();
      ctx.arc(0, 0, r - 2.2, a0 + 0.03, a1 - 0.03);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(lighten(col.shell, 0.65), 0.55);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = shellGrad;
    circlePath(ctx, 0, 0, r);
    ctx.fill();
  }

  // тело внутри оболочки: от светлого пятна сверху слева к тёмному краю
  const bodyGrad = ctx.createRadialGradient(-ri * 0.3, -ri * 0.38, ri * 0.08, 0, 0, ri * 1.05);
  bodyGrad.addColorStop(0, css(lighten(col.body, 0.5)));
  bodyGrad.addColorStop(0.45, css(col.body));
  bodyGrad.addColorStop(1, css(darken(col.body, 0.3)));
  ctx.fillStyle = bodyGrad;
  circlePath(ctx, 0, 0, ri);
  ctx.fill();
  // внутренняя кромка: тело «лежит» под оболочкой
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(darken(col.body, 0.5), 0.4);
  circlePath(ctx, 0, 0, ri - 1.5);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(outline, 0.65);
  circlePath(ctx, 0, 0, ri);
  ctx.stroke();

  // внешняя обводка тёмным оттенком того же цвета
  if (kind !== 'armored') {
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.strokeStyle = css(outline);
    circlePath(ctx, 0, 0, r - ctx.lineWidth / 2);
    ctx.stroke();
  }

  // мягкий блик и точка блика
  const shine = ctx.createRadialGradient(-r * 0.36, -r * 0.42, 0, -r * 0.36, -r * 0.42, r * 0.34);
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  circlePath(ctx, -r * 0.36, -r * 0.42, r * 0.34);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  circlePath(ctx, -r * 0.4, -r * 0.46, r * 0.06);
  ctx.fill();
}

/** Картинка тела пилотного вида с оболочкой толщины sw (одна на вид и толщину; кадры анимации на толщины не умножаются — глаза отдельно). */
export function pilotBodyKey(scene: Phaser.Scene, kind: PilotKind, sw: number): string {
  const q = Math.round(sw);
  return bakeCanvasArt(scene, `pilot-body-${kind}-${q}`, pilotBodyBox(kind), (ctx, d) => drawBodyCanvas(ctx, d, kind, q));
}

// ---------------------------------------------------------------- лицо

function ellipsePath(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** Глаз: белок с лёгким переходом, зрачок со смещением, блик в зрачке. */
function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, pr: number, dir: number, stroke: string, pupil: string, white = '#ffffff', line = 1.4): void {
  const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 0, cx, cy, Math.max(rx, ry) * 1.1);
  grad.addColorStop(0, white);
  grad.addColorStop(1, '#d9e3f0');
  ctx.fillStyle = grad;
  ellipsePath(ctx, cx, cy, rx, ry);
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  const px = cx + dir * rx * 0.14;
  const py = cy + ry * 0.16;
  ctx.fillStyle = pupil;
  circlePath(ctx, px, py, pr);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  circlePath(ctx, px - pr * 0.38, py - pr * 0.42, pr * 0.36);
  ctx.fill();
}

/** Закрытый глаз: дужка. */
function closedEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, lw: number, color: string, smile: boolean): void {
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  if (smile) ctx.ellipse(cx, cy - rx * 0.2, rx, rx * 0.6, 0, Math.PI * 0.12, Math.PI * 0.88);
  else {
    ctx.moveTo(cx - rx, cy);
    ctx.lineTo(cx + rx, cy);
  }
  ctx.stroke();
}

/**
 * Лицо: кокк — простодушное (круглые глаза, маленький рот), бронированная — тяжёлый взгляд из-под пластин, Гигант — злое (брови к переносице, зубы). Всегда вертикальное.
 * `small` — упрощённое лицо кокка для мелкого размера (рой, радиус 14): глаза крупнее и дальше от центра, зрачки и обводка толще, румянца нет, рот — одна широкая дуга.
 */
function drawFaceCanvas(ctx: CanvasRenderingContext2D, kind: PilotKind, blink: boolean, small = false): void {
  const r = CONFIG.types[kind].radius;
  const col = COLORS.kinds[kind];
  const ink = css(darken(col.shell, 0.65));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'coccus' && small) {
    const ex = r * 0.33;
    const ey = -r * 0.1;
    const sr = r * 0.27;
    for (const s of [-1, 1] as const) {
      if (blink) closedEye(ctx, s * ex, ey, sr * 0.9, r * 0.1, ink, true);
      else eye(ctx, s * ex, ey, sr, sr * 1.04, r * 0.17, -s, ink, '#0c141c', '#ffffff', r * 0.09);
    }
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.17, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    return;
  }

  if (kind === 'coccus') {
    const ex = r * 0.3;
    const ey = -r * 0.1;
    const sr = r * 0.215;
    for (const s of [-1, 1] as const) {
      if (blink) closedEye(ctx, s * ex, ey, sr * 0.9, r * 0.07, ink, true);
      else eye(ctx, s * ex, ey, sr, sr * 1.08, r * 0.11, -s, ink, '#14202b');
    }
    // румянец и маленький рот-улыбка
    ctx.fillStyle = 'rgba(255,110,130,0.32)';
    for (const s of [-1, 1] as const) {
      ellipsePath(ctx, s * r * 0.5, r * 0.14, r * 0.1, r * 0.065);
      ctx.fill();
    }
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.15, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    return;
  }

  if (kind === 'armored') {
    const ex = r * 0.3;
    const rx = r * 0.2;
    const ry = r * 0.15;
    const ey = -r * 0.04;
    for (const s of [-1, 1] as const) {
      const cx = s * ex;
      if (!blink) eye(ctx, cx, ey, rx, ry, r * 0.075, -s, ink, '#1a1230', '#f4f1ff');
      // тяжёлое веко-пластина: снаружи выше, к переносице ниже; закрывает верх глаза (при моргании — весь глаз)
      const lidOuter = blink ? ey + ry * 0.1 : ey - ry * 0.28;
      const lidInner = blink ? ey + ry * 0.2 : ey + ry * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx + s * rx * 1.25, ey - ry * 1.5);
      ctx.lineTo(cx - s * rx * 1.25, ey - ry * 1.5);
      ctx.lineTo(cx - s * rx * 1.25, lidInner);
      ctx.lineTo(cx + s * rx * 1.25, lidOuter);
      ctx.closePath();
      const lg = ctx.createLinearGradient(0, ey - ry * 1.5, 0, lidInner);
      lg.addColorStop(0, css(lighten(col.shell, 0.35)));
      lg.addColorStop(1, css(darken(col.shell, 0.2)));
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
    // плотно сжатый рот (прямая с опущенными уголками)
    ctx.lineWidth = r * 0.055;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.arc(0, r * 0.62, r * 0.2, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
    return;
  }

  // Гигант: злое лицо
  const ex = r * 0.29;
  const ey = -r * 0.08;
  const rx = r * 0.17;
  const ry = r * 0.15;
  for (const s of [-1, 1] as const) {
    const cx = s * ex;
    if (blink) closedEye(ctx, cx, ey + ry * 0.1, rx, r * 0.06, ink, false);
    else eye(ctx, cx, ey, rx, ry, r * 0.085, -s, ink, '#2b0508', '#fff1ec');
    // бровь: от внешнего верхнего угла к переносице вниз (злой взгляд)
    ctx.beginPath();
    ctx.moveTo(cx + s * r * 0.24, ey - r * 0.27);
    ctx.lineTo(cx - s * r * 0.2, ey - r * 0.04);
    ctx.lineTo(cx - s * r * 0.2, ey - r * 0.04 - r * 0.1);
    ctx.lineTo(cx + s * r * 0.24, ey - r * 0.27 - r * 0.1);
    ctx.closePath();
    ctx.fillStyle = css(darken(col.shell, 0.15));
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  // пасть: тёмный полумесяц и зубы
  const my = r * 0.34;
  const mw = r * 0.4;
  const mh = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(-mw, my);
  ctx.quadraticCurveTo(0, my + mh * 2, mw, my);
  ctx.closePath();
  ctx.fillStyle = '#1a0308';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = '#fff6ee';
  ctx.strokeStyle = css(darken(col.shell, 0.4));
  ctx.lineWidth = 1;
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const x0 = -mw * 0.86 + (i * mw * 1.72) / teeth;
    const x1 = x0 + (mw * 1.72) / teeth;
    ctx.beginPath();
    ctx.moveTo(x0, my + 0.5);
    ctx.lineTo(x1, my + 0.5);
    ctx.lineTo((x0 + x1) / 2, my + r * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  for (const s of [-1, 1] as const) {
    const x = s * mw * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.035, my + mh * 0.97 - r * 0.012);
    ctx.lineTo(x + r * 0.035, my + mh * 0.97 - r * 0.012);
    ctx.lineTo(x, my + mh * 0.97 - r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}

/** Картинка лица пилотного вида (открытые глаза или моргание): маленькая, поверх тела; одна на вид и кадр, на толщину оболочки не множится. */
export function pilotFaceKey(scene: Phaser.Scene, kind: PilotKind, blink: boolean, small = false): string {
  return bakeCanvasArt(scene, `pilot-face-${kind}-${blink ? 'b' : 'o'}${small ? '-s' : ''}`, pilotFaceBox(kind), (ctx) => drawFaceCanvas(ctx, kind, blink, small));
}

// ---------------------------------------------------------------- движение на месте

/** Дыхание: пульсация масштаба ±3 %; период — у каждой бактерии свой в этих границах, секунд (у Гиганта медленнее). */
export const BREATH_AMP = 0.03;
export const BREATH_SEC: Record<PilotKind, [number, number]> = { coccus: [1.6, 2.4], armored: [1.8, 2.6], giant: [2.8, 3.6] };
/** Моргание: случайно раз в 2–5 секунд, около 120 мс. */
export const BLINK_EVERY_SEC: [number, number] = [2, 5];
export const BLINK_SEC = 0.12;

// ---------------------------------------------------------------- значок альманаха

/** Значок пилотного вида для альманаха: картинка нового тела (полное HP) и лицо с открытыми глазами (первый кадр), вписанные в круг радиуса `radius`. */
export function pilotIcon(scene: Phaser.Scene, kind: PilotKind, radius: number): Phaser.GameObjects.Container {
  const sw = shellWidth(kind, CONFIG.types[kind].hp);
  const body = artImage(scene, pilotBodyKey(scene, kind, sw), pilotBodyBox(kind));
  const face = artImage(scene, pilotFaceKey(scene, kind, false), pilotFaceBox(kind));
  const holder = scene.add.container(0, 0, [body, face]);
  holder.setScale(radius / CONFIG.types[kind].radius); // как прежний значок: тело вписано по радиусу (шипы Гиганта выходят за круг)
  return holder;
}
