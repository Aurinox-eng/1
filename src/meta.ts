/**
 * Очки ДНК и улучшения вне партии: текущее состояние, начисление, покупка и бонусы для партии (проект — docs/upgrades.md).
 *
 * Состояние читается из сохранения при загрузке страницы; каждое изменение (покупка, начисление, попытка, звёзды, плашки) сначала перечитывает последнее сохранённое состояние,
 * применяется к нему и записывается обратно, а запись из другой вкладки (событие `storage`) сразу обновляет снимок: устаревшая вкладка не стирает чужой прогресс
 * (решение владельца 20 октября 2026, сообщение 2, п. 1.4; сборки main и …/1/work/ делят ключ `pvb.meta5`).
 * В режиме проверки (`?qa&meta=lives:1,coins:2,damage:3,reward:0,dna:50`) начальное состояние берётся из адреса, а в сохранение ничего не пишется;
 * `?qa&stars=3,2,0` задаёт звёзды уровней 1, 2, 3… (остальные — 0), в сохранение тоже ничего не пишется.
 * Прогресс по уровням (звёзды, лучшая волна, показанные плашки) — этап 5, docs/stage-5-plan.md.
 */
import { CONFIG, type UpgradeBranch, type UpgradeEffect } from './config';
import { QA_MODE, READY_OVERRIDE } from './debug';
import { emptyMeta, loadMeta, MAX_LOG, MAX_LOG_LEN, maxLevel, META_KEY, nodesOfLevels, saveMeta, tryLoadMeta, UPGRADE_IDS, type MetaSave, type UpgradeId } from './save';
import { CORE, NET, nodeKey } from './treeNet';
import { setLevelReachedCheck, setTowerOwnedCheck } from './progress';

function readOverride(): MetaSave | null {
  if (!QA_MODE) return null;
  const raw = new URLSearchParams(window.location.search).get('meta');
  if (raw === null) return null;
  const out = emptyMeta();
  for (const item of raw.split(',')) {
    const [key, valueText] = item.split(':');
    const value = Number(valueText);
    if (!Number.isFinite(value) || value < 0) continue;
    if (key === 'dna') out.dna = Math.floor(value);
    else if (UPGRADE_IDS.includes(key)) out.levels[key] = Math.min(maxLevel(key), Math.floor(value));
    else console.warn(`meta: не понял «${item}» — пропускаю`);
  }
  out.nodes = nodesOfLevels(out.levels);
  return out;
}

function readStarsOverride(): number[] | null {
  if (!QA_MODE) return null;
  const raw = new URLSearchParams(window.location.search).get('stars');
  if (raw === null) return null;
  return raw.split(',').map((x) => Math.max(0, Math.min(3, Math.floor(Number(x)) || 0)));
}

/** `?qa&best=30,19` — лучшие волны (число пройденных волн) уровней 1, 2, …; остальные — 0. */
function readBestOverride(): number[] | null {
  if (!QA_MODE) return null;
  const raw = new URLSearchParams(window.location.search).get('best');
  if (raw === null) return null;
  return raw.split(',').map((x) => Math.max(0, Math.min(1000, Math.floor(Number(x)) || 0)));
}

const override = readOverride();
const starsOverride = readStarsOverride();
const bestOverride = readBestOverride();
let state: MetaSave = override ?? loadMeta();
if (starsOverride) starsOverride.forEach((n, i) => { if (i < state.progress.stars.length) state.progress.stars[i] = n; });
if (bestOverride) bestOverride.forEach((n, i) => { if (i < state.progress.best.length) state.progress.best[i] = n; });
/** С подменой из адреса (`&meta=`, `&stars=`, `&best=`) в сохранение ничего не пишется. */
const noPersist = override !== null || starsOverride !== null || bestOverride !== null;

/** Хранилище принимает записи: после неудачной записи память страницы новее хранилища, и перечитывать его нельзя (стёрлись бы свои изменения). */
let storageOk = true;

function persist(): void {
  if (!noPersist) storageOk = saveMeta(state);
}

/** Перечитывает последнее сохранённое состояние (его могла записать другая вкладка) — перед каждым изменением; с подменой из адреса и без хранилища снимок живёт только в памяти. */
function refresh(): void {
  if (noPersist || !storageOk) return;
  const fresh = tryLoadMeta();
  if (fresh) state = fresh;
}

