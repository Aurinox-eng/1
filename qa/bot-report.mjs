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

const NAMES = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц', ampule: 'Ампула', antibiotic: 'Антибиотик', lamp: 'Лампа', vitamin: 'Витамин', frost: 'Холод', patch: 'Пластырь' };
const SHORT = { pill: 'Таб', syrup: 'Сир', fizz: 'Шип', syringe: 'Шпр', ampule: 'Амп', antibiotic: 'Ант', lamp: 'Лмп', vitamin: 'Вит', frost: 'Хол', patch: 'Пла' };
// Профиль один — эксперт (решение владельца 19 октября 2026); строки различаются стратегией (default, zone, solo:X, pair:a+b, focus:a+b — поле strategy партии, серии и дорожки)
const who = (x) => (x.strategy && x.strategy !== 'default' ? x.strategy : x.profile === 'zone' ? 'zone' : 'expert');
const titleOf = (id) => (id === 'expert' ? 'эксперт' : `эксперт (${id})`);
const whoList = (list) => [...new Set(list.map(who))].sort((a, b) => (a === 'expert' ? -1 : b === 'expert' ? 1 : a.localeCompare(b)));
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
// «Лестница» (--ladder, этап 5б): тоже отдельный раздел — дорожка идёт по уровням, результаты одной дорожки лежат в нескольких файлах (по одному на уровень)
const ladderResults = results.filter((r) => r.ladder);
results.splice(0, results.length, ...results.filter((r) => !r.campaign && !r.ladder));

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
  const solo = a.solo ?? '';
  const lamps = a.lamps ? (a.lamps === true || a.lamps === 'true' ? 'prep8' : String(a.lamps)) : '';
  for (const g of r.games) {
    const key = [who(g), exclude, cfg, level, meta, solo, lamps].join('|');
    if (!groups.has(key)) groups.set(key, { profile: who(g), exclude, cfg, level, meta, solo, lamps, games: [], tags: new Set(), seeds: [] });
    const group = groups.get(key);
    group.games.push(g);
    group.tags.add(r.tag);
  }
}
const orderedGroups = [...groups.values()].sort(
  (x, y) => x.level - y.level || x.meta.localeCompare(y.meta) || x.cfg.localeCompare(y.cfg) || x.exclude.localeCompare(y.exclude) || x.solo.localeCompare(y.solo) || x.profile.localeCompare(y.profile),
);

/** До какой волны дошла партия: победа — все волны уровня, иначе номер волны на момент конца (проигрыш, timeout). */
const waveReached = (g) => (g.result === 'won' ? g.waveTotal ?? g.wave : g.wave);
function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

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
    avgStealthLives: own.some((g) => g.stealthLives !== undefined) ? mean(own.map((g) => g.stealthLives ?? 0)) : null,
    medianWave: median(own.map(waveReached)),
    avgTowers: Object.fromEntries(KNOWN_TOWERS.map((id) => [id, mean(own.map((g) => g.towers?.[id] ?? 0))])),
    avgCoinsEnd: mean(own.map((g) => g.coins)),
    avgRealSec: mean(own.map((g) => g.realSec)),
    avgGameSec: mean(own.map((g) => g.gameSec)),
  };
}

const LAMP_TITLES = { prep8: 'Лампы против скрытных', veteran: 'Лампы: опытный (за 3 волны до скрытных)', first: 'Лампы: первая встреча (по плашке скрытной)' };
const variant = (g) => [g.lamps ? (LAMP_TITLES[g.lamps] ?? 'Лампы против скрытных') : '', g.solo ? `одна башня: ${NAMES[g.solo] ?? g.solo}` : '', g.exclude ? `без: ${g.exclude.split(',').map((id) => NAMES[id] ?? id).join(', ')}` : '', g.cfg ? `cfg: ${g.cfg}` : '', g.level !== 1 ? `уровень ${g.level}` : '', g.meta ? `улучшения: ${g.meta}` : ''].filter(Boolean).join('; ') || 'обычный';

