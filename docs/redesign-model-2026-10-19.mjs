#!/usr/bin/env node
/**
 * Модель переработки (docs/redesign-2026-10-19.md). Чистый расчёт: игру, ботов и src/config.ts не трогает.
 * Запуск: node docs/redesign-model-2026-10-19.mjs [--level=1|2|3] [--profile=expert|zone|strong|average] [--json]
 *
 * Сила игрока P — во сколько раз урон обороны больше, чем у «опорного» игрока (только Таблетки, без улучшений вне партии)
 * при тех же монетах. Опорный игрок — профиль бота expert с одними Таблетками: e0 урона в секунду на монету.
 * e0 откалиброван по первой попытке уровня 1 на нынешней игре (код e656e3b): expert с Таблетками и Сиропом гибнет на 11–15-й волне
 * при 1 454 монетах к 13-й и прочности волны 1 509 за 47 с → 0,022 урона/с на монету; без Сиропа ÷ 1,3 → 0,017.
 * Остальные профили — тот же расчёт по их первой гибели (average 6–7-я → 0,0082; strong 7–9-я → 0,0096; zone 14–15-я → 0,0286), делённый на 1,3.
 *
 * Волна n требует урона Req(n) = прочность волны ÷ время волны. Гибель — на первой волне, где Req(n) > e0 · Монеты(n) · P.
 * Прочность волн задаётся через Preq(n) — силу, нужную опорному игроку (ступени-стены, раздел 2 документа): HP(n) = Preq(n) · e0 · Монеты₀(n) · T(n).
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));

// ---------------------------------------------------------------- время (раздел 8 документа)
export const WAVES = 50;
export const MINI = [10, 20, 30, 40];
export const BOSS = 50;
export const PAUSE = 4; // с, от выхода последней бактерии (как сейчас, было 6)
/** Длительность выхода волны n, с (×1). */
export const spawnSec = (n) => (n === BOSS ? 75 : Math.min(30, 8 + 0.6 * n) + (MINI.includes(n) ? 15 : 0));
export const waveSec = (n) => spawnSec(n) + PAUSE;
export const FIRST_WAVE_DELAY = 8;
/** Время от старта до начала волны n, с. */
export const startSec = (n) => { let t = FIRST_WAVE_DELAY; for (let i = 1; i < n; i++) t += waveSec(i); return t; };

// ---------------------------------------------------------------- экономика партии
export const START_COINS = 200; // было 450
/** Доход за волну n (вся волна убита), монет; делится поровну между бактериями волны (дефляция: число бактерий доход не меняет). */
export const waveIncome = (n) => 25 + 7 * n + (MINI.includes(n) ? 60 : 0);
export const coinsAt = (n, extraStart = 0, rewardMul = 1) => { let c = START_COINS + extraStart; for (let i = 1; i < n; i++) c += waveIncome(i) * rewardMul; return c; };

// ---------------------------------------------------------------- ступени-стены уровня 1 (Preq опорного игрока)
/** Волны-стены: [волна, Preq]. Между стенами Preq = 0,8 · следующей стены (облегчение после прорыва). */
export const WALLS_L1 = [
  [4, 0.25], [6, 0.38], [8, 1.05], [10, 1.2], [12, 1.32], [15, 1.47], [18, 1.62], [20, 1.78], [23, 1.95], [26, 2.12],
  [30, 2.32], [33, 2.48], [36, 2.66], [40, 2.88], [43, 3.04], [46, 3.22], [48, 3.36], [50, 3.55],
];
/** Уровни 2–3: та же форма, сдвиг и растяжение (раздел 5 документа): Preq_L(n) = λ_L · Preq_1(n)^γ_L. */
export const LEVEL_SHAPE = { 1: { lambda: 1, gamma: 1 }, 2: { lambda: 3.2, gamma: 0.72 }, 3: { lambda: 5.5, gamma: 0.72 } };
export function preq(level, n) {
  const walls = WALLS_L1;
  let v;
  const w = walls.find(([wn]) => wn === n);
  if (w) v = w[1];
  else {
    const next = walls.find(([wn]) => wn > n);
    v = n < 4 ? 0.12 + 0.04 * n : 0.8 * next[1];
  }
  const { lambda, gamma } = LEVEL_SHAPE[level];
  return lambda * Math.pow(v, gamma);
}

