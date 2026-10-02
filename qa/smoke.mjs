/**
 * Проверка игры в браузере (Playwright). Запуск: npm run qa -- --tag=td-1
 * (сначала сама собирает игровую и тестовую версии игры). Весь набор — больше часа; сценарии по одному: --only=<имя>.
 *
 * Игра — tower defense: экран 1280×720 (16:9), слева карта с камерой (сдвиг, щипок, колесо мыши), справа панель.
 * Дорожки — граф «корневая система» (18 рёбер-кривых, 3 входа, 3 выхода, 4 развилки, 5 слияний); сеть проверки берут у самой
 * игры (window.__pvb.getGraph()), клетки для башен выбирают по ней, а числа баланса — из src/config.ts.
 * Состав волн подменяется помощником wavesOnly(): через ?cfg= можно менять только числа, которые уже есть в строке таблицы волн, а в начале таблицы
 * строки короткие, поэтому проверки обнуляют прежние волны и ставят нужный состав в первую строку, где есть все нужные типы.
 *
 * ТЕСТОВАЯ сборка (dist-qa, с режимом ?qa), компьютер 1280×720 (мышь) и телефон 844×390 в горизонтальном
 * положении (касания), русский и английский (язык — настройкой браузера, как у настоящего игрока).
 * Сценарии (имена — для --only=):
 *   desktop-ru, phone-ru   полный набор: экран и начальное состояние, карта (252 клетки: 94 задеты дорожкой, остальные свободны или закрыты как далёкие),
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
 *   split                  делящаяся: при гибели 2 кокка на том же ребре в 64 px друг от друга, награда 8 и 10+10, без убийства не делится
 *   spore                  спора: глушит башню при подходе ближе 150 px на 3 с (выстрелы стоят), один раз; дальняя башня не глушится
 *   armored                бронированная: броня (урон − броня, не меньше доли armorMinShare от удара: удары 5, 3 и 1), 20 HP, награда, без башен отнимает 2 жизни
 *   intro                  порядок появления всех 13 типов по таблице волн (новый тип один и первым); сообщение «Новая бактерия!» и звук для
 *                          12 типов (ru и en), текст целиком в окне
 *   lose-ru, lose-en       потеря жизней, проигрыш (в том числе при работающих башнях: снарядов в полёте не остаётся), блокировка
 *                          перезапуска, перезапуск, утечки (lose-ru — компьютер, lose-en — телефон)
 *   win-ru, win-en         победа (снарядов в полёте не остаётся) и перезапуск (win-ru — компьютер, win-en — телефон)
 *   towers                 четыре башни и новые бактерии. Башни: тексты i18n; панель на компьютере и телефоне, ru и en (четыре кнопки по порядку, выбор и снятие
 *                          выбора, цвет цен, нижняя подсказка целиком в окне — у Шприца она шире окна, это известная ошибка игры); кнопки скорости ×1/×2/×3 и
 *                          «Начать волну»; цены (списывается ровно price, при нехватке не ставится); Сироп — ЛУЖА (капля летит в точку дорожки впереди бактерии,
 *                          лужа живёт puddleSec, в ней идут ×slowFactor, после выхода ещё slowSec, поверх старой лужи новая не кладётся, слизень не замедляется);
 *                          Шипучка (малый взрыв: задевает всех в круге blastRadius и никого дальше, 1 взрыв за выстрел, монеты); Шприц — ЛУЧ (range 0, поворот
 *                          тапом по правой/левой половине башни на компьютере и телефоне, очередь beamPulses ударов по всем на линии издалека и по диагонали,
 *                          урон с учётом брони, молчит, пока на линии никого нет); Таблетка (цель — ближайшая к организму); все четыре вместе. Бактерии: рой (пачка,
 *                          дробный урон жизням — lifePool), бегун, лекарь, регенератор, командир, матка, гигант. Числа читаются из config.ts (readConfigNumber),
 *                          баланс боя фиксируется через ?cfg=. QA_TOWERS_ONLY=syrup,fizz — только эти части (texts, panel, controls, prices, syrup, fizz,
 *                          syringe, pill, mixed, swarm, runner, healer, regen, commander, brood, giant)
 *   danger                 подсказка «◀ Организм» краснеет, когда бактерия близко к организму (проверка по цвету пикселей)
 *   rotate                 телефон вертикально ↔ горизонтально (на ru и en): вертикально — подсказка «Поверните телефон», время стоит, тапы
 *                          игре не мешают; обратно — подсказка пропала, время идёт; на компьютере подсказки нет ни в каком окне
 *   production             ИГРОВАЯ сборка (dist, та, что уйдёт на Яндекс): режима проверки, подмены чисел и языка из адреса нет; игра при этом работает (башня ставится тапом)
 *   fullgame               ПОЛНАЯ партия: настоящие волны и бактерии (30 волн, 13 типов), скорость ×8, 40 Таблеток со сверхсильным уроном и без потери жизней
 *                          (проверка не должна краснеть от подбора баланса); ждёт «победу», проверяет состав волн, порядок появления типов и учёт, печатает
 *                          заметку о реальном времени (≈ 10–25 минут)
 * Дополнительно: --only=combat (или любое другое имя из списка) запускает один сценарий; для production нужна свежая
 * `npm run build`, для остальных — `npm run build:qa`.
 *
 * Скриншоты — в qa/screenshots/<tag>/ (папка тега очищается только при запуске всех сценариев). Итог печатается в консоль;
 * при любой ошибке код выхода 1. Строки «📝» в конце — заметки (в счёт проверок не входят).
 *
 * Проверка самих проверок: QA_EXTRA_CFG=types.rod.dashFactor:1 node qa/smoke.mjs --tag=mut --only=dash подмешивает «поломку»
 * в адрес игры — соответствующая проверка обязана покраснеть (так проверяли, что проверки не пустые). Примеры: types.rod.dashFactor:1,
 * types.splitter.splitCount:0, types.spore.disableSec:0, types.armored.armor:0, camera.tapMaxMovePx:14.
 * Для башен: QA_EXTRA_CFG=towers.syrup.slowFactor:0.9 или towers.syrup.puddleSec:3 (Сироп), towers.fizz.blastRadius:30 или :300 (Шипучка),
 * towers.syringe.beamPulses:1 или towers.syringe.beamHalfWidthPx:60 (Шприц), towers.fizz.price:10 (цены), towers.pill.damage:0 (Таблетка) —
 * с QA_TOWERS_ONLY=<часть> нужная проверка краснеет.
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
  readKinds,
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

const SCENARIOS = ['desktop-ru', 'phone-ru', 'desktop-en', 'phone-en', 'rules', 'graph', 'combat', 'dash', 'split', 'spore', 'armored', 'intro', 'lose-ru', 'lose-en', 'win-ru', 'win-en', 'towers', 'danger', 'rotate', 'production', 'fullgame']
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
/** Все 13 типов бактерий в порядке таблицы `types` config.ts (в этом порядке игра выпускает новые типы в волне). */
const KINDS = readKinds();
/** Первая волна (с 1), где тип есть в таблице волн, и порядок, в котором типы впервые появляются по таблице (при равных волнах — по порядку таблицы типов). */
const FIRST_WAVE = Object.fromEntries(KINDS.map((k) => [k, WAVE_LIST.findIndex((row) => (row[k] ?? 0) > 0) + 1]));
const INTRO_ORDER = KINDS.filter((k) => FIRST_WAVE[k] > 0).sort((a, b) => FIRST_WAVE[a] - FIRST_WAVE[b] || KINDS.indexOf(a) - KINDS.indexOf(b));
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

