/**
 * План запуска ladder.yml («лестница», этап 5б): читает поля запуска, проверяет их и пишет в $GITHUB_OUTPUT:
 * profile, lanes (JSON-список номеров дорожек, например [1,2,3]), k, to_level, speed, cfg.
 * Поля берутся из переменных окружения (их ставит workflow при ручном запуске); если запуск от push (EVENT_NAME=push) — из файла
 * `.github/ladder-request.json` (ключи profile, lanes, k, to_level, speed, cfg): так лестницу запускает агент без кнопки — изменив файл и сделав push в рабочую ветку.
 * Значения в командную строку и оболочку не попадают.
 */
import fs from 'node:fs';

const env = { ...process.env };
if (env.EVENT_NAME === 'push') {
  const request = JSON.parse(fs.readFileSync('.github/ladder-request.json', 'utf8'));
  for (const name of ['PROFILE', 'LANES', 'K', 'TO_LEVEL', 'SPEED', 'CFG', 'FARM', 'MAX_REAL_SEC', 'K_TOTAL', 'MAX_PARALLEL']) {
    const value = request[name.toLowerCase()];
    if (value !== undefined && value !== null) env[name] = String(value);
  }
  console.log(`Запуск по файлу запроса: ${JSON.stringify(request)}`);
}
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};
const integer = (name, fallback, min, max) => {
  const text = (env[name] ?? '').trim() || String(fallback);
  if (!/^\d+$/.test(text)) fail(`${name}=«${text}»: нужно целое число`);
  const value = Number(text);
  if (value < min || value > max) fail(`${name}=${value}: нужно от ${min} до ${max}`);
  return value;
};
const profile = (env.PROFILE ?? '').trim() || 'strong';
if (!['novice', 'average', 'strong', 'expert', 'zone'].includes(profile)) fail(`PROFILE=«${profile}»: нужно novice, average, strong, expert или zone`);
const lanes = integer('LANES', 6, 1, 10);
const k = integer('K', 8, 1, 20);
const kTotal = (env.K_TOTAL ?? '').trim() ? integer('K_TOTAL', k, k, 40) : k; // всего партий на уровне (по умолчанию k): больше k — уровень играется несколькими задачами подряд (предел задачи 5 ч 50 мин)
const chunked = kTotal > k ? 'true' : 'false';
const toLevel = integer('TO_LEVEL', 10, 1, 10);
const speed = (env.SPEED ?? '').trim() || '2';
if (!/^\d+(\.\d+)?$/.test(speed) || Number(speed) <= 0 || Number(speed) > 5) fail(`SPEED=«${speed}»: нужно число от 0 до 5`);
const cfg = (env.CFG ?? '').trim();
if (cfg && !/^[\w.\-]+:-?[\d.]+(,[\w.\-]+:-?[\d.]+)*$/.test(cfg)) fail(`CFG=«${cfg}»: нужно «путь:число,путь:число», например waves.hpGrowthPerWave:0.06`);
const farm = ['1', 'true', 'yes'].includes((env.FARM ?? '').trim().toLowerCase()) ? '1' : '0';
const maxRealSec = integer('MAX_REAL_SEC', 7200, 600, 20000); // потолок реального времени партии, секунд (бот: --max-real-sec); при 3600 поздние партии лестницы обрывались как timeout без очков ДНК
const maxParallel = integer('MAX_PARALLEL', 7, 1, 7); // дорожек одной серии одновременно: не больше 7 (две серии = 14 мест из 20, для smoke остаётся не меньше 6; см. slots-guard.mjs)
const laneList = Array.from({ length: lanes }, (_, i) => i + 1);
const out = { profile, lanes: JSON.stringify(laneList), k: String(k), k_total: String(kTotal), chunked, to_level: String(toLevel), speed, cfg, farm, max_real_sec: String(maxRealSec), max_parallel: String(maxParallel) };
console.log(`Лестница: профиль ${profile}, дорожек ${lanes}, до ${k} партий за задачу${chunked === 'true' ? `, всего до ${kTotal} на уровне` : ''}, уровни 1–${toLevel}, speed ${speed}${cfg ? `, cfg ${cfg}` : ''}${farm === '1' ? ', контроль фарма' : ''}, потолок партии ${maxRealSec} с реального времени, одновременно не больше ${maxParallel} дорожек`);
const lines = Object.entries(out).map(([key, value]) => `${key}=${value}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
else console.log(lines.join('\n'));
