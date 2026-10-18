#!/usr/bin/env node
/**
 * Расчёты плана переработки баланса (docs/balance-rework-plan-2026-10-18.md). Чистый расчёт: игру, ботов и src/config.ts не трогает.
 * Запуск: node docs/balance-rework-model-2026-10-18.mjs
 *
 * Опирается на модель docs/meta-model-2026-10-18.mjs (ёмкость игрока C = C0 · P · L^(k−1); гибель на первой волне, где множитель прочности M(n) больше C).
 * Добавлено: общий множитель уровня `hf` (levels.hpFactor), начало роста `from` (growth.fromWave), квоты damageX по уровням, бонус рекорда ρ,
 * пересчёт запаса силы R при другой форме роста (та же оборона, другая прочность), лестница по кампании 2–10.
 */
import { LEVELS, NODES, damageX, dnaDeath, clone, spendGreedy } from './meta-model-2026-10-18.mjs';

const base2 = LEVELS[2];
/** Множитель прочности одной бактерии волны n: hf · (1 + per · max(0, n − from) + late · max(0, n − lateFrom)). */
export const Wf = (s, n) => (1 + s.per * Math.max(0, n - s.from) + s.late * Math.max(0, n - s.lateFrom)) * s.hf;
const deathF = (s, C) => { for (let n = 1; n <= 30; n++) if (Wf(s, n) > C) return n; return 31; };
const capOf = (s, n) => Math.sqrt(Wf(s, Math.max(1, n - 1)) * Wf(s, n));
const spec = (o) => ({ ...base2, hf: 1, ...o });
const fmt = (a) => (a[a.length - 1] === 'П' ? `${a[0]}→${a.length}` : `${a[0]}→>${a.length}`);
const f2 = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');

/** Квота уровней damageX по уровням 1…10 (meta.waveOpen): открывается ⌊квота · clamp((лучшая волна − 10) / 20)⌋ уровней. */
const QUOTA = [0, 0, 6, 4, 3, 3, 3, 3, 3, 3, 3];
const cumQuota = (N) => QUOTA.slice(0, N + 1).reduce((a, b) => a + b, 0);
const nodesAt = (N, best, dx) => {
  const opened = cumQuota(N - 1) + Math.floor(QUOTA[N] * Math.min(1, Math.max(0, (best - 10) / 20)));
  return { ...NODES, damageX: { ...damageX(dx, opened, 20, 5), req: ['damage', 5] } };
};

/** Лестница одного уровня: ёмкость C0 · P · L^(k−1); очки ДНК за гибель (+ бонус рекорда ρ), покупки жадно. st = { P, dna, lv, carry }. */
function playLevel(N, s, st, prof, { dx, rho = 0, dnaWin = 335, maxAttempts = 12 }) {
  const out = []; let best = 0;
  for (let k = 1; k <= maxAttempts; k++) {
    const cap = prof.C * st.P * Math.pow(prof.L, k - 1) * st.carry;
    const n = deathF(s, cap);
    if (n > 30) { out.push('П'); st.dna += dnaWin; break; }
    out.push(n);
    st.dna += dnaDeath(n) + (n > best ? rho * (dnaDeath(n) - (best ? dnaDeath(best) : 0)) : 0);
    best = Math.max(best, n);
    const r = spendGreedy(st.lv, st.dna, nodesAt(N, best, dx)); st.dna = r.dna; st.P *= r.gain;
  }
  const r = spendGreedy(st.lv, st.dna, nodesAt(N, 30, dx)); st.dna = r.dna; st.P *= r.gain;
  return out;
}

// Профили лестниц уровня 2: вход (узлы после победы на уровне 1), L — обучение, первая гибель на нынешней форме (серия на a87e24b: expert 21 и 20, zone 24 и 25)
const cur = spec({ late: 1.15 });
const PROFILES = {
  e1: { C: capOf(cur, 21), L: 1.35, lv: { damage: 9, pillPower: 3 } },
  e2: { C: capOf(cur, 20), L: 1.35, lv: { damage: 9, pillPower: 3 } },
  z1: { C: capOf(cur, 24), L: 1.1, lv: { damage: 10, pillPower: 6, pillRate: 8 } },
  z2: { C: capOf(cur, 25), L: 1.1, lv: { damage: 10, pillPower: 5, pillRate: 3 } },
};
/** Запас силы R эксперта по волнам (замер уровня 2, run 39150735470, четыре партии) и среднего профиля на волнах 1–8. */
const R_EXPERT = { 9: 4.22, 10: 3.84, 11: 3.53, 12: 3.63, 13: 3.26, 14: 3.45 };
const R_AVERAGE = { 1: 6.14, 2: 5.31, 3: 6.39, 4: 4.73, 5: 3.15, 6: 2.85, 7: 2.82, 8: 2.35 };

