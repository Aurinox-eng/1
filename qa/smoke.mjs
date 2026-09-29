/**
 * Проверка игры в браузере (Playwright). Запуск: npm run qa -- --tag=stage-1
 * (сначала сама собирает игровую и тестовую версии игры).
 *
 * ТЕСТОВАЯ сборка (dist-qa, с режимом ?qa), на телефоне и компьютере, на русском и английском:
 *  1. язык выбирается по настройкам браузера (без подсказок в адресе);
 *  2. поле 9:16 помещается в экран, страница не прокручивается, включён WebGL;
 *  3. тап по самому полю и по тёмным полям вокруг него стреляет ровно одной таблеткой;
 *  4. попадание увеличивает счёт;
 *  5. проигрыш наступает; рестарт по тапу, обработчики нажатия не копятся;
 *  6. только телефон: два пальца одновременно = две таблетки; поворот экрана перестраивает
 *     поле; после «зависания» страницы на 3 секунды бактерии не прыгают.
 * ИГРОВАЯ сборка (dist, та, что уйдёт на Яндекс): режима проверки в ней нет, подмена
 * настроек и языка из адреса не работает, консоль чистая.
 *
 * Дополнительно: --only=phone-ru (или desktop-en, phone-en, desktop-ru, listeners, production)
 * запускает только один сценарий — быстро проверить одну вещь.
 *
 * Скриншоты — в qa/screenshots/<tag>/. Итог печатается в консоль; при любой ошибке код выхода 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gameToPage, launchBrowser, parseArgs, ROOT, sleep, startServer, tap, VIEWPORTS } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const tag = args.tag === undefined ? 'latest' : args.tag;
if (typeof tag !== 'string' || !/^[\w-]+$/.test(tag)) {
  console.error(`Неверный --tag=«${tag === true ? '' : tag}»: допустимы только буквы, цифры, «_» и «-» (например --tag=stage-2).`);
  process.exit(2);
}
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
const WAIT_MS = 60000; // запас на медленный компьютер: игровое время идёт медленнее реального

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

function watchConsole(page, prefix) {
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
}

/** Как поле лежит в окне: пропорции, помещается ли, по центру ли, занимает ли экран. */
const measureCanvas = (page) =>
  page.evaluate(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      centred:
        Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2,
      fill: Math.max(rect.width / innerWidth, rect.height / innerHeight),
      scrolls:
        document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      win: { w: innerWidth, h: innerHeight },
    };
  });

const layoutOk = (m) => Math.abs(m.ratio - 9 / 16) < 0.01 && m.fits && m.centred && m.fill > 0.98;