/** Сделан ли скриншот с таким именем в этом прогоне. */
const existsShot = (name) => fs.existsSync(path.join(shotsDir, `${name}.png`));

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
    /** Тап по кнопке башни по её названию из таблицы (pill, syrup, fizz, syringe); повторный тап снимает выбор. */
    async selectTower(id) {
      const b = (await getState(page)).ui.towerButtons.find((x) => x.id === id);
      await input.tap(screen.g2c(b.x, b.y));
      await settle();
    },
    async tapCell(col, row) {
      await input.tap(await game.cell(col, row));
      await settle();
    },
    /** Выбирает башню по названию и ставит её на клетки по очереди; возвращает состояние. */
    async placeTowersOf(id, cells) {
      await game.selectTower(id);
      for (const [col, row] of cells) await game.tapCell(col, row);
      return getState(page);
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
    entranceChains: [], // цепочки только тех бактерий, чей путь записан с самого входа (первый замер не опоздал)
    entrances: {},
    transitions: {}, // узел → { ребро-выход: сколько раз выбрано }
    exits: {}, // последнее ребро → сколько раз
  };
  const entr = new Set(GRAPH.entrances);
  const len = (id) => GEO.byId.get(id).length;
  for (const tr of traces.values()) {
    out.samples += tr.length;
    const fromEntrance = entr.has(tr[0].edge) && tr[0].s < 250 && tr[0].x > worldW - 400;
    if (fromEntrance) {
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
    if (fromEntrance) out.entranceChains.push(chain);
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
  // этап 3б: 158 бывших свободных клеток делятся на открытые и закрытые (дальше buildMaxDistPx от дорожки) — сколько закрыто, считает игра
  check(`${p} карта: клеток ${totalCells}, задето дорожкой ${GEO.lanePathCellCount} (ждали 94), закрыто как далёкие ${GEO.blockedCellCount}, свободных ${freeCells}`, totalCells === 252 && GEO.lanePathCellCount === 94 && GEO.blockedCellCount > 0 && freeCells === 158 - GEO.blockedCellCount, `по точкам рёбер: ${GEO.lanePathCellCount}; закрытых ${GEO.blockedCellCount}`);
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
    // Плашка «◀ Организм» — прямоугольник x 0…128, y 328…362 (src/ui/Panel.ts); берём точку заливки над текстом, внутри плашки
    const c = game.g(70, 331);
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
  // Изредка (в одном прогоне из пяти) первый тап по кнопке башни на только что открытой странице не доходил до игры — башен 0. До появления бактерий у организма
  // остаётся время, поэтому ставим ещё раз и пишем заметку, чтобы такие случаи были видны, а не прятались
  let retries = 0;
  while (s.towers.length < 2 && retries < 3 && s.state === 'playing') {
    retries++;
    if (s.selected !== 'pill') await game.selectTower('pill');
    for (const cell of [FREE.f, FREE.e]) if (!s.towers.some((t) => t.col === cell[0] && t.row === cell[1])) await game.tapCell(...cell);
    s = await game.state();
  }
  if (retries > 0) note(`${p} в проверке «проигрыш с башнями» башни пришлось ставить повторно (попыток ${retries}): первый тап по кнопке башни на только что открытой странице не дошёл до игры`);
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
      const exitChains = a.entranceChains.filter((c) => GEO.outOf[GEO.byId.get(c[c.length - 1]).to] === undefined);
      check(`${p} бактерии проходят весь путь по графу от входа до выхода (дошли до выходного ребра: ${a.full}; цепочки рёбер не короче ${minChain})`, a.full >= 2 && exitChains.length >= 1 && exitChains.every((c) => c.length >= minChain), `до выхода ${a.full}, выходы: ${JSON.stringify(a.exits)}, цепочки с самого входа: ${a.entranceChains.map((c) => c.join('→')).join(' | ')}, все записанные: ${a.edgeChain.map((c) => c.join('→')).join(' | ')}`);
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
  // Цвет основания башни (0x2c4a7c). Пустая клетка карты теперь почти того же цвета (≈ 35, 67, 119), поэтому допуск узкий: 3 из 255 на канал
  const TOWER = [44, 74, 124];
  const before = beforePx.filter((c) => near(c, TOWER, 3)).length;
  const after = afterPx.filter((c) => near(c, TOWER, 3)).length;
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

/**
 * Подмена состава волн для проверок. Подменять через ?cfg= можно только числа, которые уже есть в строке таблицы волн, а в начале таблицы строки
 * короткие (в волне 1 одни кокки, палочка — с волны 3 и т. д.). Поэтому нужный состав `counts` ({тип: сколько}) ставится в первую строку, где есть все
 * нужные типы, остальные типы этой строки обнуляются, а все прежние волны — тоже (пустая волна проходит за `pauseSec` секунд). Партия идёт до этой волны
 * включительно (`waves.total` = её номер): в ней выходят только заказанные бактерии. Возвращает список подмен для ?cfg= (без запятых между ними).
 * Новые типы в первой (и единственной непустой) волне выходят «первыми и по одному», как в игре: порядок — как в таблице типов.
 */
function wavesOnly(counts, { pauseSec = 0.1 } = {}) {
  const kinds = Object.keys(counts);
  const idx = WAVE_LIST.findIndex((row) => kinds.every((k) => k in row));
  if (idx < 0) throw new Error(`В таблице волн нет строки, где есть все типы: ${kinds.join(', ')}`);
  const out = [`waves.total:${idx + 1}`, `waves.pauseSec:${pauseSec}`];
  for (let i = 0; i <= idx; i++) for (const k of Object.keys(WAVE_LIST[i])) out.push(`waves.list.${i}.${k}:${i === idx ? (counts[k] ?? 0) : 0}`);
  return out;
}
const wavesOnlyCfg = (counts, opts) => wavesOnly(counts, opts).join(',');

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
  const cfg = `${wavesOnlyCfg({ coccus: 3, rod: RODS })},waves.intervalStartSec:1.5,waves.intervalEndSec:1.5,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},types.rod.speedFactor:1,${NO_LIFE_LOSS}`;
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
  const g2 = await openGame(c2, baseUrl, p, { speed: 2, cfg: `${wavesOnlyCfg({ rod: 3 })},waves.intervalStartSec:1,waves.intervalEndSec:1,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
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
  const base = `${wavesOnlyCfg({ splitter: SPL })},waves.intervalStartSec:3,waves.intervalEndSec:3,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}`;
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
  game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${wavesOnlyCfg({ splitter: MANY })},waves.intervalStartSec:0.8,waves.intervalEndSec:0.8,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS},towers.pill.range:1400,towers.pill.cooldownMs:300,towers.pill.damage:20,economy.startCoins:${BASE.price * 7}` });
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
  check(`${p} регрессия: ${pairs.length} распадов подряд (башни с дальностью 1400 и уроном 20: убивают с одного выстрела при любом HP), ни в одном кокки не слипаются: наименьшее прямое расстояние ${f1(minChord)} px ≥ 38 (раньше было 25 и 34)`, pairs.length >= 20 && minChord >= 38, `распадов ${pairs.length}, прямые расстояния: ${chords.map((c) => Math.round(c)).join(',')}`);
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
/** Свободная клетка дальше всех от любых дорожек (башня там не достаёт ни до какой бактерии и не глушится).
 *  Ряды 2…11: верхний и нижний ряды при минимальном приближении лежат за краем экрана (тап по ним башню не ставил — проверка «дальняя не глушится» была пустой). */
function farCell() {
  let best = null;
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 2; row <= 11; row++) {
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
  const cfg = `${wavesOnlyCfg({ coccus: 6, spore: 1 })},waves.intervalStartSec:1.2,waves.intervalEndSec:1.2,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},towers.pill.damage:0,economy.startCoins:${BASE.price * (far ? 2 : 1)},${NO_LIFE_LOSS}${extra}`;
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
  check(`${p} башня вдали от дорожек (клетка ${far.col};${far.row}, до ближайшей дорожки ${Math.round(far.d)} px) поставлена, не глушится ни разу, глушится только башня у «ствола»`, r2.end.towers.length === 2 && r2.end.towers[1].col === far.col && r2.end.towers[1].row === far.row && r2.log.every((q) => !q.far) && r2.end.disables === 1 && r2.log.some((q) => q.disabled), `башен ${r2.end.towers.length}, disables ${r2.end.disables}, дальняя заглушена: ${r2.log.some((q) => q.far)}`);
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
  const armor = readConfigNumber('armored', 'armor');
  const damage = readConfigNumber('armored', 'lifeDamage');
  const reward = readConfigNumber('armored', 'reward');
  const minShare = readConfigNumber('combat', 'armorMinShare');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const base = `${wavesOnlyCfg({ armored: 1 })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')}`;
  /** Сколько HP снимает удар башни: урон минус броня, но не меньше доли armorMinShare от удара (как в `Bacterium.hit`). */
  const dealt = (hit) => Math.max(hit * minShare, hit - armor);

  // ---- A. броня: одна башня, удары разной силы; HP падает ровно на «урон − броня», но не меньше доли armorMinShare от удара
  for (const hit of [5, armor + 1, 1]) {
    const want = dealt(hit);
    const g = await openGame(context, baseUrl, p, { speed: 4, cfg: `${base},towers.pill.range:650,towers.pill.damage:${hit},economy.startCoins:${BASE.price}` });
    await g.placeTowers([FREE.a]);
    const steps = [];
    let last = hp;
    await pollUntil(g, (s) => {
      const a = s.bacteria.find((b) => b.kind === 'armored');
      if (a && a.hp !== last) {
        steps.push(last - a.hp);
        last = a.hp;
      }
      return s.state === 'won' || s.state === 'lost' || steps.length >= 5;
    }, 240000, 20);
    const bad = steps.filter((d) => Math.abs(d - want) > 1e-6);
    check(`${p} удар ${hit} по броне ${armor} (минимум ${minShare} от удара): HP бронированной падает на ${f2(want)} за выстрел (замерено ${steps.length} ударов: ${steps.map(f2).join(', ')})`, steps.length >= 4 && bad.length === 0, bad.length ? `не ${f2(want)}: ${bad.map(f2).join(', ')}` : `ударов ${steps.length}`);
    await g.page.close();
  }

  // ---- B. две башни с ударом armor + 1 (снимает ровно 1 HP): убивают бронированную; HP падают по одному
  let game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${base},towers.pill.range:650,towers.pill.damage:${armor + 1},economy.startCoins:${BASE.price * 2}` });
  await game.placeTowers([FREE.a, FREE.b]);
  const hps = [];
  let shotTaken = false;
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
    }
    return s.state === 'won' || s.state === 'lost';
  }, 240000, 25);
  check(`${p} у бронированной ${hp} HP: по ходу боя HP падали ${hps.slice(0, 6).join(' → ')} …`, hps[0] === hp && hps.length >= 5 && hps.every((v, i) => i === 0 || v < hps[i - 1]), hps.join(' → '));
  check(`${p} башни убили бронированную: убито 1, выстрелов не меньше ${hp} (выстрелов ${end.shots}), награда ${reward} монет`, end.kills === 1 && end.shots >= hp && end.coins === reward, `убито ${end.kills}, выстрелов ${end.shots}, монет ${end.coins}`);
  await game.page.close();

  // ---- C. без башен: одна бронированная отнимает 2 жизни
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
  // ---- A. по волнам: каждый тип впервые выходит в своей волне (по таблице config.ts), один и первым; кокк — с 1-й
  const TOTAL = Math.max(...INTRO_ORDER.map((k) => FIRST_WAVE[k]));
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  // Волны короче настоящих (партия быстрее): в первую волну типа — сколько в таблице, в остальные — не больше CAP каждого типа
  const CAP = 3;
  const sizeOf = (row, i) => Object.entries(row).reduce((sum, [k, n]) => sum + (FIRST_WAVE[k] === i + 1 ? n : Math.min(n, CAP)), 0);
  const trimCfg = WAVE_LIST.slice(0, TOTAL)
    .flatMap((row, i) => Object.entries(row).map(([k, n]) => `waves.list.${i}.${k}:${FIRST_WAVE[k] === i + 1 ? n : Math.min(n, CAP)}`))
    .join(',');
  const cfg = `waves.total:${TOTAL},${trimCfg},waves.firstDelaySec:1,waves.pauseSec:1,waves.intervalStartSec:0.5,waves.intervalEndSec:0.5,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}`;
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg });
  const events = [];
  let prev = await game.state();
  const end = await pollUntil(game, (s) => {
    if (s.introduced.length > prev.introduced.length) {
      const kind = s.introduced[s.introduced.length - 1];
      const before = WAVE_LIST.slice(0, s.wave - 1).reduce((sum, row, i) => sum + sizeOf(row, i), 0);
      events.push({ kind, wave: s.wave, onMap: s.bacteria.filter((b) => b.kind === kind).length, inWave: s.spawned - before });
    }
    prev = s;
    return s.state === 'won' || s.state === 'lost';
  }, 400000, 20);
  const planned = WAVE_LIST.slice(0, TOTAL).reduce((sum, row, i) => sum + sizeOf(row, i), 0);
  check(`${p} типы появляются по одному в порядке первых волн из таблицы: ${INTRO_ORDER.join(' → ')}; introduced = [${end.introduced.join(', ')}]`, end.introduced.join() === INTRO_ORDER.join(), `итог ${end.introduced.join(', ')}`);
  check(`${p} каждый тип впервые выходит в своей волне: ${events.map((e) => `${e.kind} — ${e.wave}`).join(', ')}`, events.length === INTRO_ORDER.length && events.every((e) => e.wave === FIRST_WAVE[e.kind]), `ждали ${INTRO_ORDER.map((k) => `${k}:${FIRST_WAVE[k]}`).join(' ')}; было ${events.map((e) => `${e.kind}:${e.wave}`).join(' ')}`);
  check(`${p} новый тип выходит один и первым в своей волне (на карте в момент появления ${events.map((e) => `${e.kind}×${e.onMap}`).join(', ')}; до него в волне вышло ${events.map((e) => e.inWave - 1).join(', ')})`, events.length === INTRO_ORDER.length && events.every((e) => e.onMap === 1 && e.inWave === 1), events.map((e) => `${e.kind}: на карте ${e.onMap}, по счёту в волне ${e.inWave}`).join('; '));
  check(`${p} состав волн из config.ts: вышло ${end.spawned} бактерий (ждали ${planned}), волн ${end.wave} из ${end.waveTotal}, партия окончена победой (без башен все дошли до организма: дошло ${end.leaked}, у матки рождённые на ходу не входят в «вышли»)`, end.spawned === planned && end.wave === TOTAL && end.waveTotal === TOTAL && end.state === 'won' && end.kills === 0 && end.leaked >= planned, `вышло ${end.spawned}, дошло ${end.leaked}, убито ${end.kills}, состояние ${end.state}`);
  await context.close();

  // ---- B. сообщение «Новая бактерия!» и звук при первом появлении (ru и en): все типы, кроме кокка, подряд
  const toastKinds = INTRO_ORDER.filter((k) => k !== 'coccus');
  const only = Object.fromEntries(toastKinds.map((k) => [k, 1]));
  for (const lang of ['ru', 'en']) {
    const q = `${p} ${lang}`;
    const ctx = await newDeviceContext(browser, VIEWPORTS.desktop, lang);
    const g = await openGame(ctx, baseUrl, q, { speed: 2, cfg: `${wavesOnlyCfg(only)},waves.intervalStartSec:3,waves.intervalEndSec:3,waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
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
      return seen.length >= toastKinds.length;
    }, 150000, 25);
    check(`${q} при первом появлении каждого из ${toastKinds.length} новых типов вверху сообщение «Новая бактерия!…» (жёлтые точки текста: ${seen.map((x) => `${x.kind} ${x.t.count}`).join(', ')})`, seen.length === toastKinds.length && seen.every((x) => x.t.count >= 120), seen.map((x) => `${x.kind}: ${x.t.count}`).join(', '));
    check(`${q} текст каждого сообщения целиком в окне карты (от ${Math.min(...seen.map((x) => x.t.minX))} до ${Math.max(...seen.map((x) => x.t.maxX))} px из 1080)`, seen.length === toastKinds.length && seen.every((x) => x.t.minX >= 10 && x.t.maxX <= 1074), seen.map((x) => `${x.kind}: ${x.t.minX}…${x.t.maxX}`).join('; '));
    check(`${q} при первом появлении нового типа играет звук (аудио запущено, sound.played растёт на каждом появлении)`, seen.length === toastKinds.length && seen.every((x) => x.soundState === 'running' && x.playedDelta >= 1), seen.map((x) => `${x.kind}: +${x.playedDelta}`).join(', '));
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
  const TOWERS = Number(process.env.QA_FULL_TOWERS) || 40;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  // Настоящие волны и бактерии (все 30 волн, 13 типов). Подменяем: монеты на старте — на все башни сразу по настоящей цене; башня Таблетка — сверхсильная
  // (урон 200, пауза 300 мс), чтобы проверка не краснела от подбора баланса; жизни не отнимаются (NO_LIFE_LOSS): партия идёт до конца при любой обороне
  const cfg = `economy.startCoins:${CFG.pillPrice * TOWERS},towers.pill.damage:200,towers.pill.cooldownMs:300,${NO_LIFE_LOSS}`;
  const game = await openGame(context, baseUrl, p, { speed: 8, cfg });
  for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500); // минимальное приближение: видна вся карта
  await settle();
  const cells = spreadCells(TOWERS);
  await game.placeTowers(cells);
  const placed = await game.state();
  // пока ставились башни, игра шла (первая волна через 8 с игрового времени), так что остаток монет — награды за первых убитых, а не недостача
  check(`${p} ${TOWERS} башен поставлены вдоль всей сети при минимальном приближении (монет осталось ${placed.coins}: стартовых хватило ровно на башни, остаток — награды за первых убитых)`, placed.towers.length === TOWERS && placed.coins >= 0 && placed.coins < CFG.pillPrice * 2, `башен ${placed.towers.length}, монет ${placed.coins}`);
  const started = Date.now();
  let maxBacteria = 0;
  let midShot = false;
  let giantShot = false;
  let lastWave = 0;
  let maxPuddles = 0;
  const end = await pollUntil(game, async (s) => {
    maxBacteria = Math.max(maxBacteria, s.bacteria.length);
    if (s.wave !== lastWave) {
      lastWave = s.wave;
      console.log(`   … волна ${s.wave}/${s.waveTotal}, убито ${s.kills}, дошло ${s.leaked}, на карте ${s.bacteria.length}, прошло ${Math.round((Date.now() - started) / 1000)} с`);
    }
    if (!midShot && s.wave >= 12 && new Set(s.bacteria.map((b) => b.kind)).size >= 5) {
      await shot(game.page, 'fullgame-01-battle-many-types');
      midShot = true;
    }
    if (!giantShot && s.bacteria.some((b) => b.kind === 'giant')) {
      await shot(game.page, 'fullgame-03-giant');
      giantShot = true;
    }
    maxPuddles = Math.max(maxPuddles, s.puddles.length);
    return s.state === 'won' || s.state === 'lost';
  }, 1500000, 40);
  const seconds = Math.round((Date.now() - started) / 1000);
  await sleep(300);
  await shot(game.page, `fullgame-02-${end.state}`);
  const total = WAVE_LIST.length;
  const planned = WAVE_LIST.slice(0, total).reduce((sum, row) => sum + Object.values(row).reduce((x, n) => x + n, 0), 0);
  const splitCount = readConfigNumber('splitter', 'splitCount');
  check(`${p} все ${CFG.waves} волн пройдены при ${TOWERS} башнях: состояние «победа», волна ${end.wave} из ${end.waveTotal}`, end.state === 'won' && end.wave === CFG.waves && end.waveTotal === CFG.waves && CFG.waves === total, `состояние ${end.state}, волна ${end.wave}/${end.waveTotal}, в таблице ${total} волн`);
  check(`${p} вышло ${planned} бактерий по таблице волн, все ${INTRO_ORDER.length} типов появились по порядку: ${INTRO_ORDER.join(', ')}`, end.spawned === planned && end.introduced.join() === INTRO_ORDER.join(), `вышло ${end.spawned} (ждали ${planned}), типы ${end.introduced.join(', ')}`);
  const born = end.kills + end.leaked - end.spawned - splitCount * end.splits;
  check(`${p} учёт: убитые + дошедшие = вышедшие + ${splitCount}·распады + рождённые маткой (${end.kills} + ${end.leaked} = ${end.spawned} + ${splitCount}·${end.splits} + ${born}); рождённых не меньше 0, но ограничено: ≤ ${planned} (никто не пропал и не посчитан дважды)`, born >= 0 && born <= planned, `лишних ${born}`);
  check(`${p} оборона работает: убито ${end.kills} из ${end.spawned} вышедших (не меньше половины), монеты растут (в конце ${end.coins})`, end.kills >= end.spawned / 2 && end.coins > 0, `убито ${end.kills}, монет ${end.coins}`);
  note(`Полная партия (настоящие волны и бактерии, скорость ×8, ${TOWERS} Таблеток по ${CFG.pillPrice} монет со сверхсильным уроном, жизни не отнимаются): итог «${end.state}» за ${seconds} с реального времени (${f1(end.elapsed)} с игрового); убито ${end.kills}, дошло до организма ${end.leaked}, заглушений башен спорами ${end.disables}, распадов ${end.splits}, одновременно на карте до ${maxBacteria} бактерий, монет в конце ${end.coins}.`);
  await context.close();
}

// ================================================================== четыре башни и новые бактерии (этап 3б): панель, цены, Сироп-лужа, Шипучка, Шприц-луч, Таблетка, типы бактерий

const TOWER_IDS = ['pill', 'syrup', 'fizz', 'syringe'];
/** Фиксированный баланс для проверок башен: числа самих башен НЕ подменяются (их читаем из config.ts), остальное — как в соседних сценариях. */
const FIXED_NO_TOWERS = FIXED_BALANCE.filter((x) => !x.startsWith('towers.'));
/** Строки таблицы башен из config.ts: проверки сверяют игру с таблицей, а не с числами в тексте проверки. */
let TW = null;
function towerTable() {
  const row = (id) => ({
    price: readConfigNumber(id, 'price'),
    range: readConfigNumber(id, 'range'),
    damage: readConfigNumber(id, 'damage'),
    cooldownMs: readConfigNumber(id, 'cooldownMs'),
    projectileSpeed: readConfigNumber(id, 'projectileSpeed'),
  });
  return {
    pill: row('pill'),
    syrup: {
      ...row('syrup'),
      slowFactor: readConfigNumber('syrup', 'slowFactor'),
      slowSec: readConfigNumber('syrup', 'slowSec'),
      puddleRadius: readConfigNumber('syrup', 'puddleRadius'),
      puddleSec: readConfigNumber('syrup', 'puddleSec'),
      puddleLeadPx: readConfigNumber('syrup', 'puddleLeadPx'),
    },
    fizz: { ...row('fizz'), blastRadius: readConfigNumber('fizz', 'blastRadius') },
    syringe: {
      ...row('syringe'),
      beamPulses: readConfigNumber('syringe', 'beamPulses'),
      beamGapMs: readConfigNumber('syringe', 'beamGapMs'),
      beamLengthPx: readConfigNumber('syringe', 'beamLengthPx'),
      beamHalfWidthPx: readConfigNumber('syringe', 'beamHalfWidthPx'),
    },
  };
}
const medianOf = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const byIdMap = (s) => new Map(s.bacteria.map((b) => [b.id, b]));
/** Достаёт ли башня до бактерии (как в игре: центр не дальше радиуса башни + радиус бактерии); slack — запас, px. */
const inReach = (tw, b, slack = 0) => Math.hypot(b.x - tw.x, b.y - tw.y) <= tw.range + b.r + slack;

// ---------------------------------------------------------------- геометрия луча Шприца и расстояние до организма (по сети дорожек из getGraph)

/** Сколько направлений у луча (src/level.ts: AIM_STEPS): шаг поворота 360° / AIM_STEPS. */
const AIM_STEPS = (() => {
  const found = /AIM_STEPS\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(ROOT, 'src', 'level.ts'), 'utf8'));
  if (!found) throw new Error('В src/level.ts нет AIM_STEPS');
  return Number(found[1]);
})();
/** Угол направления с номером k: 0 — вправо, дальше по часовой стрелке (как на экране игры, где ось y смотрит вниз), радианы. */
const aimAngleOf = (k) => ((((k % AIM_STEPS) + AIM_STEPS) % AIM_STEPS) / AIM_STEPS) * Math.PI * 2;
/** Кратчайший поворот от направления a к b: сколько шагов и в какую сторону (+1 — по часовой стрелке, −1 — против). */
function aimTurn(a, b) {
  const d = (((b - a) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
  return d <= AIM_STEPS / 2 ? { steps: d, dir: 1 } : { steps: AIM_STEPS - d, dir: -1 };
}
/** Где точка относительно луча из башни tw (мир, px) в направлении k: расстояние вдоль луча и до его оси. */
function beamGeom(b, tw, k) {
  const a = aimAngleOf(k);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const dx = b.x - tw.x;
  const dy = b.y - tw.y;
  return { along: dx * ux + dy * uy, across: Math.abs(-dx * uy + dy * ux) };
}
/** Полуширина попадания луча по бактерии радиуса r (как в Tower.beamHits): половина луча плюс 0,7 радиуса бактерии. */
const beamReachOf = (r) => TW.syringe.beamHalfWidthPx + 0.7 * r;
/** Бактерия «точно на луче» (с запасом m пикселей): впереди башни и ближе к оси, чем нужно для попадания. */
const onBeam = (b, tw, k, m) => {
  const g = beamGeom(b, tw, k);
  return g.along >= m && g.across <= beamReachOf(b.r) - m;
};
/** Бактерия «точно вне луча»: позади башни или дальше от оси, чем нужно для попадания, на запас m. */
const offBeam = (b, tw, k, m) => {
  const g = beamGeom(b, tw, k);
  return g.along < -m || g.across > beamReachOf(b.r) + m;
};
/**
 * Сколько пикселей дорожек накрывает полоса луча из точки (x, y) в направлении k (как beamCoverage в src/level.ts: середины кусочков рёбер, попавшие
 * в полосу). only — только эти рёбра (номера), minAlong — не ближе этого расстояния от башни.
 */
function beamCoverageAt(x, y, k, halfW, { only = null, minAlong = 0 } = {}) {
  const a = aimAngleOf(k);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  let total = 0;
  for (const e of GRAPH.edges) {
    if (only && !only.has(e.id)) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const mx = (e.pts[i][0] + e.pts[i - 1][0]) / 2 - x;
      const my = (e.pts[i][1] + e.pts[i - 1][1]) / 2 - y;
      const along = mx * ux + my * uy;
      if (along < minAlong || along > 3000) continue;
      if (Math.abs(-mx * uy + my * ux) > halfW) continue;
      total += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    }
  }
  return total;
}
/** Направление луча, которое игра выбирает при постановке башни (где под лучом больше всего дорожки; запас к полуширине — как BEAM_COVER_MARGIN в src/objects/Tower.ts). */
function defaultAimAt(x, y) {
  let best = 0;
  let bestValue = -1;
  for (let k = 0; k < AIM_STEPS; k++) {
    const v = beamCoverageAt(x, y, k, TW.syringe.beamHalfWidthPx + 22);
    if (v > bestValue) {
      bestValue = v;
      best = k;
    }
  }
  return { k: best, coverage: bestValue };
}

/** Точка на ребре графа на расстоянии s от его начала (по ломаной из getGraph). */
function pointOnEdge(edgeId, s) {
  const pts = GEO.byId.get(edgeId).pts;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= s || i === pts.length - 1) {
      const u = d > 0 ? Math.max(0, Math.min(1, (s - acc) / d)) : 0;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u };
    }
    acc += d;
  }
  return { x: pts[0][0], y: pts[0][1] };
}
let REMAINING_TABLE = null;
/** Сколько пикселей до организма по дорожкам от точки мира: берётся ближайшая точка сети (как remainingNear в src/level.ts) — расстояние до конца её ребра плюс самый короткий путь от конца ребра. */
function remainingAtPoint(x, y) {
  if (!REMAINING_TABLE) {
    const memo = new Map();
    const nodeRemaining = (node) => {
      if (memo.has(node)) return memo.get(node);
      const next = GRAPH.edges.filter((e) => e.from === node);
      const v = next.length ? Math.min(...next.map((e) => e.length + nodeRemaining(e.to))) : 0;
      memo.set(node, v);
      return v;
    };
    REMAINING_TABLE = GRAPH.edges.map((e) => {
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
      return { e, cum, end: nodeRemaining(e.to) };
    });
  }
  let best = Infinity;
  let value = 0;
  for (const { e, cum, end } of REMAINING_TABLE) {
    for (let i = 0; i < e.pts.length; i++) {
      const d = Math.hypot(e.pts[i][0] - x, e.pts[i][1] - y);
      if (d < best) {
        best = d;
        value = e.length - cum[i] + end;
      }
    }
  }
  return value;
}

