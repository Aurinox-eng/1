/**
 * Проверка игры в браузере (Playwright). Запуск: npm run qa -- --tag=td-1
 * (сначала сама собирает игровую и тестовую версии игры). Длится около четверти часа.
 *
 * Игра — tower defense: экран 1280×720 (16:9), слева карта с камерой (сдвиг, щипок, колесо мыши), справа панель.
 * Дорожки — граф «корневая система» (18 рёбер-кривых, 3 входа, 3 выхода, 4 развилки, 5 слияний); сеть проверки берут у самой
 * игры (window.__pvb.getGraph()), клетки для башен выбирают по ней, а числа баланса — из src/config.ts.
 *
 * ТЕСТОВАЯ сборка (dist-qa, с режимом ?qa), компьютер 1280×720 (мышь) и телефон 844×390 в горизонтальном
 * положении (касания), русский и английский (язык — настройкой браузера, как у настоящего игрока).
 * Сценарии (имена — для --only=):
 *   desktop-ru, phone-ru   полный набор: экран и начальное состояние, карта (252 клетки: 94 задеты дорожкой, 158 свободны),
 *                          камера (сдвиг, границы, колесо / щипок, подсказка «◀ Организм»), тап и сдвиг, постановка башни
 *                          (дорожка, занятая клетка, монеты; при любом приближении: 0.7, минимум, максимум), бой на этом
 *                          экране, пауза, «не завис ли»
 *   desktop-en, phone-en   сокращённый набор на английском: экран, начальное состояние, камера-скриншоты, постановка, бой
 *   rules                  правила клеток (компьютер): все видимые клетки (при обычном и минимальном приближении) — на дорожке
 *                          нельзя, на свободной можно; нет монет; порог тапа на телефоне
 *   graph                  сеть дорожек: структура (18/3/3/4/5, стыки, только влево) и 100 бактерий без башен — идут по рёбрам,
 *                          все входы, выходы и ребра используются, на развилках выбор случайный и не вырожденный
 *   combat                 бой на компьютере: выстрелы, убийства, монеты, отклик, учёт «убитые + дошедшие = вышедшие»
 *   dash                   палочка: рывки (×2,5 скорости на 1 с каждые 3 с), у каждой свои часы, у кокка рывков нет
 *   split                  делящаяся: при гибели 2 кокка на том же ребре в 44 px друг от друга, награда 25 и 10+10, без убийства не делится
 *   spore                  спора: глушит башню при подходе ближе 150 px на 3 с (выстрелы стоят), один раз; дальняя башня не глушится
 *   armored                бронированная: 6 HP (6 выстрелов), без башен отнимает 2 жизни
 *   intro                  порядок появления типов по волнам (1, 3, 5, 7, 9), новый тип один и первым; сообщение «Новая бактерия!»
 *                          и звук (ru и en), текст целиком в окне
 *   lose-ru, lose-en       потеря жизней, проигрыш (в том числе при работающих башнях: снарядов в полёте не остаётся), блокировка
 *                          перезапуска, перезапуск, утечки (lose-ru — компьютер, lose-en — телефон)
 *   win-ru, win-en         победа (снарядов в полёте не остаётся) и перезапуск (win-ru — компьютер, win-en — телефон)
 *   danger                 подсказка «◀ Организм» краснеет, когда бактерия близко к организму (проверка по цвету пикселей)
 *   rotate                 телефон вертикально ↔ горизонтально (на ru и en): вертикально — подсказка «Поверните телефон», время стоит, тапы
 *                          игре не мешают; обратно — подсказка пропала, время идёт; на компьютере подсказки нет ни в каком окне
 *   production             ИГРОВАЯ сборка (dist, та, что уйдёт на Яндекс): режима проверки, подмены чисел и языка из адреса нет; игра при этом работает (башня ставится тапом)
 *   fullgame               ПОЛНАЯ партия на настоящих числах: 12 волн, скорость ×8, 16 башен вдоль сети (QA_FULL_TOWERS=N — другое число);
 *                          ждёт «победу», печатает заметку о реальном времени и потерях (ориентир баланса, не замер)
 * Дополнительно: --only=combat (или любое другое имя из списка) запускает один сценарий; для production нужна свежая
 * `npm run build`, для остальных — `npm run build:qa`.
 *
 * Скриншоты — в qa/screenshots/<tag>/ (папка тега очищается только при запуске всех сценариев). Итог печатается в консоль;
 * при любой ошибке код выхода 1. Строки «📝» в конце — заметки (в счёт проверок не входят).
 *
 * Проверка самих проверок: QA_EXTRA_CFG=types.rod.dashFactor:1 node qa/smoke.mjs --tag=mut --only=dash подмешивает «поломку»
 * в адрес игры — соответствующая проверка обязана покраснеть (так проверяли, что проверки не пустые). Примеры: types.rod.dashFactor:1,
 * types.splitter.splitCount:0, types.spore.disableSec:0, types.armored.hp:3, waves.list.0.coccus:0, camera.tapMaxMovePx:14.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  createInput,
  GAME_H as H,
  GAME_W as W,
  heapMb,
  launchBrowser,
  makeGraphGeometry,
  parseArgs,
  readConfigNumber,
  readI18n,
  readLevel,
  readTitles,
  readWaveList,
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

const SCENARIOS = ['desktop-ru', 'phone-ru', 'desktop-en', 'phone-en', 'rules', 'graph', 'combat', 'dash', 'split', 'spore', 'armored', 'intro', 'lose-ru', 'lose-en', 'win-ru', 'win-en', 'danger', 'rotate', 'production', 'fullgame']
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

/** Заметки для отчёта: печатаются в конце, в счёт проверок не входят (риски и наблюдения, а не «прошло/не прошло»). */
const notes = [];
const note = (text) => {
  notes.push(text);
  console.log(`📝 ${text}`);
};

