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
 *
 * Вкладка в фоне дольше `STALE_MS` (строка 7 docs/stage-9-decisions-2026-11-22.md, вариант А; решение владельца 23 ноября 2026, сообщение 1, п. 6): другая вкладка при запуске
 * засчитывает её запись и оставляет отметку `pvb.unf5.<id>.settled` — номер попытки, сколько очков ДНК начислено, строка итога в журнале. Вернувшаяся вкладка читает отметку
 * (раз в `ALIVE_EVERY_MS` и в конце попытки) и стирает её. Правило конца такой попытки: очков ДНК за попытку в сумме — столько же, сколько без прерывания (начисляется итог попытки
 * как обычно минус уже начисленное; мини-боссы и «без потерь», которые засчитанная часть не дала, — в конце, если заработаны), счётчик попыток второй раз не растёт, строка
 * «не завершена» в журнале заменяется итоговой (с тем же номером попытки и очками ДНК за всю попытку). Звёзды — как обычно. Пока попытка идёт дальше, запись вкладки несёт засчитанную
 * часть: закроют снова — следующий запуск начислит только разницу и заменит строку, попытку не прибавит. Отметку, которую никто не забрал (вкладку закрыли), стирает запуск через `SETTLED_KEEP_MS`.
 */
import { CONFIG } from './config';
import { QA_MODE } from './debug';
import { attemptLine, type AttemptRecord } from './attempt';
import { attemptNumber, awardDna, boughtSinceLast, finishAttempt, isLevelBeaten, recordResult, replaceAttempt } from './meta';

/** Начало ключей записей в хранилище. */
export const UNFINISHED_PREFIX = 'pvb.unf5.';
/** Как часто идущая партия отмечает, что жива, мс. */
const ALIVE_EVERY_MS = 5000;
/** Запись старше этого (мс) — партия закрыта: её засчитывает следующий запуск. С запасом на вкладку в фоне (браузер будит её таймеры до раза в минуту). */
export const STALE_MS = 120000;
/** Конец ключа отметки «попытку этой вкладки засчитала другая». */
const SETTLED_SUFFIX = '.settled';
/** Сколько хранится отметка, которую не забрала вкладка (её закрыли), мс: 7 суток. */
const SETTLED_KEEP_MS = 7 * 24 * 3600 * 1000;

/** Ведётся ли запись: в игре — всегда; в режиме проверки — только с `&unfinished`. */
export const UNFINISHED_ON: boolean = !QA_MODE || new URLSearchParams(window.location.search).has('unfinished');

/** Уже засчитанная часть попытки: номер попытки, сколько очков ДНК за неё начислено, её строка итога в журнале, сколько волн засчитано. */
export interface SettledPart {
  attempt: number;
  dna: number;
  line: string;
  waves: number;
}

/** Запись прерванной попытки: уровень, пройдено волн, когда партия последний раз отметилась живой, строка итога без очков ДНК (их считает тот, кто засчитывает), засчитанная часть (если была). */
export interface UnfinishedRecord {
  v: 1;
  level: number;
  waves: number;
  alive: number;
  line: Omit<AttemptRecord, 'dna' | 'attempt' | 'bought'>;
  settled?: SettledPart;
}

/** Id записи этой вкладки для идущей попытки (null — попытки нет или она закончилась). */
let ownId: string | null = null;
let lastAlive = 0;
/** Часть идущей попытки этой вкладки, которую засчитала другая вкладка (null — не засчитывали). */
let settled: SettledPart | null = null;

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
    const part = settledPart(r.settled);
    return { v: 1, level, waves, alive: Number(r.alive) || 0, line: r.line, ...(part ? { settled: part } : {}) };
  } catch {
    return null;
  }
}

/** Проверка засчитанной части (из записи или отметки); null — нет или испорчена. */
function settledPart(x: unknown): SettledPart | null {
  if (typeof x !== 'object' || x === null) return null;
  const p = x as Partial<SettledPart>;
  const attempt = Number(p.attempt);
  const dna = Number(p.dna);
  const waves = Number(p.waves);
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(dna) || dna < 0 || !Number.isInteger(waves) || waves < 0 || typeof p.line !== 'string') return null;
  return { attempt, dna, line: p.line, waves };
}