/** Другая вкладка записала сохранение: снимок этой вкладки обновляется сразу (экран «Улучшения», счёт ДНК в меню). */
if (!noPersist) {
  window.addEventListener('storage', (event) => {
    if (event.key === META_KEY || event.key === null) refresh();
  });
}

/** Сбрасывает весь прогресс вне партии (очки ДНК, улучшения, уровни и звёзды, показанные подсказки) и записывает пустое сохранение; звук, скорость и язык хранятся отдельно и не затрагиваются. */
export function resetProgress(): void {
  state = emptyMeta();
  seenHere.clear();
  persist();
}

export function metaDna(): number {
  return state.dna;
}

/** Есть ли что сбрасывать: очки ДНК, купленные узлы или звёзды (от этого зависит, показывается ли в меню «Сбросить прогресс»). */
export function hasProgress(): boolean {
  return state.dna > 0 || Object.values(state.levels).some((n) => n > 0) || state.progress.stars.some((n) => n > 0);
}

export function metaLevel(id: UpgradeId): number {
  return state.levels[id];
}

export function metaLevels(): Record<UpgradeId, number> {
  return { ...state.levels };
}

// ---------------------------------------------------------------- сеть древа: кольца, соседство, покупка, сброс (`src/treeNet.ts`, `meta.network`)

/** Только режим проверки: `?qa&rings=N` — открыты кольца 1…N, независимо от побед. */
const RINGS_OVERRIDE: number | null = (() => {
  if (!QA_MODE) return null;
  const raw = new URLSearchParams(window.location.search).get('rings');
  const n = raw === null ? NaN : Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
})();

/** Открыто ли кольцо k: 1 — сразу, остальные — победой на уровне `ringOpenAfter[k − 1]`; 0 — узлы башен (вне колец). */
export function isRingOpen(ring: number): boolean {
  if (ring <= 0) return true;
  if (RINGS_OVERRIDE !== null) return ring <= RINGS_OVERRIDE;
  const after = CONFIG.meta.network.ringOpenAfter[ring - 1];
  if (after === undefined) return false;
  return after <= 0 || isLevelBeaten(after);
}

/** Куплен ли узел сети (`id#L`); ядро — всегда. */
export function nodeBought(key: string): boolean {
  if (key === CORE) return true;
  return state.nodes.includes(key);
}

/** Можно ли взять узел по сети (очки не учитываются): не куплен, кольцо открыто, сосед купленного (или ядра). */
export function nodeAvailable(key: string): boolean {
  const node = NET.nodes.get(key);
  if (!node || nodeBought(key) || !isRingOpen(node.ring)) return false;
  for (const q of NET.adj.get(key) ?? []) if (nodeBought(q)) return true;
  return false;
}

/** Узел улучшения, который купит `buyUpgrade`: наименьший не купленный уровень, который можно взять по сети; null — такого нет. */
export function nextNodeOf(id: UpgradeId): string | null {
  for (let L = 1; L <= maxLevel(id); L++) {
    const key = nodeKey(id, L);
    if (nodeAvailable(key)) return key;
  }
  return null;
}

/** Цена следующей покупки улучшения: узел, который можно взять, иначе наименьший не купленный уровень; null — куплены все уровни. */
export function nextPrice(id: UpgradeId): number | null {
  const key = nextNodeOf(id) ?? firstUnbought(id);
  return key ? NET.nodes.get(key)!.price : null;
}

function firstUnbought(id: UpgradeId): string | null {
  for (let L = 1; L <= maxLevel(id); L++) if (!nodeBought(nodeKey(id, L))) return nodeKey(id, L);
  return null;
}

/** Условие открытия узла дерева: родитель и нужный уровень (null — узел открыт с начала); для подписи карточки. */
export function requirementOf(id: UpgradeId): { id: UpgradeId; level: number } | null {
  const req = CONFIG.meta.upgrades[id].requires;
  return req ? { id: req[0], level: req[1] } : null;
}

