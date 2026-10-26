import Phaser from 'phaser';
import { artImage, bakeCanvasArt, type ArtBox } from '../art';
import { CONFIG } from '../config';
import { COLORS } from '../theme';
import { bodyHalfSize, shellRange, shellWidth, SPLITTER_LOBE_OFFSET } from './bacteriumArt';

/**
 * Новый рисунок бактерий этапа 8 (стиль утверждён владельцем 18 октября 2026, docs/art-style.md; пилот — кокк, бронированная, Гигант, перенос — все 19 видов):
 * объём, лица, движение на месте. Тело и лицо рисуются стандартным Canvas 2D (bakeCanvasArt) один раз в картинку; прежние функции рисования (bacteriumArt.ts) остаются для трещин
 * (трещины рисуются прежним способом между телом и лицом) и для листа образцов `?qa&artsheet`.
 * Размеры, радиусы, точки попадания и толщина оболочки (shellWidth) — прежние: на баланс рисунок не влияет, рамка картинки — прежняя плюс запас под мягкую тень.
 */

export type StyleKind = keyof typeof CONFIG.types;

/** Мелкий размер (радиус меньше 20, например рой — 14, спора — 18): лицо упрощается (docs/art-style.md). */
export function isSmallKind(kind: StyleKind): boolean {
  return CONFIG.types[kind].radius < SMALL_RADIUS;
}
const SMALL_RADIUS = 20;

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

/** Рамка картинки тела: прежняя рамка рисунка вида (`bodyHalfSize`; у Гиганта — с шипами) плюс запас под мягкую тень. */
export function styleBodyBox(kind: StyleKind): ArtBox {
  const { hx, hy } = bodyHalfSize(kind);
  return { x: -(hx + SHADOW_PAD), y: -(hy + SHADOW_PAD), w: (hx + SHADOW_PAD) * 2, h: (hy + SHADOW_PAD) * 2 };
}

// ---------------------------------------------------------------- тело

/** Десятиточечная звезда с центром (cx, cy), внешним радиусом R и внутренним 0,46 R (путь, без заливки). */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? R : R * 0.46;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Тело: тень, шипы (Гигант), оболочка (кольцо; у бронированной — кольцо пластин), тело с переходом цвета, обводка, блик. Свет — сверху слева. */
function drawBodyCanvas(ctx: CanvasRenderingContext2D, d: number, kind: StyleKind, sw: number): void {
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

// ---------------------------------------------------------------- тело остальных видов

/** Радиальный блик и яркая точка в левом верхнем углу фигуры радиуса r с центром (cx, cy). */
function highlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const shine = ctx.createRadialGradient(cx - r * 0.36, cy - r * 0.42, 0, cx - r * 0.36, cy - r * 0.42, r * 0.34);
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  circlePath(ctx, cx - r * 0.36, cy - r * 0.42, r * 0.34);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  circlePath(ctx, cx - r * 0.4, cy - r * 0.46, r * 0.06);
  ctx.fill();
}

/** Мягкая тень под фигурой: заливка path с тенью (размеры тени — в пикселях текстуры, поэтому умножаются на плотность). */
function shadowFill(ctx: CanvasRenderingContext2D, d: number, r: number, color: string, path: () => void): void {
  ctx.save();
  ctx.shadowColor = 'rgba(4,8,22,0.5)';
  ctx.shadowBlur = r * 0.3 * d;
  ctx.shadowOffsetX = r * 0.05 * d;
  ctx.shadowOffsetY = r * 0.14 * d;
  ctx.fillStyle = color;
  path();
  ctx.fill();
  ctx.restore();
}

/** Тело из двух слоёв (оболочка и тело) произвольной формы: path(inset) строит контур, сжатый на inset со всех сторон; r — размер для градиентов и обводки. */
function layeredShape(ctx: CanvasRenderingContext2D, d: number, kind: StyleKind, r: number, sw: number, path: (inset: number) => void, cx = 0, cy = 0): void {
  const col = COLORS.kinds[kind];
  const outline = darken(col.shell, 0.6);
  shadowFill(ctx, d, r, css(col.shell), () => path(0));
  const shellGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
  shellGrad.addColorStop(0, css(lighten(col.shell, 0.45)));
  shellGrad.addColorStop(0.5, css(col.shell));
  shellGrad.addColorStop(1, css(darken(col.shell, 0.4)));
  ctx.fillStyle = shellGrad;
  path(0);
  ctx.fill();
  const bodyGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.38, r * 0.08, cx, cy, r * 1.05);
  bodyGrad.addColorStop(0, css(lighten(col.body, 0.5)));
  bodyGrad.addColorStop(0.45, css(col.body));
  bodyGrad.addColorStop(1, css(darken(col.body, 0.3)));
  ctx.fillStyle = bodyGrad;
  path(sw);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(darken(col.body, 0.5), 0.4);
  path(sw + 1.5);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(outline, 0.65);
  path(sw);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = css(outline);
  path(ctx.lineWidth / 2);
  ctx.stroke();
}

