/**
 * Общие функции для проверок: запуск браузера и локального сервера, ввод (мышь, касания, щипок),
 * данные уровня (дорожки) и снятие цвета пикселей со скриншота.
 * Используются скриптами smoke.mjs (проверка + скриншоты) и bot.mjs (бот-замерщик баланса).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
// прибавка силы от Шприца — одно число для модели и лестницы ботов (решение владельца 19 октября 2026, сообщение 4, п. 2)
import { SYRINGE_GAIN } from '../docs/redesign-model-2026-10-19.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Размер экрана игры (всегда 16:9, на любом устройстве он просто масштабируется). */
export const GAME_W = 1280;
export const GAME_H = 720;

/** Экраны, на которых проверяем игру: игра горизонтальная, поэтому телефон — тоже в горизонтальном положении. */
export const VIEWPORTS = {
  phone: {
    label: 'телефон 844×390',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    label: 'компьютер 1280×720',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

/** Ищет Chromium, установленный в системе (в облачной среде он лежит в PLAYWRIGHT_BROWSERS_PATH). */
function findSystemChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base).filter((d) => d.startsWith('chromium-'))) {
      const exe = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

export async function launchBrowser() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (firstError) {
    const executablePath = findSystemChromium();
    if (!executablePath) {
      throw new Error(
        'Не удалось запустить Chromium. Выполните один раз: npx playwright install chromium\n' +
          String(firstError),
      );
    }
    return chromium.launch({ headless: true, executablePath, args });
  }
}

/** Самое позднее время изменения среди файлов, из которых собирается игра. */
function newestSourceTime() {
  let newest = 0;
  const visit = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) visit(path.join(target, name));
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  };
  for (const item of ['src', 'index.html', 'vite.config.ts', 'package.json']) visit(path.join(ROOT, item));
  return newest;
}

/**
 * Запускает сервер с готовой сборкой. Возвращает адрес и функцию остановки.
 * @param dir папка сборки: 'dist-qa' — тестовая (с режимом ?qa), 'dist' — игровая, как на площадке
 */
export async function startServer(dir = 'dist-qa') {
  const index = path.join(ROOT, dir, 'index.html');
  const build = dir === 'dist' ? 'npm run build' : 'npm run build:qa';
  if (!fs.existsSync(index)) {
    throw new Error(`Нет папки ${dir}. Сначала выполните: ${build}`);
  }
  // Защита от проверки устаревшей игры: если код или config.ts менялись после сборки, останавливаемся
  if (fs.statSync(index).mtimeMs < newestSourceTime()) {
    throw new Error(`Сборка в папке ${dir} устарела: код или config.ts изменились после неё. Выполните: ${build}`);
  }
  const server = await preview({
    root: ROOT,
    logLevel: 'error',
    build: { outDir: dir },
    preview: { port: 0, strictPort: false, open: false, host: '127.0.0.1' },
  });
  const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.preview.port}/`;
  return { url, close: () => server.close() };
}

export function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ данные игры (читаем из исходников)

const readSource = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Число из src/config.ts: `readConfigNumber('economy', 'startCoins')` — первое `startCoins:` после `economy: {`.
 * Так проверки знают, что игра ДОЛЖНА показать, и не ломаются, когда баланс меняют.
 */
export function readConfigNumber(section, key) {
  const src = readSource('src/config.ts');
  const start = new RegExp(`\\b${section}:\\s*\\{`).exec(src);
  if (!start) throw new Error(`В config.ts нет раздела «${section}»`);
  const found = new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`).exec(src.slice(start.index));
  if (!found) throw new Error(`В разделе «${section}» config.ts нет числа «${key}»`);
  return Number(found[1]);
}

/** Названия игры из src/i18n.ts: [русское, английское]. */
export function readTitles() {
  return [...readSource('src/i18n.ts').matchAll(/gameTitle:\s*'([^']*)'/g)].map((m) => m[1]);
}

/** Строка из src/i18n.ts по ключу: [русский текст, английский] (в одинарных или двойных кавычках). */
export function readI18n(key) {
  const found = [...readSource('src/i18n.ts').matchAll(new RegExp(`\\b${key}:\\s*(?:'([^']*)'|"([^"]*)")`, 'g'))].map((m) => m[1] ?? m[2]);
  if (found.length < 2) throw new Error(`В i18n.ts нет ключа «${key}» на обоих языках`);
  return found;
}