/** Подведён ли путь по сети к следующему не купленному уровню (кольцо не учитывается). */
export function requirementMet(id: UpgradeId): boolean {
  const key = firstUnbought(id);
  if (!key) return true;
  for (let L = 1; L <= maxLevel(id); L++) {
    const k = nodeKey(id, L);
    if (nodeBought(k)) continue;
    for (const q of NET.adj.get(k) ?? []) if (nodeBought(q)) return true;
  }
  return false;
}

/** Узел доступен для покупки по сети (ветка открыта, есть уровень, который можно взять: кольцо открыто, сосед купленного); купленный до наибольшего уровня — открыт; очки не учитываются. */
export function isNodeOpen(id: UpgradeId): boolean {
  return isBranchOpen(CONFIG.meta.upgrades[id].branch) && (firstUnbought(id) === null || nextNodeOf(id) !== null);
}

export function canBuy(id: UpgradeId): boolean {
  const key = nextNodeOf(id);
  return key !== null && isBranchOpen(CONFIG.meta.upgrades[id].branch) && state.dna >= NET.nodes.get(key)!.price;
}

/** Покупает узел сети; false — нельзя взять по сети или не хватает очков. */
export function buyNode(key: string): boolean {
  refresh();
  const node = NET.nodes.get(key);
  if (!node || !nodeAvailable(key) || !isBranchOpen(CONFIG.meta.upgrades[node.upgrade].branch) || state.dna < node.price) return false;
  const id = node.upgrade;
  state = { ...state, dna: state.dna - node.price, levels: { ...state.levels, [id]: state.levels[id] + 1 }, nodes: [...state.nodes, key], bought: [...state.bought, id] };
  persist();
  return true;
}

/** Покупает следующий уровень улучшения (узел `nextNodeOf`); false, если взять нечего, узел закрыт или не хватает очков. */
export function buyUpgrade(id: UpgradeId): boolean {
  const key = nextNodeOf(id);
  return key !== null && buyNode(key);
}

/** Сколько ДНК вернёт сброс сети: цены купленных малых и ключевых узлов (узлы башен не возвращаются). */
export function networkRefund(): number {
  return state.nodes.reduce((sum, key) => {
    const node = NET.nodes.get(key);
    return sum + (node && node.ring > 0 ? node.price : 0);
  }, 0);
}

/** Сброс сети между попытками (решение владельца 26 октября 2026, сообщение 3, п. 4.2: бесплатный): все малые и ключевые узлы возвращают ДНК, узлы башен остаются. */
export function resetNetwork(): number {
  refresh();
  const refund = networkRefund();
  if (refund <= 0) return 0;
  const keep = state.nodes.filter((key) => (NET.nodes.get(key)?.ring ?? 1) === 0);
  const levels = { ...state.levels };
  for (const id of UPGRADE_IDS) if (CONFIG.meta.upgrades[id].branch !== 'towers') levels[id] = 0;
  state = { ...state, dna: state.dna + refund, levels, nodes: keep };
  persist();
  return refund;
}

/** Id узла башни в древе: `tower` + id башни с заглавной буквы (`fizz` → `towerFizz`); у Таблетки узла нет. */
export const towerNodeId = (tower: string): UpgradeId => `tower${tower.charAt(0).toUpperCase()}${tower.slice(1)}`;

/** Куплен ли узел башни (Таблетка открыта с начала). */
export function towerOwned(tower: string): boolean {
  return tower === 'pill' || (state.levels[towerNodeId(tower)] ?? 0) > 0;
}

setTowerOwnedCheck(towerOwned);

/** Куплены ли умение «Лихорадка», «Автостарт волны» и ключевой узел ветки башни. */
export const feverOwned = (): boolean => (state.levels.fever ?? 0) > 0;
export const autoWaveOwned = (): boolean => (state.levels.autoWave ?? 0) > 0;
export const keyOwned = (tower: string): boolean => (state.levels[`${tower}Key`] ?? 0) > 0;

/** Крупные узлы (башни, умения, ключевые узлы ветвей): до ближайшего из них экран конца уровня пишет «не хватает N ДНК». */
const BIG_EFFECTS: ReadonlySet<UpgradeEffect> = new Set(['tower', 'fever', 'key']);