/** Тап по левой (dir −1) или правой (+1) половине башни в клетке: так поворачивается Шприц. Смещение — четверть клетки на экране. */
async function tapTowerHalf(game, col, row, dir) {
  const s = await game.state();
  const c = await game.cell(col, row);
  const dx = 0.25 * s.map.tile * s.camera.zoom * game.screen.scale;
  await game.input.tap({ x: c.x + dir * dx, y: c.y });
  await settle();
}
/** Поворачивает Шприц в клетке к направлению target самым коротким путём (тапами); возвращает последнее состояние. */
async function turnSyringeTo(game, col, row, target) {
  let s = await game.state();
  const tw = s.towers.find((t) => t.col === col && t.row === row);
  const { steps, dir } = aimTurn(tw.aim, target);
  for (let i = 0; i < steps; i++) await tapTowerHalf(game, col, row, dir);
  s = await game.state();
  return s;
}

/** Сдвигает карту до левого (виден «ствол» у организма) или правого (видны входы) края. */
async function panTo(game, side) {
  if (side === 'left') await game.input.drag(game.g(40, 360), game.g(1040, 360));
  else await game.input.drag(game.g(1040, 360), game.g(40, 360));
  await settle();
}

/** n свободных клеток, ближайших к «стволу» (узлу с тремя выходами): рядом с дорожкой, видны при карте у левого края. */
function trunkCells(n) {
  const trunk = Object.entries(GEO.outOf).find(([, v]) => v.length === 3);
  const z = GEO.byId.get(trunk[1][0]).pts[0];
  const free = [];
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      free.push({ col, row, d: Math.hypot(c.x - z[0], c.y - z[1]) });
    }
  }
  return free.sort((a, b) => a.d - b.d || a.col - b.col || a.row - b.row).slice(0, n).map((c) => [c.col, c.row]);
}

/** Свободная клетка у среднего входа (прямое ребро справа): бактерии доходят до неё за секунды. Видна при карте у правого края. */
function entranceCell() {
  const id = GRAPH.entrances.map((e) => ({ id: e, y: GEO.byId.get(e).pts[0][1] })).sort((a, b) => a.y - b.y)[1].id;
  const pts = GEO.byId.get(id).pts;
  let acc = 0;
  let q = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= 250) {
      const u = (250 - acc) / d;
      q = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
      break;
    }
    acc += d;
  }
  let best = null;
  for (let col = 12; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      const d = Math.hypot(c.x - q[0], c.y - q[1]);
      if (!best || d < best.d) best = { col, row, d };
    }
  }
  return best;
}

/** Расстояния между кадрами записи: путь вдоль дорожек между двумя замерами одной бактерии (null — рёбра не соседние). */
function progressBetween(prev, cur) {
  if (cur.edge === prev.edge) return cur.s - prev.s;
  const pe = GEO.byId.get(prev.edge);
  const ce = GEO.byId.get(cur.edge);
  if (pe.to === ce.from) return pe.length - prev.s + cur.s;
  const mid = (GEO.outOf[pe.to] ?? []).find((id) => GEO.byId.get(id).to === ce.from);
  return mid === undefined ? null : pe.length - prev.s + GEO.byId.get(mid).length + cur.s;
}

/** Скорости (px/с) по парам замеров одной бактерии: когда замедлена в обоих замерах и когда не замедлена ни в одном. Скорость кокка постоянна, поэтому считается точно. */
function segmentSpeeds(tr) {
  const slow = [];
  const norm = [];
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1];
    const b = tr[i];
    const dt = b.e - a.e;
    if (dt < 0.05 || a.slowed !== b.slowed) continue;
    const d = progressBetween(a, b);
    if (d === null) continue;
    (b.slowed ? slow : norm).push(d / dt);
  }
  return { slow, norm };
}

/** Непрерывные отрезки замедления одной бактерии: [{a, b}] — номера первого и последнего замера с slowed. */
function slowRuns(tr) {
  const runs = [];
  for (let i = 0; i < tr.length; i++) {
    if (!tr[i].slowed) continue;
    if (runs.length && runs[runs.length - 1].b === i - 1) runs[runs.length - 1].b = i;
    else runs.push({ a: i, b: i });
  }
  return runs;
}

/** Запись полного состояния бактерий по ходу игры (с hp и замедлением). */
function recordFull(traces, s) {
  for (const b of s.bacteria) {
    if (!traces.has(b.id)) traces.set(b.id, []);
    traces.get(b.id).push({ ...b, e: s.elapsed, slows: s.slows, shots: s.shots });
  }
}

/** Цвета цен на кнопках: сколько «золотых» и «красных» точек в том месте, где нарисована цена башни (экран игры). */
async function priceColors(game, png, btn) {
  const points = [];
  for (let gy = btn.y - btn.h / 2 + 66; gy <= btn.y - btn.h / 2 + 94; gy += 1) {
    for (let gx = btn.x - btn.w / 2 + 98; gx <= btn.x - btn.w / 2 + 152; gx += 1) {
      const c = game.screen.g2c(gx, gy);
      points.push([c.x, c.y]);
    }
  }
  const px = await samplePixels(game.page, png, points);
  let gold = 0;
  let red = 0;
  for (const [r, g, b] of px) {
    if (r >= 225 && g >= 185 && g <= 235 && b <= 115) gold++;
    else if (r >= 225 && g >= 85 && g <= 135 && b >= 100 && b <= 150) red++;
  }
  return { gold, red, kind: gold >= 12 && red < 4 ? 'gold' : red >= 12 && gold < 4 ? 'red' : 'unclear' };
}

/** Подсказка внизу окна карты: сколько белых точек текста и где он начинается и кончается по горизонтали (экран игры, px). Сканируется только окно карты
 *  (x до 1078): правее начинается панель, и белые цифры кнопки скорости «×1» не должны считаться текстом подсказки. */
async function hintExtent(game, png) {
  const points = [];
  const xs = [];
  for (let gy = 664; gy <= 702; gy += 2) {
    for (let gx = 0; gx <= 1078; gx += 3) {
      const c = game.screen.g2c(gx, gy);
      points.push([c.x, c.y]);
      xs.push(gx);
    }
  }
  const px = await samplePixels(game.page, png, points);
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  px.forEach(([r, g, b], i) => {
    if (r >= 215 && g >= 215 && b >= 215) {
      count++;
      minX = Math.min(minX, xs[i]);
      maxX = Math.max(maxX, xs[i]);
    }
  });
  return { count, minX, maxX };
}

// ---------------------------------------------------------------- тексты (i18n)

function towersTexts() {
  const p = '[башни: тексты]';
  const keys = ['towerPill', 'towerSyrup', 'towerFizz', 'towerSyringe', 'tagPill', 'tagSyrup', 'tagFizz', 'tagSyringe', 'infoSyrup', 'infoFizz', 'infoSyringe', 'hintRotate', 'startWave'];
  const rows = keys.map((k) => {
    try {
      const [ru, en] = readI18n(k);
      return { k, ru, en, ok: true };
    } catch {
      return { k, ru: '', en: '', ok: false };
    }
  });
  const missing = rows.filter((r) => !r.ok).map((r) => r.k);
  check(`${p} в i18n.ts есть все ${keys.length} строк башен на обоих языках (${keys.join(', ')})`, missing.length === 0, missing.length ? `нет: ${missing.join(', ')}` : '');
  const cyr = /[А-Яа-яЁё]/;
  const bad = rows.filter((r) => r.ok && (!r.ru.trim() || !r.en.trim() || r.ru === r.en || !cyr.test(r.ru) || cyr.test(r.en)));
  check(`${p} русские строки по-русски, английские по-английски, обе не пустые и различаются`, bad.length === 0, bad.map((r) => `${r.k}: «${r.ru}» / «${r.en}»`).join('; '));
  const syrup = rows.find((r) => r.k === 'infoSyrup');
  check(`${p} подсказка Сиропа на обоих языках содержит вставку {pct} (на сколько процентов лужа замедляет — из config.ts)`, Boolean(syrup?.ok) && ['ru', 'en'].every((l) => syrup[l].includes('{pct}')), syrup ? `${syrup.ru} / ${syrup.en}` : '');
  const names = rows.filter((r) => r.k.startsWith('tower') && r.ok).map((r) => r.ru);
  check(`${p} названия четырёх башен различаются: ${names.join(', ')}`, new Set(names).size === 4);
}

// ---------------------------------------------------------------- панель: четыре кнопки

/** Панель на одном экране: порядок и размещение кнопок, выбор и снятие выбора, цвет цен, подсказка внизу целиком в окне. */
async function towersPanel(browser, baseUrl, deviceKey, lang, { full = false } = {}) {
  const device = VIEWPORTS[deviceKey];
  const p = `[башни: панель, ${device.label}, ${lang}]`;
  const name = `${deviceKey}-${lang}`;
  const context = await newDeviceContext(browser, device, lang);
  const coins = TW.syringe.price; // хватает не на все башни (в таблице цены разные)
  const game = await openGame(context, baseUrl, p, { speed: 1, isTouch: device.hasTouch, cfg: `economy.startCoins:${coins},waves.firstDelaySec:600,${FIXED_NO_TOWERS.join(',')}` });
  const { page, input } = game;
  let s = await game.state();
  const btns = s.ui.towerButtons;
  check(`${p} на панели ровно четыре кнопки башен в порядке ${TOWER_IDS.join(', ')}`, btns.length === 4 && btns.map((b) => b.id).join() === TOWER_IDS.join(), btns.map((b) => b.id).join(', '));
  const inside = btns.every((b) => b.x - b.w / 2 >= s.viewW && b.x + b.w / 2 <= W && b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= H);
  const ordered = btns.every((b, i) => i === 0 || b.y - b.h / 2 >= btns[i - 1].y + btns[i - 1].h / 2);
  const abovePause = btns[btns.length - 1].y + btns[btns.length - 1].h / 2 <= s.ui.pauseButton.y - 24;
  check(`${p} кнопки целиком на панели справа, не налезают друг на друга и на кнопку паузы (последняя кончается на y=${f1(btns[3].y + btns[3].h / 2)}, пауза на y=${s.ui.pauseButton.y})`, inside && ordered && abovePause, `inside=${inside} ordered=${ordered} abovePause=${abovePause}`);
  check(`${p} кнопка «towerButton» (прежняя) — это первая: Таблетка`, s.ui.towerButton.x === btns[0].x && s.ui.towerButton.y === btns[0].y);
  await sleep(300);
  const png0 = await shot(page, `towers-01-panel-${name}`);

  if (full) {
    // цвет цены: золотая, если монет хватает, красная, если нет (у каждой башни — по своей цене из config.ts: порядок цен не по возрастанию)
    const want = TOWER_IDS.map((id) => (TW[id].price <= coins ? 'gold' : 'red'));
    const got = [];
    for (const b of btns) got.push((await priceColors(game, png0, b)).kind);
    check(`${p} при ${coins} монетах цены на кнопках: ${TOWER_IDS.map((id, i) => `${id} ${TW[id].price} — ${want[i] === 'gold' ? 'золотая' : 'красная'}`).join('; ')}`, got.join() === want.join(), `по снимку: ${got.join(', ')}; ждали: ${want.join(', ')}`);
  }

  // выбор: тап по каждой кнопке выбирает именно её; повторный тап снимает; тап по другой кнопке переключает
  const picked = [];
  const reTap = [];
  const hints = [];
  for (const id of TOWER_IDS) {
    await game.selectTower(id);
    s = await game.state();
    picked.push(s.selected === id);
    if (!device.hasTouch) {
      await input.hover(await game.cell(...FREE.d));
      await sleep(250);
    }
    await sleep(150);
    const png = await shot(page, `towers-02-selected-${id}-${name}`);
    hints.push({ id, ...(await hintExtent(game, png)) });
    await game.selectTower(id);
    s = await game.state();
    reTap.push(s.selected === null);
    if (!device.hasTouch) await input.hover(game.g(1180, 620));
  }
  check(`${p} тап по кнопке выбирает именно эту башню (selected: ${TOWER_IDS.join(', ')})`, picked.every(Boolean), picked.join());
  check(`${p} повторный тап по той же кнопке снимает выбор`, reTap.every(Boolean), reTap.join());
  await game.selectTower('syrup');
  await game.selectTower('fizz');
  s = await game.state();
  check(`${p} тап по другой кнопке переключает выбор (Сироп → Шипучка: selected = ${s.selected})`, s.selected === 'fizz');
  await game.selectTower('fizz');
  // подсказка внизу есть у каждой башни и целиком внутри окна карты (не залезает на панель)
  for (const h of hints) {
    check(`${p} нижняя подсказка при выборе башни «${h.id}» видна и целиком в окне карты (текст от ${h.minX} до ${h.maxX} px из 1080, точек текста ${h.count})`, h.count >= 100 && h.minX >= 8 && h.maxX <= 1074, `точек ${h.count}, ${h.minX}…${h.maxX}`);
  }
  // тап по пустой клетке без башни по-прежнему ничего не ставит
  await game.tapCell(...FREE.a);
  s = await game.state();
  check(`${p} после снятия выбора тап по свободной клетке башню не ставит`, s.towers.length === 0 && s.coins === coins, `башен ${s.towers.length}, монет ${s.coins}`);
  await context.close();
}

// ---------------------------------------------------------------- цены

