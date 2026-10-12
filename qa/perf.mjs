/**
 * ЗАМЕР СКОРОСТИ (кадры в секунду) в двух стресс-сценариях:
 *   stress — `?qa&stress`: 40 башен разных уровней, ≈200 бактерий всех типов, скорость ×3;
 *   fizz   — `?qa&stress=fizz`: 12 Шипучек 4-го уровня («Быстрая» + «Цепная» + «Кислота»), ≈200 бактерий (прочность ×40), скорость ×3 — частые взрывы.
 * Идёт на сервере (`.github/workflows/perf.yml`); локально в контейнере агента не запускать (машина слабая, числа неверные).
 *
 * Запуск (сначала `npm run build:qa` в каждой сравниваемой папке):
 *   node qa/perf.mjs [--roots=.,base] [--names=после,до] [--renderers=webgl,canvas] [--scenario=stress,fizz] [--rounds=2] [--warmup=8] [--seconds=20] [--tag=имя]
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
const scenarios = String(args.scenario ?? 'stress,fizz').split(',');
/** Цель: 95-й процентиль работы кадра, мс (60 кадров в секунду). */
const GOAL_MS = 16.7;
const rounds = Number(args.rounds ?? 2);
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

async function measure(browser, url, renderer, scenario, shotName) {
  const context = await browser.newContext({ ...VIEWPORTS.desktop });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const query = `?qa&stress${scenario === 'fizz' ? '=fizz' : ''}&fps&noplaque${renderer === 'canvas' ? '&canvas' : ''}`;
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
try {
  for (const scenario of scenarios) {
    for (let round = 0; round < rounds; round++) {
      for (const renderer of renderers) {
        // чередуем порядок версий от круга к кругу
        const order = roots.map((_, i) => i);
        if (round % 2 === 1) order.reverse();
        for (const i of order) {
          const shotName = `${scenario}-${names[i]}-${renderer}-${round + 1}`;
          const report = await measure(browser, servers[i].url, renderer, scenario, shotName);
          if (!report) {
            console.log(`${scenario} ${names[i]} ${renderer} круг ${round + 1}: в этой версии сценария нет — пропущено`);
            continue;
          }
          results.push({ scenario, version: names[i], renderer, round: round + 1, ...report });
          console.log(
            `${scenario} ${names[i]} ${renderer} круг ${round + 1}: работа кадра ${report.workMs} мс (расчёт ${report.updateMs}, рисование ${report.renderMs}; 95 % — до ${report.workP95}, максимум ${report.workMax}; цель 95 % ≤ ${GOAL_MS}), вызовов рисования ${report.drawCalls}, вершин ${report.vertices}, ` +
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

// Итоговая таблица: среднее по кругам для каждой версии и способа рисования
const avg = (list, key) => Math.round((list.reduce((a, r) => a + r[key], 0) / list.length) * 10) / 10;
const lines = [
  `| Сценарий | Версия | Рисование | Работа кадра, мс (среднее) | из неё расчёт, мс | из неё рисование, мс | **95-й процентиль работы кадра, мс (цель ≤ ${GOAL_MS})** | Цель | Самый медленный кадр, мс | Вызовов рисования за кадр | Вершин за кадр | Объектов на экране | Ошибки |`,
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const scenario of scenarios) {
  for (const renderer of renderers) {
    for (const name of names) {
      const list = results.filter((r) => r.scenario === scenario && r.version === name && r.renderer === renderer);
      if (!list.length) continue;
      const errors = list.reduce((a, r) => a + r.errors.length, 0);
      const p95 = avg(list, 'workP95');
      const max = Math.max(...list.map((r) => r.workMax));
      lines.push(
        `| ${scenario} | ${name} | ${renderer} | ${avg(list, 'workMs')} | ${avg(list, 'updateMs')} | ${avg(list, 'renderMs')} | **${p95}** | ${p95 <= GOAL_MS ? 'да' : 'нет'} | ${max} | ${avg(list, 'drawCalls')} | ${avg(list, 'vertices')} | ${avg(list, 'objects')} | ${errors} |`,
      );
    }
  }
}
const table = lines.join('\n');
console.log('\n' + table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Замер скорости (сценарии stress и fizz): сравнение «до/после» на одной машине\n\n${table}\n\nЦель — 95-й процентиль работы кадра ≤ ${GOAL_MS} мс. Сценарий fizz мерится только там, где он есть (у версии «до» его может не быть). Кадры в секунду на сервере не результат (нет видеокарты); итог — замер владельца по ?fps.\n`);
if (results.some((r) => r.errors.length)) process.exitCode = 1;
