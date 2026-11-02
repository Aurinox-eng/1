import Phaser from 'phaser';
import { artImage, bakeCanvasArt, squareBox, type ArtBox } from '../art';

/**
 * Рисунки главы 2 «Рот и зубы» для листа образцов (`?qa&artsheet=c2`, `c2s`; план `docs/content-plan-2026-10-26.md`, пп. 1, 2, 4, 5; `docs/levels30-enemies-plan-2026-10-26.md`, п. 8.4):
 * вид «Плёнка» и плёнка на дорожке, мини-боссы «Налёт» (Плёнка) и «Тень» (Скрытная), финальный босс «Кариес», препятствия «зуб» и «налёт», значки условий уровней 3 и 4.
 * Стиль пилота (вариант Б): объём, мягкая тень, свет сверху слева, без глаз и черт лица — только знаки вида. Рисуется стандартным Canvas 2D один раз в картинку (bakeCanvasArt).
 * В игру — после «да» владельца по листу: тогда цвета переходят в `src/theme.ts`, вид — в таблицу `types`.
 */

type Ctx = CanvasRenderingContext2D;

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
  return `rgba(${r},${g},${b},${a})`;
};

/** Цвета тела: тело, оболочка; знак вида — свой цвет. */
interface BodyColors {
  body: number;
  shell: number;
  sign: number;
}

/**
 * Плёнка — молочно-бирюзовая (заметно темнее белого, ободок мягкий: поправка 3.3 сообщения 1 от 2 ноября 2026) с прозрачной волнистой «юбкой»-плёнкой вокруг тела;
 * Зубной камень (мини-босс Плёнки, было «Налёт» — отменено 2 ноября 2026, п. 3.4) — жёлто-серый с бугристой коркой; Кариес — бурый с дуплами у одного края;
 * Тень — дымчато-фиолетовая полупрозрачная, без блика (п. 3.2).
 */
export const CH2_COLORS = {
  film: { body: 0x92cfd2, shell: 0x6eb2b8, sign: 0xd6f1f3 } as BodyColors,
  tartar: { body: 0xd8cf9c, shell: 0x857a4e, sign: 0xf1e8bf } as BodyColors,
  /** Корка препятствия «налёт» на карте (главы 2 и 7). */
  plaque: { body: 0xd8cf9c, shell: 0x857a4e, sign: 0xf1e8bf } as BodyColors,
  shadow: { body: 0xb6a4dc, shell: 0x8c7abd, sign: 0xe6dcff } as BodyColors,
  caries: { body: 0x7a5434, shell: 0x2f1c0e, sign: 0xc79a62 } as BodyColors,
  shadowTint: 0xa894d6,
  shadowSmoke: 0x4a3a6e,
  /** Кольцо босса «Кариес». */
  cariesRing: 0xe0a04a,
  /** Плёнка на дорожке (вид) и широкая плёнка (мини-босс Зубной камень). */
  patchFilm: 0xcdeef0,
  patchFilmEdge: 0x7cc4cf,
  patchPlaque: 0xd8cf9c,
  patchPlaqueEdge: 0xa89a62,
  enamel: 0xf4f7fb,
  enamelShade: 0xc9d3df,
  enamelLine: 0x7d8ca3,
  gum: 0xc76a7e,
};

/** Радиус вида «Плёнка», пикселей мира (как у скрытной: средний вид). Мини-босс и босс крупнее в `bossRules.scale` раз. */
export const FILM_RADIUS = 26;

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Волнистый замкнутый контур: n волн, радиус r, глубина волны amp (доля радиуса). */
function wavyPath(ctx: Ctx, r: number, n: number, amp: number, phase = 0): void {
  ctx.beginPath();
  const steps = n * 10;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 + amp * Math.sin(a * n + phase));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Тело в стиле пилота: мягкая тень, оболочка толщины sw с переходом цвета, тело, обводка тёмным оттенком оболочки, блик сверху слева. */
