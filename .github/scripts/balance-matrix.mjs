/**
 * Строит список параллельных задач для balance.yml: профиль × набор исключённых башен × доля партий («шард»).
 * Читает поля запуска из переменных окружения (их ставит workflow; в командную строку и оболочку значения полей не подставляются),
 * проверяет их и пишет `matrix` в $GITHUB_OUTPUT и план задач в plan.json (его потом читает qa/bot-report.mjs).
 *
 * Поля: PROFILES — стратегии эксперта через «,» (профиль один — expert, решение владельца 19 октября 2026): expert (обычная), zone, solo:X, pair:a+b, focus:a+b (пусто или «all» — expert);
 * MUTS — наборы мутаций через «|»: «-» — по умолчанию (DEFAULT_MUT в qa/bot.mjs), «alt» — второй набор, либо запись --mut «башня:мутация,мутация;…»; RUNS — партий на стратегию и набор; SHARDS — на сколько параллельных задач разнести партии
 * каждой пары «профиль + набор» (1 — одна задача, партии идут подряд; 5 при RUNS=5 — по одной партии в задаче: быстрее всего);
 * EXCLUDES — наборы исключений через «;», внутри набора башни через «,» (например «-;syrup;fizz,syringe»; «-» или пусто — без исключений);
 * SOLOS — варианты «одна башня» (--solo) через «;» (например «-;fizz;pill»: «-» — обычная игра смешанным набором, «fizz» — только Шипучка и один Сироп);
 * LAMPS — «1», «veteran» или «first» (можно несколько через «;», «-» — без Ламп): бот строит Лампы против скрытных (--lamps);
 * CFG — подмена чисел «путь:число,путь:число»; LEVEL, SPEED; CAMPAIGN — число партий в серии (0 — обычный замер; N — каждая из RUNS серий играет до N партий подряд с очками ДНК и улучшениями, до первой победы).
 * Если запуск от push (EVENT_NAME=push), поля берутся из файла `.github/balance-request.json` (ключи profiles, muts, runs, shards, excludes, cfg, level, speed, campaign, meta — в нижнем регистре),
 * а не из переменных окружения: так замер можно запустить без кнопки — изменив этот файл и сделав push в рабочую ветку.
 */
import fs from 'node:fs';