async function towersPrices(browser, baseUrl) {
  const p = '[башни: цены]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const sum = TOWER_IDS.reduce((x, id) => x + TW[id].price, 0);
  // ---- A. монет ровно на все четыре башни: каждая списывает ровно свою цену, последняя ставится на «ровно хватает»
  let game = await openGame(context, baseUrl, p, { speed: 1, cfg: `economy.startCoins:${sum},waves.firstDelaySec:600,${FIXED_NO_TOWERS.join(',')}` });
  await panTo(game, 'left');
  const cells = trunkCells(5);
  let coins = sum;
  const steps = [];
  let s = await game.state();
  for (let i = 0; i < TOWER_IDS.length; i++) {
    const id = TOWER_IDS[i];
    await game.selectTower(id);
    await game.tapCell(...cells[i]);
    const after = await game.state();
    const placed = after.towers.length === i + 1 && after.towers[i].id === id && after.towers[i].col === cells[i][0] && after.towers[i].row === cells[i][1];
    steps.push({ id, ok: placed && after.coins === coins - TW[id].price && after.effects.placements === i + 1, spent: coins - after.coins, price: TW[id].price });
    coins = after.coins;
    s = after;
  }
  check(`${p} постановка каждой башни списывает ровно её цену: ${steps.map((x) => `${x.id} −${x.spent} (в таблице ${x.price})`).join('; ')}`, steps.every((x) => x.ok), steps.filter((x) => !x.ok).map((x) => `${x.id}: списано ${x.spent}, цена ${x.price}`).join('; '));
  check(`${p} в итоге четыре башни поставлены (по одной каждого вида), монет осталось ${s.coins} (ждали 0: хватило ровно)`, s.towers.map((t) => t.id).join() === TOWER_IDS.join() && s.coins === 0, `башни ${s.towers.map((t) => t.id).join(',')}, монет ${s.coins}`);
  await sleep(300);
  await shot(game.page, 'towers-05-four-placed');
  // монет 0: ни одна из четырёх не ставится, монеты и башни те же
  const placementsBefore = s.effects.placements;
  const refused = [];
  for (const id of TOWER_IDS) {
    await game.selectTower(id);
    await game.tapCell(...cells[4]);
    const q = await game.state();
    refused.push(q.towers.length === 4 && q.coins === 0 && q.effects.placements === placementsBefore);
  }
  check(`${p} при 0 монет ни одна из четырёх башен не ставится (монеты и башни не меняются)`, refused.every(Boolean), refused.join());
  await game.page.close();

  // ---- B. на одну монету меньше цены: башня этого вида не ставится
  const short = [];
  for (const id of TOWER_IDS) {
    game = await openGame(context, baseUrl, p, { speed: 1, cfg: `economy.startCoins:${TW[id].price - 1},waves.firstDelaySec:600,${FIXED_NO_TOWERS.join(',')}` });
    await game.selectTower(id);
    await game.tapCell(...FREE.a);
    const q = await game.state();
    short.push({ id, ok: q.towers.length === 0 && q.coins === TW[id].price - 1 && q.effects.placements === 0 && q.selected === id, coins: q.coins });
    await game.page.close();
  }
  check(`${p} на одну монету меньше цены башня не ставится (монеты те же): ${short.map((x) => `${x.id} при ${TW[x.id].price - 1}`).join('; ')}`, short.every((x) => x.ok), short.filter((x) => !x.ok).map((x) => `${x.id}: монет ${x.coins}`).join('; '));
  await context.close();
}

// ---------------------------------------------------------------- Сироп: лужа на дорожке

/** Записи по бактериям из журнала состояний: id → список замеров { …бактерия, e: игровое время }. */
function tracesOf(log) {
  const traces = new Map();
  for (const s of log) {
    for (const b of s.bacteria) {
      if (!traces.has(b.id)) traces.set(b.id, []);
      traces.get(b.id).push({ ...b, e: s.elapsed });
    }
  }
  return traces;
}

/**
 * Один прогон Сиропа: башня в клетке (по умолчанию у «ствола» — через него идут все бактерии; minZoom — вся карта, клетка дальше всех от дорожек), волна,
 * журнал состояний (кадр за кадром). wave — подмена состава волн (по умолчанию `count` кокков), cfg — прочие подмены, stopWhen(состояние, журнал) — когда закончить
 * (кроме победы и проигрыша).
 */
async function syrupPlay(context, baseUrl, p, { cfg = [], count = 2, interval, wave = null, speed = 3, minZoom = false, stopWhen = null, shotName = null, timeoutMs = 150000 }) {
  const waveTokens = wave ?? ['waves.total:1', `waves.list.0.coccus:${count}`];
  const all = [...waveTokens, `waves.intervalStartSec:${interval}`, `waves.intervalEndSec:${interval}`, 'waves.firstDelaySec:2', ...FIXED_NO_TOWERS, `economy.startCoins:${TW.syrup.price}`, NO_LIFE_LOSS, ...cfg].join(',');
  const game = await openGame(context, baseUrl, p, { speed, cfg: all });
  let cell;
  if (minZoom) {
    for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500);
    await settle();
    cell = farVisibleCell(await game.state());
  } else {
    await panTo(game, 'left');
    cell = nearTrunkCell();
  }
  const placed = await game.placeTowersOf('syrup', [[cell.col, cell.row]]);
  const log = [];
  let shotDone = false;
  const end = await pollUntil(game, async (st) => {
    log.push(st);
    if (shotName && !shotDone && st.puddles.length > 0) {
      const slowed = st.bacteria.find((b) => b.slowed);
      if (slowed) {
        const sx = st.viewW / 2 + (slowed.x - st.camera.cx) * st.camera.zoom;
        const sy = st.height / 2 + (slowed.y - st.camera.cy) * st.camera.zoom;
        if (sx > 100 && sx < 980 && sy > 80 && sy < 640) {
          await shot(game.page, shotName);
          shotDone = true;
        }
      }
    }
    return st.state === 'won' || st.state === 'lost' || (stopWhen !== null && stopWhen(st, log));
  }, timeoutMs, 20);
  await game.page.close();
  return { log, end, tower: placed.towers[0], placedCount: placed.towers.length, shotDone, cell };
}

/** Когда лужа появилась и исчезла (по журналу; в этих прогонах луж не больше одной одновременно): номера замеров, её центр и радиус, оценка времён. */
function puddleTimeline(log) {
  const first = log.findIndex((s) => s.puddles.length > 0);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < log.length && log[last + 1].puddles.length > 0) last++;
  const gone = last + 1 < log.length ? last + 1 : -1;
  return {
    first,
    last,
    gone,
    pud: log[first].puddles[0],
    e1: log[first].elapsed,
    ePrev: first > 0 ? log[first - 1].elapsed : log[first].elapsed,
    eLast: log[last].elapsed,
    e2: gone >= 0 ? log[gone].elapsed : null,
  };
}

/**
 * Замедление и лужа, по замерам: (А) бактерия, которая на прошлом замере была внутри лужи (с запасом 12 px) и лужа жила, на этом замере замедлена;
 * (Б) замедленная бактерия не бывает вдали от лужи: в последние slowSec секунд (плюс шаг замеров) она была внутри лужи (с запасом 14 px), пока лужа жила.
 * Бактерия «внутри», если её центр не дальше радиуса лужи плюс 0,35 радиуса бактерии (как Puddle.covers).
 */
function slowSemantics(log, tl, slowSec) {
  const traces = tracesOf(log);
  const R = tl.pud.r;
  const strictAlive = (e) => e >= tl.e1 && e <= tl.eLast;
  const maybeAlive = (e) => e >= tl.ePrev && (tl.e2 === null || e <= tl.e2);
  const cover = (b, margin) => Math.hypot(b.x - tl.pud.x, b.y - tl.pud.y) <= R + 0.35 * b.r + margin;
  const out = { inside: 0, slowedSamples: 0, violA: [], violB: [], runs: 0, insideSamples: 0 };
  for (const [id, tr] of traces) {
    out.runs += slowRuns(tr).length;
    for (let i = 0; i < tr.length; i++) {
      const b = tr[i];
      if (b.slowed) out.slowedSamples++;
      if (cover(b, 0) && maybeAlive(b.e)) out.insideSamples++;
      if (i > 0) {
        const a = tr[i - 1];
        if (strictAlive(a.e) && strictAlive(b.e) && cover(a, -12)) {
          out.inside++;
          if (!b.slowed) out.violA.push(`#${id} на ${f2(b.e)} с`);
        }
      }
      if (b.slowed) {
        let ok = false;
        for (let j = i; j >= 0 && b.e - tr[j].e <= slowSec + 0.4; j--) {
          if (maybeAlive(tr[j].e) && cover(tr[j], 14)) {
            ok = true;
            break;
          }
        }
        if (!ok) out.violB.push(`#${id} на ${f2(b.e)} с`);
      }
    }
  }
  return out;
}

async function towersSyrup(browser, baseUrl) {
  const p = '[башни: Сироп]';
  const { slowFactor, slowSec, puddleRadius, puddleSec, puddleLeadPx, range, projectileSpeed } = TW.syrup;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');

  // ---- S1: один выстрел за партию (пауза 60 с): капля летит и оставляет лужу впереди бактерии; лужа живёт puddleSec; в луже все идут в slowFactor раз медленнее
  const r1 = await syrupPlay(context, baseUrl, p, { cfg: ['towers.syrup.cooldownMs:60000', 'types.coccus.hp:99'], count: 2, interval: 12, shotName: 'towers-08-syrup-puddle' });
  const L = r1.log;
  const tl = puddleTimeline(L);
  const maxPuddles = Math.max(...L.map((s) => s.puddles.length));
  check(`${p} Сироп поставлен у «ствола» и сделал ровно один выстрел (пауза 60 с): выстрелов ${r1.end.shots}, всплесков луж ${r1.end.effects.splats}, одновременно луж не больше ${maxPuddles}`, r1.placedCount === 1 && r1.end.shots === 1 && r1.end.effects.splats === 1 && maxPuddles === 1 && tl !== null, `выстрелов ${r1.end.shots}, всплесков ${r1.end.effects.splats}, луж ${maxPuddles}`);
  if (!tl) {
    check(`${p} лужа появилась (без неё остальные проверки Сиропа невозможны)`, false, 'лужи не было');
  } else {
    const tw = r1.tower;
    const iShot = L.findIndex((s) => s.shots >= 1);
    const air = iShot >= 0 && iShot < tl.first && L[iShot].puddles.length === 0 && L[iShot].projectiles >= 1;
    const cand = (L[iShot]?.bacteria ?? []).filter((b) => b.hp > 0 && Math.hypot(b.x - tw.x, b.y - tw.y) <= range + b.r).sort((a, b) => a.remaining - b.remaining);
    const target = cand[0];
    const flight = tl.e1 - (L[iShot]?.elapsed ?? 0);
    const expectFlight = (Math.hypot(tl.pud.x - tw.x, tl.pud.y - tw.y) - 36) / projectileSpeed;
    check(`${p} капля летит к дорожке, а не появляется сразу: на первом замере после выстрела она в воздухе, лужи ещё нет; до лужи ${f2(flight)} с (по расстоянию и скорости капли ${projectileSpeed} px/с ждали ≈ ${f2(expectFlight)} с, допуск ±0,35)`, air && Math.abs(flight - expectFlight) <= 0.35, `в воздухе ${air}, замеров между выстрелом и лужей ${tl.first - iShot}`);
    const dPath = GEO.distToAnyCurve({ x: tl.pud.x, y: tl.pud.y });
    const dTower = Math.hypot(tl.pud.x - tw.x, tl.pud.y - tw.y);
    check(`${p} лужа лежит на дорожке (до кривой ${f2(dPath)} px ≤ 2), радиус ${tl.pud.r} px (в таблице ${puddleRadius}), в пределах досягаемости башни (до башни ${f1(dTower)} px ≤ радиус ${range} + полрадиуса лужи ${puddleRadius / 2})`, dPath <= 2 && Math.abs(tl.pud.r - puddleRadius) < 0.01 && dTower <= range + puddleRadius / 2 + 1, `до кривой ${f2(dPath)}, радиус ${tl.pud.r}, до башни ${f1(dTower)}`);
    const diff = target ? target.remaining - remainingAtPoint(tl.pud.x, tl.pud.y) : NaN;
    check(`${p} лужа лежит ВПЕРЕДИ бактерии, в которую целилась башня (ближайшей к организму в радиусе): до организма у бактерии на ${f1(diff)} px больше, чем у лужи (ждали от 20 до ${puddleLeadPx} + 45 px)`, Boolean(target) && diff >= 20 && diff <= puddleLeadPx + 45, target ? `бактерия #${target.id}` : 'цели в радиусе не было');
    // при первом замере лужа жива меньше четверти секунды: её left чуть меньше puddleSec; исчезает она, когда left кончился
    const left1 = tl.pud.left;
    check(`${p} лужа живёт ${puddleSec} с: на первом замере после падения капли ей осталось ${f2(left1)} с (ждали ${f2(puddleSec - 0.45)}…${puddleSec}); видна была ${f2(tl.eLast - tl.e1)} с после этого замера, к следующему замеру её уже нет (${tl.e2 === null ? '—' : f2(tl.e2 - tl.e1)} с); исчезла вовремя (допуск ±0,15)`, tl.e2 !== null && left1 <= puddleSec + 0.01 && left1 >= puddleSec - 0.45 && tl.eLast - tl.e1 <= left1 + 0.15 && tl.e2 - tl.e1 >= left1 - 0.15, `left ${f2(left1)}, видна ${f2(tl.eLast - tl.e1)}…${tl.e2 === null ? '—' : f2(tl.e2 - tl.e1)} с`);
    const sem = slowSemantics(L, tl, slowSec);
    check(`${p} бактерия внутри лужи замедлена всегда (проверено ${sem.inside} замеров, не замедлена в ${sem.violA.length}); замедленная бактерия не бывает вдали от лужи: замедленных замеров ${sem.slowedSamples}, без причины ${sem.violB.length}`, sem.inside >= 6 && sem.violA.length === 0 && sem.violB.length === 0 && sem.slowedSamples >= 6, [...sem.violA, ...sem.violB].slice(0, 4).join('; ') || `внутри ${sem.inside}, замедленных ${sem.slowedSamples}`);
    const traces = tracesOf(L);
    const slowest = [...traces.values()].sort((a, b) => b.filter((q) => q.slowed).length - a.filter((q) => q.slowed).length)[0] ?? [];
    const sp = segmentSpeeds(slowest);
    const ratio = medianOf(sp.slow) / medianOf(sp.norm);
    check(`${p} в луже бактерия идёт в ${slowFactor} раза от обычной скорости: ${f1(medianOf(sp.slow))} px/с против ${f1(medianOf(sp.norm))} px/с, отношение ${f2(ratio)} (ждали ${slowFactor} ±0,03; замеров ${sp.slow.length} и ${sp.norm.length})`, sp.slow.length >= 4 && sp.norm.length >= 8 && Math.abs(ratio - slowFactor) <= 0.03, `отношение ${f2(ratio)}`);
    // выход из лужи: замедление держится ещё ≈ slowSec секунд
    let i1 = -1;
    for (let i = 0; i < slowest.length; i++) if (slowest[i].slowed && Math.hypot(slowest[i].x - tl.pud.x, slowest[i].y - tl.pud.y) <= tl.pud.r + 0.35 * slowest[i].r) i1 = i;
    const i2 = i1 >= 0 ? slowest.findIndex((q, i) => i > i1 && !q.slowed) : -1;
    if (i1 >= 0 && i2 > i1 && i1 + 1 < slowest.length) {
      const lo = slowest[i2 - 1].e - slowest[i1 + 1].e;
      const hi = slowest[i2].e - slowest[i1].e;
      check(`${p} после выхода из лужи замедление держится ещё ≈ ${slowSec} с (по замерам от ${f2(lo)} до ${f2(hi)} с, допуск ±0,1)`, slowSec >= lo - 0.1 && slowSec <= hi + 0.1, `последний замер в луже на ${f2(slowest[i1].e)} с, первый без замедления на ${f2(slowest[i2].e)} с`);
    } else {
      check(`${p} после выхода из лужи замедление держится ещё ≈ ${slowSec} с (выход из лужи виден в записи)`, false, `i1 ${i1}, i2 ${i2}`);
    }
    check(`${p} счётчик замедлений игры совпадает с записью: ${r1.end.slows} вхождений в замедление, в записи ${sem.runs} непрерывных отрезков замедления`, r1.end.slows === sem.runs && sem.runs >= 1, `slows ${r1.end.slows}, отрезков ${sem.runs}`);
  }
  check(`${p} снимок лужи Сиропа с замедленной бактерией сделан`, r1.shotDone);

  // ---- S2: поверх старой лужи новая не кладётся. Лужа почти останавливает бактерию (slowFactor 0,02), выстрел «в точку под ней» (puddleLeadPx 0), пауза 1 с
  const COOL = 1000;
  const r2 = await syrupPlay(context, baseUrl, p, {
    cfg: [`towers.syrup.cooldownMs:${COOL}`, 'towers.syrup.puddleLeadPx:0', 'towers.syrup.slowFactor:0.02', 'types.coccus.hp:99'],
    count: 1,
    interval: 1,
    stopWhen: (st, log) => {
      const i = log.findIndex((q) => q.puddles.length > 0);
      return i >= 0 && st.elapsed >= log[i].elapsed + 5.2;
    },
  });
  const L2 = r2.log;
  const tl2 = puddleTimeline(L2);
  if (!tl2) {
    check(`${p} Сироп с паузой ${COOL} мс положил лужу (без неё проверка «поверх старой» невозможна)`, false, 'лужи не было');
  } else {
    const win = L2.filter((s) => s.elapsed >= tl2.e1 && s.elapsed <= tl2.e1 + 5);
    const span = win.length ? win[win.length - 1].elapsed - win[0].elapsed : 0;
    const extra = win.length ? win[win.length - 1].shots - L2[tl2.first].shots : 99;
    const near = win.every((s) => s.bacteria.some((b) => b.hp > 0 && inReach({ ...r2.tower, range }, b)));
    check(`${p} поверх старой лужи новая не кладётся: за ${f1(span)} с после первой лужи (пауза ${COOL / 1000} с, бактерия всё время в радиусе башни и почти стоит) выстрелов ещё ${extra} (≤ 1; без запрета было бы ≥ 4)`, span >= 4.5 && near && extra <= 1, `окно ${f1(span)} с, в радиусе всё время: ${near}`);
  }

  // ---- S2б: обычная лужа и пауза 1 с: Сироп кладёт лужи цепочкой вперёд по дорожке, но никогда ближе 0,8 радиуса к уже лежащей, и не чаще паузы
  const r2b = await syrupPlay(context, baseUrl, p, {
    cfg: [`towers.syrup.cooldownMs:${COOL}`, 'types.coccus.hp:99'],
    count: 1,
    interval: 1,
    stopWhen: (st) => st.shots >= 5,
  });
  const L2b = r2b.log;
  const maxP = Math.max(...L2b.map((q) => q.puddles.length));
  let minPair = Infinity;
  for (const q of L2b) for (let i = 0; i < q.puddles.length; i++) for (let j = i + 1; j < q.puddles.length; j++) minPair = Math.min(minPair, Math.hypot(q.puddles[i].x - q.puddles[j].x, q.puddles[i].y - q.puddles[j].y));
  check(`${p} при паузе ${COOL / 1000} с Сироп кладёт несколько луж цепочкой (выстрелов ${r2b.end.shots}, одновременно до ${maxP} луж), и две лужи никогда не ближе 0,8 радиуса (${f1(0.8 * puddleRadius)} px): наименьшее расстояние ${minPair === Infinity ? '—' : f1(minPair)} px`, r2b.end.shots >= 3 && maxP >= 2 && minPair >= 0.8 * puddleRadius - 0.5, `выстрелов ${r2b.end.shots}, луж ${maxP}, расстояние ${f1(minPair)}`);
  const at = [];
  for (let i = 1; i < L2b.length; i++) for (let k = L2b[i - 1].shots; k < L2b[i].shots; k++) at.push(L2b[i].elapsed);
  const gaps = at.slice(1).map((e, i) => e - at[i]);
  check(`${p} между выстрелами Сиропа не меньше паузы ${COOL / 1000} с: выстрелов ${at.length}, промежутки ${gaps.map(f2).join(', ')} (допуск шага замеров 0,2)`, at.length >= 3 && gaps.every((g) => g >= COOL / 1000 - 0.2), gaps.map(f2).join(', '));

  // ---- S3: радиус башни. Башня в самой далёкой от дорожек клетке и радиус 100 (подмена): до бактерий не достаёт — не бросает капли, ничего не замедляется
  const FAR_RANGE = 100;
  const r3 = await syrupPlay(context, baseUrl, p, { cfg: [`towers.syrup.range:${FAR_RANGE}`, 'types.coccus.hp:3'], count: 2, interval: 1, speed: 4, minZoom: true });
  const dp3 = Math.min(...GRAPH.edges.map((e) => GEO.distToEdge(GEO.center(r3.cell.col, r3.cell.row), e.id)));
  const slowedSamples = r3.log.reduce((sum, s) => sum + s.bacteria.filter((b) => b.slowed).length, 0);
  check(`${p} Сироп вдали от дорожек (клетка ${r3.cell.col};${r3.cell.row}, до ближайшей дорожки ${Math.round(dp3)} px) при радиусе ${FAR_RANGE} px: не стреляет, луж нет, ни одна бактерия не замедлена`, r3.placedCount === 1 && dp3 > FAR_RANGE + 30 + 40 && r3.end.shots === 0 && r3.end.effects.splats === 0 && r3.log.every((s) => s.puddles.length === 0) && slowedSamples === 0 && r3.end.spawned === 2, `башня стоит ${r3.placedCount === 1}, выстрелов ${r3.end.shots}, всплесков ${r3.end.effects.splats}, замедленных замеров ${slowedSamples}, вышло ${r3.end.spawned}`);

  // ---- S4: слизень (slowImmune) лужей не замедляется: Сироп бросает лужу ему под ноги, он проходит через неё с обычной скоростью
  const slickRow = KINDS.includes('slick') ? { slick: 1 } : null;
  const r4 = await syrupPlay(context, baseUrl, p, { wave: wavesOnly(slickRow ?? { coccus: 1 }), cfg: ['towers.syrup.cooldownMs:60000'], interval: 2, speed: 4 });
  const tl4 = puddleTimeline(r4.log);
  const slickTrace = [...tracesOf(r4.log).values()][0] ?? [];
  const insideSlick = tl4 ? slickTrace.filter((q) => Math.hypot(q.x - tl4.pud.x, q.y - tl4.pud.y) <= tl4.pud.r - 5 && q.e >= tl4.e1 && q.e <= tl4.eLast).length : 0;
  check(`${p} слизень не замедляется лужей: башня бросила ей лужу (выстрелов ${r4.end.shots}, луж ${r4.end.effects.splats}), слизень прошёл через неё (замеров внутри ${insideSlick} ≥ 4), замедлений 0, замедленных замеров ${slickTrace.filter((q) => q.slowed).length}`, r4.end.shots === 1 && r4.end.effects.splats === 1 && insideSlick >= 4 && r4.end.slows === 0 && slickTrace.every((q) => !q.slowed), `выстрелов ${r4.end.shots}, slows ${r4.end.slows}`);
  await context.close();
}