/**
 * Уровень из src/level.ts: размер карты в клетках под башню (`map.tile`) и центр камеры при старте (сеть дорожек — из игры, через window.__pvb.getGraph()).
 * ВНИМАНИЕ: `startCenter` записан в единицах `map.pathUnit` (103 px), как узлы сети, а не в клетках под башню (77,25 px): в пиксели его переводит
 * `geo.unitCenter(u, v)`, а не `geo.center(col, row)`.
 */
export function readLevel() {
  const src = readSource('src/level.ts');
  return {
    cols: Number(/cols:\s*(\d+)/.exec(src)[1]),
    rows: Number(/rows:\s*(\d+)/.exec(src)[1]),
    startCenter: JSON.parse(/startCenter:\s*(\[[^\]]*\])/.exec(src)[1]),
  };
}

/** Все типы бактерий из таблицы `types` в src/config.ts — ключи в порядке строк таблицы (в этом же порядке игра выпускает новые типы в волне). */
export function readKinds() {
  const src = readSource('src/config.ts');
  const from = src.indexOf('types: {', src.indexOf('ТИПЫ БАКТЕРИЙ'));
  if (from < 0) throw new Error('В config.ts нет таблицы типов бактерий (types)');
  const to = src.indexOf('\n  },', from);
  const kinds = [...src.slice(from, to).matchAll(/^\s{4}(\w+):\s*\{\s*hp:/gm)].map((m) => m[1]);
  if (!kinds.length) throw new Error('В таблице types config.ts не нашёл ни одного типа бактерий');
  return kinds;
}

/** Состав волн из src/config.ts (waves.list): массив строк {тип: сколько}; в строке только те типы, что есть в ней в таблице (в начале таблицы строки короткие). */
export function readWaveList() {
  const src = readSource('src/config.ts');
  const from = src.indexOf('list: [', src.indexOf('waves:'));
  const to = src.indexOf(']', from + 7);
  return [...src.slice(from, to).matchAll(/\{([^}]*)\}/g)].map((m) => {
    const row = {};
    for (const [, key, value] of m[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)) row[key] = Number(value);
    return row;
  });
}

/** Id узла башни в древе улучшений (`meta.upgrades`): `tower` + id башни с заглавной буквы (`fizz` → `towerFizz`); у Таблетки узла нет — она открыта с начала (как `towerNodeId` в src/meta.ts). */
export const towerNodeId = (tower) => `tower${tower.charAt(0).toUpperCase()}${tower.slice(1)}`;

/** Открыта ли ветка древа при уровнях узлов `levels` (как `isBranchOpen` в src/meta.ts): «Организм», «Защита», узлы башен и умения — всегда; ветка башни — когда куплен узел башни (Таблетка — всегда). */
export function branchOpen(branch, levels) {
  if (['body', 'defense', 'towers', 'skills', 'pill'].includes(branch)) return true;
  return (levels?.[towerNodeId(branch)] ?? 0) > 0;
}

/**
 * Таблица башен из src/config.ts (раздел `towers`): { id: { price, range, damage, cooldownMs, projectileSpeed, blastRadius,
 * slowFactor, slowSec, targeting, side, dotPerSec, dotSec, coneDeg, auraMul, auraStep, … } } в порядке строк (с 9 октября 2026 десять башен: pill, syrup, fizz, syringe, ampule, antibiotic, lamp, vitamin, frost, patch;
 * у Витамина, Холода и Пластыря `damage` равен 0 (у Витамина и `cooldownMs` 0): они сами не наносят урон — на них нельзя делить; поля freezeSec, trapSec, trapDps — у остальных 0). Читает числа и строки в одинарных кавычках из каждой строки таблицы
 * (комментарии пропускает). Бот баланса берёт отсюда цены и радиусы (подмену `?cfg=towers.<id>.<ключ>:<число>` он накладывает сам).
 */