function roundBody(ctx: Ctx, d: number, r: number, sw: number, col: BodyColors, soft = false, withShine = true): void {
  // soft — мягкий ободок без резкого тёмного кольца (Плёнка, Тень); withShine — блик сверху слева (у Тени и Плёнки нет: светлая точка на теле читалась как зрачок)
  const outline = darken(col.shell, soft ? 0.28 : 0.6);
  ctx.save();
  ctx.shadowColor = 'rgba(4,8,22,0.5)';
  ctx.shadowBlur = r * 0.3 * d;
  ctx.shadowOffsetX = r * 0.05 * d;
  ctx.shadowOffsetY = r * 0.14 * d;
  ctx.fillStyle = css(col.shell);
  circle(ctx, 0, 0, r);
  ctx.fill();
  ctx.restore();
  const shell = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  shell.addColorStop(0, css(lighten(col.shell, 0.45)));
  shell.addColorStop(0.5, css(col.shell));
  shell.addColorStop(1, css(darken(col.shell, soft ? 0.14 : 0.4)));
  ctx.fillStyle = shell;
  circle(ctx, 0, 0, r);
  ctx.fill();
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.38, r * 0.08, 0, 0, r * 1.05);
  body.addColorStop(0, css(lighten(col.body, 0.5)));
  body.addColorStop(0.45, css(col.body));
  body.addColorStop(1, css(darken(col.body, soft ? 0.16 : 0.3)));
  ctx.fillStyle = body;
  circle(ctx, 0, 0, Math.max(1, r - sw));
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(outline, 0.65);
  circle(ctx, 0, 0, Math.max(1, r - sw));
  ctx.stroke();
  ctx.lineWidth = Math.max(2, r * (soft ? 0.04 : 0.06));
  ctx.strokeStyle = css(outline, soft ? 0.7 : 1);
  circle(ctx, 0, 0, r - ctx.lineWidth / 2);
  ctx.stroke();
  if (!withShine) return;
  const shine = ctx.createRadialGradient(-r * 0.36, -r * 0.42, 0, -r * 0.36, -r * 0.42, r * 0.34);
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  circle(ctx, -r * 0.36, -r * 0.42, r * 0.34);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  circle(ctx, -r * 0.4, -r * 0.46, r * 0.06);
  ctx.fill();
}

/** Знак Плёнки: прозрачная волнистая «юбка» вокруг тела (под телом) — рисуется до тела. */
function filmSkirt(ctx: Ctx, r: number, col: BodyColors): void {
  wavyPath(ctx, r * 1.2, 9, 0.055, 0.4);
  ctx.fillStyle = css(col.sign, 0.5);
  ctx.fill();
  ctx.lineWidth = Math.max(1.6, r * 0.05);
  ctx.strokeStyle = css(lighten(col.shell, 0.55), 0.8);
  ctx.stroke();
}

/** Знак Плёнки поверх тела: два глянцевых изогнутых блика-«натёка» (плёнка блестит). */
function filmSheen(ctx: Ctx, r: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0.15 * Math.PI, 0.42 * Math.PI);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0.2 * Math.PI, 0.38 * Math.PI);
  ctx.stroke();
}

/** Неровный ком (корка налёта): многоугольник из n точек на радиусе r со случайным отклонением, сглаженный кривыми. rnd — свой генератор (рисунок одинаков при каждом запуске). */
function lumpPath(ctx: Ctx, x: number, y: number, r: number, rnd: () => number, n = 8, flat = 0.78): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const rr = r * (0.72 + rnd() * 0.36);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * flat]);
  }
  ctx.beginPath();
  const mid = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Ком корки: тень снизу, переход цвета сверху слева, тонкая тёмная кромка. */
function lump(ctx: Ctx, x: number, y: number, r: number, col: BodyColors, rnd: () => number): void {
  const s = Math.floor(rnd() * 1e6);
  let a = s;
  const again = (): number => ((a = (a * 16807) % 2147483647 || 1) / 2147483647);
  let b = s;
  const same = (): number => ((b = (b * 16807) % 2147483647 || 1) / 2147483647);
  lumpPath(ctx, x, y + r * 0.12, r, again);
  ctx.fillStyle = css(darken(col.shell, 0.25), 0.85);
  ctx.fill();
  lumpPath(ctx, x, y, r, same);
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r * 1.1);
  g.addColorStop(0, css(lighten(col.body, 0.3)));
  g.addColorStop(0.6, css(col.body));
  g.addColorStop(1, css(darken(col.body, 0.22)));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = css(darken(col.shell, 0.1), 0.7);
  ctx.stroke();
}