export function level2(s, { dx = 0.45, rho = 0 } = {}) {
  const res = {};
  for (const [k, p] of Object.entries(PROFILES)) {
    const st = { P: 1, dna: 0, lv: clone(p.lv), carry: 1 };
    res[k] = playLevel(2, s, st, p, { dx, rho });
  }
  const rexp = Math.max(...Object.entries(R_EXPERT).map(([n, r]) => (r * Wf(cur, +n)) / Wf(s, +n)));
  const ravg = Math.min(...Object.entries(R_AVERAGE).map(([n, r]) => (r * Wf(cur, +n)) / Wf(s, +n)));
  return { res, rexp, ravg };
}

if (process.argv[1] && process.argv[1].endsWith('balance-rework-model-2026-10-18.mjs')) {
  const variants = [
    ['0. Сейчас: hf 1, рост 0,08 с 8-й, поздний 1,15 с 16-й', spec({ late: 1.15 }), 0.45],
    ['А. Ступенька сильнее: hf 1,5, рост 0,2 с 8-й, поздний 1,6 с 16-й', spec({ hf: 1.5, per: 0.2, late: 1.6 }), 0.45],
    ['А′. То же при damageX +0,30', spec({ hf: 1.5, per: 0.2, late: 1.6 }), 0.3],
    ['В. Ступенька с 14-й: hf 1,5, рост 0,15 с 8-й, поздний 1,2 с 14-й', spec({ hf: 1.5, per: 0.15, late: 1.2, lateFrom: 14 }), 0.45],
    ['Б. Линейная (плавная): hf 1, рост 0,8 с 8-й, без позднего, damageX +0,45', spec({ per: 0.8, late: 0, lateFrom: 30 }), 0.45],
    ['Б′. Линейная при damageX +0,20', spec({ per: 0.8, late: 0, lateFrom: 30 }), 0.2],
  ];
  console.log('Уровень 2: вариант | M(16)→M(17) | M(20) | M(30) | R эксперта, наибольшее на волнах 9–14 | R среднего, наименьшее на волнах 1–8 | expert 1, expert 2, zone 1, zone 2 (первая гибель→номер попытки победы)');
  for (const [name, s, dx] of variants) {
    const { res, rexp, ravg } = level2(s, { dx });
    console.log(`${name} | ${f2(Wf(s, 16))}→${f2(Wf(s, 17))} | ${f2(Wf(s, 20))} | ${f2(Wf(s, 30))} | ${f2(rexp)} | ${f2(ravg)} | ${fmt(res.e1)}; ${fmt(res.e2)}; ${fmt(res.z1)}; ${fmt(res.z2)}`);
  }

  const A = spec({ hf: 1.5, per: 0.2, late: 1.6 });
  console.log('\nБонус рекорда ρ на варианте А (уровень 2):');
  for (const rho of [0, 1, 2]) {
    const { res } = level2(A, { rho });
    console.log(`ρ = ${rho}: ${fmt(res.e1)}; ${fmt(res.e2)}; ${fmt(res.z1)}; ${fmt(res.z2)}`);
  }

  // Кампания 2–10: общий множитель уровня подбирается так, чтобы первая гибель эксперта (профиль e1) пришлась на 18-ю волну
  console.log('\nКампания 2–10 (эксперт: первая гибель на 18-й; hpFactor подбирается; хвост — поздний рост уровней 3–10):');
  for (const [label, dx, tail] of [['damageX +0,45, хвост 0,8', 0.45, 0.8], ['damageX +0,30, хвост 0,8', 0.3, 0.8], ['damageX +0,45, хвост 1,6', 0.45, 1.6]]) {
    const st = { e: { P: 1, dna: 0, lv: clone(PROFILES.e1.lv), carry: 1 }, z: { P: 1, dna: 0, lv: clone(PROFILES.z1.lv), carry: 1 } };
    const rows = [];
    for (let N = 2; N <= 10; N++) {
      let s;
      if (N === 2) s = A;
      else {
        const cap1 = PROFILES.e1.C * st.e.P;
        let lo = 0.3, hi = 400;
        for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); const w = deathF(spec({ per: 0.2, late: tail, hf: mid }), cap1); if (w < 18) hi = mid; else lo = mid; }
        s = spec({ per: 0.2, late: tail, hf: lo });
      }
      const e = playLevel(N, s, st.e, PROFILES.e1, { dx }), z = playLevel(N, s, st.z, PROFILES.z1, { dx });
      rows.push(`${N}: hf ${f2(s.hf)} M(30)·hf ${Math.round(Wf(s, 30))} | expert ${fmt(e)} | zone ${fmt(z)}`);
    }
    console.log(label + '\n  ' + rows.join('\n  '));
  }
}