/** Ближайший по цене крупный узел, который можно купить по древу (родитель куплен), и сколько очков до него не хватает; null — все куплены или очков уже хватает. */
export function nextBigNode(): { id: UpgradeId; need: number } | null {
  let best: { id: UpgradeId; price: number } | null = null;
  for (const id of UPGRADE_IDS) {
    const spec = CONFIG.meta.upgrades[id];
    if (!BIG_EFFECTS.has(spec.effect) || state.levels[id] > 0 || !isNodeOpen(id)) continue;
    const price = spec.prices[0];
    if (!best || price < best.price) best = { id, price };
  }
  if (!best || best.price <= state.dna) return null;
  return { id: best.id, need: best.price - state.dna };
}

/** Номер текущей попытки на уровне (1 — первая): сыгранные попытки + 1. */
export function attemptNumber(level: number): number {
  return (state.attempts[level - 1] ?? 0) + 1;
}

/** Улучшения, купленные после конца прошлой попытки: id → сколько уровней (в порядке первой покупки). */
export function boughtSinceLast(): [UpgradeId, number][] {
  const out = new Map<UpgradeId, number>();
  for (const id of state.bought) out.set(id, (out.get(id) ?? 0) + 1);
  return [...out];
}

/** Конец попытки: счётчик попыток уровня +1, строка итога — в журнал (последние MAX_LOG), список покупок с прошлой попытки очищается. */
export function finishAttempt(level: number, line: string): void {
  refresh();
  const attempts = [...state.attempts];
  attempts[level - 1] = (attempts[level - 1] ?? 0) + 1;
  // строка длиннее предела при чтении отбросилась бы целиком — обрезается при записи (находка аудита MASTER-0068)
  state = { ...state, attempts, log: [...state.log, line.slice(0, MAX_LOG_LEN)].slice(-MAX_LOG), bought: [] };
  persist();
}

/** Строки итога последних попыток (старые первыми). */
export function attemptLog(): string[] {
  return [...state.log];
}

/** Итог партии для подсчёта очков ДНК. */
export interface DnaInput {
  level: number;
  /** Сколько волн пройдено (при проигрыше — без текущей; при победе — все). */
  waves: number;
  won: boolean;
  /** Уровень уже пройден до этой партии (`isLevelBeaten`, проверять до `recordResult`). */
  replay: boolean;
  /** Монет в конце партии. */
  coinsLeft: number;
  /** Каких боссов уровня игрок победил в этой партии: биты 0–3 — мини-боссы 10, 20, 30, 40-й волн, бит 4 — босс. */
  bossBits: number;
  /** Победа без потери жизней. */
  flawless: boolean;
  /** Есть ли на уровне босс (тогда добавку за победу заменяет `bossFirst`). */
  hasBoss: boolean;
}

/** Из чего складываются очки ДНК партии (звёзды считаются отдельно: `recordResult`); floor — доплата до нижней границы `meta.dna.floor`. */
export interface DnaParts {
  waves: number;
  win: number;
  coins: number;
  bosses: number;
  flawless: number;
  floor: number;
}

/** Очки за k пройденных волн уровня (без повтора): (waveBase · k + waveStep · k · (k + 1) / 2) × множитель уровня, округление один раз. */
export function dnaForWaves(level: number, waves: number): number {
  const { waveBase, waveStep, levelMul } = CONFIG.meta.dna;
  const k = Math.max(0, Math.floor(waves));
  const mul = levelMul[Math.min(levelMul.length, Math.max(1, level)) - 1] ?? 1;
  return Math.round((waveBase * k + (waveStep * k * (k + 1)) / 2) * mul);
}

/** Какие из боссов `bits` побеждены впервые (ещё не записаны в сохранении уровня). */
function freshBossBits(level: number, bits: number): number {
  return bits & ~(state.bossWins[level - 1] ?? 0);
}

/**
 * Очки ДНК партии по частям (документ дизайна docs/redesign-2026-10-19.md, раздел 6): за волны; добавка за первую победу на уровне без босса; перевод остатка монет (только при победе);
 * за первые победы над мини-боссами и боссом; «без потерь» (первая такая победа на уровне, +25 % очков за волны); доплата до нижней границы. Повтор пройденного уровня: за волны и монеты — replayFactor.
 */
