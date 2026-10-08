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

/** Самая большая сторона текстуры, пикселей: больше не принимают многие видеокарты (телефоны — точно). Огромный рисунок (например, аура при
 *  радиусе, подменённом в проверке) рисуется реже, чем ART_DENSITY, чтобы уложиться в этот размер. */
const MAX_TEXTURE_PX = 4096;
/** С какой плотностью нарисована каждая картинка (ключ → плотность): картинка на экране уменьшается ровно настолько же. */
const densityOf = new Map<string, number>();

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
  density = Math.min(density, MAX_TEXTURE_PX / Math.max(1, box.w, box.h));
  densityOf.set(key, density);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.scaleCanvas(density, density);
  g.translateCanvas(-box.x, -box.y);
  draw(g);
  g.generateTexture(key, Math.max(1, Math.ceil(box.w * density)), Math.max(1, Math.ceil(box.h * density)));
  g.destroy();
  return key;
}

/** Картинка из готовой текстуры, поставленная так, что её точка 0,0 совпадает с центром объекта (как у прежнего рисунка Graphics). */
export function artImage(scene: Phaser.Scene, key: string, box: ArtBox): Phaser.GameObjects.Image {
  return scene.add
    .image(0, 0, key)
    .setOrigin(-box.x / box.w, -box.y / box.h)
    .setScale(1 / artDensity(key));
}

/** Меняет текстуру картинки на другую (origin пересчитывается по рамке, размер — по плотности картинки). */
export function setArt(image: Phaser.GameObjects.Image, key: string, box: ArtBox): void {
  image.setTexture(key).setOrigin(-box.x / box.w, -box.y / box.h).setScale(1 / artDensity(key));
}

/** С какой плотностью нарисована картинка (для своих кружков частиц и вспышек — чтобы задать размер на экране). */
export function artDensity(key: string): number {
  return densityOf.get(key) ?? ART_DENSITY;
}

/** Белое кольцо радиуса radius и толщины width (цвет задаётся оттенком картинки: setTint). Одна картинка на радиус и толщину. */
export function ringArt(scene: Phaser.Scene, radius: number, width: number): { key: string; box: ArtBox } {
  const r = Math.round(radius * 2) / 2;
  const box = squareBox(r + width / 2 + 2);
  const key = bakeArt(scene, `ring-${r}-${width}`, box, (g) => g.lineStyle(width, 0xffffff, 1).strokeCircle(0, 0, r));
  return { key, box };
}

/** Кольцо-картинка вместо фигуры Arc со штрихом: тот же радиус, толщина, цвет и прозрачность; центр картинки — в (x, y). */
export function ringImage(scene: Phaser.Scene, x: number, y: number, radius: number, width: number, color: number, alpha = 1): Phaser.GameObjects.Image {
  const { key, box } = ringArt(scene, radius, width);
  return artImage(scene, key, box).setPosition(x, y).setTint(color).setAlpha(alpha);
}

/** Круг с заливкой и обводкой (ауры лекаря и командира) — одна картинка на набор чисел. */
export function discImage(
  scene: Phaser.Scene,
  radius: number,
  fill: number,
  fillAlpha: number,
  stroke: number,
  strokeWidth: number,
  strokeAlpha: number,
): Phaser.GameObjects.Image {
  const box = squareBox(radius + strokeWidth / 2 + 2);
  const key = bakeArt(scene, `disc-${radius}-${fill}-${fillAlpha}-${stroke}-${strokeWidth}-${strokeAlpha}`, box, (g) => {
    g.fillStyle(fill, fillAlpha).fillCircle(0, 0, radius);
    if (strokeWidth > 0) g.lineStyle(strokeWidth, stroke, strokeAlpha).strokeCircle(0, 0, radius);
  });
  return artImage(scene, key, box);
}

/**
 * Простые фигуры для рисунков башен (запекаются один раз в текстуру). Цвет — число 0xRRGGBB, null — «не рисовать».
 * Свечения (shadowBlur обычного canvas в Graphics недоступны) имитируются несколькими полупрозрачными слоями — glow*.
 */
export type Pt = readonly [number, number];
type G = Phaser.GameObjects.Graphics;

/** Скруглённый прямоугольник: заливка (с прозрачностью fa) и обводка толщины lw. */
export function shRR(g: G, x: number, y: number, w: number, h: number, r: number, fill: number | null, stroke: number | null = null, lw = 2, fa = 1): void {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  if (fill !== null) {
    g.fillStyle(fill, fa);
    if (rad > 0) g.fillRoundedRect(x, y, w, h, rad);
    else g.fillRect(x, y, w, h);
  }
  if (stroke !== null) {
    g.lineStyle(lw, stroke, 1);
    if (rad > 0) g.strokeRoundedRect(x, y, w, h, rad);
    else g.strokeRect(x, y, w, h);
  }
}