const gameLine = (g, index, total) => {
  const head = `[${titleOf(who(g))} ${index}/${total}]`;
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

if (!orderedGroups.length && !campaignResults.length && !ladderResults.length) {
  lines.push('**Результатов нет:** ни одна задача не прислала файл с партиями.');
} else if (orderedGroups.length) {
  const head = ['Вариант', 'Профиль', 'Партий', 'Побед', 'Потеряно жизней', 'Жизней от скрытных', 'Волна гибели', 'Медиана волны', `Башни (${KNOWN_TOWERS.map((id) => SHORT[id] ?? id).join('/')})`, 'Монеты в конце', 'Реал. время партии'];
  lines.push(`| ${head.join(' | ')} |`);
  lines.push(`|${head.map(() => '---').join('|')}|`);
  for (const g of orderedGroups) {
    const s = summarize(g.games);
    if (!s) {
      lines.push(`| ${esc(variant(g))} | ${titleOf(g.profile)} | 0 (все партии с ошибкой) | — | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${esc(variant(g))} | ${titleOf(g.profile)} | ${s.games}${s.timeout ? ` (timeout ${s.timeout})` : ''} | ${s.won}/${s.games} (${pct(s.winRate)}) | ${f1(s.avgLivesLost)} | ${s.avgStealthLives === null ? '—' : f1(s.avgStealthLives)} | ${s.lost ? f1(s.avgLossWave) : '—'} | ${f1(s.medianWave)} | ${KNOWN_TOWERS.map((id) => f1(s.avgTowers[id])).join(' / ')} | ${f1(s.avgCoinsEnd)} | ${f1(s.avgRealSec)} с (игра ${f1(s.avgGameSec)} с) |`,
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
    lines.push(`# ${titleOf(g.profile)} — ${variant(g)}`);
    g.games.forEach((game, i) => {
      if (game.result === 'error') return;
      lines.push(`  партия ${i + 1}: потеря жизней на волнах [${(game.lifeLossWaves ?? []).join(', ')}]${game.lifeLossKinds?.length ? ` (виды: ${[...new Set(game.lifeLossKinds)].map((k) => `${k}×${game.lifeLossKinds.filter((x) => x === k).length}`).join(', ')})` : ''}${game.leakLives && Object.keys(game.leakLives).length ? `; жизней по видам: ${Object.entries(game.leakLives).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}; постройки: ${buildsOf(game)}; уровни башен ${JSON.stringify(game.levels ?? {})}; слияний ${game.merges ?? 0}, мутаций ${game.picks ?? 0}`);
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
    for (const profile of whoList(grp.series)) {
      const own = grp.series.filter((x) => who(x) === profile && !x.error);
      if (!own.length) continue;
      const wins = own.filter((x) => x.firstWin);
      lines.push(
        `| ${titleOf(profile)} | ${own.length} | ${wins.length}/${own.length} (${pct(wins.length / own.length)}) | ${wins.length ? `${f1(mean(wins.map((x) => x.firstWin)))} (${wins.map((x) => x.firstWin).sort((x, y) => x - y).join(', ')})` : `нет за ${grp.n}`}${own.length > wins.length && wins.length ? `; без победы: ${own.length - wins.length}` : ''} | ${own.map((x) => `[${x.waves.join(' ')}]`).join(' ')} |`,
      );
    }
    lines.push('');
    lines.push('<details><summary>Покупки по партиям</summary>');
    lines.push('');
    lines.push('```');
    for (const profile of whoList(grp.series)) {
      for (const x of grp.series.filter((y) => who(y) === profile)) {
        lines.push(`${titleOf(profile)}, серия ${x.run}: ${x.error ? `ОШИБКА ${x.error}` : x.bought.map((b, i) => `${i + 1}: ${b.join('+') || '—'}`).join('; ')}`);
      }
    }
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }
}

// ------------------------------------------------------------------ лестница (этап 5б, Фаза Б)
if (ladderResults.length) {
  // дорожка = профиль + номер; записи уровней из разных файлов склеиваются (одна запись на уровень, берётся последняя)
  const lanes = new Map();
  for (const r of ladderResults) {
    for (const lane of r.ladder.lanes) {
      const key = `${who(lane)}:${lane.run}`;
      if (!lanes.has(key)) lanes.set(key, { profile: who(lane), run: lane.run, levels: new Map(), stuckAt: null, dna: 0 });
      const own = lanes.get(key);
      for (const rec of lane.perLevel) own.levels.set(rec.level, rec);
      if (lane.stuckAt) own.stuckAt = lane.stuckAt;
      own.dna = Math.max(own.dna, lane.dna ?? 0);
    }
  }
  const k = Math.max(...ladderResults.map((r) => r.ladder.k));
  lines.push(`### Лестница (игрок идёт по уровням подряд; на уровне до ${k} партий до первой победы; очки ДНК за волны, победу и звёзды, улучшения докупаются между партиями)`);
  lines.push('');
  lines.push('| Уровень | Дорожек дошло | Выиграли | Партий до первой победы (среднее; по дорожкам) | Волна первой партии (среднее) | Звёзды (среднее) |');
  lines.push('|---|---|---|---|---|---|');
  for (let level = 1; level <= 10; level++) {
    const recs = [...lanes.values()].map((l) => l.levels.get(level)).filter(Boolean);
    if (!recs.length) continue;
    const wins = recs.filter((x) => x.firstWin);
    lines.push(
      `| ${level} | ${recs.length} | ${wins.length}/${recs.length} | ${wins.length ? `${f1(mean(wins.map((x) => x.firstWin)))} (${wins.map((x) => x.firstWin).sort((x, y) => x - y).join(', ')})` : '—'} | ${f1(mean(recs.map((x) => x.waves[0] ?? 0)))} | ${wins.length ? f1(mean(wins.map((x) => x.stars))) : '—'} |`,
    );
  }
  lines.push('');
  // волна гибели в каждой попытке и запас древа: на каждом уровне — по дорожкам; «на входе» — очки древа, ещё не потраченные к первой партии уровня
  lines.push('**Волна гибели по попыткам (победа — «В30»), номер попытки с первой победой и очки древа, не купленные на входе в уровень** (всё древо / только открытые ветки башен; всего в древе — по таблице `meta.upgrades`)');
  lines.push('');
  lines.push('| Уровень | Профиль, дорожка | Волны по попыткам | Первая победа | Не куплено на входе (всё / открытые) | Очков на входе |');
  lines.push('|---|---|---|---|---|---|');
  for (let level = 1; level <= 10; level++) {
    for (const l of [...lanes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || a.run - b.run)) {
      const x = l.levels.get(level);
      if (!x) continue;
      const waves = x.waves.map((w, i) => (x.results?.[i] === 'won' ? `В${w}` : String(w))).join(' → ');
      lines.push(`| ${level} | ${titleOf(l.profile)} ${l.run} | ${waves || '—'} | ${x.firstWin ?? `нет (${x.games})`} | ${x.treeLeftIn ? `${x.treeLeftIn.all} / ${x.treeLeftIn.open}` : '—'} | ${x.dnaIn ?? '—'} |`);
    }
  }
  lines.push('');
  const farmRows = [];
  for (let level = 1; level <= 10; level++) {
    for (const l of [...lanes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || a.run - b.run)) {
      const x = l.levels.get(level);
      if (x?.farm) farmRows.push(`| ${level} | ${titleOf(l.profile)} ${l.run} | ${x.farm.level} | ${x.farm.result === 'won' ? 'победа' : `гибель на ${x.farm.wave}-й волне`} | ${x.farm.dnaGame ?? '—'} (модель ${x.farm.dnaModel ?? '—'}) | ${x.attemptDnaText ?? x.farm.attemptDna ?? '—'} | ${x.farm.gameSec ?? '—'} / ${x.farm.realSec ?? '—'} |`);
    }
  }
  if (farmRows.length) {
    lines.push('**Контроль фарма: одна повторная партия на пройденном уровне после первой победы** (очки за повтор в игре и по модели, очки за победную попытку на новом уровне, время партии: игровое / реальное, секунд)');
    lines.push('');
    lines.push('| Уровень (победа) | Профиль, дорожка | Повтор уровня | Итог повтора | Очков за повтор | Очков за победную попытку | Время, с |');
    lines.push('|---|---|---|---|---|---|---|');
    lines.push(...farmRows);
    lines.push('');
  }
  lines.push('<details><summary>По дорожкам: партии до победы на каждом уровне, на каком уровне застряла, покупки</summary>');
  lines.push('');
  lines.push('```');
  for (const l of [...lanes.values()].sort((a, b) => a.profile.localeCompare(b.profile) || a.run - b.run)) {
    const parts = [...l.levels.values()].sort((a, b) => a.level - b.level).map((x) => `${x.level}: ${x.firstWin ?? `—(${x.games})`}`);
    lines.push(`${titleOf(l.profile)}, дорожка ${l.run}: ${parts.join(' · ')}${l.stuckAt ? ` · застряла на уровне ${l.stuckAt}` : ''} · очков в конце ${l.dna}`);
    for (const x of [...l.levels.values()].sort((a, b) => a.level - b.level)) {
      const buys = x.bought.flat();
      if (buys.length) lines.push(`    уровень ${x.level}: куплено ${buys.join('+')}`);
    }
  }
  lines.push('```');
  lines.push('</details>');
  lines.push('');
}

function chunkResultsEarly() {
  const out = [];
  if (args.chunks && args.chunks !== true && fs.existsSync(String(args.chunks))) {
    for (const file of findJson(String(args.chunks))) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data?.ladder && Array.isArray(data.games)) out.push(data);
      } catch {
        /* не результат бота — пропускаем */
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ опыт башен (замер 6.6, решение владельца 25 октября 2026)
{
  // у каждой партии — xpByWave: на начале волн 10/20/30/40/50 и в конце [вид, столбец, ряд, уровень, опыт] каждой башни; лучшая башня — с наибольшим опытом (Витамин в счёт не идёт: его опыт — доля чужого)
  const xpGames = [];
  for (const g of orderedGroups) g.games.forEach((game, i) => xpGames.push({ who: `${titleOf(g.profile)} — ${variant(g)}`, label: `партия ${i + 1}`, game }));
  for (const r of [...chunkResultsEarly(), ...ladderResults]) for (const game of r.games) xpGames.push({ who: titleOf(who(game)), label: `дорожка ${game.run}, уровень ${game.ladderLevel ?? '?'}, партия ${game.ladderGame ?? '?'}`, game });
  const withXp = xpGames.filter((x) => x.game.xpByWave);
  if (withXp.length) {
    const cols = ['10', '20', '30', '40', '50', 'end'];
    const best = (list) => {
      const own = (list ?? []).filter(([id]) => id !== 'vitamin');
      if (!own.length) return '—';
      const top = own.reduce((a, b) => (b[4] > a[4] ? b : a));
      return `${SHORT[top[0]] ?? top[0]} ур.${top[3]} ${f1(top[4])}`;
    };
    lines.push('### Опыт лучшей башни к 10/20/30/40/50-й волне (на начале волны) и в конце партии: вид, уровень, опыт (Витамин не учтён)');
    lines.push('');
    lines.push(`| Стратегия | Партия | Итог | ${cols.map((c) => (c === 'end' ? 'Конец' : `${c}-я`)).join(' | ')} |`);
    lines.push(`|---|---|---|${cols.map(() => '---').join('|')}|`);
    for (const x of withXp) lines.push(`| ${esc(x.who)} | ${x.label} | ${x.game.result === 'won' ? 'победа' : `гибель на ${x.game.wave}-й`} | ${cols.map((c) => best(x.game.xpByWave[c])).join(' | ')} |`);
    lines.push('');
  }
}

// ------------------------------------------------------------------ проблемы
const problems = [];
for (const g of orderedGroups) {
  const name = `${titleOf(g.profile)} (${variant(g)})`;
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
    const name = `${titleOf(who(game))}, серия ${game.series ?? game.run}, партия ${game.game ?? '?'}`;
    if (game.result === 'error') problems.push(`${name}: ОШИБКА — ${game.error}`);
    if (game.result === 'timeout') problems.push(`${name}: timeout (волна ${game.wave})`);
    for (const a of game.anomalies ?? []) problems.push(`${name}: ⚠ ${a}`);
    for (const w of game.warnings ?? []) problems.push(`${name}: консоль: ${w}`);
  }
}
// первые задачи уровня, доигранного двумя задачами (--chunks=папка, артефакты ladder-chunk-…): их партии в итог дорожки уже вошли через состояние, здесь — только их «⚠» и ошибки
const chunkResults = [];
if (args.chunks && args.chunks !== true && fs.existsSync(String(args.chunks))) {
  for (const file of findJson(String(args.chunks))) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data?.ladder && Array.isArray(data.games)) chunkResults.push(data);
    } catch {
      /* не результат бота — пропускаем */
    }
  }
}
for (const r of [...chunkResults, ...ladderResults]) {
  for (const game of r.games) {
    const name = `${titleOf(who(game))}, дорожка ${game.run}, уровень ${game.ladderLevel ?? '?'}, партия ${game.ladderGame ?? '?'}`;
    if (game.result === 'error') problems.push(`${name}: ОШИБКА — ${game.error}`);
    if (game.result === 'timeout') problems.push(`${name}: timeout (волна ${game.wave})`);
    for (const a of game.anomalies ?? []) problems.push(`${name}: ⚠ ${a}`);
    for (const w of game.warnings ?? []) problems.push(`${name}: консоль: ${w}`);
  }
}
if (args.plan && fs.existsSync(String(args.plan))) {
  try {
    const plan = JSON.parse(fs.readFileSync(String(args.plan), 'utf8'));
    const seen = new Set([...results, ...campaignResults, ...ladderResults].map((r) => r.tag)); // результаты серий (--campaign) и лестницы (--ladder) тоже считаются присланными
    for (const job of Array.isArray(plan) ? plan : plan.include ?? []) {
      if (!seen.has(job.tag)) problems.push(`задача «${job.tag}» (${titleOf(job.profile)}${job.exclude ? `, без ${job.exclude}` : ''}) не прислала результата: упала или не закончилась (см. лог задачи)`);
    }
  } catch (error) {
    problems.push(`не удалось прочитать план задач: ${error.message}`);
  }
}
lines.push('### Проблемы');
lines.push(problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'Нет: ни ошибок, ни «⚠», ни сообщений консоли, ни пропавших задач.');
lines.push('');

console.log(lines.join('\n'));