/** Бугристая корка Налёта поверх тела: бугры с бликом сверху и тенью снизу, гуще на верхней половине. */
function plaqueCrust(ctx: Ctx, r: number, col: BodyColors): void {
  let seed = 41;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // корка — пласт неровных комьев на верхних двух третях тела; снизу видно гладкое тело
  const spots: [number, number, number][] = [
    [-0.42, -0.42, 0.3], [0.12, -0.58, 0.28], [0.52, -0.3, 0.27], [-0.66, 0.02, 0.22], [-0.16, -0.12, 0.3], [0.36, 0.08, 0.24], [-0.4, 0.36, 0.2], [0.62, 0.32, 0.16],
  ];
  for (const [x, y, s] of spots) lump(ctx, x * r, y * r, s * r, col, rnd);
}

/**
 * Дупла Кариеса (поправка 3.1 сообщения 1 от 2 ноября 2026): несимметрично — все у правого нижнего края тела, на разной высоте, разного размера, без центрального;
 * два — сколами по краю (тёмная выемка через кромку тела). Левая и верхняя части тела чистые.
 */
function cariesCavities(ctx: Ctx, r: number, col: BodyColors): void {
  // [x, y, полуось x, полуось y, поворот] в долях радиуса; высоты у всех разные
  const pits: [number, number, number, number, number][] = [
    [0.5, -0.24, 0.2, 0.15, 0.5], [0.24, 0.44, 0.13, 0.1, -0.2], [0.68, 0.18, 0.07, 0.06, 0.1], [0.02, 0.7, 0.06, 0.05, 0],
  ];
  for (const [px, py, rx, ry, rot] of pits) {
    ctx.beginPath();
    ctx.ellipse(px * r, py * r, rx * r * 1.2, ry * r * 1.28, rot, 0, Math.PI * 2);
    ctx.fillStyle = css(col.sign, 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px * r, py * r + ry * r * 0.12, rx * r, ry * r, rot, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(px * r, py * r + ry * r * 0.4, 0, px * r, py * r, rx * r);
    g.addColorStop(0, css(0x0c0603));
    g.addColorStop(1, css(darken(col.shell, 0.2)));
    ctx.fillStyle = g;
    ctx.fill();
  }
  // сколы по краю: неровная тёмная выемка, наполовину за кромкой тела, со светлой кромкой изнутри
  for (const [ang, size] of [[0.42, 0.17], [1.05, 0.11]] as const) {
    const cx = Math.cos(ang) * r * 0.98;
    const cy = Math.sin(ang) * r * 0.98;
    ctx.save();
    circle(ctx, 0, 0, r * 1.02);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const k = size * r * (0.8 + 0.35 * Math.abs(Math.sin(a * 2.3 + ang)));
      const x = cx + Math.cos(a) * k;
      const y = cy + Math.sin(a) * k * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = css(0x120a05);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    ctx.strokeStyle = css(col.sign, 0.9);
    ctx.stroke();
    ctx.restore();
  }
}

export type Ch2Body = 'film' | 'tartar' | 'caries' | 'shadow';

/** Рамка тела радиуса r с запасом под юбку и тень. */
function bodyBox(r: number): ArtBox {
  return squareBox(r * 1.3 + 14);
}

/**
 * Картинка тела главы 2: вид (`film`), мини-босс Зубной камень (`tartar`), босс Кариес (`caries`), мини-босс Тень (`shadow`: тело скрытной своим цветом, без юбки, со знаком вида —
 * пунктирным ободком внутри); sw — толщина оболочки (полная прочность — r × 0,22, 1 HP — r × 0,08).
 */
export function ch2BodyImage(scene: Phaser.Scene, which: Ch2Body, r: number, sw = r * 0.22): Phaser.GameObjects.Image {
  const box = bodyBox(r);
  const col = CH2_COLORS[which];
  const key = bakeCanvasArt(scene, `ch2-${which}-${r}-${Math.round(sw)}`, box, (ctx, d) => {
    ctx.lineJoin = 'round';
    if (which !== 'shadow') filmSkirt(ctx, r, which === 'film' ? col : { ...col, sign: which === 'tartar' ? col.sign : 0x9a7a52 });
    const soft = which === 'film' || which === 'shadow';
    roundBody(ctx, d, r, sw, col, soft, which === 'tartar'); // блик-точки нет у Плёнки, Тени и Кариеса: светлая точка рядом с тёмным читается как глаз
    if (which === 'film') filmSheen(ctx, r);
    if (which === 'tartar') plaqueCrust(ctx, r, col);
    if (which === 'shadow') {
      // знак скрытной: бледный пунктирный ободок внутри
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.strokeStyle = css(col.sign, 0.75);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.74, a, a + 0.38);
        ctx.stroke();
      }
    }
    if (which === 'caries') cariesCavities(ctx, r, col);
  });
  return artImage(scene, key, box);
}

