import { CONFIG } from './config';
import { LEVEL_WAVES, QA_OBSTACLES } from './debug';
import { buildEdge, tileCenter, unitCenter, type Edge } from './pathing';

/** Сеть дорожек карты: узлы — точки (колонка, ряд) в единицах `map.pathUnit` (103 px), не в клетках под башню; колонка ≈ 18 — за правым краем (вход), около −1 — уже в организме (выход).
 *  Ребро — плавная кривая от узла к узлу; бактерии идут по рёбрам только влево, а на каждой развилке (узле, из которого выходит несколько рёбер) выбирают ребро случайно и поровну.
 *  startCenter — центр экрана при старте уровня (в тех же единицах). */
export interface MapSpec {
  cols: number;
  rows: number;
  nodes: Record<string, readonly [number, number]>;
  edges: ReadonlyArray<readonly [string, string]>;
  startCenter: readonly [number, number];
  /** Зубы (глава 2) — непроходимые препятствия: клетки (колонка, ряд) сетки под башни. */
  teeth?: ReadonlyArray<readonly [number, number]>;
  /** Налёт (главы 2 и 7) — разрушаемые препятствия: у каждого 2–3 клетки (колонка, ряд) подряд. */
  plaque?: ReadonlyArray<PlaqueSpec>;
}
/** Один налёт на карте: клетки, которые он закрывает. */
export interface PlaqueSpec {
  cells: ReadonlyArray<readonly [number, number]>;
}

/** Перевод точки макета карт (docs/mockups/maps-levels-1-4.html: колонка и ряд клеток 77,25 px, колонка от края организма) в единицы `map.pathUnit`. */
const fromMockup = (col: number, row: number): readonly [number, number] => [col * 0.75 - 0.5, (row + 0.5) * 0.75 - 0.5];

/**
 * Карты — данные, а не код: другая карта — другие таблицы.
 *  roots — «корни» (уровни 2–10, пока у них нет своих карт): три «кончика» справа (входы) сходятся в каналы, между ветвями длинные петли, у организма «ствол», который расходится тремя «корешками» (выходами).
 *  throat — «Горло» уровня 1 (документ дизайна docs/redesign-2026-10-19.md, раздел 8; макет `?map=1`): два входа сходятся в одно горло, длинная S-кривая, у организма развилка на два выхода.
 *  nose — «Нос» уровня 2 (план docs/level2-plan-2026-10-23.md, раздел 2.5; макет `?map=2`): два входа, два канала до организма, перемычка из верхнего канала в нижний; три маршрута, верхний канал получает 25 % бактерий, нижний — 75 %.
 */
export const MAPS: Record<'roots' | 'throat' | 'nose', MapSpec> = {
  roots: {
    cols: 24,
    rows: 19,
    nodes: {
      T1: [18.6, 2.4], T2: [18.6, 7.0], T3: [18.6, 11.6], // кончики корня справа — входы
      K1: [14.2, 3.2], K2: [15.6, 7.0], K3: [13.6, 10.8],
      Mu: [11.4, 5.0], Ml: [11.0, 9.0],
      Ru: [9.8, 2.2], Rl: [9.2, 11.8],
      Nu: [6.6, 4.8], Nl: [6.2, 9.3],
      Z: [4.0, 7.0], // «ствол» у организма
      X1: [-1, 3.4], X2: [-1, 7.0], X3: [-1, 10.6], // корешки к организму — выходы
    },
    edges: [
      ['T1', 'K1'], ['T2', 'K2'], ['T3', 'K3'],
      ['K1', 'Mu'], ['K1', 'Ru'], ['K2', 'Mu'], ['K2', 'Ml'], ['K3', 'Ml'], ['K3', 'Rl'],
      ['Mu', 'Nu'], ['Ru', 'Nu'], ['Ml', 'Nl'], ['Rl', 'Nl'],
      ['Nu', 'Z'], ['Nl', 'Z'],
      ['Z', 'X1'], ['Z', 'X2'], ['Z', 'X3'],
    ],
    /** У «ствола» (узла Z), через который идут все бактерии. Решение владельца 15 октября 2026 (docs/tester-feedback-plan-2026-10-15.md, пункт 1): «ствол» на экране около x = 434,
     *  все клетки, достающие всех бактерий, в окне, а плашка «◀ Организм» его не закрывает. */
    startCenter: [6.0, 7],
  },
  throat: {
    cols: 24,
    rows: 19,
    nodes: {
      A: fromMockup(24.6, 4), B: fromMockup(24.6, 14), // два входа справа
      M: fromMockup(16, 9), // слияние — место первой обороны
      S1: fromMockup(11, 4), S2: fromMockup(7, 13), // S-кривая
      F: fromMockup(4, 9), // развилка у организма
      X1: fromMockup(-0.5, 4.5), X2: fromMockup(-0.5, 13.5), // выходы
    },
    edges: [['A', 'M'], ['B', 'M'], ['M', 'S1'], ['S1', 'S2'], ['S2', 'F'], ['F', 'X1'], ['F', 'X2']],
    /** Между слиянием и развилкой: в окне и слияние, и S-кривая. */
    startCenter: [8.0, 6.6],
  },
  nose: {
    cols: 24,
    rows: 19,
    nodes: {
      A: fromMockup(24.6, 3.5), B: fromMockup(24.6, 15.5), // два входа справа
      U1: fromMockup(17, 3.5), L1: fromMockup(17, 15.5), // начало каналов; из U1 бактерия идёт в верхний или нижний канал (перемычка U1–LB)
      UB: fromMockup(12, 4.5), LB: fromMockup(12, 14.5),
      U2: fromMockup(6, 4), L2: fromMockup(6, 15), // концы каналов у организма
      X: fromMockup(-0.5, 9.5), // выход — один, оба канала сходятся только здесь
    },
    edges: [['A', 'U1'], ['B', 'L1'], ['U1', 'UB'], ['L1', 'LB'], ['U1', 'LB'], ['UB', 'U2'], ['LB', 'L2'], ['U2', 'X'], ['L2', 'X']],
    /** У концов каналов: в окне и оба конца каналов, и выход. */
    startCenter: [6.5, 7.0],
  },
};

