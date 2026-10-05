/**
 * Сохранение прогресса вне партии (очки ДНК и уровни улучшений) в браузере.
 *
 * Хранилище — `localStorage`, ключ `pvb.meta`. Любое обращение защищено: в закрытом режиме браузера или при запрете хранилища оно бросает
 * ошибку, тогда игра работает с нулевым прогрессом. На этапе 9 тело двух функций заменяется облачным сохранением Яндекс Игр,
 * остальной код не меняется.
 */
import { CONFIG } from './config';

export type UpgradeId = 'lives' | 'coins' | 'damage' | 'reward';

/** Порядок улучшений на экране (и порядок строк в `CONFIG.meta.upgrades`). */
export const UPGRADE_IDS: UpgradeId[] = ['lives', 'coins', 'damage', 'reward'];

export interface MetaSave {
  /** Версия формата: 1 — очки и улучшения (этап 6а); 2 — плюс прогресс по уровням и показанные плашки (этап 5). Версия 1 читается без преобразования. */
  v: 2;
  /** Очки ДНК на счёте (целое число ≥ 0). */
  dna: number;
  /** Уровень каждого улучшения (0 — не куплено). */
  levels: Record<UpgradeId, number>;
  /** Прогресс по уровням: звёзды (0–3) и лучшая достигнутая волна (0 — уровень не играли); индекс 0 — уровень 1. Длина — `CONFIG.levels.count`. */
  progress: { stars: number[]; best: number[] };
  /** Какие плашки с описанием игрок уже видел («b:тип» — бактерия, «t:башня» — башня). */
  seen: string[];
}

/** Наибольшие допустимые значения при чтении сохранения: больше — значит запись чужая или испорченная. */
const MAX_BEST_WAVE = 1000;
const MAX_SEEN = 200;
const MAX_SEEN_LEN = 40;

const KEY = 'pvb.meta';

/** Наибольший уровень улучшения (число цен в таблице). */
export function maxLevel(id: UpgradeId): number {
  return CONFIG.meta.upgrades[id].prices.length;
}

export function emptyMeta(): MetaSave {
  const zeros = (): number[] => Array.from({ length: CONFIG.levels.count }, () => 0);
  return { v: 2, dna: 0, levels: { lives: 0, coins: 0, damage: 0, reward: 0 }, progress: { stars: zeros(), best: zeros() }, seen: [] };
}

/** Приводит прочитанное к допустимому виду: чужие или испорченные значения заменяются нулём, уровни ограничиваются наибольшим. */
export function sanitizeMeta(raw: unknown): MetaSave {
  const out = emptyMeta();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { dna?: unknown; levels?: unknown; progress?: unknown; seen?: unknown };
  if (typeof r.dna === 'number' && Number.isFinite(r.dna) && r.dna > 0) out.dna = Math.floor(r.dna);
  if (typeof r.levels === 'object' && r.levels !== null) {
    const lv = r.levels as Record<string, unknown>;
    for (const id of UPGRADE_IDS) {
      const n = lv[id];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out.levels[id] = Math.min(maxLevel(id), Math.floor(n));
    }
  }
  if (typeof r.progress === 'object' && r.progress !== null) {
    const pr = r.progress as { stars?: unknown; best?: unknown };
    const fill = (src: unknown, dst: number[], max: number): void => {
      if (!Array.isArray(src)) return;
      for (let i = 0; i < dst.length && i < src.length; i++) {
        const n = src[i];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) dst[i] = Math.min(max, Math.floor(n));
      }
    };
    fill(pr.stars, out.progress.stars, 3);
    fill(pr.best, out.progress.best, MAX_BEST_WAVE);
  }
  if (Array.isArray(r.seen)) {
    out.seen = r.seen.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_SEEN_LEN).slice(0, MAX_SEEN);
  }
  return out;
}

export function loadMeta(): MetaSave {
  try {
    const text = window.localStorage.getItem(KEY);
    return text ? sanitizeMeta(JSON.parse(text)) : emptyMeta();
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta: MetaSave): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // хранилище недоступно — прогресс живёт до закрытия страницы
  }
}
