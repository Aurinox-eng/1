/**
 * ЗАМЕР СКОРОСТИ (кадры в секунду) в трёх стресс-сценариях:
 *   stress — `?qa&stress`: 40 башен разных уровней, ≈200 бактерий всех типов, скорость ×3;
 *   high   — `?qa&stress=high`: 40 Таблеток, Сиропов и Шприцев уровней I–VIII (рисунки V–VIII), ≈200 бактерий; мерится только у версий, где он есть (решение владельца 25 октября 2026, сообщение 2, п. 3.6);
 *   fizz   — `?qa&stress=fizz`: 12 Шипучек 4-го уровня («Быстрая» + «Цепная» + «Кислота»), ≈200 бактерий (прочность ×40), скорость ×3 — частые взрывы.
 * Идёт на сервере (`.github/workflows/perf.yml`); локально в контейнере агента не запускать (машина слабая, числа неверные).
 *
 * Запуск (сначала `npm run build:qa` в каждой сравниваемой папке):
 *   node qa/perf.mjs [--noshots] [--variants=имя:запрос,…] [--roots=.,base] [--names=после,до] [--renderers=webgl,canvas] [--scenario=stress,fizz] [--rounds=2] [--warmup=8] [--seconds=20] [--tag=имя]
 *     --roots      папки проектов, чьи сборки dist-qa сравниваются (по умолчанию только текущая);
 *     --names      как подписать каждую папку в таблице;
 *     --scenario   какие сценарии мерить (по умолчанию оба: stress,fizz). Сборка, в которой сценария нет (например, «до» не знает `stress=fizz`), по ответу
 *                  игры (`getPerf().scenario`) пропускается без замера — такой сценарий мерится только там, где он есть;
 *     --rounds     сколько раз повторить каждую пару (порядок чередуется, чтобы нагрев машины не давал преимущества одной версии).
 * Печатает таблицу (Markdown) и пишет qa/perf-results/<tag>.json; снимки — qa/screenshots/perf-<tag>/.
 *
 * Что значат числа: «работа кадра» — сколько миллисекунд игра считала и рисовала кадр (меньше — лучше; при 60 кадрах на всё 16,7 мс), из неё
 * «расчёт» и «рисование». ЦЕЛЬ: 95-й процентиль работы кадра ≤ 16,7 мс (в таблице — отдельный столбец и отметка; рядом — самый медленный кадр); «вызовов рисования» и «вершин за кадр» — сколько работы получает видеокарта (от машины не зависят).
 * Кадры в секунду на сервере НЕ результат (решение владельца): там нет видеокарты; они есть только в JSON. Итог по кадрам — замер владельца
 * по ?fps на компьютере, iPhone и iPad.
 * На сервере нет видеокарты: WebGL рисуется программно, поэтому числа ниже, чем на компьютере игрока; сравнивать надо «до» и «после» на одной машине.
 */
import fs from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import { launchBrowser, parseArgs, ROOT, sleep, VIEWPORTS } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const roots = String(args.roots ?? '.').split(',').map((r) => path.resolve(ROOT, r));
const names = String(args.names ?? roots.map((r) => path.basename(r)).join(',')).split(',');
const renderers = String(args.renderers ?? 'webgl,canvas').split(',');
const scenarios = String(args.scenario ?? 'stress,fizz,high').split(',');
/** Цель: 95-й процентиль работы кадра, мс (60 кадров в секунду). */
const GOAL_MS = 16.7;
const rounds = Number(args.rounds ?? 3);
const warmupSec = Number(args.warmup ?? 8);
const seconds = Number(args.seconds ?? 20);
const tag = String(args.tag ?? 'perf');

const shotsDir = path.join(ROOT, 'qa', 'screenshots', `perf-${tag}`);
const resultsDir = path.join(ROOT, 'qa', 'perf-results');
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });

async function serve(root) {
  const server = await preview({
    root,
    logLevel: 'error',
    build: { outDir: 'dist-qa' },
    preview: { port: 0, strictPort: false, open: false, host: '127.0.0.1' },
  });
  return { url: server.resolvedUrls?.local?.[0], close: () => server.close() };
}