/** Дымный рваный ореол мини-босса «Тень» (под телом скрытной): клочья дыма по кругу с разрывами. */
export function shadowHaloImage(scene: Phaser.Scene, r: number): Phaser.GameObjects.Image {
  const box = squareBox(r * 1.75);
  const key = bakeCanvasArt(scene, `ch2-shadow-halo-${r}`, box, (ctx) => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.15;
      if (i % 7 === 3) continue; // разрывы: ореол «рваный»
      const rr = r * (1.12 + rnd() * 0.28);
      const pr = r * (0.22 + rnd() * 0.16);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
      g.addColorStop(0, css(CH2_COLORS.shadowSmoke, 0.85));
      g.addColorStop(1, css(CH2_COLORS.shadowSmoke, 0));
      ctx.fillStyle = g;
      circle(ctx, x, y, pr);
      ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, r * 0.035);
    ctx.strokeStyle = css(lighten(CH2_COLORS.shadowTint, 0.2), 0.55);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, a, a + 0.55);
      ctx.stroke();
    }
  });
  return artImage(scene, key, box);
}

/**
 * Плёнка на дорожке: вытянутое полупрозрачное пятно вдоль дорожки (ось x — направление дорожки) длиной len и шириной wid, с глянцевыми волнами внутри.
 * `wide` — плёнка мини-босса Налёт (жёлто-серая, шире и дольше).
 */
