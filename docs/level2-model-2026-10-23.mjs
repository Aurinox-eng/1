#!/usr/bin/env node
/**
 * Модель уровня 2 «Нос» (docs/level2-plan-2026-10-23.md). Чистый расчёт: игру, ботов и src/config.ts не меняет; дерево улучшений читает из src/config.ts (`meta.upgrades`).
 * Запуск (из корня проекта; вход эксперта — копии вложений лестницы уровня 1 в docs/ladder-state-L1-39679327696/lane<N>/state-out.json, другая папка — `--entry=<папка>`):
 *   node docs/level2-model-2026-10-23.mjs --check          прогон модели на уровне 1 для сравнения с лестницей (28 попыток на 3 дорожках)
 *   node docs/level2-model-2026-10-23.mjs --entry          сила эксперта на входе в уровень 2 по трём дорожкам лестницы
 *   node docs/level2-model-2026-10-23.mjs --variants       лестницы уровня 2 по вариантам целей A, B, C (раздел 4 плана)
 *   node docs/level2-model-2026-10-23.mjs --comp=<A|B|C>   состав волн 1–50 уровня 2 (раздел 2.6 плана)
 *   node docs/level2-model-2026-10-23.mjs --stops=<A|B|C>  волна, на которой неранимый вид отнимает все жизни (раздел 3 плана)
 *
 * Что берётся из модели уровня 1 (docs/redesign-model-2026-10-19.mjs): время волн, доход, ДНК за волны, «Лихорадка» на волнах боссов.
 * Что добавлено здесь:
 *  1. Дерево — все узлы `meta.upgrades` с действующими ценами (10 / 20 / 40 у Сиропа, Шипучки и Шприца), а не 27 узлов старой модели.
 *  2. Прирост узла (`cum`): урон ×(1 + шаг · доля башни · уровень); скорострельность и цена — через обратную величину паузы и цены; дальность — вдвое слабее; башни и ключевые узлы — числа старой модели.
 *     Доля башни в обороне эксперта — как в старой модели (`SHARE`).
 *  3. Калибровка по лестнице уровня 1: сила = A0 · (произведение приростов)^C. Произведение приростов узлов по п. 2 к началу победной попытки — ×6,9–8,6 по трём дорожкам (C = 1), а требуемая сила
 *     растёт от стены 12-й волны (1,32) к стене босса с «Лихорадкой» (4,71 / 1,2 = 3,9), то есть ×3,0, поэтому прирост берётся в степени C = 0,55, а сила первой попытки — A0 = 1,2
 *     (первая попытка гибнет на 12-й волне, где стена 1,32, а на 11-й требуется 1,05). Из перебора A0 = 1,1…1,3 и C = 0,45…0,6 взята пара, дающая 9 попыток, как у дорожек 2 и 3 лестницы
 *     (дорожка 1 — 10). Проверка — `--check`; поправка модели — ±1 попытка (раздел 1.3 плана).
 */
import fs from 'node:fs';
import * as M from './redesign-model-2026-10-19.mjs';

const { WAVES, MINI, BOSS, waveSec, startSec, coinsAt, dnaWaves, FEVER_BOSS, MINI_FIRST, BOSS_FIRST, WALLS_L1 } = M;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
/** Папка с копиями вложений `ladder-state-L1-lane<N>-b` запуска 39679327696 (срок хранения вложений на GitHub — до 20 ноября 2026). */
const ENTRY_DIR = new URL('./ladder-state-L1-39679327696', import.meta.url).pathname;
const ENTRY = args.entry && args.entry !== '1' ? args.entry : ENTRY_DIR;

// ---------------------------------------------------------------- дерево из src/config.ts
const src = fs.readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
const from = src.indexOf('upgrades: {', src.indexOf('meta: {'));
const to = src.indexOf('} as Record<string, UpgradeSpec>', from);
const body = src.slice(from + 'upgrades: {'.length, to).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
export const UP = new Function(`return {${body}}`)();