async function measure(browser, url, renderer, scenario, shotName, extra = '') {
  const context = await browser.newContext({ ...VIEWPORTS.desktop });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const query = `?qa&stress${scenario === 'fizz' ? '=fizz' : scenario === 'high' ? '=high' : ''}&fps&noplaque${renderer === 'canvas' ? '&canvas' : ''}${extra ? `&${extra}` : ''}`;
  await page.goto(url + query);
  await page.waitForFunction(() => Boolean(window.__pvb?.getPerf), null, { timeout: 60000 });
  // Версия без этого сценария (старый код не знает `stress=fizz` и запустил бы обычный стресс-сценарий) не мерится
  if (scenario !== 'stress') {
    const probe = await page.evaluate(() => window.__pvb.getPerf());
    if (probe.scenario !== scenario) {
      await context.close();
      return null;
    }
  }
  await sleep(warmupSec * 1000);
  await page.evaluate(() => window.__pvb.getPerf(true));
  await sleep(seconds * 1000);
  const report = await page.evaluate(() => window.__pvb.getPerf());
  // Снимки: при очень медленных кадрах снимок может не успеть — замер от этого не портится
  const shot = async (name) => {
    if (args.noshots) return; // без снимков совсем
    // в canvas снимок на сервере не снимается за 120 с (каждый замер теряет ≈ 4 минуты, полный замер не укладывается в 90 минут — run 39172097468): снимки только в WebGL
    if (renderer === 'canvas' && process.env.CI) return;
    try {
      await page.screenshot({ path: path.join(shotsDir, `${name}.png`), timeout: 120000 });
    } catch (e) {
      console.log(`снимок ${name} не снят: ${String(e).split('\n')[0]}`);
    }
  };
  await shot(shotName);
  // Крупный план: приближение к середине карты (видны трещины, уровни башен, надписи)
  await page.mouse.move(540, 360);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400);
  await sleep(1500);
  await shot(`${shotName}-close`);
  await context.close();
  return { ...report, errors };
}

const browser = await launchBrowser();
const servers = [];
for (const root of roots) servers.push(await serve(root));
const results = [];
// Цели замера: версии (--roots/--names) и варианты текущей версии (--variants=имя:запрос,имя:запрос — тот же код с флагами режима проверки, например noface&nobreath&pilleyes=0)
const targets = roots.map((_, i) => ({ name: names[i], server: i, extra: '' }));
for (const v of String(args.variants ?? '').split(',').filter(Boolean)) {
  const [vname, ...rest] = v.split(':');
  targets.push({ name: vname, server: roots.length - 1, extra: rest.join(':') });
}
try {
  for (const scenario of scenarios) {
    for (let round = 0; round < rounds; round++) {
      for (const renderer of renderers) {
        // чередуем порядок версий от круга к кругу
        const order = targets.map((_, i) => i);
        if (round % 2 === 1) order.reverse();
        for (const i of order) {
          const t = targets[i];
          const shotName = `${scenario}-${t.name}-${renderer}-${round + 1}`;
          const report = await measure(browser, servers[t.server].url, renderer, scenario, shotName, t.extra);
          if (!report) {
            console.log(`${scenario} ${t.name} ${renderer} круг ${round + 1}: в этой версии сценария нет — пропущено`);
            continue;
          }
          results.push({ scenario, version: t.name, renderer, round: round + 1, ...report });
          console.log(
            `${scenario} ${t.name} ${renderer} круг ${round + 1}: работа кадра ${report.workMs} мс (расчёт ${report.updateMs}, рисование ${report.renderMs}; 95 % — до ${report.workP95}, максимум ${report.workMax}; цель 95 % ≤ ${GOAL_MS}), вызовов рисования ${report.drawCalls}, вершин ${report.vertices}, ` +
              `объектов ${report.objects}, бактерий ${report.bacteria}, башен ${report.towers}${report.errors.length ? `, ОШИБКИ: ${report.errors.join(' | ')}` : ''}`,
          );
        }
      }
    }
  }
} finally {
  await browser.close();
  for (const s of servers) await s.close();
}

fs.writeFileSync(path.join(resultsDir, `${tag}.json`), JSON.stringify(results, null, 2));

