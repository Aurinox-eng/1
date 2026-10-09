import { damageMul, upgradeBonus } from './meta';
import { CONFIG, type MutationSpec, type Targeting, type TowerSide, type UpgradeBranch, type UpgradeEffect } from './config';

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
  /** Яд ('poison'): HP в секунду и сколько секунд идёт (у остальных башен 0). */
  dotPerSec: number;
  dotSec: number;
  /** Конус ('cone'): угол в градусах (у остальных 0). Аура ('aura'): множитель паузы башен в радиусе на уровне 1 и убыль с уровнем (у остальных 1 и 0). */
  coneDeg: number;
  auraMul: number;
  auraStep: number;
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

/** Цена постройки башни в монетах: строка таблицы с учётом улучшения «цена башни» (округляется вверх до целого). Слияние бесплатно, продажа считается от этой цены. */
export function towerPrice(id: TowerKey): number {
  return Math.max(1, Math.ceil(CONFIG.towers[id].price * (1 + upgradeBonus('price', id as UpgradeBranch)) - 1e-9));
}

/** Самый широкий конус Лампы после мутаций, градусов (правило отрисовки и попадания, не число баланса). */
const MAX_CONE_DEG = 120;

/** Самый высокий уровень башни. */
export const MAX_TOWER_LEVEL = CONFIG.towerLevels.length;

/** Два варианта мутации на пороге tier (0 — первый порог, 1 — второй) для башни id. */
export function mutationOptions(id: TowerKey, tier: number): MutationSpec[] {
  return CONFIG.mutations[id]?.[tier] ?? [];
}

/** Мутация башни id по её номеру (порог не нужен: при слиянии у башни бывают мутации обоих порогов и повторы). */
export function mutationById(id: TowerKey, pickId: string): MutationSpec | undefined {
  for (const tier of CONFIG.mutations[id] ?? []) {
    const found = tier.find((m) => m.id === pickId);
    if (found) return found;
  }
  return undefined;
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
  let auraBonus = 1;
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
  s.dotPerSec = base.dotPerSec * lv.damageMul;
  s.cooldownMs = base.cooldownMs * lv.cooldownMul;
  s.range = base.range * lv.reachMul;
  s.blastRadius = base.blastRadius * lv.reachMul;
  s.puddleRadius = base.puddleRadius * lv.reachMul;
  s.puddleSec = base.puddleSec * lv.puddleSecMul;
  s.slowFactor = base.slowFactor < 1 ? Math.pow(base.slowFactor, lv.slowPower) : 1;
  s.beamPulses = base.beamPulses > 0 ? base.beamPulses + lv.pulsesAdd : 0;
  // Мутации складываются при слиянии (решение владельца 8 октября 2026, docs/expert-plan.md, раздел 4): в списке `picks` бывают повторы;
  // k-й экземпляр одной и той же мутации даёт долю `mutationStack.copyShares[k]` своего эффекта (100 % / 50 % / 25 %). Особые мутации (бронебойность, второй луч и т. п.) работают один раз.
  const shares = CONFIG.mutationStack.copyShares;
  const seen = new Map<string, number>();
  for (const pickId of picks) {
    const spec = mutationById(id, pickId);
    if (!spec) continue;
    const k = seen.get(pickId) ?? 0;
    seen.set(pickId, k + 1);
    const share = shares[Math.min(k, shares.length - 1)];
    const scaled = (mul: number): number => 1 + (mul - 1) * share;
    const whole = (n: number): number => (k === 0 ? n : Math.floor(n * share + 0.5));
    if (spec.damageMul) s.damage *= scaled(spec.damageMul);
    if (spec.cooldownMul) s.cooldownMs *= scaled(spec.cooldownMul);
    if (spec.blastMul) s.blastRadius *= scaled(spec.blastMul);
    if (spec.puddleRadiusMul) s.puddleRadius *= scaled(spec.puddleRadiusMul);
    if (spec.slowFactor !== undefined) s.slowFactor = k === 0 ? Math.min(s.slowFactor, spec.slowFactor) : Math.max(0.1, s.slowFactor * (1 - (1 - spec.slowFactor) * share));
    if (spec.pulsesAdd && s.beamPulses > 0) s.beamPulses += whole(spec.pulsesAdd);
    if (spec.armorPierce) s.armorPierce = true;
    if (spec.extraTargets) s.extraTargets += whole(spec.extraTargets);
    if (spec.toughest) s.toughest = true;
    if (spec.poisonPerSec) s.poisonPerSec += spec.poisonPerSec * share;
    if (spec.puddleCount) s.puddleCount = k === 0 ? Math.max(s.puddleCount, spec.puddleCount) : s.puddleCount + (k === 1 ? 1 : 0);
    if (spec.chain) s.chain = true;
    if (spec.acidSec) {
      s.acidSec = Math.max(s.acidSec, spec.acidSec);
      s.acidMul = k === 0 ? Math.max(s.acidMul, spec.acidMul ?? 1) : s.acidMul + ((spec.acidMul ?? 1) - 1) * share;
    }
    if (spec.secondBeam) s.secondBeam = true;
    if (spec.spiral) s.spiral += spec.spiral * share;
    if (spec.dotSecMul) s.dotSec *= scaled(spec.dotSecMul);
    if (spec.dotDpsMul) s.dotPerSec *= scaled(spec.dotDpsMul);
    if (spec.coneMul) s.coneDeg = Math.min(MAX_CONE_DEG, s.coneDeg * scaled(spec.coneMul));
    if (spec.rangeMul) s.range *= scaled(spec.rangeMul);
    if (spec.auraBonusMul) auraBonus *= scaled(spec.auraBonusMul);
  }
  // Улучшения вне партии ветки этой башни (docs/upgrades.md, раздел 12): пауза, радиусы, лужа, замедление, луч
  const bonus = (effect: UpgradeEffect): number => upgradeBonus(effect, id as UpgradeBranch);
  s.damage *= 1 + bonus('towerDamage');
  s.cooldownMs *= 1 + bonus('cooldown');
  s.range *= 1 + bonus('range');
  s.blastRadius *= 1 + bonus('blast');
  s.puddleSec *= 1 + bonus('puddleSec');
  s.puddleRadius *= 1 + bonus('puddleRadius');
  if (s.slowFactor < 1 && bonus('slowFactor') !== 0) s.slowFactor = Math.max(CONFIG.meta.minSlowFactor, s.slowFactor + bonus('slowFactor'));
  if (s.beamPulses > 0) {
    s.beamPulses += Math.floor(bonus('pulses'));
    s.beamHalfWidthPx += bonus('beamWidth');
  }
  // Аура Витамина: множитель паузы уровня (1-й уровень — auraMul, дальше на auraStep меньше) и улучшения ветки; прибавку (1 − множитель) усиливают мутации
  if (base.auraMul < 1) {
    const raw = base.auraMul - base.auraStep * (Math.min(Math.max(1, level), MAX_TOWER_LEVEL) - 1) + bonus('auraBoost');
    s.auraMul = Math.min(1, Math.max(CONFIG.meta.minAuraMul, 1 - (1 - raw) * auraBonus));
  }
  // Улучшение вне партии «Сильное вещество»: урон всех башен (docs/upgrades.md)
  s.damage *= damageMul();
  s.dotPerSec *= (1 + bonus('towerDamage')) * damageMul();
  return s;
}
