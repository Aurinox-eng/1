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

/** Уровень из src/level.ts: размер карты в клетках и центр камеры при старте (сеть дорожек — из игры, через window.__pvb.getGraph()). */
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

/** С какого уровня открыта каждая башня: `levels.towerUnlock` из src/config.ts, например { pill: 1, syrup: 1, fizz: 5, syringe: 10 }. */
export function readTowerUnlock() {
  const src = readSource('src/config.ts');
  const found = /towerUnlock:\s*\{([^}]*)\}/.exec(src);
  if (!found) throw new Error('В config.ts нет таблицы levels.towerUnlock');
  const table = {};
  for (const [, key, value] of found[1].matchAll(/(\w+):\s*(\d+)/g)) table[key] = Number(value);
  return table;
}

/**
 * Таблица башен из src/config.ts (раздел `towers`): { id: { price, range, damage, cooldownMs, projectileSpeed, blastRadius,
 * slowFactor, slowSec, targeting, side } } в порядке строк. Читает числа и строки в одинарных кавычках из каждой строки таблицы
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
 * Геометрия карты по сети дорожек, которую отдала игра (getGraph): рёбра-кривые, клетки дорожки (центр клетки ближе
 * pathWidth/2 + 0.45·tile к любой точке любого ребра), расстояние до ребра, вероятности ребер, покрытие башней.
 * Правила описаны в задании, код игры не используется.
 */
export function makeGraphGeometry(graph, map, cols, rows) {
  const center = (col, row) => ({ x: map.orgW + map.tile * (col + 0.5), y: map.tile * (row + 0.5) });
  const edges = graph.edges;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const limit = map.pathWidth / 2 + 0.45 * map.tile; // 89,35 px при tile 103 (запас, чтобы основание башни не заходило на полосу дорожки)
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
  return {
    center,
    limit,
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
