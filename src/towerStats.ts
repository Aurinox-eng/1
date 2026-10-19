import { damageMul, keyOwned, upgradeBonus } from './meta';
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
  /** Заморозка ('freeze'): секунд; ловушка ('trap'): секунд приклеивания и HP в секунду (у остальных башен 0). */
  freezeSec: number;
  trapSec: number;
  trapDps: number;
  /** Взрыв ('area'): сколько ближайших к центру бактерий получают полный урон и множитель урона остальным в круге (blastFullTargets 0 — не ограничено, у остальных башен 0 и 1). */
  blastFullTargets: number;
  blastRestMul: number;
  /** Подсветка скрытных (Лампа): секунд подсветки после выхода бактерии из круга range; 0 — не подсвечивает. */
  lightSec: number;
}

/** Итоговые числа башни: строка таблицы с учётом уровня и выбранных мутаций + свойства мутаций. */
export interface TowerStats extends TowerRow {
  /** Какой башни числа (по нему бактерия-мутант узнаёт вид башни, ударившей последней). */
  towerId: TowerKey;
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
  /** Ключевые узлы древа (`keyNodes`; 0 / false — узел не куплен): доля урона рикошета Таблетки; осколков взрыва Шипучки; секунд без брони у первой цели луча Шприца;
   *  доля урона взрыва убитой Ампулой бактерии; яд Антибиотика переходит на соседа; множитель урона по бактериям в круге Лампы; башни в ауре Витамина не глушатся; множитель урона по замёрзшим. */
  ricochet: number;
  shards: number;
  armorBreakSec: number;
  killBurst: number;
  epidemic: boolean;
  spotlight: number;
  immunity: boolean;
  brittle: number;
}

/** Цена постройки башни в монетах: строка таблицы с учётом улучшения «цена башни» (округляется вверх до целого). Слияние бесплатно, продажа считается от этой цены. */
export function towerPrice(id: TowerKey): number {
  return Math.max(1, Math.ceil(CONFIG.towers[id].price * (1 + upgradeBonus('price', id as UpgradeBranch)) - 1e-9));
}


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

/** Особые мутации-«включатели» (бронебойность, второй луч, цепной взрыв, самая прочная цель) работают один раз: второй такой же выбор ничего не добавляет. */
const ONCE_ONLY_FLAGS: ReadonlySet<string> = new Set(['id', 'armorPierce', 'secondBeam', 'chain', 'toughest']);