export function readTowerTable() {
  const src = readSource('src/config.ts');
  const start = /\btowers:\s*\{/.exec(src);
  if (!start) throw new Error('В config.ts нет раздела «towers»');
  let depth = 0;
  let end = -1;
  for (let i = start.index + start[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Не нашёл конец раздела «towers» в config.ts');
  const block = src
    .slice(start.index + start[0].length, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const table = {};
  for (const m of block.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const row = {};
    for (const [, key, value] of m[2].matchAll(/(\w+):\s*(-?[\d.]+)/g)) row[key] = Number(value);
    for (const [, key, value] of m[2].matchAll(/(\w+):\s*'([^']*)'/g)) row[key] = value;
    table[m[1]] = row;
  }
  if (!Object.keys(table).length) throw new Error('В разделе «towers» config.ts не нашёл ни одной башни');
  return table;
}

/**
 * Мутации башен из src/config.ts (`mutations`): { id башни: [[id варианта 1, id варианта 2] для порога 1, … для порога 2] }. Бот выбирает мутации по номерам вариантов
 * и сверяет номера с названиями (чтобы перестановка строк в config.ts не подменила выбор молча).
 */
export function readMutationIds() {
  const src = readSource('src/config.ts');
  const from = src.indexOf('mutations: {', src.indexOf('mutationLevels'));
  const to = src.indexOf('} as Record<string, MutationSpec[][]>', from);
  if (from < 0 || to < 0) throw new Error('В config.ts нет таблицы mutations');
  const block = src.slice(from + 'mutations: {'.length, to);
  const out = {};
  for (const m of block.matchAll(/(\w+):\s*\[\s*\n([\s\S]*?)\n\s{4}\],/g)) {
    out[m[1]] = m[2]
      .split('\n')
      .filter((line) => line.trim().startsWith('['))
      .map((line) => [...line.matchAll(/id:\s*'(\w+)'/g)].map((x) => x[1]));
  }
  if (!Object.keys(out).length) throw new Error('В таблице mutations config.ts не нашёл ни одной башни');
  return out;
}

/**
 * Геометрия карты по сети дорожек, которую отдала игра (getGraph): рёбра-кривые, клетки дорожки (центр клетки ближе
 * pathWidth/2 + 0.55·tile к любой точке любого ребра), расстояние до ребра, вероятности ребер, покрытие башней.
 * Правила описаны в задании, код игры не используется. `map` — { orgW, tile, pathWidth, pathUnit }: orgW, tile (а также cols и rows) надо брать из состояния игры
 * (`getState().map`), pathWidth и pathUnit — из config.ts (в состояние игры они не входят).
 * Два перевода в пиксели: `center(col, row)` — центр КЛЕТКИ под башню (шаг `map.tile`), `unitCenter(u, v)` — точка сети дорожек (шаг `map.pathUnit`, так записаны узлы
 * и старт камеры в src/level.ts).
 */
export function makeGraphGeometry(graph, map, cols, rows) {
  const center = (col, row) => ({ x: map.orgW + map.tile * (col + 0.5), y: map.tile * (row + 0.5) });
  const unitCenter = (u, v) => ({ x: map.orgW + (map.pathUnit ?? map.tile) * (u + 0.5), y: (map.pathUnit ?? map.tile) * (v + 0.5) });
  const edges = graph.edges;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const limit = map.pathWidth / 2 + (map.pathMarginTile ?? 0.55) * map.tile; // запас 0,55 клетки (≈ 42,5 px при tile 77,25), как PATH_TILES в src/level.ts: основание башни не заходит на полосу дорожки
  const distToSegment = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a[0] + u * dx), p.y - (a[1] + u * dy));
  };
  /** Расстояние от точки мира до ломаной ребра (по отрезкам между его точками), пикселей. */
  const distToEdge = (p, id) => {
    const pts = byId.get(id).pts;
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
    return best;
  };
  const distToAnyPoint = (p) => {
    let best = Infinity;
    for (const e of edges) for (const q of e.pts) best = Math.min(best, Math.hypot(p.x - q[0], p.y - q[1]));
    return best;
  };
  const distToAnyCurve = (p) => Math.min(...edges.map((e) => distToEdge(p, e.id)));
  // клетки дорожки: по правилу «к любой ТОЧКЕ ребра» (как у игры) и по отрезкам между точками (запасной счёт для сравнения)
  const pathCells = new Set();
  const pathCellsByCurve = new Set();
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const c = center(col, row);
      if (distToAnyPoint(c) < limit) pathCells.add(`${col},${row}`);
      if (distToAnyCurve(c) < limit) pathCellsByCurve.add(`${col},${row}`);
    }
  }
  // закрытые клетки (этап 3б: дальше buildMaxDistPx от дорожки башню ставить нельзя) — игра сама отдаёт их список в getGraph().blockedCells;
  // для проверок они «не свободны», как клетки дорожки (isPathCell), но считаются отдельно
  const lanePathCount = pathCells.size;
  const blockedCells = new Set((graph.blockedCells ?? []).map(([c, r]) => `${c},${r}`));
  for (const key of blockedCells) pathCells.add(key);
  // вероятность пройти по ребру: на входе поровну, на каждой развилке выход поровну
  const outOf = {};
  const inTo = {};
  for (const e of edges) (outOf[e.from] ??= []).push(e.id), (inTo[e.to] ??= []).push(e.id);
  const prob = new Map();
  const visit = (id, p) => {
    prob.set(id, (prob.get(id) ?? 0) + p);
    const next = outOf[byId.get(id).to] ?? [];
    for (const n of next) visit(n, p / next.length);
  };
  for (const id of graph.entrances) visit(id, 1 / graph.entrances.length);
  // самый длинный отрезок между соседними точками рёбер: кривая между точками может пройти ближе к центру клетки, чем сами точки, не более чем на maxSeg² / (8·limit)
  let maxSegmentPx = 0;
  for (const e of edges) for (let i = 0; i < e.pts.length - 1; i++) maxSegmentPx = Math.max(maxSegmentPx, Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]));
  return {
    center,
    unitCenter,
    limit,
    maxSegmentPx,
    /** Наибольшая разница расстояния «до точки ребра» и «до кривой» для центра, прошедшего правило по точкам (дискретизация кривой). */
    sagPx: (maxSegmentPx * maxSegmentPx) / (8 * limit) + 0.05,
    isBlocked: (col, row) => blockedCells.has(`${col},${row}`),
    edges,
    byId,
    outOf,
    inTo,
    prob,
    distToEdge,
    distToAnyPoint,
    distToAnyCurve,
    isPathCell: (col, row) => pathCells.has(`${col},${row}`),
    /** Клетки, где башню ставить нельзя: дорожка + закрытые. */
    pathCellCount: pathCells.size,
    /** Только клетки, задетые дорожкой, и только закрытые клетки. */
    lanePathCellCount: lanePathCount,
    blockedCellCount: blockedCells.size,
    pathCellCountByCurve: pathCellsByCurve.size,
    /** Клетка под точкой мира или null (вне сетки — например, зона организма). */
    cellAt: (x, y) => {
      const col = Math.floor((x - map.orgW) / map.tile);
      const row = Math.floor(y / map.tile);
      return col < 0 || col >= cols || row < 0 || row >= rows ? null : [col, row];
    },
    /** Сколько «ожидаемых бактерий на пиксель пути» попадает в радиус reach от центра клетки (чем больше, тем лучше клетка для башни). */
    coverage: (col, row, reach) => {
      const c = center(col, row);
      let total = 0;
      for (const e of edges) {
        const w = prob.get(e.id) ?? 0;
        for (let i = 0; i < e.pts.length - 1; i++) {
          const a = e.pts[i];
          const b = e.pts[i + 1];
          const mid = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
          if (Math.hypot(mid.x - c.x, mid.y - c.y) <= reach) total += w * Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
      }
      return total;
    },
    /**
     * Клетки, с которых достаётся до всех бактерий: свободная клетка «достаёт» маршрут (от входа до выхода по рёбрам), если какая-то точка маршрута ближе reach пикселей
     * к её центру; берутся клетки, достающие каждый из маршрутов. Для уровня 1 (reach 225 = Таблетка 200 + радиус бактерии ≈ 25) — 12 клеток из 196 свободных, 18 маршрутов.
     * Возвращает { routes: число маршрутов, cells: [[col, row], …] }.
     */
    reachAllCells: (reach) => {
      const routes = [];
      const walk = (id, acc) => {
        const next = outOf[byId.get(id).to] ?? [];
        const chain = [...acc, id];
        if (!next.length) routes.push(chain);
        else for (const n of next) walk(n, chain);
      };
      for (const id of graph.entrances) walk(id, []);
      const cells = [];
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          if (pathCells.has(`${col},${row}`)) continue;
          const c = center(col, row);
          const reaches = (chain) => chain.some((id) => byId.get(id).pts.some((q) => Math.hypot(q[0] - c.x, q[1] - c.y) <= reach));
          if (routes.every(reaches)) cells.push([col, row]);
        }
      }
      return { routes: routes.length, cells };
    },
  };
}

