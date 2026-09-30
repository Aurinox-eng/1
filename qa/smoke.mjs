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
 *  6. на старте на экране 3–4 бактерии, а не пустое поле;
 *  7. только телефон: два пальца одновременно = две таблетки; поворот экрана перестраивает
 *     поле; после «зависания» страницы на 3 секунды бактерии не прыгают (замедленный мир);
 *  8. отдельный сценарий «типы бактерий»: у каждого типа свои HP, очки и поведение (зигзаг палочки,
 *     распад делящейся на два кокка и её самоделение, 6 HP бронированной, быстрая спора), три жизни
 *     (бронированная отнимает две), отклик на попадание, звук, и расписание появления типов —
 *     по одному, каждый первый раз в одиночку.
 * ИГРОВАЯ сборка (dist, та, что уйдёт на Яндекс): режима проверки в ней нет, подмена
 * настроек и языка из адреса не работает, консоль чистая.
 *
 *
 * Дополнительно: --only=phone-ru (или desktop-en, phone-en, desktop-ru, mechanics, listeners, production)
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
  check(
    `${prefix} на старте на экране несколько бактерий (стартовое число из config.ts) и все видны`,
    first.bacteria.length >= 3 && first.bacteria.length <= 6 && first.bacteria.every((b) => b.y + b.r > 0),
    `бактерий: ${first.bacteria.length} (прошло ${first.elapsed.toFixed(2)} с)`,
  );

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
    afterMargin.shots - beforeMargin === 1 && (!marginPill || (marginPill.x >= 3 && marginPill.x <= 717)),
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
      await shot(page, `${name}-2-hit`); // сразу, пока видны вспышка, частицы и «+очки»
    } catch {
      /* промах — пробуем ещё раз */
    }
    await sleep(120);
  }
  check(`${prefix} попадание увеличивает счёт`, hit);

  // Кадр «бой»: ждём, пока на поле станет густо, и стреляем — таблетка в полёте
  try {
    try {
      await waitFor(page, (s) => s.bacteria.length >= 6 && s.state === 'playing', 8000, 'густо на поле');
    } catch {
      /* снимем то, что есть */
    }
    const state = await getState(page);
    if (state.state === 'playing' && state.bacteria.length) {
      const target = state.bacteria.reduce((a, b) => (b.y > a.y ? b : a));
      const point = await gameToPage(page, target.x, state.height - 300);
      await tap(page, point.x, point.y, isPhone);
    }
    await shot(page, `${name}-4-battle`);
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

  // 7. Только телефон (ru): проверки, которым нужна долгая партия — в замедленном мире
  if (isPhone && lang === 'ru') await runPhoneLongChecks(context, baseUrl, prefix, name);

  await context.close();
}

/**
 * Проверки телефона, которым нужна партия подлиннее: два пальца, поворот экрана, «зависание» страницы.
 * Обычная партия при бездействии кончается за 6–10 секунд, поэтому здесь бактерии еле ползут
 * и не делятся сами, а новые не появляются.
 */
async function runPhoneLongChecks(context, baseUrl, prefix, name) {
  const page = await context.newPage();
  watchConsole(page, `${prefix} [замедленный мир]`);
  const slow = 'bacteria.startSpeed:6,spawn.intervalStartSec:9999,spawn.intervalEndSec:9999';
  await page.goto(`${baseUrl}?qa&speed=1&cfg=${slow}`, { waitUntil: 'load' });
  await waitFor(page, (s) => s.state === 'playing', 15000, 'запуск замедленного мира');

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

  // «Зависание» страницы (как после сворачивания вкладки): после него игровое время не должно скакнуть
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
  check(
    `${prefix} после «зависания» на 3 сек игровое время не скачет`,
    jumped < 1.0,
    `прошло игрового времени ${jumped.toFixed(2)} с (без защиты было бы ≈3.3 с)`,
  );
  await page.close();
}

/**
 * Типы бактерий и жизни на предсказуемом поле: почти неподвижная бактерия одного типа, других нет.
 * Проверяем HP и очки, отклик, поведение каждого типа, потерю жизней и расписание появления типов.
 */