async function runScenario(browser, baseUrl, deviceKey, lang) {
  const device = VIEWPORTS[deviceKey];
  const prefix = `[${device.label}, ${lang}]`;
  // Язык задаём настройками браузера (locale), а не адресом — так проверяется настоящее определение языка
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });
  const page = await context.newPage();
  watchConsole(page, prefix);

  // speed=2 — игровое время идёт вдвое быстрее, чтобы проверка шла быстрее
  await page.goto(`${baseUrl}?qa&speed=2`, { waitUntil: 'load' });
  await waitFor(page, (s) => s.state === 'playing', 15000, 'запуск игры');
  const name = `${deviceKey}-${lang}`;
  const isPhone = device.hasTouch;

  // 1. Язык, размеры, прокрутка, WebGL
  const first = await getState(page);
  check(`${prefix} язык выбран по настройкам браузера`, first.lang === lang, `lang=${first.lang}`);
  const layout = await measureCanvas(page);
  check(`${prefix} поле 9:16`, Math.abs(layout.ratio - 9 / 16) < 0.01, `пропорции ${layout.ratio.toFixed(3)}`);
  check(`${prefix} поле помещается в экран, по центру`, layout.fits && layout.centred);
  check(`${prefix} страница не прокручивается`, !layout.scrolls);
  check(`${prefix} отрисовка через WebGL`, first.renderer === 'webgl', `renderer=${first.renderer}`);
  const listenersAtStart = first.tapListeners;

  // 2. Тап по тёмному полю вокруг игрового поля тоже стреляет (на телефоне это полосы сверху и снизу)
  const { rect, win } = layout;
  const margin =
    rect.left > 20
      ? { x: rect.left / 2, y: win.h / 2, label: 'боковое тёмное поле' }
      : { x: win.w / 2, y: rect.bottom + (win.h - rect.bottom) / 2, label: 'нижняя тёмная полоса' };
  const beforeMargin = (await getState(page)).shots;
  await tap(page, margin.x, margin.y, isPhone);
  const afterMargin = await getState(page);
  const marginPill = afterMargin.pills[afterMargin.pills.length - 1];
  check(
    `${prefix} тап по тёмному полю стреляет (${margin.label})`,
    afterMargin.shots - beforeMargin === 1 && (!marginPill || (marginPill.x >= 11 && marginPill.x <= 709)),
    `выстрелов +${afterMargin.shots - beforeMargin}`,
  );
  await sleep(300);

  // 3. Выстрел по самому полю и попадание. Для выстрела важна только позиция по горизонтали,
  //    поэтому тапаем по нижней части поля (у новой бактерии y может быть за краем экрана)
  await waitFor(page, (s) => s.bacteria.length > 0, WAIT_MS, 'появление бактерии');
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
    await tap(page, point.x, point.y, isPhone);
    if (attempt === 0) {
      const fired = (await getState(page)).shots - shotsBefore;
      check(`${prefix} один тап = одна таблетка`, fired === 1, `выпущено: ${fired}`);
    }
    try {
      await waitFor(page, (s) => s.score > 0, 3000, 'попадание');
      hit = true;
    } catch {
      /* промах — пробуем ещё раз */
    }
    await sleep(120);
  }
  check(`${prefix} попадание увеличивает счёт`, hit);
  await shot(page, `${name}-2-hit`);

  // 4. Только телефон: два пальца, поворот экрана, «зависание» страницы
  if (isPhone && lang === 'ru') {
    // Два пальца одновременно (настоящие мультитач-события браузера)
    const cdp = await context.newCDPSession(page);
    const left = await gameToPage(page, 200, 900);
    const right = await gameToPage(page, 520, 900);
    await sleep(400);
    const beforeTwo = (await getState(page)).shots;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: left.x, y: left.y, id: 11 },
        { x: right.x, y: right.y, id: 12 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    const firedTwo = (await getState(page)).shots - beforeTwo;
    check(`${prefix} два пальца одновременно = две таблетки`, firedTwo === 2, `выпущено: ${firedTwo}`);

    // Поворот экрана и возврат
    for (const [w, h, label] of [
      [844, 390, 'горизонтально'],
      [390, 844, 'снова вертикально'],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(1500);
      const m = await measureCanvas(page);
      check(
        `${prefix} поворот экрана (${label}): поле перестроилось`,
        layoutOk(m),
        `ratio ${m.ratio.toFixed(3)}, помещается ${m.fits}, по центру ${m.centred}, заполнение ${m.fill.toFixed(2)}`,
      );
      if (w > h) await shot(page, `${name}-3-landscape`);
    }

    // «Зависание» страницы (как после сворачивания вкладки): после него бактерии не должны прыгнуть
    await waitFor(page, (s) => s.state === 'playing' && s.bacteria.length >= 2, WAIT_MS, 'бактерии перед зависанием');
    const beforeFreeze = await getState(page);
    await page.evaluate(() => {
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        /* страница занята и не рисует кадры */
      }
    });
    await sleep(300);
    const afterFreeze = await getState(page);
    const jumped = afterFreeze.elapsed - beforeFreeze.elapsed;
    const maxDrop = Math.max(
      0,
      ...afterFreeze.bacteria.map((b) => {
        const old = beforeFreeze.bacteria.find((o) => Math.abs(o.x - b.x) < 90 && o.age < b.age);
        return old ? b.y - old.y : 0;
      }),
    );
    check(
      `${prefix} после «зависания» на 3 сек игра не прыгает`,
      afterFreeze.state === 'over' || (jumped < 1.5 && maxDrop < 200),
      `прошло игрового времени ${jumped.toFixed(2)} с, бактерии сдвинулись максимум на ${maxDrop.toFixed(0)} px`,
    );
  }

  // Кадр «бой»: ждём, пока на поле станет несколько бактерий, и стреляем — таблетка в полёте
  try {
    const cur = await getState(page);
    if (cur.state === 'playing') {
      await waitFor(page, (s) => s.bacteria.length >= 4 && s.state === 'playing', WAIT_MS, 'несколько бактерий');
      const state = await getState(page);
      const target = state.bacteria.reduce((a, b) => (b.y > a.y ? b : a));
      const point = await gameToPage(page, target.x, state.height - 300);
      await tap(page, point.x, point.y, isPhone);
      await shot(page, `${name}-4-battle`);
    }
  } catch (e) {
    check(`${prefix} кадр «бой»`, false, e.message);
  }

  // 5. Проигрыш, если не стрелять
  try {
    await waitFor(page, (s) => s.state === 'over', WAIT_MS, 'проигрыш');
    check(`${prefix} проигрыш наступает`, true);
  } catch {
    check(`${prefix} проигрыш наступает`, false, `за ${WAIT_MS / 1000} сек. проигрыша не было`);
  }
  await sleep(300);
  await shot(page, `${name}-5-gameover`);

  // 6. Рестарт (тап работает не сразу — защита от случайного нажатия)
  await sleep(800);
  const centre = await gameToPage(page, 360, 640);
  await tap(page, centre.x, centre.y, isPhone);
  try {
    const restarted = await waitFor(page, (s) => s.state === 'playing', 5000, 'рестарт');
    check(
      `${prefix} рестарт по тапу`,
      restarted.score === 0 && restarted.kills === 0 && restarted.elapsed < 2,
      `счёт ${restarted.score}, прошло ${restarted.elapsed.toFixed(2)} с`,
    );
    check(
      `${prefix} после рестарта обработчики нажатия не копятся`,
      restarted.tapListeners === listenersAtStart,
      `было ${listenersAtStart}, стало ${restarted.tapListeners}`,
    );
    // После рестарта один тап = ровно одна таблетка
    await sleep(300);
    await tap(page, centre.x, centre.y, isPhone);
    const fired = (await getState(page)).shots;
    check(`${prefix} после рестарта один тап = одна таблетка`, fired === 1, `выпущено: ${fired}`);
  } catch (e) {
    check(`${prefix} рестарт по тапу`, false, e.message);
  }

  await context.close();
}

