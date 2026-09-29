/**
 * Режим проверки (для qa-tester и бота баланса). Он есть ТОЛЬКО в режиме разработки (`npm run dev`)
 * и в специальной тестовой сборке (`npm run build:qa`). В игровую сборку (`npm run build`, она
 * уходит на Яндекс Игры) этот код не попадает вообще — игрок включить его не сможет.
 *
 * Включается параметром ?qa в адресе:
 *   http://localhost:5173/?qa            — открывает доступ к состоянию игры для тестов
 *   http://localhost:5173/?qa&speed=4    — то же, но игровое время идёт в 4 раза быстрее
 *   http://localhost:5173/?qa&cfg=bacteria.startSpeed:120,pill.cooldownMs:200,sizes.large.points:15
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
  state: 'playing' | 'over';
  score: number;
  /** Сколько раз попали по бактериям за партию (любого типа). */
  hits: number;
  /** Сколько бактерий уничтожено. */
  kills: number;
  /** Сколько делящихся распалось от попаданий и сколько поделилось само. */
  splits: number;
  selfSplits: number;
  /** Сколько жизней осталось и сколько было в начале. */
  lives: number;
  maxLives: number;
  /** Какие типы бактерий уже появлялись, в порядке появления. */
  introduced: string[];
  /** Сколько таблеток выпущено за партию. */
  shots: number;
  elapsed: number;
  level: number;
  lang: string;
  renderer: 'webgl' | 'canvas';
  /** Сколько обработчиков нажатия навешено (должно быть ровно столько, сколько ждёт игра, — иначе утечка). */
  tapListeners: number;
  width: number;
  height: number;
  loseLineY: number;
  /** r — радиус описанного круга, bottom — нижняя точка (касание её красной линии отнимает жизнь). */
  bacteria: { x: number; y: number; r: number; bottom: number; age: number; kind: string; hp: number; maxHp: number }[];
  pills: { x: number; y: number }[];
  /** Сколько раз сработали вспышка, частицы, всплывающее «+очки», тряска экрана и красная вспышка потери жизни. */
  effects: { flashes: number; bursts: number; popups: number; shakes: number; lifeLosses: number };
  /** Звук: состояние аудио («running» — играет) и сколько звуков сыграно с загрузки страницы. */
  sound: { state: string; played: number };
}

declare global {
  interface Window {
    __pvb?: { getState: () => DebugSnapshot };
  }
}

export function exposeDebug(getState: () => DebugSnapshot): void {
  if (QA_MODE) window.__pvb = { getState };
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