const check = (name, ok, details = '') => {
  results.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? '✅' : '❌'} ${name}${details ? ` — ${details}` : ''}`);
};

// ------------------------------------------------------------------ что игра должна показывать (из исходников)

const LEVEL = readLevel();
const MAP = { orgW: readConfigNumber('map', 'orgW'), tile: readConfigNumber('map', 'tile'), pathWidth: readConfigNumber('map', 'pathWidth') };
const WAVE_LIST = readWaveList();
const KINDS = ['coccus', 'rod', 'splitter', 'armored', 'spore'];
const CFG = {
  startCoins: readConfigNumber('economy', 'startCoins'),
  lives: readConfigNumber('lives', 'start'),
  waves: readConfigNumber('waves', 'total'),
  zoomStart: readConfigNumber('camera', 'zoomStart'),
  zoomMin: readConfigNumber('camera', 'zoomMin'),
  zoomMax: readConfigNumber('camera', 'zoomMax'),
  pillPrice: readConfigNumber('pill', 'price'),
  restartLockMs: readConfigNumber('gameOver', 'restartLockMs'),
  tapMaxMovePx: readConfigNumber('camera', 'tapMaxMovePx'),
};
const TITLES = { ru: readTitles()[0], en: readTitles()[1] };
const ROTATE_TEXT = (() => {
  try {
    const [ru, en] = readI18n('rotatePhone');
    return { ru, en };
  } catch {
    return { ru: '(в i18n.ts нет строки rotatePhone)', en: '(в i18n.ts нет строки rotatePhone)' }; // проверки подсказки покраснеют
  }
})();
/**
 * Сеть дорожек и клетки для проверок. Сеть берётся из самой игры (window.__pvb.getGraph()), клетки выбираются по ней:
 * FREE — свободные клетки с лучшим «покрытием» дорожек в окне старта камеры (a — лучшая), PATH — три клетки дорожки
 * у центра окна. Заполняется в setupWorld() до запуска сценариев.
 */
let GRAPH = null;
let GEO = null;
let FREE = {};
let PATH = [];
/** Окно старта камеры в координатах экрана игры: клетки дальше от краёв, чтобы сдвиги и приближения их не уводили за экран. */
const CELL_WINDOW = { x0: 170, x1: 910, y0: 130, y1: 590 };

function setupWorld(graph) {
  GRAPH = graph;
  GEO = makeGraphGeometry(graph, MAP, LEVEL.cols, LEVEL.rows);
  const sc = GEO.center(LEVEL.startCenter[0], LEVEL.startCenter[1]);
  const visible = [];
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      const w = GEO.center(col, row);
      const sx = (W - 200) / 2 + (w.x - sc.x);
      const sy = H / 2 + (w.y - sc.y);
      if (sx < CELL_WINDOW.x0 || sx > CELL_WINDOW.x1 || sy < CELL_WINDOW.y0 || sy > CELL_WINDOW.y1) continue;
      visible.push({ col, row, sx, sy, path: GEO.isPathCell(col, row), cov: GEO.coverage(col, row, 230), d: Math.hypot(sx - 540, sy - 360) });
    }
  }
  const free = visible.filter((c) => !c.path).sort((a, b) => b.cov - a.cov || a.col - b.col || a.row - b.row);
  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  FREE = {};
  keys.forEach((k, i) => {
    if (free[i]) FREE[k] = [free[i].col, free[i].row];
  });
  PATH = visible.filter((c) => c.path).sort((a, b) => a.d - b.d).slice(0, 3).map((c) => [c.col, c.row]);
}

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

/**
 * Единственное известное безобидное сообщение самой связки Phaser + Chrome: при системной отмене касания (проверка «отмена касания
 * системой») Phaser зовёт preventDefault() у события touchcancel, а Chrome пишет об этом в консоль. Игре это не вредит.
 */
const KNOWN_HARMLESS = /Ignored attempt to cancel a touchcancel event/;
const harmless = [];

function watchConsole(page, prefix) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const line = `${prefix} console.${msg.type()}: ${msg.text()}`;
    if (KNOWN_HARMLESS.test(msg.text())) harmless.push(line);
    else (ENV_NOISE.test(msg.text()) ? envNoise : consoleProblems).push(line);
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
  // QA_EXTRA_CFG нужна только для проверки самих проверок: подмешивает «поломку» (например camera.tapMaxMovePx:14) — соответствующая проверка обязана покраснеть
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

/** Подсказка «Поверните телефон» (блок #rotate в index.html): показана ли, на весь ли экран, какой текст, влезает ли он. */
const rotateInfo = (page) =>
  page.evaluate(() => {
    const box = document.getElementById('rotate');
    const text = document.getElementById('rotate-text');
    if (!box || !text) return { display: 'нет блока #rotate', full: false, text: '', textInside: false, coarse: matchMedia('(pointer: coarse)').matches };
    const r = box.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    return {
      display: getComputedStyle(box).display,
      full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1,
      text: text.textContent,
      textInside: t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight && t.width > 0,
      coarse: matchMedia('(pointer: coarse)').matches,
    };
  });

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
 * Разбор записанных путей бактерий по сети дорожек (traces: id → [{x, y, s, e, edge, kind, dashing}]):
 * лежат ли на кривой своего ребра, переходят ли только на следующие рёбра графа, идут ли вперёд и с нужной ли скоростью.
 * speed(kind, dashing) → допустимый диапазон скоростей, px/с (или null — не проверять).
 */
function analyzeTraces(traces, { speed, worldW }) {
  const out = {
    bacteria: traces.size,
    samples: 0,
    maxDev: 0,
    outOfEdge: 0,
    backwards: 0,
    badTransition: 0,
    badSpeed: 0,
    speedSeen: [1e9, 0],
    startedAtEntrance: 0,
    startedElsewhere: 0,
    leftwards: 0,
    full: 0,
    edgeChain: [],
    entrances: {},
    transitions: {}, // узел → { ребро-выход: сколько раз выбрано }
    exits: {}, // последнее ребро → сколько раз
  };
  const entr = new Set(GRAPH.entrances);
  const len = (id) => GEO.byId.get(id).length;
  for (const tr of traces.values()) {
    out.samples += tr.length;
    if (entr.has(tr[0].edge) && tr[0].s < 250 && tr[0].x > worldW - 400) {
      out.startedAtEntrance++;
      out.entrances[tr[0].edge] = (out.entrances[tr[0].edge] ?? 0) + 1;
    } else out.startedElsewhere++;
    const chain = [tr[0].edge];
    for (let i = 0; i < tr.length; i++) {
      const cur = tr[i];
      const e = GEO.byId.get(cur.edge);
      out.maxDev = Math.max(out.maxDev, GEO.distToEdge(cur, cur.edge));
      if (cur.s < -1e-6 || cur.s > e.length + 1e-6) out.outOfEdge++;
      if (i === 0) continue;
      const prev = tr[i - 1];
      let progress = null;
      if (cur.edge === prev.edge) {
        if (cur.s < prev.s - 1e-6) out.backwards++;
        progress = cur.s - prev.s;
      } else {
        const pe = GEO.byId.get(prev.edge);
        if (pe.to === e.from) {
          progress = len(prev.edge) - prev.s + cur.s;
          chain.push(cur.edge);
          const node = pe.to;
          out.transitions[node] ??= {};
          out.transitions[node][cur.edge] = (out.transitions[node][cur.edge] ?? 0) + 1;
        } else {
          // между замерами могло пройти целое короткое ребро: допускаем переход через одно промежуточное
          const mid = (GEO.outOf[pe.to] ?? []).find((id) => GEO.byId.get(id).to === e.from);
          if (mid === undefined) out.badTransition++;
          else {
            progress = len(prev.edge) - prev.s + len(mid) + cur.s;
            chain.push(mid, cur.edge);
          }
        }
      }
      const dt = cur.e - prev.e;
      const range = speed(cur.kind, prev.dashing && cur.dashing ? 'dash' : prev.dashing || cur.dashing ? 'mixed' : 'normal');
      if (progress !== null && dt >= 0.05 && range) {
        const v = progress / dt;
        out.speedSeen = [Math.min(out.speedSeen[0], v), Math.max(out.speedSeen[1], v)];
        if (v < range[0] || v > range[1]) out.badSpeed++;
      }
    }
    const last = tr[tr.length - 1];
    if (last.x < tr[0].x - 500) out.leftwards++;
    out.edgeChain.push(chain);
    const lastEdge = GEO.byId.get(last.edge);
    if (!(GEO.outOf[lastEdge.to] ?? []).length && last.s > lastEdge.length - 260) {
      out.full++;
      out.exits[last.edge] = (out.exits[last.edge] ?? 0) + 1;
    }
  }
  return out;
}

/** Запись положения бактерий по ходу игры. */
function recordTraces(traces, s) {
  for (const b of s.bacteria) {
    if (!traces.has(b.id)) traces.set(b.id, []);
    traces.get(b.id).push({ x: b.x, y: b.y, s: b.s, e: s.elapsed, edge: b.edge, kind: b.kind, dashing: b.dashing });
  }
}

/** Сколько рёбер в самой короткой цепочке от входа до выхода по графу. */
function shortestChain() {
  let best = Infinity;
  const walk = (id, n) => {
    const next = GEO.outOf[GEO.byId.get(id).to] ?? [];
    if (next.length === 0) best = Math.min(best, n);
    for (const nx of next) walk(nx, n + 1);
  };
  for (const id of GRAPH.entrances) walk(id, 1);
  return best;
}

const startCenterPx = () => GEO.center(LEVEL.startCenter[0], LEVEL.startCenter[1]);

/** Диапазон скоростей кокка (px/с) при базовой скорости и разбросе; рывки у кокка нет. */
const coccusSpeed = (base = BASE.baseSpeed, factor = BASE.speedFactor, spread = BASE.spread) => [base * factor * (1 - spread) - 1.5, base * factor * (1 + spread) + 1.5];
const cocciOnly = (range) => (kind, mode) => (kind === 'coccus' && mode === 'normal' ? range : null);
const speedBounds = (...a) => ({ speed: cocciOnly(coccusSpeed(...a)) });

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
  const rot0 = await rotateInfo(page);
  check(`${p} подсказка «Поверните телефон» в горизонтальном положении (и на компьютере) не показана`, rot0.display === 'none', `display=${rot0.display}, pointer:coarse=${rot0.coarse}`);
  const btn = s0.ui.towerButton;
  check(
    `${p} панель внутри экрана: кнопка башни и кнопка паузы справа от окна карты`,
    btn.x - btn.w / 2 >= s0.viewW && btn.x + btn.w / 2 <= W && btn.y - btn.h / 2 >= 0 && btn.y + btn.h / 2 <= H && s0.ui.pauseButton.x > s0.viewW && s0.ui.pauseButton.x < W && s0.ui.pauseButton.y > 0 && s0.ui.pauseButton.y < H,
    `кнопка башни (${btn.x}; ${btn.y}) ${btn.w}×${btn.h}, пауза (${s0.ui.pauseButton.x}; ${s0.ui.pauseButton.y})`,
  );
  // Карта: сколько клеток задето дорожкой (по заданию: 252 всего, 94 задеты, 158 свободны; правило — центр клетки ближе pathWidth/2 + 0,45·tile = 88,5 px к точке ребра). Если цифры не сойдутся — сигнал об ошибке правила или карты.
  const totalCells = LEVEL.cols * LEVEL.rows;
  const freeCells = totalCells - GEO.pathCellCount;
  check(`${p} карта: клеток ${totalCells}, задето дорожкой ${GEO.pathCellCount} (ждали 94), свободных ${freeCells} (ждали 158)`, totalCells === 252 && GEO.pathCellCount === 94 && freeCells === 158, `по точкам рёбер: ${GEO.pathCellCount}; по отрезкам между точками: ${GEO.pathCellCountByCurve}`);
  check(`${p} клетки для проверок подобраны (свободные ${Object.keys(FREE).length}, дорожные ${PATH.length})`, Object.keys(FREE).length === 7 && PATH.length === 3 && Object.values(FREE).every(([c, r]) => !GEO.isPathCell(c, r)) && PATH.every(([c, r]) => GEO.isPathCell(c, r)), `FREE ${Object.values(FREE).map((q) => `(${q})`).join(' ')}; PATH ${PATH.map((q) => `(${q})`).join(' ')}`);

  await sleep(400);
  const startPng = await shot(page, `${name}-01-start`);
  const chipStart = await chipWhitePixels(game, startPng);
  check(`${p} подсказка «◀ Организм» видна на старте (организм за краем экрана)`, chipStart >= 25, `белых точек надписи: ${chipStart}`);

  // ---- сдвиг карты
  const cam = async () => (await game.state()).camera;
  let c0 = await cam();
  // мелкими шагами (8 px): так видно, «съедает» ли порог тапа начало движения
  await input.drag(g(650, 300), g(450, 300), { steps: 25, stepMs: 0 });
  await settle();
  let c1 = await cam();
  check(`${p} сдвиг влево на 200: центр камеры уходит вправо ровно на 200 (карта догоняет палец сразу, порог тапа не «съедает» путь)`, Math.abs(c1.cx - c0.cx - 200 / c0.zoom) <= 3 && Math.abs(c1.cy - c0.cy) <= 3, `Δcx=${f1(c1.cx - c0.cx)}, Δcy=${f1(c1.cy - c0.cy)}`);
  c0 = c1;
  await input.drag(g(600, 200), g(600, 400), { steps: 25, stepMs: 0 });
  await settle();
  c1 = await cam();
  check(`${p} сдвиг вниз на 200: центр камеры уходит вверх ровно на 200`, Math.abs(c1.cy - c0.cy + 200 / c0.zoom) <= 3 && Math.abs(c1.cx - c0.cx) <= 3, `Δcx=${f1(c1.cx - c0.cx)}, Δcy=${f1(c1.cy - c0.cy)}`);

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
  check(`${p} подсказка «◀ Организм» возвращается, когда организм снова за краем`, chipBack >= 25, `белых точек надписи: ${chipBack}`);
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

  if (!isTouch) {
    // Firefox шлёт колесо «строками»: один щелчок = deltaY 3 при deltaMode 1 (Chrome — 100 пикселей). Настоящего Firefox в проверке нет — событие подделано
    const notch = { mode: 1, dy: -3 };
    const b = await game.state();
    await page.evaluate(([n, x, y]) => {
      const canvas = document.querySelector('canvas');
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: n.dy, deltaMode: n.mode, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, [notch, anchorC.x, anchorC.y]);
    await settle();
    const a2 = await game.state();
    const r2 = a2.camera.zoom / b.camera.zoom;
    check(`${p} колесо «строками» (так шлёт Firefox: щелчок = deltaY 3, deltaMode 1; событие подделано): щелчок приближает так же, как у Chrome (×${f2(ratio)} ±0,03)`, Math.abs(r2 - ratio) <= 0.03, `zoom ${f2(b.camera.zoom)} → ${f2(a2.camera.zoom)} (×${r2.toFixed(3)}; щелчок Chrome дал ×${f2(ratio)})`);
  }

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
  const game = await openGame(c.context, c.baseUrl, p, { speed: 1, isTouch, cfg: `economy.startCoins:${BASE.price * 5 + 20},waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  const { page, input, screen } = game;
  const price = BASE.price;
  const coins0 = price * 5 + 20;
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
  check(`${p} сдвиг, начатый над свободной клеткой при выбранной башне, башню НЕ ставит, а карту двигает ровно на 60`, s.towers.length === 0 && s.coins === coins0 && Math.abs(camA.cx - s.camera.cx - 60 / camA.zoom) <= 3, `башен ${s.towers.length}, карта сдвинулась на ${f1(camA.cx - s.camera.cx)} px`);
  // чуть дальше порога тапа — уже сдвиг: башни нет, а карта сразу догоняет палец на весь пройденный путь
  const over = CFG.tapMaxMovePx + 8;
  const camO = (await st()).camera;
  await input.wobbleTap(await game.cell(...FREE.a), over * screen.scale);
  await settle();
  s = await st();
  check(`${p} сдвиг чуть дальше порога тапа (${CFG.tapMaxMovePx} + 8 = ${over} px экрана игры) — не тап: башни нет, карта сдвинулась на ${over}`, s.towers.length === 0 && s.coins === coins0 && Math.abs(camO.cx - s.camera.cx - over / camO.zoom) <= 3, `башен ${s.towers.length}, карта сдвинулась на ${f1(camO.cx - s.camera.cx)} px`);
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
  await shot(page, `${name}-13-toast-cant-build`);
  s = await st();
  check(`${p} тап по клеткам дорожки ${PATH.map((q) => `(${q})`).join(' ')} башню не ставит, монеты не тратятся`, s.towers.length === 0 && s.coins === coins0 && s.effects.placements === 0, `башен ${s.towers.length}, монет ${s.coins}`);
  // два пальца (щипок-касание) башню не ставят
  if (isTouch) {
    await input.twoFingerTap(await game.cell(...FREE.a), 40 * screen.scale);
    await settle();
    s = await st();
    check(`${p} касание двумя пальцами башню не ставит`, s.towers.length === 0 && s.coins === coins0, `башен ${s.towers.length}`);
  }
  // система отменила касание (входящий звонок, жест ОС): башни нет, а следующий сдвиг работает как обычно
  if (isTouch) {
    const cellPt = await game.cell(...FREE.a);
    await game.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cellPt.x, y: cellPt.y, id: 1 }] });
    await sleep(80);
    await game.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await settle();
    s = await st();
    const camB = s.camera;
    const noTower = s.towers.length === 0 && s.coins === coins0;
    await input.drag(game.g(700, 200), game.g(600, 200));
    await settle();
    const camC = (await st()).camera;
    check(`${p} отмена касания системой: башню не ставит, следующий сдвиг двигает карту как обычно (ровно 100 px)`, noTower && Math.abs(camC.cx - camB.cx - 100) <= 3, `башен ${s.towers.length}, сдвиг ${f1(camC.cx - camB.cx)} px`);
  }
  // тап с обычным дрожанием пальца — ставит: 8 px на стекле (порог касания в Android), у нас это 8 px на компьютере и ≈15 px экрана игры на телефоне
  await input.wobbleTap(await game.cell(...FREE.a), 8);
  await settle();
  s = await st();
  const t0 = s.towers[0];
  check(`${p} короткий тап (дрожание пальца 8 px на стекле) ставит башню: башен 1, монет −${price}, кольцо постановки`, s.towers.length === 1 && t0.col === FREE.a[0] && t0.row === FREE.a[1] && s.coins === coins0 - price && s.effects.placements === 1, `башен ${s.towers.length}, монет ${s.coins}, placements ${s.effects.placements}`);
  // занятая клетка
  await game.tapCell(...FREE.a);
  s = await st();
  check(`${p} тап по занятой клетке ничего не меняет`, s.towers.length === 1 && s.coins === coins0 - price && s.effects.placements === 1, `башен ${s.towers.length}, монет ${s.coins}`);
  // вторая башня
  await game.tapCell(...FREE.b);
  s = await st();
  check(`${p} вторая башня: башен 2, монет ${coins0 - 2 * price}`, s.towers.length === 2 && s.coins === coins0 - 2 * price && s.effects.placements === 2, `башен ${s.towers.length}, монет ${s.coins}`);

  {
    // Башню можно ставить при ЛЮБОМ приближении: 0.7 (среднее), минимум, максимум. Цель тапа — точно центр клетки (на минимуме клетка ≈56 px игры, на телефоне ≈30 px стекла)
    const zoomStep = async (pt, dir, times) => {
      for (let i = 0; i < times; i++) {
        if (!isTouch) await input.wheel(pt, dir * 500);
        else if (dir > 0) await input.pinch(pt, 220 * screen.scale, 40 * screen.scale, { steps: 4, stepMs: 0 });
        else await input.pinch(pt, 40 * screen.scale, 220 * screen.scale, { steps: 4, stepMs: 0 });
      }
      await settle();
    };
    const placeAt = async (cell, label, wantZoom) => {
      const before = await st();
      const pt = await game.cell(...cell);
      const okView = insideMap(pt);
      await input.tap(pt);
      await settle();
      const after = await st();
      const tower = after.towers[after.towers.length - 1];
      check(
        `${p} при приближении ${label} (zoom ${wantZoom}) тап по свободной клетке ${cell} ставит башню: башен +1, монет −${price}, placements +1`,
        okView && Math.abs(before.camera.zoom - wantZoom) < 0.02 && after.towers.length === before.towers.length + 1 && tower.col === cell[0] && tower.row === cell[1] && after.coins === before.coins - price && after.effects.placements === before.effects.placements + 1,
        `zoom ${f2(before.camera.zoom)}, клетка на экране ${okView}, башен ${before.towers.length} → ${after.towers.length}, монет ${before.coins} → ${after.coins}`,
      );
    };

    // среднее приближение 0.7 (раньше было «слишком мелко, не ставить»)
    let pt = await game.cell(...FREE.c);
    if (!isTouch) await input.wheel(pt, 240);
    else await input.pinch(pt, 200 * screen.scale, 140 * screen.scale);
    await settle();
    await placeAt(FREE.c, 'среднем', 0.7);

    // минимальное приближение
    pt = await game.cell(...FREE.d);
    await zoomStep(pt, 1, isTouch ? 2 : 3);
    await placeAt(FREE.d, 'минимальном', CFG.zoomMin);
    const beforeNo = await st();
    await game.tapCell(...PATH[1]); // клетка дорожки
    await game.tapCell(...FREE.d); // занятая клетка
    const afterNo = await st();
    check(`${p} при минимальном приближении клетка дорожки и занятая клетка по-прежнему не ставят башню, монеты не тратятся`, afterNo.towers.length === beforeNo.towers.length && afterNo.coins === beforeNo.coins && afterNo.effects.placements === beforeNo.effects.placements, `башен ${beforeNo.towers.length} → ${afterNo.towers.length}, монет ${beforeNo.coins} → ${afterNo.coins}`);
    await sleep(400);
    await shot(page, `${name}-14-towers-min-zoom`);

    // максимальное приближение
    pt = await game.cell(...FREE.e);
    await zoomStep(pt, -1, isTouch ? 3 : 4);
    await placeAt(FREE.e, 'максимальном', CFG.zoomMax);
    await sleep(400);
    await shot(page, `${name}-17-towers-max-zoom`);

    // монет не хватает (рядом с только что поставленной башней)
    const used = new Set(Object.values(FREE).map((q) => q.join(',')));
    const next = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]].map(([dc, dr]) => [FREE.e[0] + dc, FREE.e[1] + dr]).find(([c, r]) => c >= 0 && c < LEVEL.cols && r >= 0 && r < LEVEL.rows && !GEO.isPathCell(c, r) && !used.has(`${c},${r}`));
    await game.tapCell(...next);
    await shot(page, `${name}-15-toast-no-coins`);
    s = await st();
    check(`${p} не хватает монет (${s.coins} < ${price}): башня не ставится, монеты те же`, s.towers.length === 5 && s.coins === 20 && s.coins < price, `башен ${s.towers.length}, монет ${s.coins}`);
  }
  await page.close();
}