/** Видимая при минимальном приближении свободная клетка, дальше всех от дорожек. */
function farVisibleCell(state) {
  let best = null;
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      const sx = state.viewW / 2 + (c.x - state.camera.cx) * state.camera.zoom;
      const sy = state.height / 2 + (c.y - state.camera.cy) * state.camera.zoom;
      if (sx < 70 || sx > state.viewW - 70 || sy < 70 || sy > state.height - 70) continue;
      const dp = Math.min(...GRAPH.edges.map((e) => GEO.distToEdge(c, e.id)));
      if (!best || dp > best.dp) best = { col, row, dp };
    }
  }
  return best;
}

// ---------------------------------------------------------------- Шипучка

/**
 * Разбор взрывов по записи состояний. Центр взрыва — место, где цель была в момент попадания: цель — бактерия, ближайшая к организму среди
 * достижимых в кадре выстрела (так выбирает башня); её положение до и после взрыва зажимает центр. Бактерия «точно внутри», если даже в самом
 * дальнем из двух замеров она ближе blastRadius + её радиус, «точно снаружи» — если и в самом близком дальше (с запасом на изгиб дорожки).
 */
function analyzeBlasts(log, tw, radius, damage) {
  const out = { fires: 0, blasts: 0, analyzed: 0, skipped: 0, hitsMax: 0, hitsList: [], sureIn: 0, sureOut: 0, inNotHit: [], outHit: [], wrongDamage: 0, invariantBad: 0 };
  const queue = [];
  for (let i = 1; i < log.length; i++) {
    const prev = log[i - 1];
    const cur = log[i];
    // учёт: взрывов не больше выстрелов и не меньше, чем выстрелов − 1 (один снаряд в полёте); когда снарядов в воздухе нет — поровну
    if (cur.state === 'playing' && (cur.effects.blasts > cur.shots || cur.shots - cur.effects.blasts > 1 || (cur.projectiles === 0 && cur.effects.blasts !== cur.shots))) out.invariantBad++;
    const nb = cur.effects.blasts - prev.effects.blasts;
    for (let k = 0; k < nb; k++) {
      out.blasts++;
      const fire = queue.shift();
      if (nb !== 1 || !fire) {
        out.skipped++;
        continue;
      }
      const pre = byIdMap(prev);
      const post = byIdMap(cur);
      const t0 = pre.get(fire.targetId);
      const t1 = post.get(fire.targetId);
      if (!t0 || !t1 || !(t1.hp < t0.hp)) {
        out.skipped++;
        continue;
      }
      out.analyzed++;
      let hits = 0;
      for (const [id, b1] of post) {
        const b0 = pre.get(id);
        if (!b0) continue;
        const hit = b1.hp < b0.hp;
        if (hit) {
          hits++;
          if (b0.hp - b1.hp !== damage) out.wrongDamage++;
        }
        if (id === fire.targetId) continue;
        const d0 = Math.hypot(b0.x - t0.x, b0.y - t0.y);
        const d1 = Math.hypot(b1.x - t1.x, b1.y - t1.y);
        const rel = Math.hypot(b1.x - t1.x - (b0.x - t0.x), b1.y - t1.y - (b0.y - t0.y));
        const lim = radius + b1.r;
        if (Math.max(d0, d1) + 6 <= lim) {
          out.sureIn++;
          if (!hit) out.inNotHit.push(`#${id}: ${f1(Math.max(d0, d1))} ≤ ${f1(lim)}`);
        }
        if (Math.min(d0, d1) - rel / 2 - 6 > lim) {
          out.sureOut++;
          if (hit) out.outHit.push(`#${id}: ${f1(Math.min(d0, d1))} > ${f1(lim)}`);
        }
      }
      out.hitsList.push(hits);
      out.hitsMax = Math.max(out.hitsMax, hits);
    }
    const ns = cur.shots - prev.shots;
    if (ns > 0) {
      out.fires += ns;
      const cand = cur.bacteria.filter((b) => b.hp > 0 && inReach(tw, b)).sort((a, b) => a.remaining - b.remaining);
      for (let k = 0; k < ns; k++) queue.push({ targetId: ns === 1 && cand[0] ? cand[0].id : null });
    }
  }
  return out;
}

async function towersFizz(browser, baseUrl) {
  const p = '[башни: Шипучка]';
  const R = TW.fizz.blastRadius;
  const dmg = TW.fizz.damage;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');

  // ---- A. у входа, медленные плотные кокки (положение почти не меняется между замерами): геометрия взрывов
  const cell = entranceCell();
  const cfgA = [
    'waves.total:1',
    'waves.list.0.coccus:40',
    'waves.intervalStartSec:0.3',
    'waves.intervalEndSec:0.3',
    'waves.firstDelaySec:4',
    ...FIXED_NO_TOWERS,
    'bacteria.baseSpeed:20',
    'types.coccus.hp:60',
    'towers.fizz.cooldownMs:1500',
    `economy.startCoins:${TW.fizz.price}`,
    NO_LIFE_LOSS,
  ].join(',');
  let game = await openGame(context, baseUrl, p, { speed: 2, cfg: cfgA });
  await panTo(game, 'right');
  const placed = await game.placeTowersOf('fizz', [[cell.col, cell.row]]);
  const tw = { ...placed.towers[0], range: TW.fizz.range };
  const log = [];
  const startedAt = Date.now();
  await pollUntil(game, (st) => {
    log.push(st);
    return st.state !== 'playing' || (st.effects.blasts >= 7 && st.projectiles === 0) || Date.now() - startedAt > 100000;
  }, 120000, 20);
  await game.page.close();
  const a = analyzeBlasts(log, tw, R, dmg);
  const last = log.at(-1);
  check(`${p} Шипучка поставлена у входа (клетка ${cell.col};${cell.row}) и сделала ${last.shots} выстрелов; взрывов ${last.effects.blasts}: каждый выстрел даёт ровно один взрыв (взрывов не больше выстрелов, разница ≤ 1 снаряда в полёте, без снарядов в воздухе — поровну; нарушений ${a.invariantBad})`, placed.towers.length === 1 && placed.towers[0].id === 'fizz' && last.shots >= 6 && last.effects.blasts >= 6 && a.invariantBad === 0, `выстрелов ${last.shots}, взрывов ${last.effects.blasts}`);
  check(`${p} один выстрел задевает несколько бактерий: в самом удачном взрыве задето ${a.hitsMax} (≥ 2); по взрывам: ${a.hitsList.join(', ')}`, a.analyzed >= 4 && a.hitsMax >= 2, `разобрано взрывов ${a.analyzed} из ${a.blasts} (пропущено ${a.skipped})`);
  check(`${p} каждая бактерия «точно внутри» круга взрыва (ближе ${R} px + её радиус) задета: проверено ${a.sureIn}, не задето ${a.inNotHit.length}`, a.sureIn >= 3 && a.inNotHit.length === 0, a.inNotHit.slice(0, 4).join('; '));
  check(`${p} бактерии дальше ${R} px + радиус от места взрыва НЕ задеты: проверено ${a.sureOut}, задето лишних ${a.outHit.length}`, a.sureOut >= 10 && a.outHit.length === 0, a.outHit.slice(0, 4).join('; '));
  check(`${p} каждая задетая бактерия теряет ровно ${dmg} HP за взрыв (отклонений ${a.wrongDamage})`, a.analyzed >= 4 && a.wrongDamage === 0);

  // ---- B. у «ствола», кокки по 1 HP: убитые взрывом дают монеты, одним взрывом убивается больше одной бактерии; снимок взрыва
  const cfgB = [
    'waves.total:1',
    'waves.list.0.coccus:14',
    'waves.intervalStartSec:0.3',
    'waves.intervalEndSec:0.3',
    'waves.firstDelaySec:1',
    ...FIXED_NO_TOWERS,
    'types.coccus.hp:1',
    `economy.startCoins:${TW.fizz.price}`,
    NO_LIFE_LOSS,
  ].join(',');
  game = await openGame(context, baseUrl, p, { speed: 4, cfg: cfgB });
  await panTo(game, 'left');
  const near = nearTrunkCell();
  await game.placeTowersOf('fizz', [[near.col, near.row]]);
  let shotDone = false;
  let prevBlasts = 0;
  const endB = await pollUntil(game, async (st) => {
    if (!shotDone && st.effects.blasts > prevBlasts && st.bacteria.length >= 2) {
      await shot(game.page, 'towers-06-fizz-blast');
      shotDone = true;
    }
    prevBlasts = st.effects.blasts;
    return st.state === 'won' || st.state === 'lost' || (shotDone && st.effects.blasts >= 3 && st.projectiles === 0);
  }, 150000, 20);
  await game.page.close();
  check(`${p} убитые взрывом дают монеты: ${endB.kills} убито × 10 = ${endB.coins} монет (башня куплена на все монеты)`, endB.kills >= 2 && endB.coins === BASE.reward * endB.kills, `убито ${endB.kills}, монет ${endB.coins}, дошло ${endB.leaked}`);
  check(`${p} одним взрывом убивается больше одной бактерии: убито ${endB.kills} при ${endB.effects.blasts} взрывах (убитых больше взрывов)`, endB.effects.blasts >= 2 && endB.kills > endB.effects.blasts, `убито ${endB.kills}, взрывов ${endB.effects.blasts}, выстрелов ${endB.shots}`);
  check(`${p} снимок взрыва Шипучки сделан (в кадре есть бактерии)`, shotDone);
  await context.close();
}

// ---------------------------------------------------------------- Шприц: луч

/**
 * Клетка для башни с лучом (карта видна целиком, клетка не ближе 70 px к краю окна). Направление — то, которое игра выберет сама при постановке
 * (поворачивать не нужно: башня с полной паузой стреляет, как только на линии кто-то есть, и до тапа по ней лучше не доходить).
 *  mode 'far'   — клетка, где этот луч дольше всего идёт вдоль дорожек-входов, не ближе 450 px от башни (проверка «радиуса нет, луч до края карты»);
 *  mode 'blind' — клетка, где есть ещё и направление, в котором луч не задевает ни одной дорожки (даже с запасом 45 px), а выбранное игрой задевает вход.
 */
function beamSpot(state, mode) {
  const entr = new Set(GRAPH.entrances);
  const coccusR = readConfigNumber('coccus', 'radius');
  let best = null;
  for (let col = 0; col < LEVEL.cols; col++) {
    for (let row = 0; row < LEVEL.rows; row++) {
      if (GEO.isPathCell(col, row)) continue;
      const c = GEO.center(col, row);
      const sx = state.viewW / 2 + (c.x - state.camera.cx) * state.camera.zoom;
      const sy = state.height / 2 + (c.y - state.camera.cy) * state.camera.zoom;
      if (sx < 70 || sx > state.viewW - 70 || sy < 70 || sy > state.height - 70) continue;
      const def = defaultAimAt(c.x, c.y);
      const value = beamCoverageAt(c.x, c.y, def.k, beamReachOf(coccusR), { only: entr, minAlong: mode === 'far' ? 450 : 0 });
      let blind = [];
      if (mode === 'blind') {
        for (let k = 0; k < AIM_STEPS; k++) if (beamCoverageAt(c.x, c.y, k, beamReachOf(coccusR) + 45) === 0) blind.push(k);
        if (!blind.length) continue;
      }
      if (!best || value > best.value) best = { col, row, k: def.k, value, blind };
    }
  }
  return best;
}

/**
 * Один удар очереди луча по плотной цепочке бактерий. Кокки (или другие бактерии из `wave`) идут медленно и плотно; башню ставят, когда на её луче
 * уже не меньше needOn бактерий, пауза Шприца 60 с — очередь одна. Состояние ДО постановки и ПОСЛЕ очереди: у каждой бактерии, которая в обоих состояниях
 * «точно на луче» (с запасом 4 px), HP упало ровно на beamPulses × perPulse; у каждой «точно вне луча» — не изменилось.
 */
