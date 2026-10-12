/**
 * Очки ДНК и улучшения вне партии: текущее состояние, начисление, покупка и бонусы для партии (проект — docs/upgrades.md).
 *
 * Состояние читается из сохранения один раз при загрузке страницы и после каждого изменения записывается обратно.
 * В режиме проверки (`?qa&meta=lives:1,coins:2,damage:3,reward:0,dna:50`) начальное состояние берётся из адреса, а в сохранение ничего не пишется;
 * `?qa&stars=3,2,0` задаёт звёзды уровней 1, 2, 3… (остальные — 0), в сохранение тоже ничего не пишется.
 * Прогресс по уровням (звёзды, лучшая волна, показанные плашки) — этап 5, docs/stage-5-plan.md.
 */
import { CONFIG, type UpgradeBranch, type UpgradeEffect } from './config';
import { QA_MODE } from './debug';
import { emptyMeta, loadMeta, maxLevel, saveMeta, UPGRADE_IDS, type MetaSave, type UpgradeId } from './save';
import { unlockLevel } from './progress';

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
  return out;
}

function readStarsOverride(): number[] | null {
  if (!QA_MODE) return null;
  const raw = new URLSearchParams(window.location.search).get('stars');
  if (raw === null) return null;
  return raw.split(',').map((x) => Math.max(0, Math.min(3, Math.floor(Number(x)) || 0)));
}

const override = readOverride();
const starsOverride = readStarsOverride();
let state: MetaSave = override ?? loadMeta();
if (starsOverride) starsOverride.forEach((n, i) => { if (i < state.progress.stars.length) state.progress.stars[i] = n; });
/** С подменой из адреса (`&meta=`, `&stars=`) в сохранение ничего не пишется. */
const noPersist = override !== null || starsOverride !== null;

function persist(): void {
  if (!noPersist) saveMeta(state);
}

export function metaDna(): number {
  return state.dna;
}

export function metaLevel(id: UpgradeId): number {
  return state.levels[id];
}

export function metaLevels(): Record<UpgradeId, number> {
  return { ...state.levels };
}

/** Цена следующего уровня улучшения или null, если куплен наибольший. */
export function nextPrice(id: UpgradeId): number | null {
  return CONFIG.meta.upgrades[id].prices[state.levels[id]] ?? null;
}

/** Условие открытия узла дерева: родитель и нужный уровень (null — узел открыт с начала). */
export function requirementOf(id: UpgradeId): { id: UpgradeId; level: number } | null {
  const req = CONFIG.meta.upgrades[id].requires;
  return req ? { id: req[0], level: req[1] } : null;
}

/** Выполнено ли условие дерева: родитель куплен до нужного уровня. */
export function requirementMet(id: UpgradeId): boolean {
  const req = requirementOf(id);
  return !req || (state.levels[req.id] ?? 0) >= req.level;
}

/** Узел доступен для покупки по структуре дерева и по картам уровней (ветка башни открыта, родитель куплен); очки не учитываются. */
export function isNodeOpen(id: UpgradeId): boolean {
  return isBranchOpen(CONFIG.meta.upgrades[id].branch) && requirementMet(id);
}

export function canBuy(id: UpgradeId): boolean {
  const price = nextPrice(id);
  return price !== null && state.dna >= price && isNodeOpen(id);
}

/** Покупает следующий уровень улучшения; false, если куплен наибольший уровень или не хватает очков. */
export function buyUpgrade(id: UpgradeId): boolean {
  const price = nextPrice(id);
  if (price === null || state.dna < price || !isNodeOpen(id)) return false;
  state = { ...state, dna: state.dna - price, levels: { ...state.levels, [id]: state.levels[id] + 1 } };
  persist();
  return true;
}

/** Сколько очков ДНК даёт партия: за каждую пройденную волну и добавка за победу. */
export function dnaForGame(wavesCleared: number, won: boolean): number {
  const { perWave, winBonus } = CONFIG.meta.dna;
  return Math.max(0, Math.floor(wavesCleared)) * perWave + (won ? winBonus : 0);
}

/** Начисляет очки ДНК за партию на счёт и возвращает, сколько начислено. */
export function awardDna(wavesCleared: number, won: boolean): number {
  const gained = dnaForGame(wavesCleared, won);
  state = { ...state, dna: state.dna + gained };
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

/** Открыт ли уровень: первый — всегда, остальные — когда предыдущий пройден (хотя бы одна звезда). */
export function isLevelOpen(level: number): boolean {
  return level <= 1 || levelStars(level - 1) >= 1;
}

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

export function markSeen(key: string): void {
  if (!SEEN_STORED || state.seen.includes(key) || key.length > 40 || state.seen.length >= 200) return;
  state = { ...state, seen: [...state.seen, key] };
  persist();
}

// ---------------------------------------------------------------- ветки и бонусы партии

/** С какого уровня открыта ветка: «Организм» и «Защита» — с первого, ветка башни — с уровня, на котором башня становится доступной (`levels.towerUnlock`). */
export function branchUnlockLevel(branch: UpgradeBranch): number {
  return branch === 'body' || branch === 'defense' ? 1 : unlockLevel(branch);
}

/** Открыта ли ветка для покупок: открыт ли на карте уровней уровень, на котором ветка открывается. */
export function isBranchOpen(branch: UpgradeBranch): boolean {
  return isLevelOpen(branchUnlockLevel(branch));
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
  /** Выбранный узел (id), прокрутка дерева и окно дерева. */
  selected: string;
  scroll: number;
  view: Rect;
  nodes: { id: UpgradeId; level: number; max: number; price: number | null; canBuy: boolean; open: boolean; onScreen: boolean; rect: Rect }[];
  /** Карточка выбранного узла: тексты (название, уровень, что даст дальше, условие, кнопка), кнопка покупки, помещаются ли тексты. */
  detail: { texts: string[]; buy: Rect; fits: boolean } | null;
  play: Rect | null;
}

export interface MetaDebugSnapshot {
  dna: number;
  levels: Record<UpgradeId, number>;
  progress: { stars: number[]; best: number[] };
  seen: string[];
  screen: MetaScreenInfo;
}

declare global {
  interface Window {
    __pvbMeta?: { getMeta: () => MetaDebugSnapshot };
  }
}

/** Делает состояние очков и улучшений доступным проверкам (`window.__pvbMeta`); `screen` отдаёт описание экрана «Улучшения» (или «не показан»). */
export function exposeMetaDebug(screen: () => MetaScreenInfo): void {
  if (QA_MODE) window.__pvbMeta = { getMeta: () => ({ dna: state.dna, levels: metaLevels(), progress: { stars: [...state.progress.stars], best: [...state.progress.best] }, seen: [...state.seen], screen: screen() }) };
}

export const HIDDEN_SCREEN: MetaScreenInfo = { visible: false, balance: '', selected: '', scroll: 0, view: { x: 0, y: 0, w: 0, h: 0 }, nodes: [], detail: null, play: null };