/** Бой на этом экране: башни, выстрелы, убийства, монеты; пауза; «не завис ли». */
async function profileBattle(c) {
  const { prefix: p, isTouch, name, full } = c;
  const game = await openGame(c.context, c.baseUrl, p, { speed: 4, isTouch, cfg: `waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},towers.pill.range:450` });
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
  if (c.full) {
    // «Зависание» страницы на 3 секунды (как после сворачивания вкладки): игровое время не должно скакнуть вперёд
    const before = await game.state();
    await page.evaluate(() => {
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        /* страница занята и не рисует кадры */
      }
    });
    await sleep(300);
    const jumped = (await game.state()).elapsed - before.elapsed;
    check(`${p} после «зависания» страницы на 3 с игровое время не скачет (скорость игры ×4: без защиты было бы ≈13 с)`, jumped < 3, `прошло игрового времени ${f2(jumped)} с`);
  }
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

/** Запас башен от дорожки: центр башни ≥ 88 px от ближайшей точки ребра; основание (радиус 36) не заходит на полосу с каймой (полуширина 43 + кайма 6). */
function towerClearance(s, prefix) {
  const limit = MAP.pathWidth / 2 + 0.45 * MAP.tile;
  const base = 36;
  const edgeHalf = MAP.pathWidth / 2 + 6;
  const pts = s.towers.map((t) => GEO.distToAnyPoint({ x: t.x, y: t.y }));
  const curves = s.towers.map((t) => GEO.distToAnyCurve({ x: t.x, y: t.y }));
  const minPt = Math.min(...pts);
  const minCurve = Math.min(...curves);
  check(`${prefix}: центр каждой из ${s.towers.length} башен дальше ${f1(limit - 0.5)} px от ближайшей точки ребра (минимум ${f1(minPt)}), основание башни не заходит на полосу дорожки с каймой (до кривой ≥ ${edgeHalf + base} px, минимум ${f1(minCurve)})`, s.towers.length > 20 && minPt >= limit - 0.5 && minCurve >= edgeHalf + base, `точки рёбер: ${f1(minPt)}, кривая: ${f1(minCurve)}`);
}

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
  towerClearance(s, `${p} (обычное приближение)`);
  await sleep(300);
  await shot(game.page, 'rules-01-all-cells');
  await game.page.close();

  // ---- то же при минимальном приближении (0.54: клетка ≈56 px игры): башня ставится на любую свободную клетку, на дорожку — нет
  game = await openGame(context, baseUrl, p, { cfg: `economy.startCoins:100000,waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  await game.towerButton();
  for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500);
  await settle();
  s = await game.state();
  const minCells = [];
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      const w = GEO.center(col, row);
      const sx = s.viewW / 2 + (w.x - s.camera.cx) * s.camera.zoom;
      const sy = s.height / 2 + (w.y - s.camera.cy) * s.camera.zoom;
      if (sx >= 20 && sx <= s.viewW - 20 && sy >= 20 && sy <= s.height - 20) minCells.push({ col, row, sx, sy, path: GEO.isPathCell(col, row) });
    }
  }
  const atMin = Math.abs(s.camera.zoom - CFG.zoomMin) < 0.002;
  for (const cell of minCells) await game.input.tap(game.g(cell.sx, cell.sy));
  await settle();
  s = await game.state();
  const placedMin = new Set(s.towers.map((t) => `${t.col},${t.row}`));
  const badPath = minCells.filter((q) => q.path && placedMin.has(`${q.col},${q.row}`));
  const missedMin = minCells.filter((q) => !q.path && !placedMin.has(`${q.col},${q.row}`));
  const freeMin = minCells.filter((q) => !q.path).length;
  check(`${p} при минимальном приближении (zoom ${f2(s.camera.zoom)}) башня ставится на все ${freeMin} свободных клеток экрана (из ${minCells.length} видимых)`, atMin && missedMin.length === 0 && s.towers.length === freeMin && minCells.length > 200, `zoom ${f2(s.camera.zoom)}, башен ${s.towers.length}, не поставлены: ${missedMin.map((q) => `(${q.col},${q.row})`).join(' ') || 'нет'}`);
  check(`${p} при минимальном приближении на клетках дорожки башен нет (${minCells.length - freeMin} клеток дорожки на экране), монеты списаны ровно за башни`, badPath.length === 0 && s.coins === 100000 - BASE.price * s.towers.length, badPath.map((q) => `(${q.col},${q.row})`).join(' ') || `монет ${s.coins}`);
  towerClearance(s, `${p} (минимальное приближение)`);
  await sleep(300);
  await shot(game.page, 'rules-02-all-cells-min-zoom');
  await game.page.close();

  // ---- касание, начатое на карте у самой панели и закончившееся на панели (сдвиг в пределах порога тапа)
  game = await openGame(context, baseUrl, p, { cfg: `economy.startCoins:500,waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  await game.towerButton();
  const edge = game.g(1076, 300);
  const over = game.g(1086, 300);
  await game.page.mouse.move(edge.x, edge.y);
  await game.page.mouse.down();
  await game.page.mouse.move(over.x, over.y);
  await game.page.mouse.up();
  await settle();
  s = await game.state();
  check(`${p} касание, начатое на карте и закончившееся на панели (сдвиг 10 px), башню не ставит: на панели карты не видно`, s.towers.length === 0 && s.coins === 500, `башен ${s.towers.length}${s.towers[0] ? `, поставлена в клетку (${s.towers[0].col};${s.towers[0].row}), скрытую под панелью` : ''}`);
  await game.page.close();
  await context.close();

  // ---- порог тапа на телефоне в настоящих пикселях стекла: обычное дрожание пальца (до 10 px) — ещё тап, явный сдвиг (≈16+ px) — нет
  const phoneCtx = await newDeviceContext(browser, VIEWPORTS.phone, 'ru');
  const phone = await openGame(phoneCtx, baseUrl, p, { isTouch: true, cfg: `economy.startCoins:500,waves.firstDelaySec:60,${FIXED_BALANCE.join(',')}` });
  const scale = phone.screen.scale;
  const slopGlass = CFG.tapMaxMovePx * scale;
  const probe = [];
  await phone.towerButton();
  const results = [];
  for (const [cssPx, cell, wantTap] of [[4, FREE.a, true], [8, FREE.b, true], [10, FREE.c, true], [16, FREE.d, false]]) {
    const before = (await phone.state()).towers.length;
    await phone.input.wobbleTap(await phone.cell(...cell), cssPx);
    await settle();
    const tapped = (await phone.state()).towers.length > before;
    results.push({ cssPx, tapped, wantTap });
    probe.push(`${cssPx} px — ${tapped ? 'тап' : 'сдвиг'}`);
  }
  check(
    `${p} телефон 844×390: порог тапа ${CFG.tapMaxMovePx} px экрана игры ≈ ${f1(slopGlass)} px на стекле; дрожание 4, 8, 10 px — тап, 16 px — сдвиг`,
    results.every((r) => r.tapped === r.wantTap),
    probe.join('; '),
  );
  await phoneCtx.close();
}

// ================================================================== бой на компьютере

async function runCombat(browser, baseUrl) {
  const p = '[бой]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const WAVE1 = 10;
  // Кокки не отнимают жизни (чтобы партия не кончилась, если кто-то дойдёт); волн две, между ними долгая пауза — карта успевает опустеть
  const cfg = `waves.total:2,waves.list.0.coccus:${WAVE1},waves.firstDelaySec:1,waves.pauseSec:60,${FIXED_BALANCE.join(',')},types.coccus.lifeDamage:0,economy.startCoins:${BASE.price * 4 + 20}`;
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg });
  const { page } = game;
  let s = await game.placeTowers([FREE.a, FREE.b, FREE.c, FREE.d]);
  const towers = s.towers.map((t) => ({ x: t.x, y: t.y }));
  check(`${p} четыре башни поставлены в лучшие клетки`, s.towers.length === 4, `башен ${s.towers.length}`);
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
    const nearest = (st) => Math.min(...st.bacteria.map((b) => Math.min(...towers.map((t) => Math.hypot(b.x - t.x, b.y - t.y))) - b.r), 1e9);
    if (nearest(prev) > range + 100 && nearest(s) > range + 100 && s.shots !== prev.shots) violation++;
    if (s.state === 'won') wonEarly = true;
    prev = s;
    if (s.spawned >= WAVE1 && s.bacteria.length === 0) break;
    await sleep(50);
  }
  await sleep(200);
  s = await game.state();
  check(`${p} башни стреляют (выстрелов ${s.shots}), бактерии уничтожаются (убито ${s.kills} из ${s.spawned})`, s.shots > 0 && s.kills >= 1, `выстрелов ${s.shots}, убито ${s.kills}, дошло до организма ${s.leaked}`);
  check(`${p} каждая бактерия волны либо убита, либо дошла до организма (${s.spawned} вышло = ${s.kills} убито + ${s.leaked} дошло)`, s.spawned === WAVE1 && s.kills + s.leaked === s.spawned && s.splits === 0, `вышло ${s.spawned}, убито ${s.kills}, дошло ${s.leaked}`);
  check(`${p} монеты: +${BASE.reward} за каждую убитую`, s.coins === 20 + BASE.reward * s.kills, `монет ${s.coins}, убито ${s.kills}`);
  check(`${p} отклик: частицы и «+монеты» — по разу на каждое убийство`, s.effects.bursts === s.kills && s.effects.popups === s.kills, `частицы ${s.effects.bursts}, надписи ${s.effects.popups}`);
  check(`${p} башня не стреляет, пока никого нет в радиусе ${range} px`, violation === 0, violation ? `нарушений: ${violation}` : '');
  check(`${p} после уничтожения всех бактерий волны победа не засчитывается (волн 2, состояние ${s.state}, волна ${s.wave})`, !wonEarly && s.state === 'playing' && s.wave === 1, `состояние ${s.state}, волна ${s.wave}`);
  check(`${p} число объектов ограничено (снарядов ≤ 12, бактерий ≤ ${WAVE1})`, maxProjectiles <= 12 && maxBacteria <= WAVE1, `максимум снарядов ${maxProjectiles}, бактерий ${maxBacteria}`);
  const a = analyzeTraces(traces, { ...speedBounds(), worldW: s.map.worldW });
  check(`${p} все бактерии выходят справа на входных рёбрах графа (${GRAPH.entrances.join(', ')})`, a.startedAtEntrance === a.bacteria && a.bacteria === WAVE1, `записано ${a.bacteria}, на входе ${a.startedAtEntrance}, входы: ${JSON.stringify(a.entrances)}`);
  check(`${p} движение только вперёд по рёбрам графа: назад 0, переходов не на следующее ребро 0, идут влево ${a.bacteria}/${a.bacteria}`, a.backwards === 0 && a.badTransition === 0 && a.leftwards === a.bacteria, `назад ${a.backwards}, неверных переходов ${a.badTransition}, идут влево ${a.leftwards}/${a.bacteria}`);
  check(`${p} координаты бактерий лежат на кривой своего ребра (отклонение ≤ 0,5 px), s в пределах ребра`, a.maxDev <= 0.5 && a.outOfEdge === 0, `макс. отклонение ${f2(a.maxDev)} px, замеров вне ребра ${a.outOfEdge} из ${a.samples}`);
  const sp = coccusSpeed();
  check(`${p} скорость ${f1(sp[0] + 1.5)}…${f1(sp[1] - 1.5)} px/с (базовая ${BASE.baseSpeed} × ${BASE.speedFactor} ±${BASE.spread * 100}%)`, a.badSpeed === 0, `замерено ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])} px/с, вне нормы ${a.badSpeed}`);
  await game.page.close();

  // ---- снаряд, летевший в бактерию, которая уже дошла до организма, не должен засчитываться как убийство (монеты и счётчик убитых)
  const FAST = 12;
  const g2 = await openGame(context, baseUrl, p, { speed: 4, cfg: `waves.total:1,waves.list.0.coccus:${FAST},waves.intervalStartSec:1,waves.intervalEndSec:1,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},bacteria.baseSpeed:330,types.coccus.lifeDamage:0,towers.pill.range:1400,towers.pill.cooldownMs:250,towers.pill.projectileSpeed:120,economy.startCoins:${BASE.price * 4}` });
  await g2.placeTowers([FREE.a, FREE.b, FREE.c, FREE.d]);
  const e2 = await pollUntil(g2, (x) => x.state === 'won' || x.state === 'lost', 120000, 30);
  check(`${p} быстрые бактерии уходят к организму раньше, чем долетают медленные снаряды: убитые + дошедшие = вышедшие (${e2.kills} + ${e2.leaked} = ${e2.spawned}); снаряд по дошедшей бактерии убийством не считается`, e2.spawned === FAST && e2.kills + e2.leaked === e2.spawned && e2.leaked > 0, `убито ${e2.kills}, дошло ${e2.leaked}, вышло ${e2.spawned}, лишних засчитанных убийств ${e2.kills + e2.leaked - e2.spawned}`);
  check(`${p} монеты = награда только за настоящие убийства (монет ${e2.coins}, ждали ${BASE.reward} × убито ${e2.kills - Math.max(0, e2.kills + e2.leaked - e2.spawned)})`, e2.coins === BASE.reward * Math.min(e2.kills, e2.spawned - e2.leaked), `монет ${e2.coins}, убито ${e2.kills}, дошло ${e2.leaked}`);
  await context.close();
}