// Итоговая таблица: медиана по кругам для каждой версии и способа рисования (круги шумные; для медианы нужно не менее трёх)
const med = (list, key) => {
  const v = list.map((r) => r[key]).sort((a, b) => a - b);
  const m = v.length >> 1;
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 10) / 10;
};
/** Допуск «после» к «до» по медиане 95-го процентиля и работы кадра. */
const TOLERANCE = 0.1;
const lines = [
  `| Сценарий | Версия | Рисование | Работа кадра, мс (медиана) | из неё расчёт, мс | из неё рисование, мс | **95-й процентиль работы кадра, мс (цель ≤ ${GOAL_MS})** | Цель | Самый медленный кадр, мс | Вызовов рисования за кадр | Вершин за кадр | Объектов на экране | Ошибки |`,
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const scenario of scenarios) {
  for (const renderer of renderers) {
    for (const name of targets.map((t) => t.name)) {
      const list = results.filter((r) => r.scenario === scenario && r.version === name && r.renderer === renderer);
      if (!list.length) continue;
      const errors = list.reduce((a, r) => a + r.errors.length, 0);
      const p95 = med(list, 'workP95');
      const max = Math.max(...list.map((r) => r.workMax));
      lines.push(
        `| ${scenario} | ${name} | ${renderer} | ${med(list, 'workMs')} | ${med(list, 'updateMs')} | ${med(list, 'renderMs')} | **${p95}** | ${p95 <= GOAL_MS ? 'да' : 'нет'} | ${max} | ${med(list, 'drawCalls')} | ${med(list, 'vertices')} | ${med(list, 'objects')} | ${errors} |`,
      );
    }
  }
}
// Сравнение двух версий (первая в --names — «до», вторая — «после»): отношение медиан, допуск +10 %
if (names.length === 2) {
  lines.push('', `| Сценарий | Рисование | Кругов (до/после) | 95-й процентиль до → после, мс | Отношение | Работа кадра до → после, мс | Отношение | В допуске +${TOLERANCE * 100} % |`, '|---|---|---|---|---|---|---|---|');
  for (const scenario of scenarios) {
    for (const renderer of renderers) {
      const [a, b] = names.map((n) => results.filter((r) => r.scenario === scenario && r.version === n && r.renderer === renderer));
      if (!a.length || !b.length) continue;
      const [p95a, p95b, wa, wb] = [med(a, 'workP95'), med(b, 'workP95'), med(a, 'workMs'), med(b, 'workMs')];
      const [rp, rw] = [p95b / p95a, wb / wa];
      lines.push(`| ${scenario} | ${renderer} | ${a.length}/${b.length} | ${p95a} → ${p95b} | ${rp.toFixed(2)} | ${wa} → ${wb} | ${rw.toFixed(2)} | ${rp <= 1 + TOLERANCE && rw <= 1 + TOLERANCE ? 'да' : 'нет'} |`);
    }
  }
}
// Разбор роста по частям (если есть варианты): доля части = (после − вариант без неё) / (после − до); доли могут не складываться в 100 %, остаток — прочие отличия (тела, тени, рамки)
if (names.length === 2 && targets.length > 2) {
  lines.push('', '| Сценарий | Рисование | Вариант | Работа кадра, мс | Доля в росте работы кадра | 95-й процентиль, мс | Доля в росте 95-го процентиля | Объектов | Вызовов рисования |', '|---|---|---|---|---|---|---|---|---|');
  for (const scenario of scenarios) {
    for (const renderer of renderers) {
      const of = (n) => results.filter((r) => r.scenario === scenario && r.version === n && r.renderer === renderer);
      const base = of(names[0]);
      const full = of(names[1]);
      if (!base.length || !full.length) continue;
      const growthW = med(full, 'workMs') - med(base, 'workMs');
      const growthP = med(full, 'workP95') - med(base, 'workP95');
      for (const t of targets.slice(2)) {
        const v = of(t.name);
        if (!v.length) continue;
        const shareW = growthW > 0 ? Math.round(((med(full, 'workMs') - med(v, 'workMs')) / growthW) * 100) : 'н/д';
        const shareP = growthP > 0 ? Math.round(((med(full, 'workP95') - med(v, 'workP95')) / growthP) * 100) : 'н/д';
        lines.push(`| ${scenario} | ${renderer} | ${t.name} (${t.extra}) | ${med(v, 'workMs')} | ${shareW} % | ${med(v, 'workP95')} | ${shareP} % | ${med(v, 'objects')} | ${med(v, 'drawCalls')} |`);
      }
    }
  }
}
const table = lines.join('\n');
console.log('\n' + table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Замер скорости (сценарии stress и fizz): сравнение «до/после» на одной машине, медиана по кругам\n\n${table}\n\nЦель — 95-й процентиль работы кадра ≤ ${GOAL_MS} мс. Сценарий fizz мерится только там, где он есть (у версии «до» его может не быть). Кадры в секунду на сервере не результат (нет видеокарты); итог — замер владельца по ?fps.\n`);
if (results.some((r) => r.errors.length)) process.exitCode = 1;