/**
 * Обработчики нажатия при рестартах. Пауза между выстрелами скрывает задвоение (второй обработчик
 * в тот же момент просто упирается в паузу), поэтому здесь её отключаем: тогда каждый лишний
 * обработчик дал бы лишнюю таблетку.
 */
async function runListenerCheck(browser, baseUrl) {
  const prefix = '[обработчики нажатия]';
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop.viewport, locale: 'ru-RU' });
  const page = await context.newPage();
  watchConsole(page, prefix);
  await page.goto(`${baseUrl}?qa&speed=8&cfg=pill.cooldownMs:0`, { waitUntil: 'load' });
  await waitFor(page, (s) => s.state === 'playing', 15000, 'запуск игры');

  for (let restart = 1; restart <= 3; restart++) {
    await waitFor(page, (s) => s.state === 'over', WAIT_MS, 'проигрыш');
    await sleep(800);
    const centre = await gameToPage(page, 360, 640);
    await page.mouse.click(centre.x, centre.y);
    await waitFor(page, (s) => s.state === 'playing' && s.elapsed < 1, 5000, `рестарт №${restart}`);
  }
  const layout = await measureCanvas(page);
  const inside = await gameToPage(page, 360, 900);
  const outside = { x: layout.rect.left / 2, y: layout.win.h / 2 };
  const fired = [];
  for (const point of [inside, outside]) {
    const before = (await getState(page)).shots;
    await page.mouse.click(point.x, point.y);
    await sleep(60);
    fired.push((await getState(page)).shots - before);
  }
  check(
    `${prefix} после 3 рестартов один клик = одна таблетка (без паузы между выстрелами)`,
    fired[0] === 1 && fired[1] === 1,
    `по полю +${fired[0]}, по тёмному полю +${fired[1]}`,
  );
  await context.close();
}

/** Игровая сборка (та, что уйдёт на Яндекс): режима проверки в ней быть не должно. */
async function runProductionCheck(browser, baseUrl) {
  const prefix = '[игровая сборка]';
  const context = await browser.newContext({
    viewport: VIEWPORTS.phone.viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  watchConsole(page, prefix);
  // Если бы подмена сработала, бактерии сыпались бы мгновенно и партия закончилась бы за секунду
  const url =
    `${baseUrl}?qa&speed=10&lang=en&cfg=bacteria.startSpeed:5000,bacteria.spawnIntervalSec:0.01,bacteria.firstSpawnDelaySec:0.01`;
  await page.goto(url, { waitUntil: 'load' });
  await sleep(4000);

  const hook = await page.evaluate(() => typeof window.__pvb);
  check(`${prefix} режима проверки (?qa) нет`, hook === 'undefined', `typeof __pvb = ${hook}`);
  check(`${prefix} язык из адреса (?lang=en) не действует`, (await page.evaluate(() => document.documentElement.lang)) === 'ru');

  // Пиксель у левого края поля на середине высоты: в игре — цвет поля (22,42,74); экран проигрыша затемнил бы его
  const m = await measureCanvas(page);
  const png = await page.screenshot({
    clip: { x: m.rect.left + 3, y: m.rect.top + (m.rect.bottom - m.rect.top) * 0.5, width: 1, height: 1 },
  });
  const px = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, png.toString('base64'));
  check(`${prefix} подмена чисел из адреса (?cfg=) не действует`, px[0] + px[1] + px[2] > 80, `цвет пикселя ${px.join(',')}`);
  check(`${prefix} поле помещается в экран`, layoutOk(m));
  await shot(page, 'production-start');
  await context.close();
}

const only = args.only === undefined ? null : String(args.only);
const wants = (key) => only === null || only === key;
const scenarios = [
  ['phone-ru', 'phone', 'ru'],
  ['desktop-ru', 'desktop', 'ru'],
  ['phone-en', 'phone', 'en'],
  ['desktop-en', 'desktop', 'en'],
];
const needQa = scenarios.some(([key]) => wants(key)) || wants('listeners');
const qaServer = needQa ? await startServer('dist-qa') : null;
const prodServer = wants('production') ? await startServer('dist') : null;
const browser = await launchBrowser();
let crashed = null;
try {
  for (const [key, device, lang] of scenarios) {
    if (wants(key)) await runScenario(browser, qaServer.url, device, lang);
  }
  if (wants('listeners')) await runListenerCheck(browser, qaServer.url);
  if (wants('production')) await runProductionCheck(browser, prodServer.url);
} catch (error) {
  crashed = error;
  check('Проверка дошла до конца', false, error.message);
} finally {
  await browser.close();
  await qaServer?.close();
  await prodServer?.close();
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
