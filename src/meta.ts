/**
 * Очки ДНК и улучшения вне партии: текущее состояние, начисление, покупка и бонусы для партии (проект — docs/upgrades.md).
 *
 * Состояние читается из сохранения один раз при загрузке страницы и после каждого изменения записывается обратно.
 * В режиме проверки (`?qa&meta=lives:1,coins:2,damage:3,reward:0,dna:50`) начальное состояние берётся из адреса, а в сохранение ничего не пишется.
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

const override = readOverride();
let state: MetaSave = override ?? loadMeta();

function persist(): void {
  if (!override) saveMeta(state);
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
  screen: MetaScreenInfo;
}

declare global {
  interface Window {
    __pvbMeta?: { getMeta: () => MetaDebugSnapshot };
  }
}

/** Делает состояние очков и улучшений доступным проверкам (`window.__pvbMeta`); `screen` отдаёт описание экрана «Улучшения» (или «не показан»). */
export function exposeMetaDebug(screen: () => MetaScreenInfo): void {
  if (QA_MODE) window.__pvbMeta = { getMeta: () => ({ dna: state.dna, levels: metaLevels(), screen: screen() }) };
}

export const HIDDEN_SCREEN: MetaScreenInfo = { visible: false, cards: [], play: null, balance: '' };