// ================================================================== подсказка «◀ Организм» мигает красным, когда бактерия близко

async function runDanger(browser, baseUrl) {
  const p = '[тревога у организма]';
  const danger = readConfigNumber('ui', 'dangerDistancePx');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 6, cfg: `waves.firstDelaySec:1,waves.list.0.coccus:1,${FIXED_BALANCE.join(',')},ui.dangerDistancePx:${danger}` });
  const { page } = game;
  const chipRed = async () => {
    const png = await page.screenshot();
    const c = game.g(132, 345);
    const [[r]] = await samplePixels(page, png, [[c.x, c.y]]);
    return { r, png };
  };
  let calm = null;
  const alarm = [];
  let s = await game.state();
  const started = Date.now();
  let shotTaken = false;
  while (Date.now() - started < WAIT_MS && s.state === 'playing' && s.leaked === 0) {
    s = await game.state();
    const nearest = Math.min(...s.bacteria.map((b) => b.x - MAP.orgW), 1e9);
    if (calm === null && s.bacteria.length > 0 && nearest > danger + 500) calm = (await chipRed()).r;
    else if (nearest < danger - 100 && nearest > 60 && alarm.length < 8) {
      const { r } = await chipRed();
      alarm.push(r);
      if (!shotTaken) {
        await shot(page, 'desktop-ru-12-danger-chip');
        shotTaken = true;
      }
    } else await sleep(40);
  }
  const maxAlarm = Math.max(0, ...alarm);
  check(`${p} подсказка «◀ Организм» спокойная, пока бактерия далеко (красная составляющая цвета ${calm} ≤ 120)`, calm !== null && calm <= 120, `R=${calm}`);
  check(`${p} подсказка «◀ Организм» краснеет и мигает, когда бактерия ближе ${danger} px к организму (замеров ${alarm.length}, наибольшая красная составляющая ${maxAlarm} ≥ 150)`, alarm.length >= 2 && maxAlarm >= 150, `R по замерам: ${alarm.join(', ')}`);
  await context.close();
}

// ================================================================== проигрыш и победа

async function tapToRestart(game) {
  await game.input.tap(game.g(640, 300));
}

/** Проигрыш при работающих башнях: снаряды в полёте не должны зависать под экраном «Проигрыш». */
async function loseWithTowers(context, baseUrl, p, name, device) {
  // Башни бьют далеко и медленными снарядами, но урон нулевой: бактерии не гибнут, доходят до организма, снарядов в воздухе много
  const cfg = 'waves.firstDelaySec:1,waves.list.0.coccus:4,lives.start:1,bacteria.baseSpeed:250,towers.pill.damage:0,towers.pill.cooldownMs:400,towers.pill.projectileSpeed:200,towers.pill.range:900,economy.startCoins:200';
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg, isTouch: device.hasTouch });
  await game.placeTowers([FREE.f, FREE.e]);
  let s = await game.state();
  check(`${p} проигрыш с башнями: обе башни поставлены до появления бактерий у организма`, s.towers.length === 2 && s.state === 'playing', `башен ${s.towers.length}, состояние ${s.state}, монет ${s.coins}, выстрелов ${s.shots}`);
  let maxShots = 0;
  const started = Date.now();
  while (Date.now() - started < WAIT_MS && s.state !== 'lost') {
    s = await game.state();
    maxShots = Math.max(maxShots, s.projectiles);
    await sleep(40);
  }
  await sleep(300);
  const later = await game.state();
  await shot(game.page, `${name}-16-lost-with-towers`);
  check(`${p} при проигрыше (башни стреляют, в воздухе до ${maxShots} снарядов) снарядов в полёте не остаётся`, later.state === 'lost' && maxShots > 0 && s.projectiles === 0 && later.projectiles === 0, `состояние ${later.state}, башен ${later.towers.length}, выстрелов ${later.shots}, снарядов в момент проигрыша ${s.projectiles}, через 0,3 с ${later.projectiles}`);
  await game.page.close();
}

async function runLose(browser, baseUrl, lang, deviceKey, full) {
  const device = VIEWPORTS[deviceKey];
  const p = `[проигрыш, ${device.label}, ${lang}]`;
  const name = `${deviceKey}-${lang}`;
  const context = await newDeviceContext(browser, device, lang);
  const base = 250;
  const cfg = `waves.firstDelaySec:1,waves.intervalStartSec:2,waves.intervalEndSec:2,${FIXED_BALANCE.filter((x) => !x.startsWith('bacteria.baseSpeed')).join(',')},bacteria.baseSpeed:${base}`;
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
      const minChain = shortestChain();
      check(`${p} бактерии проходят весь путь по графу от входа до выхода (дошли до выходного ребра: ${a.full}; цепочки рёбер не короче ${minChain})`, a.full >= 2 && a.edgeChain.filter((c) => GEO.outOf[GEO.byId.get(c[c.length - 1]).to] === undefined).every((c) => c.length >= minChain), `до выхода ${a.full}, выходы: ${JSON.stringify(a.exits)}, цепочки: ${a.edgeChain.map((c) => c.join('→')).join(' | ')}`);
      check(`${p} на всём пути: на кривой ребра (≤ 0,5 px), вперёд, переходы только на следующие рёбра, скорость в норме`, a.maxDev <= 0.5 && a.outOfEdge === 0 && a.backwards === 0 && a.badTransition === 0 && a.badSpeed === 0, `отклонение ${f2(a.maxDev)} px, вне ребра ${a.outOfEdge}/${a.samples}, назад ${a.backwards}, неверных переходов ${a.badTransition}, скорость ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])}, вне нормы ${a.badSpeed}`);
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
  if (full) await loseWithTowers(context, baseUrl, p, name, device);
  await context.close();
}

async function runWin(browser, baseUrl, lang, deviceKey, full) {
  const device = VIEWPORTS[deviceKey];
  const p = `[победа, ${device.label}, ${lang}]`;
  const name = `${deviceKey}-${lang}`;
  const context = await newDeviceContext(browser, device, lang);
  const cfg = 'waves.total:1,waves.list.0.coccus:2,waves.firstDelaySec:1,towers.pill.range:900,economy.startCoins:500,bacteria.baseSpeed:200,lives.start:3';
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg, isTouch: device.hasTouch });
  const { page } = game;
  const listeners0 = (await game.state()).pointerListeners;
  await game.placeTowers([FREE.f, FREE.e, FREE.b]);
  let s = await game.state();
  const midWin = [];
  let sawShots = false;
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    s = await game.state();
    if (s.projectiles > 0) sawShots = true;
    if (s.state === 'won') break;
    if (s.spawned < 2 || s.bacteria.length > 0) midWin.push(s.state);
    await sleep(40);
  }
  const detectedAt = Date.now();
  check(`${p} победа: все волны вышли и отбиты — состояние «победа»`, s.state === 'won' && s.spawned === 2 && s.kills === 2 && s.leaked === 0 && s.bacteria.length === 0 && s.wave === 1 && s.waveTotal === 1 && s.lives === 3, `состояние ${s.state}, вышло ${s.spawned}, убито ${s.kills}, дошло ${s.leaked}, волна ${s.wave}/${s.waveTotal}`);
  await sleep(300);
  const wonLater = await game.state();
  check(`${p} при победе снарядов в полёте не остаётся (по ходу игры они были: ${sawShots})`, sawShots && s.projectiles === 0 && wonLater.projectiles === 0, `снарядов в момент победы ${s.projectiles}, через 0,3 с ${wonLater.projectiles}`);
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
  const towerTap = async (game) => {
    const b = (await getState(game.page)).ui.towerButton;
    const c = await game.page.evaluate(([x, y]) => window.__pvb.gameToClient(x, y), [b.x, b.y]);
    await game.page.touchscreen.tap(c.x, c.y);
    await sleep(250);
    return (await getState(game.page)).selected;
  };
  // ---- телефон: горизонтально → вертикально (подсказка «Поверните телефон», время стоит) → горизонтально; на обоих языках
  for (const lang of ['ru', 'en']) {
    const q = `${p} телефон, ${lang}`;
    const context = await newDeviceContext(browser, VIEWPORTS.phone, lang);
    const game = await openGame(context, baseUrl, q, { speed: 2, isTouch: true, cfg: `waves.firstDelaySec:1,waves.list.0.coccus:6,${FIXED_BALANCE.join(',')}` });
    const { page } = game;
    // горизонтально: подсказки нет, время идёт (ждём, пока на карте появятся бактерии: без них «стоят» было бы пустой проверкой)
    await waitFor(page, (x) => x.bacteria.length >= 2, WAIT_MS, 'бактерии на карте');
    let m = await measureCanvas(page);
    let info = await rotateInfo(page);
    const e0 = (await getState(page)).elapsed;
    await sleep(1200);
    const e1 = (await getState(page)).elapsed;
    check(`${q}, горизонтально 844×390: подсказки «Поверните телефон» нет, игровое время идёт`, info.display === 'none' && e1 > e0 + 0.3 && layoutOk(m), `display=${info.display}, pointer:coarse=${info.coarse}, время ${f2(e0)} → ${f2(e1)}`);
    // вертикально: подсказка на весь экран, текст на нужном языке, время и бактерии стоят, касания в игру не попадают
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1500);
    info = await rotateInfo(page);
    check(`${q}, вертикально 390×844: подсказка показана на весь экран, текст «${ROTATE_TEXT[lang]}» влезает в экран`, info.display === 'flex' && info.full && info.text === ROTATE_TEXT[lang] && info.textInside, `display=${info.display}, на весь экран ${info.full}, текст «${info.text}», влезает ${info.textInside}`);
    await sleep(300);
    await shot(page, `phone-portrait-${lang}`);
    const a = await getState(page);
    const selected = await towerTap(game);
    const pauseBtn = a.ui.pauseButton;
    const pc = await page.evaluate(([x, y]) => window.__pvb.gameToClient(x, y), [pauseBtn.x, pauseBtn.y]);
    await page.touchscreen.tap(pc.x, pc.y);
    await sleep(300);
    const afterPause = (await getState(page)).state;
    await sleep(1200);
    const b = await getState(page);
    const same = a.bacteria.length === b.bacteria.length && a.bacteria.every((x, i) => x.id === b.bacteria[i].id && Math.abs(x.x - b.bacteria[i].x) < 0.01 && Math.abs(x.y - b.bacteria[i].y) < 0.01);
    check(`${q}, вертикально: игровое время и бактерии стоят (за 1,5 с ничего не сдвинулось)`, b.elapsed === a.elapsed && b.spawned === a.spawned && same && b.bacteria.length > 0, `время ${f2(a.elapsed)} → ${f2(b.elapsed)}, вышло ${a.spawned} → ${b.spawned}, бактерий ${b.bacteria.length}`);
    check(`${q}, вертикально: тапы по месту, где под подсказкой лежат кнопки башни и паузы, ничего не делают (башня не выбрана, паузы нет)`, selected === null && afterPause === 'playing', `башня выбрана: ${selected}, состояние после тапа по паузе: ${afterPause}`);
    // обратно в горизонталь
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(1500);
    m = await measureCanvas(page);
    info = await rotateInfo(page);
    // если тапы сквозь подсказку что-то включили (пауза, выбор башни), приводим игру в исходное состояние, чтобы следующие проверки не зависели от этого
    let back = await getState(page);
    if (back.state === 'paused') {
      await sleep(300);
      await page.touchscreen.tap(...Object.values(await page.evaluate(() => window.__pvb.gameToClient(500, 300))));
      await sleep(300);
      back = await getState(page);
    }
    if (back.selected) await towerTap(game);
    const c0 = (await getState(page)).elapsed;
    await sleep(1200);
    const c1 = (await getState(page)).elapsed;
    check(`${q}, снова горизонтально: подсказка пропала, экран перестроился, игровое время пошло дальше`, info.display === 'none' && layoutOk(m) && c1 > c0 + 0.3, `display=${info.display}, время ${f2(c0)} → ${f2(c1)}`);
    check(`${q}, снова горизонтально: тап по кнопке башни попадает в кнопку (выбор и снятие выбора)`, (await towerTap(game)) === 'pill' && (await towerTap(game)) === null);
    if (lang === 'ru') {
      await page.setViewportSize({ width: 667, height: 375 });
      await sleep(1200);
      m = await measureCanvas(page);
      info = await rotateInfo(page);
      check(`${q}, меньший горизонтальный телефон 667×375: экран 16:9 перестроился, подсказки нет`, layoutOk(m) && info.display === 'none', `пропорции ${m.ratio.toFixed(3)}, display=${info.display}`);
    }
    await context.close();
  }
  // ---- компьютер (мышь): подсказки нет никогда, даже в узком «вертикальном» окне; время идёт
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 2, cfg: 'waves.firstDelaySec:60' });
  for (const [w, h] of [[1600, 600], [800, 900], [1280, 720]]) {
    await game.page.setViewportSize({ width: w, height: h });
    await sleep(1200);
    const m = await measureCanvas(game.page);
    const info = await rotateInfo(game.page);
    const e0 = (await getState(game.page)).elapsed;
    await sleep(800);
    const e1 = (await getState(game.page)).elapsed;
    check(`${p} компьютер, окно ${w}×${h}${h > w ? ' (вертикальное)' : ''}: экран 16:9 перестроился, подсказки «Поверните телефон» нет, время идёт`, layoutOk(m) && info.display === 'none' && !info.coarse && e1 > e0 + 0.2, `пропорции ${m.ratio.toFixed(3)}, помещается ${m.fits}, по центру ${m.centred}, display=${info.display}, pointer:coarse=${info.coarse}`);
    if (w === 1600) {
      await shot(game.page, 'desktop-wide-ru');
      // мышь отпущена за пределами экрана игры (в чёрной полосе сбоку): сдвиг заканчивается и не «залипает»
      const r = await game.page.evaluate(() => {
        const box = document.querySelector('canvas').getBoundingClientRect();
        return { left: box.left, width: box.width };
      });
      const cam = async () => (await getState(game.page)).camera;
      const c0 = await cam();
      await game.page.mouse.move(r.left + 200, 300);
      await game.page.mouse.down();
      await game.page.mouse.move(r.left + 100, 300, { steps: 3 });
      await game.page.mouse.move(100, 300, { steps: 3 });
      await game.page.mouse.up();
      await sleep(200);
      const c1 = await cam();
      await game.page.mouse.move(r.left + 300, 300, { steps: 3 });
      await game.page.mouse.move(r.left + 500, 320, { steps: 5 });
      await sleep(200);
      const c2 = await cam();
      check(`${p} компьютер: мышь, отпущенная за пределами экрана игры, не оставляет «залипший» сдвиг`, Math.abs(c1.cx - c0.cx) > 50 && Math.abs(c2.cx - c1.cx) < 0.01 && Math.abs(c2.cy - c1.cy) < 0.01, `при перетаскивании сдвиг ${f1(c1.cx - c0.cx)} px, после отпускания камера ${f1(c2.cx - c1.cx)} px`);
    }
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
  const hostile = 'waves.firstDelaySec:0.01,waves.intervalStartSec:0.05,waves.intervalEndSec:0.05,waves.list.0.coccus:30,bacteria.baseSpeed:6000,lives.start:1';
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

  // Подсказка «Поверните телефон» есть и в игровой сборке
  const portrait = await context.newPage();
  watchConsole(portrait, p);
  await portrait.setViewportSize({ width: 390, height: 844 });
  await portrait.goto(prodUrl, { waitUntil: 'load' });
  await sleep(1500);
  const rot = await rotateInfo(portrait);
  check(`${p} телефон вертикально: показана подсказка «${ROTATE_TEXT.ru}»`, rot.display === 'flex' && rot.full && rot.text === ROTATE_TEXT.ru && rot.textInside, `display=${rot.display}, текст «${rot.text}»`);
  await shot(portrait, 'production-portrait');
  await portrait.close();

  const assets = path.join(ROOT, 'dist', 'assets');
  const bundle = fs.readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
  check(`${p} в собранной игре нет ни следа интерфейса проверок (строка __pvb)`, !bundle.includes('__pvb'), bundle.includes('__pvb') ? 'строка __pvb найдена в dist/assets' : '');
  await context.close();
}