export function dnaParts(input: DnaInput): DnaParts {
  const { winBonus, replayFactor, coinsPerPoint, coinsCapShare, miniBossFirst, bossFirst, flawlessShare, floor } = CONFIG.meta.dna;
  const full = dnaForWaves(input.level, input.waves);
  const coinsRaw = input.won && coinsPerPoint > 0 ? Math.min(Math.floor(Math.max(0, input.coinsLeft) / coinsPerPoint), Math.floor(full * coinsCapShare)) : 0;
  const fresh = freshBossBits(input.level, input.bossBits);
  let bosses = 0;
  for (let bit = 0; bit < 4; bit++) if (fresh & (1 << bit)) bosses += miniBossFirst;
  if (fresh & (1 << 4)) bosses += bossFirst;
  const flawless = input.won && input.flawless && !(state.flawless[input.level - 1] > 0) ? Math.round(full * flawlessShare) : 0;
  const waves = input.replay ? Math.floor(full * replayFactor) : full;
  const coins = input.replay ? Math.floor(coinsRaw * replayFactor) : coinsRaw;
  const win = input.won && !input.replay && !input.hasBoss ? winBonus : 0;
  const sum = waves + win + coins + bosses + flawless;
  return { waves, win, coins, bosses, flawless, floor: Math.max(0, floor - sum) };
}

/** Сколько очков ДНК даёт партия (сумма `dnaParts`). */
export function dnaForGame(input: DnaInput): number {
  const p = dnaParts(input);
  return p.waves + p.win + p.coins + p.bosses + p.flawless + p.floor;
}

/** Начисляет очки ДНК за партию на счёт, записывает первые победы над боссами и «без потерь»; возвращает, сколько начислено. */
export function awardDna(input: DnaInput): number {
  refresh();
  const parts = dnaParts(input);
  const gained = parts.waves + parts.win + parts.coins + parts.bosses + parts.flawless + parts.floor;
  const i = input.level - 1;
  const bossWins = [...state.bossWins];
  const flawless = [...state.flawless];
  if (i >= 0 && i < bossWins.length) {
    bossWins[i] |= input.bossBits;
    if (parts.flawless > 0) flawless[i] = 1;
  }
  state = { ...state, dna: state.dna + gained, bossWins, flawless };
  persist();
  return gained;
}

// ---------------------------------------------------------------- прогресс по уровням

/** Звёзды уровня (0–3; 0 — не пройден). */
export function levelStars(level: number): number {
  return state.progress.stars[level - 1] ?? 0;
}

/** Лучшая достигнутая на уровне волна (0 — уровень не играли). */
export function levelBest(level: number): number {
  return state.progress.best[level - 1] ?? 0;
}

/** Пройден ли уровень: есть хотя бы одна звезда (победа). */
export function isLevelBeaten(level: number): boolean {
  return levelStars(level) >= 1;
}

/** Готов ли уровень к игре: уровни за пределами `levels.ready` закрыты строкой «Скоро» (решение владельца 23 октября 2026), пока не переработаны; в режиме проверки — по `&ready=N` (без него готовы все). */
export function isLevelReady(level: number): boolean {
  return level <= (READY_OVERRIDE ?? CONFIG.levels.ready);
}

/** Открыт ли уровень: готов к игре, и (первый — всегда, остальные — когда предыдущий пройден, хотя бы одна звезда). */
export function isLevelOpen(level: number): boolean {
  // номер — целое от 1 до числа уровней (находка аудита MASTER-0066)
  if (!Number.isInteger(level) || level < 1 || level > CONFIG.levels.count) return false;
  return isLevelReady(level) && (level <= 1 || levelStars(level - 1) >= 1);
}

setLevelReachedCheck(isLevelOpen);

/** Сколько звёзд даёт победа при потере `lost` жизней (`CONFIG.levels.stars`). */
export function starsForLoss(lost: number): number {
  const { maxLostFor3, maxLostFor2 } = CONFIG.levels.stars;
  const eps = 1e-9;
  if (lost <= maxLostFor3 + eps) return 3;
  if (lost <= maxLostFor2 + eps) return 2;
  return 1;
}