/** Прибавляет ли ещё один экземпляр мутации что-нибудь: false, если в её описании только флаги из `ONCE_ONLY_FLAGS` (на карточке такой выбор показывается без «×N»). */
export function mutationStacks(id: TowerKey, pickId: string): boolean {
  const spec = mutationById(id, pickId);
  return Boolean(spec) && Object.keys(spec as MutationSpec).some((key) => !ONCE_ONLY_FLAGS.has(key));
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
    towerId: id,
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
    ricochet: 0,
    shards: 0,
    armorBreakSec: 0,
    killBurst: 0,
    epidemic: false,
    spotlight: 1,
    immunity: false,
    brittle: 1,
  };
  const caps = CONFIG.mutationCaps;
  // Насколько мутации подняли урон в секунду (для потолка `mutationCaps.dpsMul`): урон, частота, лишние цели, удары очереди, яд
  let mutDamage = 1;
  let mutRate = 1;
  let mutDot = 1;
  s.damage = base.damage * lv.damageMul;
  s.dotPerSec = base.dotPerSec * lv.damageMul;
  s.trapDps = base.trapDps * lv.damageMul;
  s.freezeSec = base.freezeSec * Math.pow(lv.damageMul, CONFIG.freezeLevelPower);
  s.cooldownMs = base.cooldownMs * lv.cooldownMul;
  s.range = base.range * lv.reachMul;
  s.blastRadius = base.blastRadius * lv.reachMul;
  s.puddleRadius = base.puddleRadius * lv.reachMul;
  s.puddleSec = base.puddleSec * lv.puddleSecMul;
  s.slowFactor = base.slowFactor < 1 ? Math.pow(base.slowFactor, lv.slowPower) : 1;
  s.beamPulses = base.beamPulses > 0 ? base.beamPulses + lv.pulsesAdd : 0;
  // Мутации складываются при слиянии (решение владельца 8 октября 2026, docs/expert-plan.md, раздел 4): в списке `picks` бывают повторы;
  // k-й экземпляр одной и той же мутации даёт долю `mutationStack.copyShares[k]` своего эффекта (100 % / 50 % / 25 % / 0). Особые мутации (бронебойность, второй луч и т. п.) работают один раз.
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
    if (spec.damageMul) {
      s.damage *= scaled(spec.damageMul);
      mutDamage *= scaled(spec.damageMul);
    }
    if (spec.cooldownMul) {
      s.cooldownMs *= scaled(spec.cooldownMul);
      mutRate /= scaled(spec.cooldownMul);
    }
    if (spec.blastMul) s.blastRadius *= scaled(spec.blastMul);
    if (spec.puddleRadiusMul) s.puddleRadius *= scaled(spec.puddleRadiusMul);
    if (spec.slowFactor !== undefined && share > 0) s.slowFactor = k === 0 ? Math.min(s.slowFactor, spec.slowFactor) : s.slowFactor * (1 - (1 - spec.slowFactor) * share);
    if (spec.pulsesAdd && s.beamPulses > 0) s.beamPulses += whole(spec.pulsesAdd);
    if (spec.armorPierce) s.armorPierce = true;
    if (spec.extraTargets) s.extraTargets += whole(spec.extraTargets);
    if (spec.toughest) s.toughest = true;
    if (spec.poisonPerSec) s.poisonPerSec += spec.poisonPerSec * share;
    if (spec.puddleCount && share > 0) s.puddleCount = k === 0 ? Math.max(s.puddleCount, spec.puddleCount) : s.puddleCount + (k === 1 ? 1 : 0);
    if (spec.chain) s.chain = true;
    if (spec.acidSec) {
      s.acidSec = Math.max(s.acidSec, spec.acidSec);
      s.acidMul = k === 0 ? Math.max(s.acidMul, spec.acidMul ?? 1) : s.acidMul + ((spec.acidMul ?? 1) - 1) * share;
    }
    if (spec.secondBeam) s.secondBeam = true;
    if (spec.spiral) s.spiral += spec.spiral * share;
    if (spec.dotSecMul) s.dotSec *= scaled(spec.dotSecMul);
    if (spec.dotDpsMul) {
      s.dotPerSec *= scaled(spec.dotDpsMul);
      mutDot *= scaled(spec.dotDpsMul);
    }
    if (spec.coneMul) s.coneDeg = Math.min(caps.coneDeg, s.coneDeg * scaled(spec.coneMul));
    if (spec.rangeMul) s.range *= scaled(spec.rangeMul);
    if (spec.auraBonusMul) auraBonus *= scaled(spec.auraBonusMul);
    if (spec.freezeMul) s.freezeSec *= scaled(spec.freezeMul);
    if (spec.trapSecMul) s.trapSec *= scaled(spec.trapSecMul);
    if (spec.trapDpsMul) s.trapDps *= scaled(spec.trapDpsMul);
  }
  // Потолки мутаций (документ дизайна docs/redesign-2026-10-19.md, п. 4.2): лишних целей и ударов очереди не больше заданного; урон в секунду от всех мутаций — не выше dpsMul к башне без мутаций
  const basePulses = base.beamPulses > 0 ? base.beamPulses + lv.pulsesAdd : 0;
  s.extraTargets = Math.min(caps.extraTargetsMax, s.extraTargets);
  if (s.beamPulses > 0) s.beamPulses = Math.min(caps.pulsesMax, s.beamPulses);
  const mutDps = mutDamage * mutRate * (1 + s.extraTargets) * (basePulses > 0 ? s.beamPulses / basePulses : 1);
  if (mutDps > caps.dpsMul) s.damage *= caps.dpsMul / mutDps;
  const mutDotDps = mutDot * mutRate * (1 + s.extraTargets);
  if (mutDotDps > caps.dpsMul) s.dotPerSec *= caps.dpsMul / mutDotDps;
  // Улучшения вне партии ветки этой башни (docs/upgrades.md, раздел 12): пауза, радиусы, лужа, замедление, луч
  const bonus = (effect: UpgradeEffect): number => upgradeBonus(effect, id as UpgradeBranch);
  s.damage *= 1 + bonus('towerDamage');
  s.cooldownMs *= 1 + bonus('cooldown');
  s.range *= 1 + bonus('range');
  s.blastRadius *= 1 + bonus('blast');
  s.puddleSec *= 1 + bonus('puddleSec');
  s.puddleRadius *= 1 + bonus('puddleRadius');
  if (s.slowFactor < 1 && bonus('slowFactor') !== 0) s.slowFactor = Math.max(CONFIG.meta.minSlowFactor, s.slowFactor + bonus('slowFactor'));
  if (s.slowFactor < 1) s.slowFactor = Math.max(CONFIG.meta.minSlowFactor, s.slowFactor);
  if (s.beamPulses > 0) {
    s.beamPulses = Math.min(caps.pulsesMax, s.beamPulses + Math.floor(bonus('pulses')));
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
  s.trapDps *= (1 + bonus('towerDamage')) * damageMul();
  s.freezeSec *= 1 + bonus('freezeTime');
  // Заморозка Холода — не дольше доли его паузы (иначе бактерия в радиусе не оттаивала бы)
  if (s.freezeSec > 0) s.freezeSec = Math.min(s.freezeSec, (s.cooldownMs / 1000) * caps.freezeShareOfCooldown);
  // Ключевой узел ветки этой башни (документ дизайна, раздел 5.2)
  if (keyOwned(id)) {
    const k = CONFIG.keyNodes;
    if (id === 'pill') s.ricochet = k.pill.damageShare;
    else if (id === 'syrup') s.puddleCount += k.syrup.extraPuddles;
    else if (id === 'fizz') s.shards = k.fizz.shards;
    else if (id === 'syringe') s.armorBreakSec = k.syringe.armorBreakSec;
    else if (id === 'ampule') s.killBurst = k.ampule.damageShare;
    else if (id === 'antibiotic') s.epidemic = true;
    else if (id === 'lamp') s.spotlight = k.lamp.damageMul;
    else if (id === 'vitamin') s.immunity = k.vitamin.immune > 0;
    else if (id === 'frost') s.brittle = k.frost.damageMul;
    else if (id === 'patch') s.extraTargets = Math.min(caps.extraTargetsMax, s.extraTargets + k.patch.extraTargets);
  }
  return s;
}
