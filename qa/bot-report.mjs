/**
 * Итоговая таблица замера ботом из JSON-файлов нескольких параллельных задач (GitHub Actions, `balance.yml`) — в формате Markdown для страницы прогона (Summary).
 *
 *   node qa/bot-report.mjs <папка-с-JSON> [--plan=plan.json] [--title="Круг 15"]
 *
 * Берёт все файлы `*.json` в папке и подпапках, где есть поля `tag` и `games` (их пишет `qa/bot.mjs` в `qa/bot-results/<тег>.json`).
 * Партии с одинаковым профилем, набором `--exclude`, `--cfg` и уровнем (например, доли одного замера, разнесённые по параллельным задачам) складываются в одну строку.
 * `--plan=plan.json` — список ожидавшихся задач (поля tag, profile, exclude, cfg): те, от которых не пришло результата, попадут в раздел «Проблемы».
 * Таблица — те же столбцы и те же числа, что печатает сам бот (`printSummary` в qa/bot.mjs), плюс столбец «Вариант» (исключённые башни и подмена чисел).
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
      return [m[1], m[2] ?? true];
    }),
);
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!dir || !fs.existsSync(dir)) {
  console.error('Использование: node qa/bot-report.mjs <папка-с-JSON> [--plan=plan.json] [--title=...]');
  process.exit(2);
}

const NAMES = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц' };
const SHORT = { pill: 'Таб', syrup: 'Сир', fizz: 'Шип', syringe: 'Шпр' };
const PROFILE_TITLES = { novice: 'новичок', average: 'средний', strong: 'сильный', expert: 'особо сильный' };
const PROFILE_ORDER = Object.keys(PROFILE_TITLES);
const RESULT_RU = { won: 'победа', lost: 'проигрыш', timeout: 'timeout', error: 'ОШИБКА' };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : '—');
const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)} %` : '—');
const esc = (s) => String(s).replace(/\|/g, '\\|');

function findJson(root) {
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) out.push(...findJson(file));
    else if (name.endsWith('.json')) out.push(file);
  }
  return out;
}

const results = [];
for (const file of findJson(dir)) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && typeof data.tag === 'string' && Array.isArray(data.games)) results.push(data);
  } catch {
    /* не результат бота (например, план) — пропускаем */
  }
}
results.sort((a, b) => a.tag.localeCompare(b.tag));
// Результаты режима «серия партий» (--campaign) — отдельный раздел: партии одной серии зависят друг от друга, в общую таблицу их складывать нельзя
const campaignResults = results.filter((r) => r.campaign);
results.splice(0, results.length, ...results.filter((r) => !r.campaign));

const towerIds = [...new Set(results.flatMap((r) => Object.keys(r.towerTable ?? {})))];
const KNOWN_TOWERS = towerIds.length ? towerIds : Object.keys(NAMES);

// ------------------------------------------------------------------ группы: профиль + исключения + подмена чисел + уровень
const groups = new Map();
for (const r of results) {
  const a = r.args ?? {};
  const exclude = [...(a.exclude ?? [])].sort().join(',');
  const cfg = a.cfg ?? '';
  const level = a.level ?? 1;
  const meta = a.meta ? Object.entries(a.meta).map(([id, n]) => `${id}:${n}`).join(',') : '';
  for (const g of r.games) {
    const key = [g.profile, exclude, cfg, level, meta].join('|');
    if (!groups.has(key)) groups.set(key, { profile: g.profile, exclude, cfg, level, meta, games: [], tags: new Set(), seeds: [] });
    const group = groups.get(key);
    group.games.push(g);
    group.tags.add(r.tag);
  }
}
const orderedGroups = [...groups.values()].sort(
  (x, y) => x.level - y.level || x.meta.localeCompare(y.meta) || x.cfg.localeCompare(y.cfg) || x.exclude.localeCompare(y.exclude) || PROFILE_ORDER.indexOf(x.profile) - PROFILE_ORDER.indexOf(y.profile),
);