// ---------------------------------------------------------------- профили (e — урон/с на монету при одних Таблетках)
export const PROFILES = { expert: 0.017, zone: 0.022, human: 0.0115, strong: 0.0074, average: 0.0063 };
export const E0 = PROFILES.expert;

// ---------------------------------------------------------------- древо (раздел 4 документа): только узлы, которые дают силу или монеты
/** gain(l) — множитель P от покупки l-го уровня; share — доля урона башни в обороне (для веток башен). */
const pct = (step, share = 1) => (l) => (1 + step * share * l) / (1 + step * share * (l - 1));
export const TREE = {
  syrup: { name: 'Сироп', prices: [25], gain: () => 1.2, big: true },
  fizz: { name: 'Шипучка', prices: [80], gain: () => 1.2, big: true, req: ['syrup', 1] },
  syringe: { name: 'Шприц', prices: [220], gain: () => 1.15, big: true, req: ['fizz', 1] },
  fever: { name: '«Лихорадка»', prices: [150], gain: () => 1.06, big: true, req: ['fizz', 1] },
  damage: { name: 'Сильное вещество (+4 %)', prices: [8, 10, 12, 14, 16, 18, 21, 24, 27, 30, 34, 38, 42, 46, 50, 55, 60, 66, 72, 80, 88, 96, 105, 115, 125], gain: pct(0.04) },
  coins: { name: 'Питательная среда (+25 монет)', prices: [10, 14, 18, 24, 30, 40], coins: 25, req: ['damage', 1] },
  pillPower: { name: 'Сила таблетки (+8 %)', prices: [10, 14, 18, 24, 32], gain: pct(0.08, 0.5), req: ['damage', 2] },
  pillRicochet: { name: 'Таблетка: «Рикошет»', prices: [110], gain: () => 1.1, big: true, req: ['pillPower', 3] },
  fizzPower: { name: 'Сила шипучки (+8 %)', prices: [14, 18, 24, 32, 42], gain: pct(0.08, 0.3), req: ['fizz', 1] },
  fizzShards: { name: 'Шипучка: «Осколки»', prices: [160], gain: () => 1.08, big: true, req: ['fizzPower', 3] },
  syrupTime: { name: 'Густая смесь (лужа +8 %)', prices: [12, 16, 22, 30], gain: pct(0.05, 0.6), req: ['syrup', 1] },
  syringePower: { name: 'Сила шприца (+8 %)', prices: [30, 40, 52, 66, 82], gain: pct(0.08, 0.3), req: ['syringe', 1] },
  ampule: { name: 'Ампула', prices: [320], gain: () => 1.12, big: true, req: ['syringe', 1] },
  lamp: { name: 'Лампа', prices: [380], gain: () => 1.06, big: true, req: ['syringe', 1] },
  antibodies: { name: '«Антитела»', prices: [450], gain: () => 1.06, big: true, req: ['fever', 1] },
  antibiotic: { name: 'Антибиотик', prices: [480], gain: () => 1.1, big: true, req: ['ampule', 1] },
  ampuleKey: { name: 'Ампула: «Разрыв»', prices: [420], gain: () => 1.07, big: true, req: ['ampule', 1] },
  vitamin: { name: 'Витамин', prices: [700], gain: () => 1.1, big: true, req: ['antibiotic', 1] },
  frost: { name: 'Холод', prices: [800], gain: () => 1.07, big: true, req: ['vitamin', 1] },
  patch: { name: 'Пластырь', prices: [900], gain: () => 1.05, big: true, req: ['frost', 1] },
  ampulePower: { name: 'Сила ампулы (+8 %)', prices: [40, 52, 66, 82, 100], gain: pct(0.08, 0.2), req: ['ampule', 1] },
  antibioticPower: { name: 'Сила антибиотика (+8 %)', prices: [50, 64, 80, 98, 120], gain: pct(0.08, 0.2), req: ['antibiotic', 1] },
  antibioticKey: { name: 'Антибиотик: «Эпидемия»', prices: [520], gain: () => 1.06, big: true, req: ['antibioticPower', 3] },
  lampPower: { name: 'Сила света (+8 %)', prices: [40, 52, 66, 82, 100], gain: pct(0.08, 0.08), req: ['lamp', 1] },
  vitaminPower: { name: 'Сила витаминов (аура +2 п. п.)', prices: [70, 90, 115, 145, 180], gain: pct(0.02, 1), req: ['vitamin', 1] },
  frostPower: { name: 'Сила холода (+6 %)', prices: [80, 100, 125, 155, 190], gain: pct(0.06, 0.25), req: ['frost', 1] },
  syringeKey: { name: 'Шприц: «Сквозной разряд»', prices: [360], gain: () => 1.07, big: true, req: ['syringePower', 3] },
};
export const DAMAGE_CAP_L1 = 1 + 0.04 * 25; // общий множитель урона на уровне 1 не выше ×2,0 (весь узел «Сильное вещество»)

