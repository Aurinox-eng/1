/**
 * Строит список параллельных задач для balance.yml: профиль × набор исключённых башен × доля партий («шард»).
 * Читает поля запуска из переменных окружения (их ставит workflow; в командную строку и оболочку значения полей не подставляются),
 * проверяет их и пишет `matrix` в $GITHUB_OUTPUT и план задач в plan.json (его потом читает qa/bot-report.mjs).
 *
 * Поля: PROFILES — «novice,average,strong,expert» (или «all»); RUNS — партий на профиль и набор; SHARDS — на сколько параллельных задач разнести партии
 * каждой пары «профиль + набор» (1 — одна задача, партии идут подряд; 5 при RUNS=5 — по одной партии в задаче: быстрее всего);
 * EXCLUDES — наборы исключений через «;», внутри набора башни через «,» (например «-;syrup;fizz,syringe»; «-» или пусто — без исключений);
 * CFG — подмена чисел «путь:число,путь:число»; LEVEL, SPEED; CAMPAIGN — число партий в серии (0 — обычный замер; N — каждая из RUNS серий играет до N партий подряд с очками ДНК и улучшениями, до первой победы).
 * Если запуск от push (EVENT_NAME=push), поля берутся из файла `.github/balance-request.json` (ключи profiles, runs, shards, excludes, cfg, level, speed, campaign, meta — в нижнем регистре),
 * а не из переменных окружения: так замер можно запустить без кнопки — изменив этот файл и сделав push в рабочую ветку.
 */
import fs from 'node:fs';

const env = { ...process.env };
if (env.EVENT_NAME === 'push') {
  const request = JSON.parse(fs.readFileSync('.github/balance-request.json', 'utf8'));
  for (const name of ['PROFILES', 'RUNS', 'SHARDS', 'EXCLUDES', 'CFG', 'LEVEL', 'SPEED', 'CAMPAIGN', 'META']) {
    const value = request[name.toLowerCase()];
    if (value !== undefined && value !== null) env[name] = String(value);
  }
  console.log(`Запуск по файлу запроса: ${JSON.stringify(request)}`);
}
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};
const PROFILES = ['novice', 'average', 'strong', 'expert'];
const TOWERS = ['pill', 'syrup', 'fizz', 'syringe'];
const TITLES = { novice: 'новичок', average: 'средний', strong: 'сильный', expert: 'особо сильный' };

const rawProfiles = (env.PROFILES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const profiles = rawProfiles.includes('all') || rawProfiles.length === 0 ? PROFILES : rawProfiles;
for (const p of profiles) if (!PROFILES.includes(p)) fail(`профиль «${p}»: есть ${PROFILES.join(', ')}, all`);

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

const cfg = (env.CFG ?? '').trim();
if (cfg && !/^[\w.\-]+:-?[\d.]+(,[\w.\-]+:-?[\d.]+)*$/.test(cfg)) fail(`CFG=«${cfg}»: нужно «путь:число,путь:число», например economy.rewardMul:0.85`);

const meta = (env.META ?? '').trim();
if (meta && !/^(lives|coins|damage|reward):\d+(,(lives|coins|damage|reward):\d+)*$/.test(meta)) fail(`META=«${meta}»: нужно «lives:2,coins:5,damage:5,reward:5» (любые из четырёх улучшений)`);
if (meta && campaign) fail('META не сочетается с CAMPAIGN: в серии улучшения покупает сам бот');

const include = [];
for (const profile of profiles) {
  for (const exclude of excludeSets) {
    for (let shard = 0; shard < shards; shard++) {
      const games = Math.floor(runs / shards) + (shard < runs % shards ? 1 : 0);
      const variant = exclude ? `no-${exclude.replace(/,/g, '-')}` : 'base';
      const tag = `${profile}-${variant}${level !== 1 ? `-L${level}` : ''}${meta ? '-m' : ''}-s${shard + 1}`;
      const title = `${TITLES[profile]}${exclude ? ` · без ${exclude}` : ''}${campaign ? ` · серии до ${campaign}` : ''}${level !== 1 ? ` · уровень ${level}` : ''}${meta ? ` · улучшения ${meta}` : ''}${shards > 1 ? ` · доля ${shard + 1}/${shards}` : ''} (${games} парт.)`;
      include.push({ profile, exclude, runs: games, tag, title, cfg, level, speed, campaign, meta });
    }
  }
}
if (include.length > 120) fail(`слишком много задач (${include.length}): уменьшите профили, наборы исключений или число долей`);

fs.writeFileSync('plan.json', JSON.stringify(include, null, 1));
if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include })}\ncount=${include.length}\n`);
console.log(`Задач: ${include.length} (профили ${profiles.join(', ')}; наборы исключений: ${excludeSets.map((s) => s || '—').join(' | ')}; партий ${runs}, долей ${shards}; cfg «${cfg}»; уровень ${level}; улучшения «${meta}»; speed ${speed}${campaign ? `; серии до ${campaign} партий` : ''})`);
for (const job of include) console.log(`  ${job.tag}: ${job.title}`);
