/**
 * Текущий уровень и какие башни на нём открыты.
 *
 * Меню уровней появится на этапе 5; до него номер уровня берётся из адреса: `?level=5` (по умолчанию 1). Таблица «с какого уровня открыта
 * башня» — `CONFIG.levels.towerUnlock`.
 */
import { CONFIG } from './config';

function readLevel(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('level'));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(CONFIG.levels.count, Math.floor(raw));
}

/** Номер текущего уровня (1…`levels.count`). */
export const CURRENT_LEVEL: number = readLevel();

/** С какого уровня башня открыта (1 — с самого начала). Башни, которой нет в таблице, открыта всегда. */
export function unlockLevel(id: string): number {
  return CONFIG.levels.towerUnlock[id] ?? 1;
}

/** Открыта ли башня на текущем уровне. */
export function isTowerOpen(id: string): boolean {
  return unlockLevel(id) <= CURRENT_LEVEL;
}

/** Башни, которые открылись именно на этом уровне (для них в начале уровня показывается плашка), в порядке таблицы башен. */
export function newTowersOfLevel(ids: string[]): string[] {
  return ids.filter((id) => unlockLevel(id) === CURRENT_LEVEL);
}