// ------------------------------------------------------------------ ввод

/**
 * Ввод игрока. Координаты — на странице (пиксели окна браузера).
 * На компьютере — мышь, на телефоне — настоящие касания браузера (Input.dispatchTouchEvent, в том числе два пальца сразу).
 */
export function createInput(page, cdp, isTouch) {
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  return {
    isTouch,
    /** Короткое нажатие. */
    async tap(p) {
      if (isTouch) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    },
    /** Нажатие и удержание на месте (без сдвига) заданное время, мс. */
    async hold(p, ms) {
      if (isTouch) {
        await touch('touchStart', [p]);
        await sleep(ms);
        await touch('touchEnd', []);
      } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await sleep(ms);
        await page.mouse.up();
      }
    },
    /** Нажатие, небольшое смещение на dx пикселей и отпускание (дрожащий палец: это всё равно тап). */
    async wobbleTap(p, dx) {
      const q = { x: p.x + dx, y: p.y };
      if (isTouch) {
        // Три события уходят разом: если ждать подтверждения каждого, на медленной странице (программная графика, телефон с плотностью ×2) нажатие
        // «длится» больше tapMaxMs и игра справедливо не считает его тапом (в журнале игры: dt = 516…587 мс против 1 мс при отправке разом)
        await Promise.all([touch('touchStart', [p]), touch('touchMove', [q]), touch('touchEnd', [])]);
      } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(q.x, q.y);
        await page.mouse.up();
      }
    },
    /** Перетаскивание из точки a в точку b за `steps` шагов. */
    async drag(a, b, { steps = 8, stepMs = 15 } = {}) {
      if (isTouch) {
        await touch('touchStart', [a]);
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', [lerp(a, b, i / steps)]);
          await sleep(stepMs);
        }
        await touch('touchEnd', []);
      } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        for (let i = 1; i <= steps; i++) {
          const q = lerp(a, b, i / steps);
          await page.mouse.move(q.x, q.y);
          await sleep(stepMs);
        }
        await page.mouse.up();
      }
    },
    /** Мышь просто ведут над полем (компьютер): «призрак» башни. */
    async hover(p) {
      await page.mouse.move(p.x, p.y);
    },
    /** Колесо мыши (компьютер): отрицательное — приближение, положительное — отдаление. */
    async wheel(p, deltaY) {
      await page.mouse.move(p.x, p.y);
      await page.mouse.wheel(0, deltaY);
    },
    /** Два пальца сходятся или расходятся вокруг точки; d0 и d1 — расстояние между ними в начале и в конце. */
    async pinch(center, d0, d1, { steps = 10, stepMs = 25 } = {}) {
      const two = (d) => [
        { x: center.x - d / 2, y: center.y },
        { x: center.x + d / 2, y: center.y },
      ];
      await touch('touchStart', two(d0));
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', two(d0 + ((d1 - d0) * i) / steps));
        await sleep(stepMs);
      }
      await touch('touchEnd', []);
    },
    /** Два пальца коснулись и сразу отпустились, не двигаясь. */
    async twoFingerTap(center, d) {
      const points = [
        { x: center.x - d / 2, y: center.y },
        { x: center.x + d / 2, y: center.y },
      ];
      await touch('touchStart', points);
      await touch('touchEnd', []);
    },
  };
}

