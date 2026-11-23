/**
 * Прерванная попытка (этап 9, раздел 2.2 плана docs/stage-9-plan-2026-10-23.md; решение владельца 23 октября 2026, сообщение 3, п. 5.2).
 *
 * На границе каждой волны партия записывает в хранилище браузера «попытка не завершена, пройдено N волн» (не по `game_api_pause`: пауза бывает при рекламе и смене вкладки).
 * Если игру закрыли посреди попытки, при следующем запуске запись засчитывается как попытка с очками ДНК за N волн — как «В меню» с паузы (решение 20 октября 2026,
 * сообщение 2, п. 3): мини-боссы и «без потерь» при прерывании не засчитываются, звёзд нет. Запись стирается, когда попытка закончилась победой, поражением или выходом «В меню»,
 * и когда в этой вкладке начинается новая попытка («Заново» с паузы попыткой не считается — как и раньше).
 *
 * У каждой вкладки своя запись (ключ `pvb.unf5.<id>`): идущая партия раз в `ALIVE_EVERY_MS` отмечает, что жива, и запись живой партии другая вкладка не засчитывает,
 * пока отметка не старше `STALE_MS`. Сохранение боя (башни, монеты, жизни) — не сейчас: вместе с чекпоинтами (раздел 2.2 плана).
 * В режиме проверки запись ведётся только с `&unfinished` (иначе закрытые посреди партии страницы бота и проверок меняли бы счёт ДНК и попыток следующих страниц).
 */
import { CONFIG } from './config';
import { QA_MODE } from './debug';
import { attemptLine, type AttemptRecord } from './attempt';
import { attemptNumber, awardDna, boughtSinceLast, finishAttempt, isLevelBeaten, recordResult } from './meta';

/** Начало ключей записей в хранилище. */
export const UNFINISHED_PREFIX = 'pvb.unf5.';
/** Как часто идущая партия отмечает, что жива, мс. */
const ALIVE_EVERY_MS = 5000;
/** Запись старше этого (мс) — партия закрыта: её засчитывает следующий запуск. С запасом на вкладку в фоне (браузер будит её таймеры до раза в минуту). */
export const STALE_MS = 120000;

/** Ведётся ли запись: в игре — всегда; в режиме проверки — только с `&unfinished`. */
export const UNFINISHED_ON: boolean = !QA_MODE || new URLSearchParams(window.location.search).has('unfinished');

/** Запись прерванной попытки: уровень, пройдено волн, когда партия последний раз отметилась живой, и строка итога без очков ДНК (их считает тот, кто засчитывает). */
export interface UnfinishedRecord {
  v: 1;
  level: number;
  waves: number;
  alive: number;
  line: Omit<AttemptRecord, 'dna' | 'attempt' | 'bought'>;
}

/** Id записи этой вкладки для идущей попытки (null — попытки нет или она закончилась). */
let ownId: string | null = null;
let lastAlive = 0;

const store = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function read(key: string): UnfinishedRecord | null {
  try {
    const text = store()?.getItem(key);
    if (!text) return null;
    const r = JSON.parse(text) as Partial<UnfinishedRecord>;
    const level = Number(r.level);
    const waves = Number(r.waves);
    if (!Number.isInteger(level) || level < 1 || level > CONFIG.levels.count) return null;
    if (!Number.isInteger(waves) || waves < 0 || waves > 1000) return null;
    if (typeof r.line !== 'object' || r.line === null) return null;
    return { v: 1, level, waves, alive: Number(r.alive) || 0, line: r.line };
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* хранилище недоступно: записи и не было */
  }
}

