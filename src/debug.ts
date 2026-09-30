/**
 * Режим проверки (для qa-tester и бота баланса). Он есть ТОЛЬКО в режиме разработки (`npm run dev`)
 * и в специальной тестовой сборке (`npm run build:qa`). В игровую сборку (`npm run build`, она
 * уходит на Яндекс Игры) этот код не попадает вообще — игрок включить его не сможет.
 *
 * Включается параметром ?qa в адресе:
 *   http://localhost:5173/?qa            — открывает доступ к состоянию игры для тестов
 *   http://localhost:5173/?qa&speed=4    — то же, но игровое время идёт в 4 раза быстрее
 *   http://localhost:5173/?qa&cfg=bacteria.baseSpeed:60,towers.pill.cooldownMs:300,economy.startCoins:500
 *                                        — временно подменяет числа из config.ts (для подбора баланса)
 *   http://localhost:5173/?lang=en       — принудительно выбирает язык (проверка переводов)
 */
/** Разрешён ли режим проверки в этой сборке (в игровой сборке — всегда false). */
export const QA_ENABLED: boolean = import.meta.env.DEV || import.meta.env.MODE === 'qa';

const params = new URLSearchParams(window.location.search);

export const QA_MODE: boolean = QA_ENABLED && params.has('qa');

/** Множитель игрового времени (1 = обычная скорость). Работает только вместе с ?qa. */
export const TIME_SCALE: number = QA_MODE ? Math.min(10, Math.max(0.1, Number(params.get('speed')) || 1)) : 1;

export interface DebugSnapshot {
  state: 'playing' | 'paused' | 'won' | 'lost';
  coins: number;
  lives: number;
  maxLives: number;
  /** Сколько волн уже началось и сколько их всего; сколько бактерий вышло за уровень и сколько уничтожено. */
  wave: number;
  waveTotal: number;
  spawned: number;
  kills: number;
  /** Сколько бактерий дошло до организма. */
  leaked: number;
  /** Сколько выстрелов сделано башнями. */
  shots: number;
  elapsed: number;
  lang: string;
  renderer: 'webgl' | 'canvas';
  /** Размер экрана игры и ширина окна карты (без правой панели), пикселей. */
  width: number;
  height: number;
  viewW: number;
  /** Карта: размер в клетках, сторона клетки, ширина зоны организма, размер мира в пикселях. */
  map: { cols: number; rows: number; tile: number; orgW: number; worldW: number; worldH: number };
  /** Камера: приближение, центр (в пикселях мира) и допустимые пределы приближения. */
  camera: { zoom: number; cx: number; cy: number; zoomMin: number; zoomMax: number };
  /** Выбрана ли башня на панели (её название) и цена. */
  selected: string | null;
  /** Поставленные башни: клетка и центр в пикселях мира. */
  towers: { id: string; col: number; row: number; x: number; y: number }[];
  /** Бактерии: центр в пикселях мира, радиус, номер маршрута, пройденный путь. */
  bacteria: { id: number; x: number; y: number; r: number; kind: string; hp: number; maxHp: number; route: number; s: number }[];
  projectiles: number;
  /** Где на экране игры кнопки панели (центры) и сколько жизней нарисовано. */
  ui: { towerButton: { x: number; y: number; w: number; h: number }; pauseButton: { x: number; y: number }; lives: number };
  /** Сколько обработчиков нажатия навешено на сцену (при перезапуске не должно расти — иначе утечка). */
  pointerListeners: number;
  /** Сколько раз сработали вспышка, частицы, «+монеты», кольцо постановки и красная вспышка потери жизни. */
  effects: { flashes: number; bursts: number; popups: number; placements: number; lifeLosses: number };
  /** Звук: состояние аудио («running» — играет) и сколько звуков сыграно с загрузки страницы. */
  sound: { state: string; played: number };
}

/** Что игра отдаёт проверкам через window.__pvb. */
export interface DebugApi {
  getState: () => DebugSnapshot;
  /** Точка мира → координаты на странице (для мыши и касаний Playwright), с учётом камеры и масштаба экрана. */
  worldToClient: (wx: number, wy: number) => { x: number; y: number };
  /** Точка экрана игры (1280×720) → координаты на странице. */
  gameToClient: (gx: number, gy: number) => { x: number; y: number };
  /** Центр клетки → координаты на странице. */
  cellToClient: (col: number, row: number) => { x: number; y: number };
}

declare global {
  interface Window {
    __pvb?: DebugApi;
  }
}

export function exposeDebug(api: DebugApi): void {
  if (QA_MODE) window.__pvb = api;
}

/**
 * Подменяет числа в CONFIG значениями из адреса (?qa&cfg=раздел.параметр:число,...).
 * Меняются только уже существующие числовые параметры; сам файл config.ts не трогается.
 * Непонятную запись игра пропускает и пишет в консоль предупреждение, начинающееся с «cfg:»
 * (бот баланса по нему останавливается, чтобы не выдать замер исходных чисел за замер новых).
 */
export function applyConfigOverrides(config: Record<string, unknown>): void {
  const raw = params.get('cfg');
  if (!QA_MODE || !raw) return;
  for (const item of raw.split(',')) {
    const [path, valueText] = item.split(':');
    const keys = (path ?? '').split('.');
    const last = keys.pop();
    let target: unknown = config;
    for (const key of keys) target = (target as Record<string, unknown> | undefined)?.[key];
    const value = Number(valueText);
    const holder = target as Record<string, unknown> | undefined;
    if (last && holder && typeof holder[last] === 'number' && valueText !== undefined && valueText !== '' && Number.isFinite(value)) {
      holder[last] = value;
    } else {
      console.warn(`cfg: не понял «${item}» — пропускаю`);
    }
  }
}
