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
  v: 1;
  /** Очки ДНК на счёте (целое число ≥ 0). */
  dna: number;
  /** Уровень каждого улучшения (0 — не куплено). */
  levels: Record<UpgradeId, number>;
}

const KEY = 'pvb.meta';

/** Наибольший уровень улучшения (число цен в таблице). */
export function maxLevel(id: UpgradeId): number {
  return CONFIG.meta.upgrades[id].prices.length;
}

export function emptyMeta(): MetaSave {
  return { v: 1, dna: 0, levels: { lives: 0, coins: 0, damage: 0, reward: 0 } };
}

/** Приводит прочитанное к допустимому виду: чужие или испорченные значения заменяются нулём, уровни ограничиваются наибольшим. */
export function sanitizeMeta(raw: unknown): MetaSave {
  const out = emptyMeta();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { dna?: unknown; levels?: unknown };
  if (typeof r.dna === 'number' && Number.isFinite(r.dna) && r.dna > 0) out.dna = Math.floor(r.dna);
  if (typeof r.levels === 'object' && r.levels !== null) {
    const lv = r.levels as Record<string, unknown>;
    for (const id of UPGRADE_IDS) {
      const n = lv[id];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out.levels[id] = Math.min(maxLevel(id), Math.floor(n));
    }
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