/** Доля башни в обороне эксперта (старая модель, docs/redesign-model-2026-10-19.mjs: pct(шаг, доля)). */
const SHARE = { pill: 0.5, syrup: 0.6, fizz: 0.3, syringe: 0.3, ampule: 0.2, antibiotic: 0.2, lamp: 0.08, vitamin: 1, frost: 0.25, patch: 0.1 };
/** Прирост от покупки башни и ключевого узла (старая модель; для Сиропа, Лампы, Витамина, Холода, Пластыря ключевого узла в ней нет — взято 1,05). */
const TOWER_GAIN = { syrup: 1.2, fizz: 1.2, syringe: 1.4, ampule: 1.12, lamp: 1.06, antibiotic: 1.1, vitamin: 1.1, frost: 1.07, patch: 1.05 };
const KEY_GAIN = { pill: 1.1, syrup: 1.1, fizz: 1.08, syringe: 1.07, ampule: 1.07, antibiotic: 1.06, lamp: 1.05, vitamin: 1.05, frost: 1.05, patch: 1.05 };
export let A0 = 1.2;
export const setCal = (a, c) => { A0 = a; C = c; };
export let C = 0.55;

const towerOf = (id) => { const m = id.match(/^(pill|syrup|fizz|syringe|ampule|antibiotic|lamp|vitamin|frost|patch)/); return m ? m[1] : null; };
/** Накопленный множитель силы от узла на уровне L (1 — узел не влияет на силу или не куплен). */
export function cum(id, L) {
  if (!L) return 1;
  const sp = UP[id];
  const t = towerOf(id);
  const s = t ? SHARE[t] : 1;
  switch (sp.effect) {
    case 'damage': return 1 + sp.perLevel * L;
    case 'towerDamage': return 1 + sp.perLevel * s * L;
    case 'puddleSec': return 1 + sp.perLevel * s * L;
    case 'cooldown': return 1 + s * (1 / (1 + sp.perLevel * L) - 1);
    case 'price': return 1 + s * (1 / (1 + sp.perLevel * L) - 1);
    case 'range': return 1 + s * 0.5 * Math.abs(sp.perLevel) * L;
    case 'beamWidth': return 1 + s * 0.5 * 0.03 * L;
    case 'auraBoost': return 1 + Math.abs(sp.perLevel) * s * L;
    case 'freezeTime': return 1 + sp.perLevel * s * L;
    case 'key': return KEY_GAIN[t] ?? 1;
    case 'tower': return TOWER_GAIN[t.replace('tower', '')] ?? 1;
    case 'reward': return 1 + 0.03 * L;
    case 'waveCoins': return 1 + 0.015 * L;
    case 'coins': return 1 + 0.014 * L; // +25 монет на старте: ≈ +1,4 % к монетам первой трети попытки
    default: return 1; // жизни, щит, возврат при продаже, «Автостарт»: на силу не влияют
  }
}
const towerName = (id) => (id.startsWith('tower') ? id.slice(5).toLowerCase() : null);
function cumNode(id, L) {
  if (UP[id].effect === 'tower') return TOWER_GAIN[towerName(id)] ?? 1;
  return cum(id, L);
}
export const marginal = (id, l) => cumNode(id, l) / cumNode(id, l - 1);
const isBig = (id) => ['tower', 'fever', 'key'].includes(UP[id].effect);