export function filmPatchImage(scene: Phaser.Scene, len: number, wid: number, wide = false): Phaser.GameObjects.Image {
  const box: ArtBox = { x: -len / 2 - 6, y: -wid / 2 - 6, w: len + 12, h: wid + 12 };
  const fill = wide ? CH2_COLORS.patchPlaque : CH2_COLORS.patchFilm;
  const edge = wide ? CH2_COLORS.patchPlaqueEdge : CH2_COLORS.patchFilmEdge;
  const key = bakeCanvasArt(scene, `ch2-patch-${wide ? 'w' : 'n'}-${Math.round(len)}-${Math.round(wid)}`, box, (ctx) => {
    const blob = (): void => {
      ctx.beginPath();
      const n = 64;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob = 1 + 0.06 * Math.sin(a * 5 + 0.7) + 0.04 * Math.sin(a * 9);
        const x = Math.cos(a) * (len / 2) * wob;
        const y = Math.sin(a) * (wid / 2) * wob;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    blob();
    const g = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
    g.addColorStop(0, css(lighten(fill, 0.3), 0.55));
    g.addColorStop(1, css(fill, 0.38));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = css(edge, 0.9);
    ctx.stroke();
    ctx.save();
    blob();
    ctx.clip();
    ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      const y0 = k * wid * 0.24;
      for (let i = 0; i <= 24; i++) {
        const x = -len / 2 + (i / 24) * len;
        const y = y0 + Math.sin((i / 24) * Math.PI * 4 + k) * wid * 0.05;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = k === 0 ? 2.4 : 1.6;
      ctx.strokeStyle = `rgba(255,255,255,${k === 0 ? 0.6 : 0.4})`;
      ctx.stroke();
    }
    ctx.restore();
  });
  return artImage(scene, key, box);
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Клетка-основа препятствия (как закрытая клетка карты: тёмная, со скруглением). */
function cellBase(ctx: Ctx, size: number): void {
  rr(ctx, -size / 2, -size / 2, size, size, 12);
  ctx.fillStyle = '#0d1830';
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,70,125,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Зуб — непроходимое препятствие на одну клетку: коронка коренного зуба (эмаль, два бугра сверху), десна у основания. size — сторона клетки. */
export function toothImage(scene: Phaser.Scene, size: number): Phaser.GameObjects.Image {
  const box = squareBox(size / 2 + 4);
  const key = bakeCanvasArt(scene, `ch2-tooth-${Math.round(size)}`, box, (ctx, d) => {
    cellBase(ctx, size);
    const w = size * 0.74;
    const h = size * 0.7;
    const top = -h / 2 - size * 0.02;
    const crown = (): void => {
      ctx.beginPath();
      ctx.moveTo(-w / 2, top + h * 0.3);
      ctx.quadraticCurveTo(-w / 2, top, -w * 0.25, top + h * 0.02);
      ctx.quadraticCurveTo(0, top + h * 0.2, w * 0.25, top + h * 0.02);
      ctx.quadraticCurveTo(w / 2, top, w / 2, top + h * 0.3);
      ctx.lineTo(w * 0.44, top + h * 0.82);
      ctx.quadraticCurveTo(w * 0.4, top + h, w * 0.18, top + h);
      ctx.lineTo(-w * 0.18, top + h);
      ctx.quadraticCurveTo(-w * 0.4, top + h, -w * 0.44, top + h * 0.82);
      ctx.closePath();
    };
    // десна под зубом
    ctx.beginPath();
    ctx.ellipse(0, top + h * 0.98, w * 0.56, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = css(CH2_COLORS.gum, 0.95);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,22,0.55)';
    ctx.shadowBlur = size * 0.08 * d;
    ctx.shadowOffsetY = size * 0.04 * d;
    crown();
    ctx.fillStyle = css(CH2_COLORS.enamelShade);
    ctx.fill();
    ctx.restore();
    crown();
    const g = ctx.createLinearGradient(-w / 2, top, w / 2, top + h);
    g.addColorStop(0, css(0xffffff));
    g.addColorStop(0.55, css(CH2_COLORS.enamel));
    g.addColorStop(1, css(CH2_COLORS.enamelShade));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = css(CH2_COLORS.enamelLine);
    ctx.stroke();
    // ложбинка между буграми и блик
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = css(CH2_COLORS.enamelLine, 0.55);
    ctx.beginPath();
    ctx.moveTo(0, top + h * 0.2);
    ctx.quadraticCurveTo(w * 0.04, top + h * 0.42, 0, top + h * 0.56);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, top + h * 0.3);
    ctx.quadraticCurveTo(-w * 0.34, top + h * 0.55, -w * 0.26, top + h * 0.72);
    ctx.stroke();
  });
  return artImage(scene, key, box);
}

/**
 * Налёт — разрушаемое препятствие на cells клеток в ряд (2–3): бугристая жёлто-серая корка; stage 0 — целый, 1 — треть разбита (трещины, откололся край),
 * 2 — две трети разбиты (крошится, сквозь корку видны клетки). size — сторона клетки, tile — шаг клеток.
 */
export function plaqueObstacleImage(scene: Phaser.Scene, cells: number, size: number, tile: number, stage: 0 | 1 | 2): Phaser.GameObjects.Image {
  const total = (cells - 1) * tile + size;
  const box: ArtBox = { x: -total / 2 - 6, y: -size / 2 - 6, w: total + 12, h: size + 12 };
  const key = bakeCanvasArt(scene, `ch2-plaque-${cells}-${Math.round(size)}-${stage}`, box, (ctx, d) => {
    for (let i = 0; i < cells; i++) {
      ctx.save();
      ctx.translate(-total / 2 + size / 2 + i * tile, 0);
      cellBase(ctx, size);
      ctx.restore();
    }
    let seed = 99;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const col = CH2_COLORS.plaque;
    // корка — неровные комья в пределах клеток (2 ряда по ширине клетки), гуще в середине
    const lumps: [number, number, number][] = [];
    const nx = cells * 3;
    const span = total - size * 0.2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < 3; j++) {
        const x = -span / 2 + (i + 0.5 + (rnd() - 0.5) * 0.4) * (span / nx);
        const y = (j - 1) * size * 0.26 + (rnd() - 0.5) * size * 0.08;
        lumps.push([x, y, size * (0.17 + rnd() * 0.06)]);
      }
    }
    const kept = lumps.filter((_, k) => (stage === 0 ? true : stage === 1 ? k % 4 !== 1 && k < lumps.length * 0.8 : k % 3 === 0 || k % 5 === 2));
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,22,0.45)';
    ctx.shadowBlur = size * 0.06 * d;
    ctx.shadowOffsetY = size * 0.03 * d;
    for (let i = 0; i < cells; i++) {
      rr(ctx, -total / 2 + i * tile + size * 0.08, -size * 0.42, size * 0.84, size * 0.84, 10);
      ctx.fillStyle = css(darken(col.body, 0.35), stage === 0 ? 0.9 : stage === 1 ? 0.55 : 0.2);
      ctx.fill();
    }
    ctx.restore();
    for (const [x, y, r] of kept) lump(ctx, x, y, r, col, rnd);
    if (stage > 0) {
      // трещины поверх корки
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(darken(col.shell, 0.45), 0.9);
      ctx.lineWidth = 2.6;
      const cracks = stage === 1 ? 3 : 5;
      for (let c = 0; c < cracks; c++) {
        let x = -total / 2 + size * 0.3 + (c / Math.max(1, cracks - 1)) * (total - size * 0.6);
        let y = -size * 0.36;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          x += (rnd() - 0.5) * size * 0.3;
          y += size * 0.2;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  });
  return artImage(scene, key, box);
}

export type ConditionIcon = 'sweet' | 'nosell';

/** Значок условия уровня (круглая плашка радиуса r): «Сладкое» — конфета в обёртке; «Без продажи» — монета, перечёркнутая красным кругом. */
export function conditionIconImage(scene: Phaser.Scene, id: ConditionIcon, r: number): Phaser.GameObjects.Image {
  const box = squareBox(r + 6);
  const key = bakeCanvasArt(scene, `ch2-cond-${id}-${r}`, box, (ctx, d) => {
    ctx.save();
    ctx.shadowColor = 'rgba(4,8,22,0.5)';
    ctx.shadowBlur = r * 0.2 * d;
    ctx.shadowOffsetY = r * 0.08 * d;
    circle(ctx, 0, 0, r);
    ctx.fillStyle = '#1d3a6a';
    ctx.fill();
    ctx.restore();
    const plate = ctx.createLinearGradient(0, -r, 0, r);
    plate.addColorStop(0, '#2f5694');
    plate.addColorStop(1, '#1a3360');
    circle(ctx, 0, 0, r);
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.strokeStyle = 'rgba(190,220,255,0.75)';
    ctx.stroke();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (id === 'sweet') {
      const k = r * 0.32;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * k * 0.9, 0);
        ctx.lineTo(s * k * 2.1, -k * 0.75);
        ctx.lineTo(s * k * 1.9, 0);
        ctx.lineTo(s * k * 2.1, k * 0.75);
        ctx.closePath();
        ctx.fillStyle = '#ff9ec4';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        ctx.strokeStyle = '#a3386a';
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(-k * 0.35, -k * 0.4, 0, 0, 0, k * 1.1);
      g.addColorStop(0, '#ffe0ee');
      g.addColorStop(1, '#ff5f9e');
      circle(ctx, 0, 0, k * 1.05);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.strokeStyle = '#a3386a';
      ctx.stroke();
      ctx.save();
      circle(ctx, 0, 0, k * 1.05);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = k * 0.28;
      for (const off of [-0.6, 0.15, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(off * k - k, -k * 1.2);
        ctx.lineTo(off * k + k, k * 1.2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      const k = r * 0.5;
      const g = ctx.createRadialGradient(-k * 0.3, -k * 0.35, 0, 0, 0, k);
      g.addColorStop(0, '#fff3a8');
      g.addColorStop(0.6, '#f2c230');
      g.addColorStop(1, '#b8860b');
      circle(ctx, 0, 0, k);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.strokeStyle = '#7a5600';
      ctx.stroke();
      circle(ctx, 0, 0, k * 0.68);
      ctx.lineWidth = Math.max(1.2, r * 0.04);
      ctx.strokeStyle = 'rgba(122,86,0,0.7)';
      ctx.stroke();
      // красный круг с чертой «нельзя»
      ctx.lineWidth = Math.max(3, r * 0.13);
      ctx.strokeStyle = '#ff4a4a';
      circle(ctx, 0, 0, r * 0.74);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, -r * 0.52);
      ctx.lineTo(r * 0.52, r * 0.52);
      ctx.stroke();
    }
  });
  return artImage(scene, key, box);
}