async function beamBurst(context, baseUrl, p, { wave, mode, needOn, extraCfg = [], shotName = null }) {
  const cfg = [...wave, 'waves.intervalStartSec:0.3', 'waves.intervalEndSec:0.3', 'waves.firstDelaySec:2', ...FIXED_NO_TOWERS, 'bacteria.baseSpeed:20', 'towers.syringe.cooldownMs:60000', `economy.startCoins:${TW.syringe.price}`, NO_LIFE_LOSS, ...extraCfg].join(',');
  const game = await openGame(context, baseUrl, p, { speed: 2, cfg });
  let spot;
  if (mode === 'entrance') {
    await panTo(game, 'right');
    const e = entranceCell();
    spot = { col: e.col, row: e.row, k: defaultAimAt(GEO.center(e.col, e.row).x, GEO.center(e.col, e.row).y).k };
  } else {
    for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500);
    await settle();
    spot = beamSpot(await game.state(), mode);
  }
  const twPos = GEO.center(spot.col, spot.row);
  await game.selectTower('syringe');
  let pre = null;
  const started = Date.now();
  while (Date.now() - started < 150000) {
    const st = await game.state();
    if (st.state !== 'playing') break;
    if (st.bacteria.filter((b) => onBeam(b, twPos, spot.k, 4)).length >= needOn) {
      pre = st;
      break;
    }
    await sleep(30);
  }
  if (!pre) {
    await game.page.close();
    return { spot, pre: null };
  }
  // тап без паузы после него: первый удар очереди приходится на ближайший кадр, и журнал должен успеть его увидеть
  await game.input.tap(await game.cell(spot.col, spot.row));
  const log = [pre];
  const t1 = Date.now();
  const post = await pollUntil(game, async (st) => {
    log.push(st);
    if (shotName && st.effects.beams === 1) {
      await shot(game.page, shotName);
      shotName = null;
    }
    return st.state !== 'playing' || (st.shots >= 1 && st.projectiles === 0) || Date.now() - t1 > 40000;
  }, 60000, 15);
  await game.page.close();
  const placed = log.find((st) => st.towers.length > 0) ?? null;
  return { spot, pre, post, log, placed, tw: placed?.towers[0] ?? null, twPos };
}

/**
 * Разбор очереди луча: у бактерии «точно на луче» и до, и после очереди, HP упало ровно на perPulse × beamPulses; у «точно вне луча» — не упало.
 * perPulse — сколько HP снимает один удар по такой бактерии (урон башни с учётом брони).
 */
function analyzeBeamBurst(pre, post, twPos, aim, perPulse, margin = 4) {
  const out = { sureOn: 0, sureOff: 0, onWrong: [], offWrong: [], maxAlong: 0, onLosses: [] };
  const postMap = byIdMap(post);
  for (const b0 of pre.bacteria) {
    const b1 = postMap.get(b0.id);
    if (!b1) continue;
    const loss = b0.hp - b1.hp;
    if (onBeam(b0, twPos, aim, margin) && onBeam(b1, twPos, aim, margin)) {
      out.sureOn++;
      out.onLosses.push(loss);
      out.maxAlong = Math.max(out.maxAlong, beamGeom(b1, twPos, aim).along);
      if (Math.abs(loss - TW.syringe.beamPulses * perPulse) > 1e-6) out.onWrong.push(`#${b0.id}: −${f2(loss)} HP (ждали −${f2(TW.syringe.beamPulses * perPulse)})`);
    } else if (offBeam(b0, twPos, aim, margin) && offBeam(b1, twPos, aim, margin)) {
      out.sureOff++;
      if (Math.abs(loss) > 1e-6) out.offWrong.push(`#${b0.id}: −${f2(loss)} HP вне луча`);
    }
  }
  return out;
}

/** Моменты ударов очереди: игровое время каждого прироста effects.beams по журналу. */
function beamPulseTimes(log) {
  const times = [];
  for (let i = 1; i < log.length; i++) for (let k = log[i - 1].effects.beams; k < log[i].effects.beams; k++) times.push(log[i].elapsed);
  return times;
}

/** Поворот Шприца тапами (компьютер и телефон): правая половина башни — на шаг по часовой, левая — против; тап по другой башне не поворачивает. */
async function syringeRotate(browser, baseUrl, deviceKey) {
  const device = VIEWPORTS[deviceKey];
  const p = `[башни: Шприц, поворот, ${device.label}]`;
  const context = await newDeviceContext(browser, device, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 1, isTouch: device.hasTouch, cfg: `economy.startCoins:${TW.syringe.price + TW.pill.price},waves.firstDelaySec:600,${FIXED_NO_TOWERS.join(',')}` });
  const [ca, cb] = [FREE.a, FREE.b];
  let s = await game.placeTowersOf('syringe', [ca]);
  const tw = s.towers[0];
  const def = defaultAimAt(tw.x, tw.y);
  const gotCoverage = beamCoverageAt(tw.x, tw.y, tw.aim, TW.syringe.beamHalfWidthPx + 22);
  check(`${p} только что поставленный Шприц смотрит туда, где под лучом больше всего дорожки: направление ${tw.aim} (покрытие ${Math.round(gotCoverage)} px), лучшее ${def.k} (${Math.round(def.coverage)} px)`, tw.id === 'syringe' && gotCoverage >= 0.9 * def.coverage && def.coverage > 0, `aim ${tw.aim}`);
  await game.placeTowersOf('pill', [cb]);
  s = await game.state();
  check(`${p} Шприц и Таблетка стоят, монет ${s.coins} (поворот и тапы по башням ничего не стоят)`, s.towers.length === 2 && s.coins === 0, `башен ${s.towers.length}, монет ${s.coins}`);
  await game.selectTower('pill'); // снять выбор Таблетки (она осталась выбранной после постановки)
  s = await game.state();
  const a0 = s.towers[0].aim;
  const right = [];
  for (let i = 0; i < AIM_STEPS; i++) {
    await tapTowerHalf(game, ca[0], ca[1], 1);
    right.push((await game.state()).towers[0].aim);
    if (i === 0) await shot(game.page, `towers-07-syringe-aim-${deviceKey}`);
  }
  check(`${p} тап по ПРАВОЙ половине башни поворачивает луч на шаг (45°) по часовой стрелке: ${a0} → ${right.join(' → ')}; за ${AIM_STEPS} тапов — полный круг`, right.every((a, i) => a === (a0 + i + 1) % AIM_STEPS) && right[AIM_STEPS - 1] === a0, right.join(','));
  const left = [];
  for (let i = 0; i < AIM_STEPS; i++) {
    await tapTowerHalf(game, ca[0], ca[1], -1);
    left.push((await game.state()).towers[0].aim);
  }
  check(`${p} тап по ЛЕВОЙ половине поворачивает на шаг против часовой стрелки (через 0 по кругу): ${a0} → ${left.join(' → ')}`, left.every((a, i) => a === (((a0 - i - 1) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS) && left[AIM_STEPS - 1] === a0, left.join(','));
  // выбрана другая башня — тап по Шприцу всё равно поворачивает его и ничего не ставит
  await game.selectTower('pill');
  const before = await game.state();
  await tapTowerHalf(game, ca[0], ca[1], 1);
  s = await game.state();
  check(`${p} при выбранной Таблетке тап по Шприцу поворачивает его (${before.towers[0].aim} → ${s.towers[0].aim}), башен по-прежнему 2, монет ${s.coins}, выбор «${s.selected}» остался`, s.towers[0].aim === (before.towers[0].aim + 1) % AIM_STEPS && s.towers.length === 2 && s.coins === 0 && s.selected === 'pill', `башен ${s.towers.length}, монет ${s.coins}, выбрано ${s.selected}`);
  // тап по Таблетке: она не поворачивается, ничего не меняется
  const aimsBefore = s.towers.map((t) => t.aim).join();
  await tapTowerHalf(game, cb[0], cb[1], 1);
  await tapTowerHalf(game, cb[0], cb[1], -1);
  s = await game.state();
  check(`${p} тап по правой и левой половине Таблетки её не поворачивает и ничего не ставит (направления ${aimsBefore} → ${s.towers.map((t) => t.aim).join()}, башен ${s.towers.length}, монет ${s.coins})`, s.towers.map((t) => t.aim).join() === aimsBefore && s.towers[1].aim === 0 && s.towers.length === 2 && s.coins === 0, `башен ${s.towers.length}`);
  await context.close();
}

async function towersSyringe(browser, baseUrl) {
  const p = '[башни: Шприц]';
  const { range, damage, beamPulses, beamGapMs, beamLengthPx } = TW.syringe;
  const diag = Math.hypot(MAP.orgW + LEVEL.cols * MAP.tile, LEVEL.rows * MAP.tile);
  check(`${p} у Шприца нет радиуса (range ${range}), луч длиннее диагонали карты (${beamLengthPx} > ${Math.round(diag)} px): он идёт до её края`, range === 0 && beamLengthPx > diag, `range ${range}, длина ${beamLengthPx}`);
  await syringeRotate(browser, baseUrl, 'desktop');
  await syringeRotate(browser, baseUrl, 'phone');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const coccusWave = ['waves.total:1', 'waves.list.0.coccus:40'];
  const burstChecks = (q, r, perPulse, { needOn, needOff, far = false }) => {
    if (!r.pre) {
      check(`${q} на луче накопилось ≥ ${needOn} бактерий и башня поставлена (дождались за 150 с)`, false, 'не накопилось');
      return;
    }
    const aim = r.tw?.aim ?? r.spot.k;
    const a = analyzeBeamBurst(r.pre, r.post, r.twPos, aim, perPulse);
    check(`${q} Шприц поставлен (клетка ${r.spot.col};${r.spot.row}, направление ${aim}) и бьёт одной очередью: выстрелов ${r.post.shots}, ударов луча ${r.post.effects.beams} (ждали ${beamPulses})`, r.placed !== null && r.placed.towers.length === 1 && r.post.shots === 1 && r.post.effects.beams === beamPulses, `выстрелов ${r.post.shots}, ударов ${r.post.effects.beams}`);
    const times = beamPulseTimes(r.log);
    const span = times.length ? times[times.length - 1] - times[0] : NaN;
    const want = ((beamPulses - 1) * beamGapMs) / 1000;
    check(`${q} удары очереди идут с паузой ${beamGapMs} мс: от первого до последнего ${f2(span)} с (ждали ${f2(want)} с, допуск −0,15…+0,25 на шаг замеров)`, times.length === beamPulses && span >= want - 0.15 && span <= want + 0.25, `моменты ударов: ${times.map(f2).join(', ')}`);
    check(`${q} каждая бактерия «точно на луче» (до оси ≤ полуширина + 0,7 радиуса − 4 px, впереди башни) теряет ровно ${f2(beamPulses * perPulse)} HP за очередь (${beamPulses} × ${f2(perPulse)}): проверено ${a.sureOn}, ошибок ${a.onWrong.length}`, a.sureOn >= Math.max(2, needOn - 3) && a.onWrong.length === 0, a.onWrong.slice(0, 4).join('; ') || `проверено ${a.sureOn}`);
    check(`${q} бактерии вне луча (позади башни или дальше от оси на 4 px) НЕ задеты: проверено ${a.sureOff}, задето лишних ${a.offWrong.length}`, a.sureOff >= needOff && a.offWrong.length === 0, a.offWrong.slice(0, 4).join('; ') || `проверено ${a.sureOff}`);
    check(`${q} по каждой «точно на луче» бактерии урон одинаковый (по линии всех, не «первого»): потери ${[...new Set(a.onLosses.map(f2))].join(', ')}`, new Set(a.onLosses.map(f2)).size === 1);
    if (far) check(`${q} луч достаёт далеко: самая дальняя задетая бактерия на ${Math.round(a.maxAlong)} px от башни (у Таблетки радиус ${TW.pill.range} px; ждали ≥ 600)`, a.maxAlong >= 600, `${Math.round(a.maxAlong)} px`);
  };

  // ---- A. вдоль прямого входа, издалека (клетка, где луч, выбранный игрой, идёт вдоль входа): бьёт на 1000 px, радиус не нужен
  const far = await beamBurst(context, baseUrl, `${p} вдоль входа`, { wave: coccusWave, mode: 'far', needOn: 8, extraCfg: ['types.coccus.hp:99'], shotName: 'towers-06-syringe-beam' });
  burstChecks(`${p} вдоль входа`, far, damage, { needOn: 8, needOff: 8, far: true });
  check(`${p} снимок удара луча Шприца сделан`, existsShot('towers-06-syringe-beam'));

  // ---- B. по диагонали у входа (направление, выбранное игрой, не вдоль осей)
  const diagRun = await beamBurst(context, baseUrl, `${p} у входа`, { wave: coccusWave, mode: 'entrance', needOn: 5, extraCfg: ['types.coccus.hp:99'] });
  burstChecks(`${p} у входа`, diagRun, damage, { needOn: 5, needOff: 8 });

  // ---- C. броня: бронированная (настоящая, броня из таблицы) теряет за удар max(урон × доля, урон − броня)
  const armor = readConfigNumber('armored', 'armor');
  const share = readConfigNumber('combat', 'armorMinShare');
  const perPulse = Math.max(damage * share, damage - armor);
  const arm = await beamBurst(context, baseUrl, `${p} броня`, { wave: wavesOnly({ armored: 12 }), mode: 'far', needOn: 3 });
  burstChecks(`${p} броня`, arm, perPulse, { needOn: 3, needOff: 3 });
  await context.close();
  await syringeBlind(browser, baseUrl);
}

/** Шприц стреляет, только когда на линии кто-то есть: направленный «в пустоту», он молчит, пока мимо идут бактерии; повернули на дорожку — заработал. */
async function syringeBlind(browser, baseUrl) {
  const p = '[башни: Шприц, пустая линия]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const cfg = ['waves.total:1', 'waves.list.0.coccus:30', 'waves.intervalStartSec:1', 'waves.intervalEndSec:1', 'waves.firstDelaySec:6', ...FIXED_NO_TOWERS, 'types.coccus.hp:99', 'towers.syringe.cooldownMs:500', `economy.startCoins:${TW.syringe.price}`, NO_LIFE_LOSS].join(',');
  const game = await openGame(context, baseUrl, p, { speed: 2, cfg });
  for (let i = 0; i < 3; i++) await game.input.wheel(game.g(540, 360), 500);
  await settle();
  const spot = beamSpot(await game.state(), 'blind');
  const twPos = GEO.center(spot.col, spot.row);
  await game.placeTowersOf('syringe', [[spot.col, spot.row]]);
  const blindK = spot.blind.map((k) => ({ k, ...aimTurn(spot.k, k) })).sort((a, b) => a.steps - b.steps)[0].k;
  let s = await turnSyringeTo(game, spot.col, spot.row, blindK);
  check(`${p} Шприц (клетка ${spot.col};${spot.row}) повёрнут тапами в направление ${blindK}, где луч не задевает ни одной дорожки (выбранное игрой было ${spot.k})`, s.towers[0].aim === blindK, `aim ${s.towers[0].aim}`);
  // ждём, пока мимо пройдёт не меньше 4 бактерий через ту линию, куда луч смотрел бы по умолчанию
  const wasOnDefault = new Set();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    s = await game.state();
    for (const b of s.bacteria) if (onBeam(b, twPos, spot.k, 0)) wasOnDefault.add(b.id);
    if (wasOnDefault.size >= 4 || s.state !== 'playing') break;
    await sleep(30);
  }
  const shotsBlind = s.shots;
  check(`${p} пока луч смотрит в пустоту, Шприц молчит: мимо прошло ${wasOnDefault.size} бактерий через линию его прежнего направления, выстрелов ${shotsBlind}, ударов луча ${s.effects.beams}`, wasOnDefault.size >= 4 && shotsBlind === 0 && s.effects.beams === 0, `выстрелов ${shotsBlind}`);
  // поворачиваем обратно на дорожку — стреляет, когда бактерия на линии
  s = await turnSyringeTo(game, spot.col, spot.row, spot.k);
  const end = await pollUntil(game, (st) => st.shots >= 1 && st.projectiles === 0 || st.state !== 'playing', 120000, 25);
  check(`${p} после поворота на дорожку (направление ${spot.k}) Шприц стреляет, как только на линии кто-то есть: выстрелов ${end.shots}, ударов луча ${end.effects.beams}`, end.shots >= 1 && end.effects.beams >= TW.syringe.beamPulses, `выстрелов ${end.shots}, ударов ${end.effects.beams}, состояние ${end.state}`);
  await context.close();
}

// ---------------------------------------------------------------- Таблетка: поведение прежнее

/**
 * Таблетка бьёт ту бактерию в радиусе, которой до организма ближе всего (remaining). По каждому выстрелу, где в радиусе было ≥ 2 бактерий
 * и ближайшая к организму опережает остальных на ≥ 12 px (remaining у бактерий убывает со скоростью каждой, порядок за кадр почти не меняется), смотрим, кто потерял HP.
 */
