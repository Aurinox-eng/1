/**
 * Очки ДНК и улучшения вне партии: текущее состояние, начисление, покупка и бонусы для партии (проект — docs/upgrades.md).
 *
 * Состояние читается из сохранения один раз при загрузке страницы и после каждого изменения записывается обратно.
 * В режиме проверки (`?qa&meta=lives:1,coins:2,damage:3,reward:0,dna:50`) начальное состояние берётся из адреса, а в сохранение ничего не пишется;
 * `?qa&stars=3,2,0` задаёт звёзды уровней 1, 2, 3… (остальные — 0), в сохранение тоже ничего не пишется.
 * Прогресс по уровням (звёзды, лучшая волна, показанные плашки) — этап 5, docs/stage-5-plan.md.
 */
import { CONFIG } from './config';
import { QA_MODE } from './debug';
import { emptyMeta, loadMeta, maxLevel, saveMeta, UPGRADE_IDS, type MetaSave, type UpgradeId } from './save';

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
    else if ((UPGRADE_IDS as string[]).includes(key)) out.levels[key as UpgradeId] = Math.min(maxLevel(key as UpgradeId), Math.floor(value));
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

export function canBuy(id: UpgradeId): boolean {
  const price = nextPrice(id);
  return price !== null && state.dna >= price;
}

/** Покупает следующий уровень улучшения; false, если куплен наибольший уровень или не хватает очков. */
export function buyUpgrade(id: UpgradeId): boolean {
  const price = nextPrice(id);
  if (price === null || state.dna < price) return false;
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

/** Бонусы партии от купленных улучшений. */
export const livesBonus = (): number => state.levels.lives * CONFIG.meta.upgrades.lives.perLevel;
export const coinsBonus = (): number => state.levels.coins * CONFIG.meta.upgrades.coins.perLevel;
export const damageMul = (): number => 1 + state.levels.damage * CONFIG.meta.upgrades.damage.perLevel;
export const rewardMul = (): number => 1 + state.levels.reward * CONFIG.meta.upgrades.reward.perLevel;

// ---------------------------------------------------------------- доступ для проверок (только ?qa)

type Rect = { x: number; y: number; w: number; h: number };

/** Что видно на экране «Улучшения» (для проверок): карточки с кнопками покупки и кнопка «Играть» — центры и размеры на экране игры. */
export interface MetaScreenInfo {
  visible: boolean;
  cards: { id: UpgradeId; level: number; max: number; price: number | null; canBuy: boolean; rect: Rect; buy: Rect; texts: string[] }[];
  play: Rect | null;
  balance: string;
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

export const HIDDEN_SCREEN: MetaScreenInfo = { visible: false, cards: [], play: null, balance: '' };
