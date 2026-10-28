import { CONFIG } from './config';

/**
 * Сеть древа улучшений (решения владельца 26 октября 2026, сообщения 2–4; данные — `CONFIG.meta.network`): каждый уровень узла `meta.upgrades` — отдельный узел сети `id#L`
 * (узел башни — `towerX#1`), у узла есть кольцо (у узлов башен — 0: вне колец) и соседи. Взять узел можно, если открыто его кольцо и он соседний со взятым
 * (или с ядром «Сильное вещество» — у узлов без `requires`). Только расчёт, без состояния: состояние и покупка — `src/meta.ts`, вид — экран «Улучшения» (`UpgradesScene.ts`).
 */

/** Узел сети. */
export interface NetNode {
  /** `id#L`: узел `meta.upgrades` и его уровень (1…). */
  key: string;
  upgrade: string;
  level: number;
  /** Кольцо 1–6; 0 — узел башни (вне колец, только ценой). */
  ring: number;
  price: number;
  /** Сектор: `body`, `defense` (с умениями), `towers` (узлы башен) или id башни. */
  sector: string;
}

/** Цепочка — подряд идущие уровни одного узла в одном кольце (на экране — от центра наружу). */
export interface NetChain {
  upgrade: string;
  sector: string;
  ring: number;
  keys: string[];
}

export interface Network {
  nodes: Map<string, NetNode>;
  /** Соседи узла; `core` — ядро (сосед узлов без `requires`). */
  adj: Map<string, Set<string>>;
  chains: NetChain[];
  /** Связи по орбите между соседними секторами одного кольца: [последний узел крайней цепочки сектора, последний узел первой цепочки следующего сектора]. */
  orbit: [string, string][];
}

export const nodeKey = (upgrade: string, level: number): string => `${upgrade}#${level}`;
export const CORE = 'core';

function sectorOf(branch: string): string {
  if (branch === 'body') return 'body';
  if (branch === 'defense' || branch === 'skills') return 'defense';
  return branch;
}

function build(): Network {
  const ups = CONFIG.meta.upgrades;
  const net = CONFIG.meta.network;
  const nodes = new Map<string, NetNode>();
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  const chains: NetChain[] = [];
  for (const [id, u] of Object.entries(ups)) {
    const sector = u.branch === 'towers' ? 'towers' : sectorOf(u.branch);
    const rings = net.rings[id];
    let chain: NetChain | null = null;
    u.prices.forEach((price, i) => {
      const key = nodeKey(id, i + 1);
      const ring = u.branch === 'towers' ? 0 : (rings?.[i] ?? 1);
      nodes.set(key, { key, upgrade: id, level: i + 1, ring, price, sector });
      if (i > 0) link(nodeKey(id, i), key);
      if (u.branch === 'towers') return;
      if (!chain || chain.ring !== ring) {
        chain = { upgrade: id, sector, ring, keys: [] };
        chains.push(chain);
      }
      chain.keys.push(key);
    });
    link(u.requires ? nodeKey(u.requires[0], u.requires[1]) : CORE, nodeKey(id, 1));
  }
  // по орбите: соседние по кругу непустые сектора одного кольца
  const orbit: [string, string][] = [];
  const maxRing = Math.max(...chains.map((c) => c.ring));
  for (let k = 1; k <= maxRing; k++) {
    const filled = net.sectors.filter((s) => chains.some((c) => c.sector === s && c.ring === k));
    if (filled.length < 2) continue;
    filled.forEach((s, i) => {
      const next = filled[(i + 1) % filled.length];
      if (filled.length === 2 && i === 1) return; // два сектора — одна дуга
      const rowA = chains.filter((c) => c.sector === s && c.ring === k);
      const rowB = chains.filter((c) => c.sector === next && c.ring === k);
      const lastA = rowA[rowA.length - 1].keys;
      const a = lastA[lastA.length - 1];
      const b = rowB[0].keys[rowB[0].keys.length - 1];
      orbit.push([a, b]);
      link(a, b);
    });
  }
  return { nodes, adj, chains, orbit };
}

/** Сеть строится один раз из `config.ts`. */
export const NET: Network = build();

// ---------------------------------------------------------------- раскладка «Атом» (экран «Улучшения» и макет)

/** Внутренний радиус кольца k (1…), шаг узлов цепочки и радиусы узлов, пикселей мира (масштаб 1). */
export const NET_LAYOUT = { ring0: 130, band: 196, step: 28, nodeR: 10, keyR: 14, towerR: 17, coreR: 56 };
export const ringInner = (k: number): number => NET_LAYOUT.ring0 + NET_LAYOUT.band * (k - 1);

export interface Placed {
  key: string;
  x: number;
  y: number;
  r: number;
  angle: number;
}

export interface NetLayout {
  /** Узлы колец и узлы башен (ромбы на внутренней границе кольца входа сектора). */
  nodes: Map<string, Placed>;
  /** Число колец. */
  rings: number;
}

/** Ключевые узлы ветки и умения крупнее. */
export const isKeyNode = (upgrade: string): boolean => {
  const effect = CONFIG.meta.upgrades[upgrade]?.effect;
  return effect === 'key' || effect === 'fever' || effect === 'autoWave';
};

/**
 * Раскладка сети: сектор — доля круга (порядок `meta.network.sectors`, сверху по часовой), цепочки сектора в кольце — рядом по дуге, узлы цепочки — от внутренней границы кольца наружу
 * с лёгкой закруткой по ходу орбит. Узел башни — на внутренней границе кольца, где начинается её сектор (кольцо первого уровня ветки башни).
 */
export function layoutNet(): NetLayout {
  const sectors = CONFIG.meta.network.sectors;
  const width = (2 * Math.PI) / sectors.length;
  const angleOf = (s: string): number => -Math.PI / 2 + sectors.indexOf(s) * width;
  const swirl = (r: number): number => 0.00028 * r;
  const nodes = new Map<string, Placed>();
  const rings = Math.max(...NET.chains.map((c) => c.ring));
  for (const sector of sectors) {
    for (let k = 1; k <= rings; k++) {
      const row = NET.chains.filter((c) => c.sector === sector && c.ring === k);
      if (row.length === 0) continue;
      const mid = ringInner(k) + NET_LAYOUT.band / 2;
      const da = Math.min((NET_LAYOUT.step * 1.15) / mid, (width * 0.86) / row.length);
      row.forEach((chain, j) => {
        const a0 = angleOf(sector) + da * (j - (row.length - 1) / 2);
        chain.keys.forEach((key, i) => {
          const r = ringInner(k) + 24 + NET_LAYOUT.step * i;
          const a = a0 + swirl(r);
          nodes.set(key, { key, x: Math.cos(a) * r, y: Math.sin(a) * r, r: isKeyNode(chain.upgrade) ? NET_LAYOUT.keyR : NET_LAYOUT.nodeR, angle: a });
        });
      });
    }
  }
  // узлы башен: сектор башни — по id ветки; кольцо входа — кольцо Силы 1-го уровня
  for (const [key, node] of NET.nodes) {
    if (node.ring !== 0) continue;
    const tower = node.upgrade.replace(/^tower/, '');
    const branch = tower.charAt(0).toLowerCase() + tower.slice(1);
    const entry = NET.nodes.get(nodeKey(`${branch}Power`, 1))?.ring ?? 1;
    const r = ringInner(entry) - 4;
    const a = angleOf(branch) + swirl(r);
    nodes.set(key, { key, x: Math.cos(a) * r, y: Math.sin(a) * r, r: NET_LAYOUT.towerR, angle: a });
  }
  return { nodes, rings };
}
