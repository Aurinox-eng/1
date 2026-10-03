/**
 * ЗАМЕР СКОРОСТИ (кадры в секунду) в стресс-сценарии: `?qa&stress` — 40 башен разных уровней, ≈200 бактерий всех типов, скорость ×3.
 * Идёт на сервере (`.github/workflows/perf.yml`); локально в контейнере агента не запускать (машина слабая, числа неверные).
 *
 * Запуск (сначала `npm run build:qa` в каждой сравниваемой папке):
 *   node qa/perf.mjs [--roots=.,base] [--names=после,до] [--renderers=webgl,canvas] [--rounds=2] [--warmup=8] [--seconds=20] [--tag=имя]
 *     --roots      папки проектов, чьи сборки dist-qa сравниваются (по умолчанию только текущая);
 *     --names      как подписать каждую папку в таблице;
 *     --rounds     сколько раз повторить каждую пару (порядок чередуется, чтобы нагрев машины не давал преимущества одной версии).
 * Печатает таблицу (Markdown) и пишет qa/perf-results/<tag>.json; снимки — qa/screenshots/perf-<tag>/.
 *
 * Что значат числа: «кадров/с» — сколько кадров браузер успел показать (60 — предел экрана); «1 % худших» — кадры в секунду
 * у самых медленных кадров; «работа кадра» — сколько миллисекунд игра считала и рисовала кадр (меньше — лучше; при 60 кадрах на всё 16,7 мс).
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

async function measure(browser, url, renderer, shotName) {
  const context = await browser.newContext({ ...VIEWPORTS.desktop });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const query = `?qa&stress&fps&noplaque${renderer === 'canvas' ? '&canvas' : ''}`;
  await page.goto(url + query);
  await page.waitForFunction(() => Boolean(window.__pvb?.getPerf), null, { timeout: 60000 });
  await sleep(warmupSec * 1000);
  await page.evaluate(() => window.__pvb.getPerf(true));
  await sleep(seconds * 1000);
  const report = await page.evaluate(() => window.__pvb.getPerf());
  await page.screenshot({ path: path.join(shotsDir, `${shotName}.png`) });
  // Крупный план: приближение к середине карты (видны трещины, уровни башен, надписи)
  await page.mouse.move(540, 360);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400);
  await sleep(600);
  await page.screenshot({ path: path.join(shotsDir, `${shotName}-close.png`) });
  await context.close();
  return { ...report, errors };
}

const browser = await launchBrowser();
const servers = [];
for (const root of roots) servers.push(await serve(root));
const results = [];
try {
  for (let round = 0; round < rounds; round++) {
    for (const renderer of renderers) {
      // чередуем порядок версий от круга к кругу
      const order = roots.map((_, i) => i);
      if (round % 2 === 1) order.reverse();
      for (const i of order) {
        const shotName = `${names[i]}-${renderer}-${round + 1}`;
        const report = await measure(browser, servers[i].url, renderer, shotName);
        results.push({ version: names[i], renderer, round: round + 1, ...report });
        console.log(
          `${names[i]} ${renderer} круг ${round + 1}: ${report.fps} кадров/с (1 % худших ${report.fpsLow1}), работа кадра ${report.workMs} мс (95 % — до ${report.workP95}), ` +
            `объектов ${report.objects}, бактерий ${report.bacteria}, башен ${report.towers}${report.errors.length ? `, ОШИБКИ: ${report.errors.join(' | ')}` : ''}`,
        );
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
const lines = ['| Версия | Рисование | Кадров/с | 1 % худших, кадров/с | Работа кадра, мс | 95 % кадров — до, мс | Объектов на экране | Ошибки |', '|---|---|---|---|---|---|---|---|'];
for (const renderer of renderers) {
  for (const name of names) {
    const list = results.filter((r) => r.version === name && r.renderer === renderer);
    if (!list.length) continue;
    const errors = list.reduce((a, r) => a + r.errors.length, 0);
    lines.push(`| ${name} | ${renderer} | ${avg(list, 'fps')} | ${avg(list, 'fpsLow1')} | ${avg(list, 'workMs')} | ${avg(list, 'workP95')} | ${avg(list, 'objects')} | ${errors} |`);
  }
}
const table = lines.join('\n');
console.log('\n' + table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Замер скорости (стресс-сценарий)\n\n${table}\n`);
if (results.some((r) => r.errors.length)) process.exitCode = 1;