/** Контур капсулы шириной w и длиной l (вертикальной), сжатой на inset со всех сторон. */
function rrCapsule(ctx: CanvasRenderingContext2D, w: number, l: number, inset: number): void {
  const ww = Math.max(2, w - 2 * inset);
  const ll = Math.max(2, l - 2 * inset);
  rrPath(ctx, -ww / 2, -ll / 2, ww, ll, ww / 2);
}

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

/** Тело видов, кроме кокка, бронированной и Гиганта (у них круг с оболочкой — drawBodyCanvas): палочка, бегун и делящаяся — свои формы, у остальных круг с частями под телом и на теле. */
function drawBodyStyle(ctx: CanvasRenderingContext2D, d: number, kind: StyleKind, sw: number): void {
  const cfg = CONFIG.types[kind];
  const col = COLORS.kinds[kind];
  const r = cfg.radius;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (kind === 'rod') {
    // палочка: вытянутая капсула (голова — вверх по своим осям)
    const w = r * 2;
    const l = cfg.length;
    layeredShape(ctx, d, kind, w / 2, sw, (inset) => rrCapsule(ctx, w, l, inset));
    highlight(ctx, -w * 0.16, -l * 0.3, w * 0.5);
    return;
  }
  if (kind === 'runner') {
    // бегун: острая «капля»-эллипс, голова вперёд, сзади три полоски скорости
    const w = r * 2;
    const l = cfg.length;
    ctx.lineWidth = 4;
    ctx.strokeStyle = css(col.shell, 0.55);
    for (const dx of [-w * 0.28, 0, w * 0.28]) {
      ctx.beginPath();
      ctx.moveTo(dx, l / 2 + 4);
      ctx.lineTo(dx, l / 2 + 14 + Math.abs(dx) * 0.3);
      ctx.stroke();
    }
    layeredShape(ctx, d, kind, w / 2, sw, (inset) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, w / 2 - inset), Math.max(1, l / 2 - inset), 0, 0, Math.PI * 2);
    });
    highlight(ctx, -w * 0.1, -l * 0.18, w * 0.5);
    return;
  }
  if (kind === 'splitter') {
    // делящаяся: две доли с перетяжкой посередине
    const off = r * SPLITTER_LOBE_OFFSET;
    for (const s of [-1, 1] as const) {
      layeredShape(ctx, d, kind, r, sw, (inset) => circlePath(ctx, s * off, 0, Math.max(1, r - inset)), s * off, 0);
    }
    const waist = Math.sqrt(Math.max(1, r * r - off * off)) + 2;
    ctx.lineWidth = 5;
    ctx.strokeStyle = css(COLORS.septum);
    ctx.beginPath();
    ctx.moveTo(0, -waist);
    ctx.lineTo(0, waist);
    ctx.stroke();
    for (const s of [-1, 1] as const) highlight(ctx, s * off, 0, r);
    return;
  }

  // части под телом
  if (kind === 'slick') {
    // слизень: подтёки под телом
    for (const [dx, len] of [[-0.45, 0.45], [0.05, 0.62], [0.5, 0.38]] as const) {
      const x = dx * r - r * 0.12;
      const y = r * 0.5;
      const w = r * 0.24;
      const h = r * len + r * 0.4;
      shadowFill(ctx, d, r * 0.4, css(col.shell), () => rrPath(ctx, x, y, w, h, w / 2));
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, css(lighten(col.shell, 0.35)));
      g.addColorStop(1, css(darken(col.shell, 0.25)));
      ctx.fillStyle = g;
      rrPath(ctx, x, y, w, h, w / 2);
      ctx.fill();
    }
  }
  if (kind === 'leaper') {
    // прыгун: «пружинка» под телом — три дуги-витка разной ширины
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.strokeStyle = css(darken(col.shell, 0.1));
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, r * (0.92 + i * 0.14), (r * (0.95 - i * 0.2)) / 2, (r * 0.2) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (kind === 'parasite') {
    // паразит: щупальце с присоской свисает вниз (под телом)
    ctx.lineWidth = Math.max(4, r * 0.22);
    ctx.strokeStyle = css(col.shell);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const x = r * 0.25 + Math.sin(u * Math.PI * 1.6) * r * 0.32;
      const y = r * 0.55 + u * r * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const tx = r * 0.25 + Math.sin(Math.PI * 1.6) * r * 0.32;
    const ty = r * 0.55 + r * 0.85;
    ctx.fillStyle = css(col.shell);
    circlePath(ctx, tx, ty, r * 0.3);
    ctx.fill();
    ctx.fillStyle = css(0xd9b98a);
    circlePath(ctx, tx, ty, r * 0.19);
    ctx.fill();
    ctx.fillStyle = css(col.crack);
    circlePath(ctx, tx, ty, r * 0.08);
    ctx.fill();
  }

  drawBodyCanvas(ctx, d, kind, sw);

  // части на теле (лица и знаки, которые лежат поверх, — в картинке лица)
  if (kind === 'mutant') {
    // мутант: радужные пятна и белое переливание
    for (const [bx, by, br, color] of [[-0.32, -0.12, 0.3, COLORS.mutantA], [0.3, -0.3, 0.24, COLORS.mutantB], [0.28, 0.28, 0.3, COLORS.mutantC], [-0.25, 0.38, 0.2, COLORS.mutantB]] as const) {
      const g = ctx.createRadialGradient(bx * r - br * r * 0.3, by * r - br * r * 0.3, 0, bx * r, by * r, br * r);
      g.addColorStop(0, css(lighten(color, 0.5), 0.75));
      g.addColorStop(1, css(color, 0.6));
      ctx.fillStyle = g;
      circlePath(ctx, bx * r, by * r, br * r);
      ctx.fill();
    }
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0.4, 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 3.5, 4.7);
    ctx.stroke();
  }
  if (kind === 'toxin') {
    // токсин: жёлтые пузыри по краю болотного тела
    for (const [bx, by, br] of [[-0.58, -0.22, 0.17], [0.54, -0.36, 0.14], [0.6, 0.2, 0.19], [-0.42, 0.5, 0.13], [0.1, 0.62, 0.1]] as const) {
      const g = ctx.createRadialGradient((bx - br * 0.3) * r, (by - br * 0.3) * r, 0, bx * r, by * r, br * r);
      g.addColorStop(0, css(lighten(COLORS.cloudBubble, 0.5)));
      g.addColorStop(1, css(COLORS.cloudBubble));
      ctx.fillStyle = g;
      circlePath(ctx, bx * r, by * r, br * r);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(col.shell, 0.9);
      ctx.stroke();
    }
  }
  if (kind === 'brood') {
    // матка: светлые «яйца» внизу тела (лицо — выше)
    for (const [ex, ey, er] of [[-0.42, 0.42, 0.17], [0.0, 0.54, 0.19], [0.42, 0.4, 0.16], [-0.18, 0.28, 0.1], [0.24, 0.26, 0.1]] as const) {
      const g = ctx.createRadialGradient((ex - er * 0.3) * r, (ey - er * 0.3) * r, 0, ex * r, ey * r, er * r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, css(COLORS.egg));
      ctx.fillStyle = g;
      circlePath(ctx, ex * r, ey * r, er * r);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(col.shell, 0.8);
      ctx.stroke();
    }
  }
  if (kind === 'parasite') {
    // присоска на теле: светлое кольцо с тёмным центром (слева внизу, лицо — выше)
    const sx = -r * 0.45;
    const sy = r * 0.42;
    ctx.fillStyle = css(0xd9b98a, 0.95);
    circlePath(ctx, sx, sy, r * 0.26);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = css(col.shell, 0.9);
    ctx.stroke();
    ctx.fillStyle = css(col.crack);
    circlePath(ctx, sx, sy, r * 0.1);
    ctx.fill();
  }
  if (kind === 'stealth') {
    // скрытная: бледный пунктирный ободок внутри
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = css(COLORS.stealthRim, 0.7);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.74, a, a + 0.38);
      ctx.stroke();
    }
  }
  if (kind === 'phago') {
    // фагоцит: прозрачные вакуоли в верхних углах тела
    for (const [vx, vy, vr] of [[-0.55, -0.45, 0.13], [0.5, -0.5, 0.1], [0.62, -0.1, 0.08]] as const) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      circlePath(ctx, vx * r, vy * r, vr * r);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(col.shell, 0.8);
      ctx.stroke();
    }
  }
}

