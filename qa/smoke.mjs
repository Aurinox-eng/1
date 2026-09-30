/**
 * Проверка игры в браузере (Playwright). Запуск: npm run qa -- --tag=td-1
 * (сначала сама собирает игровую и тестовую версии игры). Длится несколько минут.
 *
 * Игра — tower defense: экран 1280×720 (16:9), слева карта с камерой (сдвиг, щипок, колесо мыши), справа панель.
 *
 * ТЕСТОВАЯ сборка (dist-qa, с режимом ?qa), компьютер 1280×720 (мышь) и телефон 844×390 в горизонтальном
 * положении (касания), русский и английский (язык — настройкой браузера, как у настоящего игрока).
 * Сценарии (имена — для --only=):
 *   desktop-ru, phone-ru   полный набор: экран и начальное состояние, камера (сдвиг, границы, колесо / щипок, подсказка
 *                          «◀ Организм»), тап и сдвиг, постановка башни (дорожка, занятая клетка, монеты, сильное отдаление),
 *                          бой на этом экране, пауза, «не завис ли»
 *   desktop-en, phone-en   сокращённый набор на английском: экран, начальное состояние, камера-скриншоты, постановка, бой
 *   rules                  правила клеток (компьютер): все видимые клетки — на дорожке нельзя, на свободной можно; нет монет
 *   combat                 бой на компьютере: выстрелы, убийства, монеты, отклик, движение бактерий по кривым дорожкам
 *   lose-ru, lose-en       потеря жизней, проигрыш, блокировка перезапуска, перезапуск, утечки (lose-ru — компьютер, lose-en — телефон)
 *   win-ru, win-en         победа и перезапуск (win-ru — компьютер, win-en — телефон)
 *   rotate                 поворот телефона (вертикально ↔ горизонтально) и смена размера окна на компьютере: экран перестраивается, ввод работает
 *   production             ИГРОВАЯ сборка (dist, та, что уйдёт на Яндекс): режима проверки, подмены чисел и языка из адреса нет; игра при этом работает (башня ставится тапом)
 * Дополнительно: --only=combat (или любое другое имя из списка) запускает один сценарий; для production нужна свежая
 * `npm run build`, для остальных — `npm run build:qa`.
 *
 * Скриншоты — в qa/screenshots/<tag>/ (папка тега очищается только при запуске всех сценариев). Итог печатается в консоль;
 * при любой ошибке код выхода 1. Числа баланса проверки берут из src/config.ts и src/level.ts, поэтому от смены баланса не ломаются.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  createInput,
  GAME_H as H,
  GAME_W as W,
  heapMb,
  launchBrowser,
  makeGeometry,
  parseArgs,
  readConfigNumber,
  readLevel,
  readTitles,
  ROOT,
  samplePixels,
  sleep,
  startServer,
  VIEWPORTS,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const tag = args.tag === undefined ? 'latest' : args.tag;
if (typeof tag !== 'string' || !/^[\w-]+$/.test(tag)) {
  console.error(`Неверный --tag=«${tag === true ? '' : tag}»: допустимы только буквы, цифры, «_» и «-» (например --tag=td-2).`);
  process.exit(2);
}
// В этих папках лежат чужие файлы (макеты, скриншоты прошлых этапов): скрипт стирает папку тега, поэтому их не трогаем
if (['stage-1', 'stage-1b', 'stage-1b-qa', 'td-1-mockup', 'tmp'].includes(tag)) {
  console.error(`Тег «${tag}» занят чужими файлами (макеты и старые скриншоты) — выберите другой, например td-1.`);
  process.exit(2);
}

const SCENARIOS = ['desktop-ru', 'phone-ru', 'desktop-en', 'phone-en', 'rules', 'combat', 'lose-ru', 'lose-en', 'win-ru', 'win-en', 'rotate', 'production'];
const only = args.only === undefined ? null : String(args.only);
if (only !== null && !SCENARIOS.includes(only)) {
  console.error(`Неизвестный сценарий --only=${only}. Есть: ${SCENARIOS.join(', ')}`);
  process.exit(2);
}
const wants = (key) => only === null || only === key;

const shotsDir = path.join(ROOT, 'qa', 'screenshots', tag);
if (only === null) fs.rmSync(shotsDir, { recursive: true, force: true });
fs.mkdirSync(shotsDir, { recursive: true });

const results = []; // { name, ok, details }
const consoleProblems = []; // ошибки и предупреждения браузера
const envNoise = []; // предупреждения самой среды (видеодрайвер без видеокарты), к игре не относятся
const screenshots = [];

const check = (name, ok, details = '') => {
  results.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? '✅' : '❌'} ${name}${details ? ` — ${details}` : ''}`);
};

// ------------------------------------------------------------------ что игра должна показывать (из исходников)

const LEVEL = readLevel();
const MAP = { orgW: readConfigNumber('map', 'orgW'), tile: readConfigNumber('map', 'tile') };
const GEO = makeGeometry(LEVEL, MAP);
const CFG = {
  startCoins: readConfigNumber('economy', 'startCoins'),
  lives: readConfigNumber('lives', 'start'),
  waves: readConfigNumber('waves', 'total'),
  zoomStart: readConfigNumber('camera', 'zoomStart'),
  zoomMin: readConfigNumber('camera', 'zoomMin'),
  zoomMax: readConfigNumber('camera', 'zoomMax'),
  placeMinZoom: readConfigNumber('camera', 'placeMinZoom'),
  pillPrice: readConfigNumber('pill', 'price'),
  restartLockMs: readConfigNumber('gameOver', 'restartLockMs'),
};
const TITLES = { ru: readTitles()[0], en: readTitles()[1] };
/** Клетки для проверок: свободные рядом с дорожкой и клетки дорожки. Если карту изменят — первая же проверка скажет. */
const FREE = { a: [9, 6], b: [9, 8], c: [8, 6], d: [8, 8], e: [10, 6], f: [12, 6], g: [5, 5] };
const PATH = [[10, 7], [9, 7], [8, 7]];

/** Числа боя, которые проверки задают сами, чтобы не зависеть от баланса. */
const BASE = { baseSpeed: 112, speedFactor: 0.8, spread: 0.1, reward: 10, price: 50, range: 200 };
const FIXED_BALANCE = [
  `bacteria.baseSpeed:${BASE.baseSpeed}`,
  `bacteria.speedSpread:${BASE.spread}`,
  `types.coccus.speedFactor:${BASE.speedFactor}`,
  `types.coccus.reward:${BASE.reward}`,
  'types.coccus.hp:1',
  `towers.pill.price:${BASE.price}`,
  `towers.pill.range:${BASE.range}`,
  'towers.pill.damage:1',
  'towers.pill.cooldownMs:700',
  'lives.start:3',
];

// ------------------------------------------------------------------ общие помощники

const getState = (page) => page.evaluate(() => window.__pvb?.getState());
const WAIT_MS = 90000; // запас на медленный компьютер: игровое время идёт медленнее реального
const settle = () => sleep(150);

async function waitFor(page, predicate, timeoutMs, label, pollMs = 40) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await getState(page);
    if (state && predicate(state)) return state;
    await sleep(pollMs);
  }
  throw new Error(`Не дождались: ${label}`);
}

/** Сохраняет скриншот окна и возвращает его содержимое. */
async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`);
  const buffer = await page.screenshot({ path: file });
  screenshots.push(path.relative(ROOT, file));
  return buffer;
}

/**
 * Предупреждения самой среды: в контейнере нет видеокарты, и Chromium рисует программно. Эти строки к игре не относятся
 * (пишет драйвер видео, а не игра); любые другие предупреждения считаются ошибкой.
 */
const ENV_NOISE = /GL Driver Message|GPU stall|swiftshader|SwiftShader|Automatic fallback to software WebGL/i;

function watchConsole(page, prefix) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const line = `${prefix} console.${msg.type()}: ${msg.text()}`;
    (ENV_NOISE.test(msg.text()) ? envNoise : consoleProblems).push(line);
  });
  page.on('pageerror', (err) => consoleProblems.push(`${prefix} ОШИБКА СТРАНИЦЫ: ${err.message}`));
  page.on('requestfailed', (req) => consoleProblems.push(`${prefix} не загрузилось: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) consoleProblems.push(`${prefix} HTTP ${res.status()}: ${res.url()}`);
  });
}

/** Как канвас лежит в окне: пропорции, помещается ли, по центру ли, занимает ли экран, прокручивается ли страница. */
const measureCanvas = (page) =>
  page.evaluate(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      centred: Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2,
      fill: Math.max(rect.width / innerWidth, rect.height / innerHeight),
      scrolls: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      win: `${innerWidth}×${innerHeight}`,
    };
  });

const newDeviceContext = (browser, device, lang) =>
  browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    // Язык задаём настройкой браузера (locale), а не адресом: так проверяется настоящее определение языка
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });

/** Открывает игру. Возвращает всё нужное для ввода: страницу, ввод (мышь или касания), перевод координат. */
async function openGame(context, baseUrl, prefix, { speed = 1, cfg = '', isTouch = false, query = '' } = {}) {
  const page = await context.newPage();
  watchConsole(page, prefix);
  // QA_EXTRA_CFG нужна только для проверки самих проверок: подмешивает «поломку» (например camera.placeMinZoom:0) — соответствующая проверка обязана покраснеть
  const allCfg = [cfg, process.env.QA_EXTRA_CFG].filter(Boolean).join(',');
  await page.goto(`${baseUrl}?qa&speed=${speed}${allCfg ? `&cfg=${allCfg}` : ''}${query}`, { waitUntil: 'load' });
  await waitFor(page, (s) => s.state === 'playing', 20000, 'запуск игры');
  const cdp = await context.newCDPSession(page);
  const input = createInput(page, cdp, isTouch);
  const rect = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const screen = {
    rect,
    scale: rect.width / W,
    /** Точка экрана игры (1280×720) → страница. */
    g2c: (x, y) => ({ x: rect.left + (x * rect.width) / W, y: rect.top + (y * rect.height) / H }),
    /** Страница → точка экрана игры. */
    c2g: (x, y) => ({ x: ((x - rect.left) * W) / rect.width, y: ((y - rect.top) * H) / rect.height }),
  };
  const game = {
    page,
    cdp,
    input,
    screen,
    isTouch,
    state: () => getState(page),
    g: (x, y) => screen.g2c(x, y),
    /** Центр клетки на странице (с учётом камеры). */
    cell: (col, row) => page.evaluate(([c, r]) => window.__pvb.cellToClient(c, r), [col, row]),
    /** Тап по кнопке башни на панели. */
    async towerButton() {
      const b = (await getState(page)).ui.towerButton;
      await input.tap(screen.g2c(b.x, b.y));
      await settle();
    },
    async tapCell(col, row) {
      await input.tap(await game.cell(col, row));
      await settle();
    },
    /** Выбирает башню и ставит её на клетки по очереди (после постановки башня остаётся выбранной). */
    async placeTowers(cells) {
      await game.towerButton();
      for (const [col, row] of cells) await game.tapCell(col, row);
      return getState(page);
    },
  };
  return game;
}

/** Точка мира под точкой экрана (по состоянию камеры). */
const worldAt = (s, sx, sy) => ({ x: s.camera.cx + (sx - s.viewW / 2) / s.camera.zoom, y: s.camera.cy + (sy - s.height / 2) / s.camera.zoom });
/** Карта не выезжает за край: экран всегда внутри мира. */
const cameraInBounds = (s, eps = 0.6) => {
  const hx = s.viewW / 2 / s.camera.zoom;
  const hy = s.height / 2 / s.camera.zoom;
  return s.camera.cx >= hx - eps && s.camera.cx <= s.map.worldW - hx + eps && s.camera.cy >= hy - eps && s.camera.cy <= s.map.worldH - hy + eps;
};
const cameraLimits = (s) => {
  const hx = s.viewW / 2 / s.camera.zoom;
  const hy = s.height / 2 / s.camera.zoom;
  return { minX: hx, maxX: s.map.worldW - hx, minY: hy, maxY: s.map.worldH - hy };
};
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const f2 = (n) => (Math.round(n * 100) / 100).toString();

/** Сколько «белых» точек в том месте, где рисуется надпись подсказки «◀ Организм» (0 — подсказки нет). */
async function chipWhitePixels(game, png) {
  const points = [];
  for (let gy = 330; gy <= 360; gy += 2) {
    for (let gx = 18; gx <= 140; gx += 2) {
      const c = game.screen.g2c(gx, gy);
      points.push([c.x, c.y]);
    }
  }
  const pixels = await samplePixels(game.page, png, points);
  return pixels.filter(([r, g, b]) => r >= 215 && g >= 215 && b >= 215).length;
}

/**
 * Разбор записанных путей бактерий (traces: id → [{x, y, s, e, route}]) по данным уровня:
 * лежат ли на своей дорожке, идут ли только по клеткам дорожки, с нужной ли скоростью, есть ли повороты.
 */
function analyzeTraces(traces, { speedMin, speedMax, worldW }) {
  const out = { bacteria: traces.size, samples: 0, maxDev: 0, offPath: 0, backwards: 0, badSpeed: 0, routeChanged: 0, lateStart: 0, minTurnsFull: Infinity, fullCount: 0, minTurnsPartial: Infinity, partialCount: 0, leftwards: 0, speedSeen: [1e9, 0] };
  const heading = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : dy > 0 ? 'D' : 'U');
  for (const tr of traces.values()) {
    out.samples += tr.length;
    if (tr[0].x < worldW - 300 || tr[0].s > 300) out.lateStart++;
    let turns = 0;
    let last = '';
    for (let i = 0; i < tr.length; i++) {
      const cur = tr[i];
      if (cur.route !== tr[0].route) out.routeChanged++;
      out.maxDev = Math.max(out.maxDev, GEO.distToRoute(cur, cur.route));
      const cell = GEO.cellAt(cur.x, cur.y);
      if (cell && !GEO.isPathCell(cell[0], cell[1])) out.offPath++;
      if (i === 0) continue;
      const prev = tr[i - 1];
      if (cur.s < prev.s - 1e-6) out.backwards++;
      if (cur.e - prev.e >= 0.05) {
        const v = (cur.s - prev.s) / (cur.e - prev.e);
        out.speedSeen = [Math.min(out.speedSeen[0], v), Math.max(out.speedSeen[1], v)];
        if (v < speedMin || v > speedMax) out.badSpeed++;
      }
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.hypot(dx, dy) >= 5) {
        const h = heading(dx, dy);
        if (last && h !== last) turns++;
        last = h;
      }
    }
    const travelled = tr[tr.length - 1].s - tr[0].s;
    if (tr[tr.length - 1].x < tr[0].x - 200) out.leftwards++;
    if (travelled >= 2500) {
      out.fullCount++;
      out.minTurnsFull = Math.min(out.minTurnsFull, turns);
    } else if (travelled >= 900) {
      out.partialCount++;
      out.minTurnsPartial = Math.min(out.minTurnsPartial, turns);
    }
  }
  return out;
}

/** Запись положения бактерий по ходу игры. */
function recordTraces(traces, s) {
  for (const b of s.bacteria) {
    if (!traces.has(b.id)) traces.set(b.id, []);
    traces.get(b.id).push({ x: b.x, y: b.y, s: b.s, e: s.elapsed, route: b.route });
  }
}

const startCenterPx = () => GEO.center(LEVEL.startCenter[0], LEVEL.startCenter[1]);

const speedBounds = (base = BASE.baseSpeed, factor = BASE.speedFactor, spread = BASE.spread) => ({
  speedMin: base * factor * (1 - spread) - 1.5,
  speedMax: base * factor * (1 + spread) + 1.5,
});

// ================================================================== сценарии на экране (компьютер / телефон)

