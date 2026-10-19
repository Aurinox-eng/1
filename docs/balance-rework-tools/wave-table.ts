import './setup';
import { CONFIG } from '/home/user/wt-1018/src/config';
import { levelParams } from '/home/user/wt-1018/src/progress';
const out: any = {};
for (const level of [1, 2, 3, 4, 5, 6, 10]) {
  const p = levelParams(level);
  const rows: any[] = [];
  for (let w = 1; w <= p.total; w++) {
    const row = p.rows[w - 1] ?? {};
    const { perWave, fromWave, latePerWave, lateFromWave } = p.growth;
    const mul = CONFIG.waves.hpScale * p.hpFactor * (1 + perWave * Math.max(0, w - fromWave) + latePerWave * Math.max(0, w - lateFromWave));
    let hp = 0, n = 0, coinsBase = 0;
    for (const [kind, c] of Object.entries(row)) {
      const t = (CONFIG.types as any)[kind];
      hp += (c as number) * t.hp * mul;
      n += c as number;
      coinsBase += (c as number) * t.reward;
    }
    // награда: кривая уровня
    const pts = p.rewardCurve; let f = pts[pts.length - 1][1];
    if (w <= pts[0][0]) f = pts[0][1]; else for (let i = 1; i < pts.length; i++) { const [wb, fb] = pts[i]; if (w <= wb) { const [wa, fa] = pts[i - 1]; f = fa + ((fb - fa) * (w - wa)) / (wb - wa); break; } }
    rows.push({ w, n, hp: Math.round(hp), mul: +mul.toFixed(3), coins: +(coinsBase * CONFIG.economy.rewardMul * f).toFixed(1) });
  }
  out[level] = { total: p.total, growth: p.growth, hpFactor: p.hpFactor, rows };
}
console.log(JSON.stringify(out));