// ------------------------------------------------------------------ цвет пикселей

/**
 * Цвета точек на скриншоте. `png` — снимок окна (page.screenshot), `points` — [[x, y], ...] в пикселях страницы.
 * Возвращает [[r, g, b], ...].
 */
export async function samplePixels(page, png, points) {
  return page.evaluate(
    async ({ b64, pts }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const k = img.width / innerWidth;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const px = Math.max(0, Math.min(img.width - 1, Math.round(x * k)));
        const py = Math.max(0, Math.min(img.height - 1, Math.round(y * k)));
        return Array.from(g.getImageData(px, py, 1, 1).data.slice(0, 3));
      });
    },
    { b64: png.toString('base64'), pts: points },
  );
}

/** Занятая страницей память JS, МБ (после принудительной уборки мусора) — для поиска утечек. */
export async function heapMb(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576;
}

/** Очки ДНК за `wavesCleared` пройденных волн по таблице `readMetaTable().dna` (та же формула, что в `src/meta.ts`: waveBase·k + waveStep·k·(k + 1)/2, округление до ближайшего целого). */
export function dnaWavesReward(dna, wavesCleared, level = 1) {
  const k = Math.max(0, Math.floor(wavesCleared));
  const mul = dna.levelMul?.[Math.min(dna.levelMul.length, Math.max(1, level)) - 1] ?? 1;
  return Math.round((dna.waveBase * k + (dna.waveStep * k * (k + 1)) / 2) * mul);
}

/**
 * Очки ДНК и улучшения вне партии из src/config.ts (раздел meta): { dna: { waveBase, waveStep, levelMul, floor, miniBossFirst, bossFirst, flawlessShare, winBonus, replayFactor, coinsPerPoint, coinsCapShare },
 * upgrades: { id: { branch, effect, perLevel, prices: [...], requires } } }.
 * Порядок ключей — порядок строк в таблице (как на экране «Улучшения»).
 */