/** Виды, тело которых — готовая функция `drawBodyCanvas` без добавок (кокк, бронированная, Гигант). */
function isCoreKind(kind: StyleKind): boolean {
  return kind === 'coccus' || kind === 'armored' || kind === 'giant';
}

/** Толщина оболочки в ключе картинки тела округляется до сетки от самой тонкой оболочки вида: шаг 2 px, у крупных видов (Гигант, Бронированная) — столько толщин, сколько указано здесь
 *  (иначе картинок тела слишком много: решение владельца 18 октября 2026, память картинок в стресс-сценарии не больше +35 % к прежней). */
const SHELL_STEP_PX = 2;
const SHELL_LEVELS_BIG: Partial<Record<StyleKind, number>> = { giant: 5, armored: 6 };
function shellQuant(kind: StyleKind, sw: number): number {
  const [lo, hi] = shellRange(kind);
  const levels = SHELL_LEVELS_BIG[kind];
  const step = levels ? Math.max(SHELL_STEP_PX, (hi - lo) / (levels - 1)) : SHELL_STEP_PX;
  const q = Math.min(hi, lo + Math.round(Math.max(0, sw - lo) / step) * step);
  return Math.round(q * 10) / 10;
}

/** Лицо на картинке тела: нет лица, глаза открыты, глаза закрыты (моргание), только знаки вида без черт лица (крест, звезда, стрелка-кольцо, вакуоль; решение владельца 26 октября 2026, сообщение 4, п. 2). */
export type Eyes = 'none' | 'open' | 'shut' | 'signs';

