/**
 * Клетки образца по графу карты (решение владельца 6 ноября 2026, сообщение 1, п. 1.1): не клетками вручную, а правилом по сети дорожек, чтобы оно работало на любой карте
 * («Нос» — два канала, «Рот» уровня 4 — два входа, следующие карты). Те же 12 групп, что у образца рецензента на «Горле» (REVIEW_GROUPS в qa/bot.mjs): pillA/B, fizzA–E, syrupA–C,
 * syringeA/B. На «Горле» образец остаётся клетками рецензента (это его записанная оборона); правило — для остальных карт.
 *
 * Правило:
 *  1. Пути — все маршруты от входа до организма по рёбрам графа; доля бактерий на пути — вход поровну, на каждой развилке поровну (как у игры и `makeGraphGeometry`).
 *  2. Оборона (Таблетки) — у спуска каждого канала: клетка «держит» путь, если в радиусе Таблетки лежит не меньше HOLD_SHARE × радиуса длины этого пути (≈ 1,6 радиуса —
 *     дуга, а не краешек). Клетки обороны выбираются жадно: каждая следующая держит больше всего ещё не закрытых путей (с весом доли бактерий); так у карты с общей горловиной
 *     («Горло», «Рот») — одна клетка, у «Носа» — по клетке на канал. pillA — клетка с наибольшей долей бактерий, pillB — вторая; если клетка обороны одна, pillB — вторая точка
 *     той же обороны не ближе SPREAD_PX (два круга по 150 px не пересекаются: спора не глушит обе разом).
 *  3. Шипучки — рядом с обороной своего канала (fizzA — у pillA, fizzB — у pillB), но не ближе MIN_GAP_PX к Таблеткам: башни не в одном круге 150 px; fizzC–E — лучшие клетки
 *     по охвату путей (с весом и скидкой за уже накрытое) не ближе MIN_GAP_PX к остальным.
 *  4. Сиропы — лужа на каждом пути до схождения: у каждой клетки обороны свой Сироп — клетка, лужа из которой ложится на пути этой обороны там, где их достаёт Таблетка
 *     (бегуна ранят только в луже, решение 20 октября 2026); syrupA — у pillA, syrupB — у pillB (или вторая лужа на пути pillA), syrupC — третий канал или лужа выше по путям.
 *  5. Шприцы — линия луча через карту (8 направлений) с наибольшей длиной путей под лучом с весом доли бактерий; луч обрывается на зубе (глава 2); syringeB — вторая линия со
 *     скидкой за уже накрытое первым лучом.
 * Возвращает { groups: {ключ: { cell: [c, r], aim? }}, anchors: [...], routes: [...], notes: {ключ: строка — какой путь закрывает} }.
 */

/** Доля радиуса: клетка «держит» путь, если длина пути в радиусе Таблетки ≥ HOLD_SHARE × радиус. */
export const HOLD_SHARE = 1.6;
/** Вторая точка обороны — не ближе, пикселей (2 × радиус глушения спор 150 px). */
export const SPREAD_PX = 300;
/** Шипучка и Сироп — не ближе к Таблеткам и друг к другу, пикселей (две клетки): не все башни в одном круге 150 px. */
export const MIN_GAP_PX = 150;
/** Скидка за уже накрытое (охват Шипучек C–E и второго луча). */
const OVERLAP = 0.4;