// ================================================================== запуск

// ================================================================== сеть дорожек: структура и движение бактерий по графу

/** Играет до конца партии или до условия: на каждом замере зовёт fn(s); true — остановиться. Возвращает последнее состояние. */
async function pollUntil(game, fn, timeoutMs = WAIT_MS, pollMs = 30) {
  const started = Date.now();
  let s = await game.state();
  while (Date.now() - started < timeoutMs) {
    s = await game.state();
    if ((await fn(s)) === true) return s;
    await sleep(pollMs);
  }
  return s;
}

/** Без потери жизней: все типы бактерий с нулевым уроном организму (партия не кончается проигрышем). */
const NO_LIFE_LOSS = KINDS.map((k) => `types.${k}.lifeDamage:0`).join(',');

async function runGraph(browser, baseUrl) {
  const p = '[граф дорожек]';
  // ---- A. структура сети (по данным, которые отдала игра)
  const worldW = MAP.orgW + LEVEL.cols * MAP.tile;
  const edges = GRAPH.edges;
  const forks = Object.entries(GEO.outOf).filter(([, v]) => v.length > 1).map(([k]) => k);
  const merges = Object.entries(GEO.inTo).filter(([, v]) => v.length > 1).map(([k]) => k);
  check(`${p} сеть: 18 рёбер, 3 входа, 3 выхода, 4 развилки, 5 слияний`, edges.length === 18 && GRAPH.entrances.length === 3 && GRAPH.exits.length === 3 && forks.length === 4 && merges.length === 5, `рёбер ${edges.length}, входов ${GRAPH.entrances.length}, выходов ${GRAPH.exits.length}, развилки ${forks.join(',')}, слияния ${merges.join(',')}`);
  check(`${p} входы начинаются за правым краем мира (x > ${worldW}), выходы кончаются за красной линией слева (x < ${MAP.orgW})`, GRAPH.entrances.every((id) => GEO.byId.get(id).pts[0][0] > worldW) && edges.filter((e) => !(GEO.outOf[e.to] ?? []).length).every((e) => e.pts[e.pts.length - 1][0] < MAP.orgW), `входы x: ${GRAPH.entrances.map((id) => Math.round(GEO.byId.get(id).pts[0][0])).join(', ')}`);
  let joinBad = 0;
  for (const e of edges) {
    for (const nextId of GEO.outOf[e.to] ?? []) {
      const a = e.pts[e.pts.length - 1];
      const b = GEO.byId.get(nextId).pts[0];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) joinBad++;
    }
  }
  check(`${p} рёбра стыкуются в узлах (конец ребра совпадает с началом следующего, ≤ 1 px)`, joinBad === 0, `не сошлись: ${joinBad}`);
  const backwardEdges = edges.filter((e) => e.pts.some((q, i) => i > 0 && q[0] > e.pts[i - 1][0] + 0.01));
  check(`${p} каждое ребро идёт только влево (x не растёт) — бактерии не возвращаются`, backwardEdges.length === 0, backwardEdges.map((e) => e.id).join(','));
  const lenBad = edges.filter((e) => Math.abs(e.pts.reduce((sum, q, i) => (i ? sum + Math.hypot(q[0] - e.pts[i - 1][0], q[1] - e.pts[i - 1][1]) : 0), 0) - e.length) > e.length * 0.005);
  check(`${p} длина каждого ребра равна длине его кривой (±0,5%)`, lenBad.length === 0, lenBad.map((e) => e.id).join(','));
  let deadEnds = 0;
  const walk = (id, depth) => {
    if (depth > 12) return void deadEnds++;
    const next = GEO.outOf[GEO.byId.get(id).to] ?? [];
    if (next.length === 0 && !GRAPH.exits.includes(GEO.byId.get(id).to)) deadEnds++;
    for (const n of next) walk(n, depth + 1);
  };
  for (const id of GRAPH.entrances) walk(id, 0);
  check(`${p} из каждого входа все пути кончаются выходом, циклов нет`, deadEnds === 0, `тупиков или циклов: ${deadEnds}`);

  // ---- B. 100 бактерий без башен: по каким рёбрам они идут
  const N = 100;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const cfg = `waves.total:1,waves.list.0.coccus:${N},waves.intervalStartSec:0.3,waves.intervalEndSec:0.3,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}`;
  const game = await openGame(context, baseUrl, p, { speed: 6, cfg });
  const traces = new Map();
  const s = await pollUntil(game, (x) => {
    recordTraces(traces, x);
    return x.state === 'won' || x.state === 'lost';
  }, 180000, 20);
  check(`${p} ${N} бактерий вышли и дошли до организма (партия закончилась победой, жизни целы)`, s.state === 'won' && s.spawned === N && s.leaked === N && s.kills === 0 && s.lives === CFG.lives, `состояние ${s.state}, вышло ${s.spawned}, дошло ${s.leaked}, жизни ${s.lives}`);
  const a = analyzeTraces(traces, { ...speedBounds(), worldW: s.map.worldW });
  check(`${p} бактерии лежат на кривой своего ребра (отклонение ≤ 0,5 px), s внутри ребра`, a.bacteria === N && a.maxDev <= 0.5 && a.outOfEdge === 0, `записано ${a.bacteria}, макс. отклонение ${f2(a.maxDev)} px, вне ребра ${a.outOfEdge} из ${a.samples} замеров`);
  check(`${p} ребро меняется только на следующее по графу (неверных переходов 0), назад не ходят, все идут влево, скорость кокка в норме`, a.badTransition === 0 && a.backwards === 0 && a.leftwards === N && a.badSpeed === 0, `неверных переходов ${a.badTransition}, назад ${a.backwards}, идут влево ${a.leftwards}/${N}, скорость ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])}, вне нормы ${a.badSpeed}`);
  // входы: каждый используется, доли не вырождены (каждая не меньше 40% от равной: при 100 бактериях срабатывание случайно ≈ 10⁻⁴)
  const entrCounts = GRAPH.entrances.map((id) => a.entrances[id] ?? 0);
  const entrMin = 0.4 * (N / GRAPH.entrances.length);
  check(`${p} все три входа используются, выбор входа случайный: ${entrCounts.join(' / ')} из ${N} (каждый ≥ ${Math.ceil(entrMin)})`, a.startedAtEntrance === N && entrCounts.every((n) => n >= entrMin), `входные рёбра ${GRAPH.entrances.join(',')}: ${entrCounts.join(' / ')}`);
  // развилки: считаем по цепочкам рёбер, выбор выхода случайный и поровну
  const forkCounts = {};
  for (const chain of a.edgeChain) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const node = GEO.byId.get(chain[i]).to;
      if ((GEO.outOf[node] ?? []).length > 1) {
        forkCounts[node] ??= {};
        forkCounts[node][chain[i + 1]] = (forkCounts[node][chain[i + 1]] ?? 0) + 1;
      }
    }
  }
  const forkReport = [];
  let forksOk = forks.length > 0;
  for (const node of forks) {
    const outs = GEO.outOf[node];
    const counts = outs.map((id) => forkCounts[node]?.[id] ?? 0);
    const passes = counts.reduce((x, y) => x + y, 0);
    const minShare = 0.4 * (passes / outs.length);
    if (passes < 15 || counts.some((n) => n < minShare)) forksOk = false;
    forkReport.push(`${node}: ${counts.join('/')} из ${passes}`);
  }
  check(`${p} на каждой из 4 развилок встречаются все выходы, доли не вырождены (каждая ≥ 40% от равной): ${forkReport.join('; ')}`, forksOk, forkReport.join('; '));
  const exitIds = edges.filter((e) => !(GEO.outOf[e.to] ?? []).length).map((e) => e.id);
  const exitCounts = exitIds.map((id) => a.exits[id] ?? 0);
  const exitMin = 0.4 * (N / exitIds.length);
  check(`${p} достигаются все три выхода к организму: ${exitCounts.join(' / ')} (каждый ≥ ${Math.ceil(exitMin)})`, exitCounts.every((n) => n >= exitMin), `выходные рёбра ${exitIds.join(',')}: ${exitCounts.join(' / ')}`);
  const usedEdges = new Set(a.edgeChain.flat());
  check(`${p} за партию бактерии побывали на всех ${edges.length} рёбрах сети`, usedEdges.size === edges.length, `побывали на ${usedEdges.size} из ${edges.length}; не было на: ${edges.filter((e) => !usedEdges.has(e.id)).map((e) => e.id).join(',') || '—'}`);
  await context.close();
}

// ================================================================== палочка: рывки

