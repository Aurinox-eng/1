import { CONFIG } from './config';

/** Точка в пикселях мира. */
export interface Vec {
  x: number;
  y: number;
}

/**
 * Ребро графа дорожек: плавная кривая от одного узла к другому (по ней ходят бактерии и по ней рисуется дорожка).
 * Узел — место, где дорожки расходятся (развилка) или сходятся (слияние).
 */
export interface Edge {
  id: number;
  from: string;
  to: string;
  pts: Vec[];
  /** cum[i] — длина от начала ребра до точки i, пикселей. */
  cum: number[];
  length: number;
  /** Сколько пикселей от конца этого ребра до организма по самому короткому пути (считается при сборке уровня). */
  remainingAtEnd: number;
}

/** На сколько отрезков разбивается каждое ребро (больше — глаже). */
const SAMPLES = 28;

/** Центр клетки (колонка, ряд) в пикселях мира. Числа могут быть дробными и выходить за карту (вход — за правым краем). */
export function tileCenter(col: number, row: number): Vec {
  const { orgW, tile } = CONFIG.map;
  return { x: orgW + tile * (col + 0.5), y: tile * (row + 0.5) };
}

/**
 * Строит ребро между двумя узлами (их координаты — в клетках). Кривая — кубическая Безье с горизонтальными касательными на
 * концах: поэтому в узле все рёбра стыкуются гладко, а между разными рядами получается плавная S-образная дорожка.
 */
export function buildEdge(id: number, from: string, to: string, a: readonly [number, number], b: readonly [number, number]): Edge {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x1 - x2;
  const c1 = [x1 - dx * 0.5, y1];
  const c2 = [x2 + dx * 0.5, y2];
  const pts: Vec[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const v = 1 - u;
    const col = v * v * v * x1 + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * x2;
    const row = v * v * v * y1 + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * y2;
    pts.push(tileCenter(col, row));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { id, from, to, pts, cum, length: cum[cum.length - 1], remainingAtEnd: 0 };
}

/** Точка ребра на расстоянии s от его начала (за пределами — концы ребра) и направление движения, радианы. */
export function pointAt(edge: Edge, s: number): Vec & { angle: number } {
  const { pts, cum } = edge;
  const d = Math.max(0, Math.min(edge.length, s));
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
