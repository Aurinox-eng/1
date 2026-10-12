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
  lamp: { strong: ['swarm', 'splitter', 'brood'], weak: ['armored', 'giant'] },
  // Витамин сам никого не бьёт: списки пустые, в альманахе у него только строка «Усиливает соседние башни» (пустые подписи не рисуются)
  vitamin: { strong: [], weak: [] },
  frost: { strong: ['swarm', 'runner', 'brood'], weak: ['slick', 'giant'] },
  patch: { strong: ['giant', 'armored', 'brood'], weak: ['leaper', 'slick', 'swarm'] },
};

/** Какие башни бьют бактерию лучше всего (значки в строке бактерии). */
export const ALMANAC_BEATEN_BY: Record<BacteriumKind, TowerId[]> = {
  coccus: ['pill', 'fizz'],
  rod: ['pill', 'syrup'],
  swarm: ['fizz', 'lamp', 'frost', 'syrup'],
  runner: ['syrup', 'frost', 'pill'],
  splitter: ['fizz', 'lamp', 'pill'],
  armored: ['syringe', 'ampule', 'patch'],
  healer: ['syringe', 'fizz', 'antibiotic'],
  spore: ['syringe', 'pill'],
  slick: ['pill', 'syringe'],
  regen: ['syringe', 'antibiotic', 'ampule'],
  commander: ['pill', 'syringe'],
  brood: ['fizz', 'lamp', 'frost', 'antibiotic', 'ampule'],
  giant: ['syringe', 'ampule', 'patch', 'syrup'],
  leaper: ['pill', 'syringe'],
  phago: ['fizz', 'syringe', 'antibiotic'],
  stealth: ['lamp', 'syringe', 'ampule'],
  toxin: ['ampule', 'syringe'],
  mutant: ['ampule', 'lamp', 'syringe'],
  parasite: ['pill', 'lamp', 'frost'],
};
