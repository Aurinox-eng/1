#!/usr/bin/env node
/**
 * Модель мета-прогрессии (docs/meta-progression-plan-2026-10-17.md, п. 2) с пересчётом по серии п. 4 и ночному тесту 17–18 октября 2026
 * (docs/meta-progression-recalc-2026-10-18.md). Чистый расчёт: игру, ботов и src/config.ts не трогает, запускается локально: node docs/meta-model-2026-10-18.mjs
 *
 * Сила игрока P — произведение прироста от купленных узлов (урон, ветка Таблетки); ёмкость на попытке k = C0 · P_k · L^(k−1),
 * L — «обучение» (рост силы за попытку не от покупок: перестройка расстановки, узлы экономики). Гибель — на первой волне n, где суммарная
 * прочность волны W(n) = бюджет(n) · множитель роста(n) · hpFactor больше ёмкости. Очки ДНК за гибель на волне n: 2·k + (240/465)·k·(k+1)/2, k = n − 1.
 */
const W_STEP = 240 / 465;
const dnaDeath = (n) => { const k = n - 1; return Math.round(2 * k + (W_STEP * k * (k + 1)) / 2); };

/** Уровень: бюджет первой и последней волны, поздний рост, общий множитель. Уровни 2–10 — `levels.specs` (perWave 0,08 с 8-й, поздний рост с 16-й). */
export const LEVELS = {
  1: { b: [8, 1012], per: 0.1, from: 4, late: 0.4, lateFrom: 12, hf: 0.8 },
  2: { b: [10, 1093], per: 0.08, from: 8, late: 1.15, lateFrom: 16, hf: 1 },
  3: { b: [10, 1174], per: 0.08, from: 8, late: 0.95, lateFrom: 16, hf: 1 },
  4: { b: [10, 1255], per: 0.08, from: 8, late: 1.6, lateFrom: 16, hf: 1 },
  5: { b: [10, 1336], per: 0.08, from: 8, late: 2.6, lateFrom: 16, hf: 1 },
  7: { b: [10, 1579], per: 0.08, from: 8, late: 3.0, lateFrom: 16, hf: 1 },
  8: { b: [10, 1659], per: 0.08, from: 8, late: 2.95, lateFrom: 16, hf: 1 },
  10: { b: [10, 1740], per: 0.08, from: 8, late: 2.7, lateFrom: 16, hf: 1 },
};
/** Мера ёмкости — множитель прочности ОДНОЙ бактерии (план, п. 2), а не суммарная прочность волны: ночной тест 17–18 октября, уровни 3–4, варианты позднего роста и общего
 *  множителя при одной прокачке дают первую гибель при множителе 25–31 (разброс ±10 %), а суммарная прочность (с бюджетом волны) — при 18–31 тыс. (разброс ×1,7). */
export const W = (spec, n) => (1 + spec.per * Math.max(0, n - spec.from) + spec.late * Math.max(0, n - spec.lateFrom)) * spec.hf;
/** Первая волна, которую ёмкость C не выдерживает; 31 — победа. */
export const deathWave = (spec, C) => { for (let n = 1; n <= 30; n++) if (W(spec, n) > C) return n; return 31; };