/** Экран, начальное состояние, камера, подсказка «◀ Организм». Возвращает после себя закрытую страницу. */
async function profileLoadAndCamera(c) {
  const { prefix: p, lang, isTouch, name, full } = c;
  const game = await openGame(c.context, c.baseUrl, p, { speed: 1, isTouch });
  const { page, input, screen, g } = game;

  // ---- экран и начальное состояние
  const s0 = await game.state();
  check(`${p} язык выбран по настройкам браузера`, s0.lang === lang, `lang=${s0.lang}`);
  check(`${p} название вкладки на нужном языке`, (await page.title()) === TITLES[lang], `«${await page.title()}»`);
  const layout = await measureCanvas(page);
  check(`${p} экран 16:9`, Math.abs(layout.ratio - W / H) < 0.01, `пропорции ${layout.ratio.toFixed(3)}, окно ${layout.win}`);
  check(`${p} экран помещается в окно, по центру, заполняет его`, layout.fits && layout.centred && layout.fill > 0.98, `fits=${layout.fits} centred=${layout.centred} fill=${layout.fill.toFixed(2)}`);
  check(`${p} страница не прокручивается`, !layout.scrolls);
  check(`${p} отрисовка через WebGL`, s0.renderer === 'webgl', `renderer=${s0.renderer}`);
  check(`${p} размеры: экран ${W}×${H}, окно карты 1080, карта ${LEVEL.cols}×${LEVEL.rows}`, s0.width === W && s0.height === H && s0.viewW === W - 200 && s0.map.cols === LEVEL.cols && s0.map.rows === LEVEL.rows, `${s0.width}×${s0.height}, viewW=${s0.viewW}, карта ${s0.map.cols}×${s0.map.rows}`);
  check(`${p} старт: монеты ${CFG.startCoins}, жизни ${CFG.lives} (сердец на панели ${s0.ui.lives})`, s0.coins === CFG.startCoins && s0.lives === CFG.lives && s0.maxLives === CFG.lives && s0.ui.lives === CFG.lives);
  check(`${p} старт: волна 0 из ${CFG.waves}, никого нет, башен нет, башня не выбрана`, s0.wave === 0 && s0.waveTotal === CFG.waves && s0.spawned === 0 && s0.bacteria.length === 0 && s0.towers.length === 0 && s0.selected === null && s0.state === 'playing');
  const startCenter = GEO.center(LEVEL.startCenter[0], LEVEL.startCenter[1]);
  check(`${p} старт: приближение ${CFG.zoomStart}, камера у слияния дорожек`, Math.abs(s0.camera.zoom - CFG.zoomStart) < 0.001 && Math.abs(s0.camera.cx - startCenter.x) < 3 && Math.abs(s0.camera.cy - startCenter.y) < 3, `zoom ${f2(s0.camera.zoom)}, центр (${f1(s0.camera.cx)}; ${f1(s0.camera.cy)}), ждали (${f1(startCenter.x)}; ${f1(startCenter.y)})`);
  const btn = s0.ui.towerButton;
  check(
    `${p} панель внутри экрана: кнопка башни и кнопка паузы справа от окна карты`,
    btn.x - btn.w / 2 >= s0.viewW && btn.x + btn.w / 2 <= W && btn.y - btn.h / 2 >= 0 && btn.y + btn.h / 2 <= H && s0.ui.pauseButton.x > s0.viewW && s0.ui.pauseButton.x < W && s0.ui.pauseButton.y > 0 && s0.ui.pauseButton.y < H,
    `кнопка башни (${btn.x}; ${btn.y}) ${btn.w}×${btn.h}, пауза (${s0.ui.pauseButton.x}; ${s0.ui.pauseButton.y})`,
  );
  // Свои допущения о карте: если карту изменят, скажем сразу, а не запутаем ложными провалами ниже
  const badPremise = [...Object.entries(FREE).filter(([, [col, row]]) => GEO.isPathCell(col, row)).map(([k]) => `клетка ${FREE[k]} стала дорожкой`), ...PATH.filter(([col, row]) => !GEO.isPathCell(col, row)).map((cell) => `клетка ${cell} перестала быть дорожкой`)];
  check(`${p} карта соответствует допущениям проверок (свободные и дорожные клетки)`, badPremise.length === 0, badPremise.join('; '));

  await sleep(400);
  const startPng = await shot(page, `${name}-01-start`);
  const chipStart = await chipWhitePixels(game, startPng);
  check(`${p} подсказка «◀ Организм» видна на старте (организм за краем экрана)`, chipStart >= 40, `белых точек надписи: ${chipStart}`);

  // ---- сдвиг карты
  const cam = async () => (await game.state()).camera;
  let c0 = await cam();
  await input.drag(g(650, 300), g(450, 300));
  await settle();
  let c1 = await cam();
  check(`${p} сдвиг влево на 200: центр камеры уходит вправо на ≈200 (первые ≈14 px — порог тапа)`, Math.abs(c1.cx - c0.cx - 200 / c0.zoom) <= 30 && Math.abs(c1.cy - c0.cy) <= 6, `Δcx=${f1(c1.cx - c0.cx)}, Δcy=${f1(c1.cy - c0.cy)}`);
  c0 = c1;
  await input.drag(g(600, 200), g(600, 400));
  await settle();
  c1 = await cam();
  check(`${p} сдвиг вниз на 200: центр камеры уходит вверх на ≈200`, Math.abs(c1.cy - c0.cy + 200 / c0.zoom) <= 30 && Math.abs(c1.cx - c0.cx) <= 6, `Δcx=${f1(c1.cx - c0.cx)}, Δcy=${f1(c1.cy - c0.cy)}`);

  // ---- границы: сильно тянем в каждую сторону
  const pull = async (from, to, times = 1) => {
    for (let i = 0; i < times; i++) {
      await input.drag(g(from[0], from[1]), g(to[0], to[1]), isTouch ? { steps: 3, stepMs: 0 } : { steps: 6, stepMs: 10 });
      const mid = await game.state();
      if (!cameraInBounds(mid)) return mid; // вышла за границу — дальше не тянем, ошибка будет отмечена
    }
    await settle();
    return game.state();
  };
  let s = await pull([40, 360], [1040, 360]);
  let lim = cameraLimits(s);
  check(`${p} границы: тянем карту вправо до упора — виден левый край мира, дальше не выезжает`, cameraInBounds(s) && Math.abs(s.camera.cx - lim.minX) < 0.6, `cx=${f1(s.camera.cx)}, край ${f1(lim.minX)}`);
  const png = await shot(page, `${name}-02-organism`);
  const chipEdge = await chipWhitePixels(game, png);
  check(`${p} подсказка «◀ Организм» пропадает, когда организм на экране`, chipEdge < 8, `белых точек надписи: ${chipEdge}`);
  await game.towerButton();
  const towerSelected = (await game.state()).selected;
  await input.tap(g(60, 260)); // тап по зоне организма
  await settle();
  s = await game.state();
  check(`${p} тап по зоне организма башню не ставит и монеты не тратит`, towerSelected === 'pill' && s.towers.length === 0 && s.coins === CFG.startCoins && s.effects.placements === 0, `башен ${s.towers.length}, монет ${s.coins}`);
  await game.towerButton(); // снять выбор
  s = await pull([1040, 360], [40, 360]);
  lim = cameraLimits(s);
  check(`${p} границы: тянем влево до упора — виден правый край мира`, cameraInBounds(s) && Math.abs(s.camera.cx - lim.maxX) < 0.6, `cx=${f1(s.camera.cx)}, край ${f1(lim.maxX)}`);
  const png2 = await shot(page, `${name}-03-right-edge`);
  const chipBack = await chipWhitePixels(game, png2);
  check(`${p} подсказка «◀ Организм» возвращается, когда организм снова за краем`, chipBack >= 40, `белых точек надписи: ${chipBack}`);
  s = await pull([600, 20], [600, 700], 2);
  lim = cameraLimits(s);
  check(`${p} границы: тянем вниз до упора — виден верх мира`, cameraInBounds(s) && Math.abs(s.camera.cy - lim.minY) < 0.6, `cy=${f1(s.camera.cy)}, край ${f1(lim.minY)}`);
  s = await pull([600, 700], [600, 20], 2);
  lim = cameraLimits(s);
  check(`${p} границы: тянем вверх до упора — виден низ мира`, cameraInBounds(s) && Math.abs(s.camera.cy - lim.maxY) < 0.6, `cy=${f1(s.camera.cy)}, край ${f1(lim.maxY)}`);

  // ---- приближение: колесо (компьютер) или щипок (телефон)
  const anchorG = { x: 400, y: 250 };
  const anchorC = g(anchorG.x, anchorG.y);
  let before = await game.state();
  const anchorBefore = worldAt(before, anchorG.x, anchorG.y);
  if (!isTouch) {
    await input.wheel(anchorC, -100);
  } else {
    await input.pinch(anchorC, 100 * screen.scale, 140 * screen.scale);
  }
  await settle();
  let after = await game.state();
  const ratio = after.camera.zoom / before.camera.zoom;
  const anchorAfter = worldAt(after, anchorG.x, anchorG.y);
  check(
    isTouch ? `${p} щипок: пальцы разошлись в 1,4 раза — приближение ≈×1,4` : `${p} колесо вверх на один щелчок: приближение ×1,1…1,3`,
    isTouch ? Math.abs(ratio - 1.4) < 0.08 : ratio > 1.05 && ratio < 1.3,
    `zoom ${f2(before.camera.zoom)} → ${f2(after.camera.zoom)} (×${f2(ratio)})`,
  );
  check(`${p} точка под пальцами/курсором остаётся на месте при приближении (допуск 3 px)`, Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y) < 3, `сдвиг ${f1(Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y))} px`);
  check(`${p} после приближения камера в границах`, cameraInBounds(after));

  // отдаляем
  before = after;
  if (!isTouch) await input.wheel(anchorC, 100);
  else await input.pinch(anchorC, 140 * screen.scale, 100 * screen.scale);
  await settle();
  after = await game.state();
  check(`${p} обратное движение отдаляет (${isTouch ? 'щипок к центру' : 'колесо вниз'})`, after.camera.zoom < before.camera.zoom - 0.05 && Math.abs(after.camera.zoom - before.camera.zoom / ratio) < 0.05, `zoom ${f2(before.camera.zoom)} → ${f2(after.camera.zoom)}`);

  // пределы: до упора в каждую сторону
  const zoomTo = async (dir, times) => {
    for (let i = 0; i < times; i++) {
      if (!isTouch) await input.wheel(anchorC, dir * 500);
      else if (dir < 0) await input.pinch(anchorC, 40 * screen.scale, 220 * screen.scale, { steps: 4, stepMs: 0 });
      else await input.pinch(anchorC, 220 * screen.scale, 40 * screen.scale, { steps: 4, stepMs: 0 });
    }
    await settle();
    return game.state();
  };
  s = await zoomTo(-1, isTouch ? 3 : 4);
  check(`${p} приближение упирается в максимум ${CFG.zoomMax}`, Math.abs(s.camera.zoom - CFG.zoomMax) < 0.002 && cameraInBounds(s), `zoom ${f2(s.camera.zoom)}`);
  await sleep(300);
  await shot(page, `${name}-04-zoom-max`);
  s = await zoomTo(-1, 1);
  check(`${p} дальше максимума не приближается`, s.camera.zoom <= CFG.zoomMax + 1e-6, `zoom ${f2(s.camera.zoom)}`);
  s = await zoomTo(1, isTouch ? 4 : 6);
  check(`${p} отдаление упирается в минимум ${CFG.zoomMin}`, Math.abs(s.camera.zoom - CFG.zoomMin) < 0.002 && cameraInBounds(s), `zoom ${f2(s.camera.zoom)}`);
  await sleep(300);
  const minShot = await shot(page, `${name}-05-zoom-min`);
  const chipMin = await chipWhitePixels(game, minShot);
  check(`${p} при полном отдалении вся карта по ширине на экране (подсказки «◀ Организм» нет)`, chipMin < 8 && s.camera.cx - s.viewW / 2 / s.camera.zoom < MAP.orgW, `белых точек надписи: ${chipMin}`);
  s = await zoomTo(1, 1);
  check(`${p} дальше минимума не отдаляется`, s.camera.zoom >= CFG.zoomMin - 1e-6, `zoom ${f2(s.camera.zoom)}`);

  if (full) {
    // ---- касания панели не двигают карту
    const cb = await cam();
    await input.drag(g(1180, 450), g(900, 450));
    if (!isTouch) await input.wheel(g(1180, 450), -300);
    await settle();
    const ca = await cam();
    check(`${p} перетаскивание${isTouch ? '' : ' и колесо'}, начатое на панели, карту не двигает`, Math.abs(ca.cx - cb.cx) < 0.01 && Math.abs(ca.cy - cb.cy) < 0.01 && Math.abs(ca.zoom - cb.zoom) < 1e-6, `Δcx=${f2(ca.cx - cb.cx)}, Δzoom=${f2(ca.zoom - cb.zoom)}`);
  }
  await page.close();
}

