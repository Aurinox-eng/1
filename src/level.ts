import { CONFIG } from './config';
import { buildEdge, tileCenter, type Edge } from './pathing';

/**
 * Данные уровня: размер карты и сеть дорожек. Это данные, а не код: другой уровень — другие таблицы.
 *
 * Сеть похожа на корневую систему: три «кончика» справа (входы) сходятся в каналы, между ветвями длинные петли, у организма
 * «ствол», который расходится тремя «корешками» (выходами). Узел — точка (колонка, ряд) в клетках; колонка 18.6 — за правым
 * краем (вход), -1 — уже в организме (выход). Ребро — плавная кривая от узла к узлу; бактерии идут по рёбрам только влево, а на
 * каждой развилке (узле, из которого выходит несколько рёбер) выбирают ребро случайно и поровну.
 */
export const LEVEL = {
  /** Размер карты в клетках. */
  cols: 18,
  rows: 14,
  nodes: {
    T1: [18.6, 2.4], T2: [18.6, 7.0], T3: [18.6, 11.6], // кончики корня справа — входы
    K1: [14.2, 3.2], K2: [15.6, 7.0], K3: [13.6, 10.8],
    Mu: [11.4, 5.0], Ml: [11.0, 9.0],
    Ru: [9.8, 2.2], Rl: [9.2, 11.8],
    Nu: [6.6, 4.8], Nl: [6.2, 9.3],
    Z: [4.0, 7.0], // «ствол» у организма
    X1: [-1, 3.4], X2: [-1, 7.0], X3: [-1, 10.6], // корешки к организму — выходы
  } as Record<string, readonly [number, number]>,
  edges: [
    ['T1', 'K1'], ['T2', 'K2'], ['T3', 'K3'],
    ['K1', 'Mu'], ['K1', 'Ru'], ['K2', 'Mu'], ['K2', 'Ml'], ['K3', 'Ml'], ['K3', 'Rl'],
    ['Mu', 'Nu'], ['Ru', 'Nu'], ['Ml', 'Nl'], ['Rl', 'Nl'],
    ['Nu', 'Z'], ['Nl', 'Z'],
    ['Z', 'X1'], ['Z', 'X2'], ['Z', 'X3'],
  ] as ReadonlyArray<readonly [string, string]>,
  /** Центр экрана при старте уровня, в клетках (середина сети). */
  startCenter: [9.75, 7] as readonly [number, number],
};

/** Размер мира в пикселях: зона организма слева + сетка клеток. */
export const WORLD = {
  w: CONFIG.map.orgW + LEVEL.cols * CONFIG.map.tile,
  h: LEVEL.rows * CONFIG.map.tile,
};

/** Готовые рёбра (в том же порядке, что и LEVEL.edges). */
export const EDGES: Edge[] = LEVEL.edges.map(([from, to], i) => buildEdge(i, from, to, LEVEL.nodes[from], LEVEL.nodes[to]));

/** Рёбра, выходящие из узла. */
export const EDGES_FROM: Record<string, Edge[]> = {};
const incoming = new Set<string>();
for (const edge of EDGES) {
  (EDGES_FROM[edge.from] ??= []).push(edge);
  incoming.add(edge.to);
}

/** Рёбра-входы: те, что начинаются в узле, в который ничего не входит (кончики корня справа). */
export const ENTRANCE_EDGES: Edge[] = EDGES.filter((edge) => !incoming.has(edge.from));

// Сколько пикселей от узла до организма по самому короткому пути (нужно башням: «ближе всех к организму»)
const remainingFromNode: Record<string, number> = {};
function nodeRemaining(node: string): number {
  if (node in remainingFromNode) return remainingFromNode[node];
  const next = EDGES_FROM[node];
  const value = next ? Math.min(...next.map((edge) => edge.length + nodeRemaining(edge.to))) : 0;
  remainingFromNode[node] = value;
  return value;
}
for (const edge of EDGES) edge.remainingAtEnd = nodeRemaining(edge.to);

export const cellKey = (col: number, row: number): string => `${col},${row}`;

/** Клетки, задетые дорожкой (центр клетки ближе к дорожке, чем полширины дорожки + 0,45 клетки): башни там ставить нельзя.
 *  Запас 0,45 клетки = полкаймы дорожки + радиус основания башни + зазор, поэтому башня не заходит на полосу. */
export const PATH_TILES: ReadonlySet<string> = (() => {
  const { pathWidth, tile } = CONFIG.map;
  const limit = pathWidth / 2 + 0.45 * tile;
  const tiles = new Set<string>();
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      const center = tileCenter(col, row);
      let near = false;
      for (const edge of EDGES) {
        if (edge.pts.some((p) => Math.hypot(p.x - center.x, p.y - center.y) < limit)) {
          near = true;
          break;
        }
      }
      if (near) tiles.add(cellKey(col, row));
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