const env = { ...process.env };
if (env.EVENT_NAME === 'push') {
  const request = JSON.parse(fs.readFileSync('.github/balance-request.json', 'utf8'));
  for (const name of ['PROFILES', 'MUTS', 'RUNS', 'SHARDS', 'EXCLUDES', 'SOLOS', 'LAMPS', 'CFG', 'LEVEL', 'SPEED', 'CAMPAIGN', 'META', 'MAX_GAME_SEC', 'MAX_REAL_SEC']) {
    const value = request[name.toLowerCase()];
    if (value !== undefined && value !== null) env[name] = String(value);
  }
  console.log(`Запуск по файлу запроса: ${JSON.stringify(request)}`);
}
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};
const TOWERS = ['pill', 'syrup', 'fizz', 'syringe'];
const SOLO_TOWERS = ['pill', 'fizz', 'syringe', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'];
const ALL_TOWERS = ['pill', 'syrup', 'fizz', 'syringe', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'];
const strategyTitle = (p) => (p === 'expert' ? 'эксперт' : `эксперт · ${p}`);

const rawProfiles = (env.PROFILES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const profiles = rawProfiles.includes('all') || rawProfiles.length === 0 ? ['expert'] : [...new Set(rawProfiles.map((p) => (p === 'default' ? 'expert' : p)))];
for (const p of profiles) {
  const m = /^(solo|pair|focus):([a-z+]+)$/.exec(p);
  const ok = p === 'expert' || p === 'zone' || (m && m[2].split('+').every((id) => ALL_TOWERS.includes(id)) && (m[1] === 'solo' ? !m[2].includes('+') : m[2].split('+').length === 2));
  if (!ok) fail(`стратегия «${p}»: есть expert, zone, solo:X, pair:a+b, focus:a+b (башни: ${ALL_TOWERS.join(', ')}); профили novice, average, strong убраны (решение владельца 19 октября 2026)`);
}
const mutList = [];
for (const part of (env.MUTS ?? '').split('|')) {
  const v = part.trim() === '-' ? '' : part.trim();
  if (v && v !== 'alt' && !/^[a-z]+:\w+(,\w+)*(;[a-z]+:\w+(,\w+)*)*$/.test(v)) fail(`MUTS=«${v}»: нужно «-», «alt» или «башня:мутация,мутация;…» (варианты — через «|»)`);
  if (!mutList.includes(v)) mutList.push(v);
}
if (mutList.length === 0) mutList.push('');

const intField = (name, fallback, min, max) => {
  const raw = (env[name] ?? '').trim();
  const value = raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name}=«${raw}»: нужно целое число от ${min} до ${max}`);
  return value;
};
const runs = intField('RUNS', 5, 1, 100);
const shards = Math.min(intField('SHARDS', 1, 1, 20), runs);
const level = intField('LEVEL', 1, 1, 10);
const campaign = intField('CAMPAIGN', 0, 0, 40);
const speed = (env.SPEED ?? '2').trim() || '2';
if (!(Number(speed) > 0 && Number(speed) <= 4)) fail(`SPEED=«${speed}»: нужно число от 0,1 до 4`);

const excludeSets = [];
for (const part of (env.EXCLUDES ?? '').split(';')) {
  const set = part.trim() === '-' ? [] : part.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of set) if (!TOWERS.includes(id)) fail(`--exclude: нет башни «${id}». Есть: ${TOWERS.join(', ')}`);
  const key = [...new Set(set)].sort().join(',');
  if (!excludeSets.includes(key)) excludeSets.push(key);
}
if (excludeSets.length === 0) excludeSets.push('');

const soloList = [];
for (const part of (env.SOLOS ?? '').split(';')) {
  const id = part.trim() === '-' ? '' : part.trim();
  if (id && !SOLO_TOWERS.includes(id)) fail(`SOLOS: нет башни «${id}». Есть: ${SOLO_TOWERS.join(', ')} (или «-» — без ограничения)`);
  if (!soloList.includes(id)) soloList.push(id);
}
if (soloList.length === 0) soloList.push('');
if (soloList.some(Boolean)) for (const p of profiles) if (p !== 'expert') fail(`SOLOS сочетается только со стратегией expert (а в списке «${p}»; «одна башня» — стратегия solo:X)`);

// CFG — один вариант «путь:число,путь:число» или несколько через «;» (например «-;towers.fizz.blastFullTargets:999»: «-» — без подмены): каждый вариант идёт отдельными задачами
// в одном прогоне, так сравнение «до/после» выполняется в одинаковых условиях
// LAMPS — один вариант «Ламп против скрытных» или несколько через «;» (например «-;veteran;first»: «-» — без Ламп): 1 — прежний, veteran — «опытный», first — «первая встреча»
const lampList = [];
for (const part of (env.LAMPS ?? '').split(';')) {
  const raw = part.trim();
  const id = raw === '-' || raw === '0' ? '' : raw;
  if (id && !['1', 'veteran', 'first'].includes(id)) fail(`LAMPS=«${id}»: есть 1, veteran, first (несколько вариантов — через «;», «-» — без Ламп)`);
  if (!lampList.includes(id)) lampList.push(id);
}
if (lampList.length === 0) lampList.push('');
if (lampList.some(Boolean)) for (const p of profiles) if (p !== 'expert') fail(`LAMPS сочетается только со стратегией expert, а в списке «${p}»`);
if (lampList.some(Boolean) && soloList.some(Boolean)) fail('LAMPS не сочетается с SOLOS');
const cfgList = [];
for (const part of (env.CFG ?? '').split(';')) {
  const variant = part.trim() === '-' ? '' : part.trim();
  if (variant && !/^[\w.\-]+:-?[\d.]+(,[\w.\-]+:-?[\d.]+)*$/.test(variant)) fail(`CFG=«${variant}»: нужно «путь:число,путь:число», например economy.rewardMul:0.85 (несколько вариантов — через «;», «-» — без подмены)`);
  if (!cfgList.includes(variant)) cfgList.push(variant);
}
if (cfgList.length === 0) cfgList.push('');

const limitField = (name) => {
  const text = (env[name] ?? '').trim();
  if (!text) return '';
  if (!/^\d+$/.test(text) || Number(text) < 30 || Number(text) > 100000) fail(`${name}=«${text}»: нужно целое число секунд от 30 до 100000`);
  return text;
};
const max_game_sec = limitField('MAX_GAME_SEC');
const max_real_sec = limitField('MAX_REAL_SEC');
const meta = (env.META ?? '').trim();
if (meta && !/^[A-Za-z]\w*:\d+(,[A-Za-z]\w*:\d+)*$/.test(meta)) fail(`META=«${meta}»: нужно «lives:2,coins:5,shield:1,pillRate:3» (id улучшений из таблицы meta.upgrades в config.ts, через запятую)`);
if (meta && campaign) fail('META не сочетается с CAMPAIGN: в серии улучшения покупает сам бот');

const include = [];
for (const profile of profiles) for (const [mutIndex, mut] of mutList.entries()) {
  for (const exclude of excludeSets) {
    for (const solo of soloList) {
      for (const lamps of lampList) for (const [cfgIndex, cfg] of cfgList.entries()) {
        for (let shard = 0; shard < shards; shard++) {
          const games = Math.floor(runs / shards) + (shard < runs % shards ? 1 : 0);
          const variant = `${exclude ? `no-${exclude.replace(/,/g, '-')}` : 'base'}${solo ? `-solo-${solo}` : ''}${lamps ? `-lamps-${lamps}` : ''}${cfgList.length > 1 ? `-c${cfgIndex + 1}` : ''}`;
          const tag = `${profile.replace(/[:+]/g, '-')}${mut ? `-mut${mutIndex + 1}` : ''}-${variant}${level !== 1 ? `-L${level}` : ''}${meta ? '-m' : ''}-s${shard + 1}`;
          const title = `${strategyTitle(profile)}${mut ? ` · мутации ${mut === 'alt' ? 'alt' : mutIndex + 1}` : ''}${solo ? ` · одна башня: ${solo}` : ''}${lamps ? ` · Лампы (${lamps})` : ''}${exclude ? ` · без ${exclude}` : ''}${cfgList.length > 1 ? ` · подмена ${cfg || 'нет'}` : ''}${campaign ? ` · серии до ${campaign}` : ''}${level !== 1 ? ` · уровень ${level}` : ''}${meta ? ` · улучшения ${meta}` : ''}${shards > 1 ? ` · доля ${shard + 1}/${shards}` : ''} (${games} парт.)`;
          include.push({ profile, mut, exclude, solo, lamps, runs: games, tag, title, cfg, level, speed, campaign, meta, max_game_sec, max_real_sec });
        }
      }
    }
  }
}
if (include.length > 256) fail(`слишком много задач (${include.length}, предел 256): уменьшите профили, наборы исключений или число долей`);

fs.writeFileSync('plan.json', JSON.stringify(include, null, 1));
if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include })}\ncount=${include.length}\n`);
console.log(`Задач: ${include.length} (стратегии ${profiles.join(', ')}; мутации ${mutList.map((m) => m || 'по умолчанию').join(' | ')}; наборы исключений: ${excludeSets.map((s) => s || '—').join(' | ')}; партий ${runs}, долей ${shards}; подмены «${cfgList.map((c) => c || "—").join(" | ")}»; уровень ${level}; улучшения «${meta}»; speed ${speed}${campaign ? `; серии до ${campaign} партий` : ''})`);
for (const job of include) console.log(`  ${job.tag}: ${job.title}`);