/** Сила состояния дерева (до калибровки): произведение накопленных приростов; «Лихорадка» — отдельный признак. */
export function rawPower(lv) {
  let p = 1;
  for (const [id, L] of Object.entries(lv)) if (UP[id] && L) p *= cumNode(id, L);
  return p;
}
export const calPower = (raw) => A0 * Math.pow(raw, C);
const canBuy = (lv, id) => {
  const sp = UP[id];
  if ((lv[id] ?? 0) >= sp.prices.length) return false;
  if (sp.requires && (lv[sp.requires[0]] ?? 0) < sp.requires[1]) return false;
  return true;
};
/** Покупка на всё ДНК: крупные узлы (башни, умения, ключевые) первыми, затем наибольший прирост на очко ДНК (порядок покупок эксперта, документ дизайна, п. 10.1). */
export function spend(lv, dna) {
  const bought = [];
  for (;;) {
    const opts = Object.keys(UP).filter((id) => canBuy(lv, id) && UP[id].prices[lv[id] ?? 0] <= dna);
    if (!opts.length) break;
    const big = opts.filter(isBig);
    const pool = big.length ? big : opts;
    const score = (id) => Math.log(marginal(id, (lv[id] ?? 0) + 1)) / UP[id].prices[lv[id] ?? 0];
    pool.sort((a, b) => score(b) - score(a));
    const id = pool[0];
    if (score(id) <= 0 && !isBig(id)) break;
    dna -= UP[id].prices[lv[id] ?? 0];
    lv[id] = (lv[id] ?? 0) + 1;
    bought.push(id);
  }
  return { bought, dna };
}
/** Стоимость ближайшей непокупной башни или умения (для строки «не хватает N ДНК»). */
export function nextBig(lv) {
  return Object.keys(UP).filter((id) => isBig(id) && UP[id].effect !== 'key' && canBuy(lv, id)).map((id) => [id, UP[id].prices[lv[id] ?? 0]]).sort((a, b) => a[1] - b[1])[0];
}

// ---------------------------------------------------------------- спрос уровня и лестница
/** Монетное преимущество игрока над опорным (стартовые монеты и доход за узлы дерева). */
function coinRatio(n, lv) {
  const extraStart = (UP.coins ? UP.coins.perLevel : 25) * (lv.coins ?? 0);
  const rewardMul = 1 + (UP.reward ? UP.reward.perLevel : 0.04) * (lv.reward ?? 0);
  return coinsAt(n, extraStart, rewardMul) / coinsAt(n);
}
/** Волна гибели: первая, где спрос demand(n) больше силы игрока (с «Лихорадкой» на волнах боссов); WAVES + 1 — победа. */
export function deathWave(demand, lv) {
  const power = calPower(rawPower(lv));
  for (let n = 1; n <= WAVES; n++) {
    const fever = lv.fever && (MINI.includes(n) || n === BOSS) ? FEVER_BOSS : 1;
    if (demand(n) > power * coinRatio(n, lv) * fever) return n;
  }
  return WAVES + 1;
}
/** Лестница: попытка → гибель → ДНК → покупки. `level` — номер уровня для множителя ДНК. */
export function ladder({ demand, level, start, maxAttempts = 40, dnaMul = 1, dnaMulWin = 1 }) {
  const lv = { ...(start?.lv ?? {}) };
  let dna = start?.dna ?? 0;
  const firsts = new Set();
  const rows = [];
  let minutes = 0;
  if (dna > 0) spend(lv, dna), (dna = spend(lv, dna).dna);
  for (let a = 1; a <= maxAttempts; a++) {
    const n = deathWave(demand, lv);
    const won = n > WAVES;
    const k = won ? WAVES : n - 1;
    let gain = dnaWaves(k, level);
    for (const m of MINI) if (k >= m && !firsts.has(m)) { firsts.add(m); gain += MINI_FIRST; }
    if (won) gain += BOSS_FIRST;
    gain = Math.round(gain * (won ? dnaMulWin : dnaMul)); // реклама за ДНК (план этапа 9): множитель ДНК за любую попытку или только за победную
    const sec = won ? startSec(WAVES) + waveSec(WAVES) : startSec(n) + waveSec(n) * 0.6;
    minutes += sec / 60;
    const power = calPower(rawPower(lv));
    dna += gain;
    const r = won ? { bought: [], dna } : spend(lv, dna);
    dna = r.dna;
    const nb = nextBig(lv);
    rows.push({ attempt: a, wave: won ? 'П' : n, dna: gain, minutes: +(sec / 60).toFixed(1), total: Math.round(minutes), power: +power.toFixed(2), bought: r.bought, left: dna, nextBig: nb ? `${nb[0]} — не хватает ${Math.max(0, nb[1] - dna)}` : '—' });
    if (won) break;
  }
  return { rows, lv, dna };
}