/** Какая карта у уровня: уровень 1 — «Горло», уровень 2 — «Нос», остальные пока «корни» (свои карты уровней 3–4 — после макетов, решение владельца 18 октября 2026).
 *  В режиме проверки без `&levelwaves` — всегда «корни»: прежний тестовый уровень, на котором построены проверки механик. */
export function mapOfLevel(level: number): keyof typeof MAPS {
  if (!LEVEL_WAVES) return 'roots';
  return level === 1 ? 'throat' : level === 2 ? 'nose' : 'roots';
}

/** Карта, по которой сейчас идёт партия (меняется `useLevelMap` перед стартом уровня); все таблицы ниже пересчитываются вместе с ней. */
export let MAP_ID: keyof typeof MAPS = 'roots';
export let LEVEL: MapSpec = MAPS.roots;

/** Размер мира в пикселях: зона организма слева + сетка клеток (у всех карт 24 × 19 клеток). */
export const WORLD = {
  w: CONFIG.map.orgW + 24 * CONFIG.map.tile,
  h: 19 * CONFIG.map.tile,
};

/** Готовые рёбра (в том же порядке, что и LEVEL.edges). */
export let EDGES: Edge[] = [];
/** Рёбра, выходящие из узла. */
export let EDGES_FROM: Record<string, Edge[]> = {};
/** Рёбра-входы: те, что начинаются в узле, в который ничего не входит (кончики справа). */
export let ENTRANCE_EDGES: Edge[] = [];

export const cellKey = (col: number, row: number): string => `${col},${row}`;

/**
 * «Расстояние до организма по дорожкам» для точки мира: берётся ближайшая к ней точка сети дорожек и считается, сколько
 * пикселей от неё до организма по самому короткому пути. По этому числу башни отличают «вперёд» (бактериям до организма
 * дальше, чем башне — они ещё не дошли) от «назад» (ближе — уже прошли).
 */
export function remainingNear(x: number, y: number): number {
  let best = Infinity;
  let bestRemaining = 0;
  for (const edge of EDGES) {
    for (let i = 0; i < edge.pts.length; i++) {
      const d = Math.hypot(edge.pts[i].x - x, edge.pts[i].y - y);
      if (d < best) {
        best = d;
        bestRemaining = edge.length - edge.cum[i] + edge.remainingAtEnd;
      }
    }
  }
  return bestRemaining;
}

/** Клетки, задетые дорожкой (центр клетки ближе к дорожке, чем полширины дорожки + 0,55 клетки): башни там ставить нельзя.
 *  Запас 0,55 клетки (≈ 42 px при клетке 77,25) = полкаймы дорожки + радиус основания башни + зазор, поэтому башня не заходит на полосу. */