/**
 * Картинка тела с оболочкой толщины sw и лицом: одна на вид, толщину и состояние глаз. Лицо нарисовано прямо на теле, поэтому у бактерии на экране один объект вместо двух
 * (отдельная картинка лица удваивала число объектов и смену картинок при моргании, это главная часть роста стоимости кадра в ветке стиля); моргание — смена картинки тела
 * на такую же с закрытыми глазами. Картинка с закрытыми глазами рисуется при первом моргании вида и толщины. `small` — упрощённое лицо кокка для мелкого размера (лист образцов).
 */
export function styleBodyKey(scene: Phaser.Scene, kind: StyleKind, sw: number, eyes: Eyes = 'open', small = false): string {
  const q = shellQuant(kind, sw);
  const faceTag = eyes === 'none' ? '' : eyes === 'signs' ? '-k' : `-${eyes === 'open' ? 'o' : 'b'}${small ? '-s' : ''}`;
  return bakeCanvasArt(scene, `style-body-${kind}-${q}${faceTag}`, styleBodyBox(kind), (ctx, d) => {
    ctx.save();
    if (isCoreKind(kind)) drawBodyCanvas(ctx, d, kind, q);
    else drawBodyStyle(ctx, d, kind, q);
    ctx.restore();
    if (eyes === 'none') return;
    ctx.save();
    if (eyes === 'signs') drawKindSigns(ctx, kind);
    else if (isCoreKind(kind)) drawFaceCore(ctx, kind, eyes === 'shut', small);
    else drawFaceStyle(ctx, kind, eyes === 'shut');
    ctx.restore();
  });
}

// ---------------------------------------------------------------- лицо