function summarize(games) {
  const own = games.filter((g) => g.result !== 'error');
  if (!own.length) return null;
  const losses = own.filter((g) => g.result === 'lost');
  return {
    games: own.length,
    won: own.filter((g) => g.result === 'won').length,
    timeout: own.filter((g) => g.result === 'timeout').length,
    lost: losses.length,
    winRate: own.filter((g) => g.result === 'won').length / own.length,
    avgLivesLost: mean(own.map((g) => g.maxLives - g.lives)),
    avgLossWave: mean(losses.map((g) => g.wave)),
    avgTowers: Object.fromEntries(KNOWN_TOWERS.map((id) => [id, mean(own.map((g) => g.towers?.[id] ?? 0))])),
    avgCoinsEnd: mean(own.map((g) => g.coins)),
    avgRealSec: mean(own.map((g) => g.realSec)),
    avgGameSec: mean(own.map((g) => g.gameSec)),
  };
}

const variant = (g) => [g.exclude ? `без: ${g.exclude.split(',').map((id) => NAMES[id] ?? id).join(', ')}` : '', g.cfg ? `cfg: ${g.cfg}` : '', g.level !== 1 ? `уровень ${g.level}` : '', g.meta ? `улучшения: ${g.meta}` : ''].filter(Boolean).join('; ') || 'обычный';

const gameLine = (g, index, total) => {
  const head = `[${PROFILE_TITLES[g.profile] ?? g.profile} ${index}/${total}]`;
  if (g.result === 'error') return `${head} ОШИБКА: ${g.error}`;
  const towers = KNOWN_TOWERS.map((id) => `${SHORT[id] ?? id} ${g.towers?.[id] ?? 0}`).join(' ');
  const merged = g.merges ? ` · слияний ${g.merges}, мутаций ${g.picks}` : '';
  return `${head} ${RESULT_RU[g.result]} · волна ${g.wave}/${g.waveTotal} · жизни ${g.lives}/${g.maxLives} · убито ${g.kills}, дошло ${g.leaked} · монеты ${g.coins} · башни ${towers}${merged} · игра ${f1(g.gameSec)} с · реал. ${f1(g.realSec)} с`;
};

/** Сколько построек каждого вида и во сколько игровых секунд построена первая. */
function buildsOf(g) {
  const out = {};
  for (const b of g.builds ?? []) {
    out[b.type] ??= { n: 0, first: b.t };
    out[b.type].n++;
  }
  return Object.entries(out)
    .map(([type, v]) => `${SHORT[type] ?? type} ${v.n} (первая на ${v.first} с)`)
    .join(', ') || 'нет';
}

// ------------------------------------------------------------------ вывод
const lines = [];
const env = process.env;
const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
lines.push(`## ${args.title && args.title !== true ? args.title : 'Итог замера бота'}`);
const meta = [
  env.BOT_REF ? `ветка/коммит: \`${env.BOT_REF}\`${env.GITHUB_SHA ? ` (код: \`${String(env.BOT_SHA ?? env.GITHUB_SHA).slice(0, 7)}\`)` : ''}` : '',
  (() => {
    const speeds = [...new Set(results.map((r) => r.args?.speed).filter((x) => x !== undefined))];
    return speeds.length ? `speed ${speeds.join('/')}, \`--canvas\`` : '';
  })(),
  runUrl ? `[прогон](${runUrl})` : '',
].filter(Boolean);
if (meta.length) lines.push(meta.join(' · '));
lines.push('');