// ---------------------------------------------------------------- ДНК (раздел 6 документа)
/** ДНК за волну n: 2 + 0,2·n; за k пройденных волн — 2k + 0,1·k(k+1). Уровень L умножает на lvlMul. */
export const LVL_DNA = { 1: 1, 2: 1.6, 3: 2.4 };
export const dnaWaves = (k, level = 1) => Math.round((2 * k + 0.1 * k * (k + 1)) * LVL_DNA[level]);
export const DNA_FLOOR = 12; // не меньше 12 ДНК за попытку: следующая мелкая покупка — после каждой попытки
export const MINI_FIRST = 30; // за первую победу над каждым мини-боссом уровня
export const BOSS_FIRST = 150; // за первую победу над боссом уровня
export const FLAWLESS = 0.25; // без потери жизней: +25 % ДНК за волны (один раз на уровень)

// ---------------------------------------------------------------- партия и лестница
export function deathWave(level, state, e) {
  for (let n = 1; n <= WAVES; n++) {
    const coinsPlayer = coinsAt(n, state.extraStart ?? 0);
    const coinsBase = coinsAt(n);
    const req = preq(level, n) * E0 * coinsBase; // урон/с, нужный на волне n
    const have = e * coinsPlayer * state.P;
    if (req > have) return n;
  }
  return WAVES + 1; // победа
}
const canBuy = (lv, id) => {
  const nd = TREE[id];
  if ((lv[id] ?? 0) >= nd.prices.length) return false;
  if (nd.req && (lv[nd.req[0]] ?? 0) < nd.req[1]) return false;
  return true;
};
function value(lv, id, state) {
  const nd = TREE[id];
  const l = (lv[id] ?? 0) + 1;
  if (nd.coins) return 1 + (nd.coins / coinsAt(15)) * 0.6; // монеты на старте: заметны в начале попытки
  return nd.gain(l);
}
/** Покупка: сначала крупные узлы (башни, умения, ключевые узлы), если хватает; затем жадно по приросту силы на очко ДНК. */
export function spend(lv, state) {
  const bought = [];
  for (;;) {
    const opts = Object.keys(TREE).filter((id) => canBuy(lv, id) && TREE[id].prices[lv[id] ?? 0] <= state.dna);
    if (!opts.length) break;
    const big = opts.filter((id) => TREE[id].big);
    const pickFrom = big.length ? big : opts;
    pickFrom.sort((a, b) => (Math.log(value(lv, b, state)) / TREE[b].prices[lv[b] ?? 0]) - (Math.log(value(lv, a, state)) / TREE[a].prices[lv[a] ?? 0]));
    const id = pickFrom[0];
    const price = TREE[id].prices[lv[id] ?? 0];
    // крупный узел, на который не хватает: копить, если до него не больше одной попытки (раздел 4.3 документа)
    state.dna -= price;
    lv[id] = (lv[id] ?? 0) + 1;
    if (TREE[id].coins) state.extraStart = (state.extraStart ?? 0) + TREE[id].coins;
    else state.P *= TREE[id].gain(lv[id]);
    bought.push(TREE[id].name);
  }
  return bought;
}
/** Стоимость следующего крупного узла, который ещё не куплен (для строки «до ... не хватает N ДНК»). */
const nextBig = (lv) => Object.keys(TREE).filter((id) => TREE[id].big && canBuy(lv, id)).map((id) => [TREE[id].name, TREE[id].prices[lv[id] ?? 0]]).sort((a, b) => a[1] - b[1])[0];

