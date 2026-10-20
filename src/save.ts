/**
 * Сохранение прогресса вне партии (очки ДНК и уровни улучшений) в браузере.
 *
 * Хранилище — `localStorage`, ключ `pvb.meta`. Любое обращение защищено: в закрытом режиме браузера или при запрете хранилища оно бросает
 * ошибку, тогда игра работает с нулевым прогрессом. На этапе 9 тело двух функций заменяется облачным сохранением Яндекс Игр,
 * остальной код не меняется.
 */
import { CONFIG } from './config';

/** Id улучшения: ключ строки таблицы `CONFIG.meta.upgrades` (новая строка таблицы — новое улучшение без правок кода сохранения). */
export type UpgradeId = string;

/** Порядок улучшений: порядок строк в `CONFIG.meta.upgrades`. */
export const UPGRADE_IDS: UpgradeId[] = Object.keys(CONFIG.meta.upgrades);

export interface MetaSave {
  /** Версия формата: 1 — очки и улучшения (этап 6а); 2 — плюс прогресс по уровням и показанные плашки (этап 5); 3 — улучшения всех веток древа (этап 6б); 4 — попытки и строки итога (решение владельца 18 октября 2026, ответ 7);
   *  5 — новое древо, победы над боссами и «без потерь» (переработка, пакет «Уровень 1», 19 октября 2026). Версия 5 хранится под своим ключом (`KEY`) и начинается с нуля: прежнее сохранение не переносится. */
  v: 5;
  /** Очки ДНК на счёте (целое число ≥ 0). */
  dna: number;
  /** Уровень каждого улучшения по id из таблицы (0 — не куплено; id, которых нет в записи, читаются как 0). */
  levels: Record<UpgradeId, number>;
  /** Прогресс по уровням: звёзды (0–3) и лучшая достигнутая волна (0 — уровень не играли); индекс 0 — уровень 1. Длина — `CONFIG.levels.count`. */
  progress: { stars: number[]; best: number[] };
  /** Какие плашки с описанием игрок уже видел («b:тип» — бактерия, «t:башня» — башня). */
  seen: string[];
  /** Сколько попыток (партий, закончившихся гибелью или победой) сыграно на каждом уровне; индекс 0 — уровень 1. */
  attempts: number[];
  /** Строки итога последних попыток (новые в конце, не больше `MAX_LOG`): кнопка «Скопировать все попытки» в меню. */
  log: string[];
  /** Улучшения, купленные после конца прошлой попытки (id по порядку покупки): поле «куплено после прошлой» строки итога. */
  bought: UpgradeId[];
  /** Первые победы над боссами по уровням (индекс 0 — уровень 1): биты 0–3 — мини-боссы 10, 20, 30, 40-й волн, бит 4 — босс уровня. */
  bossWins: number[];
  /** Получена ли награда «без потери жизней» на уровне (0 или 1; индекс 0 — уровень 1). */
  flawless: number[];
}

/** Наибольшие допустимые значения при чтении сохранения: больше — значит запись чужая или испорченная. */
const MAX_BEST_WAVE = 1000;
const MAX_SEEN = 200;
const MAX_SEEN_LEN = 40;
const MAX_ATTEMPTS = 100000;
/** Сколько строк итога хранится и копируется из меню. */
export const MAX_LOG = 20;
const MAX_LOG_LEN = 1000;
const MAX_BOUGHT = 400;

/** Ключ хранилища. Сборки main, ветки стиля и рабочей ветки открываются с одного адреса (aurinox-eng.github.io) и делят одно хранилище; прежние сборки читают ключ `pvb.meta` и записывают обратно только знакомые
 *  им поля. Поэтому новое древо хранится под своим ключом, прогресс в нём начинается с нуля, прежнее сохранение не переносится и очки за него не возвращаются (решение владельца 19 октября 2026, сводное сообщение, п. 2). */
export const META_KEY = 'pvb.meta5';
const KEY = META_KEY;

/** Наибольший уровень улучшения (число цен в таблице). */
export function maxLevel(id: UpgradeId): number {
  return CONFIG.meta.upgrades[id].prices.length;
}

export function emptyMeta(): MetaSave {
  const zeros = (): number[] => Array.from({ length: CONFIG.levels.count }, () => 0);
  return { v: 5, dna: 0, levels: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])), progress: { stars: zeros(), best: zeros() }, seen: [], attempts: zeros(), log: [], bought: [], bossWins: zeros(), flawless: zeros() };
}

/** Приводит прочитанное к допустимому виду: чужие или испорченные значения заменяются нулём, уровни ограничиваются наибольшим. */
export function sanitizeMeta(raw: unknown): MetaSave {
  const out = emptyMeta();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { dna?: unknown; levels?: unknown; progress?: unknown; seen?: unknown; attempts?: unknown; log?: unknown; bought?: unknown; bossWins?: unknown; flawless?: unknown };
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
  if (Array.isArray(r.attempts)) {
    for (let i = 0; i < out.attempts.length && i < r.attempts.length; i++) {
      const n = r.attempts[i];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out.attempts[i] = Math.min(MAX_ATTEMPTS, Math.floor(n));
    }
  }
  const fillBits = (src: unknown, dst: number[], max: number): void => {
    if (!Array.isArray(src)) return;
    for (let i = 0; i < dst.length && i < src.length; i++) {
      const n = src[i];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) dst[i] = Math.min(max, Math.floor(n));
    }
  };
  fillBits(r.bossWins, out.bossWins, 31);
  fillBits(r.flawless, out.flawless, 1);
  if (Array.isArray(r.log)) out.log = r.log.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_LOG_LEN).slice(-MAX_LOG);
  if (Array.isArray(r.bought)) out.bought = r.bought.filter((x): x is string => typeof x === 'string' && UPGRADE_IDS.includes(x)).slice(-MAX_BOUGHT);
  if (Array.isArray(r.seen)) {
    out.seen = r.seen.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_SEEN_LEN).slice(0, MAX_SEEN);
  }
  return out;
}

export function loadMeta(): MetaSave {
  return tryLoadMeta() ?? emptyMeta();
}

/** Сохранение из хранилища; null — хранилище недоступно или запись не читается (тогда прогресс живёт в памяти страницы, и перечитывать нечего). */
export function tryLoadMeta(): MetaSave | null {
  try {
    const text = window.localStorage.getItem(KEY);
    return text ? sanitizeMeta(JSON.parse(text)) : emptyMeta();
  } catch {
    return null;
  }
}

/** Записывает сохранение; false — хранилище недоступно (прогресс живёт до закрытия страницы). */
export function saveMeta(meta: MetaSave): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}