if (!orderedGroups.length && !campaignResults.length) {
  lines.push('**Результатов нет:** ни одна задача не прислала файл с партиями.');
} else if (orderedGroups.length) {
  const head = ['Вариант', 'Профиль', 'Партий', 'Побед', 'Потеряно жизней', 'Волна гибели', `Башни (${KNOWN_TOWERS.map((id) => SHORT[id] ?? id).join('/')})`, 'Монеты в конце', 'Реал. время партии'];
  lines.push(`| ${head.join(' | ')} |`);
  lines.push(`|${head.map(() => '---').join('|')}|`);
  for (const g of orderedGroups) {
    const s = summarize(g.games);
    if (!s) {
      lines.push(`| ${esc(variant(g))} | ${PROFILE_TITLES[g.profile] ?? g.profile} | 0 (все партии с ошибкой) | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${esc(variant(g))} | ${PROFILE_TITLES[g.profile] ?? g.profile} | ${s.games}${s.timeout ? ` (timeout ${s.timeout})` : ''} | ${s.won}/${s.games} (${pct(s.winRate)}) | ${f1(s.avgLivesLost)} | ${s.lost ? f1(s.avgLossWave) : '—'} | ${KNOWN_TOWERS.map((id) => f1(s.avgTowers[id])).join(' / ')} | ${f1(s.avgCoinsEnd)} | ${f1(s.avgRealSec)} с (игра ${f1(s.avgGameSec)} с) |`,
    );
  }
  lines.push('');

  lines.push('<details><summary>Строки партий</summary>');
  lines.push('');
  lines.push('```');
  for (const g of orderedGroups) {
    lines.push(`# ${variant(g)}`);
    g.games.forEach((game, i) => lines.push(gameLine(game, i + 1, g.games.length)));
  }
  lines.push('```');
  lines.push('</details>');
  lines.push('');

  lines.push('<details><summary>По каждой партии: волны потери жизней, постройки, уровни башен</summary>');
  lines.push('');
  lines.push('```');
  for (const g of orderedGroups) {
    lines.push(`# ${PROFILE_TITLES[g.profile] ?? g.profile} — ${variant(g)}`);
    g.games.forEach((game, i) => {
      if (game.result === 'error') return;
      lines.push(`  партия ${i + 1}: потеря жизней на волнах [${(game.lifeLossWaves ?? []).join(', ')}]; постройки: ${buildsOf(game)}; уровни башен ${JSON.stringify(game.levels ?? {})}; слияний ${game.merges ?? 0}, мутаций ${game.picks ?? 0}`);
    });
    const first = g.games.find((game) => game.result !== 'error');
    if (first?.timeline?.length) lines.push(`  ход первой партии (волна: игровая секунда, монеты, башен, жизни): ${first.timeline.map((x) => `${x.wave}: ${x.t} с ${x.coins}м ${x.towers}б ${x.lives}ж`).join(' | ')}`);
  }
  lines.push('```');
  lines.push('</details>');
  lines.push('');
}

// ------------------------------------------------------------------ серии партий (этап 6а)
if (campaignResults.length) {
  const cgroups = new Map();
  for (const r of campaignResults) {
    const a = r.args ?? {};
    const key = [a.exclude ? [...a.exclude].sort().join(',') : '', a.cfg ?? '', a.level ?? 1, r.campaign.n].join('|');
    if (!cgroups.has(key)) cgroups.set(key, { exclude: a.exclude ? [...a.exclude].sort().join(',') : '', cfg: a.cfg ?? '', level: a.level ?? 1, n: r.campaign.n, series: [], table: r.campaign.metaTable });
    cgroups.get(key).series.push(...r.campaign.series);
  }
  for (const grp of cgroups.values()) {
    lines.push(`### Серии партий (до ${grp.n} партий в серии; очки ДНК за каждую пройденную волну и добавка за победу, улучшения покупаются по порядку damage, coins, lives, reward)`);
    const vtitle = [grp.exclude ? `без: ${grp.exclude}` : '', grp.cfg ? `cfg: ${grp.cfg}` : '', grp.level !== 1 ? `уровень ${grp.level}` : ''].filter(Boolean).join('; ');
    if (vtitle) lines.push(`Вариант: ${esc(vtitle)}`);
    lines.push('');
    lines.push('| Профиль | Серий | Серий с победой | Первая победа в партии (среднее; по сериям) | Волны по партиям (каждая серия в скобках) |');
    lines.push('|---|---|---|---|---|');
    for (const profile of PROFILE_ORDER) {
      const own = grp.series.filter((x) => x.profile === profile && !x.error);
      if (!own.length) continue;
      const wins = own.filter((x) => x.firstWin);
      lines.push(
        `| ${PROFILE_TITLES[profile]} | ${own.length} | ${wins.length}/${own.length} (${pct(wins.length / own.length)}) | ${wins.length ? `${f1(mean(wins.map((x) => x.firstWin)))} (${wins.map((x) => x.firstWin).sort((x, y) => x - y).join(', ')})` : `нет за ${grp.n}`}${own.length > wins.length && wins.length ? `; без победы: ${own.length - wins.length}` : ''} | ${own.map((x) => `[${x.waves.join(' ')}]`).join(' ')} |`,
      );
    }
    lines.push('');
    lines.push('<details><summary>Покупки по партиям</summary>');
    lines.push('');
    lines.push('```');
    for (const profile of PROFILE_ORDER) {
      for (const x of grp.series.filter((y) => y.profile === profile)) {
        lines.push(`${PROFILE_TITLES[profile]}, серия ${x.run}: ${x.error ? `ОШИБКА ${x.error}` : x.bought.map((b, i) => `${i + 1}: ${b.join('+') || '—'}`).join('; ')}`);
      }
    }
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }
}

// ------------------------------------------------------------------ проблемы
const problems = [];
for (const g of orderedGroups) {
  const name = `${PROFILE_TITLES[g.profile] ?? g.profile} (${variant(g)})`;
  g.games.forEach((game, i) => {
    if (game.result === 'error') problems.push(`${name}, партия ${i + 1}: ОШИБКА — ${game.error}`);
    if (game.result === 'timeout') problems.push(`${name}, партия ${i + 1}: timeout (волна ${game.wave})`);
    for (const a of game.anomalies ?? []) problems.push(`${name}, партия ${i + 1}: ⚠ ${a}`);
    for (const w of game.warnings ?? []) problems.push(`${name}, партия ${i + 1}: консоль: ${w}`);
    if ((game.failures ?? []).length) problems.push(`${name}, партия ${i + 1}: не вышло поставить башню ${game.failures.length} раз(а)`);
  });
}
for (const r of campaignResults) {
  for (const game of r.games) {
    const name = `${PROFILE_TITLES[game.profile] ?? game.profile}, серия ${game.series ?? game.run}, партия ${game.game ?? '?'}`;
    if (game.result === 'error') problems.push(`${name}: ОШИБКА — ${game.error}`);
    if (game.result === 'timeout') problems.push(`${name}: timeout (волна ${game.wave})`);
    for (const a of game.anomalies ?? []) problems.push(`${name}: ⚠ ${a}`);
    for (const w of game.warnings ?? []) problems.push(`${name}: консоль: ${w}`);
  }
}
if (args.plan && fs.existsSync(String(args.plan))) {
  try {
    const plan = JSON.parse(fs.readFileSync(String(args.plan), 'utf8'));
    const seen = new Set([...results, ...campaignResults].map((r) => r.tag)); // результаты серий (--campaign) тоже считаются присланными
    for (const job of Array.isArray(plan) ? plan : plan.include ?? []) {
      if (!seen.has(job.tag)) problems.push(`задача «${job.tag}» (${PROFILE_TITLES[job.profile] ?? job.profile}${job.exclude ? `, без ${job.exclude}` : ''}) не прислала результата: упала или не закончилась (см. лог задачи)`);
    }
  } catch (error) {
    problems.push(`не удалось прочитать план задач: ${error.message}`);
  }
}
lines.push('### Проблемы');
lines.push(problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'Нет: ни ошибок, ни «⚠», ни сообщений консоли, ни пропавших задач.');
lines.push('');

console.log(lines.join('\n'));
