/**
 * Режим проверки (для qa-tester и бота баланса). Включается параметром ?qa в адресе:
 *   http://localhost:5173/?qa            — открывает доступ к состоянию игры для тестов
 *   http://localhost:5173/?qa&speed=4    — то же, но игровое время идёт в 4 раза быстрее
 *   http://localhost:5173/?qa&cfg=bacteria.startSpeed:120,pill.cooldownMs:200
 *                                        — временно подменяет числа из config.ts (для подбора баланса)
 * Обычный игрок этот режим не видит: без ?qa ничего не меняется.
 */
const params = new URLSearchParams(window.location.search);

export const QA_MODE = params.has('qa');

/** Множитель игрового времени (1 = обычная скорость). Работает только вместе с ?qa. */
export const TIME_SCALE = QA_MODE ? Math.min(10, Math.max(0.1, Number(params.get('speed')) || 1)) : 1;

export interface DebugSnapshot {
  state: 'playing' | 'over';
  score: number;
  /** Сколько таблеток выпущено за партию. */
  shots: number;
  elapsed: number;
  level: number;
  lang: string;
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
