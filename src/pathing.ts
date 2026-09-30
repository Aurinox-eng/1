import { CONFIG } from './config';

/** Точка в пикселях мира. */
export interface Vec {
  x: number;
  y: number;
}

/** Готовый маршрут: ломаная с плавными поворотами и накопленной длиной — по ней ходят бактерии и по ней рисуется дорожка. */
export interface Route {
  pts: Vec[];
  /** cum[i] — длина пути от начала до точки i, пикселей. */
  cum: number[];
  length: number;
}

/** На сколько отрезков разбивается каждый поворот (больше — глаже). */
const CURVE_STEPS = 10;

/** Центр клетки (колонка, ряд) в пикселях мира. Числа могут быть дробными и выходить за карту (вход — за правым краем). */
export function tileCenter(col: number, row: number): Vec {
  const { orgW, tile } = CONFIG.map;
  return { x: orgW + tile * (col + 0.5), y: tile * (row + 0.5) };
}

const dist = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Строит маршрут по точкам-поворотам (в клетках). На каждом повороте прямые скругляются кривой Безье;
 * curveTiles — радиус скругления в клетках (0.7 — плавно, но прямые участки остаются).
 */
export function buildRoute(cells: readonly (readonly [number, number])[], curveTiles: number): Route {
  const p = cells.map(([c, r]) => tileCenter(c, r));
  const radius = curveTiles * CONFIG.map.tile;
  const pts: Vec[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1];
    const cur = p[i];
    const next = p[i + 1];
    const l1 = dist(prev, cur);
    const l2 = dist(cur, next);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = { x: cur.x + ((prev.x - cur.x) / l1) * r, y: cur.y + ((prev.y - cur.y) / l1) * r };
    const b = { x: cur.x + ((next.x - cur.x) / l2) * r, y: cur.y + ((next.y - cur.y) / l2) * r };
    pts.push(a);
    for (let k = 1; k <= CURVE_STEPS; k++) {
      const u = k / CURVE_STEPS;
      pts.push({
        x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cur.x + u * u * b.x,
        y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cur.y + u * u * b.y,
      });
    }
  }
  pts.push(p[p.length - 1]);

  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Точка маршрута на расстоянии s от начала (за пределами — концы маршрута) и направление движения, радианы. */
export function pointAt(route: Route, s: number): Vec & { angle: number } {
  const { pts, cum } = route;
  const d = Math.max(0, Math.min(route.length, s));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = cum[hi] - cum[lo];
  const u = seg > 0 ? (d - cum[lo]) / seg : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