/** Узлы, дающие силу (остальные — монеты, награда, жизни, щит — силы не дают, как в плане). Цены и требования — `meta.upgrades` в `src/config.ts`. */
export const NODES = {
  damage: { prices: [15, 20, 25, 35, 45, 55, 70, 95, 120, 160], gain: (l) => (1 + 0.1 * l) / (1 + 0.1 * (l - 1)) },
  pillPower: { prices: [20, 25, 35, 45, 55, 75], req: ['damage', 3], gain: (l) => (1 + 0.08 * l) / (1 + 0.08 * (l - 1)) },
  pillRate: { prices: [20, 25, 35, 45, 55, 75, 95, 125], req: ['pillPower', 2], gain: (l) => (1 - 0.04 * (l - 1)) / (1 - 0.04 * l) },
  pillRange: { prices: [20, 25, 35, 45, 55, 75], req: ['pillPower', 2], gain: () => 1.02 },
  pillCheap: { prices: [25, 30, 40, 55, 70, 95], req: ['pillRate', 2], gain: () => 1.015 },
};
/** Предложенный узел `damageX` (docs/meta-progression-plan-2026-10-17.md, п. 4): +dx к множителю урона за уровень, цены 30, 35, … */
export const damageX = (dx, maxLevels, p0 = 30, step = 5) => ({
  prices: Array.from({ length: maxLevels }, (_, i) => p0 + step * i),
  req: ['damage', 10],
  gain: (l) => (2 + dx * l) / (2 + dx * (l - 1)),
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const canBuy = (lv, id, nodes) => {
  const nd = nodes[id];
  if (!nd) return false;
  if ((lv[id] ?? 0) >= nd.prices.length) return false;
  if (nd.req && (lv[nd.req[0]] ?? 0) < nd.req[1]) return false;
  return true;
};
/** Жадная покупка: каждый раз узел с наибольшим приростом силы на очко ДНК; возвращает прирост силы и остаток очков. */
export function spendGreedy(lv, dna, nodes, first = ['damage']) {
  let gain = 1;
  const bought = [];
  // порядок покупок бота (`buyOrder`, qa/lib.mjs): сначала узлы из `first` (урон), затем жадно по приросту силы на очко
  for (const id of first) {
    while (nodes[id] && canBuy(lv, id, nodes) && nodes[id].prices[lv[id] ?? 0] <= dna) {
      const price = nodes[id].prices[lv[id] ?? 0];
      dna -= price;
      lv[id] = (lv[id] ?? 0) + 1;
      gain *= nodes[id].gain(lv[id]);
      bought.push(id);
    }
  }
  for (;;) {
    let best = null;
    for (const id of Object.keys(nodes)) {
      if (!canBuy(lv, id, nodes)) continue;
      const price = nodes[id].prices[lv[id] ?? 0];
      if (price > dna) continue;
      const g = nodes[id].gain((lv[id] ?? 0) + 1);
      const score = Math.log(g) / price;
      if (!best || score > best.score) best = { id, price, g, score };
    }
    if (!best) break;
    dna -= best.price;
    lv[best.id] = (lv[best.id] ?? 0) + 1;
    gain *= best.g;
    bought.push(best.id);
  }
  return { gain, dna, bought };
}
/** Прирост силы от купленного (заданный список id) к уровням lv (изменяет lv). */
export function applyBought(lv, ids, nodes = NODES) {
  let gain = 1;
  for (const id of ids) {
    if (!nodes[id]) continue;
    lv[id] = (lv[id] ?? 0) + 1;
    gain *= nodes[id].gain(lv[id]);
  }
  return gain;
}

/** Прогон лестницы по модели: C0 — ёмкость при P = 1, L — обучение, lv — узлы на входе, nodes — доступные узлы, dnaWin — очки победы. */
export function ladder({ spec, C0, L, lv, nodes, nodesFn = null, dnaStart = 0, dnaWin = 330, maxAttempts = 10, entryGain = 1 }) {
  const out = [];
  let best = 0;
  let P = entryGain;
  let dna = dnaStart;
  lv = clone(lv);
  for (let k = 1; k <= maxAttempts; k++) {
    const C = C0 * P * Math.pow(L, k - 1);
    const n = deathWave(spec, C);
    if (n > 30) { out.push('П'); break; }
    out.push(n);
    best = Math.max(best, n);
    dna += dnaDeath(n);
    // nodesFn(лучшая волна) — набор узлов, доступных после этой попытки (открытие уровней узла попытками на уровне)
    const r = spendGreedy(lv, dna, nodesFn ? nodesFn(best) : nodes);
    dna = r.dna;
    P *= r.gain;
  }
  return out;
}
export { dnaDeath, clone };

/** Ёмкость по первой гибели: середина между W(n−1) и W(n) (гибель — первая волна, не выдержанная). */
export const capFromDeath = (spec, n) => Math.sqrt(W(spec, Math.max(1, n - 1)) * W(spec, n));
