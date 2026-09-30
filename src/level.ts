import { CONFIG } from './config';
import { buildRoute, type Route } from './pathing';

/**
 * Данные уровня: размер карты и дорожки. Это данные, а не код: другой уровень — другая таблица.
 * Точки маршрутов — (колонка, ряд) центра клетки; колонка 18.6 — за правым краем (вход), -1 — уже в организме (выход).
 * Два входа справа сливаются в одну дорожку и снова расходятся на два выхода; каждая бактерия получает один из
 * четырёх маршрутов (какой вход и какой выход) при выходе на карту.
 */
export const LEVEL = {
  /** Размер карты в клетках. */
  cols: 18,
  rows: 14,
  /** Радиус скругления поворотов дорожки, в клетках. */
  curve: 0.7,
  routes: [
    [[18.6, 2], [14, 2], [14, 5], [11, 5], [11, 7], [6, 7], [6, 4], [3, 4], [3, 2], [-1, 2]], // вход 1 → выход 1
    [[18.6, 2], [14, 2], [14, 5], [11, 5], [11, 7], [6, 7], [6, 10], [3, 10], [3, 12], [-1, 12]], // вход 1 → выход 2
    [[18.6, 11], [14, 11], [14, 9], [11, 9], [11, 7], [6, 7], [6, 4], [3, 4], [3, 2], [-1, 2]], // вход 2 → выход 1
    [[18.6, 11], [14, 11], [14, 9], [11, 9], [11, 7], [6, 7], [6, 10], [3, 10], [3, 12], [-1, 12]], // вход 2 → выход 2
  ] as ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  /** Центр экрана при старте уровня, в клетках (около слияния дорожек). */
  startCenter: [9.75, 6] as readonly [number, number],
};

/** Размер мира в пикселях: зона организма слева + сетка клеток. */
export const WORLD = {
  w: CONFIG.map.orgW + LEVEL.cols * CONFIG.map.tile,
  h: LEVEL.rows * CONFIG.map.tile,
};

/** Готовые маршруты (в том же порядке, что и LEVEL.routes). */
export const ROUTES: Route[] = LEVEL.routes.map((cells) => buildRoute(cells, LEVEL.curve));

export const cellKey = (col: number, row: number): string => `${col},${row}`;

/** Клетки, по которым идёт дорожка: башни там ставить нельзя. */
export const PATH_TILES: ReadonlySet<string> = (() => {
  const tiles = new Set<string>();
  for (const route of LEVEL.routes) {
    for (let i = 0; i < route.length - 1; i++) {
      const [c0, r0] = route[i];
      const [c1, r1] = route[i + 1];
      for (let c = Math.round(Math.min(c0, c1)); c <= Math.round(Math.max(c0, c1)); c++) {
        for (let r = Math.round(Math.min(r0, r1)); r <= Math.round(Math.max(r0, r1)); r++) {
          if (c >= 0 && c < LEVEL.cols && r >= 0 && r < LEVEL.rows) tiles.add(cellKey(c, r));
        }
      }
    }
  }
  return tiles;
})();

/** Клетка под точкой мира или null, если точка вне сетки (например, в зоне организма). */
export function worldToCell(x: number, y: number): [number, number] | null {
  const { orgW, tile } = CONFIG.map;
  const col = Math.floor((x - orgW) / tile);
  const row = Math.floor(y / tile);
  if (col < 0 || col >= LEVEL.cols || row < 0 || row >= LEVEL.rows) return null;
  return [col, row];
}
