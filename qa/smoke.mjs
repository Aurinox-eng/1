/**
 * Проверка игры в браузере (Playwright). Запуск: npm run qa -- --tag=stage1
 *
 * Что делает, на телефонном и компьютерном экране (русский и английский текст):
 *  1. открывает собранную игру (папка dist) и слушает консоль браузера;
 *  2. проверяет, что поле 9:16 помещается в экран и страница не прокручивается;
 *  3. стреляет по бактерии и проверяет, что счёт вырос;
 *  4. не стреляет вообще и проверяет, что наступает проигрыш;
 *  5. тапает по экрану проигрыша и проверяет, что игра началась заново;
 *  6. делает скриншоты в qa/screenshots/<tag>/.
 * Итог печатается в консоль; при любой ошибке скрипт завершается с кодом 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gameToPage, launchBrowser, parseArgs, ROOT, sleep, startServer, tap, VIEWPORTS } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const tag = String(args.tag ?? 'latest');
const shotsDir = path.join(ROOT, 'qa', 'screenshots', tag);
// Старые скриншоты этого этапа удаляем, чтобы в папке не оставались устаревшие файлы
fs.rmSync(shotsDir, { recursive: true, force: true });
fs.mkdirSync(shotsDir, { recursive: true });

const results = []; // { name, ok, details }
const consoleProblems = []; // ошибки и предупреждения браузера
const screenshots = [];

const check = (name, ok, details = '') => {
  results.push({ name, ok, details });
  console.log(`${ok ? '✅' : '❌'} ${name}${details ? ` — ${details}` : ''}`);
};

const getState = (page) => page.evaluate(() => window.__pvb?.getState());

async function waitFor(page, predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await getState(page);
    if (state && predicate(state)) return state;
    await sleep(50);
  }
  throw new Error(`Не дождались: ${label}`);
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file });
  screenshots.push(path.relative(ROOT, file));
}

async function runScenario(browser, baseUrl, deviceKey, lang) {
  const device = VIEWPORTS[deviceKey];
  const prefix = `[${device.label}, ${lang}]`;
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  });
  const page = await context.newPage();

  // Всё, что браузер пишет в консоль как ошибку/предупреждение, и любые сбои загрузки
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleProblems.push(`${prefix} console.${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => consoleProblems.push(`${prefix} ОШИБКА СТРАНИЦЫ: ${err.message}`));
  page.on('requestfailed', (req) =>
    consoleProblems.push(`${prefix} не загрузилось: ${req.url()} (${req.failure()?.errorText})`),
  );
  page.on('response', (res) => {
    if (res.status() >= 400) consoleProblems.push(`${prefix} HTTP ${res.status()}: ${res.url()}`);
  });

  // speed=2 — игровое время идёт вдвое быстрее, чтобы проверка шла быстрее
  await page.goto(`${baseUrl}?qa&speed=2&lang=${lang}`, { waitUntil: 'load' });
  await waitFor(page, (s) => s.state === 'playing', 10000, 'запуск игры');
  const name = `${deviceKey}-${lang}`;

  // 1. Размеры и прокрутка
  const layout = await page.evaluate(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      fitsX: rect.left >= -1 && rect.right <= window.innerWidth + 1,
      fitsY: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      scrolls:
        document.documentElement.scrollHeight > window.innerHeight + 1 ||
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check(`${prefix} поле 9:16`, Math.abs(layout.ratio - 9 / 16) < 0.01, `пропорции ${layout.ratio.toFixed(3)}`);
  check(`${prefix} поле помещается в экран`, layout.fitsX && layout.fitsY);
  check(`${prefix} страница не прокручивается`, !layout.scrolls);
  check(`${prefix} язык страницы`, (await getState(page)).lang === lang, `lang=${(await getState(page)).lang}`);

  // 2. Выстрел и попадание. Для выстрела важна только позиция по горизонтали,
  //    поэтому тапаем по нижней части поля (у новой бактерии y может быть за краем экрана)
  await waitFor(page, (s) => s.bacteria.length > 0, 8000, 'появление бактерии');
  await shot(page, `${name}-1-start`);

  let hit = false;
  for (let attempt = 0; attempt < 8 && !hit; attempt++) {
    const state = await getState(page);
    if (state.state !== 'playing' || state.bacteria.length === 0) {
      await sleep(100);
      continue;
    }
    const target = state.bacteria.reduce((a, b) => (b.y > a.y ? b : a));
    const point = await gameToPage(page, target.x, state.height - 300);
    const shotsBefore = state.shots;
    await tap(page, point.x, point.y, device.hasTouch);
    if (attempt === 0) {
      const fired = (await getState(page)).shots - shotsBefore;
      check(`${prefix} один тап = одна таблетка`, fired === 1, `выпущено: ${fired}`);
    }
    try {
      await waitFor(page, (s) => s.score > 0, 1500, 'попадание');
      hit = true;
    } catch {
      /* промах — пробуем ещё раз */
    }
  }
  check(`${prefix} попадание увеличивает счёт`, hit);
  await shot(page, `${name}-2-hit`);

  // Кадр «бой»: ждём, пока на поле станет несколько бактерий, и стреляем — таблетка в полёте
  try {
    await waitFor(page, (s) => s.bacteria.length >= 4 && s.state === 'playing', 12000, 'несколько бактерий');
    const state = await getState(page);
    const target = state.bacteria.reduce((a, b) => (b.y > a.y ? b : a));
    const point = await gameToPage(page, target.x, state.height - 300);
    await tap(page, point.x, point.y, device.hasTouch);
    await shot(page, `${name}-3-battle`);
  } catch (e) {
    check(`${prefix} кадр «бой»`, false, e.message);
  }

  // 3. Проигрыш, если не стрелять
  try {
    await waitFor(page, (s) => s.state === 'over', 30000, 'проигрыш');
    check(`${prefix} проигрыш наступает`, true);
  } catch {
    check(`${prefix} проигрыш наступает`, false, 'за 30 сек. проигрыша не было');
  }
  await sleep(300);
  await shot(page, `${name}-4-gameover`);

  // 4. Рестарт (тап работает не сразу — защита от случайного нажатия)
  await sleep(700);
  const centre = await gameToPage(page, 360, 640);
  await tap(page, centre.x, centre.y, device.hasTouch);
  try {
    const restarted = await waitFor(page, (s) => s.state === 'playing', 3000, 'рестарт');
    check(
      `${prefix} рестарт по тапу`,
      restarted.score === 0 && restarted.bacteria.length === 0,
      `счёт ${restarted.score}, бактерий ${restarted.bacteria.length}`,
    );
    // После рестарта один тап = ровно одна таблетка (обработчики не задвоились)
    await sleep(200);
    await tap(page, centre.x, centre.y, device.hasTouch);
    const fired = (await getState(page)).shots;
    check(`${prefix} после рестарта один тап = одна таблетка`, fired === 1, `выпущено: ${fired}`);
  } catch (e) {
    check(`${prefix} рестарт по тапу`, false, e.message);
  }

  await context.close();
}

