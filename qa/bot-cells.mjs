/**
 * Снимки клеток образца по графу карты (решение владельца 8 ноября 2026, сообщение 1, п. 4): на карте уровня — кружок цвета башни в клетке группы, номер по порядку постройки,
 * пунктир — луч Шприца; рядом текст — по строке на группу: клетка и какой путь она закрывает. Клетки — тем же правилом, что у бота (qa/graph-layout.mjs), при радиусах башен
 * на входе в уровень (узлы дальности древа — --range, по умолчанию как у образца на входе в уровень 2: Таблетка 4, Сироп 4, Шипучка 2 уровня по +3 %).
 *
 * Запуск (нужна тестовая сборка: npm run build:qa):
 *   node qa/bot-cells.mjs                 — уровни 2, 3, 4
 *   node qa/bot-cells.mjs --levels=2      — один уровень
 *   node qa/bot-cells.mjs --range=pill:0,syrup:0,fizz:0 — без узлов дальности
 * Итог: qa/screenshots/bot-cells-L<уровень>.png и qa/screenshots/bot-cells-L<уровень>.txt. В облаке — Actions → «Клетки бота» (bot-cells.yml), снимки — в артефакте прогона.
 * Порядок постройки на снимке повторяет очередь образца в qa/bot.mjs (REVIEW_FIRST, REVIEW_STEPS, REVIEW_NEW_AFTER); меняется очередь бота — меняется и список ORDER ниже.
 */
import fs from 'node:fs';
import path from 'node:path';
import { graphLayout } from './graph-layout.mjs';
import { launchBrowser, parseArgs, readConfigNumber, readTowerTable, ROOT, startServer } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const levels = String(args.levels ?? '2,3,4').split(',').map(Number).filter((n) => n >= 1);
const rangeLv = { pill: 4, syrup: 4, fizz: 2 };
if (typeof args.range === 'string') for (const item of args.range.split(',')) { const [k, v] = item.split(':'); rangeLv[k] = Number(v); }
const TABLE = readTowerTable();
const RANGE_STEP = 0.03; // узел дальности: +3 % за уровень (meta.upgrades.*Range.perLevel в config.ts)
const ranges = (level) => ({
  pill: TABLE.pill.range * (1 + RANGE_STEP * rangeLv.pill),
  syrup: TABLE.syrup.range * (1 + RANGE_STEP * rangeLv.syrup),
  fizz: TABLE.fizz.range * (1 + RANGE_STEP * rangeLv.fizz),
  ...(level >= 2 ? { ampule: TABLE.ampule.range, antibiotic: TABLE.antibiotic.range } : {}),
});
// порядок первой постройки групп (как очередь образца в qa/bot.mjs): каналов несколько — сначала IV и II Таблеток, Сироп каждого канала после первого; новые башни — после строк REVIEW_NEW_AFTER
const ORDER_ONE = ['pillA', 'syrupA', 'syringeA', 'ampuleA', 'antibioticA', 'fizzA', 'syringeB', 'syrupB', 'fizzB', 'pillB', 'fizzC', 'syrupC', 'fizzD', 'fizzE'];
const ORDER_TWO = ['pillA', 'pillB', 'syrupA', 'syrupB', 'antibioticA', 'syringeA', 'ampuleA', 'fizzA', 'syringeB', 'fizzB', 'fizzC', 'syrupC', 'fizzD', 'fizzE'];
const COLOR = { pill: '#4aa8ff', syrup: '#ffb020', fizz: '#ff5fb0', syringe: '#7cff6a', ampule: '#b48cff', antibiotic: '#3fd0c0' };
const NAME = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц', ampule: 'Ампула', antibiotic: 'Антибиотик' };

const server = await startServer('dist-qa');
const browser = await launchBrowser();
const outDir = path.join(ROOT, 'qa/screenshots');
fs.mkdirSync(outDir, { recursive: true });
try {
  for (const level of levels) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await page.goto(`${server.url}?qa&levelwaves&ready=${Math.max(level, 4)}&level=${level}&towers=all&lang=ru`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pvb && window.__pvb.getState().state, null, { timeout: 30000 });
    const graph = await page.evaluate(() => window.__pvb.getGraph());
    const st = await page.evaluate(() => window.__pvb.getState());
    const L = graphLayout({
      graph, map: { orgW: st.map.orgW, tile: st.map.tile }, cols: st.map.cols, rows: st.map.rows, ranges: ranges(level),
      beam: { length: TABLE.syringe.beamLengthPx, halfWidth: TABLE.syringe.beamHalfWidthPx + 22 }, toothRadius: readConfigNumber('obstacles', 'toothRadius'),
    });
    const order = (L.anchors.length >= 2 ? ORDER_TWO : ORDER_ONE).filter((k) => L.groups[k]);
    const cells = order.map((key, i) => ({ key, type: key.replace(/[A-E]$/, ''), n: i + 1, col: L.groups[key].cell[0], row: L.groups[key].cell[1], aim: L.groups[key].aim }));
    // кадр: вся карта
    await page.mouse.move(640, 360);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
    await page.waitForTimeout(1200);
    const pts = await page.evaluate((list) => list.map((c) => ({ ...c, pos: window.__pvb.cellToClient(c.col, c.row) })), cells);
    const one = await page.evaluate(() => window.__pvb.cellToClient(1, 0).x - window.__pvb.cellToClient(0, 0).x);
    await page.evaluate(({ pts, one, COLOR }) => {
      const layer = document.createElement('div');
      layer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999';
      for (const c of pts) {
        if (c.aim === undefined) continue;
        const a = document.createElement('div');
        a.style.cssText = `position:absolute;left:${c.pos.x}px;top:${c.pos.y - 3}px;width:${one * 12}px;height:6px;background:repeating-linear-gradient(90deg,#7cff6a 0 14px,transparent 14px 22px);transform-origin:0 50%;transform:rotate(${(c.aim / 8) * 360}deg)`;
        layer.appendChild(a);
      }
      for (const c of pts) {
        const r = Math.max(13, one * 0.42);
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${c.pos.x - r}px;top:${c.pos.y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${COLOR[c.type]};border:3px solid #111;color:#111;font:bold ${Math.round(r * 0.95)}px Arial;display:flex;align-items:center;justify-content:center`;
        d.textContent = c.n;
        layer.appendChild(d);
      }
      document.body.appendChild(layer);
    }, { pts, one, COLOR });
    await page.waitForTimeout(300);
    const png = path.join(outDir, `bot-cells-L${level}.png`);
    await page.screenshot({ path: png });
    const routes = L.routes.map((rt, i) => `путь ${i + 1}: рёбра ${rt.edges.join('→')}, доля бактерий ${Math.round(rt.w * 100)} %`);
    const lines = cells.map((c) => `${c.n}. ${NAME[c.type]} (${c.key}) — клетка ${c.col},${c.row}${c.aim === undefined ? '' : `, луч ${c.aim * 45}°`} — ${L.notes[c.key]}`);
    const txt = [`Уровень ${level}, карта ${st.mapId}; радиусы: ${Object.entries(ranges(level)).map(([k, v]) => `${NAME[k]} ${Math.round(v)} px`).join(', ')}`, '', ...routes, '', ...lines, ''].join('\n');
    fs.writeFileSync(path.join(outDir, `bot-cells-L${level}.txt`), txt);
    console.log(`${png}\n${txt}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