async function runDash(browser, baseUrl) {
  const p = '[палочка: рывки]';
  const every = readConfigNumber('rod', 'dashEverySec');
  const dashSec = readConfigNumber('rod', 'dashSec');
  const factor = readConfigNumber('rod', 'dashFactor');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const RODS = 6;
  const cfg = `waves.total:1,waves.list.0.coccus:3,waves.list.0.rod:${RODS},waves.intervalStartSec:1.5,waves.intervalEndSec:1.5,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},types.rod.speedFactor:1,${NO_LIFE_LOSS}`;
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg });
  const traces = new Map();
  const final = await pollUntil(game, (x) => {
    recordTraces(traces, x);
    return x.state === 'won' || x.state === 'lost';
  }, 180000, 20);
  // скорости по парам замеров: обычная и рывок (оба замера в одном состоянии, скорость считаем по пути вдоль рёбер)
  const prog = (prev, cur) => {
    if (cur.edge === prev.edge) return cur.s - prev.s;
    const pe = GEO.byId.get(prev.edge);
    return pe.to === GEO.byId.get(cur.edge).from ? pe.length - prev.s + cur.s : null;
  };
  const speeds = { normal: [], dash: [] };
  const runs = []; // по палочкам: списки рывков { start, end }
  const cocciDashing = [];
  for (const [, tr] of traces) {
    const kind = tr[0].kind;
    if (kind !== 'rod') {
      if (tr.some((q) => q.dashing)) cocciDashing.push(tr[0].kind);
      continue;
    }
    const rodRuns = [];
    let open = null;
    for (let i = 0; i < tr.length; i++) {
      if (tr[i].dashing && !open) open = { start: tr[i].e, end: tr[i].e, first: i === 0 };
      else if (tr[i].dashing && open) open.end = tr[i].e;
      else if (!tr[i].dashing && open) {
        rodRuns.push({ ...open, closed: true });
        open = null;
      }
      if (i > 0 && tr[i].dashing === tr[i - 1].dashing && tr[i].e - tr[i - 1].e >= 0.05) {
        const d = prog(tr[i - 1], tr[i]);
        if (d !== null) speeds[tr[i].dashing ? 'dash' : 'normal'].push(d / (tr[i].e - tr[i - 1].e));
      }
    }
    runs.push(rodRuns);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const normal = median(speeds.normal);
  const dash = median(speeds.dash);
  const ratio = normal > 0 ? dash / normal : 0;
  check(`${p} ${RODS} палочек прошли путь до организма (партия окончена: ${final.state}, жизни целы)`, final.state === 'won' && final.spawned === RODS + 3 && final.lives === CFG.lives, `состояние ${final.state}, вышло ${final.spawned}, жизни ${final.lives}`);
  check(`${p} рывок ускоряет палочку в ${factor} раза: обычная скорость ${f1(normal)} px/с (${speeds.normal.length} замеров), в рывке ${f1(dash)} px/с (${speeds.dash.length} замеров), отношение ${f2(ratio)}`, speeds.dash.length >= 10 && speeds.normal.length >= 30 && Math.abs(ratio - factor) <= 0.35, `отношение ${f2(ratio)}, ждали ${factor} ±0,35`);
  const complete = runs.flatMap((r) => r.filter((q) => q.closed && !q.first));
  const lens = complete.map((q) => q.end - q.start);
  check(`${p} рывок длится ≈ ${dashSec} с (замерено ${f2(mean(lens))} с по ${lens.length} рывкам; допуск: шаг замеров ≈ 0,2–0,3 с)`, lens.length >= 8 && Math.abs(mean(lens) - dashSec) <= 0.45 && lens.every((x) => x <= dashSec + 0.6), `длительности: ${lens.map(f2).join(', ')}`);
  const gaps = [];
  for (const r of runs) for (let i = 1; i < r.length; i++) gaps.push(r[i].start - r[i - 1].start);
  check(`${p} рывки повторяются каждые ≈ ${every} с (по ${gaps.length} интервалам среднее ${f2(mean(gaps))} с)`, gaps.length >= 8 && Math.abs(mean(gaps) - every) <= 0.4, `интервалы: ${gaps.map(f2).join(', ')}`);
  // у каждой палочки свой сдвиг часов: фазы начала рывка по модулю периода различаются
  const phases = runs.filter((r) => r.length).map((r) => ((r[0].start % every) + every) % every);
  // наименьшая дуга круга периода, содержащая все фазы: если все рывки идут «в ногу», дуга узкая
  const sorted = [...phases].sort((x, y) => x - y);
  const gapsCirc = sorted.map((v, i) => (i + 1 < sorted.length ? sorted[i + 1] - v : sorted[0] + every - v));
  const arc = sorted.length > 1 ? every - Math.max(...gapsCirc) : 0;
  check(`${p} у палочек разные сдвиги часов: фазы рывков ${phases.map(f2).join(', ')}; наименьшая дуга, в которую они все помещаются, ${f2(arc)} с из ${every} (ждём ≥ 0,45)`, phases.length >= 5 && arc >= 0.45, `дуга ${f2(arc)} с`);
  check(`${p} у кокков рывков нет (dashing всегда false)`, cocciDashing.length === 0, cocciDashing.length ? `рывки у ${cocciDashing.length} кокков` : '');
  await context.close();

  // скриншот палочки в рывке (отдельный прогон: нужна палочка в кадре)
  const c2 = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const g2 = await openGame(c2, baseUrl, p, { speed: 2, cfg: `waves.total:1,waves.list.0.coccus:0,waves.list.0.rod:3,waves.intervalStartSec:1,waves.intervalEndSec:1,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
  let got = false;
  const t0 = Date.now();
  while (!got && Date.now() - t0 < 60000) {
    const x = await g2.state();
    const rod = x.bacteria.find((b) => {
      const sx = x.viewW / 2 + (b.x - x.camera.cx) * x.camera.zoom;
      const sy = x.height / 2 + (b.y - x.camera.cy) * x.camera.zoom;
      return b.kind === 'rod' && b.dashing && sx > 120 && sx < 960 && sy > 80 && sy < 640;
    });
    if (rod) {
      await shot(g2.page, 'dash-01-rod-dashing');
      got = true;
    }
    await sleep(30);
  }
  check(`${p} скриншот палочки в рывке сделан (палочка в кадре)`, got);
  await c2.close();
}

// ================================================================== делящаяся

/**
 * Два кокка от одной делящейся: первый — на месте гибели, второй — вперёд по дорожке (может оказаться на следующем ребре).
 * Возвращает расстояние вдоль дорожки (null, если рёбра не соседние) и прямое расстояние между центрами.
 */
function splitPair(a, b) {
  const [k1, k2] = a.id < b.id ? [a, b] : [b, a];
  const chord = Math.hypot(k1.x - k2.x, k1.y - k2.y);
  let along = null;
  if (k1.edge === k2.edge) along = k2.s - k1.s;
  else {
    const e1 = GEO.byId.get(k1.edge);
    if (e1.to === GEO.byId.get(k2.edge).from) along = e1.length - k1.s + k2.s;
  }
  return { k1, k2, chord, along, crossed: k1.edge !== k2.edge };
}

async function runSplit(browser, baseUrl) {
  const p = '[делящаяся]';
  const count = readConfigNumber('splitter', 'splitCount');
  const gap = readConfigNumber('splitter', 'splitGapPx');
  const reward = readConfigNumber('splitter', 'reward');
  const SPL = 4;
  const base = `waves.total:1,waves.list.0.coccus:0,waves.list.0.splitter:${SPL},waves.intervalStartSec:3,waves.intervalEndSec:3,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}`;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');

  // ---- A. башня убивает делящихся: на месте гибели появляются кокки
  let game = await openGame(context, baseUrl, p, { speed: 2, cfg: `${base},towers.pill.range:450,economy.startCoins:${BASE.price}` });
  await game.placeTowers([FREE.a]);
  const seen = new Set();
  let splitters = new Map();
  let prev = await game.state();
  const events = [];
  let shotTaken = false;
  let childKills = 0;
  const end = await pollUntil(game, async (s) => {
    const ids = new Set(s.bacteria.map((b) => b.id));
    if (s.splits > prev.splits) {
      const parents = [...splitters.values()].filter((q) => !ids.has(q.id));
      const kids = s.bacteria.filter((b) => !seen.has(b.id) && b.kind === 'coccus');
      events.push({ parent: parents[0], kids, coinsDelta: s.coins - prev.coins, killsDelta: s.kills - prev.kills, elapsed: s.elapsed });
      const k0 = kids[0];
      if (!shotTaken && k0) {
        const sx = s.viewW / 2 + (k0.x - s.camera.cx) * s.camera.zoom;
        const sy = s.height / 2 + (k0.y - s.camera.cy) * s.camera.zoom;
        if (sx > 100 && sx < 980 && sy > 60 && sy < 660) {
          await shot(game.page, 'split-01-after-split');
          shotTaken = true;
        }
      }
    } else if (s.kills > prev.kills) {
      // гибель кокка (делящейся в этом кадре не было): +10
      childKills++;
      events.push({ kill: 'coccus', coinsDelta: s.coins - prev.coins, killsDelta: s.kills - prev.kills });
    }
    for (const b of s.bacteria) seen.add(b.id);
    splitters = new Map(s.bacteria.filter((b) => b.kind === 'splitter').map((b) => [b.id, b]));
    prev = s;
    return s.state === 'won' || s.state === 'lost';
  }, 240000, 25);
  const splitEvents = events.filter((e) => e.parent !== undefined || e.kids);
  check(`${p} башня убила делящихся: распадов ${end.splits} из ${SPL} (хотя бы один)`, end.splits >= 1, `распадов ${end.splits}, убито ${end.kills}, дошло ${end.leaked}`);
  const ev = splitEvents[0];
  if (ev) {
    const e0 = ev.parent;
    check(`${p} при гибели делящейся сразу появляются ${count} кокка(ов): сейчас ${ev.kids.length}`, ev.kids.length === count, `появилось ${ev.kids.length}, ждали ${count}`);
    const pair = ev.kids.length >= 2 ? splitPair(ev.kids[0], ev.kids[1]) : null;
    const first = pair?.k1;
    const onSpot = Boolean(e0 && first && (first.edge === e0.edge ? Math.abs(first.s - e0.s) <= 40 : GEO.byId.get(e0.edge).to === GEO.byId.get(first.edge).from));
    check(`${p} первый кокк появляется на месте гибели делящейся (ребро ${e0?.edge}, s ${f1(e0?.s)} → ребро ${first?.edge}, s ${f1(first?.s)}; допуск 40 px на ход между замерами)`, onSpot, `ребро делящейся ${e0?.edge}, кокка ${first?.edge}`);
    check(`${p} второй кокк — на ${gap} px ВПЕРЁД по дорожке (вдоль дорожки ${f1(pair?.along)} px, допуск ±8), прямое расстояние ${f1(pair?.chord)} px ≥ 38`, pair && pair.along !== null && Math.abs(pair.along - gap) <= 8 && pair.along > 0 && pair.chord >= 38, pair ? `ребро первого ${pair.k1.edge}, второго ${pair.k2.edge}` : 'кокков меньше двух');
    check(`${p} награда за делящуюся ${reward} монет, +1 к счётчику распадов (монеты ${ev.coinsDelta}, убито ${ev.killsDelta})`, ev.coinsDelta === reward && ev.killsDelta === 1, `монеты +${ev.coinsDelta}, убито +${ev.killsDelta}`);
  } else {
    check(`${p} распад делящейся наблюдался (есть событие распада)`, false, 'не было ни одного распада');
  }
  const coccusKills = events.filter((e) => e.kill === 'coccus');
  check(`${p} за каждого убитого кокка 10 монет (убито кокков ${coccusKills.length})`, coccusKills.every((e) => e.coinsDelta === BASE.reward && e.killsDelta === 1), coccusKills.map((e) => `+${e.coinsDelta}`).join(' '));
  check(`${p} учёт: убитые + дошедшие = вышедшие + ${count}·распады (${end.kills} + ${end.leaked} = ${end.spawned} + ${count}·${end.splits}); партия окончена`, end.kills + end.leaked === end.spawned + count * end.splits && end.state === 'won', `состояние ${end.state}`);
  check(`${p} монеты сходятся: ${reward}·распады + ${BASE.reward}·убитые кокки = ${end.coins}`, end.coins === reward * end.splits + BASE.reward * (end.kills - end.splits), `монет ${end.coins}, распадов ${end.splits}, убито ${end.kills}`);
  await game.page.close();

  // ---- B. без башен делящаяся не делится сама
  game = await openGame(context, baseUrl, p, { speed: 4, cfg: base });
  let coccusSeen = false;
  const endB = await pollUntil(game, (s) => {
    if (s.bacteria.some((b) => b.kind === 'coccus')) coccusSeen = true;
    return s.state === 'won' || s.state === 'lost';
  }, 240000, 25);
  check(`${p} если делящуюся не убивать, она не делится: кокков не появилось, распадов ${endB.splits}, прошло ${f1(endB.elapsed)} с игры`, !coccusSeen && endB.splits === 0 && endB.leaked === SPL && endB.elapsed > 25, `кокки видели: ${coccusSeen}, дошло ${endB.leaked}/${SPL}`);
  await game.page.close();

  // ---- C. регрессия: много распадов подряд, ни в одном кокки не слипаются (раньше у конца ребра было 25 и 34 px вместо 44)
  const MANY = 40;
  game = await openGame(context, baseUrl, p, { speed: 4, cfg: `waves.total:1,waves.list.0.coccus:0,waves.list.0.splitter:${MANY},waves.intervalStartSec:0.8,waves.intervalEndSec:0.8,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS},towers.pill.range:1400,towers.pill.cooldownMs:300,economy.startCoins:${BASE.price * 7}` });
  await game.placeTowers(Object.values(FREE));
  const seenC = new Set();
  const pairs = [];
  const singles = []; // делящаяся погибла у самого организма: второй кокк «впереди» оказался за красной линией и сразу дошёл до организма
  let prevC = await game.state();
  const endC = await pollUntil(game, (x) => {
    if (x.splits > prevC.splits) {
      const kids = x.bacteria.filter((b) => !seenC.has(b.id) && b.kind === 'coccus').sort((a, b) => a.id - b.id);
      for (let i = 0; i < kids.length; i++) {
        if (kids[i + 1] && kids[i + 1].id === kids[i].id + 1) {
          pairs.push(splitPair(kids[i], kids[i + 1]));
          i++;
        } else singles.push(kids[i]);
      }
    }
    for (const b of x.bacteria) seenC.add(b.id);
    prevC = x;
    return x.state === 'won' || x.state === 'lost';
  }, 300000, 20);
  const chords = pairs.map((q) => q.chord);
  const alongs = pairs.map((q) => q.along);
  const minChord = Math.min(...chords);
  const crossed = pairs.filter((q) => q.crossed).length;
  check(`${p} регрессия: ${pairs.length} распадов подряд (башни с дальностью 1400), ни в одном кокки не слипаются: наименьшее прямое расстояние ${f1(minChord)} px ≥ 38 (раньше было 25 и 34)`, pairs.length >= 20 && minChord >= 38, `распадов ${pairs.length}, прямые расстояния: ${chords.map((c) => Math.round(c)).join(',')}`);
  check(`${p} регрессия: во всех ${pairs.length} распадах второй кокк ровно на ${gap} px вперёд по дорожке (вдоль дорожки ${f1(Math.min(...alongs))}…${f1(Math.max(...alongs))}, допуск ±8); на следующем ребре оказался в ${crossed} распадах`, pairs.length >= 20 && alongs.every((a) => a !== null && Math.abs(a - gap) <= 8), `вдоль дорожки: ${alongs.map((a) => (a === null ? '—' : Math.round(a))).join(',')}`);
  const orgLimit = MAP.orgW + readConfigNumber('coccus', 'radius') + gap + 20;
  check(`${p} регрессия: если делящаяся погибла у самого организма (ближе ${gap} px до красной линии), второй кокк сразу доходит до организма — таких распадов ${singles.length}, у всех первый кокк правее линии не дальше x = ${orgLimit}`, singles.every((k) => k.x <= orgLimit), singles.map((k) => Math.round(k.x)).join(','));
  check(`${p} регрессия: каждый распад виден проверке (${pairs.length} пар + ${singles.length} у организма = ${endC.splits} распадов), партия окончена победой`, endC.state === 'won' && pairs.length + singles.length === endC.splits, `состояние ${endC.state}, распадов ${endC.splits}, убито делящихся не больше ${endC.spawned}`);
  check(`${p} учёт при распадах у организма: убитые + дошедшие = вышедшие + ${count}·распады (${endC.kills} + ${endC.leaked} = ${endC.spawned} + ${count}·${endC.splits})`, endC.kills + endC.leaked === endC.spawned + count * endC.splits, `убито ${endC.kills}, дошло ${endC.leaked}, вышло ${endC.spawned}, распадов ${endC.splits}, лишних ${endC.kills + endC.leaked - endC.spawned - count * endC.splits}`);
  await context.close();
}

// ================================================================== спора: глушение башен

/** Свободная клетка ближе всего к «стволу» (узлу с тремя выходами): каждая бактерия проходит рядом с ней. */
function nearTrunkCell() {
  const trunk = Object.entries(GEO.outOf).find(([, v]) => v.length === 3);
  const z = GEO.byId.get(trunk[1][0]).pts[0];
  let best = null;
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      const d = Math.hypot(c.x - z[0], c.y - z[1]);
      if (!best || d < best.d) best = { col, row, d };
    }
  }
  return best;
}
/** Свободная клетка дальше всех от любых дорожек (башня там не достаёт ни до какой бактерии и не глушится). */
function farCell() {
  let best = null;
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      const d = Math.min(...GRAPH.edges.map((e) => GEO.distToEdge(c, e.id)));
      if (!best || d > best.d) best = { col, row, d };
    }
  }
  return best;
}

async function sporeGame(context, baseUrl, p, { radius = null, far = false, minZoom = false }) {
  const extra = radius ? `,types.spore.disableRadius:${radius}` : '';
  const cfg = `waves.total:1,waves.list.0.coccus:6,waves.list.0.spore:1,waves.intervalStartSec:1.2,waves.intervalEndSec:1.2,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},towers.pill.damage:0,economy.startCoins:${BASE.price * (far ? 2 : 1)},${NO_LIFE_LOSS}${extra}`;
  const game = await openGame(context, baseUrl, p, { speed: 2, cfg });
  if (minZoom) {
    for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500);
  } else {
    await game.input.drag(game.g(40, 360), game.g(1040, 360)); // карта до левого края: видны «ствол» и организм
  }
  await settle();
  const near = nearTrunkCell();
  await game.placeTowers(far ? [[near.col, near.row], [farCell().col, farCell().row]] : [[near.col, near.row]]);
  return { game, near };
}

async function runSpore(browser, baseUrl) {
  const p = '[спора]';
  const disableSec = readConfigNumber('spore', 'disableSec');
  const disableRadius = readConfigNumber('spore', 'disableRadius');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');

  /** Играет партию и следит за башней №0 и спорой. */
  const watch = async (game, radius, { shotName = null, tail = 5 } = {}) => {
    const log = [];
    let prev = await game.state();
    let shotDone = false;
    let offAt = null;
    const end = await pollUntil(game, async (s) => {
      const tower = s.towers[0];
      const spore = s.bacteria.find((b) => b.kind === 'spore');
      const dist = tower && spore ? Math.hypot(spore.x - tower.x, spore.y - tower.y) : null;
      log.push({ e: s.elapsed, shots: s.shots, disabled: tower?.disabled ?? false, far: s.towers[1]?.disabled ?? false, disables: s.disables, zaps: s.effects.zaps, dist, prevDist: log.length ? log[log.length - 1].dist : null });
      if (shotName && !shotDone && tower?.disabled) {
        await shot(game.page, shotName);
        shotDone = true;
      }
      prev = s;
      // дальше смотреть незачем: башня включилась и прошло ещё tail секунд (или партия кончилась)
      if (offAt === null && log.some((q) => q.disabled) && !tower?.disabled) offAt = s.elapsed;
      return s.state === 'won' || s.state === 'lost' || (offAt !== null && s.elapsed > offAt + tail);
    }, 240000, 20);
    return { log, end };
  };
  const timeline = (log) => {
    const on = log.findIndex((q) => q.disabled);
    const off = on >= 0 ? log.findIndex((q, i) => i > on && !q.disabled) : -1;
    return { on, off };
  };

  // ---- S1: одна башня у «ствола», глушение по таймеру (зум 1, карта у организма)
  let { game, near } = await sporeGame(context, baseUrl, p, {});
  const r1 = await watch(game, disableRadius, { shotName: 'spore-01-tower-disabled' });
  let { on, off } = timeline(r1.log);
  const L = r1.log;
  check(`${p} спора, подойдя ближе ${disableRadius} px к башне у «ствола» (клетка ${near.col};${near.row}), глушит её: disables = 1, башня disabled, красное кольцо сработало (zaps ${L[on]?.zaps})`, on >= 0 && L[on].disables === 1 && L[on].zaps === 1, on >= 0 ? `на замере ${on}: disables ${L[on].disables}, zaps ${L[on].zaps}` : 'башня не была заглушена');
  const dOn = L[on]?.dist;
  check(`${p} глушение срабатывает на расстоянии ≤ ${disableRadius} px (на замере ${f1(dOn)} px, за замер до этого ${f1(L[on]?.prevDist)} px)`, on > 0 && dOn <= disableRadius + 0.5 && dOn >= disableRadius - 70 && L[on].prevDist > disableRadius - 0.5, `расстояние ${f1(dOn)}, раньше ${f1(L[on]?.prevDist)}`);
  const dur = off >= 0 ? L[off].e - L[on].e : -1;
  check(`${p} башня заглушена ≈ ${disableSec} с (замерено ${f2(dur)} с, допуск ±0,4)`, off > on && Math.abs(dur - disableSec) <= 0.4, `с ${f2(L[on]?.e)} по ${f2(L[off]?.e)}`);
  check(`${p} пока башня заглушена, её выстрелы не растут (выстрелов ${L[on]?.shots} → ${L[off - 1]?.shots}), а до и после глушения она стреляла`, on > 0 && off > on && L[off - 1].shots === L[on].shots && L[on].shots > 0 && L[L.length - 1].shots > L[off].shots, `до: ${L[on]?.shots}, в конце: ${L[L.length - 1].shots}`);
  check(`${p} спора глушит башню один раз, кольцо глушения сработало один раз (disables = ${r1.end.disables}, zaps = ${r1.end.effects.zaps}) и ещё 5 с после включения башни`, r1.end.disables === 1 && r1.end.effects.zaps === 1, `состояние ${r1.end.state}`);
  await game.page.close();

  // ---- S2: у «ствола» и далеко от дорожек (мин. приближение): дальняя башня не глушится
  ({ game, near } = await sporeGame(context, baseUrl, p, { far: true, minZoom: true }));
  const far = farCell();
  const r2 = await watch(game, disableRadius);
  check(`${p} башня вдали от дорожек (клетка ${far.col};${far.row}, до ближайшей дорожки ${Math.round(far.d)} px) не глушится ни разу, глушится только башня у «ствола»`, r2.log.every((q) => !q.far) && r2.end.disables === 1 && r2.log.some((q) => q.disabled), `disables ${r2.end.disables}, дальняя заглушена: ${r2.log.some((q) => q.far)}`);
  await game.page.close();

  // ---- S3: увеличенный радиус 400: спора ещё рядом, когда башня включилась, но второй раз её не глушит
  const R3 = 400;
  ({ game } = await sporeGame(context, baseUrl, p, { radius: R3, minZoom: true }));
  const r3 = await watch(game, R3);
  const t3 = timeline(r3.log);
  const L3 = r3.log;
  check(`${p} радиус глушения ${R3} px: заглушена один раз (в момент ${f1(L3[t3.on]?.dist)} px), к концу глушения спора ещё ближе ${R3} px (${f1(L3[t3.off]?.dist)} px), но башню повторно не глушит (disables ${r3.end.disables})`, t3.on >= 0 && t3.off > t3.on && L3[t3.off].dist < R3 && r3.end.disables === 1 && L3.slice(t3.off).every((q) => !q.disabled), `заглушена с замера ${t3.on} по ${t3.off}, disables ${r3.end.disables}`);
  await context.close();
}

// ================================================================== бронированная

async function runArmored(browser, baseUrl) {
  const p = '[бронированная]';
  const hp = readConfigNumber('armored', 'hp');
  const damage = readConfigNumber('armored', 'lifeDamage');
  const reward = readConfigNumber('armored', 'reward');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const base = `waves.total:1,waves.list.0.coccus:0,waves.list.0.armored:1,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')}`;

  // ---- A. башня: нужно hp выстрелов
  let game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${base},towers.pill.range:650,economy.startCoins:${BASE.price * 2}` });
  await game.placeTowers([FREE.a, FREE.b]);
  const hps = [];
  let shotTaken = false;
  let shotsAtKill = 0;
  const end = await pollUntil(game, async (s) => {
    const a = s.bacteria.find((b) => b.kind === 'armored');
    if (a) {
      if (!hps.length || hps[hps.length - 1] !== a.hp) hps.push(a.hp);
      const sx = s.viewW / 2 + (a.x - s.camera.cx) * s.camera.zoom;
      const sy = s.height / 2 + (a.y - s.camera.cy) * s.camera.zoom;
      if (!shotTaken && a.hp <= hp / 2 && sx > 100 && sx < 980 && sy > 60 && sy < 660) {
        await shot(game.page, 'armored-01-cracked');
        shotTaken = true;
      }
    } else if (!shotsAtKill && hps.length) shotsAtKill = s.shots;
    return s.state === 'won' || s.state === 'lost';
  }, 240000, 25);
  check(`${p} у бронированной ${hp} HP: по ходу боя HP падали по одному ${hps.join(' → ')}`, hps[0] === hp && hps.every((v, i) => i === 0 || v === hps[i - 1] - 1 || v < hps[i - 1]) && hps.length >= 3, hps.join(' → '));
  check(`${p} башня убила бронированную: убито 1, выстрелов не меньше ${hp} (выстрелов ${end.shots}), награда ${reward} монет`, end.kills === 1 && end.shots >= hp && end.coins === reward, `убито ${end.kills}, выстрелов ${end.shots}, монет ${end.coins}`);
  await game.page.close();

  // ---- B. без башен: одна бронированная отнимает 2 жизни
  game = await openGame(context, baseUrl, p, { speed: 4, cfg: base });
  const endB = await pollUntil(game, (s) => s.state === 'won' || s.state === 'lost', 240000, 25);
  check(`${p} дойдя до организма, одна бронированная отнимает ${damage} жизни (жизни ${CFG.lives} → ${endB.lives}), красная вспышка сработала`, endB.leaked === 1 && endB.lives === CFG.lives - damage && endB.effects.lifeLosses === 1, `дошло ${endB.leaked}, жизни ${endB.lives}, вспышек ${endB.effects.lifeLosses}`);
  await context.close();
}

// ================================================================== порядок появления типов и сообщения «Новая бактерия!»

/** Сколько «жёлтых» точек текста сообщения вверху экрана и где он начинается и кончается по горизонтали (экран игры, px). */
async function toastPixels(game, png) {
  const points = [];
  const coords = [];
  for (let gy = 30; gy <= 62; gy += 2) {
    for (let gx = 0; gx <= 1100; gx += 3) {
      const c = game.screen.g2c(gx, gy);
      points.push([c.x, c.y]);
      coords.push(gx);
    }
  }
  const px = await samplePixels(game.page, png, points);
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  px.forEach(([r, g, b], i) => {
    if (r >= 230 && g >= 190 && g <= 236 && b <= 140) {
      count++;
      minX = Math.min(minX, coords[i]);
      maxX = Math.max(maxX, coords[i]);
    }
  });
  return { count, minX, maxX };
}

async function runIntro(browser, baseUrl) {
  const p = '[порядок появления типов]';
  const FIRST_WAVE = { coccus: 1, rod: 3, splitter: 5, armored: 7, spore: 9 };
  // ---- A. по волнам: кокк — 1, палочка — 3, делящаяся — 5, бронированная — 7, спора — 9; новый тип выходит один
  const TOTAL = 9;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  // кокков в каждой волне — по 2 (чтобы партия была короче); остальные типы — как в таблице config.ts
  const COCCI = 2;
  const cocciCfg = Array.from({ length: TOTAL }, (_, i) => `waves.list.${i}.coccus:${COCCI}`).join(',');
  const cfg = `waves.total:${TOTAL},${cocciCfg},waves.firstDelaySec:1,waves.pauseSec:1,waves.intervalStartSec:0.5,waves.intervalEndSec:0.5,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}`;
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg });
  const events = [];
  let prev = await game.state();
  const end = await pollUntil(game, (s) => {
    if (s.introduced.length > prev.introduced.length) {
      const kind = s.introduced[s.introduced.length - 1];
      const before = WAVE_LIST.slice(0, s.wave - 1).reduce((sum, row) => sum + KINDS.reduce((x, k) => x + (k === 'coccus' ? COCCI : (row[k] ?? 0)), 0), 0);
      events.push({ kind, wave: s.wave, onMap: s.bacteria.filter((b) => b.kind === kind).length, inWave: s.spawned - before });
    }
    prev = s;
    return s.state === 'won' || s.state === 'lost';
  }, 240000, 20);
  const rowSum = (row) => KINDS.reduce((x, k) => x + (k === 'coccus' ? COCCI : (row[k] ?? 0)), 0);
  const planned = WAVE_LIST.slice(0, TOTAL).reduce((sum, row) => sum + rowSum(row), 0);
  check(`${p} типы появляются по одному в порядке ${KINDS.join(' → ')}: introduced = [${end.introduced.join(', ')}]`, end.introduced.join() === KINDS.join(), `итог ${end.introduced.join(', ')}`);
  check(`${p} каждый тип впервые выходит в своей волне: ${events.map((e) => `${e.kind} — волна ${e.wave}`).join(', ')} (ждали ${KINDS.map((k) => `${k} — ${FIRST_WAVE[k]}`).join(', ')})`, events.length === 5 && events.every((e) => e.wave === FIRST_WAVE[e.kind]), events.map((e) => `${e.kind}:${e.wave}`).join(' '));
  check(`${p} новый тип выходит один и первым в своей волне: на карте в момент появления ${events.map((e) => `${e.kind}×${e.onMap}`).join(', ')}; до него в волне вышло ${events.map((e) => e.inWave - 1).join(', ')}`, events.every((e) => e.onMap === 1 && e.inWave === 1), events.map((e) => `${e.kind}: на карте ${e.onMap}, по счёту в волне ${e.inWave}`).join('; '));
  check(`${p} состав волн из config.ts: вышло ${end.spawned} бактерий (ждали ${planned}), волн ${end.wave} из ${end.waveTotal}, партия окончена победой`, end.spawned === planned && end.wave === TOTAL && end.waveTotal === TOTAL && end.state === 'won' && end.leaked === planned, `вышло ${end.spawned}, дошло ${end.leaked}, состояние ${end.state}`);
  await context.close();

  // ---- B. сообщение «Новая бактерия!» и звук при первом появлении (ru и en): все четыре типа подряд
  for (const lang of ['ru', 'en']) {
    const q = `${p} ${lang}`;
    const ctx = await newDeviceContext(browser, VIEWPORTS.desktop, lang);
    const g = await openGame(ctx, baseUrl, q, { speed: 1, cfg: `waves.total:1,waves.list.0.coccus:0,waves.list.0.rod:1,waves.list.0.splitter:1,waves.list.0.armored:1,waves.list.0.spore:1,waves.intervalStartSec:2.5,waves.intervalEndSec:2.5,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
    await g.input.tap(g.g(540, 560)); // касание включает звук (как у настоящего игрока)
    let last = await g.state();
    const seen = [];
    await pollUntil(g, async (s) => {
      if (s.introduced.length > last.introduced.length) {
        const kind = s.introduced[s.introduced.length - 1];
        const png = await shot(g.page, `intro-toast-${lang}-${kind}`);
        const t = await toastPixels(g, png);
        seen.push({ kind, t, playedDelta: s.sound.played - last.sound.played, soundState: s.sound.state });
      }
      last = s;
      return seen.length >= 4;
    }, 60000, 25);
    check(`${q} при первом появлении каждого нового типа вверху сообщение «Новая бактерия!…» (жёлтые точки текста ${seen.map((x) => `${x.kind}: ${x.t.count}`).join(', ')})`, seen.length === 4 && seen.every((x) => x.t.count >= 120), seen.map((x) => `${x.kind}: ${x.t.count}`).join(', '));
    check(`${q} текст сообщения целиком в окне карты (от ${Math.min(...seen.map((x) => x.t.minX))} до ${Math.max(...seen.map((x) => x.t.maxX))} px из 1080)`, seen.length === 4 && seen.every((x) => x.t.minX >= 10 && x.t.maxX <= 1074), seen.map((x) => `${x.kind}: ${x.t.minX}…${x.t.maxX}`).join('; '));
    check(`${q} при первом появлении нового типа играет звук (аудио запущено, sound.played растёт на каждом появлении)`, seen.length === 4 && seen.every((x) => x.soundState === 'running' && x.playedDelta >= 1), seen.map((x) => `${x.kind}: +${x.playedDelta}`).join(', '));
    await ctx.close();
  }
}