export function graphLayout({ graph, map, cols, rows, ranges, beam, toothRadius = 0.42 }) {
  const tile = map.tile;
  const center = (c, r) => ({ x: map.orgW + tile * (c + 0.5), y: tile * (r + 0.5) });
  const taken = new Set([...(graph.pathCells ?? []), ...(graph.blockedCells ?? []), ...(graph.teethCells ?? [])].map(([c, r]) => `${c},${r}`));
  const cells = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (!taken.has(`${c},${r}`)) cells.push({ col: c, row: r, ...center(c, r) });
  const teeth = (graph.teethCells ?? []).map(([c, r]) => center(c, r));

  // отрезки дорожки
  const byId = new Map(graph.edges.map((e) => [e.id, e]));
  const outOf = {};
  for (const e of graph.edges) (outOf[e.from] ??= []).push(e.id);
  const segs = [];
  const segsOfEdge = new Map();
  for (const e of graph.edges) {
    const list = [];
    for (let i = 0; i < e.pts.length - 1; i++) {
      const [ax, ay] = e.pts[i];
      const [bx, by] = e.pts[i + 1];
      list.push(segs.length);
      segs.push({ x: (ax + bx) / 2, y: (ay + by) / 2, len: Math.hypot(bx - ax, by - ay), edge: e.id, w: 0 });
    }
    segsOfEdge.set(e.id, list);
  }
  // пути и их доли
  const routes = [];
  const walk = (id, acc, w) => {
    const next = outOf[byId.get(id).to] ?? [];
    if (!next.length) {
      routes.push({ edges: [...acc, id], w });
      return;
    }
    for (const n of next) walk(n, [...acc, id], w / next.length);
  };
  for (const id of graph.entrances) walk(id, [], 1 / graph.entrances.length);
  routes.forEach((rt, i) => {
    rt.idx = i;
    rt.segs = new Set(rt.edges.flatMap((id) => segsOfEdge.get(id)));
  });
  for (const rt of routes) for (const si of rt.segs) segs[si].w += rt.w; // доля бактерий на отрезке (сумма по путям, проходящим через него)

  const near = (p, R) => {
    const list = [];
    for (let i = 0; i < segs.length; i++) if (Math.hypot(segs[i].x - p.x, segs[i].y - p.y) <= R) list.push(i);
    return list;
  };
  const covRoute = (list, rt) => list.reduce((s, si) => s + (rt.segs.has(si) ? segs[si].len : 0), 0);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const keyOf = (c) => `${c.col},${c.row}`;
  const used = new Set();
  const farFrom = (c, list, gap) => list.every((o) => dist(c, o) >= gap);

  // 2. оборона
  const Rp = ranges.pill;
  const hold = HOLD_SHARE * Rp;
  const pillLists = cells.map((c) => near(c, Rp));
  const anchors = [];
  const open = new Set(routes.map((rt) => rt.idx));
  while (open.size) {
    let best = null;
    cells.forEach((c, ci) => {
      if (anchors.some((a) => a.cell === c)) return;
      let score = 0;
      let all = 0;
      const holds = [];
      for (const rt of routes) {
        const v = covRoute(pillLists[ci], rt);
        all += rt.w * v;
        if (open.has(rt.idx) && v >= hold) {
          score += rt.w * v;
          holds.push(rt.idx);
        }
      }
      if (score > 0 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && all > best.all))) best = { cell: c, ci, score, all, holds };
    });
    if (!best) {
      // ни одна клетка не держит оставшиеся пути дугой — берётся клетка с наибольшим охватом этих путей
      cells.forEach((c, ci) => {
        let score = 0;
        const holds = [];
        for (const rt of routes) {
          if (!open.has(rt.idx)) continue;
          const v = covRoute(pillLists[ci], rt);
          if (v > 0) holds.push(rt.idx);
          score += rt.w * v;
        }
        if (score > 0 && (!best || score > best.score)) best = { cell: c, ci, score, all: score, holds };
      });
      if (!best) break;
    }
    for (const i of best.holds) open.delete(i);
    anchors.push({ cell: best.cell, routes: best.holds, w: best.holds.reduce((s, i) => s + routes[i].w, 0) });
  }
  anchors.sort((a, b) => b.w - a.w);
  const groups = {};
  const notes = {};
  const routeName = (ids) => ids.map((i) => `путь ${i + 1}`).join(', ');
  const put = (key, c, note, aim) => {
    used.add(keyOf(c));
    groups[key] = aim === undefined ? { cell: [c.col, c.row] } : { cell: [c.col, c.row], aim };
    notes[key] = note;
  };
  const a1 = anchors[0];
  put('pillA', a1.cell, `оборона: ${routeName(a1.routes)} (доля бактерий ${Math.round(a1.w * 100)} %)`);
  let a2 = anchors[1] ?? null;
  if (a2) put('pillB', a2.cell, `оборона второго канала: ${routeName(a2.routes)} (доля ${Math.round(a2.w * 100)} %)`);
  else {
    // одна горловина: вторая точка той же обороны не ближе SPREAD_PX
    let best = null;
    cells.forEach((c, ci) => {
      if (used.has(keyOf(c)) || dist(c, a1.cell) < SPREAD_PX) return;
      const v = routes.reduce((s, rt) => s + rt.w * covRoute(pillLists[ci], rt), 0);
      if (v > 0 && (!best || v > best.v)) best = { c, v };
    });
    if (best) {
      a2 = { cell: best.c, routes: a1.routes, w: a1.w, spare: true };
      put('pillB', best.c, `вторая точка обороны (не ближе ${SPREAD_PX} px к первой): ${routeName(a1.routes)}`);
    }
  }
  const defense = [a1, a2].filter(Boolean);

  // 3. Шипучки
  const Rf = ranges.fizz;
  const fizzLists = cells.map((c) => near(c, Rf));
  const covered = new Int32Array(segs.length);
  const mark = (list) => list.forEach((si) => covered[si]++);
  cells.forEach((c, ci) => {
    if (defense.some((d) => d.cell === c)) mark(pillLists[ci]);
  });
  const pillCells = defense.map((d) => d.cell);
  const fizzFor = (anchor) => {
    const rts = anchor.routes.map((i) => routes[i]);
    let best = null;
    cells.forEach((c, ci) => {
      if (used.has(keyOf(c)) || !farFrom(c, pillCells, MIN_GAP_PX) || dist(c, anchor.cell) > 2.2 * Rp) return;
      const v = rts.reduce((s, rt) => s + rt.w * covRoute(fizzLists[ci], rt), 0);
      if (v > 0 && (!best || v > best.v)) best = { c, ci, v };
    });
    return best;
  };
  const fizzCells = [];
  for (const [key, anchor] of [['fizzA', defense[0]], ['fizzB', defense[1]]]) {
    if (!anchor) continue;
    const f = fizzFor(anchor);
    if (!f) continue;
    put(key, f.c, `рядом с обороной (${routeName(anchor.routes)}), не ближе ${MIN_GAP_PX} px к Таблеткам`);
    fizzCells.push(f.c);
    mark(fizzLists[f.ci]);
  }
  for (const key of ['fizzC', 'fizzD', 'fizzE']) {
    let best = null;
    cells.forEach((c, ci) => {
      if (used.has(keyOf(c)) || !farFrom(c, [...pillCells, ...fizzCells], MIN_GAP_PX)) return;
      const v = fizzLists[ci].reduce((s, si) => s + segs[si].len * segs[si].w * Math.pow(OVERLAP, covered[si]), 0);
      if (v > 0 && (!best || v > best.v)) best = { c, ci, v };
    });
    if (!best) continue;
    const rts = routes.filter((rt) => covRoute(fizzLists[best.ci], rt) > 0).map((rt) => rt.idx);
    put(key, best.c, `добор урона: ${routeName(rts)} (лучший охват с учётом уже накрытого)`);
    fizzCells.push(best.c);
    mark(fizzLists[best.ci]);
  }

  // 4. Сиропы: лужа там, где пути обороны достаёт Таблетка
  const Rs = ranges.syrup;
  const syrupLists = cells.map((c) => near(c, Rs));
  const syrupCells = [];
  const puddled = new Int32Array(segs.length);
  const syrupFor = (anchor, upstream = false) => {
    const rts = anchor.routes.map((i) => routes[i]);
    const inPill = new Set(near(anchor.cell, Rp));
    let best = null;
    cells.forEach((c, ci) => {
      if (used.has(keyOf(c)) || !farFrom(c, [...pillCells, ...syrupCells], MIN_GAP_PX / 2)) return;
      let v = 0;
      for (const si of syrupLists[ci]) {
        if (!rts.some((rt) => rt.segs.has(si))) continue;
        if (!upstream && !inPill.has(si)) continue;
        v += segs[si].len * segs[si].w * Math.pow(OVERLAP, puddled[si]);
      }
      if (v > 0 && (!best || v > best.v)) best = { c, ci, v };
    });
    return best;
  };
  const syrupPlan = [['syrupA', defense[0], false], ['syrupB', anchors[1] ?? defense[0], !anchors[1]], ['syrupC', anchors[2] ?? defense[0], !anchors[2]]];
  for (const [key, anchor, upstream] of syrupPlan) {
    if (!anchor) continue;
    const s = syrupFor(anchor, upstream);
    if (!s) continue;
    put(key, s.c, upstream ? `вторая лужа на путях (${routeName(anchor.routes)})` : `лужа в зоне Таблеток: ${routeName(anchor.routes)} (бегуна ранят только в луже)`);
    syrupCells.push(s.c);
    syrupLists[s.ci].forEach((si) => puddled[si]++);
  }

  // 5. Шприцы: луч через карту, обрывается на зубе
  const dirs = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
  const toothR = toothRadius * tile;
  const rayList = (c, d) => {
    const [dx, dy] = dirs[d];
    let reach = beam.length;
    for (const t of teeth) {
      const px = t.x - c.x;
      const py = t.y - c.y;
      const along = px * dx + py * dy;
      const perp = Math.abs(-px * dy + py * dx);
      if (along > 0 && perp <= toothR) reach = Math.min(reach, along - Math.sqrt(toothR * toothR - perp * perp));
    }
    const list = [];
    for (let i = 0; i < segs.length; i++) {
      const px = segs[i].x - c.x;
      const py = segs[i].y - c.y;
      const along = px * dx + py * dy;
      if (along >= 0 && along <= reach && Math.abs(-px * dy + py * dx) <= beam.halfWidth) list.push(i);
    }
    return list;
  };
  const beamed = new Int32Array(segs.length);
  for (const key of ['syringeA', 'syringeB']) {
    let best = null;
    for (const c of cells) {
      if (used.has(keyOf(c))) continue;
      for (let d = 0; d < 8; d++) {
        const list = rayList(c, d);
        const v = list.reduce((s, si) => s + segs[si].len * segs[si].w * Math.pow(OVERLAP, beamed[si]), 0);
        if (v > 0 && (!best || v > best.v)) best = { c, d, v, list };
      }
    }
    if (!best) continue;
    const rts = routes.filter((rt) => best.list.some((si) => rt.segs.has(si))).map((rt) => rt.idx);
    put(key, best.c, `луч поперёк путей: ${routeName(rts)}`, best.d);
    best.list.forEach((si) => beamed[si]++);
  }
  // 6. Новые башни уровней 2+ (решение владельца 8 ноября 2026, сообщение 1, п. 3.4): клетка — наибольшая длина путей в радиусе башни с весом доли бактерий (без скидки за накрытое:
  //    Ампула бьёт самую прочную бактерию на полкарты, ей важен охват путей, а не соседи); при равенстве — ближе к главной обороне (pillA).
  for (const [key, type] of [['ampuleA', 'ampule']]) {
    const R = ranges[type];
    if (!R) continue;
    let best = null;
    for (const c of cells) {
      if (used.has(keyOf(c))) continue;
      const v = near(c, R).reduce((s, si) => s + segs[si].len * segs[si].w, 0);
      const d = dist(c, a1.cell);
      if (v > 0 && (!best || v > best.v + 1e-6 || (Math.abs(v - best.v) <= 1e-6 && d < best.d))) best = { c, v, d };
    }
    if (!best) continue;
    const rts = routes.filter((rt) => covRoute(near(best.c, R), rt) > 0).map((rt) => rt.idx);
    put(key, best.c, `${type === 'ampule' ? 'Ампула' : type}: наибольший охват путей в радиусе ${Math.round(R)} px (${routeName(rts)}), ближе к главной обороне`);
  }
  return {
    groups,
    notes,
    anchors: anchors.map((a) => ({ cell: [a.cell.col, a.cell.row], routes: a.routes, w: a.w })),
    routes: routes.map((rt) => ({ edges: rt.edges, w: rt.w })),
  };
}
