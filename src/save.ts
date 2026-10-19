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
   *  5 — новое древо, победы над боссами и «без потерь» (переработка, пакет «Уровень 1», 19 октября 2026). Версии 1–4 при чтении переводятся в 5 (`migrateLegacy`): узлы, которых в новом древе нет или у которых
   *  уровней стало меньше («Сильное вещество II» целиком), возвращаются очками ДНК по прежним ценам. */
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

/** Цены улучшений сохранений версий 1–4 (таблица `meta.upgrades` до переработки, коммит 82a36a5): по ним при переходе на версию 5 возвращаются очки за узлы, которых нет в новом древе, и за уровни сверх нового наибольшего. */
const LEGACY_PRICES: Record<string, number[]> = {
  damage: [15, 20, 25, 35, 45, 55, 70, 95, 120, 160],
  coins: [10, 10, 15, 20, 25, 30, 40, 50, 65, 85],
  reward: [10, 15, 15, 20, 30, 35, 50, 65, 80, 105],
  damageX: [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170],
  lives: [40, 50, 70],
  shield: [35, 45, 60, 75, 100],
  recycle: [25, 30, 40, 55, 70],
  reinforce: [25, 30, 40, 55, 70, 95, 120, 155],
  pillPower: [20, 25, 35, 45, 55, 75],
  pillRate: [20, 25, 35, 45, 55, 75, 95, 125],
  pillRange: [20, 25, 35, 45, 55, 75],
  pillCheap: [25, 30, 40, 55, 70, 95],
  syrupTime: [20, 25, 35, 45, 55, 75, 95, 125],
  syrupSlow: [25, 30, 40, 55, 70, 95, 120, 155],
  syrupWide: [20, 25, 35, 45, 55, 75, 95, 125],
  syrupCheap: [25, 30, 40, 55, 70, 95],
  fizzPower: [30, 40, 50, 65, 85, 110],
  fizzBlast: [30, 40, 50, 65, 85, 110, 145, 190],
  fizzRate: [30, 40, 50, 65, 85, 110, 145, 190],
  fizzRange: [25, 30, 40, 55, 70, 95],
  fizzCheap: [30, 40, 50, 65, 85, 110],
  syringePower: [35, 45, 60, 75, 100, 130],
  syringeRate: [35, 45, 60, 75, 100, 130, 170, 220],
  syringeWidth: [30, 40, 50, 65, 85, 110, 145, 190],
  syringePulse: [120, 155, 205],
  syringeCheap: [35, 45, 60, 75, 100, 130],
  ampulePower: [30, 40, 50, 65, 85, 110],
  ampuleRate: [30, 40, 50, 65, 85, 110, 145, 190],
  ampuleRange: [25, 35, 40, 55, 70, 95],
  ampuleCheap: [30, 40, 50, 65, 85, 110],
  antibioticPower: [25, 35, 40, 55, 70, 95],
  antibioticRate: [25, 35, 40, 55, 70, 95, 120, 155],
  antibioticRange: [20, 25, 35, 45, 55, 75],
  antibioticCheap: [25, 35, 40, 55, 70, 95],
  lampPower: [30, 40, 50, 65, 85, 110],
  lampRate: [30, 40, 50, 65, 85, 110, 145, 190],
  lampRange: [25, 35, 40, 55, 70, 95],
  lampCheap: [30, 40, 50, 65, 85, 110],
  vitaminPower: [25, 35, 40, 55, 70, 95],
  vitaminRate: [25, 35, 40, 55],
  vitaminRange: [20, 25, 35, 45, 55, 75],
  vitaminCheap: [25, 35, 40, 55, 70, 95],
  frostPower: [30, 40, 50, 65, 85, 110],
  frostRate: [30, 40, 50, 65, 85, 110, 145, 190],
  frostRange: [25, 35, 40, 55, 70, 95],
  frostCheap: [30, 40, 50, 65, 85, 110],
  patchPower: [25, 35, 40, 55, 70, 95],
  patchRate: [25, 35, 40, 55, 70, 95, 120, 155],
  patchRange: [20, 25, 35, 45, 55, 75],
  patchCheap: [25, 35, 40, 55, 70, 95],
};

/** Сколько очков ДНК вернуть сохранению версий 1–4: за каждый узел прежнего древа — цены купленных уровней, которых в новом древе нет (узла нет — все его уровни; уровней стало меньше — лишние). */
export function legacyRefund(levels: Record<string, unknown>): number {
  let refund = 0;
  for (const [id, prices] of Object.entries(LEGACY_PRICES)) {
    const n = levels[id];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
    const bought = Math.min(prices.length, Math.floor(n));
    const kept = UPGRADE_IDS.includes(id) ? Math.min(bought, maxLevel(id)) : 0;
    for (let i = kept; i < bought; i++) refund += prices[i];
  }
  return refund;
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

const KEY = 'pvb.meta';

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
  const r = raw as { v?: unknown; dna?: unknown; levels?: unknown; progress?: unknown; seen?: unknown; attempts?: unknown; log?: unknown; bought?: unknown; bossWins?: unknown; flawless?: unknown };
  if (typeof r.dna === 'number' && Number.isFinite(r.dna) && r.dna > 0) out.dna = Math.floor(r.dna);
  // Сохранение до переработки (версии 1–4): узлы прежнего древа сверх нового возвращаются очками ДНК
  const legacy = typeof r.v !== 'number' || r.v < 5;
  if (legacy && typeof r.levels === 'object' && r.levels !== null) out.dna += legacyRefund(r.levels as Record<string, unknown>);
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
  try {
    const text = window.localStorage.getItem(KEY);
    if (!text) return emptyMeta();
    const raw: unknown = JSON.parse(text);
    const meta = sanitizeMeta(raw);
    // Сохранение прежней версии переписывается сразу: иначе возврат очков за прежнее древо начислялся бы при каждом запуске
    if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== meta.v) saveMeta(meta);
    return meta;
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