export let PATH_TILES: ReadonlySet<string> = new Set();

/**
 * Закрытые клетки: не на дорожке, но дальше `CONFIG.map.buildMaxDistPx` от неё — башня там ничего бы не достала.
 * Рисуются тёмными (штриховка), ставить башни нельзя.
 */
export let BLOCKED_TILES: ReadonlySet<string> = new Set();

/** Клетки с зубом (`MapSpec.teeth`): строить нельзя, луч и свет через зуб не проходят. */
export let TOOTH_TILES: ReadonlySet<string> = new Set();
/** Центры зубов, пикселей мира (для луча и света). */
export let TOOTH_CENTERS: ReadonlyArray<{ x: number; y: number }> = [];
/** Налёт на карте (`MapSpec.plaque`); какой ещё цел — знает сцена. */
export let PLAQUES: ReadonlyArray<PlaqueSpec> = [];

/** Переключает карту на карту уровня `level` и пересчитывает рёбра, входы, расстояния до организма и закрытые клетки (если карта та же — ничего не делает). */
export function useLevelMap(level: number): void {
  const id = mapOfLevel(level);
  if (id === MAP_ID && EDGES.length > 0) return;
  MAP_ID = id;
  LEVEL = MAPS[id];
  EDGES = LEVEL.edges.map(([from, to], i) => buildEdge(i, from, to, LEVEL.nodes[from], LEVEL.nodes[to]));
  EDGES_FROM = {};
  const incoming = new Set<string>();
  for (const edge of EDGES) {
    (EDGES_FROM[edge.from] ??= []).push(edge);
    incoming.add(edge.to);
  }
  ENTRANCE_EDGES = EDGES.filter((edge) => !incoming.has(edge.from));
  // Сколько пикселей от узла до организма по самому короткому пути (нужно башням: «ближе всех к организму»)
  const remainingFromNode: Record<string, number> = {};
  const nodeRemaining = (node: string): number => {
    if (node in remainingFromNode) return remainingFromNode[node];
    const next = EDGES_FROM[node];
    const value = next ? Math.min(...next.map((edge) => edge.length + nodeRemaining(edge.to))) : 0;
    remainingFromNode[node] = value;
    return value;
  };
  for (const edge of EDGES) edge.remainingAtEnd = nodeRemaining(edge.to);
  const { pathWidth, tile, buildMaxDistPx } = CONFIG.map;
  const limit = pathWidth / 2 + 0.55 * tile;
  const path = new Set<string>();
  const blocked = new Set<string>();
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      const center = tileCenter(col, row);
      let nearest = Infinity;
      for (const edge of EDGES) for (const p of edge.pts) nearest = Math.min(nearest, Math.hypot(p.x - center.x, p.y - center.y));
      if (nearest < limit) path.add(cellKey(col, row));
      else if (nearest > buildMaxDistPx) blocked.add(cellKey(col, row));
    }
  }
  PATH_TILES = path;
  const obstacles = QA_OBSTACLES && id === 'roots' ? qaObstacles(path, blocked) : { teeth: LEVEL.teeth ?? [], plaque: LEVEL.plaque ?? [] };
  // клетка с препятствием рисуется самим препятствием, а не штриховкой закрытой клетки
  for (const [c, r] of [...obstacles.teeth, ...obstacles.plaque.flatMap((p) => p.cells)]) blocked.delete(cellKey(c, r));
  BLOCKED_TILES = blocked;
  TOOTH_TILES = new Set(obstacles.teeth.map(([c, r]) => cellKey(c, r)));
  TOOTH_CENTERS = obstacles.teeth.map(([c, r]) => tileCenter(c, r));
  PLAQUES = obstacles.plaque;
}

/**
 * Только режим проверки (`?qa&obstacles`): препятствия главы 2 на тестовой карте «корни» — три зуба (свободные клетки, ближайшие к узлам Nu, Nl и K2) и два налёта
 * (3 и 2 клетки в ряд, ближайшие к узлам Mu и Rl). Клетки подбираются по свободным, поэтому не попадают на дорожку.
 */