export function readMetaTable() {
  const src = readSource('src/config.ts');
  const start = /\bmeta:\s*\{/.exec(src);
  if (!start) throw new Error('В config.ts нет раздела «meta»');
  const body = src.slice(start.index);
  const num = (key) => {
    const found = new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`).exec(body);
    if (!found) throw new Error(`В разделе «meta» config.ts нет числа «${key}»`);
    return Number(found[1]);
  };
  const upStart = body.indexOf('upgrades:');
  if (upStart < 0) throw new Error('В разделе «meta» config.ts нет «upgrades»');
  const upgrades = {};
  for (const m of body.slice(upStart).matchAll(/(\w+):\s*\{\s*branch:\s*'(\w+)',\s*effect:\s*'(\w+)',\s*perLevel:\s*(-?[\d.]+),\s*prices:\s*\[([^\]]*)\](?:,\s*requires:\s*\['(\w+)',\s*(\d+)\])?\s*\}/g)) {
    upgrades[m[1]] = { branch: m[2], effect: m[3], perLevel: Number(m[4]), prices: m[5].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)), requires: m[6] ? { id: m[6], level: Number(m[7]) } : null };
  }
  if (!Object.keys(upgrades).length) throw new Error('В разделе «meta» config.ts не нашлось улучшений');
  // сеть древа (meta.network): кольцо каждого уровня узла (`upgrades[id].rings`, у узлов башен — нет: вне колец) и победы, открывающие кольца
  const netStart = body.indexOf('network:');
  const ringOpenAfter = netStart < 0 ? [0] : (/ringOpenAfter:\s*\[([^\]]*)\]/.exec(body.slice(netStart))?.[1] ?? '0').split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  if (netStart >= 0) {
    const ringsBody = body.slice(body.indexOf('rings:', netStart));
    for (const m of ringsBody.slice(0, ringsBody.indexOf('} as Record')).matchAll(/(\w+):\s*\[([^\]]*)\]/g)) if (upgrades[m[1]]) upgrades[m[1]].rings = m[2].split(',').map((x) => Number(x.trim()));
  }
  const levelMul = /levelMul:\s*\[([^\]]*)\]/.exec(body);
  return {
    dna: {
      waveBase: num('waveBase'),
      waveStep: num('waveStep'),
      levelMul: levelMul ? levelMul[1].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)) : [1],
      floor: num('floor'),
      miniBossFirst: num('miniBossFirst'),
      bossFirst: num('bossFirst'),
      flawlessShare: num('flawlessShare'),
      winBonus: num('winBonus'),
      replayFactor: num('replayFactor'),
      coinsPerPoint: num('coinsPerPoint'),
      coinsCapShare: num('coinsCapShare'),
    },
    upgrades,
    network: { ringOpenAfter },
  };
}

/** Сколько колец сети открыто, когда играется уровень `playLevel` (пройдены все уровни до него): кольцо k открыто победой на уровне `ringOpenAfter[k − 1]` (0 — сразу). */
export function openRingsAt(meta, playLevel) {
  let k = 0;
  while (k < meta.network.ringOpenAfter.length && meta.network.ringOpenAfter[k] <= playLevel - 1) k++;
  return k;
}

/** Кольцо следующего уровня узла (уровень `have + 1`); узлы башен — 0 (вне колец). */
export const nextRing = (u, have) => u.rings?.[have] ?? 0;

/**
 * Жадная покупка улучшений вне партии: пока хватает очков, берётся первое по порядку `order` улучшение, у которого есть следующий уровень по цене не выше остатка,
 * ветка открыта (`branchOpen`: ветка башни — после узла башни) и родитель куплен до нужного уровня. `upgrades` — таблица из `readMetaTable().upgrades`,
 * `levels` — текущие уровни улучшений ({id: число}). Возвращает новые уровни, остаток очков и список покупок.
 */
export function buyGreedy({ upgrades, order, levels, dna, openRing = Infinity }) {
  const next = { ...levels };
  const bought = [];
  let left = dna;
  for (;;) {
    const id = order.find((x) => upgrades[x] && branchOpen(upgrades[x].branch, next) && nextRing(upgrades[x], next[x] ?? 0) <= openRing && upgrades[x].prices[next[x] ?? 0] !== undefined && upgrades[x].prices[next[x] ?? 0] <= left && (!upgrades[x].requires || (next[upgrades[x].requires.id] ?? 0) >= upgrades[x].requires.level));
    if (!id) break;
    left -= upgrades[id].prices[next[id] ?? 0];
    next[id] = (next[id] ?? 0) + 1;
    bought.push(id);
  }
  return { levels: next, dna: left, bought };
}

/** Множитель силы обороны от l-го уровня узла «+шаг» при доле башни share в уроне обороны: (1 + шаг·share·l) / (1 + шаг·share·(l − 1)) (как `pct` в docs/redesign-model-2026-10-19.mjs). */
const pctGain = (step, share = 1) => (l) => (1 + step * share * l) / (1 + step * share * (l - 1));
/** Доля башни в уроне обороны эксперта (для веток башен; как в модели): Таблетка — основа, Сироп — лужа (замедление), Витамин — аура на всех. */
const BRANCH_SHARE = { pill: 0.5, syrup: 0.6, fizz: 0.3, syringe: 0.3, ampule: 0.2, antibiotic: 0.2, lamp: 0.08, vitamin: 1, frost: 0.25, patch: 0.1 };
/** Крупные узлы (башни, умения, ключевые узлы) и их оценка силы (модель, раздел 5 документа дизайна): покупаются первыми, как только хватает очков. */
const BIG_GAIN = {
  towerSyrup: 1.2, towerFizz: 1.2, towerSyringe: SYRINGE_GAIN, towerAmpule: 1.12, towerLamp: 1.06, towerAntibiotic: 1.1, towerVitamin: 1.1, towerFrost: 1.07, towerPatch: 1.05,
  fever: 1, pillKey: 1.1, fizzKey: 1.08, syringeKey: 1.07, ampuleKey: 1.07, antibioticKey: 1.06, syrupKey: 1.05, lampKey: 1.05, vitaminKey: 1.04, frostKey: 1.05, patchKey: 1.03,
};
/** Прирост силы от следующего уровня узла `id` (множитель; 1 — силы не прибавляет, такой узел лучший порядок не покупает). */
/** Полоса попадания луча Шприца без улучшений, px: полуширина луча 10 + 0,7 радиуса бактерии (src/objects/Tower.ts; радиус палочки и бегуна — половина длины, extentOf) — у бегуна 28,2, кокка 31,
 *  слизня 29,6, бронированной 43,6, палочки 46,4; берётся средняя ≈ 33. Узел «Ширина» +2 px за уровень — около +6 % за первый уровень (решение владельца 21 октября 2026, сообщение 1, п. 4; прежде считалось +20 %). */
const BEAM_BAND_PX = 33;
function nodeGain(upgrades, id, level, shares = null) {
  const u = upgrades[id];
  if (BIG_GAIN[id] !== undefined) return BIG_GAIN[id];
  // доля башни в уроне обороны: по составу поля прошлой попытки (shares; решение владельца 20 октября 2026, сообщение 5, п. 3.1), иначе — постоянная BRANCH_SHARE
  const share = shares?.[u.branch] ?? BRANCH_SHARE[u.branch] ?? 1;
  switch (u.effect) {
    case 'damage': return pctGain(u.perLevel)(level);
    case 'towerDamage': return pctGain(u.perLevel, share)(level);
    case 'puddleSec': return pctGain(u.perLevel * 0.6, share)(level);
    case 'cooldown': return pctGain(-u.perLevel, share)(level);
    case 'auraBoost': return pctGain(-u.perLevel, share)(level);
    case 'freezeTime': return pctGain(u.perLevel, share)(level);
    case 'range': return pctGain(0.02, share)(level);
    case 'beamWidth': return pctGain(u.perLevel / BEAM_BAND_PX, share)(level);
    case 'price': return pctGain(-u.perLevel, share)(level);
    case 'coins': return 1 + (u.perLevel / 1345) * 0.6; // монеты на старте: заметны в начале попытки (к 15-й волне уровня 1 у игрока ≈ 1 345 монет)
    case 'reward': return pctGain(u.perLevel * 0.6)(level);
    default: return 1;
  }
}

/** Узел и все узлы, которые он требует (по цепочке `requires`), от корня к узлу; узла нет в таблице — пусто. */
export function nodeChain(upgrades, id) {
  const out = [];
  for (let x = id; x && upgrades[x] && !out.includes(x); x = upgrades[x].requires?.id) out.unshift(x);
  return out;
}

/**
 * Лучший найденный порядок покупок очков ДНК (раздел 10.1 документа дизайна, п. 7; как `spend` в модели): из открытых узлов, на следующий уровень которых хватает очков, сначала крупные (башни, умения, ключевые узлы),
 * затем остальные — по наибольшему приросту силы на очко ДНК (ln(прирост) / цена); узлы без прироста силы не покупаются. `towers` (необязательно) — башни стратегии:
 * ДНК — только на узлы и ветки своих башен и общие узлы (решение владельца 19 октября 2026, сообщение 4, п. 1.2); узлы других башен не покупаются, даже если общий узел
 * («Лихорадка») их требует. `saveFor` (необязательно) — башни ядра, на которые игрок копит: пока они не открыты, ДНК идёт только на цепочку к ним (без покупок по пути).
 * Возвращает новые уровни, остаток очков и список покупок.
 */
export function buyBest({ upgrades, levels, dna, towers = null, saveFor = null, shares = null, openRing = Infinity }) {
  // узлы башен на пути к своим башням (цепочка «требует»), если своя башня ещё не открыта
  const needed = new Set(towers ? towers.filter((id) => !(levels[towerNodeId(id)] > 0)).map(towerNodeId).flatMap((id) => nodeChain(upgrades, id)) : []);
  const foreign = (id) => {
    if (!towers || needed.has(id)) return false;
    const u = upgrades[id];
    const own = Object.keys(BRANCH_SHARE).find((t) => towerNodeId(t) === id) ?? (u.branch in BRANCH_SHARE ? u.branch : null);
    return own !== null && !towers.includes(own);
  };
  const next = { ...levels };
  const bought = [];
  let left = dna;
  // следующий некупленный узел на пути к неоткрытой башне ядра (null — копить не на что)
  const saveTarget = () => (saveFor ?? []).filter((t) => !(next[towerNodeId(t)] > 0)).flatMap((t) => nodeChain(upgrades, towerNodeId(t))).find((id) => !(next[id] > 0)) ?? null;
  for (;;) {
    const target = saveTarget();
    if (target) {
      const price = upgrades[target].prices[next[target] ?? 0];
      if (price > left) break;
      left -= price;
      next[target] = (next[target] ?? 0) + 1;
      bought.push(target);
      continue;
    }
    const opts = Object.keys(upgrades).filter((id) => {
      const u = upgrades[id];
      const price = u.prices[next[id] ?? 0];
      return price !== undefined && price <= left && !foreign(id) && branchOpen(u.branch, next) && nextRing(u, next[id] ?? 0) <= openRing && (!u.requires || (next[u.requires.id] ?? 0) >= u.requires.level) && (BIG_GAIN[id] !== undefined || nodeGain(upgrades, id, (next[id] ?? 0) + 1, shares) > 1);
    });
    if (!opts.length) break;
    const big = opts.filter((id) => BIG_GAIN[id] !== undefined);
    const from = big.length ? big : opts;
    const score = (id) => Math.log(nodeGain(upgrades, id, (next[id] ?? 0) + 1, shares)) / upgrades[id].prices[next[id] ?? 0];
    from.sort((a, b) => score(b) - score(a));
    const id = from[0];
    left -= upgrades[id].prices[next[id] ?? 0];
    next[id] = (next[id] ?? 0) + 1;
    bought.push(id);
  }
  return { levels: next, dna: left, bought };
}

/**
 * Порядок покупок бота (решение владельца 17 октября 2026): как у профиля тестировщика «урон» — сначала `damage`, затем ветка башни, которую бот ставит чаще всего (у профилей expert, strong, zone, average — Таблетка;
 * `tower` по умолчанию `pill`), затем остальные улучшения в прежнем порядке (`baseBuyOrder`: coins, lives, reward, далее таблица `meta.upgrades`). До 17 октября 2026 порядок был `baseBuyOrder`: ветка защиты шла раньше
 * ветки Таблетки, и expert за 7 попыток вложил в урон 3 % очков (docs/balance-history.md, «Проверка серий Д по журналам»).
 */
export function buyOrder(upgrades, tower = 'pill') {
  const own = Object.keys(upgrades).filter((id) => upgrades[id].branch === tower);
  const first = ['damage', ...own];
  return [...first, ...baseBuyOrder(upgrades).filter((id) => !first.includes(id))];
}

/** Прежний порядок покупок (до 17 октября 2026): coins, lives, reward, затем все улучшения в порядке таблицы; `damage` стоит первым. */
export function baseBuyOrder(upgrades) {
  const first = ['damage', 'coins', 'lives', 'reward'];
  return [...first, ...Object.keys(upgrades).filter((id) => !first.includes(id))];
}

/**
 * Порядок покупок для замера «одна башня» (docs/fizz-solo-plan.md): сначала узел башни и улучшения её ветки (в порядке таблицы; недоступные по уровню или без очков
 * пропускаются жадным выбором), затем обычный порядок. Игрок, который играет одной башней, качает именно её.
 */
export function buyOrderSolo(upgrades, tower) {
  const own = [...nodeChain(upgrades, towerNodeId(tower)), ...Object.keys(upgrades).filter((id) => upgrades[id].branch === tower)];
  return [...own, ...baseBuyOrder(upgrades).filter((id) => !own.includes(id))];
}