export function ladder({ level = 1, profile = 'expert', learn = 1.03, learnCap = 1.25, maxAttempts = 40, start } = {}) {
  const e = PROFILES[profile];
  const lv = start ? { ...start.lv } : {};
  const state = start ? { ...start.state, dna: start.state.dna ?? 0 } : { P: 1, dna: 0, extraStart: 0 };
  const firsts = new Set();
  const rows = [];
  const pre = start ? spend(lv, state) : []; // остаток ДНК прошлого уровня тратится до первой попытки
  let L = 1;
  let minutes = 0;
  for (let a = 1; a <= maxAttempts; a++) {
    const s = { ...state, P: state.P * L };
    const n = deathWave(level, s, e);
    const won = n > WAVES;
    const k = won ? WAVES : n - 1;
    let dna = Math.max(DNA_FLOOR, dnaWaves(k, level));
    for (const m of MINI) if (k >= m && !firsts.has(m)) { firsts.add(m); dna += MINI_FIRST; }
    if (won) dna += BOSS_FIRST;
    const sec = won ? startSec(WAVES) + waveSec(WAVES) : startSec(n) + waveSec(n) * 0.6;
    minutes += sec / 60;
    state.dna += dna;
    const before = state.P * L;
    const bought = won ? [] : spend(lv, state);
    const nb = nextBig(lv);
    if (a === 1 && pre.length) bought.unshift(`(до попытки: ${pre.join(', ')})`);
    rows.push({ attempt: a, wave: won ? 'П' : n, dna, min: +(sec / 60).toFixed(1), total: +minutes.toFixed(0), P: +before.toFixed(2), bought, left: state.dna, nextBig: nb ? `${nb[0]} — не хватает ${Math.max(0, nb[1] - state.dna)}` : '—' });
    if (won) break;
    L = Math.min(learnCap, L * learn);
  }
  return { rows, lv, state };
}

// ---------------------------------------------------------------- вывод
if (import.meta.url === `file://${process.argv[1]}`) {
  const level = Number(args.level ?? 1);
  if (args.waves) {
    console.log('волна | выход, с | старт, мин | Preq | монет (опорный) | нужно урона/с | прочность волны');
    for (let n = 1; n <= WAVES; n++) {
      const c = coinsAt(n);
      const req = preq(level, n) * E0 * c;
      console.log([n, spawnSec(n).toFixed(1), (startSec(n) / 60).toFixed(1), preq(level, n).toFixed(2), Math.round(c), req.toFixed(1), Math.round(req * waveSec(n))].join(' | '));
    }
    console.log('Уровень целиком, мин:', ((startSec(WAVES) + waveSec(WAVES)) / 60).toFixed(1));
  } else {
    const r = ladder({ level, profile: args.profile ?? 'expert' });
    if (args.json) console.log(JSON.stringify(r.rows));
    else for (const row of r.rows) console.log(`${row.attempt}. волна ${row.wave} · P ${row.P} · ДНК +${row.dna} · ${row.min} мин (всего ${row.total}) · купил: ${row.bought.join(', ') || '—'} · остаток ${row.left} · ${row.nextBig}`);
  }
}