function ellipsePath(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** Глаза рисуются на лицах бактерий: false — глаз нет ни у кого (решение владельца 25 октября 2026; рот, румянец, брови и знаки на лице остаются). Таблетки — `PILL_EYES` в `src/theme.ts`. */
export const EYES_DRAWN = false;

/** Глаз: белок с лёгким переходом, зрачок со смещением, блик в зрачке. */
function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, pr: number, dir: number, stroke: string, pupil: string, white = '#ffffff', line = 1.4): void {
  if (!EYES_DRAWN) return;
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
  if (!EYES_DRAWN) return;
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
function drawFaceCore(ctx: CanvasRenderingContext2D, kind: StyleKind, blink: boolean, small = false): void {
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
    for (const s of EYES_DRAWN ? ([-1, 1] as const) : []) {
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

// ---------------------------------------------------------------- лица остальных видов

/** Пара глаз: центры ±ex по горизонтали и ey по вертикали, белок rx × ry, зрачок pr, зрачки смотрят к носу; при моргании — дужки (весёлые) или линии. */
function eyePair(ctx: CanvasRenderingContext2D, blink: boolean, ex: number, ey: number, rx: number, ry: number, pr: number, ink: string, pupil: string, line: number, smile = true, white = '#ffffff'): void {
  for (const s of [-1, 1] as const) {
    if (blink) closedEye(ctx, s * ex, ey, rx * 0.9, line * 1.3, ink, smile);
    else eye(ctx, s * ex, ey, rx, ry, pr, -s, ink, pupil, white, line);
  }
}

/** Рот-дуга: улыбка (from..to — доли полукруга снизу). */
function smileArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, lw: number, ink: string, from = 0.12, to = 0.88): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI * from, Math.PI * to);
  ctx.stroke();
}