// ---------------------------------------------------------------- уровень 1: проверка модели на лестнице
/** Спрос уровня 1 — ступени-стены старой модели (WALLS_L1): на стене — её высота, между стенами 0,8 высоты следующей (функция `preq` старой модели). */
export const demandL1 = (n) => M.preq(1, n);

if (import.meta.url === `file://${process.argv[1]}` && args.check) {
  const r = ladder({ demand: demandL1, level: 1 });
  console.log('Уровень 1, модель с калибровкой A0 =', A0, ', C =', C);
  for (const row of r.rows) console.log(`${row.attempt}. волна ${row.wave} · сила ${row.power} · ДНК +${row.dna} · ${row.bought.join(', ') || '—'}`);
  console.log('Лестница уровня 1 (дорожка 2, запуск 39679327696): 12 → 12 → 25 → 36 → 37 → 37 → 38 → 42 → П; дорожки 1 и 3: 10 и 9 попыток.');
}

// ---------------------------------------------------------------- вход в уровень 2: дерево эксперта после лестницы уровня 1
/** Читает вложения `ladder-state-L1-lane<N>` (state-out.json в папке <dir>/lane<N>/): дерево после победы и покупок за ДНК победной попытки, остаток ДНК,
 *  дерево на входе в победную попытку (покупки всех попыток, кроме последней), волны гибели и ДНК по попыткам. */
export function readLane(dir, lane) {
  const s = JSON.parse(fs.readFileSync(`${dir}/lane${lane}/state-out.json`, 'utf8'));
  const l = Object.values(s.lanes)[0];
  const pl = l.perLevel[0];
  const before = {};
  for (const list of pl.bought.slice(0, -1)) for (const k of list) before[k] = (before[k] ?? 0) + 1;
  return { lane, dna: l.dna, after: pl.levelsOut, before, waves: pl.waves, dnaGained: pl.dnaGained, bought: pl.bought };
}
const ownedNodes = (lv) => Object.entries(lv).filter(([, v]) => v > 0).reduce((s, [id, v]) => s + UP[id].prices.slice(0, v).reduce((a, b) => a + b, 0), 0);

if (import.meta.url === `file://${process.argv[1]}` && args.entry) {
  for (const lane of [1, 2, 3]) {
    const r = readLane(ENTRY, lane);
    const pBefore = calPower(rawPower(r.before));
    const pAfter = calPower(rawPower(r.after));
    console.log(`дорожка ${lane}: попыток ${r.waves.length}, ДНК за уровень ${r.dnaGained.reduce((a, b) => a + b, 0)}, остаток ${r.dna}, вложено в узлы ${ownedNodes(r.after)}; сила на входе в победную попытку ${pBefore.toFixed(2)}, после покупок за её ДНК ${pAfter.toFixed(2)}`);
  }
}

// ---------------------------------------------------------------- спрос уровня 2: ступени
/** Волны-стены уровня 2: пачки-стены, мини-боссы (10, 20, 30, 40) и босс (50). */
export const WALLS_L2 = [5, 9, 10, 13, 16, 19, 20, 23, 26, 29, 30, 33, 36, 39, 40, 43, 46, 48, 50];
/** Спрос уровня 2: на волне-стене — её высота H[i], между стенами 0,8 высоты следующей (как в `preq` модели уровня 1). Высоты от стены `w1` — геометрический ряд: стена `w1` чуть выше силы эксперта
 *  на входе (она убивает в первой попытке), последняя (босс) — в `ratio` раз выше силы эксперта на входе. До `w1` спрос растёт от `START_SHARE` силы эксперта на 1-й волне до стены `w1` (геометрически по номеру волны). */