// ================================================================== полная партия: все 12 волн при сильной обороне

/** Выбирает n клеток для башен вдоль всей сети: жадно, каждая следующая закрывает больше ещё не прикрытого пути (с учётом вероятностей рёбер). */
function spreadCells(n, reach = 230) {
  const segs = [];
  for (const e of GRAPH.edges) {
    const w = GEO.prob.get(e.id) ?? 0;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i];
      const b = e.pts[i + 1];
      segs.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, v: w * Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  }
  const cand = [];
  for (let col = 0; col < LEVEL.cols; col++) for (let row = 0; row < LEVEL.rows; row++) if (!GEO.isPathCell(col, row)) cand.push({ col, row, c: GEO.center(col, row) });
  const chosen = [];
  for (let k = 0; k < n; k++) {
    let best = null;
    for (const q of cand) {
      if (chosen.some((c) => c.col === q.col && c.row === q.row)) continue;
      const v = segs.reduce((sum, sg) => (Math.hypot(sg.x - q.c.x, sg.y - q.c.y) <= reach ? sum + sg.v : sum), 0);
      if (!best || v > best.v) best = { ...q, v };
    }
    chosen.push(best);
    for (const sg of segs) if (Math.hypot(sg.x - best.c.x, sg.y - best.c.y) <= reach) sg.v *= 0.4;
  }
  return chosen.map((q) => [q.col, q.row]);
}