/** Бровь: отрезок толщины lw от (x0, y0) к (x1, y1). */
function brow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lw: number, ink: string): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Лицо видов, кроме кокка, бронированной и Гиганта: у каждого вида свой характер; знаки на лице (крест, звезда, кольцо-стрелка, рот фагоцита) — здесь же. */
function drawFaceStyle(ctx: CanvasRenderingContext2D, kind: StyleKind, blink: boolean): void {
  const cfg = CONFIG.types[kind];
  const r = cfg.radius;
  const col = COLORS.kinds[kind];
  const ink = css(darken(col.shell, 0.65));
  const dark = '#14202b';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (kind) {
    case 'swarm':
    case 'spore': {
      // мелкий размер (рой 14, спора 18): упрощённое лицо — крупные глаза далеко друг от друга, толстые зрачки и обводка, рот одной дугой; у споры два клычка
      const ex = r * 0.33;
      const ey = -r * 0.1;
      const sr = r * 0.27;
      eyePair(ctx, blink, ex, ey, sr, sr * 1.04, r * 0.17, ink, '#0c141c', r * 0.09);
      smileArc(ctx, 0, r * 0.26, r * 0.17, r * 0.09, ink);
      if (kind === 'spore') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        for (const s of [-1, 1] as const) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.14 - r * 0.045, r * 0.38);
          ctx.lineTo(s * r * 0.14 + r * 0.045, r * 0.38);
          ctx.lineTo(s * r * 0.14, r * 0.52);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      return;
    }
    case 'rod': {
      // палочка: бодрый взгляд в голове (вверху по своим осям), маленькая улыбка
      eyePair(ctx, blink, 9.5, -30, 7.4, 7.8, 4, ink, dark, 1.6);
      smileArc(ctx, 0, -20, 6.5, 2.2, ink);
      return;
    }
    case 'runner': {
      // бегун: сосредоточенный взгляд, брови вперёд-вниз
      eyePair(ctx, blink, 8.5, -11, 6.3, 6.5, 3.4, ink, dark, 1.5, false);
      for (const s of [-1, 1] as const) brow(ctx, s * 14.5, -21, s * 3.5, -17, 3, ink);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-4, 3);
      ctx.lineTo(4, 3);
      ctx.stroke();
      return;
    }
    case 'splitter': {
      // делящаяся: по одному большому глазу на долю, зрачки смотрят друг на друга, маленькая улыбка на перетяжке
      const off = r * SPLITTER_LOBE_OFFSET;
      for (const s of [-1, 1] as const) {
        if (blink) closedEye(ctx, s * off, -r * 0.08, r * 0.27, r * 0.07, ink, true);
        else eye(ctx, s * off, -r * 0.08, r * 0.3, r * 0.32, r * 0.17, -s, ink, dark, '#ffffff', 1.6);
      }
      smileArc(ctx, 0, r * 0.42, r * 0.2, r * 0.07, ink);
      return;
    }
    case 'healer': {
      // лекарь: розовый крест на лбу и добрые глаза
      healerCross(ctx, r, -r * 0.5, 1);
      eyePair(ctx, blink, r * 0.28, r * 0.08, r * 0.16, r * 0.17, r * 0.09, ink, dark, 1.3);
      smileArc(ctx, 0, r * 0.3, r * 0.17, r * 0.07, ink);
      return;
    }
    case 'slick': {
      // слизень: сонные глаза (верхняя половина закрыта веком) и маленький рот-кружок
      const lid = css(darken(col.body, 0.18));
      for (const s of EYES_DRAWN ? ([-1, 1] as const) : []) {
        const cx = s * r * 0.28;
        const cy = -r * 0.02;
        if (blink) {
          closedEye(ctx, cx, cy + r * 0.04, r * 0.18, r * 0.06, ink, false);
          continue;
        }
        eye(ctx, cx, cy, r * 0.2, r * 0.19, r * 0.1, -s, ink, dark, '#ffffff', 1.3);
        ctx.fillStyle = lid;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.215, r * 0.205, 0, Math.PI, Math.PI * 2);
        ctx.lineTo(cx + r * 0.215, cy - r * 0.02);
        ctx.lineTo(cx - r * 0.215, cy - r * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.215, cy - r * 0.02);
        ctx.lineTo(cx + r * 0.215, cy - r * 0.02);
        ctx.stroke();
      }
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = ink;
      circlePath(ctx, 0, r * 0.34, r * 0.07);
      ctx.stroke();
      return;
    }
    case 'regen': {
      // регенератор: белая стрелка-кольцо вокруг доброго лица
      regenArrow(ctx, r);
      eyePair(ctx, blink, r * 0.25, -r * 0.05, r * 0.15, r * 0.16, r * 0.085, ink, dark, 1.3);
      smileArc(ctx, 0, r * 0.14, r * 0.16, r * 0.065, ink);
      return;
    }
    case 'commander': {
      // командир: золотая звезда на лбу и суровый взгляд
      commanderStar(ctx, r, -r * 0.5, 0.25);
      eyePair(ctx, blink, r * 0.27, r * 0.1, r * 0.15, r * 0.13, r * 0.075, ink, '#0a1030', 1.3, false, '#f1f4ff');
      for (const s of [-1, 1] as const) brow(ctx, s * r * 0.4, r * 0.0, s * r * 0.12, r * 0.04, r * 0.07, ink);
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-r * 0.13, r * 0.38);
      ctx.lineTo(r * 0.13, r * 0.38);
      ctx.stroke();
      return;
    }
    case 'brood': {
      // матка: добрые усталые глаза над яйцами
      eyePair(ctx, blink, r * 0.27, -r * 0.2, r * 0.15, r * 0.16, r * 0.085, ink, dark, 1.4);
      smileArc(ctx, 0, -r * 0.04, r * 0.15, r * 0.055, ink);
      return;
    }
    case 'leaper': {
      // прыгун: огромные радостные глаза, брови-дуги вверх, рот «о»
      eyePair(ctx, blink, r * 0.3, -r * 0.12, r * 0.21, r * 0.23, r * 0.12, ink, dark, 1.4);
      for (const s of [-1, 1] as const) {
        ctx.lineWidth = r * 0.06;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.arc(s * r * 0.3, -r * 0.34, r * 0.17, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a0e08';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.1, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = ink;
      ctx.stroke();
      return;
    }
    case 'phago': {
      // фагоцит: глаза над огромным ртом: тёмный полукруг с зубами сверху
      eyePair(ctx, blink, r * 0.27, -r * 0.36, r * 0.15, r * 0.16, r * 0.085, ink, dark, 1.4);
      ctx.fillStyle = css(col.crack);
      ctx.beginPath();
      ctx.arc(0, r * 0.02, r * 0.52, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = css(darken(col.shell, 0.4));
      ctx.lineWidth = 1;
      for (const dx of [-0.34, -0.17, 0, 0.17, 0.34]) {
        ctx.beginPath();
        ctx.moveTo(dx * r - r * 0.07, r * 0.02);
        ctx.lineTo(dx * r + r * 0.07, r * 0.02);
        ctx.lineTo(dx * r, r * 0.17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      return;
    }
    case 'stealth': {
      // скрытная: только холодные светящиеся щели глаз (рта нет); без глаз лица нет
      for (const s of EYES_DRAWN ? ([-1, 1] as const) : []) {
        ctx.save();
        ctx.shadowColor = css(COLORS.stealthRim, 0.9);
        ctx.shadowBlur = 5;
        ctx.fillStyle = css(COLORS.stealthRim, 0.95);
        ctx.beginPath();
        if (blink) ctx.ellipse(s * r * 0.24, -r * 0.06, r * 0.1, r * 0.025, 0, 0, Math.PI * 2);
        else ctx.ellipse(s * r * 0.24, -r * 0.06, r * 0.085, r * 0.175, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    case 'toxin': {
      // токсин: тошнотный вид — маленькие глаза, зрачки в сторону, волнистый рот
      for (const s of [-1, 1] as const) {
        const cx = s * r * 0.26;
        if (blink) closedEye(ctx, cx, -r * 0.12, r * 0.13, r * 0.06, ink, false);
        else eye(ctx, cx, -r * 0.12, r * 0.14, r * 0.14, r * 0.075, 1, ink, dark, '#f3f7d8', 1.3);
      }
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = -r * 0.24 + (i / 12) * r * 0.48;
        const y = r * 0.3 + Math.sin(i * 1.05) * r * 0.045;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }
    case 'mutant': {
      // мутант: глаза разного размера и широкая кривая улыбка
      for (const [cx, cy, rx, ry, pr, side] of [[-r * 0.3, -r * 0.14, r * 0.2, r * 0.22, r * 0.12, -1], [r * 0.3, -r * 0.08, r * 0.11, r * 0.12, r * 0.07, 1]] as const) {
        if (blink) closedEye(ctx, cx, cy, rx * 0.9, r * 0.06, ink, true);
        else eye(ctx, cx, cy, rx, ry, pr, -side, ink, dark, '#ffffff', 1.4);
      }
      smileArc(ctx, 0, r * 0.12, r * 0.28, r * 0.07, ink, 0.08, 0.92);
      return;
    }
    case 'parasite': {
      // паразит: хитрые узкие глаза с бровями и кривая усмешка
      for (const s of [-1, 1] as const) {
        const cx = s * r * 0.28;
        if (blink) closedEye(ctx, cx, -r * 0.06, r * 0.17, r * 0.06, ink, false);
        else if (EYES_DRAWN) {
          ctx.fillStyle = css(0xf6efd8);
          ctx.beginPath();
          ctx.ellipse(cx, -r * 0.06, r * 0.19, r * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = ink;
          ctx.stroke();
          ctx.fillStyle = '#1a1208';
          ctx.beginPath();
          ctx.ellipse(cx - s * r * 0.03, -r * 0.06, r * 0.04, r * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        brow(ctx, cx + s * r * 0.2, -r * 0.27, cx - s * r * 0.16, -r * 0.17, r * 0.07, ink);
      }
      smileArc(ctx, r * 0.06, r * 0.2, r * 0.14, r * 0.06, ink, 0.1, 0.8);
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------- знаки вида без лица

/** Крест лекаря: центр по вертикали cy, размер ×k к прежнему. */
function healerCross(ctx: CanvasRenderingContext2D, r: number, cy: number, k: number): void {
  const arm = r * 0.27 * k;
  const th = r * 0.15 * k;
  ctx.fillStyle = css(COLORS.cross);
  ctx.strokeStyle = css(darken(COLORS.cross, 0.5));
  ctx.lineWidth = 1.4;
  rrPath(ctx, -th / 2, cy - arm, th, arm * 2, th * 0.3);
  ctx.fill();
  ctx.stroke();
  rrPath(ctx, -arm, cy - th / 2, arm * 2, th, th * 0.3);
  ctx.fill();
  ctx.stroke();
}

/** Белая стрелка-кольцо регенератора. */
function regenArrow(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = Math.max(3, r * 0.09);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, -0.4, Math.PI * 1.45);
  ctx.stroke();
  const tipA = Math.PI * 1.45;
  const tx = Math.cos(tipA) * r * 0.76;
  const ty = Math.sin(tipA) * r * 0.76;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(tx + r * 0.18, ty - r * 0.02);
  ctx.lineTo(tx - r * 0.12, ty - r * 0.18);
  ctx.lineTo(tx - r * 0.12, ty + r * 0.18);
  ctx.closePath();
  ctx.fill();
}

/** Золотая звезда командира: центр по вертикали cy, радиус k·r. */
function commanderStar(ctx: CanvasRenderingContext2D, r: number, cy: number, k: number): void {
  ctx.fillStyle = css(COLORS.star);
  ctx.strokeStyle = css(darken(COLORS.star, 0.55));
  ctx.lineWidth = 1.4;
  starPath(ctx, 0, cy, r * k);
  ctx.fill();
  ctx.stroke();
}

/**
 * Знаки вида без черт лица (решение владельца 26 октября 2026, сообщение 4, п. 2): крест лекаря, звезда командира и стрелка-кольцо регенератора — в центре тела и крупнее,
 * у поглотителя вместо рта с зубами — пищеварительная вакуоль (тёмный пузырь со съеденной крупинкой, сбоку). У остальных видов знак — само тело (броня, шипы, пятна, жгутики, щупальца).
 */
function drawKindSigns(ctx: CanvasRenderingContext2D, kind: StyleKind): void {
  const r = CONFIG.types[kind].radius;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'healer':
      healerCross(ctx, r, 0, 1.45);
      return;
    case 'commander':
      commanderStar(ctx, r, r * 0.02, 0.38);
      return;
    case 'regen':
      regenArrow(ctx, r);
      return;
    case 'phago': {
      const col = COLORS.kinds[kind];
      const vx = r * 0.18;
      const vy = r * 0.08;
      const grad = ctx.createRadialGradient(vx - r * 0.12, vy - r * 0.12, 0, vx, vy, r * 0.42);
      grad.addColorStop(0, css(lighten(col.crack, 0.25)));
      grad.addColorStop(1, css(col.crack));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(vx, vy, r * 0.4, r * 0.34, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = css(darken(col.shell, 0.55));
      ctx.stroke();
      // съеденная крупинка внутри вакуоли
      ctx.fillStyle = css(lighten(col.body, 0.35));
      ctx.beginPath();
      ctx.ellipse(vx + r * 0.08, vy + r * 0.04, r * 0.12, r * 0.09, 0.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------- движение на месте

/** Дыхание: пульсация масштаба ±3 %; период — у каждой бактерии свой в этих границах, секунд (у Гиганта медленнее). */
export const BREATH_AMP = 0.03;
/** Шаг округления показателя дыхания: масштаб меняется, когда показатель сдвинулся на столько (0,4 % размера — меньше пикселя у самой крупной бактерии без шипов). */
export const BREATH_STEP = 0.004;
export const BREATH_SEC: Record<StyleKind, [number, number]> = {
  coccus: [1.6, 2.4],
  rod: [1.5, 2.2],
  splitter: [1.6, 2.4],
  armored: [1.8, 2.6],
  spore: [1.2, 1.8],
  swarm: [0.9, 1.4],
  runner: [1.1, 1.7],
  healer: [1.7, 2.5],
  slick: [1.9, 2.7],
  regen: [1.7, 2.5],
  commander: [1.8, 2.6],
  brood: [2.2, 3.0],
  giant: [2.8, 3.6],
  leaper: [1.2, 1.8],
  phago: [2.0, 2.8],
  stealth: [1.8, 2.6],
  toxin: [1.8, 2.6],
  mutant: [1.6, 2.4],
  parasite: [1.4, 2.0],
};
/** Моргание: случайно раз в 2–5 секунд, около 120 мс. */
export const BLINK_EVERY_SEC: [number, number] = [2, 5];
export const BLINK_SEC = 0.12;

// ---------------------------------------------------------------- значок альманаха

/** Значок вида для альманаха: картинка нового тела (полное HP) с лицом (глаза открыты, первый кадр), вписанная в круг радиуса `radius`. */
export function styleIcon(scene: Phaser.Scene, kind: StyleKind, radius: number): Phaser.GameObjects.Container {
  const sw = shellWidth(kind, CONFIG.types[kind].hp);
  const body = artImage(scene, styleBodyKey(scene, kind, sw), styleBodyBox(kind));
  const holder = scene.add.container(0, 0, [body]);
  const { radius: r, length: l } = CONFIG.types[kind];
  const extent = kind === 'rod' || kind === 'runner' ? l / 2 : kind === 'splitter' ? r * (1 + SPLITTER_LOBE_OFFSET) : r;
  holder.setScale(radius / extent); // как прежний значок: тело вписано по наибольшему размеру (шипы Гиганта выходят за круг)
  return holder;
}