/** Уровни 1 → 2 → 3 подряд: состояние (купленное, остаток ДНК, сила) переходит дальше; обучение L сбрасывается на новом уровне. */
export function campaign(profile = 'expert', levels = [1, 2, 3]) {
  let start;
  const out = {};
  for (const level of levels) {
    const r = ladder({ level, profile, start });
    out[level] = r.rows;
    start = { lv: r.lv, state: { ...r.state, P: r.state.P } };
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}` && args.chain) {
  for (const p of String(args.chain === '1' ? 'expert,zone,human' : args.chain).split(',')) {
    const c = campaign(p);
    for (const [lvl, rows] of Object.entries(c)) {
      console.log(`== ${p}, уровень ${lvl}: попыток ${rows.length}, ${rows.at(-1).total} мин; волны: ${rows.map((r) => r.wave).join(' → ')}`);
      if (args.full) for (const row of rows) console.log(`   ${row.attempt}. ${row.wave} · P ${row.P} · +${row.dna} · ${row.bought.join(', ') || '—'} · ${row.nextBig}`);
    }
  }
}

// ---------------------------------------------------------------- состав волн уровня 1 (раздел 2 документа)
/** Базовая прочность видов уровня 1 (до множителя волны) и с какой волны вид выходит. */
export const TYPES_L1 = {
  coccus: { name: 'Кокк', hp: 3, from: 1 },
  rod: { name: 'Палочка', hp: 10, from: 4 },
  swarm: { name: 'Рой', hp: 1, from: 11, pack: 12 },
  runner: { name: 'Бегун', hp: 5, from: 15 },
  splitter: { name: 'Делящаяся', hp: 8, from: 21 },
  armored: { name: 'Бронированная', hp: 30, from: 25 },
  slick: { name: 'Слизень', hp: 16, from: 35 },
};
/** Множитель прочности одной бактерии на волне n уровня 1: 1 до 8-й волны, затем (n/8)^1,75 — к 30-й ×10, к 50-й ×24,6 (сейчас к 30-й ×21,6 при росте числа ×57). */
export const hpMulL1 = (n) => (n <= 8 ? 1 : Math.pow(n / 8, 1.75));
/** Стена волны: какой вид идёт пачкой (её прочность — разница между стеной и обычной волной, 20 % прочности волны). */
export const WALL_TYPE = { 6: 'rod', 8: 'rod', 12: 'rod', 15: 'runner', 18: 'rod', 23: 'splitter', 26: 'armored', 33: 'armored', 36: 'slick', 43: 'armored', 46: 'runner', 48: 'armored' };
/** Доли числа бактерий обычной волны по видам (что вышло к этой волне). */
const MIX = { coccus: 4, rod: 2, swarm: 3, runner: 1.5, splitter: 1, armored: 0.4, slick: 0.6 };
export const BOSS_NAME = { 10: 'Колония', 20: 'Вожак палочек', 30: 'Броненосец', 40: 'Матка роя', 50: 'Гигантская колония' };
/** Доля прочности волны у босса: 35 % у мини-боссов, 50 % у босса. */
const BOSS_SHARE = { 10: 0.35, 20: 0.35, 30: 0.35, 40: 0.35, 50: 0.5 };
const isWall = (n) => WALLS_L1.some(([w]) => w === n);
export function compositionL1(n) {
  const M = hpMulL1(n);
  const target = preq(1, n) * E0 * coinsAt(n) * waveSec(n); // прочность волны, HP
  const boss = BOSS_NAME[n];
  const wallType = WALL_TYPE[n];
  const regular = boss ? target * (1 - BOSS_SHARE[n]) : wallType ? target * 0.8 : target;
  const avail = Object.entries(TYPES_L1).filter(([, t]) => t.from <= n);
  const wsum = avail.reduce((sum, [id]) => sum + MIX[id], 0);
  const avgHp = avail.reduce((sum, [id, t]) => sum + (MIX[id] / wsum) * t.hp, 0);
  const total = regular / (M * avgHp);
  const out = {};
  for (const [id, t] of avail) {
    let cnt = Math.round((total * MIX[id]) / wsum);
    if (t.pack) cnt = Math.max(t.pack, Math.round(cnt / t.pack) * t.pack);
    if (id === 'coccus') cnt = Math.max(1, cnt);
    if (cnt > 0) out[id] = cnt;
  }
  let pack = null;
  if (wallType && !boss) { const k = Math.max(1, Math.round((target - regular) / (M * TYPES_L1[wallType].hp))); pack = [wallType, k]; }
  const bossHp = boss ? Math.round(target * BOSS_SHARE[n]) : 0;
  return { n, M, boss, bossHp, bossBase: boss ? Math.round(bossHp / M) : 0, counts: out, pack, total: Object.values(out).reduce((a, b) => a + b, 0) + (pack ? pack[1] : 0) + (boss ? 1 : 0), hp: Math.round(target), wall: isWall(n) };
}
if (import.meta.url === `file://${process.argv[1]}` && args.comp) {
  for (let n = 1; n <= WAVES; n++) {
    const c = compositionL1(n);
    const txt = Object.entries(c.counts).map(([id, k]) => `${TYPES_L1[id].name.toLowerCase()} ${k}`).join(', ');
    const head = c.boss ? `**${c.boss}** (${c.bossHp} HP) + ` : c.pack ? `**стена: ${TYPES_L1[c.pack[0]].name.toLowerCase()} ×${c.pack[1]} пачкой** + ` : '';
    console.log(`| ${n} | ${head}${txt} | ${c.total} | ${c.M.toFixed(2)} | ${c.hp} | ${(startSec(n) / 60).toFixed(1)} |`);
  }
}
