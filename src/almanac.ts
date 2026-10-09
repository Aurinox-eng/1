import type { BacteriumKind } from './objects/Bacterium';
import type { TowerId } from './objects/Tower';

/**
 * Данные экрана «Альманах» (решение владельца 8 октября 2026, docs/expert-plan.md, раздел 3): у каждой башни — против кого сильна и слаба,
 * у каждой бактерии — какие башни её бьют. Тексты (одна короткая строка на запись) — в `src/i18n.ts`, ключи `almTower…` и `almBac…`.
 * Новая башня или бактерия = новая запись здесь и две строки текста (ru и en).
 */
export interface TowerEntry {
  strong: BacteriumKind[];
  weak: BacteriumKind[];
}

export const ALMANAC_TOWERS: Record<TowerId, TowerEntry> = {
  pill: { strong: ['coccus', 'rod', 'slick'], weak: ['armored'] },
  syrup: { strong: ['rod', 'runner', 'swarm'], weak: ['slick'] },
  fizz: { strong: ['swarm', 'splitter', 'brood'], weak: ['giant'] },
  syringe: { strong: ['armored', 'healer', 'giant'], weak: ['swarm'] },
  ampule: { strong: ['giant', 'armored', 'brood', 'regen'], weak: ['swarm', 'runner'] },
  antibiotic: { strong: ['regen', 'healer', 'brood', 'giant'], weak: ['swarm', 'runner', 'leaper'] },
};

/** Какие башни бьют бактерию лучше всего (значки в строке бактерии). */
export const ALMANAC_BEATEN_BY: Record<BacteriumKind, TowerId[]> = {
  coccus: ['pill', 'fizz'],
  rod: ['pill', 'syrup'],
  swarm: ['fizz', 'syrup'],
  runner: ['syrup', 'pill'],
  splitter: ['fizz', 'pill'],
  armored: ['syringe', 'ampule'],
  healer: ['syringe', 'fizz', 'antibiotic'],
  spore: ['syringe', 'pill'],
  slick: ['pill', 'syringe'],
  regen: ['syringe', 'antibiotic', 'ampule'],
  commander: ['pill', 'syringe'],
  brood: ['fizz', 'antibiotic', 'ampule'],
  giant: ['syringe', 'ampule', 'syrup'],
  leaper: ['pill', 'syringe'],
  phago: ['fizz', 'syringe', 'antibiotic'],
};
