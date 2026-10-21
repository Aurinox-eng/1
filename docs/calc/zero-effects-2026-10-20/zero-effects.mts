// Перебор достижимых наборов мутаций (computeStats из копии src/towerStats.ts; meta — заглушка lib/meta.ts).
// Запуск: node zero-effects.mts [--meta] [--keys]   (--meta: все улучшения ветки башни на максимуме; --keys: ключевые узлы куплены)
// Правило достижимости (src/objects/Tower.ts:1263 upgrade, :1271 pickMutation; src/scenes/GameScene.ts:1667 doMerge; config.ts:828 mutationLevels [2,4]):
//  L1: [];  L2: [t0];  L3: [t0 своей] + [t0 сливаемой] (порог 2 не открыт);  L4: 4 × t0 (по 2 от каждой L3) + [t1].
//  Невыбранный порог (выбор отложен) даёт наборы с меньшим числом мутаций — они же служат «без этой копии» при расчёте вклада.
import { computeStats, VAR, type TowerKey } from './lib/towerStatsV.ts';
import { PRESETS } from './presets.mts';
import { CONFIG } from './lib/config.ts';
import { META, setKeys } from './lib/meta.ts';

const args = process.argv.slice(2);
if (args.includes('--meta')) Object.assign(META, { towerDamage: 0.4, cooldown: -0.2, range: 0.12, freezeTime: 0.3, auraBoost: -0.1, puddleSec: 0.4, beamWidth: 8, damage: 1.0 });
if (args.includes('--keys')) setKeys(true);
const preset = args.find((a) => a.startsWith('--variant='))?.slice(10);
if (preset) PRESETS[preset](VAR);
const REFREEZE = CONFIG.mutationCaps.refreezeSec;

type M = Record<string, number>;
function metrics(id: TowerKey, level: number, picks: string[]): M {
  const s = computeStats(id, level, picks);
  const cd = s.cooldownMs / 1000;
  const lvMul = CONFIG.towerLevels[level - 1].damageMul;
  const m: M = { cd, range: s.range };
  const two = Math.min(2, 1 + s.extraTargets);
  switch (s.targeting) {
    case 'radius': case 'snipe':
      m.hit = s.damage; m.dps1 = s.damage / cd; m.dps2 = (s.damage * two) / cd; break;
    case 'area':
      m.hit = s.damage; m.dps1 = s.damage / cd; m.blast = s.blastRadius; m.dpsArea = (s.damage / cd) * s.blastRadius ** 2 / 55 ** 2; m.acid = s.acidMul; break;
    case 'beam': {
      const p = Math.max(1, s.beamPulses);
      const shot = p * s.damage + (s.spiral * lvMul * p * (p - 1)) / 2;
      m.hit = s.damage; m.pulses = s.beamPulses; m.dps1 = shot / cd; m.dps2 = (2 * shot) / cd; m.beams = s.secondBeam ? 2 : 1; break;
    }
    case 'poison': {
      // яд не складывается, а обновляется (Bacterium.ts:349); башня бьёт ближайшую к организму (Tower.ts:1566) — по одной цели урон = dotPerSec, если пауза ≤ dotSec
      const cover = Math.min(1, s.dotSec / cd);
      m.dot = s.dotPerSec; m.dotSec = s.dotSec; m.dps1 = s.dotPerSec * cover; m.dps2 = s.dotPerSec * two * cover; m.perShot = s.dotPerSec * s.dotSec * (1 + s.extraTargets); break;
    }
    case 'cone':
      m.hit = s.damage; m.dps1 = s.damage / cd; m.cone = s.coneDeg; m.area = (s.coneDeg / 50) * (s.range / 200) ** 2; m.dpsArea = m.dps1 * m.area; break;
    case 'aura':
      m.aura = s.auraMul; m.speedup = 1 / s.auraMul; break;
    case 'freeze':
      // бактерия в радиусе: заморожена f с, снова — не раньше max(пауза, f + refreezeSec) (Bacterium.ts:382)
      m.freeze = s.freezeSec; m.uptime = s.freezeSec / Math.max(cd, s.freezeSec + REFREEZE); m.freezeRaw = NaN; break;
    case 'trap':
      m.trapSec = s.trapSec; m.trapDps = s.trapDps; m.perShot = s.trapSec * s.trapDps * (1 + s.extraTargets); m.thru = m.perShot / cd; break;
    case 'puddle':
      m.slow = s.slowFactor; m.slowSec = s.slowSec; m.puddleR = s.puddleRadius; m.puddleSec = s.puddleSec; m.puddles = s.puddleCount; m.poison = s.poisonPerSec; m.rate = 1 / cd; break;
  }
  return m;
}
// Что «должна улучшать» каждая составляющая мутации (больше — лучше, кроме отмеченных «-»)
function intended(spec: Record<string, unknown>, targeting: string): string[] {
  const out: string[] = [];
  const dmgT = ['radius', 'snipe', 'area', 'beam', 'cone'].includes(targeting);
  if (spec.damageMul) out.push('dps1');
  if (spec.cooldownMul) out.push(targeting === 'freeze' ? 'uptime' : targeting === 'trap' ? 'thru' : targeting === 'puddle' ? 'rate' : 'dps1');
  if (spec.extraTargets) out.push(targeting === 'trap' ? 'thru' : 'dps2');
  if (spec.pulsesAdd || spec.spiral) out.push('dps1');
  if (spec.blastMul) out.push('blast');
  if (spec.puddleRadiusMul) out.push('puddleR');
  if (spec.slowFactor !== undefined) out.push('-slow', 'slowSec');
  if (spec.poisonPerSec) out.push('poison');
  if (spec.puddleCount) out.push('puddles');
  if (spec.acidSec) out.push('acid');
  if (spec.dotSecMul) out.push('dps1', 'perShot');
  if (spec.dotDpsMul) out.push('dps1');
  if (spec.coneMul && spec.coneMul > 1) out.push('cone');
  if (spec.rangeMul) out.push('range');
  if (spec.auraBonusMul) out.push('-aura');
  if (spec.freezeMul) out.push('freeze', 'uptime');
  if (spec.trapSecMul) out.push('trapSec');
  if (spec.trapDpsMul) out.push('trapDps');
  for (const f of ['armorPierce', 'toughest', 'chain', 'secondBeam']) if (spec[f]) out.push('flag:' + f);
  void dmgT;
  return out;
}
const GOOD_UP = ['slowSec', 'dps1', 'dps2', 'range', 'freeze', 'uptime', 'perShot', 'thru', 'trapSec', 'trapDps', 'blast', 'puddleR', 'puddleSec', 'puddles', 'poison', 'cone', 'dpsArea', 'acid', 'pulses', 'dot', 'dotSec', 'speedup'];
const GOOD_DOWN = ['slow', 'aura'];