async function runFullGame(browser, baseUrl) {
  const p = '[полная партия]';
  const TOWERS = Number(process.env.QA_FULL_TOWERS) || 16;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  // Настоящие числа игры; подменяем только стартовые монеты: на все башни сразу
  const game = await openGame(context, baseUrl, p, { speed: 8, cfg: `economy.startCoins:${BASE.price * TOWERS}` });
  for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500); // минимальное приближение: видна вся карта
  await settle();
  const cells = spreadCells(TOWERS);
  await game.placeTowers(cells);
  const placed = await game.state();
  check(`${p} ${TOWERS} башен поставлены вдоль всей сети при минимальном приближении`, placed.towers.length === TOWERS && placed.coins === 0, `башен ${placed.towers.length}, монет ${placed.coins}`);
  const started = Date.now();
  let minLives = placed.lives;
  let maxBacteria = 0;
  let midShot = false;
  let lastWave = 0;
  const end = await pollUntil(game, async (s) => {
    minLives = Math.min(minLives, s.lives);
    maxBacteria = Math.max(maxBacteria, s.bacteria.length);
    if (s.wave !== lastWave) {
      lastWave = s.wave;
      console.log(`   … волна ${s.wave}/${s.waveTotal}, убито ${s.kills}, дошло ${s.leaked}, жизни ${s.lives}, монет ${s.coins}, прошло ${Math.round((Date.now() - started) / 1000)} с`);
    }
    if (!midShot && s.wave >= 7 && s.bacteria.length >= 2 && new Set(s.bacteria.map((b) => b.kind)).size >= 2) {
      await shot(game.page, 'fullgame-01-battle-all-types');
      midShot = true;
    }
    return s.state === 'won' || s.state === 'lost';
  }, 900000, 40);
  const seconds = Math.round((Date.now() - started) / 1000);
  await sleep(300);
  await shot(game.page, `fullgame-02-${end.state}`);
  const planned = WAVE_LIST.slice(0, 12).reduce((sum, row) => sum + KINDS.reduce((x, k) => x + (row[k] ?? 0), 0), 0);
  const splitCount = readConfigNumber('splitter', 'splitCount');
  check(`${p} все 12 волн пройдены при ${TOWERS} башнях: состояние «победа», волна ${end.wave} из ${end.waveTotal}`, end.state === 'won' && end.wave === 12 && end.waveTotal === 12 && end.lives > 0, `состояние ${end.state}, волна ${end.wave}/${end.waveTotal}, жизни ${end.lives}`);
  check(`${p} вышло ${planned} бактерий по таблице волн, все пять типов появились по порядку`, end.spawned === planned && end.introduced.join() === KINDS.join(), `вышло ${end.spawned} (ждали ${planned}), типы ${end.introduced.join(', ')}`);
  check(`${p} учёт: убитые + дошедшие = вышедшие + ${splitCount}·распады (${end.kills} + ${end.leaked} = ${end.spawned} + ${splitCount}·${end.splits})`, end.kills + end.leaked === end.spawned + splitCount * end.splits, `убито ${end.kills}, дошло ${end.leaked}, вышло ${end.spawned}, распадов ${end.splits}`);
  note(`Полная партия (настоящие числа, скорость ×8, ${TOWERS} башен по ${BASE.price} монет, поставленных до начала вдоль всей сети): итог «${end.state}» за ${seconds} с реального времени (${f1(end.elapsed)} с игрового); убито ${end.kills}, дошло до организма ${end.leaked}, жизни ${CFG.lives} → ${end.lives} (минимум ${minLives}), заглушений башен спорами ${end.disables}, распадов ${end.splits}, одновременно на карте до ${maxBacteria} бактерий, монет в конце ${end.coins} (то есть зарабатывается в партии ≈ ${end.coins} сверх ${BASE.price * TOWERS} потраченных).`);
  await context.close();
}

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
// Страховка от зависания: через 40 минут всё останавливаем
const watchdog = setTimeout(async () => {
  console.error('❌ Проверка не уложилась в 40 минут — остановлена.');
  await Promise.race([browser.close(), sleep(5000)]);
  process.exit(1);
}, 40 * 60 * 1000);
let crashed = null;
try {
  // Сеть дорожек берём у самой игры (window.__pvb.getGraph()) и по ней выбираем клетки для проверок
  if (qaServer) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    watchConsole(page, '[сеть дорожек]');
    await page.goto(`${qaServer.url}?qa&cfg=waves.firstDelaySec:9999`, { waitUntil: 'load' });
    await waitFor(page, (x) => x.state === 'playing', 20000, 'запуск игры для чтения сети дорожек');
    setupWorld(await page.evaluate(() => window.__pvb.getGraph()));
    await ctx.close();
  }
  for (const [key, device, lang] of [['desktop-ru', 'desktop', 'ru'], ['phone-ru', 'phone', 'ru'], ['desktop-en', 'desktop', 'en'], ['phone-en', 'phone', 'en']]) {
    if (wants(key)) await safe(`[${key}]`, () => runProfile(browser, qaServer.url, device, lang));
  }
  if (wants('rules')) await safe('[правила клеток]', () => runRules(browser, qaServer.url));
  if (wants('graph')) await safe('[граф дорожек]', () => runGraph(browser, qaServer.url));
  if (wants('combat')) await safe('[бой]', () => runCombat(browser, qaServer.url));
  if (wants('dash')) await safe('[рывки палочки]', () => runDash(browser, qaServer.url));
  if (wants('split')) await safe('[делящаяся]', () => runSplit(browser, qaServer.url));
  if (wants('spore')) await safe('[спора]', () => runSpore(browser, qaServer.url));
  if (wants('armored')) await safe('[бронированная]', () => runArmored(browser, qaServer.url));
  if (wants('intro')) await safe('[появление типов]', () => runIntro(browser, qaServer.url));
  if (wants('lose-ru')) await safe('[проигрыш ru]', () => runLose(browser, qaServer.url, 'ru', 'desktop', true));
  if (wants('lose-en')) await safe('[проигрыш en]', () => runLose(browser, qaServer.url, 'en', 'phone', false));
  if (wants('win-ru')) await safe('[победа ru]', () => runWin(browser, qaServer.url, 'ru', 'desktop', true));
  if (wants('win-en')) await safe('[победа en]', () => runWin(browser, qaServer.url, 'en', 'phone', false));
  if (wants('danger')) await safe('[тревога]', () => runDanger(browser, qaServer.url));
  if (wants('rotate')) await safe('[поворот]', () => runRotate(browser, qaServer.url));
  if (wants('production')) await safe('[игровая сборка]', () => runProduction(browser, prodServer.url, qaServer.url));
  if (wants('fullgame')) await safe('[полная партия]', () => runFullGame(browser, qaServer.url));
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
if (harmless.length) {
  console.log(`ℹ️  Безобидное сообщение Phaser+Chrome при системной отмене касания (${harmless.length} раз, в счёт не идёт): «Ignored attempt to cancel a touchcancel event…»`);
}
if (envNoise.length) {
  console.log(`ℹ️  Сообщения видеодрайвера среды (${envNoise.length}, к игре не относятся):`);
  for (const line of [...new Set(envNoise)].slice(0, 5)) console.log(`   ! ${line}`);
}

const failed = results.filter((r) => !r.ok);
if (notes.length) {
  console.log('\nЗаметки (в счёт проверок не входят):');
  for (const line of notes) console.log(`  📝 ${line}`);
}
console.log('\nСкриншоты:');
for (const file of screenshots) console.log(`  ${file}`);
console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено.`);
if (failed.length) {
  console.log('Не прошли:');
  for (const r of failed) console.log(`  ❌ ${r.name}${r.details ? ` — ${r.details}` : ''}`);
}
process.exit(failed.length || crashed ? 1 : 0);