/** Отметка «засчитано» для попытки этой вкладки: забрать (запомнить засчитанную часть) и стереть. */
function takeMark(): void {
  if (!ownId) return;
  const key = UNFINISHED_PREFIX + ownId + SETTLED_SUFFIX;
  try {
    const text = store()?.getItem(key);
    if (!text) return;
    const part = settledPart(JSON.parse(text));
    if (part) settled = part;
  } catch {
    /* испорченная отметка — стирается */
  }
  remove(key);
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
  forget();
  ownId = UNFINISHED_ON ? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` : null;
  lastAlive = 0;
}

/** Стереть запись и отметку попытки этой вкладки. */
function forget(): void {
  if (ownId) {
    remove(UNFINISHED_PREFIX + ownId);
    remove(UNFINISHED_PREFIX + ownId + SETTLED_SUFFIX);
  }
  settled = null;
}

/** Граница волны: пройдено `waves` волн — запись «не завершена, пройдено N» (перезаписывается). */
export function writeUnfinished(level: number, waves: number, line: UnfinishedRecord['line']): void {
  if (!ownId || waves < 1) return;
  takeMark();
  const record: UnfinishedRecord = { v: 1, level, waves, alive: Date.now(), line, ...(settled ? { settled } : {}) };
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
  takeMark(); // вкладка вернулась из фона, а её попытку уже засчитали: запись стёрта, отметка — здесь
  const key = UNFINISHED_PREFIX + ownId;
  const record = read(key);
  if (!record) return;
  try {
    store()?.setItem(key, JSON.stringify({ ...record, alive: Date.now(), ...(settled ? { settled } : {}) }));
  } catch {
    /* см. выше */
  }
}

/** Перед концом попытки (победа, поражение, «В меню»): засчитанная другой вкладкой часть этой попытки или null. Вызывать до `endUnfinished`. */
export function takeSettled(): SettledPart | null {
  takeMark();
  return settled;
}

/** Попытка закончилась победой, поражением или выходом «В меню»: запись и отметка вкладки стираются. */
export function endUnfinished(): void {
  forget();
  ownId = null;
}

/** Запись идущей попытки этой вкладки (для проверок): пройдено волн и уровень в записи (0 — записи нет), сколько волн засчитала другая вкладка; null — ни записи, ни засчитанной части. */
export function unfinishedInfo(): { waves: number; level: number; settled: number } | null {
  if (!ownId) return null;
  const r = read(UNFINISHED_PREFIX + ownId);
  if (!r && !settled) return null;
  return { waves: r?.waves ?? 0, level: r?.level ?? 0, settled: settled?.waves ?? 0 };
}

/**
 * При запуске: каждая запись закрытой партии (отметка старше `STALE_MS`) засчитывается как попытка — очки ДНК за пройденные волны (как «В меню»: без мини-боссов и «без потерь»),
 * лучшая волна, счётчик попыток +1, строка итога «не завершена, пройдено N/50» в журнал меню — и стирается; вкладке записи остаётся отметка «засчитано» (вдруг она не закрыта, а в фоне).
 * Запись с засчитанной частью (вкладка вернулась и снова закрылась): только разница очков ДНК, строка заменяется, попытка не прибавляется. Возвращает, сколько записей засчитано.
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
  // отметки «засчитано»: не записи; не забранную за `SETTLED_KEEP_MS` (вкладку закрыли) — стереть
  for (const key of keys.filter((k) => k.endsWith(SETTLED_SUFFIX))) {
    let at = 0;
    try {
      at = Number((JSON.parse(s.getItem(key) ?? 'null') as { at?: number } | null)?.at) || 0;
    } catch {
      /* испорченная — стирается */
    }
    if (now - at >= SETTLED_KEEP_MS || at > now) remove(key);
  }
  const records = keys
    .filter((key) => !key.endsWith(SETTLED_SUFFIX))
    .map((key) => ({ key, r: read(key) }))
    .filter(({ key, r }) => {
      if (!r) {
        remove(key); // испорченная запись
        return false;
      }
      return now - r.alive >= STALE_MS || r.alive > now; // отметка из будущего — часы перевели: тоже засчитывается
    }) as { key: string; r: UnfinishedRecord }[];
  records.sort((a, b) => a.r.alive - b.r.alive);
  let count = 0;
  for (const { key, r } of records) {
    remove(key); // сначала стираем: две вкладки, открытые разом, не засчитают одну запись дважды (вторая её уже не найдёт)
    if (r.waves < 1) continue;
    const prev = r.settled ?? null; // часть этой попытки уже засчитана раньше
    const paid = prev?.dna ?? 0;
    const gained = awardDna({ level: r.level, waves: r.waves, won: false, replay: isLevelBeaten(r.level), coinsLeft: 0, bossBits: 0, flawless: false, hasBoss: false }, paid);
    recordResult(r.level, r.waves, 0);
    const attempt = prev?.attempt ?? attemptNumber(r.level);
    const dna = paid + gained;
    let line: string;
    try {
      line = attemptLine({ ...(r.line as AttemptRecord), level: r.level, unfinished: true, attempt, dna, bought: boughtSinceLast() });
    } catch {
      line = attemptLine({ level: r.level, attempt, won: false, unfinished: true, wave: r.waves, waveTotal: r.waves, stars: 0, livesLeft: 0, livesMax: 0, speedSec: {}, elapsedSec: 0, towers: [], merges: 0, mutations: 0, builds: 0, sells: 0, coinsAtWave: [], dna, entry: [], bought: [] });
    }
    if (prev) replaceAttempt(prev.line, line);
    else finishAttempt(r.level, line);
    // отметка для вкладки записи: вернётся из фона — узнает, что попытка засчитана
    try {
      s.setItem(key + SETTLED_SUFFIX, JSON.stringify({ attempt, dna, line, waves: r.waves, at: now }));
    } catch {
      /* хранилище полно: вернувшаяся вкладка засчитает попытку ещё раз (как до исправления) */
    }
    count++;
  }
  return count;
}