/** Тап и сдвиг, постановка башен, ограничения (дорожка, занято, монеты, отдаление), снятие выбора. */
async function profilePlacement(c) {
  const { prefix: p, isTouch, name } = c;
  const game = await openGame(c.context, c.baseUrl, p, { speed: 1, isTouch, cfg: `economy.startCoins:${BASE.price * 3 + 20},waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  const { page, input, screen } = game;
  const price = BASE.price;
  const coins0 = price * 3 + 20;
  const st = () => game.state();
  const insideMap = (pt) => {
    const gp = screen.c2g(pt.x, pt.y);
    return gp.x > 30 && gp.x < 1050 && gp.y > 30 && gp.y < 690;
  };

  // без выбранной башни тап ничего не ставит
  await game.tapCell(...FREE.a);
  let s = await st();
  check(`${p} тап по свободной клетке БЕЗ выбранной башни ничего не ставит`, s.towers.length === 0 && s.coins === coins0 && s.effects.placements === 0, `башен ${s.towers.length}, монет ${s.coins}`);

  // выбор башни и снятие выбора
  await game.towerButton();
  s = await st();
  check(`${p} тап по кнопке башни выбирает её`, s.selected === 'pill', `selected=${s.selected}`);
  await game.towerButton();
  s = await st();
  check(`${p} повторный тап по кнопке снимает выбор`, s.selected === null, `selected=${s.selected}`);
  await game.tapCell(...FREE.b);
  s = await st();
  check(`${p} после снятия выбора тап по свободной клетке (монет хватает) башню не ставит`, s.towers.length === 0 && s.coins === coins0, `башен ${s.towers.length}, монет ${s.coins}`);
  await game.towerButton();
  if (!isTouch) {
    await input.hover(await game.cell(...FREE.d));
    await sleep(300);
    await shot(page, `${name}-06-ghost`);
    await input.hover(game.g(1180, 500)); // мышь уходит с карты
  } else {
    await sleep(200);
    await shot(page, `${name}-06-tower-selected`);
  }

  // сдвиг, начатый над свободной клеткой при выбранной башне, башню не ставит
  const camA = (await st()).camera;
  const cellA = await game.cell(...FREE.a);
  await input.drag(cellA, { x: cellA.x + 60 * screen.scale, y: cellA.y }, { steps: 8, stepMs: 20 });
  await settle();
  s = await st();
  check(`${p} сдвиг, начатый над свободной клеткой при выбранной башне, башню НЕ ставит (а карту двигает)`, s.towers.length === 0 && s.coins === coins0 && Math.abs(s.camera.cx - camA.cx) > 20, `башен ${s.towers.length}, карта сдвинулась на ${f1(camA.cx - s.camera.cx)} px`);
  // долгое нажатие
  await input.hold(await game.cell(...FREE.a), 750);
  await settle();
  s = await st();
  check(`${p} долгое нажатие (0,75 с) на свободной клетке — не тап, башню не ставит`, s.towers.length === 0 && s.coins === coins0, `башен ${s.towers.length}`);
  // правая кнопка мыши башню не ставит (компьютер)
  if (!isTouch) {
    const pt = await game.cell(...FREE.e);
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await settle();
    s = await st();
    check(`${p} правый клик по свободной клетке башню не ставит`, s.towers.length === 0 && s.coins === coins0, `башен ${s.towers.length}`);
  }
  // клетки дорожки
  for (const [col, row] of PATH) await game.tapCell(col, row);
  await shot(page, `${name}-09-toast-cant-build`);
  s = await st();
  check(`${p} тап по клеткам дорожки ${PATH.map((q) => `(${q})`).join(' ')} башню не ставит, монеты не тратятся`, s.towers.length === 0 && s.coins === coins0 && s.effects.placements === 0, `башен ${s.towers.length}, монет ${s.coins}`);
  // два пальца (щипок-касание) башню не ставят
  if (isTouch) {
    await input.twoFingerTap(await game.cell(...FREE.a), 40 * screen.scale);
    await settle();
    s = await st();
    check(`${p} касание двумя пальцами башню не ставит`, s.towers.length === 0 && s.coins === coins0, `башен ${s.towers.length}`);
  }
  // тап с небольшим дрожанием (в пределах порога) — ставит
  await input.wobbleTap(await game.cell(...FREE.a), 6 * screen.scale);
  await settle();
  s = await st();
  const t0 = s.towers[0];
  check(`${p} короткий тап (дрожание пальца ≈6 px) ставит башню: башен 1, монет −${price}, кольцо постановки`, s.towers.length === 1 && t0.col === FREE.a[0] && t0.row === FREE.a[1] && s.coins === coins0 - price && s.effects.placements === 1, `башен ${s.towers.length}, монет ${s.coins}, placements ${s.effects.placements}`);
  // занятая клетка
  await game.tapCell(...FREE.a);
  s = await st();
  check(`${p} тап по занятой клетке ничего не меняет`, s.towers.length === 1 && s.coins === coins0 - price && s.effects.placements === 1, `башен ${s.towers.length}, монет ${s.coins}`);
  // вторая башня
  await game.tapCell(...FREE.b);
  s = await st();
  check(`${p} вторая башня: башен 2, монет ${coins0 - 2 * price}`, s.towers.length === 2 && s.coins === coins0 - 2 * price && s.effects.placements === 2, `башен ${s.towers.length}, монет ${s.coins}`);

  {
    // сильное отдаление: башни не ставятся; при возврате приближения — ставятся
    const target = FREE.c;
    let pt = await game.cell(...target);
    if (!isTouch) await input.wheel(pt, 240);
    else await input.pinch(pt, 200 * screen.scale, 140 * screen.scale);
    await settle();
    s = await st();
    const zoomOut = s.camera.zoom;
    pt = await game.cell(...target);
    check(`${p} карта отдалена (zoom ${f2(zoomOut)} < ${CFG.placeMinZoom}), нужная клетка на экране`, zoomOut < CFG.placeMinZoom && insideMap(pt), `zoom ${f2(zoomOut)}`);
    await input.tap(pt);
    await settle();
    await shot(page, `${name}-10-toast-zoom-in`);
    s = await st();
    check(`${p} при сильном отдалении (zoom ${f2(zoomOut)}) башня не ставится, монеты не тратятся`, s.towers.length === 2 && s.coins === coins0 - 2 * price, `башен ${s.towers.length}, монет ${s.coins}`);
    if (!isTouch) await input.wheel(pt, -240);
    else await input.pinch(pt, 140 * screen.scale, 200 * screen.scale);
    await settle();
    s = await st();
    pt = await game.cell(...target);
    check(`${p} приближение возвращено (zoom ${f2(s.camera.zoom)} ≥ ${CFG.placeMinZoom})`, s.camera.zoom >= CFG.placeMinZoom && insideMap(pt), `zoom ${f2(s.camera.zoom)}`);
    await input.tap(pt);
    await settle();
    s = await st();
    check(`${p} после возврата приближения башня ставится`, s.towers.length === 3 && s.coins === coins0 - 3 * price, `башен ${s.towers.length}, монет ${s.coins}`);
    // монет не хватает
    await game.tapCell(...FREE.d);
    await shot(page, `${name}-11-toast-no-coins`);
    s = await st();
    check(`${p} не хватает монет (${s.coins} < ${price}): башня не ставится, монеты те же`, s.towers.length === 3 && s.coins === 20 && s.coins < price, `башен ${s.towers.length}, монет ${s.coins}`);
  }
  await page.close();
}

/** Бой на этом экране: башни, выстрелы, убийства, монеты; пауза; «не завис ли». */
async function profileBattle(c) {
  const { prefix: p, isTouch, name, full } = c;
  const game = await openGame(c.context, c.baseUrl, p, { speed: 4, isTouch, cfg: `waves.firstDelaySec:1,${FIXED_BALANCE.join(',')}` });
  const { page, input } = game;
  let s = await game.placeTowers([FREE.a, FREE.b]);
  check(`${p} бой: две башни поставлены, монет ${CFG.startCoins - 2 * BASE.price}`, s.towers.length === 2 && s.coins <= CFG.startCoins - 2 * BASE.price + s.kills * BASE.reward, `башен ${s.towers.length}, монет ${s.coins}`);
  let maxProjectiles = 0;
  let maxBacteria = 0;
  let shotTaken = false;
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    s = await game.state();
    maxProjectiles = Math.max(maxProjectiles, s.projectiles);
    maxBacteria = Math.max(maxBacteria, s.bacteria.length);
    if (!shotTaken && s.projectiles >= 1 && s.bacteria.length >= 2) {
      await shot(page, `${name}-07-battle`);
      shotTaken = true;
    }
    if (s.kills >= 2 && shotTaken) break;
    await sleep(40);
  }
  check(`${p} бой: башни стреляют, бактерии гибнут, за каждую — монеты`, s.shots > 0 && s.kills >= 1 && s.coins === CFG.startCoins - 2 * BASE.price + s.kills * BASE.reward, `выстрелов ${s.shots}, убито ${s.kills}, монет ${s.coins}`);
  check(`${p} бой: звук запущен по касанию и играет`, s.sound.state === 'running' && s.sound.played > 0, JSON.stringify(s.sound));
  check(`${p} бой: отклик — «+монеты» и частицы на каждое убийство`, s.effects.bursts === s.kills && s.effects.popups === s.kills, `частицы ${s.effects.bursts}, «+монеты» ${s.effects.popups}, убито ${s.kills}`);
  check(`${p} бой: в кадре снаряды и бактерии одновременно (скриншот сделан)`, shotTaken);
  check(`${p} бой: число объектов ограничено (снарядов ≤ 12, бактерий ≤ 12)`, maxProjectiles <= 12 && maxBacteria <= 12, `максимум снарядов ${maxProjectiles}, бактерий ${maxBacteria}`);
  check(`${p} бой: жизни целы, состояние «играет» (между волнами победа не засчитывается)`, s.lives === CFG.lives && s.state === 'playing', `жизни ${s.lives}, состояние ${s.state}`);

  // ---- пауза
  // Пауза должна прийти, когда на карте есть бактерии (иначе «не двигаются» — пустая проверка); если успели все погибнуть — пробуем ещё
  let paused = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    s = await waitFor(page, (x) => x.bacteria.length > 0, WAIT_MS, 'бактерия на карте для проверки паузы');
    await input.tap(game.g(s.ui.pauseButton.x, s.ui.pauseButton.y));
    await sleep(80);
    paused = await game.state();
    if (paused.state !== 'paused' || paused.bacteria.length > 0) break;
    await sleep(300);
    await input.tap(game.g(500, 300)); // снять паузу и попробовать снова
    await sleep(150);
  }
  check(`${p} пауза: тап по кнопке ставит паузу и не снимает её в тот же миг (на карте ${paused.bacteria.length} бактерий)`, paused.state === 'paused' && paused.bacteria.length > 0, `state=${paused.state}`);
  await sleep(300);
  await shot(page, `${name}-08-pause`);
  await sleep(1000);
  const later = await game.state();
  const same = paused.bacteria.length === later.bacteria.length && paused.bacteria.every((b, i) => b.id === later.bacteria[i].id && Math.abs(b.x - later.bacteria[i].x) < 0.01 && Math.abs(b.y - later.bacteria[i].y) < 0.01);
  check(`${p} пауза: за секунду паузы бактерии не сдвинулись, время, выстрелы и убийства стоят`, same && later.elapsed === paused.elapsed && later.shots === paused.shots && later.kills === paused.kills, `elapsed ${f2(paused.elapsed)} → ${f2(later.elapsed)}, бактерий ${later.bacteria.length}`);
  await input.tap(game.g(500, 300));
  await sleep(150);
  const resumed = await game.state();
  check(`${p} пауза: тап по экрану снимает паузу`, resumed.state === 'playing', `state=${resumed.state}`);
  if (full) {
    await input.tap(game.g(resumed.ui.pauseButton.x, resumed.ui.pauseButton.y));
    await sleep(100);
    const again = await game.state();
    await input.tap(game.g(again.ui.pauseButton.x, again.ui.pauseButton.y));
    await sleep(150);
    const off = await game.state();
    check(`${p} пауза: повторный тап по кнопке паузы тоже снимает её`, again.state === 'paused' && off.state === 'playing', `${again.state} → ${off.state}`);
  }

  // ---- не завис ли
  const e0 = (await game.state()).elapsed;
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 >= 2000) resolve(frames / 2);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const e1 = (await game.state()).elapsed;
  check(`${p} игра не зависла: за 2 секунды страница отвечает, игровое время растёт`, e1 > e0 + 0.5 && fps >= 3, `игрового времени +${f2(e1 - e0)} с, кадров в секунду ≈${f1(fps)} (программный WebGL в контейнере)`);
  await page.close();
}

async function runProfile(browser, baseUrl, deviceKey, lang) {
  const device = VIEWPORTS[deviceKey];
  const c = {
    browser,
    baseUrl,
    device,
    lang,
    isTouch: device.hasTouch,
    prefix: `[${device.label}, ${lang}]`,
    name: `${deviceKey}-${lang}`,
    full: lang === 'ru',
    context: await newDeviceContext(browser, device, lang),
  };
  try {
    await safe(`${c.prefix} экран и камера`, () => profileLoadAndCamera(c));
    await safe(`${c.prefix} постановка башен`, () => profilePlacement(c));
    await safe(`${c.prefix} бой и пауза`, () => profileBattle(c));
  } finally {
    await c.context.close();
  }
}

// ================================================================== правила клеток

async function runRules(browser, baseUrl) {
  const p = '[правила клеток]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  // ---- нет монет
  let game = await openGame(context, baseUrl, p, { cfg: `economy.startCoins:40,waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  await game.towerButton();
  await game.tapCell(...FREE.a);
  let s = await game.state();
  check(`${p} при 40 монетах (башня ${BASE.price}) башня не ставится, монеты те же`, s.towers.length === 0 && s.coins === 40 && s.effects.placements === 0, `башен ${s.towers.length}, монет ${s.coins}`);
  await game.page.close();

  // ---- все видимые клетки
  game = await openGame(context, baseUrl, p, { cfg: `economy.startCoins:100000,waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  s = await game.state();
  const cells = [];
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      const w = GEO.center(col, row);
      const sx = s.viewW / 2 + (w.x - s.camera.cx) * s.camera.zoom;
      const sy = s.height / 2 + (w.y - s.camera.cy) * s.camera.zoom;
      if (sx >= 40 && sx <= s.viewW - 40 && sy >= 40 && sy <= s.height - 40) cells.push({ col, row, sx, sy, path: GEO.isPathCell(col, row) });
    }
  }
  await game.towerButton();
  for (const cell of cells) await game.input.tap(game.g(cell.sx, cell.sy));
  await settle();
  s = await game.state();
  const placed = new Set(s.towers.map((t) => `${t.col},${t.row}`));
  const wrongOnPath = cells.filter((q) => q.path && placed.has(`${q.col},${q.row}`));
  const missedFree = cells.filter((q) => !q.path && !placed.has(`${q.col},${q.row}`));
  const freeCount = cells.filter((q) => !q.path).length;
  check(`${p} на клетках дорожки башен нет (${cells.length - freeCount} клеток дорожки на экране)`, wrongOnPath.length === 0, wrongOnPath.map((q) => `(${q.col},${q.row})`).join(' '));
  check(`${p} на всех свободных клетках экрана башня ставится (${freeCount} клеток)`, missedFree.length === 0 && s.towers.length === freeCount, missedFree.map((q) => `(${q.col},${q.row})`).join(' ') || `башен ${s.towers.length}`);
  check(`${p} монеты списаны ровно за поставленные башни`, s.coins === 100000 - BASE.price * s.towers.length, `монет ${s.coins}, башен ${s.towers.length}`);
  await sleep(300);
  await shot(game.page, 'rules-01-all-cells');
  await game.page.close();
  await context.close();
}

// ================================================================== бой на компьютере

async function runCombat(browser, baseUrl) {
  const p = '[бой]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg: `waves.firstDelaySec:1,waves.firstCount:4,waves.pauseSec:60,${FIXED_BALANCE.join(',')},economy.startCoins:${BASE.price * 2 + 20}` });
  const { page } = game;
  let s = await game.placeTowers([FREE.a, FREE.b]);
  const towers = s.towers.map((t) => ({ x: t.x, y: t.y }));
  const traces = new Map();
  let violation = 0;
  let prev = s;
  let maxProjectiles = 0;
  let maxBacteria = 0;
  let wonEarly = false;
  const range = BASE.range;
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    s = await game.state();
    recordTraces(traces, s);
    maxProjectiles = Math.max(maxProjectiles, s.projectiles);
    maxBacteria = Math.max(maxBacteria, s.bacteria.length);
    // никого нет в радиусе (с запасом на ход между замерами) — выстрелов быть не должно
    const nearest = (st) => Math.min(...st.bacteria.map((b) => Math.min(...towers.map((t) => Math.hypot(b.x - t.x, b.y - t.y)) ) - b.r), 1e9);
    if (nearest(prev) > range + 100 && nearest(s) > range + 100 && s.shots !== prev.shots) violation++;
    if (s.state === 'won') wonEarly = true;
    prev = s;
    if (s.spawned >= 4 && s.bacteria.length === 0) break;
    await sleep(50);
  }
  await sleep(200);
  s = await game.state();
  check(`${p} башни стреляют (выстрелов ${s.shots}), бактерии уничтожаются (убито ${s.kills} из ${s.spawned})`, s.shots > 0 && s.kills >= 1, `выстрелов ${s.shots}, убито ${s.kills}, дошло до организма ${s.leaked}`);
  check(`${p} две башни у ствола отбивают всю первую волну (${s.spawned} бактерии, дошло до организма ${s.leaked})`, s.spawned === 4 && s.kills === 4 && s.leaked === 0 && s.lives === 3, `убито ${s.kills}, дошло ${s.leaked}, жизни ${s.lives}`);
  check(`${p} монеты: +${BASE.reward} за каждую убитую`, s.coins === 20 + BASE.reward * s.kills, `монет ${s.coins}, убито ${s.kills}`);
  check(`${p} отклик: частицы и «+монеты» — по разу на каждое убийство`, s.effects.bursts === s.kills && s.effects.popups === s.kills, `частицы ${s.effects.bursts}, надписи ${s.effects.popups}`);
  check(`${p} башня не стреляет, пока никого нет в радиусе ${range} px`, violation === 0, violation ? `нарушений: ${violation}` : '');
  check(`${p} после уничтожения всех бактерий волны победа не засчитывается (волн ${CFG.waves}, состояние ${s.state}, волна ${s.wave})`, !wonEarly && s.state === 'playing' && s.wave === 1, `состояние ${s.state}, волна ${s.wave}`);
  check(`${p} число объектов ограничено (снарядов ≤ 12, бактерий ≤ 12)`, maxProjectiles <= 12 && maxBacteria <= 12, `максимум снарядов ${maxProjectiles}, бактерий ${maxBacteria}`);
  const a = analyzeTraces(traces, { ...speedBounds(), worldW: s.map.worldW });
  check(`${p} бактерии выходят справа, у края карты`, a.lateStart === 0 && a.bacteria === 4, `бактерий записано ${a.bacteria}, вышли не справа: ${a.lateStart}`);
  check(`${p} движение только вперёд по маршруту, маршрут не меняется`, a.backwards === 0 && a.routeChanged === 0 && a.leftwards === a.bacteria, `назад ${a.backwards}, смен маршрута ${a.routeChanged}, идут влево ${a.leftwards}/${a.bacteria}`);
  check(`${p} бактерии идут по дорожке (отклонение от осевой линии ≤ 25 px) и только по клеткам дорожки`, a.maxDev <= 25 && a.offPath === 0, `макс. отклонение ${f1(a.maxDev)} px, замеров вне клеток дорожки ${a.offPath} из ${a.samples}`);
  const sp = speedBounds();
  check(`${p} скорость ${f1(sp.speedMin + 1.5)}…${f1(sp.speedMax - 1.5)} px/с (базовая ${BASE.baseSpeed} × ${BASE.speedFactor} ±${BASE.spread * 100}%)`, a.badSpeed === 0, `замерено ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])} px/с, вне нормы ${a.badSpeed}`);
  check(`${p} путь кривой: не меньше 2 поворотов у бактерий, прошедших ≥900 px (первые два поворота — на ≈470 и ≈780 px пути)`, a.partialCount > 0 && a.minTurnsPartial >= 2, `бактерий ${a.partialCount}, минимум поворотов ${a.minTurnsPartial}`);
  await context.close();
}

// ================================================================== проигрыш и победа

async function tapToRestart(game) {
  await game.input.tap(game.g(640, 300));
}

async function runLose(browser, baseUrl, lang, deviceKey, full) {
  const device = VIEWPORTS[deviceKey];
  const p = `[проигрыш, ${device.label}, ${lang}]`;
  const name = `${deviceKey}-${lang}`;
  const context = await newDeviceContext(browser, device, lang);
  const base = 250;
  const cfg = `waves.firstDelaySec:1,waves.intervalStartSec:2,waves.intervalEndSec:2,waves.firstCount:4,${FIXED_BALANCE.filter((x) => !x.startsWith('bacteria.baseSpeed')).join(',')},bacteria.baseSpeed:${base}`;
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg, isTouch: device.hasTouch });
  const { page } = game;
  const listeners0 = (await game.state()).pointerListeners;
  await game.cdp.send('Performance.enable');
  const CYCLES = full ? 4 : 1;
  let heapFirst = 0;
  let lockChecked = false;
  let lockHeld = false;
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const traces = new Map();
    const lives = [];
    let s = await game.state();
    if (cycle === 1) {
      // карту двигаем и приближаем — после перезапуска камера должна вернуться на старт
      if (!device.hasTouch) await game.input.wheel(game.g(400, 250), -100);
      await game.input.drag(game.g(600, 300), game.g(450, 300));
      await game.towerButton(); // башня выбрана — после перезапуска выбор должен сброситься
      await settle();
    }
    const started = Date.now();
    while (Date.now() - started < WAIT_MS) {
      s = await game.state();
      recordTraces(traces, s);
      if (lives[lives.length - 1] !== s.lives) lives.push(s.lives);
      if (s.state === 'lost') break;
      await sleep(40);
    }
    const detectedAt = Date.now();
    if (cycle === 1) {
      check(`${p} без башен бактерии доходят до организма: жизни ${CFG.lives} → 0, состояние «проигрыш»`, s.state === 'lost' && s.lives === 0 && lives.join('→').startsWith(`${CFG.lives}`) && lives.every((v, i) => i === 0 || v < lives[i - 1]), `жизни по ходу: ${lives.join(' → ')}, состояние ${s.state}`);
      check(`${p} дошло до организма ≥ ${CFG.lives}, красная вспышка потери жизни сработала, убитых нет`, s.leaked >= CFG.lives && s.effects.lifeLosses >= 1 && s.effects.lifeLosses <= s.leaked && s.kills === 0, `дошло ${s.leaked}, вспышек ${s.effects.lifeLosses}, убито ${s.kills}`);
    }
    // тап сразу после проигрыша перезапуск не запускает (блокировка)
    if (!lockChecked || !lockHeld) {
      await tapToRestart(game);
      const dt = Date.now() - detectedAt;
      await sleep(350); // перезапуск сцены выполняется в следующем кадре: даём ему случиться, если тап был принят
      const after = await game.state();
      if (dt < CFG.restartLockMs - 150) {
        lockChecked = true;
        lockHeld = after.state === 'lost';
      }
    }
    await sleep(300);
    if (cycle === 1) {
      await shot(page, `${name}-09-lost`);
      const a = analyzeTraces(traces, { ...speedBounds(base, BASE.speedFactor, BASE.spread), worldW: s.map.worldW });
      check(`${p} бактерии проходят маршрут целиком (${a.fullCount} бактерий с пути ≥ 2500 px), по кривой дорожке: поворотов не меньше 6`, a.fullCount >= 1 && a.minTurnsFull >= 6, `бактерий целиком ${a.fullCount}, минимум поворотов ${a.minTurnsFull}`);
      check(`${p} на всём пути: на дорожке (≤ 25 px от осевой), только по клеткам дорожки, вперёд, скорость в норме`, a.maxDev <= 25 && a.offPath === 0 && a.backwards === 0 && a.badSpeed === 0, `отклонение ${f1(a.maxDev)} px, вне клеток ${a.offPath}/${a.samples}, назад ${a.backwards}, скорость ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])}, вне нормы ${a.badSpeed}`);
    }
    await sleep(Math.max(0, CFG.restartLockMs + 200 - (Date.now() - detectedAt)));
    await tapToRestart(game);
    const r = await waitFor(page, (x) => x.state === 'playing', 5000, 'перезапуск по тапу');
    const camOk = Math.abs(r.camera.zoom - CFG.zoomStart) < 0.001 && Math.abs(r.camera.cx - GEO.center(...LEVEL.startCenter).x) < 3;
    if (cycle === 1) {
      check(`${p} перезапуск по тапу после паузы блокировки: монеты ${CFG.startCoins}, жизни ${CFG.lives}, волна 0, никого нет`, r.coins === CFG.startCoins && r.lives === CFG.lives && r.wave === 0 && r.bacteria.length === 0 && r.towers.length === 0 && r.kills === 0 && r.leaked === 0 && r.shots === 0 && r.selected === null && r.elapsed < 2, `монеты ${r.coins}, жизни ${r.lives}, волна ${r.wave}, время ${f2(r.elapsed)}`);
      check(`${p} после перезапуска камера вернулась на старт`, camOk, `zoom ${f2(r.camera.zoom)}, центр (${f1(r.camera.cx)}; ${f1(r.camera.cy)})`);
      check(`${p} после перезапуска счётчики отклика обнулены`, r.effects.placements === 0 && r.effects.lifeLosses === 0 && r.effects.bursts === 0);
      await sleep(300);
      await shot(page, `${name}-11-after-restart`);
    }
    if (full && cycle === 1) heapFirst = await heapMb(game.cdp);
    if (cycle === CYCLES) {
      check(`${p} обработчики нажатия не копятся: было ${listeners0}, после ${CYCLES} перезапусков ${r.pointerListeners}`, r.pointerListeners === listeners0);
      check(`${p} тап сразу после проигрыша (в первые ${CFG.restartLockMs} мс) игру не перезапускает`, lockChecked && lockHeld, lockChecked ? '' : 'не успели нажать вовремя: страница отвечала слишком медленно');
      if (full) {
        const heapLast = await heapMb(game.cdp);
        check(`${p} нет утечки памяти: после ${CYCLES} проигрышей и перезапусков память страницы выросла не больше чем на 30 МБ`, heapLast - heapFirst < 30, `после 1-го перезапуска ${f1(heapFirst)} МБ, после ${CYCLES}-го ${f1(heapLast)} МБ`);
      }
    }
  }
  await context.close();
}

async function runWin(browser, baseUrl, lang, deviceKey, full) {
  const device = VIEWPORTS[deviceKey];
  const p = `[победа, ${device.label}, ${lang}]`;
  const name = `${deviceKey}-${lang}`;
  const context = await newDeviceContext(browser, device, lang);
  const cfg = 'waves.total:1,waves.firstCount:2,waves.firstDelaySec:1,towers.pill.range:900,economy.startCoins:500,bacteria.baseSpeed:200,lives.start:3';
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg, isTouch: device.hasTouch });
  const { page } = game;
  const listeners0 = (await game.state()).pointerListeners;
  await game.placeTowers([FREE.f, FREE.e, FREE.b]);
  let s = await game.state();
  const midWin = [];
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    s = await game.state();
    if (s.state === 'won') break;
    if (s.spawned < 2 || s.bacteria.length > 0) midWin.push(s.state);
    await sleep(40);
  }
  const detectedAt = Date.now();
  check(`${p} победа: все волны вышли и отбиты — состояние «победа»`, s.state === 'won' && s.spawned === 2 && s.kills === 2 && s.leaked === 0 && s.bacteria.length === 0 && s.wave === 1 && s.waveTotal === 1 && s.lives === 3, `состояние ${s.state}, вышло ${s.spawned}, убито ${s.kills}, дошло ${s.leaked}, волна ${s.wave}/${s.waveTotal}`);
  check(`${p} победа не засчитывается раньше времени (пока не вышли все или на карте кто-то есть)`, midWin.every((x) => x === 'playing'), `состояния по ходу: ${[...new Set(midWin)].join(',')}`);
  await sleep(350);
  await shot(page, `${name}-10-won`);
  await sleep(Math.max(0, CFG.restartLockMs + 200 - (Date.now() - detectedAt)));
  await tapToRestart(game);
  const r = await waitFor(page, (x) => x.state === 'playing' && x.elapsed < 2, 5000, 'перезапуск после победы');
  check(`${p} тап после победы перезапускает игру: монеты 500, волна 0, башен нет`, r.coins === 500 && r.lives === 3 && r.wave === 0 && r.towers.length === 0 && r.bacteria.length === 0, `монеты ${r.coins}, волна ${r.wave}, башен ${r.towers.length}`);
  check(`${p} обработчики нажатия не копятся`, r.pointerListeners === listeners0, `было ${listeners0}, стало ${r.pointerListeners}`);
  await context.close();
}


// ================================================================== поворот телефона и размер окна

const layoutOk = (m) => Math.abs(m.ratio - W / H) < 0.01 && m.fits && m.centred && m.fill > 0.98 && !m.scrolls;

async function runRotate(browser, baseUrl) {
  const p = '[поворот и размер окна]';
  const shots = { '390×844': 'phone-portrait-ru' };
  // ---- телефон: горизонтально → вертикально → горизонтально
  let context = await newDeviceContext(browser, VIEWPORTS.phone, 'ru');
  let game = await openGame(context, baseUrl, p, { isTouch: true, cfg: 'waves.firstDelaySec:60' });
  for (const [w, h, label] of [
    [390, 844, 'вертикально'],
    [844, 390, 'снова горизонтально'],
    [667, 375, 'меньший горизонтальный телефон'],
  ]) {
    await game.page.setViewportSize({ width: w, height: h });
    await sleep(1500);
    const m = await measureCanvas(game.page);
    check(`${p} телефон, ${label} (${w}×${h}): экран 16:9 перестроился, помещается, по центру, без прокрутки`, layoutOk(m), `пропорции ${m.ratio.toFixed(3)}, помещается ${m.fits}, по центру ${m.centred}, заполнение ${m.fill.toFixed(2)}, прокрутка ${m.scrolls}`);
    if (shots[`${w}×${h}`]) await shot(game.page, shots[`${w}×${h}`]);
    // ввод после поворота попадает в нужные места: тап по кнопке башни выбирает её, повторный — снимает
    for (const want of ['pill', null]) {
      const b = (await getState(game.page)).ui.towerButton;
      const c = await game.page.evaluate(([x, y]) => window.__pvb.gameToClient(x, y), [b.x, b.y]);
      await game.page.touchscreen.tap(c.x, c.y);
      await sleep(200);
      const sel = (await getState(game.page)).selected;
      check(`${p} телефон, ${label}: тап по кнопке башни попадает в кнопку (${want ? 'выбор' : 'снятие выбора'})`, sel === want, `selected=${sel}`);
    }
  }
  await context.close();
  // ---- компьютер: окно разных пропорций
  context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  game = await openGame(context, baseUrl, p, { cfg: 'waves.firstDelaySec:60' });
  for (const [w, h] of [[1600, 600], [800, 900], [1280, 720]]) {
    await game.page.setViewportSize({ width: w, height: h });
    await sleep(1200);
    const m = await measureCanvas(game.page);
    check(`${p} компьютер, окно ${w}×${h}: экран 16:9 перестроился, помещается, по центру, без прокрутки`, layoutOk(m), `пропорции ${m.ratio.toFixed(3)}, помещается ${m.fits}, по центру ${m.centred}, заполнение ${m.fill.toFixed(2)}`);
    if (w === 1600) await shot(game.page, 'desktop-wide-ru');
  }
  await context.close();
}

// ================================================================== игровая сборка

/** Средняя яркость сетки точек окна (ниже 30 — экран проигрыша затемнил всё). */
async function brightness(page) {
  const png = await page.screenshot();
  const points = [];
  for (let x = 40; x < 760; x += 60) for (let y = 30; y < 360; y += 40) points.push([x, y]);
  const px = await samplePixels(page, png, points);
  return px.reduce((sum, [r, g, b]) => sum + r + g + b, 0) / px.length / 3;
}

async function runProduction(browser, prodUrl, qaUrl) {
  const p = '[игровая сборка]';
  const hostile = 'waves.firstDelaySec:0.01,waves.intervalStartSec:0.05,waves.intervalEndSec:0.05,waves.firstCount:30,bacteria.baseSpeed:6000,lives.start:1';
  const query = `&lang=en`;
  const context = await newDeviceContext(browser, VIEWPORTS.phone, 'ru');
  // Эталон: обычный старт в тестовой сборке
  const normal = await openGame(context, qaUrl, '[эталон]', { isTouch: true });
  await sleep(2500);
  const normalBrightness = await brightness(normal.page);
  await normal.page.close();
  // Контроль: те же параметры в ТЕСТОВОЙ сборке действуют — партия проиграна за секунды
  const control = await openGame(context, qaUrl, '[контроль]', { speed: 10, cfg: hostile, isTouch: true, query });
  let controlLost = true;
  try {
    await waitFor(control.page, (s) => s.state === 'lost', 30000, 'контроль: проигрыш от подменённых чисел');
  } catch {
    controlLost = false;
  }
  await sleep(500);
  const controlBrightness = await brightness(control.page);
  const controlLang = (await getState(control.page)).lang;
  await control.page.close();
  check(`${p} контроль: в тестовой сборке подмена чисел и языка из адреса действует (иначе проверка ниже бессмысленна)`, controlLost && controlLang === 'en' && controlBrightness < normalBrightness * 0.5, `проигрыш ${controlLost}, язык ${controlLang}, яркость ${f1(controlBrightness)} против ${f1(normalBrightness)}`);

  const page = await context.newPage();
  watchConsole(page, p);
  await page.goto(`${prodUrl}?qa&speed=10${query}&cfg=${hostile}`, { waitUntil: 'load' });
  await sleep(6000);
  const hook = await page.evaluate(() => typeof window.__pvb);
  check(`${p} режима проверки (?qa) нет: window.__pvb не существует`, hook === 'undefined', `typeof __pvb = ${hook}`);
  const lang = await page.evaluate(() => document.documentElement.lang);
  check(`${p} язык из адреса (?lang=en) не действует`, lang === 'ru' && (await page.title()) === TITLES.ru, `lang=${lang}`);
  const prodBrightness = await brightness(page);
  check(`${p} подмена чисел из адреса (?cfg=) не действует: за 6 секунд партия не проиграна (экран не затемнён)`, prodBrightness > normalBrightness * 0.8, `яркость ${f1(prodBrightness)} (обычный старт ${f1(normalBrightness)})`);
  const layout = await measureCanvas(page);
  check(`${p} экран 16:9, помещается в окно`, Math.abs(layout.ratio - W / H) < 0.01 && layout.fits && layout.centred && !layout.scrolls);
  await shot(page, 'production-start');
  // Игра в игровой сборке работает: выбрать башню и поставить её тапом (по цвету пикселей вокруг клетки ${FREE.a} на старте камеры)
  const play = await context.newPage();
  watchConsole(play, p);
  await play.goto(prodUrl, { waitUntil: 'load' });
  await sleep(2500);
  const rect = await play.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const g = (x, y) => ({ x: rect.left + (x * rect.width) / W, y: rect.top + (y * rect.height) / H });
  const towerCell = GEO.center(...FREE.a);
  const cellG = { x: (W - 200) / 2 + (towerCell.x - startCenterPx().x), y: H / 2 + (towerCell.y - startCenterPx().y) }; // приближение на старте = 1
  const ring = [];
  for (let a = 100; a <= 260; a += 20) ring.push(g(cellG.x + 27 * Math.cos((a * Math.PI) / 180), cellG.y + 27 * Math.sin((a * Math.PI) / 180)));
  const near = ([r, gg, b], want, tol) => Math.abs(r - want[0]) <= tol && Math.abs(gg - want[1]) <= tol && Math.abs(b - want[2]) <= tol;
  const beforePx = await samplePixels(play, await play.screenshot(), ring.map((q) => [q.x, q.y]));
  const btn = g(1180, 210);
  await play.touchscreen.tap(btn.x, btn.y);
  await sleep(300);
  const cellPt = g(cellG.x, cellG.y);
  await play.touchscreen.tap(cellPt.x, cellPt.y);
  await sleep(900);
  const afterPx = await samplePixels(play, await play.screenshot(), ring.map((q) => [q.x, q.y]));
  const TOWER = [44, 74, 124];
  const before = beforePx.filter((c) => near(c, TOWER, 12)).length;
  const after = afterPx.filter((c) => near(c, TOWER, 12)).length;
  check(`${p} игра работает: выбрать башню на панели и тапнуть по клетке — башня появляется (цвет основания вокруг клетки)`, before === 0 && after >= 6, `точек цвета башни: было ${before}, стало ${after} из ${ring.length}`);
  await shot(play, 'production-tower');
  await play.close();

  const assets = path.join(ROOT, 'dist', 'assets');
  const bundle = fs.readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
  check(`${p} в собранной игре нет ни следа интерфейса проверок (строка __pvb)`, !bundle.includes('__pvb'), bundle.includes('__pvb') ? 'строка __pvb найдена в dist/assets' : '');
  await context.close();
}

// ================================================================== запуск

async function safe(label, fn) {
  const started = Date.now();
  try {
    await fn();
  } catch (error) {
    check(`${label}: сценарий дошёл до конца`, false, String(error.message).split('\n')[0]);
  }
  console.log(`⏱  ${label}: ${Math.round((Date.now() - started) / 1000)} с`);
}

const needQa = SCENARIOS.filter((k) => k !== 'production').some(wants);
const qaServer = needQa || wants('production') ? await startServer('dist-qa') : null;
const prodServer = wants('production') ? await startServer('dist') : null;
const browser = await launchBrowser();
// Страховка от зависания: через 25 минут всё останавливаем
const watchdog = setTimeout(async () => {
  console.error('❌ Проверка не уложилась в 25 минут — остановлена.');
  await Promise.race([browser.close(), sleep(5000)]);
  process.exit(1);
}, 25 * 60 * 1000);
let crashed = null;
try {
  for (const [key, device, lang] of [['desktop-ru', 'desktop', 'ru'], ['phone-ru', 'phone', 'ru'], ['desktop-en', 'desktop', 'en'], ['phone-en', 'phone', 'en']]) {
    if (wants(key)) await safe(`[${key}]`, () => runProfile(browser, qaServer.url, device, lang));
  }
  if (wants('rules')) await safe('[правила клеток]', () => runRules(browser, qaServer.url));
  if (wants('combat')) await safe('[бой]', () => runCombat(browser, qaServer.url));
  if (wants('lose-ru')) await safe('[проигрыш ru]', () => runLose(browser, qaServer.url, 'ru', 'desktop', true));
  if (wants('lose-en')) await safe('[проигрыш en]', () => runLose(browser, qaServer.url, 'en', 'phone', false));
  if (wants('win-ru')) await safe('[победа ru]', () => runWin(browser, qaServer.url, 'ru', 'desktop', true));
  if (wants('win-en')) await safe('[победа en]', () => runWin(browser, qaServer.url, 'en', 'phone', false));
  if (wants('rotate')) await safe('[поворот]', () => runRotate(browser, qaServer.url));
  if (wants('production')) await safe('[игровая сборка]', () => runProduction(browser, prodServer.url, qaServer.url));
} catch (error) {
  crashed = error;
  check('Проверка дошла до конца', false, error.message);
} finally {
  clearTimeout(watchdog);
  await browser.close();
  await qaServer?.close();
  await prodServer?.close();
}

// Ошибки и предупреждения консоли: любая строка — провал (кроме шума среды, он показан отдельно)
check('Консоль браузера без ошибок и предупреждений', consoleProblems.length === 0, consoleProblems.length ? `${consoleProblems.length} шт.` : '');
for (const line of [...new Set(consoleProblems)].slice(0, 20)) console.log(`   ✗ ${line}`);
if (envNoise.length) {
  console.log(`ℹ️  Сообщения видеодрайвера среды (${envNoise.length}, к игре не относятся):`);
  for (const line of [...new Set(envNoise)].slice(0, 5)) console.log(`   ! ${line}`);
}

const failed = results.filter((r) => !r.ok);
console.log('\nСкриншоты:');
for (const file of screenshots) console.log(`  ${file}`);
console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено.`);
if (failed.length) {
  console.log('Не прошли:');
  for (const r of failed) console.log(`  ❌ ${r.name}${r.details ? ` — ${r.details}` : ''}`);
}
process.exit(failed.length || crashed ? 1 : 0);