function qaObstacles(path: ReadonlySet<string>, blocked: ReadonlySet<string>): { teeth: [number, number][]; plaque: PlaqueSpec[] } {
  const taken = new Set<string>();
  const free = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < LEVEL.cols && r < LEVEL.rows && !path.has(cellKey(c, r)) && !blocked.has(cellKey(c, r)) && !taken.has(cellKey(c, r));
  const run = (node: string, len: number): [number, number][] => {
    const at = unitCenter(LEVEL.nodes[node][0], LEVEL.nodes[node][1]);
    let best: [number, number][] = [];
    let bestD = Infinity;
    for (let c = 0; c + len <= LEVEL.cols; c++) {
      for (let r = 0; r < LEVEL.rows; r++) {
        const cells: [number, number][] = Array.from({ length: len }, (_, i) => [c + i, r]);
        if (!cells.every(([cc, rr]) => free(cc, rr))) continue;
        const mid = tileCenter(c + (len - 1) / 2, r);
        const d = Math.hypot(mid.x - at.x, mid.y - at.y);
        if (d < bestD) [best, bestD] = [cells, d];
      }
    }
    for (const [c, r] of best) taken.add(cellKey(c, r));
    return best;
  };
  const teeth = ['Nu', 'Nl', 'K2'].map((node) => run(node, 1)[0]).filter((cell) => cell !== undefined);
  return { teeth, plaque: [{ cells: run('Mu', 3) }, { cells: run('Rl', 2) }] };
}

/** На каком расстоянии от точки (x, y) в направлении angle луч упирается в зуб (не дальше length), пикселей. */
export function toothCut(x: number, y: number, angle: number, length: number): number {
  const r = CONFIG.obstacles.toothRadius * CONFIG.map.tile;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let cut = length;
  for (const t of TOOTH_CENTERS) {
    const along = (t.x - x) * ux + (t.y - y) * uy;
    if (along < 0) continue;
    const off = Math.abs(-(t.x - x) * uy + (t.y - y) * ux);
    if (off >= r) continue;
    cut = Math.min(cut, Math.max(0, along - Math.sqrt(r * r - off * off)));
  }
  return cut;
}

/** Закрывает ли зуб прямую от (x0, y0) до (x1, y1): свет Лампы до бактерии за зубом не доходит. */
export function toothBlocks(x0: number, y0: number, x1: number, y1: number): boolean {
  if (TOOTH_CENTERS.length === 0) return false;
  const len = Math.hypot(x1 - x0, y1 - y0);
  return len > 0 && toothCut(x0, y0, Math.atan2(y1 - y0, x1 - x0), len) < len;
}

useLevelMap(1);

/** Сколько направлений у луча «Шприца»: тап по башне поворачивает её на 360 / AIM_STEPS градусов (8 → шаг 45°). */
export const AIM_STEPS = 8;

/** Угол направления луча с номером `index` (0 — вправо, дальше по часовой стрелке, как на экране), радианы. */
export function aimAngle(index: number): number {
  return ((index % AIM_STEPS) / AIM_STEPS) * Math.PI * 2;
}

/**
 * Сколько пикселей дорожек накрывает луч из точки (x, y) в направлении angle: луч — полоса длины `length` и полуширины
 * `halfWidth`; считаются кусочки дорожек (их середины), попавшие в полосу. Чем больше, тем больше бактерий пройдёт «под лучом».
 */
export function beamCoverage(x: number, y: number, angle: number, length: number, halfWidth: number): number {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let total = 0;
  for (const edge of EDGES) {
    for (let i = 1; i < edge.pts.length; i++) {
      const mx = (edge.pts[i].x + edge.pts[i - 1].x) / 2 - x;
      const my = (edge.pts[i].y + edge.pts[i - 1].y) / 2 - y;
      const along = mx * ux + my * uy;
      if (along < 0 || along > length) continue;
      if (Math.abs(-mx * uy + my * ux) > halfWidth) continue;
      total += edge.cum[i] - edge.cum[i - 1];
    }
  }
  return total;
}

/** Лучшее направление луча (номер 0…AIM_STEPS-1) из точки: то, где под лучом больше всего дорожки. Так новая башня сразу смотрит с толком. */
export function bestBeamDirection(x: number, y: number, length: number, halfWidth: number): number {
  let best = 0;
  let bestValue = -1;
  for (let i = 0; i < AIM_STEPS; i++) {
    const value = beamCoverage(x, y, aimAngle(i), length, halfWidth);
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/** Клетка под точкой мира или null, если точка вне сетки (например, в зоне организма). */
export function worldToCell(x: number, y: number): [number, number] | null {
  const { orgW, tile } = CONFIG.map;
  const col = Math.floor((x - orgW) / tile);
  const row = Math.floor(y / tile);
  if (col < 0 || col >= LEVEL.cols || row < 0 || row >= LEVEL.rows) return null;
  return [col, row];
}
