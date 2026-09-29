/**
 * Режим проверки (для qa-tester и бота баланса). Он есть ТОЛЬКО в режиме разработки (`npm run dev`)
 * и в специальной тестовой сборке (`npm run build:qa`). В игровую сборку (`npm run build`, она
 * уходит на Яндекс Игры) этот код не попадает вообще — игрок включить его не сможет.
 *
 * Включается параметром ?qa в адресе:
 *   http://localhost:5173/?qa            — открывает доступ к состоянию игры для тестов
 *   http://localhost:5173/?qa&speed=4    — то же, но игровое время идёт в 4 раза быстрее
 *   http://localhost:5173/?qa&cfg=bacteria.startSpeed:120,pill.cooldownMs:200
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
  /** Сколько бактерий уничтожено за партию. */
  kills: number;
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
  bacteria: { x: number; y: number; r: number; age: number }[];
  pills: { x: number; y: number }[];
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
    const [section, key] = (path ?? '').split('.');
    const value = Number(valueText);
    const target = section ? (config[section] as Record<string, unknown> | undefined) : undefined;
    if (target && key && typeof target[key] === 'number' && Number.isFinite(value)) {
      target[key] = value;
    } else {
      console.warn(`cfg: не понял «${item}» — пропускаю`);
    }
  }
}