function analyzePillTargets(log, tw, damage) {
  const out = { fires: 0, judged: 0, ambiguous: 0, wrong: [], candidates: [], badDamage: 0 };
  for (let j = 1; j < log.length; j++) {
    if (log[j].shots <= log[j - 1].shots) continue;
    out.fires++;
    const cand = log[j].bacteria.filter((b) => b.hp > 0 && inReach(tw, b)).sort((a, b) => a.remaining - b.remaining);
    if (cand.length < 2 || cand[1].remaining - cand[0].remaining < 12) {
      out.ambiguous++;
      continue;
    }
    let k = j;
    while (k + 1 < log.length && log[k + 1].shots === log[j].shots) k++;
    if (k === log.length - 1 || log[k].elapsed - log[j].elapsed < 0.6) continue; // окно до следующего выстрела (снаряд успевает долететь за 0,4 с) не видно целиком
    const pre = byIdMap(log[j - 1]);
    const post = byIdMap(log[k]);
    const lost = [...post.values()].filter((b) => pre.has(b.id) && b.hp < pre.get(b.id).hp).map((b) => b.id);
    out.judged++;
    out.candidates.push(cand.length);
    if (!(lost.length === 1 && lost[0] === cand[0].id)) out.wrong.push(`цель должна быть #${cand[0].id}, потеряли HP: ${lost.map((x) => `#${x}`).join(',') || 'никто'}`);
    else if (pre.get(lost[0]).hp - post.get(lost[0]).hp !== damage) out.badDamage++;
  }
  return out;
}

async function towersPill(browser, baseUrl) {
  const p = '[башни: Таблетка]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const cfg = [
    'waves.total:1',
    'waves.list.0.coccus:18',
    'waves.intervalStartSec:0.4',
    'waves.intervalEndSec:0.4',
    'waves.firstDelaySec:1',
    ...FIXED_NO_TOWERS,
    'types.coccus.hp:99',
    'towers.pill.cooldownMs:900',
    `economy.startCoins:${TW.pill.price}`,
    NO_LIFE_LOSS,
  ].join(',');
  const game = await openGame(context, baseUrl, p, { speed: 3, cfg });
  await panTo(game, 'left');
  const near = nearTrunkCell();
  const placed = await game.placeTowersOf('pill', [[near.col, near.row]]);
  const tw = { ...placed.towers[0], range: TW.pill.range };
  const log = [];
  const startedAt = Date.now();
  await pollUntil(game, (st) => {
    log.push(st);
    return st.state !== 'playing' || (st.shots >= 12 && st.projectiles === 0) || Date.now() - startedAt > 100000;
  }, 120000, 20);
  await game.page.close();
  const a = analyzePillTargets(log, tw, TW.pill.damage);
  const last = log.at(-1);
  check(`${p} Таблетка поставлена и стреляет (выстрелов ${last.shots})`, placed.towers.length === 1 && placed.towers[0].id === 'pill' && last.shots >= 6, `выстрелов ${last.shots}`);
  check(`${p} цель Таблетки — бактерия, ближайшая к организму: из ${a.fires} выстрелов оценено ${a.judged} (≥ 2 бактерий в радиусе, лидер впереди на ≥ 12 px; неоднозначных ${a.ambiguous}), ошибок ${a.wrong.length}`, a.judged >= 5 && a.wrong.length === 0, a.wrong.slice(0, 3).join('; ') || `оценено ${a.judged}`);
  check(`${p} каждый выстрел Таблетки попадает ровно в одну бактерию и снимает ${TW.pill.damage} HP (отклонений ${a.badDamage})`, a.judged >= 5 && a.badDamage === 0);
  await context.close();
}

// ---------------------------------------------------------------- все четыре вместе

async function towersMixed(browser, baseUrl) {
  const p = '[башни: все четыре вместе]';
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const sum = TOWER_IDS.reduce((x, id) => x + TW[id].price, 0);
  const cfg = [
    'waves.total:1',
    'waves.list.0.coccus:16',
    'waves.intervalStartSec:0.7',
    'waves.intervalEndSec:0.7',
    'waves.firstDelaySec:2',
    ...FIXED_NO_TOWERS,
    'types.coccus.hp:3',
    `economy.startCoins:${sum}`,
    NO_LIFE_LOSS,
  ].join(',');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg });
  await panTo(game, 'left');
  const cells = trunkCells(4);
  for (let i = 0; i < TOWER_IDS.length; i++) await game.placeTowersOf(TOWER_IDS[i], [cells[i]]);
  let s = await game.state();
  check(`${p} четыре башни разных видов стоят рядом с дорожкой (${s.towers.map((t) => t.id).join(', ')}), монет 0`, s.towers.map((t) => t.id).join() === TOWER_IDS.join() && s.coins === 0, `монет ${s.coins}`);
  let shotDone = false;
  const end = await pollUntil(game, async (st) => {
    // снимок для владельца: бой в разгаре (несколько бактерий, снаряды в воздухе, уже было замедление или взрыв); условие без жёсткого совпадения всех эффектов в одном кадре
    if (!shotDone && (st.effects.blasts >= 1 || st.slows >= 1) && st.bacteria.length >= 3 && st.projectiles >= 1) {
      await shot(game.page, 'towers-09-four-battle');
      shotDone = true;
    }
    return st.state === 'won' || st.state === 'lost';
  }, 150000, 25);
  check(`${p} вместе работают все четыре: замедлений ${end.slows} (Сироп), взрывов ${end.effects.blasts} (Шипучка), ударов луча ${end.effects.beams} (Шприц), убито ${end.kills} из ${end.spawned}, выстрелов ${end.shots}; убитые + дошедшие = вышедшие (${end.kills} + ${end.leaked} = ${end.spawned})`, end.state === 'won' && end.slows >= 1 && end.effects.blasts >= 1 && end.effects.beams >= 1 && end.kills >= 6 && end.kills + end.leaked === end.spawned && end.spawned === 16, `состояние ${end.state}`);
  check(`${p} монеты: ${BASE.reward} за каждого убитого (башни куплены на все монеты): монет ${end.coins} = ${BASE.reward} × ${end.kills}`, end.coins === BASE.reward * end.kills, `монет ${end.coins}`);
  check(`${p} снимок боя четырёх башен сделан`, shotDone);
  await context.close();
}

// ---------------------------------------------------------------- кнопки скорости и «Начать волну»

/** Какие скорости игры переключает кнопка рядом с паузой (ui.speeds в config.ts). */
const UI_SPEEDS = (() => {
  const found = /speeds:\s*\[([^\]]*)\]/.exec(fs.readFileSync(path.join(ROOT, 'src', 'config.ts'), 'utf8'));
  if (!found) throw new Error('В config.ts нет ui.speeds');
  return found[1].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
})();

async function towersControls(browser, baseUrl) {
  const p = '[башни: кнопки скорости и «Начать волну»]';
  const WAIT = 60;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 1, cfg: `waves.firstDelaySec:${WAIT},${FIXED_NO_TOWERS.join(',')}` });
  let s = await game.state();
  check(`${p} в начале игра идёт на скорости ×${UI_SPEEDS[0]}; кнопка «Начать волну» видна и обещает ≈ ${WAIT} монет за пропуск ожидания (на кнопке +${s.ui.waveButton.bonus})`, s.speed === UI_SPEEDS[0] && s.ui.waveButton.visible && s.ui.waveButton.bonus >= WAIT - 4 && s.ui.waveButton.bonus <= WAIT, `скорость ${s.speed}, видна ${s.ui.waveButton.visible}, бонус ${s.ui.waveButton.bonus}`);
  // кнопка скорости переключает по кругу ×1 → ×2 → ×3 → ×1; игровое время идёт во столько же раз быстрее
  const rate = async () => {
    const a = await game.state();
    const t0 = Date.now();
    await sleep(1500);
    const b = await game.state();
    return (b.elapsed - a.elapsed) / ((Date.now() - t0) / 1000);
  };
  const base = await rate();
  const seen = [UI_SPEEDS[0]];
  const rates = [base];
  for (let i = 1; i <= UI_SPEEDS.length; i++) {
    const b = s.ui.speedButton;
    await game.input.tap(game.g(b.x, b.y));
    await settle();
    s = await game.state();
    seen.push(s.speed);
    if (i < UI_SPEEDS.length) rates.push(await rate());
  }
  check(`${p} кнопка скорости переключает по кругу: ${seen.map((x) => `×${x}`).join(' → ')} (ждали ${[...UI_SPEEDS, UI_SPEEDS[0]].map((x) => `×${x}`).join(' → ')})`, seen.join() === [...UI_SPEEDS, UI_SPEEDS[0]].join(), seen.join(','));
  const ratios = rates.map((r, i) => r / (base * 1) / (UI_SPEEDS[i] / UI_SPEEDS[0]));
  check(`${p} игровое время идёт быстрее во столько же раз: за секунду реального времени ${rates.map((r, i) => `×${UI_SPEEDS[i]}: ${f2(r)} с`).join(', ')} (отношение к ожидаемому ${ratios.map(f2).join(', ')}, допуск ±25 %)`, ratios.every((x) => x >= 0.75 && x <= 1.25), ratios.map(f2).join(', '));
  // «Начать волну»: пропуск ожидания даёт монеты, волна начинается сразу, второй тап ничего не добавляет
  s = await game.state();
  const w = s.ui.waveButton;
  const before = s.coins;
  await game.input.tap(game.g(w.x, w.y));
  await settle();
  s = await game.state();
  const gained = s.coins - before;
  check(`${p} тап по «Начать волну» даёт монеты за пропущенные секунды (на кнопке было +${w.bonus}, получено +${gained}, допуск 12) и волна начинается сразу: волна ${s.wave}, кнопка спрятана (${!s.ui.waveButton.visible})`, gained <= w.bonus && gained >= w.bonus - 12 && s.wave === 1 && !s.ui.waveButton.visible, `получено ${gained}, волна ${s.wave}, кнопка видна ${s.ui.waveButton.visible}`);
  const coins2 = s.coins;
  await game.input.tap(game.g(w.x, w.y));
  await settle();
  s = await game.state();
  check(`${p} повторный тап в том же месте (кнопки уже нет) монет не добавляет: ${coins2} → ${s.coins}`, s.coins === coins2);
  await context.close();
}

// ---------------------------------------------------------------- новые бактерии

/** Рой: первый выходит один (новый тип), остальные — плотной пачкой по одному входу; дробный урон жизням копится в lifePool. */
async function typesSwarm(browser, baseUrl) {
  const p = '[бактерии: рой]';
  const gap = readConfigNumber('swarm', 'spawnGapSec');
  const dmg = readConfigNumber('swarm', 'lifeDamage');
  const N = 8;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 3, cfg: `${wavesOnlyCfg({ swarm: N })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')}` });
  const first = new Map();
  const bad = [];
  const end = await pollUntil(game, (s) => {
    for (const b of s.bacteria) if (!first.has(b.id)) first.set(b.id, { e: s.elapsed, edge: b.edge, kind: b.kind });
    const expectLives = CFG.lives - Math.floor(dmg * s.leaked + 1e-9);
    const expectPool = dmg * s.leaked - Math.floor(dmg * s.leaked + 1e-9);
    if (s.lives !== expectLives || Math.abs(s.lifePool - expectPool) > 1e-6) bad.push(`дошло ${s.leaked}: жизни ${s.lives} (ждали ${expectLives}), lifePool ${f2(s.lifePool)} (ждали ${f2(expectPool)})`);
    return s.state === 'won' || s.state === 'lost';
  }, 150000, 20);
  const list = [...first.values()].sort((a, b) => a.e - b.e);
  const rest = list.slice(1);
  const span = rest.length ? rest[rest.length - 1].e - rest[0].e : NaN;
  check(`${p} вышло ${N} роёв, все типа «swarm» (${list.length}); первый выходит один: следующий через ${f2(rest[0]?.e - list[0]?.e)} с (≥ 0,9, а не ${gap} с)`, list.length === N && list.every((x) => x.kind === 'swarm') && rest[0].e - list[0].e >= 0.9, `вышло ${list.length}`);
  check(`${p} остальные ${N - 1} выходят пачкой с паузой ${gap} с по одному входу: все с ребра ${[...new Set(rest.map((x) => x.edge))].join(',')}, от первого до последнего ${f2(span)} с (≤ ${f2((N - 2) * gap + 0.7)})`, rest.length === N - 1 && new Set(rest.map((x) => x.edge)).size === 1 && span <= (N - 2) * gap + 0.7, `рёбра ${rest.map((x) => x.edge).join(',')}, ${f2(span)} с`);
  check(`${p} дробный урон жизням копится: каждый рой отнимает ${dmg} жизни, целая жизнь списывается при накоплении 1 (во всех замерах жизни и lifePool сходятся; отклонений ${bad.length})`, bad.length === 0, bad.slice(0, 3).join('; '));
  check(`${p} итог: дошло ${end.leaked} роёв по ${dmg} = ${f2(end.leaked * dmg)} жизни → жизни ${CFG.lives} → ${end.lives}, lifePool ${f2(end.lifePool)}, красных вспышек потери жизни ${end.effects.lifeLosses}; партия окончена победой`, end.state === 'won' && end.leaked === N && end.lives === CFG.lives - Math.floor(dmg * N) && Math.abs(end.lifePool) < 1e-6 && end.effects.lifeLosses === Math.floor(dmg * N), `состояние ${end.state}, дошло ${end.leaked}, жизни ${end.lives}, вспышек ${end.effects.lifeLosses}`);
  await context.close();
}

/** Бегун: скорость кокка × speedFactor (в таблице), с тем же разбросом ±10 %. */
async function typesRunner(browser, baseUrl) {
  const p = '[бактерии: бегун]';
  const factor = readConfigNumber('runner', 'speedFactor');
  const lo = BASE.baseSpeed * factor * (1 - BASE.spread) - 1.5;
  const hi = BASE.baseSpeed * factor * (1 + BASE.spread) + 1.5;
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${wavesOnlyCfg({ runner: 3 })},waves.firstDelaySec:1,waves.intervalStartSec:1.5,waves.intervalEndSec:1.5,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
  const traces = new Map();
  const end = await pollUntil(game, (s) => {
    recordTraces(traces, s);
    return s.state === 'won' || s.state === 'lost';
  }, 150000, 20);
  const a = analyzeTraces(traces, { speed: (kind, mode) => (kind === 'runner' && mode === 'normal' ? [lo, hi] : null), worldW: end.map.worldW });
  check(`${p} бегун идёт в ${factor} раза быстрее базовой скорости (${BASE.baseSpeed} px/с): скорости бегунов ${f1(a.speedSeen[0])}…${f1(a.speedSeen[1])} px/с, допустимо ${f1(lo)}…${f1(hi)} (±10 % разброса); вне нормы ${a.badSpeed}`, a.bacteria === 3 && a.badSpeed === 0 && a.speedSeen[0] >= lo && a.speedSeen[1] <= hi && a.speedSeen[1] > 0 && a.backwards === 0 && a.badTransition === 0, `бактерий ${a.bacteria}, вне нормы ${a.badSpeed}`);
  await context.close();
}

/** Пары замеров одной бактерии из журнала: { a, b, dt } для соседних замеров с dt ≥ 0,04 игровой секунды. */
function* samplePairs(log) {
  const traces = tracesOf(log);
  for (const tr of traces.values()) {
    for (let i = 1; i < tr.length; i++) {
      const dt = tr[i].e - tr[i - 1].e;
      if (dt >= 0.04) yield { a: tr[i - 1], b: tr[i], dt, log };
    }
  }
}

/**
 * Лекарь: пока жив, лечит всех остальных в радиусе healRadius на healPerSec HP в секунду, себя не лечит. Таблетка ранит бактерий по очереди
 * (первой в радиусе — ближайшую к организму). Лекарь у проверки медленный и очень прочный (подмена): он идёт позади кокков, не попадает под выстрелы и живёт всю
 * партию, пока кокки ранены. «Дефицит» — HP ниже полного. Проверка по парам соседних замеров: у бактерии с дефицитом, пока лекарь жив и в радиусе,
 * HP растёт ровно на healPerSec × dt (между ударами башни).
 */