export interface ResultRecord {
  /** Сколько звёзд уровня теперь (не меньше прежних). */
  stars: number;
  /** Сколько звёзд получено впервые в этой партии. */
  newStars: number;
  /** Очков ДНК за эти новые звёзды (уже начислены на счёт). */
  starDna: number;
}

/** Записывает итог партии: лучшую волну и звёзды (результат только улучшается); за новые звёзды начисляет очки ДНК (`CONFIG.levels.starDna`). `stars` — 0 при проигрыше. */
export function recordResult(level: number, wavesCleared: number, stars: number): ResultRecord {
  const i = level - 1;
  if (i < 0 || i >= state.progress.stars.length) return { stars: 0, newStars: 0, starDna: 0 };
  refresh();
  const best = state.progress.best.slice();
  const starList = state.progress.stars.slice();
  best[i] = Math.max(best[i], Math.max(0, Math.floor(wavesCleared)));
  const before = starList[i];
  starList[i] = Math.max(before, Math.max(0, Math.min(3, Math.floor(stars))));
  const newStars = starList[i] - before;
  const starDna = newStars * CONFIG.levels.starDna;
  state = { ...state, dna: state.dna + starDna, progress: { stars: starList, best } };
  persist();
  return { stars: starList[i], newStars, starDna };
}

// ---------------------------------------------------------------- показанные плашки

/** Хранить показанные плашки между запусками: в игре — всегда; в режиме проверки — только с `&persistseen` (иначе сценарии с плашками зависели бы от прошлых запусков). */
const SEEN_STORED = !QA_MODE || new URLSearchParams(window.location.search).has('persistseen');

export function metaSeen(): string[] {
  return SEEN_STORED ? [...state.seen] : [];
}

/** Встреченное на этой странице (с хранилищем и без): Альманах открывает запись и в режиме проверки без `&persistseen`. */
const seenHere = new Set<string>();
/** `?qa&met=all` — Альманах: все бактерии и боссы считаются встреченными; `?qa&met=coccus,runner` — встречены названные виды (снимки и проверки записей); в сохранение ничего не пишется. */
const MET_PARAM = QA_MODE ? new URLSearchParams(window.location.search).get('met') : null;
const MET_ALL = MET_PARAM === 'all';
const MET_LIST = new Set(MET_PARAM && MET_PARAM !== 'all' ? MET_PARAM.split(',').map((kind) => `b:${kind}`) : []);

/** Встречалось ли (`b:вид` — бактерия, `boss:id` — босс): в сохранении, на этой странице или подменой `&met=`. */
export function wasMet(key: string): boolean {
  return MET_ALL || MET_LIST.has(key) || seenHere.has(key) || state.seen.includes(key);
}

export function markSeen(key: string): void {
  if (key.length > 40) return;
  seenHere.add(key);
  if (!SEEN_STORED) return;
  refresh();
  if (state.seen.includes(key) || state.seen.length >= 200) return;
  state = { ...state, seen: [...state.seen, key] };
  persist();
}

// ---------------------------------------------------------------- ветки и бонусы партии

/** Открыта ли ветка для покупок: «Организм», «Защита», узлы башен и умения — с начала; ветка башни — когда куплен узел башни (Таблетка — с начала). */
export function isBranchOpen(branch: UpgradeBranch): boolean {
  if (branch === 'body' || branch === 'defense' || branch === 'towers' || branch === 'skills') return true;
  return towerOwned(branch);
}

/** Сумма эффектов купленных улучшений вида `effect` (уровень × эффект уровня); `branch` ограничивает ветку (для башен — id башни). 0, если таких улучшений нет или не куплено. */
export function upgradeBonus(effect: UpgradeEffect, branch?: UpgradeBranch): number {
  let sum = 0;
  for (const id of UPGRADE_IDS) {
    const spec = CONFIG.meta.upgrades[id];
    if (spec.effect === effect && (branch === undefined || spec.branch === branch)) sum += (state.levels[id] ?? 0) * spec.perLevel;
  }
  return sum;
}

