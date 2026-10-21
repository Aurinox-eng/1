// «Было → станет» по предложениям: node proposals.mts   (вывод — out-proposals.txt)
import { computeStats, VAR } from './lib/towerStatsV.ts';
import { CONFIG } from './lib/config.ts';
import { PRESETS } from './presets.mts';
const DEF = JSON.parse(JSON.stringify(VAR));
const reset = () => { for (const k of Object.keys(DEF)) (VAR as any)[k] = JSON.parse(JSON.stringify(DEF[k])); };
const R = CONFIG.mutationCaps.refreezeSec;
const x = (id: string, n: number) => Array(n).fill(id);
const M: Record<string, (s: any, L: number) => number> = {
  freeze: (s) => s.freezeSec, uptime: (s) => s.freezeSec / Math.max(s.cooldownMs / 1000, s.freezeSec + R),
  aura: (s) => s.auraMul, dot: (s) => s.dotPerSec, dps1: (s) => s.damage / (s.cooldownMs / 1000), dot2: (s) => s.dotPerSec * Math.min(2, 1 + s.extraTargets), dps2: (s) => (s.damage * Math.min(2, 1 + s.extraTargets)) / (s.cooldownMs / 1000),
  beam1: (s, L) => { const p = s.beamPulses; return (p * s.damage + (s.spiral * CONFIG.towerLevels[L - 1].damageMul * p * (p - 1)) / 2) / (s.cooldownMs / 1000); },
  cone: (s) => s.coneDeg, slow: (s) => s.slowFactor, slowSec: (s) => s.slowSec,
};
const r = (v: number) => (Math.round(v * 1000) / 1000).toString().replace('.', ',');
const out: string[] = [];
function block(title: string, preset: string, cases: [string, number, string[], string[]][]) {
  out.push(`\n## ${title} (вариант ${preset})`);
  for (const [id, L, picks, ms] of cases) {
    reset(); const a = computeStats(id as any, L, picks);
    PRESETS[preset](VAR); const b = computeStats(id as any, L, picks); reset();
    const lab = [...new Map(picks.map((p) => [p, picks.filter((q) => q === p).length]))].map(([p, n]) => p.replace(id, '') + (n > 1 ? '×' + n : '')).join('+') || '—';
    out.push(`${id} L${L} ${lab}: ` + ms.map((m) => `${m} ${r(M[m](a, L))} → ${r(M[m](b, L))}`).join('; '));
  }
}
const D = 'frostDeep', F = 'frostFrequent';
const frostCases: [string, number, string[], string[]][] = [
  ['frost', 1, [], ['freeze', 'uptime']], ['frost', 2, [D], ['freeze', 'uptime']], ['frost', 2, [F], ['freeze', 'uptime']],
  ['frost', 3, x(D, 2), ['freeze', 'uptime']], ['frost', 3, [D, F], ['freeze', 'uptime']], ['frost', 3, x(F, 2), ['freeze', 'uptime']],
  ['frost', 4, x(D, 4), ['freeze', 'uptime']], ['frost', 4, [...x(D, 4), 'frostLong'], ['freeze', 'uptime']], ['frost', 4, [...x(D, 4), 'frostWide'], ['freeze', 'uptime']],
  ['frost', 4, [...x(D, 3), F, 'frostLong'], ['freeze', 'uptime']], ['frost', 4, [...x(D, 2), ...x(F, 2), 'frostLong'], ['freeze', 'uptime']], ['frost', 4, [...x(F, 4), 'frostLong'], ['freeze', 'uptime']], ['frost', 4, [...x(F, 4), 'frostWide'], ['freeze', 'uptime']],
];
block('Холод', 'frost', frostCases);
block('Холод, минимальный', 'frostMin', frostCases);
const B = 'vitaminBoost', Fa = 'vitaminFar';
const vitCases: [string, number, string[], string[]][] = [
  ['vitamin', 3, [B, Fa], ['aura']], ['vitamin', 4, [B, ...x(Fa, 3)], ['aura']], ['vitamin', 4, [B, ...x(Fa, 3), 'vitaminStrong'], ['aura']], ['vitamin', 4, [...x(B, 4), 'vitaminStrong'], ['aura']], ['vitamin', 4, [...x(Fa, 4)], ['aura']], ['vitamin', 4, [...x(Fa, 4), 'vitaminStrong'], ['aura']], ['vitamin', 4, [...x(Fa, 4), 'vitaminDouble'], ['aura']],
];
block('Витамин', 'vitamin', vitCases);
block('Витамин 0,55', 'vitamin55', vitCases);
const Q = 'antibioticQuick', Lo = 'antibioticLong';
block('Антибиотик', 'antibiotic', [
  ['antibiotic', 4, [...x(Lo, 4), 'antibioticStrong'], ['dot']], ['antibiotic', 4, [...x(Lo, 2), ...x(Q, 2), 'antibioticStrong'], ['dot']], ['antibiotic', 4, [...x(Q, 4), 'antibioticStrong'], ['dot']],
  ['antibiotic', 4, [...x(Lo, 4), 'antibioticSpread'], ['dot', 'dot2']], ['antibiotic', 4, [...x(Lo, 3), Q, 'antibioticSpread'], ['dot', 'dot2']], ['antibiotic', 4, [...x(Q, 4), 'antibioticSpread'], ['dot', 'dot2']],
]);
for (const p of ['extraHalf', 'extraZero']) block('Лишние цели в потолке', p, [
  ['pill', 4, x('pillRapid', 4), ['dps1']], ['pill', 4, [...x('pillRapid', 4), 'pillHunter'], ['dps1', 'dps2']], ['pill', 4, [...x('pillRapid', 4), 'pillDouble'], ['dps1', 'dps2']], ['pill', 4, ['pillRapid', ...x('pillPierce', 3), 'pillDouble'], ['dps1', 'dps2']], ['pill', 4, [...x('pillRapid', 2), ...x('pillPierce', 2), 'pillDouble'], ['dps1', 'dps2']],
  ['ampule', 4, x('ampuleRapid', 4), ['dps1']], ['ampule', 4, [...x('ampuleRapid', 4), 'ampuleTwin'], ['dps1', 'dps2']], ['ampule', 4, [...x('ampuleRapid', 4), 'ampuleMight'], ['dps1', 'dps2']],
]);
block('Потолок урона 3,0', 'dps3', [
  ['syringe', 4, [...x('syringeMore', 2), ...x('syringePierce', 2), 'syringeTwin'], ['beam1']], ['syringe', 4, [...x('syringeMore', 2), 'syringePierce'], ['beam1']], ['pill', 4, [...x('pillRapid', 3), 'pillPierce', 'pillHunter'], ['dps1']], ['lamp', 4, [...x('lampNarrow', 3), 'lampWide', 'lampBlaze'], ['dps1', 'cone']],
]);
block('Сироп', 'syrup', [['syrup', 2, ['syrupSticky'], ['slow', 'slowSec']], ['syrup', 3, x('syrupSticky', 2), ['slow', 'slowSec']], ['syrup', 4, [...x('syrupSticky', 4), 'syrupTwin'], ['slow', 'slowSec']], ['syrup', 4, [...x('syrupWide', 4), 'syrupTwin'], ['slow', 'slowSec']]]);
for (const p of ['lamp', 'lampPost']) block('Лампа', p, [['lamp', 2, ['lampWide'], ['cone']], ['lamp', 3, x('lampWide', 2), ['cone']], ['lamp', 3, ['lampNarrow', 'lampWide'], ['cone']], ['lamp', 3, ['lampWide', 'lampNarrow'], ['cone']], ['lamp', 4, x('lampWide', 4), ['cone']], ['lamp', 4, [...x('lampWide', 3), 'lampNarrow'], ['cone', 'dps1']]]);
block('Бронебойность', 'pierce', [['pill', 2, ['pillPierce'], ['dps1']], ['pill', 3, x('pillPierce', 2), ['dps1']], ['pill', 4, [...x('pillPierce', 4), 'pillHunter'], ['dps1']], ['ampule', 3, x('ampulePierce', 2), ['dps1']], ['ampule', 4, [...x('ampulePierce', 4), 'ampuleMight'], ['dps1']]]);
block('Доли копий', 'shares', [['pill', 4, x('pillRapid', 4), ['dps1']], ['fizz', 4, [...x('fizzFast', 4), 'fizzChain'], ['dps1']], ['frost', 4, [...x('frostFrequent', 4), 'frostWide'], ['freeze', 'uptime']]]);
const fs = await import('node:fs');
fs.writeFileSync(new URL('./out-proposals.txt', import.meta.url), out.join('\n') + '\n');
console.log(out.join('\n'));