export const START_SHARE = 0.3;
export function makeDemandL2({ w1, ratio, entryLv }) {
  const idx = WALLS_L2.indexOf(w1);
  const power = calPower(rawPower(entryLv));
  const base = power * coinRatio(w1, entryLv) * 1.02 / (MINI.includes(w1) ? (entryLv.fever ? FEVER_BOSS : 1) : 1);
  const top = power * ratio;
  const steps = WALLS_L2.length - 1 - idx;
  const rho = steps > 0 ? Math.pow(top / base, 1 / steps) : 1;
  const d1 = power * START_SHARE;
  const H = WALLS_L2.map((w, i) => (i >= idx ? base * Math.pow(rho, i - idx) : d1 * Math.pow(base / d1, (w - 1) / (w1 - 1))));
  const f = (n) => { const i = WALLS_L2.indexOf(n); if (i >= 0) return H[i]; const j = WALLS_L2.findIndex((w) => w > n); return 0.8 * H[j]; };
  f.H = H; f.rho = rho;
  return f;
}

// ---------------------------------------------------------------- состав волн уровня 2
/** Виды уровня 2: прочность (до множителя волны), волна первого выхода, пачка (рой — по 12), вес в числе бактерий обычной волны (как `MIX` модели уровня 1; у новых видов — по смыслу). */
export const TYPES_L2 = {
  coccus: { name: 'кокк', hp: 3, from: 1, weight: 4 },
  rod: { name: 'палочка', hp: 10, from: 2, weight: 2 },
  swarm: { name: 'рой', hp: 1, from: 4, weight: 3, pack: 12 },
  runner: { name: 'бегун', hp: 5, from: 6, weight: 1.5 },
  spore: { name: 'спора', hp: 3, from: 8, weight: 1 },
  splitter: { name: 'делящаяся', hp: 8, from: 11, weight: 1 },
  healer: { name: 'лекарь', hp: 8, from: 12, weight: 0.5 },
  armored: { name: 'бронированная', hp: 30, from: 15, weight: 0.4 },
  leaper: { name: 'прыгун', hp: 6, from: 18, weight: 0.8 },
  slick: { name: 'слизень', hp: 16, from: 28, weight: 0.6 },
};
/** Новые для игрока виды уровня 2 (по таблице 3 документа дизайна): перед их первым выходом пауза +6 с и уведомление. */
export const NEW_KINDS_L2 = ['spore', 'healer', 'leaper'];
/** Вид пачки-стены на волне. */
export const WALL_TYPE_L2 = { 5: 'rod', 9: 'runner', 13: 'splitter', 16: 'spore', 19: 'armored', 23: 'healer', 26: 'leaper', 29: 'splitter', 33: 'slick', 36: 'armored', 39: 'rod', 43: 'healer', 46: 'runner', 48: 'leaper' };
export const BOSS_NAME_L2 = { 10: 'Споровик', 20: 'Знахарь', 30: 'Скакун', 40: 'Мать спор', 50: 'Королева спор' };
/** Доля прочности волны у мини-боссов и босса — как у окончательных чисел уровня 1 (Колония 169 из 481, Вожак 200 из 2 099, Броненосец 1 530 из 7 331, Матка 6 891 из 17 077, Гигантская колония 4 000 из 32 379). */
export const BOSS_SHARE_L2 = { 10: 169 / 481, 20: 200 / 2099, 30: 1530 / 7331, 40: 6891 / 17077, 50: 4000 / 32379 };
/** Множитель прочности одной бактерии на волне n — форма уровня 1 (`plan.hpFlatUntil` 8, `hpExp` 1,75, с 30-й `hpLateExp` 1,0). */
export const hpMul = (n) => (n <= 8 ? 1 : n <= 30 ? Math.pow(n / 8, 1.75) : Math.pow(30 / 8, 1.75) * (n / 30));
const E0 = M.E0;

