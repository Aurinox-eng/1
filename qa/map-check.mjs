/**
 * Проверка карты по правилу карт уровней 2–30 (решение владельца 18 ноября 2026, сообщение 1, п. 2; `docs/td-rules.md`): для каждого пути карты (от входа до организма)
 * есть клетка, где можно строить и где одна бактерия этого пути проходит под Таблеткой не меньше 700 px (радиус на входе в уровень 2). Шприц в правило не входит.
 * Расчёт — тот же, что 16 ноября 2026 (`docs/balance-history.md`, «Карты по графу»): по графу карты (`getGraph`), без игры — длина путей в круге радиуса башни
 * (у Шприца — в полосе луча, обрезанной зубом, по 8 направлениям). «Сумма» — по всем рёбрам графа; «по путям» — сколько px проходит под башней одна бактерия пути.
 *
 * Запуск (нужна тестовая сборка: npm run build:qa):
 *   node qa/map-check.mjs                 — уровни 1, 2, 3, 4
 *   node qa/map-check.mjs --levels=2      — один уровень
 * Итог: таблица в консоли и qa/screenshots/map-check-L<уровень>.txt; код выхода 1, если правило не выполнено хотя бы на одном уровне 2+ (уровень 1 — для сравнения).
 */
import fs from 'node:fs';
import path from 'node:path';
import { graphLayout } from './graph-layout.mjs';
import { launchBrowser, parseArgs, readConfigNumber, readTowerTable, ROOT, startServer } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const levels = String(args.levels ?? '1,2,3,4').split(',').map(Number).filter((n) => n >= 1);
const RULE_PX = 700; // правило карт: px пути под Таблеткой для одной бактерии каждого пути
const TABLE = readTowerTable();
const STEP = 0.03; // узел дальности: +3 % за уровень (meta.upgrades.pillRange.perLevel и др. в config.ts)
const ranges = (lv) => ({ pill: TABLE.pill.range * (1 + STEP * lv.pill), syrup: TABLE.syrup.range * (1 + STEP * lv.syrup), fizz: TABLE.fizz.range * (1 + STEP * lv.fizz), ampule: TABLE.ampule.range });
const SETS = { 'без узлов': { pill: 0, syrup: 0, fizz: 0 }, 'на входе в уровень 2': { pill: 4, syrup: 4, fizz: 2 } };
const RULE_SET = 'на входе в уровень 2';
const BEAM_L = TABLE.syringe.beamLengthPx;
const BEAM_HW = TABLE.syringe.beamHalfWidthPx;
const NAME = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц' };
const fmt = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const server = await startServer('dist-qa');
const browser = await launchBrowser();
const outDir = path.join(ROOT, 'qa/screenshots');
fs.mkdirSync(outDir, { recursive: true });
let failed = false;
try {
  for (const level of levels) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.url}?qa&levelwaves&ready=${Math.max(level, 4)}&level=${level}&towers=all&lang=ru`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pvb && window.__pvb.getState().state, null, { timeout: 30000 });
    const graph = await page.evaluate(() => window.__pvb.getGraph());
    const st = await page.evaluate(() => window.__pvb.getState());
    const map = st.map;
    const center = (c, r) => [map.orgW + map.tile * (c + 0.5), map.tile * (r + 0.5)];
    // клетки, где можно строить: правило бота (graph-layout) и проверка игрой (placeTower без оплаты)
    const taken = new Set([...graph.pathCells, ...graph.blockedCells, ...(graph.teethCells ?? [])].map(([c, r]) => `${c},${r}`));
    const cand = [];
    for (let c = 0; c < map.cols; c++) for (let r = 0; r < map.rows; r++) if (!taken.has(`${c},${r}`)) cand.push([c, r]);
    const ok = await page.evaluate((list) => list.map(([c, r]) => window.__pvb.placeTower('pill', c, r, 1)), cand);
    const cells = cand.filter((_, i) => ok[i]);
    const beamLen = await page.evaluate(({ cells, orgW, tile, L }) => cells.map(([c, r]) => [0, 1, 2, 3, 4, 5, 6, 7].map((d) => window.__pvb.toothCut(orgW + tile * (c + 0.5), tile * (r + 0.5), (d / 8) * 2 * Math.PI, L))), { cells, orgW: map.orgW, tile: map.tile, L: BEAM_L });
    await page.close();
    const routes = graphLayout({ graph, map: { orgW: map.orgW, tile: map.tile }, cols: map.cols, rows: map.rows, ranges: ranges(SETS[RULE_SET]), beam: { length: BEAM_L, halfWidth: BEAM_HW + 22 }, toothRadius: readConfigNumber('obstacles', 'toothRadius') }).routes;
    const byId = new Map(graph.edges.map((e) => [e.id, e]));
    // путь дробится на кусочки по 2 px: [x, y, длина, ребро]
    const bits = [];
    for (const e of graph.edges) for (let i = 1; i < e.pts.length; i++) {
      const [ax, ay] = e.pts[i - 1];
      const [bx, by] = e.pts[i];
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(d / 2));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; bits.push([ax + (bx - ax) * t, ay + (by - ay) * t, d / n, e.id]); }
    }
    const measure = (inside) => {
      const perEdge = new Map();
      let tot = 0;
      for (const [x, y, l, e] of bits) if (inside(x, y)) { tot += l; perEdge.set(e, (perEdge.get(e) ?? 0) + l); }
      return { tot, routes: routes.map((rt) => rt.edges.reduce((s, id) => s + (perEdge.get(id) ?? 0), 0)) };
    };
    const lines = [];
    lines.push(`Уровень ${level}, карта ${st.mapId}: клеток для постройки ${cells.length}, длина всех путей ${fmt(bits.reduce((s, b) => s + b[2], 0))} px`);
    routes.forEach((rt, i) => lines.push(`  путь ${i + 1}: рёбра ${rt.edges.join('→')}, ${fmt(rt.edges.reduce((s, id) => s + byId.get(id).length, 0))} px, доля бактерий ${Math.round(rt.w * 100)} %`));
    let ruleOk = true;
    for (const [setName, lv] of Object.entries(SETS)) {
      const R = ranges(lv);
      lines.push('', `Радиусы ${setName}: Таблетка ${fmt(R.pill)}, Сироп ${fmt(R.syrup)}, Шипучка ${fmt(R.fizz)} px`);
      const lists = {};
      for (const type of ['pill', 'syrup', 'fizz']) {
        const rr = R[type] * R[type];
        lists[type] = cells.map(([c, r]) => { const [cx, cy] = center(c, r); return { cell: [c, r], ...measure((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= rr) }; }).sort((a, z) => z.tot - a.tot);
      }
      if (setName === 'без узлов') {
        const list = [];
        cells.forEach(([c, r], i) => {
          const [cx, cy] = center(c, r);
          for (let d = 0; d < 8; d++) {
            const ang = (d / 8) * 2 * Math.PI;
            const ux = Math.cos(ang);
            const uy = Math.sin(ang);
            const Lb = beamLen[i][d];
            list.push({ cell: [c, r], dir: d * 45, ...measure((x, y) => { const dx = x - cx; const dy = y - cy; const a = dx * ux + dy * uy; return a >= 0 && a <= Lb && Math.abs(-dx * uy + dy * ux) <= BEAM_HW; }) });
          }
        });
        lists.syringe = list.sort((a, z) => z.tot - a.tot);
      }
      for (const [type, list] of Object.entries(lists)) {
        const b = list[0];
        const per = routes.map((_, i) => list.reduce((best, x) => (x.routes[i] > best.routes[i] ? x : best), list[0]));
        const where = (x) => `${x.cell.join(',')}${x.dir === undefined ? '' : ` ${x.dir}°`}`;
        lines.push(`  ${NAME[type]}: сумма по графу — ${fmt(b.tot)} (${where(b)}; по путям ${b.routes.map(fmt).join(' / ')}); одна бактерия пути — ${per.map((x, i) => `${fmt(x.routes[i])} (${where(x)})`).join(' / ')}`);
        if (type === 'pill' && setName === RULE_SET) {
          const bad = per.map((x, i) => (x.routes[i] >= RULE_PX ? null : i + 1)).filter(Boolean);
          if (bad.length) ruleOk = false;
          lines.push(`  ПРАВИЛО (Таблетка ≥ ${RULE_PX} px на каждом пути): ${bad.length ? `НЕ выполнено — пути ${bad.join(', ')}` : 'выполнено'}`);
        }
      }
      lines.push(`  Таблетка, 5 лучших клеток по сумме: ${lists.pill.slice(0, 5).map((x) => `${x.cell.join(',')} — ${fmt(x.tot)} (${x.routes.map(fmt).join(' / ')})`).join('; ')}`);
      if (setName === RULE_SET && routes.length > 1) {
        // общие клетки путей (решение владельца 23 ноября 2026, сообщение 1, п. 4.1): пара путей делит клетку, если одна Таблетка в ней накрывает оба пути (у каждого > 0 px);
        // лучшая общая клетка пары — с наибольшим меньшим из двух отрезков; путь без общих клеток ни с одним другим — отдельный канал
        const shares = routes.map(() => []);
        for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
          const best = lists.pill.reduce((b, x) => (Math.min(x.routes[i], x.routes[j]) > Math.min(b.routes[i], b.routes[j]) ? x : b), lists.pill[0]);
          const m = Math.min(best.routes[i], best.routes[j]);
          if (m > 0) { shares[i].push(j + 1); shares[j].push(i + 1); }
          lines.push(`  Общая клетка путей ${i + 1} и ${j + 1}: ${m > 0 ? `${best.cell.join(',')} — ${fmt(best.routes[i])} и ${fmt(best.routes[j])} px` : 'нет'}`);
        }
        const alone = routes.map((rt, i) => ({ i, rt })).filter(({ i }) => !shares[i].length);
        lines.push(`  Пути без общих клеток с другими путями: ${alone.length ? alone.map(({ i, rt }) => `путь ${i + 1} (${Math.round(rt.w * 100)} % бактерий)`).join(', ') : 'нет'}`);
      }
    }
    if (level >= 2 && !ruleOk) failed = true;
    const txt = lines.join('\n') + '\n';
    fs.writeFileSync(path.join(outDir, `map-check-L${level}.txt`), txt);
    console.log(txt);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
