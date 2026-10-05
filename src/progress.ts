/**
 * Текущий уровень, какие башни на нём открыты и по каким правилам идут его волны.
 *
 * Номер уровня: при запуске — из адреса `?level=5` (по умолчанию 1; адрес с уровнем открывает игру сразу на нём, минуя меню); дальше его задаёт
 * `GameScene` при старте (`setCurrentLevel`). Таблица «с какого уровня открыта башня» — `CONFIG.levels.towerUnlock`; таблица уровней — `CONFIG.levels.specs`.
 */
import { CONFIG, type KindId, type LevelSpec } from './config';
import { LEVEL_WAVES } from './debug';
import { buildLevelWaves, type WaveRow } from './waveGen';

/** Номер уровня из адреса (1…`levels.count`); без параметра — 1. */
export function levelFromUrl(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('level'));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(CONFIG.levels.count, Math.floor(raw));
}

let current: number = levelFromUrl();

/** Номер текущего уровня (1…`levels.count`). */
export function currentLevel(): number {
  return current;
}

export function setCurrentLevel(level: number): void {
  current = Math.max(1, Math.min(CONFIG.levels.count, Math.floor(level)));
}

/** С какого уровня башня открыта (1 — с самого начала). Башни, которой нет в таблице, открыта всегда. */
export function unlockLevel(id: string): number {
  return CONFIG.levels.towerUnlock[id] ?? 1;
}

/** Открыта ли башня на текущем уровне. */
export function isTowerOpen(id: string): boolean {
  return unlockLevel(id) <= current;
}

/** Башни, которые открылись именно на этом уровне (для них в начале уровня показывается плашка), в порядке таблицы башен. */
export function newTowersOfLevel(ids: string[]): string[] {
  return ids.filter((id) => unlockLevel(id) === current);
}

/** Всё, что отличает один уровень от другого при игре: состав волн, их число, рост прочности и кривая наград. */
export interface LevelParams {
  /** Сколько волн идёт на уровне. */
  total: number;
  /** Состав волн: строка — волна, тип → сколько штук. */
  rows: Partial<Record<KindId, number>>[];
  growth: { perWave: number; fromWave: number; latePerWave: number; lateFromWave: number };
  /** Точки [волна, множитель награды]. */
  rewardCurve: number[][];
}

const KINDS = Object.keys(CONFIG.types) as KindId[];
const generated = new Map<number, LevelParams>();

/** Правила уровня. Уровень 1 (и любой уровень без `intro` в таблице) идёт по таблице волн `waves`; остальные — по генератору (`src/waveGen.ts`). */
export function levelParams(level: number): LevelParams {
  const w = CONFIG.waves;
  const spec: LevelSpec = LEVEL_WAVES ? (CONFIG.levels.specs[level - 1] ?? {}) : {};
  const growth = spec.growth ?? { perWave: w.hpGrowthPerWave, fromWave: w.hpGrowthFromWave, latePerWave: w.hpGrowthLatePerWave, lateFromWave: w.hpGrowthLateFromWave };
  const rewardCurve = spec.rewards ?? CONFIG.economy.rewardCurve;
  const count = spec.count ?? w.total;
  if (!spec.intro || !spec.hpBudget) return { total: Math.min(count, w.list.length), rows: w.list, growth, rewardCurve };
  let params = generated.get(level);
  if (!params) {
    const gen = CONFIG.levels.gen;
    const rows = buildLevelWaves(
      { count, intro: spec.intro as Record<string, number>, hpBudget: spec.hpBudget, bosses: spec.bosses as Record<number, Record<string, number>> | undefined },
      { curveExp: gen.curveExp, rampWaves: gen.rampWaves, mix: gen.mix as Record<string, number>, introCount: gen.introCount as Record<string, number> },
      KINDS,
      (kind) => CONFIG.types[kind as KindId].hp,
    ) as WaveRow[];
    params = { total: rows.length, rows: rows as Partial<Record<KindId, number>>[], growth, rewardCurve };
    generated.set(level, params);
  }
  return params;
}