/** Состав волны n при заданном спросе и `hpScale`: что выходит, сколько в стене, прочность босса, сумма прочности. */
export function compositionL2(n, demand, hpScale) {
  const M_ = hpMul(n) * hpScale;
  const total = demand(n) * E0 * coinsAt(n) * waveSec(n); // прочность волны, HP
  const boss = BOSS_NAME_L2[n];
  const wallType = WALL_TYPE_L2[n];
  const regular = boss ? total * (1 - BOSS_SHARE_L2[n]) : wallType ? total * 0.8 : total;
  const avail = Object.entries(TYPES_L2).filter(([, t]) => t.from <= n);
  const wsum = avail.reduce((s, [, t]) => s + t.weight, 0);
  const avgHp = avail.reduce((s, [, t]) => s + (t.weight / wsum) * t.hp, 0);
  const count = regular / (M_ * avgHp);
  const mix = {};
  for (const [id, t] of avail) {
    let c = Math.round((count * t.weight) / wsum);
    if (t.pack) c = Math.max(t.pack, Math.round(c / t.pack) * t.pack);
    if (id === 'coccus') c = Math.max(1, c);
    if (c > 0) mix[id] = c;
  }
  const pack = wallType && !boss ? [wallType, Math.max(1, Math.round((total - regular) / (M_ * TYPES_L2[wallType].hp)))] : null;
  const bossHp = boss ? Math.round(total * BOSS_SHARE_L2[n]) : 0;
  const mixHp = Object.entries(mix).reduce((s, [id, c]) => s + c * TYPES_L2[id].hp * M_, 0);
  const packHp = pack ? pack[1] * TYPES_L2[pack[0]].hp * M_ : 0;
  const number = Object.values(mix).reduce((a, b) => a + b, 0) + (pack ? pack[1] : 0) + (boss ? 1 : 0);
  return { n, boss, bossHp, mix, pack, number, hp: Math.round(mixHp + packHp + bossHp), mul: hpMul(n) * hpScale };
}
/** Минута начала волны n при ×1 в первой попытке: время по модели уровня 1 + 6 с перед первым выходом каждого из новых видов. */
export const startMinL2 = (n) => (startSec(n) + 6 * NEW_KINDS_L2.filter((k) => TYPES_L2[k].from <= n).length) / 60;
/** `plan.hpScale` уровня 2 при данном спросе: наименьшее значение с шагом 0,1, при котором в последней волне не больше 300 бактерий (на уровне 1 — 296); число бактерий в волнах 1–49 при этом не больше, чем на уровне 1.
 *  Прочность одной бактерии на волне n — `hpMul(n)` · hpScale · прочность вида. */
export function hpScaleFor(demand) {
  for (let hs = 1; hs < 20; hs += 0.1) if (compositionL2(WAVES, demand, hs).number <= 300) return Math.round(hs * 10) / 10;
  return 20;
}