const fmt = (x: number) => (Number.isFinite(x) ? (Math.round(x * 1000) / 1000).toString() : '-');
function multisets<T>(items: T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (items.length === 0) return [];
  const [h, ...t] = items;
  const out: T[][] = [];
  for (let k = n; k >= 0; k--) for (const rest of multisets(t, n - k)) out.push([...Array(k).fill(h), ...rest]);
  return out;
}
const short = (id: string, picks: string[]) => {
  const c = new Map<string, number>();
  for (const p of picks) c.set(p, (c.get(p) ?? 0) + 1);
  return [...c].map(([k, n]) => `${k.replace(id, '')}${n > 1 ? '×' + n : ''}`).join('+') || '—';
};

const rows: string[] = [];
const trans: string[] = [];
const allMetrics: string[] = [];
for (const id of Object.keys(CONFIG.towers) as TowerKey[]) {
  const tiers = CONFIG.mutations[id];
  const t0 = tiers[0].map((x) => x.id);
  const t1 = tiers[1].map((x) => x.id);
  const targeting = CONFIG.towers[id].targeting;
  const sets: Record<number, string[][]> = {
    1: [[]],
    2: t0.map((a) => [a]),
    3: multisets(t0, 2),
    4: multisets(t0, 4).flatMap((ms) => t1.map((b) => [...ms, b])),
  };
  // все наборы: метрики
  for (const L of [1, 2, 3, 4]) for (const S of sets[L]) {
    const m = metrics(id, L, S);
    allMetrics.push(`${id}\tL${L}\t${short(id, S)}\t${Object.entries(m).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => `${k}=${fmt(v)}`).join(' ')}`);
  }
  // вклад каждой мутации: набор S против S без одной копии m (k-я копия)
  for (const L of [2, 3, 4]) for (const S of sets[L]) {
    const full = metrics(id, L, S);
    for (const m of new Set(S)) {
      const i = S.lastIndexOf(m);
      const without = S.filter((_, j) => j !== i);
      const less = metrics(id, L, without);
      const copy = S.filter((x) => x === m).length;
      const spec = CONFIG.mutations[id].flat().find((x) => x.id === m) as Record<string, unknown>;
      const want = intended(spec, targeting);
      const flags = want.filter((w) => w.startsWith('flag:'));
      const stats = want.filter((w) => !w.startsWith('flag:'));
      const notes: string[] = [];
      // «0» — ни одна из целевых характеристик не выросла; «МИНУС» — какая-то целевая упала
      const ds = stats.map((w) => { const down = w.startsWith('-'); const k = down ? w.slice(1) : w; return { k, d: (full[k] - less[k]) * (down ? -1 : 1) }; });
      const anyUp = ds.some((x) => x.d > 1e-9);
      for (const { k, d } of ds) {
        if (d < -1e-9) notes.push(`${k}: ${fmt(less[k])}→${fmt(full[k])} [МИНУС]`);
        else if (!anyUp && stats.length) notes.push(`${k}: ${fmt(less[k])}→${fmt(full[k])} [0]`);
      }
      // побочные минусы по остальным «хорошим» числам (кроме сознательных размен: Narrow сужает конус)
      for (const k of GOOD_UP) if (k in full && !stats.includes(k) && full[k] < less[k] - 1e-9 && !(m === 'lampNarrow' && (k === 'cone' || k === 'dpsArea'))) notes.push(`${k}: ${fmt(less[k])}→${fmt(full[k])} [МИНУС побочно]`);
      for (const k of GOOD_DOWN) if (k in full && full[k] > less[k] + 1e-9) notes.push(`${k}: ${fmt(less[k])}→${fmt(full[k])} [МИНУС побочно]`);
      const flagOnlyDead = flags.length > 0 && stats.length === 0 && copy > 1;
      if (flagOnlyDead) notes.push(`флаг ${flags.join(',')} уже включён [0: копия ${copy}]`);
      if (notes.length) rows.push(`${id}\tL${L}\t${short(id, S)}\t${m} (копия ${copy})\t${[...new Set(notes)].join('; ')}`);
    }
  }
  // переходы уровня: башня-цель до и после слияния (её мутации + мутации второй башни того же уровня [+ новый выбор на L4])
  const child = (L: number, P: string[]): string[][] => {
    if (L === 1) return [...sets[2], []];
    if (L === 2) return [...t0.map((b) => [...P, b]), P];
    return multisets(t0, 2).flatMap((src) => [...t1.map((b) => [...P, ...src, b]), [...P, ...src]]);
  };
  for (const L of [1, 2, 3]) for (const P of sets[L]) for (const C of child(L, P)) {
    const a = metrics(id, L, P);
    const b = metrics(id, L + 1, C);
    const notes: string[] = [];
    for (const k of GOOD_UP) if (k in a && b[k] < a[k] - 1e-9) notes.push(`${k}: ${fmt(a[k])}→${fmt(b[k])} [МИНУС]`);
    for (const k of GOOD_DOWN) if (k in a && b[k] > a[k] + 1e-9) notes.push(`${k}: ${fmt(a[k])}→${fmt(b[k])} [МИНУС]`);
    const main = { radius: 'dps1', snipe: 'dps1', area: 'dps1', beam: 'dps1', poison: 'dps1', cone: 'dps1', aura: 'aura', freeze: 'freeze', trap: 'thru', puddle: 'slow' }[targeting] as string;
    if (Math.abs(b[main] - a[main]) < 1e-9) notes.push(`${main}: ${fmt(a[main])}→${fmt(b[main])} [0]`);
    if (notes.length) trans.push(`${id}\tL${L}→L${L + 1}\t${short(id, P)} ⇒ ${short(id, C)}\t${notes.join('; ')}`);
  }
}
const tag = (preset ? '-' + preset : '') + (args.includes('--meta') ? '-meta' : '') + (args.includes('--keys') ? '-keys' : '');
const fs = await import('node:fs');
const dir = new URL('.', import.meta.url).pathname;
fs.writeFileSync(`${dir}out${tag}-mutations.tsv`, 'башня\tуровень\tнабор\tмутация\tчто 0/минус\n' + rows.join('\n') + '\n');
fs.writeFileSync(`${dir}out${tag}-transitions.tsv`, 'башня\tпереход\tдо ⇒ после\tчто 0/минус\n' + trans.join('\n') + '\n');
fs.writeFileSync(`${dir}out${tag}-all-metrics.tsv`, allMetrics.join('\n') + '\n');
console.log(`мутации: ${rows.length} строк, переходы: ${trans.length} строк → ${dir}out${tag}-*.tsv`);