/** Новая попытка в этой вкладке: прежняя запись вкладки стирается (её попытка закончилась без записи — «Заново» с паузы). */
export function beginUnfinished(): void {
  if (ownId) remove(UNFINISHED_PREFIX + ownId);
  ownId = UNFINISHED_ON ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` : null;
  lastAlive = 0;
}

/** Граница волны: пройдено `waves` волн — запись «не завершена, пройдено N» (перезаписывается). */
export function writeUnfinished(level: number, waves: number, line: UnfinishedRecord['line']): void {
  if (!ownId || waves < 1) return;
  const record: UnfinishedRecord = { v: 1, level, waves, alive: Date.now(), line };
  try {
    store()?.setItem(UNFINISHED_PREFIX + ownId, JSON.stringify(record));
    lastAlive = performance.now();
  } catch {
    /* хранилище недоступно или полно: прерванная попытка не засчитается */
  }
}

/** Партия идёт (вызов каждый кадр): раз в `ALIVE_EVERY_MS` отметка «жива» в записи вкладки. */
export function keepUnfinishedAlive(): void {
  if (!ownId || performance.now() - lastAlive < ALIVE_EVERY_MS) return;
  lastAlive = performance.now();
  const key = UNFINISHED_PREFIX + ownId;
  const record = read(key);
  if (!record) return;
  try {
    store()?.setItem(key, JSON.stringify({ ...record, alive: Date.now() }));
  } catch {
    /* см. выше */
  }
}

/** Попытка закончилась победой, поражением или выходом «В меню»: запись вкладки стирается. */
export function endUnfinished(): void {
  if (ownId) remove(UNFINISHED_PREFIX + ownId);
  ownId = null;
}

/** Есть ли запись у идущей попытки этой вкладки (для проверок). */
export function unfinishedInfo(): { waves: number; level: number } | null {
  if (!ownId) return null;
  const r = read(UNFINISHED_PREFIX + ownId);
  return r ? { waves: r.waves, level: r.level } : null;
}

/**
 * При запуске: каждая запись закрытой партии (отметка старше `STALE_MS`) засчитывается как попытка — очки ДНК за пройденные волны (как «В меню»: без мини-боссов и «без потерь»),
 * лучшая волна, счётчик попыток +1, строка итога «не завершена, пройдено N/50» в журнал меню — и стирается. Возвращает, сколько попыток засчитано.
 */
export function settleUnfinished(): number {
  if (!UNFINISHED_ON) return 0;
  const s = store();
  if (!s) return 0;
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(UNFINISHED_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }
  const now = Date.now();
  const records = keys
    .map((key) => ({ key, r: read(key) }))
    .filter(({ key, r }) => {
      if (!r) {
        remove(key); // испорченная запись
        return false;
      }
      return now - r.alive >= STALE_MS || r.alive > now; // отметка из будущего — часы перевели: тоже засчитывается
    }) as { key: string; r: UnfinishedRecord }[];
  records.sort((a, b) => a.r.alive - b.r.alive);
  let settled = 0;
  for (const { key, r } of records) {
    remove(key); // сначала стираем: две вкладки, открытые разом, не засчитают одну запись дважды (вторая её уже не найдёт)
    if (r.waves < 1) continue;
    const gained = awardDna({ level: r.level, waves: r.waves, won: false, replay: isLevelBeaten(r.level), coinsLeft: 0, bossBits: 0, flawless: false, hasBoss: false });
    recordResult(r.level, r.waves, 0);
    let line: string;
    try {
      line = attemptLine({ ...(r.line as AttemptRecord), level: r.level, unfinished: true, attempt: attemptNumber(r.level), dna: gained, bought: boughtSinceLast() });
    } catch {
      line = attemptLine({ level: r.level, attempt: attemptNumber(r.level), won: false, unfinished: true, wave: r.waves, waveTotal: r.waves, stars: 0, livesLeft: 0, livesMax: 0, speedSec: {}, elapsedSec: 0, towers: [], merges: 0, mutations: 0, builds: 0, sells: 0, coinsAtWave: [], dna: gained, entry: [], bought: [] });
    }
    finishAttempt(r.level, line);
    settled++;
  }
  return settled;
}