// ---------------------------------------------------------------- варианты целей по попыткам (раздел 4 плана)
/** Три варианта: первая гибель эксперта на 19-й волне (на уровне 1 — на 12-й; к 19-й игрок видит все три новых вида и первого мини-босса), стена босса в `ratio` раз выше силы эксперта на входе. Вход — дорожка 2 лестницы уровня 1. */
export const VARIANTS = {
  A: { w1: 19, ratio: 1.5, label: '5 попыток (число модели документа дизайна, п. 6.3)' },
  B: { w1: 19, ratio: 1.8, label: '7 попыток' },
  C: { w1: 19, ratio: 2.0, label: '9 попыток (как уровень 1)' },
};
const NAMES = {
  towerSyrup: 'Сироп', towerFizz: 'Шипучка', towerSyringe: 'Шприц', towerAmpule: 'Ампула', towerAntibiotic: 'Антибиотик', towerLamp: 'Лампа', towerVitamin: 'Витамин', towerFrost: 'Холод', towerPatch: 'Пластырь',
  fever: '«Лихорадка»', pillKey: '«Рикошет»', syrupKey: '«Разлив»', fizzKey: '«Осколки»', syringeKey: '«Сквозной разряд»', ampuleKey: '«Разрыв»', antibioticKey: '«Эпидемия»', lampKey: '«Прожектор»', vitaminKey: '«Иммунитет»', frostKey: '«Хрупкость»', patchKey: '«Капкан»',
};
/** Краткая запись покупок попытки: крупные узлы по названию, остальные — числом. */
export function boughtText(list) {
  const big = list.filter((id) => NAMES[id]).map((id) => NAMES[id]);
  const rest = list.length - big.length;
  return [...big, rest > 0 ? `узлов улучшений: ${rest}` : null].filter(Boolean).join(', ') || '—';
}
export function runVariant(key, lane) {
  const v = VARIANTS[key];
  const lanes = [1, 2, 3].map((l) => readLane(ENTRY, l));
  const ent = lanes[1];
  const demand = makeDemandL2({ w1: v.w1, ratio: v.ratio, entryLv: ent.after });
  const res = lanes.map((l) => ladder({ demand, level: 2, start: { lv: { ...l.after }, dna: l.dna } }));
  return { v, demand, lanes, res, main: res[lane - 1] };
}
if (import.meta.url === `file://${process.argv[1]}` && args.variants) {
  for (const key of Object.keys(VARIANTS)) {
    const { v, demand, res, main } = runVariant(key, 2);
    const total = main.rows.reduce((s, r) => s + r.dna, 0);
    console.log(`\n### Вариант ${key}: ${v.label}; стена ${v.w1}-й волны ${demand.H[WALLS_L2.indexOf(v.w1)].toFixed(2)}, босс ${demand.H.at(-1).toFixed(2)}, шаг ряда ×${demand.rho.toFixed(3)}; попыток по дорожкам 1 / 2 / 3: ${res.map((r) => r.rows.length).join(' / ')}`);
    console.log('| Попытка | Волна гибели | Сила | ДНК за попытку | Минут (нарастающим итогом) | Куплено после попытки |\n|---|---|---|---|---|---|');
    for (const r of main.rows) console.log(`| ${r.attempt} | ${r.wave} | ${r.power} | ${r.dna} | ${r.minutes} (${r.total}) | ${boughtText(r.bought)} |`);
    console.log(`ДНК за уровень ${total}; минут ${main.rows.at(-1).total}; дорожки 1 / 3: волны ${res[0].rows.map((r) => r.wave).join(' ')} / ${res[2].rows.map((r) => r.wave).join(' ')}`);
  }
}
if (import.meta.url === `file://${process.argv[1]}` && args.comp) {
  const { demand } = runVariant(args.comp, 2);
  const hs = hpScaleFor(demand);
  console.log(`hpScale ${hs}`);
  for (let n = 1; n <= WAVES; n++) {
    const c = compositionL2(n, demand, hs);
    const mix = Object.entries(c.mix).map(([id, k]) => `${TYPES_L2[id].name} ${k}`).join(', ');
    const head = c.boss ? `**${c.boss}** (${c.bossHp} HP) + ` : c.pack ? `**стена: ${TYPES_L2[c.pack[0]].name} ×${c.pack[1]} пачкой** + ` : '';
    console.log(`| ${n} | ${head}${mix} | ${c.number} | ${c.mul.toFixed(2)} | ${c.hp} | ${startMinL2(n).toFixed(1)} |`);
  }
  console.log('Уровень целиком, мин:', ((startSec(WAVES) + waveSec(WAVES) + 18) / 60).toFixed(1));
}

/** Волна, на которой вид, не получающий урона (жёсткое свойство), отнимает все жизни: накопленные утечки этого вида по волнам состава (жизней на старте партии — `lives`). */
export function stopWave(kind, lifeDamage, demand, lives = 20) {
  let sum = 0;
  for (let n = 1; n <= WAVES; n++) {
    const c = compositionL2(n, demand, hpScaleFor(demand));
    const k = (c.mix[kind] ?? 0) + (c.pack && c.pack[0] === kind ? c.pack[1] : 0);
    sum += k * lifeDamage;
    if (sum >= lives) return n;
  }
  return null;
}
if (import.meta.url === `file://${process.argv[1]}` && args.stops) {
  const { demand } = runVariant(args.stops, 2);
  for (const [kind, dmg] of [['runner', 1], ['armored', 2], ['slick', 1]]) console.log(kind, 'жизни кончаются на волне', stopWave(kind, dmg, demand));
}
