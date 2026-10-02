import { CONFIG, type MutationSpec, type Targeting, type TowerSide } from './config';

export type TowerKey = keyof typeof CONFIG.towers;
/** Строка таблицы башен (числа башни уровня 1 без мутаций); колонки описаны в config.ts. */
export interface TowerRow {
  price: number;
  range: number;
  damage: number;
  cooldownMs: number;
  projectileSpeed: number;
  targeting: Targeting;
  side: TowerSide;
  blastRadius: number;
  slowFactor: number;
  slowSec: number;
  puddleRadius: number;
  puddleSec: number;
  puddleLeadPx: number;
  beamPulses: number;
  beamGapMs: number;
  beamLengthPx: number;
  beamHalfWidthPx: number;
}

/** Итоговые числа башни: строка таблицы с учётом уровня и выбранных мутаций + свойства мутаций. */
export interface TowerStats extends TowerRow {
  armorPierce: boolean;
  extraTargets: number;
  toughest: boolean;
  poisonPerSec: number;
  puddleCount: number;
  chain: boolean;
  acidSec: number;
  acidMul: number;
  secondBeam: boolean;
  spiral: number;
}

/** Самый высокий уровень башни. */
export const MAX_TOWER_LEVEL = CONFIG.towerLevels.length;

/** Два варианта мутации на пороге tier (0 — первый порог, 1 — второй) для башни id. */
export function mutationOptions(id: TowerKey, tier: number): MutationSpec[] {
  return CONFIG.mutations[id]?.[tier] ?? [];
}

/** Сколько порогов мутаций башня этого уровня уже достигла. */
export function unlockedTiers(level: number): number {
  return CONFIG.mutationLevels.filter((l) => level >= l).length;
}

/**
 * Числа башни: уровень (таблица `towerLevels`) и мутации `picks` (id по порядку порогов).
 * Урон, пауза, радиусы, лужа и очередь луча считаются здесь один раз; сцена и башня читают готовое.
 */
export function computeStats(id: TowerKey, level: number, picks: readonly string[]): TowerStats {
  const base: TowerRow = CONFIG.towers[id];
  const lv = CONFIG.towerLevels[Math.min(Math.max(1, level), MAX_TOWER_LEVEL) - 1];
  const s: TowerStats = {
    ...base,
    armorPierce: false,
    extraTargets: 0,
    toughest: false,
    poisonPerSec: 0,
    puddleCount: 1,
    chain: false,
    acidSec: 0,
    acidMul: 1,
    secondBeam: false,
    spiral: 0,
  };
  s.damage = base.damage * lv.damageMul;
  s.cooldownMs = base.cooldownMs * lv.cooldownMul;
  s.range = base.range * lv.reachMul;
  s.blastRadius = base.blastRadius * lv.reachMul;
  s.puddleRadius = base.puddleRadius * lv.reachMul;
  s.puddleSec = base.puddleSec * lv.puddleSecMul;
  s.slowFactor = base.slowFactor < 1 ? Math.pow(base.slowFactor, lv.slowPower) : 1;
  s.beamPulses = base.beamPulses > 0 ? base.beamPulses + lv.pulsesAdd : 0;
  picks.forEach((pickId, tier) => {
    const spec = mutationOptions(id, tier).find((m) => m.id === pickId);
    if (!spec) return;
    if (spec.damageMul) s.damage *= spec.damageMul;
    if (spec.cooldownMul) s.cooldownMs *= spec.cooldownMul;
    if (spec.blastMul) s.blastRadius *= spec.blastMul;
    if (spec.puddleRadiusMul) s.puddleRadius *= spec.puddleRadiusMul;
    if (spec.slowFactor !== undefined) s.slowFactor = Math.min(s.slowFactor, spec.slowFactor);
    if (spec.pulsesAdd && s.beamPulses > 0) s.beamPulses += spec.pulsesAdd;
    if (spec.armorPierce) s.armorPierce = true;
    if (spec.extraTargets) s.extraTargets += spec.extraTargets;
    if (spec.toughest) s.toughest = true;
    if (spec.poisonPerSec) s.poisonPerSec += spec.poisonPerSec;
    if (spec.puddleCount) s.puddleCount = Math.max(s.puddleCount, spec.puddleCount);
    if (spec.chain) s.chain = true;
    if (spec.acidSec) {
      s.acidSec = Math.max(s.acidSec, spec.acidSec);
      s.acidMul = Math.max(s.acidMul, spec.acidMul ?? 1);
    }
    if (spec.secondBeam) s.secondBeam = true;
    if (spec.spiral) s.spiral += spec.spiral;
  });
  return s;
}