const server = await startServer();
const browser = await launchBrowser();
let crashed = null;
try {
  await runScenario(browser, server.url, 'phone', 'ru');
  await runScenario(browser, server.url, 'desktop', 'ru');
  await runScenario(browser, server.url, 'phone', 'en');
} catch (error) {
  crashed = error;
  check('Проверка дошла до конца', false, error.message);
} finally {
  await browser.close();
  await server.close();
}

// Ошибки консоли: любая ошибка — провал. Предупреждения показываем отдельно.
const errors = consoleProblems.filter((p) => !p.includes('console.warning'));
const warnings = consoleProblems.filter((p) => p.includes('console.warning'));
check('Консоль браузера без ошибок', errors.length === 0, errors.length ? `${errors.length} шт.` : '');
for (const line of errors) console.log(`   ✗ ${line}`);
if (warnings.length) {
  console.log(`⚠️  Предупреждения браузера (${warnings.length}, не считаются ошибкой):`);
  for (const line of [...new Set(warnings)].slice(0, 10)) console.log(`   ! ${line}`);
}

const failed = results.filter((r) => !r.ok);
console.log('\nСкриншоты:');
for (const file of screenshots) console.log(`  ${file}`);
console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено.`);
process.exit(failed.length || crashed ? 1 : 0);