/** Круг: заливка и обводка. */
export function shCirc(g: G, x: number, y: number, r: number, fill: number | null, stroke: number | null = null, lw = 2, fa = 1): void {
  if (fill !== null) g.fillStyle(fill, fa).fillCircle(x, y, r);
  if (stroke !== null) g.lineStyle(lw, stroke, 1).strokeCircle(x, y, r);
}

/** Эллипс с полуосями rx, ry. */
export function shEll(g: G, x: number, y: number, rx: number, ry: number, fill: number | null, stroke: number | null = null, lw = 2, fa = 1): void {
  if (fill !== null) g.fillStyle(fill, fa).fillEllipse(x, y, rx * 2, ry * 2);
  if (stroke !== null) g.lineStyle(lw, stroke, 1).strokeEllipse(x, y, rx * 2, ry * 2);
}

/** Многоугольник по точкам. */
export function shPoly(g: G, pts: readonly Pt[], fill: number | null, stroke: number | null = null, lw = 2, fa = 1): void {
  const p = pts.map(([x, y]) => ({ x, y }));
  if (fill !== null) g.fillStyle(fill, fa).fillPoints(p, true);
  if (stroke !== null) g.lineStyle(lw, stroke, 1).strokePoints(p, true);
}

/** Отрезок. */
export function shLine(g: G, x1: number, y1: number, x2: number, y2: number, color: number, lw: number, a = 1): void {
  g.lineStyle(lw, color, a).lineBetween(x1, y1, x2, y2);
}

/** Дуга окружности (только обводка). */
export function shArc(g: G, x: number, y: number, r: number, a0: number, a1: number, color: number, lw: number, a = 1): void {
  g.lineStyle(lw, color, a).beginPath();
  g.arc(x, y, r, a0, a1);
  g.strokePath();
}

/** Ломаная линия по точкам (не замкнутая). */
export function shPath(g: G, pts: readonly Pt[], color: number, lw: number, a = 1): void {
  g.lineStyle(lw, color, a).strokePoints(
    pts.map(([x, y]) => ({ x, y })),
    false,
  );
}

/** Четырёхконечная звезда. */
export function shStar(g: G, x: number, y: number, r: number, color: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rad = i % 2 ? r * 0.3 : r;
    pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
  }
  shPoly(g, pts, color);
}

/** Точки квадратичной кривой Безье от p0 через c к p1 (без самой p0). */
export function shQuad(p0: Pt, c: Pt, p1: Pt, n = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

/** Повернуть точки на angle радиан вокруг (ox, oy) и сдвинуть так, что (0,0) фигуры окажется в (ox, oy). */
export function shRot(pts: readonly Pt[], ox: number, oy: number, angle: number): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map(([x, y]) => [ox + x * c - y * s, oy + x * s + y * c] as Pt);
}

/** Прямоугольник как 4 точки (для поворота). */
export function shBox(x: number, y: number, w: number, h: number): Pt[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

const GLOW_LAYERS = 5;

/** Свечение круга: слои круга всё большего радиуса с малой прозрачностью (рисовать ДО самой фигуры). */
export function glowCircle(g: G, x: number, y: number, r: number, color: number, spread = 10, alpha = 0.5): void {
  for (let i = GLOW_LAYERS; i >= 1; i--) g.fillStyle(color, alpha / GLOW_LAYERS).fillCircle(x, y, r + (spread * i) / GLOW_LAYERS);
}

/** Свечение скруглённого прямоугольника. */
export function glowRR(g: G, x: number, y: number, w: number, h: number, r: number, color: number, spread = 10, alpha = 0.5): void {
  for (let i = GLOW_LAYERS; i >= 1; i--) {
    const e = (spread * i) / GLOW_LAYERS;
    shRR(g, x - e, y - e, w + e * 2, h + e * 2, r + e, color, null, 0, alpha / GLOW_LAYERS);
  }
}

/** Свечение кольца (обводки круга радиуса r и толщины lw). */
export function glowRing(g: G, x: number, y: number, r: number, lw: number, color: number, spread = 10, alpha = 0.5): void {
  for (let i = GLOW_LAYERS; i >= 1; i--) g.lineStyle(lw + (spread * 2 * i) / GLOW_LAYERS, color, alpha / GLOW_LAYERS).strokeCircle(x, y, r);
}