async function runMechanicsCheck(browser, baseUrl) {
  const prefix = '[типы бактерий]';
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop.viewport, locale: 'ru-RU' });

  const STILL =
    'spawn.startCountMin:1,spawn.startCountMax:1,spawn.intervalStartSec:9999,spawn.intervalEndSec:9999,' +
    'bacteria.wobbleAmplitude:0,bacteria.startSpeed:20';
  /** Только тип `kind` (и он есть с самого начала), остальные не появляются. */
  const only = (kind) => `types.${kind}.introSec:0,types.coccus.weight:${kind === 'coccus' ? 55 : 0}`;

  async function open(cfg, speed = 1) {
    const page = await context.newPage();
    watchConsole(page, prefix);
    await page.goto(`${baseUrl}?qa&speed=${speed}&cfg=${cfg}`, { waitUntil: 'load' });
    await waitFor(page, (x) => x.state === 'playing', 15000, 'запуск игры');
    return page;
  }

  /** Стреляет по бактерии (самой нижней), пока не выполнится условие. */
  async function shootUntil(page, done, label) {
    for (let i = 0; i < 40; i++) {
      const state = await getState(page);
      if (done(state)) return state;
      const target = [...state.bacteria].sort((a, b) => b.y - a.y)[0];
      if (target) {
        const p = await gameToPage(page, target.x, 900);
        await page.mouse.click(p.x, p.y);
      }
      for (let k = 0; k < 20; k++) {
        await sleep(30);
        const now = await getState(page);
        if (done(now)) return now;
      }
    }
    throw new Error(`не получилось: ${label}`);
  }
  const kinds = (state) => state.bacteria.map((b) => b.kind).sort().join('+');

  // ---- Кокк: 1 HP, +10, вспышка + «+очки» + частицы, звук
  let page = await open(`${STILL},${only('coccus')}`);
  let s = await shootUntil(page, (x) => x.hits >= 1, 'попадание в кокка');
  await shot(page, 'types-1-hit');
  check(`${prefix} кокк гибнет от одного попадания: +10 очков`, s.score === 10 && s.bacteria.length === 0 && s.kills === 1, `очки ${s.score}, на поле ${s.bacteria.length}`);
  check(
    `${prefix} отклик: вспышка, «+очки», частицы; тряски при обычной гибели нет`,
    s.effects.flashes === 1 && s.effects.popups === 1 && s.effects.bursts === 1 && s.effects.shakes === 0,
    JSON.stringify(s.effects),
  );
  check(`${prefix} звук сыгран (аудио запущено по касанию)`, s.sound.state === 'running' && s.sound.played > 0, JSON.stringify(s.sound));
  await page.close();

  // ---- Палочка: 2 HP, +5 за попадание, +20 за уничтожение (зигзаг выключаем, чтобы не промахиваться)
  page = await open(`${STILL},${only('rod')},types.rod.zigzagPx:0`);
  const rod = (await getState(page)).bacteria[0];
  check(`${prefix} палочка: 2 HP`, rod.kind === 'rod' && rod.hp === 2 && rod.maxHp === 2, `hp ${rod.hp}/${rod.maxHp}`);
  s = await shootUntil(page, (x) => x.hits >= 1, 'первое попадание в палочку');
  check(
    `${prefix} палочка после 1-го попадания: 1 HP, +5 очков, вспышка и «+очки», без частиц`,
    s.bacteria[0]?.hp === 1 && s.score === 5 && s.effects.flashes === 1 && s.effects.popups === 1 && s.effects.bursts === 0,
    `hp ${s.bacteria[0]?.hp}, очки ${s.score}, ${JSON.stringify(s.effects)}`,
  );
  await shot(page, 'types-2-rod-damaged');
  s = await shootUntil(page, (x) => x.hits >= 2, 'второе попадание в палочку');
  check(`${prefix} палочка уничтожена вторым попаданием: +20 очков, частицы`, s.score === 25 && s.bacteria.length === 0 && s.effects.bursts === 1, `очки ${s.score}`);
  await page.close();

  // ---- Палочка идёт зигзагом
  page = await open(`${STILL},${only('rod')}`);
  const first = await getState(page);
  let minX = Infinity;
  let maxX = -Infinity;
  const until = first.elapsed + 2.6;
  for (let cur = first; cur.elapsed < until; cur = await getState(page)) {
    minX = Math.min(minX, cur.bacteria[0].x);
    maxX = Math.max(maxX, cur.bacteria[0].x);
    await sleep(40);
  }
  check(`${prefix} палочка движется зигзагом`, maxX - minX > 90, `размах по горизонтали ${(maxX - minX).toFixed(0)} px за 2.6 с игрового времени`);
  await page.close();

  // ---- Делящаяся: 2 HP, при уничтожении — два кокка, лёгкая тряска
  page = await open(`${STILL},${only('splitter')},types.splitter.selfSplitSec:0`);
  s = await shootUntil(page, (x) => x.hits >= 1, 'первое попадание в делящуюся');
  check(`${prefix} делящаяся после 1-го попадания: 1 HP, +5 очков, ещё цела`, s.bacteria.length === 1 && s.bacteria[0].hp === 1 && s.score === 5, `hp ${s.bacteria[0]?.hp}, очки ${s.score}`);
  s = await shootUntil(page, (x) => x.hits >= 2, 'второе попадание в делящуюся');
  await shot(page, 'types-3-splitter-split');
  check(`${prefix} уничтоженная делящаяся распадается на два кокка (+25 очков)`, kinds(s) === 'coccus+coccus' && s.score === 30, `на поле: ${kinds(s)}, очки ${s.score}`);
  check(`${prefix} при делении — лёгкая тряска экрана`, s.effects.shakes === 1 && s.splits === 1, `тряска ${s.effects.shakes}, распадов ${s.splits}`);
  await page.close();

  // ---- Делящаяся сама: без попаданий делится через selfSplitSec, попадание сбрасывает отсчёт
  page = await open(`${STILL},${only('splitter')},types.splitter.selfSplitSec:2.5`, 2);
  const before = await getState(page);
  const after = await waitFor(page, (x) => x.selfSplits >= 1, WAIT_MS, 'самоделение');
  check(
    `${prefix} делящаяся, которую не трогали, делится сама на два кокка (без очков)`,
    before.bacteria.length === 1 && kinds(after) === 'coccus+coccus' && after.score === 0 && after.splits === 0,
    `на поле: ${kinds(after)}, очки ${after.score}, самоделений ${after.selfSplits}, прошло ${after.elapsed.toFixed(1)} с`,
  );
  await page.close();

  // ---- Бронированная: 6 HP, толстая оболочка, +5 за попадание, +60 за уничтожение
  page = await open(`${STILL},${only('armored')}`);
  const hps = [(await getState(page)).bacteria[0].hp];
  for (let want = 1; want <= 5; want++) {
    s = await shootUntil(page, (x) => x.hits >= want, `попадание №${want} в бронированную`);
    hps.push(s.bacteria[0].hp);
    if (want === 3) await shot(page, 'types-4-armored-cracked');
  }
  check(`${prefix} бронированная: 6 HP, каждое попадание снимает 1`, hps.join(',') === '6,5,4,3,2,1', `HP по ходу: ${hps.join(' → ')}`);
  s = await shootUntil(page, (x) => x.hits >= 6, 'шестое попадание в бронированную');
  check(`${prefix} бронированная уничтожена 6-м попаданием: 5×5 + 60 очков`, s.score === 85 && s.bacteria.length === 0, `очки ${s.score}`);
  await page.close();

  // ---- Жизни: бронированная, дойдя до линии, отнимает 2 из 3
  page = await open(`${STILL.replace('startSpeed:20', 'startSpeed:900')},${only('armored')}`);
  s = await waitFor(page, (x) => x.lives < x.maxLives, WAIT_MS, 'потеря жизней');
  check(`${prefix} бронированная у линии отнимает 2 жизни (из 3)`, s.lives === 1 && s.state === 'playing' && s.bacteria.length === 0, `жизней ${s.lives}, состояние ${s.state}`);
  // (звука здесь нет: в этой странице никто не касался экрана, а браузер без касания звук не запускает)
  check(`${prefix} потеря жизни: красная вспышка на линии и тряска`, s.effects.lifeLosses === 1, JSON.stringify(s.effects));
  await page.close();

  // ---- Жизни: кокки отнимают по одной, на нуле — проигрыш
  page = await open('spawn.startCountMin:3,spawn.startCountMax:3,spawn.intervalStartSec:9999,spawn.intervalEndSec:9999,bacteria.wobbleAmplitude:0,bacteria.startSpeed:700');
  const seen = new Set([(await getState(page)).lives]);
  let last = await getState(page);
  const deadline = Date.now() + WAIT_MS;
  while (last.state === 'playing' && Date.now() < deadline) {
    seen.add(last.lives);
    await sleep(20);
    last = await getState(page);
  }
  check(`${prefix} три жизни: кокки отнимают по одной, на нуле — проигрыш`, last.lives === 0 && last.state === 'over' && seen.has(3), `жизни по ходу: ${[...seen].sort().reverse().join(' → ')} → 0, состояние ${last.state}`);
  await page.close();

  // ---- Спора быстрее кокка
  const speedOf = async (kind) => {
    const p = await open(`${STILL},${only(kind)}`);
    const a = await getState(p);
    const b = await waitFor(p, (x) => x.elapsed >= a.elapsed + 0.8, WAIT_MS, 'сдвиг бактерии');
    await p.close();
    return (b.bacteria[0].y - a.bacteria[0].y) / (b.elapsed - a.elapsed);
  };
  const [coccusSpeed, sporeSpeed] = [await speedOf('coccus'), await speedOf('spore')];
  check(`${prefix} спора падает заметно быстрее кокка (не в разы: при быстром падении споре 2×+ физически не поймать)`, sporeSpeed > coccusSpeed * 1.3, `кокк ${coccusSpeed.toFixed(0)} px/с, спора ${sporeSpeed.toFixed(0)} px/с`);

  // ---- Расписание появления: по одному, каждый первый раз в одиночку
  page = await open('bacteria.startSpeed:3,spawn.intervalStartSec:0.6,spawn.intervalEndSec:0.6,spawn.jitter:0', 10);
  const arrivals = [];
  let known = (await getState(page)).introduced.length;
  for (let cur = await getState(page); cur.elapsed < 66 && cur.state === 'playing'; cur = await getState(page)) {
    if (cur.introduced.length > known) {
      const kind = cur.introduced[cur.introduced.length - 1];
      arrivals.push({ kind, at: cur.elapsed, onScreen: cur.bacteria.filter((b) => b.kind === kind).length });
      if (kind === 'armored') await shot(page, 'types-5-armored-arrival');
      known = cur.introduced.length;
    }
    await sleep(25);
  }
  const order = arrivals.map((a) => a.kind).join(' → ');
  check(`${prefix} типы появляются по одному в заданном порядке`, order === 'rod → splitter → armored → spore', `порядок: coccus → ${order}`);
  check(
    `${prefix} каждый новый тип впервые появляется один`,
    arrivals.length === 4 && arrivals.every((a) => a.onScreen === 1),
    arrivals.map((a) => `${a.kind}: на экране ${a.onScreen}`).join(', '),
  );
  const due = { rod: 15, splitter: 30, armored: 45, spore: 60 };
  check(
    `${prefix} типы приходят вовремя (примерно каждые 15 секунд), спора — не раньше 45-й`,
    arrivals.every((a) => a.at >= due[a.kind] && a.at < due[a.kind] + 2) && arrivals.find((a) => a.kind === 'spore')?.at >= 45,
    arrivals.map((a) => `${a.kind} на ${a.at.toFixed(1)} с`).join(', '),
  );
  await page.close();

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
const needQa = scenarios.some(([key]) => wants(key)) || wants('mechanics') || wants('listeners');
const qaServer = needQa ? await startServer('dist-qa') : null;
const prodServer = wants('production') ? await startServer('dist') : null;
const browser = await launchBrowser();
let crashed = null;
try {
  for (const [key, device, lang] of scenarios) {
    if (wants(key)) await runScenario(browser, qaServer.url, device, lang);
  }
  if (wants('mechanics')) await runMechanicsCheck(browser, qaServer.url);
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