/** Бонусы партии от купленных улучшений. */
export const livesBonus = (): number => upgradeBonus('lives');
export const coinsBonus = (): number => upgradeBonus('coins');
export const damageMul = (): number => 1 + upgradeBonus('damage');
export const rewardMul = (): number => 1 + upgradeBonus('reward');
/** Сколько бактерий за партию, дошедших до организма, щит гасит без потери жизни. */
export const shieldCharges = (): number => Math.floor(upgradeBonus('shield'));
/** Прибавка к доле возврата при продаже башни (0,05 = +5 пунктов). */
export const refundBonus = (): number => upgradeBonus('sellRefund');
/** Монет в начале каждой волны. */
export const waveCoinsBonus = (): number => Math.floor(upgradeBonus('waveCoins'));

// ---------------------------------------------------------------- доступ для проверок (только ?qa)

type Rect = { x: number; y: number; w: number; h: number };

/** Что видно на экране «Улучшения» (дерево; для проверок): все узлы с центрами и размерами на экране игры (с учётом прокрутки), выбранный узел и его карточка, кнопка «Играть». */
export interface MetaScreenInfo {
  visible: boolean;
  balance: string;
  /** Выбранный узел (id), сдвиг сети (одно число из сдвига по x и y) и окно сети. */
  selected: string;
  scroll: number;
  view: Rect;
  /** Сеть: масштаб, выбранный узел сети (`id#L`), подписи цепочек на экране (видимые), кнопка сброса сети и сколько ДНК он вернёт. */
  zoom?: number;
  selectedKey?: string;
  labels?: Rect[];
  respec?: Rect | null;
  refund?: number;
  nodes: { id: UpgradeId; level: number; max: number; price: number | null; canBuy: boolean; open: boolean; onScreen: boolean; rect: Rect; /** Подпись под кружком (название узла): центр и размер на экране игры. */ label: Rect; recommended: boolean }[];
  /** Карточка выбранного узла: тексты (название, уровень, что даст дальше, условие, кнопка), кнопка покупки, помещаются ли тексты. */
  detail: { texts: string[]; buy: Rect; fits: boolean; /** «★ рекомендуем» у узла с меткой (иначе пусто). */ hint: string } | null;
  play: Rect | null;
}

export interface MetaDebugSnapshot {
  /** Строки итога последних попыток и предел длины строки (проверка сохранения журнала). */
  log: string[];
  logMax: number;
  dna: number;
  levels: Record<UpgradeId, number>;
  progress: { stars: number[]; best: number[] };
  seen: string[];
  screen: MetaScreenInfo;
  /** Первые победы над боссами по уровням (биты) и награды «без потерь». */
  bossWins: number[];
  /** Сеть древа: купленные узлы (`id#L`), узлы, которые можно взять (кольцо открыто, сосед купленного), открытые кольца. */
  nodes: string[];
  available: string[];
  rings: number[];
  /** Связи сети по орбите между соседними секторами (`src/treeNet.ts`). */
  orbit: [string, string][];
  flawless: number[];
}

declare global {
  interface Window {
    __pvbMeta?: { getMeta: () => MetaDebugSnapshot; dnaFor: (input: DnaInput) => DnaParts; starsFor: (lostLives: number) => number };
  }
}

/** Делает состояние очков и улучшений доступным проверкам (`window.__pvbMeta`); `screen` отдаёт описание экрана «Улучшения» (или «не показан»). */
export function exposeMetaDebug(screen: () => MetaScreenInfo): void {
  if (QA_MODE) window.__pvbMeta = { getMeta: () => ({ log: [...state.log], logMax: MAX_LOG_LEN, dna: state.dna, levels: metaLevels(), progress: { stars: [...state.progress.stars], best: [...state.progress.best] }, seen: [...state.seen], bossWins: [...state.bossWins], flawless: [...state.flawless], screen: screen(), nodes: [...state.nodes], available: [...NET.nodes.keys()].filter(nodeAvailable), rings: [1, 2, 3, 4, 5, 6].filter(isRingOpen), orbit: NET.orbit.map(([a, b]) => [a, b] as [string, string]) }), dnaFor: dnaParts, starsFor: starsForLoss };
}

export const HIDDEN_SCREEN: MetaScreenInfo = { visible: false, balance: '', selected: '', scroll: 0, view: { x: 0, y: 0, w: 0, h: 0 }, nodes: [], detail: null, play: null };