async function typesHealer(browser, baseUrl) {
  const p = '[бактерии: лекарь]';
  const perSec = readConfigNumber('healer', 'healPerSec');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const play = async (name, wave, extra, { place }) => {
    const cfg = `${wave},waves.firstDelaySec:1,waves.intervalStartSec:1.2,waves.intervalEndSec:1.2,${FIXED_BALANCE.join(',')},${extra},towers.pill.damage:2,economy.startCoins:${BASE.price},${NO_LIFE_LOSS}`;
    const game = await openGame(context, baseUrl, `${p} ${name}`, { speed: 4, cfg });
    await place(game);
    const log = [];
    await pollUntil(game, (s) => {
      log.push(s);
      return s.state === 'won' || s.state === 'lost';
    }, 250000, 20);
    await game.page.close();
    return log;
  };
  const atTrunk = async (game) => {
    await panTo(game, 'left');
    const near = nearTrunkCell();
    await game.placeTowers([[near.col, near.row]]);
  };
  /** Пары раненых бактерий (не лекарей) при живом лекаре: прибавили HP, остались как были, потеряли (удар). */
  const classify = (log) => {
    const states = new Map(log.map((s) => [s.elapsed, s]));
    const r = { deficit: 0, healed: [], stagnation: [], noHealerHealed: 0 };
    for (const { a, b, dt } of samplePairs(log)) {
      if (a.kind === 'healer' || a.hp >= a.maxHp - 1e-9) continue;
      const alive = states.get(a.e).bacteria.some((x) => x.kind === 'healer') && states.get(b.e).bacteria.some((x) => x.kind === 'healer');
      if (!alive) {
        if (b.hp > a.hp + 1e-9) r.noHealerHealed++;
        continue;
      }
      r.deficit++;
      if (b.hp > a.hp + 1e-9) {
        if (b.hp < b.maxHp - 1e-9) r.healed.push((b.hp - a.hp) / (dt * perSec));
      } else if (b.hp === a.hp) r.stagnation.push(`#${a.id} на ${f2(b.e)} с`);
    }
    return r;
  };
  const wave = wavesOnlyCfg({ coccus: 6, healer: 1 });
  const slowHealer = 'bacteria.baseSpeed:90,types.coccus.hp:12,types.healer.speedFactor:0.4,types.healer.hp:600,towers.pill.cooldownMs:2000,towers.pill.range:450';
  // ---- A. радиус лечения огромный (подмена): лечится каждая раненая бактерия — темп точный
  const A = classify(await play('радиус не ограничен', wave, `${slowHealer},types.healer.healRadius:3000`, { place: atTrunk }));
  const mean = A.healed.length ? A.healed.reduce((x, y) => x + y, 0) / A.healed.length : NaN;
  check(`${p} лекарь лечит со скоростью ${perSec} HP/с: ${A.healed.length} приростов у раненых бактерий, в среднем ${f2(mean)} от ожидаемого (ждали 0,85…1,15); замеров раненых при живом лекаре ${A.deficit}, из них без прироста и без удара ${A.stagnation.length}`, A.healed.length >= 6 && mean >= 0.85 && mean <= 1.15 && A.stagnation.length === 0, A.stagnation.slice(0, 3).join('; ') || `приростов ${A.healed.length}`);
  // ---- B. радиус лечения 1 px (подмена): лекарь никого не достаёт — раненые не лечатся
  const B = classify(await play('радиус 1 px', wave, `${slowHealer},types.healer.healRadius:1`, { place: atTrunk }));
  check(`${p} радиус лечения учитывается: при радиусе 1 px раненые бактерии не лечатся (замеров раненых при живом лекаре ${B.deficit} ≥ 6, с приростом ${B.healed.length})`, B.deficit >= 6 && B.healed.length === 0, `раненых ${B.deficit}, приростов ${B.healed.length}`);
  // ---- C. лекарь один и ранен: сам не лечится
  const logC = await play('лекарь один', wavesOnlyCfg({ healer: 1 }), 'towers.pill.range:650,towers.pill.cooldownMs:60000,bacteria.baseSpeed:112', { place: async (g) => g.placeTowers([FREE.a]) });
  let hit = false;
  let afterHit = 0;
  let up = 0;
  for (const { a, b } of samplePairs(logC)) {
    if (b.hp < a.hp - 1e-9) hit = true;
    else if (hit) {
      afterHit++;
      if (b.hp > a.hp + 1e-9) up++;
    }
  }
  check(`${p} лекарь себя не лечит: после удара по нему (−2 HP) его HP не растёт (замеров после удара ${afterHit} ≥ 20, с ростом ${up})`, hit && afterHit >= 20 && up === 0, hit ? `после удара ${afterHit}, рост ${up}` : 'удара по лекарю не было');
  check(`${p} когда лекаря нет на карте, раненые не лечатся (приростов при отсутствии лекаря: ${A.noHealerHealed + B.noHealerHealed})`, A.noHealerHealed + B.noHealerHealed === 0);
  await context.close();
}

/** Регенератор: сам лечится на regenPerSec HP/с (не выше полного HP), без лекаря. Одна Таблетка ранит его один раз. */
async function typesRegen(browser, baseUrl) {
  const p = '[бактерии: регенератор]';
  const perSec = readConfigNumber('regen', 'regenPerSec');
  const hp = readConfigNumber('regen', 'hp');
  const hit = Math.min(4, hp - 1);
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${wavesOnlyCfg({ regen: 1 })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS},towers.pill.range:650,towers.pill.damage:${hit},towers.pill.cooldownMs:60000,economy.startCoins:${BASE.price}` });
  await game.placeTowers([FREE.a]);
  const log = [];
  const end = await pollUntil(game, (s) => {
    log.push(s);
    return s.state === 'won' || s.state === 'lost';
  }, 150000, 20);
  const ratios = [];
  const stuck = [];
  let maxHp = 0;
  let hitSeen = false;
  for (const { a, b, dt } of samplePairs(log)) {
    maxHp = Math.max(maxHp, b.hp);
    if (b.hp < a.hp - 1e-9) hitSeen = true;
    if (!hitSeen || a.hp >= a.maxHp - 1e-9 || b.hp < a.hp - 1e-9) continue;
    if (b.hp > a.hp + 1e-9 && b.hp < b.maxHp - 1e-9) ratios.push((b.hp - a.hp) / (dt * perSec));
    else if (b.hp === a.hp) stuck.push(f2(b.e));
  }
  const mean = ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length : NaN;
  check(`${p} регенератор после удара (−${hit} из ${hp} HP) сам лечится на ${perSec} HP/с: ${ratios.length} приростов, в среднем ${f2(mean)} от ожидаемого (ждали 0,85…1,15), замеров без прироста у раненого ${stuck.length}`, hitSeen && ratios.length >= 5 && mean >= 0.85 && mean <= 1.15 && stuck.length === 0, hitSeen ? `приростов ${ratios.length}` : 'удара по регенератору не было');
  check(`${p} лечение не поднимает HP выше полного: наибольшее HP ${f2(maxHp)} из ${hp}; партия окончена (${end.state})`, maxHp <= hp + 1e-9 && (end.state === 'won' || end.state === 'lost'), `HP ${f2(maxHp)}`);
  await context.close();
}

/** Командир: бактерии в радиусе hasteRadius идут в hasteFactor раз быстрее (сам командир — нет). */
async function typesCommander(browser, baseUrl) {
  const p = '[бактерии: командир]';
  const R = readConfigNumber('commander', 'hasteRadius');
  const factor = readConfigNumber('commander', 'hasteFactor');
  const base = BASE.baseSpeed * BASE.speedFactor; // скорость кокка
  const norm = [base * (1 - BASE.spread) - 1.5, base * (1 + BASE.spread) + 1.5];
  const fast = [norm[0] * factor - 1.5, norm[1] * factor + 1.5];
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${wavesOnlyCfg({ coccus: 12, commander: 1 })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
  const log = [];
  const end = await pollUntil(game, (s) => {
    log.push(s);
    return s.state === 'won' || s.state === 'lost';
  }, 200000, 20);
  const states = new Map(log.map((s) => [s.elapsed, s]));
  let inside = 0;
  let outside = 0;
  const badIn = [];
  const badOut = [];
  for (const { a, b, dt } of samplePairs(log)) {
    if (a.kind !== 'coccus') continue;
    const prog = progressBetween(a, b);
    if (prog === null) continue;
    const v = prog / dt;
    const ca = states.get(a.e).bacteria.find((x) => x.kind === 'commander');
    const cb = states.get(b.e).bacteria.find((x) => x.kind === 'commander');
    const da = ca ? Math.hypot(a.x - ca.x, a.y - ca.y) : Infinity;
    const db = cb ? Math.hypot(b.x - cb.x, b.y - cb.y) : Infinity;
    if (Math.max(da, db) <= R - 20) {
      inside++;
      if (v < fast[0] || v > fast[1]) badIn.push(`${f1(v)} px/с`);
    } else if (Math.min(da, db) > R + 20) {
      outside++;
      if (v < norm[0] || v > norm[1]) badOut.push(`${f1(v)} px/с`);
    }
  }
  check(`${p} рядом с командиром (ближе ${R} px) кокки идут в ${factor} раза быстрее: замеров внутри ${inside}, вне нормы ${badIn.length} (ждали ${f1(fast[0])}…${f1(fast[1])} px/с); вдали от него — обычная скорость: замеров ${outside}, вне нормы ${badOut.length} (ждали ${f1(norm[0])}…${f1(norm[1])})`, inside >= 6 && outside >= 20 && badIn.length === 0 && badOut.length === 0, [...badIn, ...badOut].slice(0, 4).join('; ') || `внутри ${inside}, снаружи ${outside}, состояние ${end.state}`);
  await context.close();
}

/** Матка: раз в brewEverySec секунд рожает brewCount бактерий роя на своём месте; рождённые в «вышло за волну» не считаются. */
async function typesBrood(browser, baseUrl) {
  const p = '[бактерии: матка]';
  const every = readConfigNumber('brood', 'brewEverySec');
  const count = readConfigNumber('brood', 'brewCount');
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 4, cfg: `${wavesOnlyCfg({ brood: 1 })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},${NO_LIFE_LOSS}` });
  const born = [];
  const known = new Set();
  let motherFirst = null;
  let maxSpawned = 0;
  const end = await pollUntil(game, (s) => {
    maxSpawned = Math.max(maxSpawned, s.spawned);
    const mother = s.bacteria.find((b) => b.kind === 'brood');
    if (mother && motherFirst === null) motherFirst = s.elapsed;
    for (const b of s.bacteria) {
      if (known.has(b.id)) continue;
      known.add(b.id);
      if (b.kind === 'swarm' && mother) born.push({ e: s.elapsed, id: b.id, dist: Math.hypot(b.x - mother.x, b.y - mother.y), edge: b.edge, motherEdge: mother.edge });
    }
    return s.state === 'won' || s.state === 'lost' || born.length >= 4 * count + 1;
  }, 150000, 20);
  born.sort((a, b) => a.e - b.e);
  const groups = [];
  for (const x of born) {
    const g = groups[groups.length - 1];
    if (g && x.e - g[g.length - 1].e <= 0.35) g.push(x);
    else groups.push([x]);
  }
  const complete = groups.filter((g) => g.length === count);
  const starts = groups.map((g) => g[0].e);
  const gaps = starts.slice(1).map((e, i) => e - starts[i]);
  check(`${p} матка рожает по ${count} роя разом: рождений ${groups.length} (по ${groups.map((g) => g.length).join(', ')}), первое через ${f2(starts[0] - motherFirst)} с после выхода (ждали ${every} ±0,5)`, groups.length >= 3 && groups.slice(0, 3).every((g) => g.length === count) && Math.abs(starts[0] - motherFirst - every) <= 0.5, `рождений ${groups.length}`);
  check(`${p} рождения идут раз в ${every} с: промежутки ${gaps.map(f2).join(', ')} (допуск ±0,5)`, gaps.length >= 2 && gaps.every((g) => Math.abs(g - every) <= 0.5), gaps.map(f2).join(', '));
  check(`${p} детёныши появляются на месте матки (расстояние до неё в момент рождения ${born.slice(0, 4).map((x) => Math.round(x.dist)).join(', ')} px ≤ 110) на её ребре`, born.length >= 4 && born.every((x) => x.dist <= 110), born.map((x) => Math.round(x.dist)).join(','));
  check(`${p} рождённые в счёт «вышло за волну» не входят: вышло ${maxSpawned} (одна матка), а на карте побывало роёв ${born.length}`, maxSpawned === 1 && born.length >= 4, `spawned ${maxSpawned}, роёв ${born.length}, состояние ${end.state}`);
  await context.close();
}

/** Гигант (босс): HP и броня из таблицы, Таблетка снимает минимум долю удара; дошёл — отнимает lifeDamage жизней (три — все). */
async function typesGiant(browser, baseUrl) {
  const p = '[бактерии: гигант]';
  const hp = readConfigNumber('giant', 'hp');
  const armor = readConfigNumber('giant', 'armor');
  const dmg = readConfigNumber('giant', 'lifeDamage');
  const share = readConfigNumber('combat', 'armorMinShare');
  const want = Math.max(1 * share, 1 - armor);
  const context = await newDeviceContext(browser, VIEWPORTS.desktop, 'ru');
  const game = await openGame(context, baseUrl, p, { speed: 6, cfg: `${wavesOnlyCfg({ giant: 1 })},waves.firstDelaySec:1,${FIXED_BALANCE.join(',')},towers.pill.range:650,economy.startCoins:${BASE.price}` });
  await game.placeTowers([FREE.a]);
  const steps = [];
  let last = null;
  let shotDone = false;
  const end = await pollUntil(game, async (s) => {
    const g = s.bacteria.find((b) => b.kind === 'giant');
    if (g) {
      if (last === null) last = g.hp;
      if (g.hp !== last) {
        steps.push(last - g.hp);
        last = g.hp;
      }
      const sx = s.viewW / 2 + (g.x - s.camera.cx) * s.camera.zoom;
      const sy = s.height / 2 + (g.y - s.camera.cy) * s.camera.zoom;
      if (!shotDone && sx > 150 && sx < 950 && sy > 100 && sy < 620) {
        await shot(game.page, 'towers-10-giant');
        shotDone = true;
      }
    }
    return s.state === 'won' || s.state === 'lost';
  }, 200000, 20);
  // между двумя замерами могли попасть два выстрела: шаг HP — целое число раз по want; одиночные шаги — ровно want
  const bad = steps.filter((d) => Math.abs(d / want - Math.round(d / want)) > 1e-6 || d < want - 1e-6);
  const singles = steps.filter((d) => Math.abs(d - want) < 1e-6).length;
  check(`${p} гигант: ${hp} HP, броня ${armor}: Таблетка (урон 1) снимает ${f2(want)} HP за выстрел (замерено ${steps.length} изменений HP, одиночных выстрелов ${singles}, не кратных ${f2(want)}: ${bad.length})`, singles >= 5 && bad.length === 0, bad.slice(0, 3).map(f2).join(', ') || `одиночных ${singles}`);
  check(`${p} гигант дошёл до организма: отнял ${dmg} жизни (жизни ${CFG.lives} → ${end.lives}), дошло ${end.leaked}, состояние «${end.state}»`, end.leaked === 1 && end.lives === Math.max(0, CFG.lives - dmg) && (dmg >= CFG.lives ? end.state === 'lost' : end.state === 'won'), `дошло ${end.leaked}, жизни ${end.lives}`);
  check(`${p} снимок гиганта в кадре сделан`, shotDone);
  await context.close();
}

/** QA_TOWERS_ONLY=syrup,fizz — только эти части сценария (для проверки самих проверок: быстрее, чем весь сценарий).
 *  Части: texts, panel, controls, prices, syrup, fizz, syringe, pill, mixed, swarm, runner, healer, regen, commander, brood, giant. */
const towersOnly = process.env.QA_TOWERS_ONLY ? process.env.QA_TOWERS_ONLY.split(',') : null;

async function runTowers(browser, baseUrl) {
  TW = towerTable();
  const part = (key, label, fn) => (towersOnly === null || towersOnly.includes(key) ? safe(label, fn) : null);
  if (towersOnly === null || towersOnly.includes('texts')) towersTexts();
  await part('panel', '[башни: панель, компьютер, ru]', () => towersPanel(browser, baseUrl, 'desktop', 'ru', { full: true }));
  await part('panel', '[башни: панель, компьютер, en]', () => towersPanel(browser, baseUrl, 'desktop', 'en'));
  await part('panel', '[башни: панель, телефон, ru]', () => towersPanel(browser, baseUrl, 'phone', 'ru'));
  await part('panel', '[башни: панель, телефон, en]', () => towersPanel(browser, baseUrl, 'phone', 'en'));
  await part('controls', '[башни: кнопки скорости и «Начать волну»]', () => towersControls(browser, baseUrl));
  await part('prices', '[башни: цены]', () => towersPrices(browser, baseUrl));
  await part('syrup', '[башни: Сироп]', () => towersSyrup(browser, baseUrl));
  await part('fizz', '[башни: Шипучка]', () => towersFizz(browser, baseUrl));
  await part('syringe', '[башни: Шприц]', () => towersSyringe(browser, baseUrl));
  await part('pill', '[башни: Таблетка]', () => towersPill(browser, baseUrl));
  await part('mixed', '[башни: все четыре]', () => towersMixed(browser, baseUrl));
  await part('swarm', '[бактерии: рой]', () => typesSwarm(browser, baseUrl));
  await part('runner', '[бактерии: бегун]', () => typesRunner(browser, baseUrl));
  await part('healer', '[бактерии: лекарь]', () => typesHealer(browser, baseUrl));
  await part('regen', '[бактерии: регенератор]', () => typesRegen(browser, baseUrl));
  await part('commander', '[бактерии: командир]', () => typesCommander(browser, baseUrl));
  await part('brood', '[бактерии: матка]', () => typesBrood(browser, baseUrl));
  await part('giant', '[бактерии: гигант]', () => typesGiant(browser, baseUrl));
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
  if (wants('towers')) await safe('[башни]', () => runTowers(browser, qaServer.url));
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
