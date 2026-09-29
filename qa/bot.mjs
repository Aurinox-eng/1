/**
 * Бот для замера баланса: играет в собранную игру «как человек» и сообщает, сколько секунд длились
 * партии, насколько густо было на экране и как близко бактерии подходили к красной линии.
 *
 * Запуск (профили ходят ПО ОДНОМУ, не параллельно; --speed не выше 2, иначе замер искажается):
 *   npm run qa:bot -- --profile=average --runs=5          один профиль
 *   npm run qa:bot -- --all --runs=5                      все четыре профиля подряд + итоговая таблица
 *   npm run qa:bot -- --tps=3 --error=25 --reaction=0.3   свой бот (без --profile)
 *
 * Профили и цели баланса:
 *   random6  тычет наугад 6 раз в секунду — проигрыш раньше 30 с (каждая партия)
 *   random3  тычет наугад 3 раза в секунду — проигрыш раньше 25 с (каждая партия)
 *   average  целится в бактерию, ближайшую к линии, 3 тапа/с, промах ±25 px, реакция 0.3 с — в среднем 45–60 с,
 *            к 30-й секунде на экране не меньше 8 бактерий, в каждой партии бактерия заходит в нижнюю треть
 *   strong   то же, 4 тапа/с, ±15 px, реакция 0.2 с — в среднем 70–100 с, в каждой партии — заход в нижнюю треть
 *
 * Параметры:
 *   --runs      сколько партий на профиль (по умолчанию 5)
 *   --speed     ускорение игрового времени (по умолчанию 2; выше 2 замер искажается)
 *   --max       предел длины партии в игровых секундах, потом бот сдаётся (по умолчанию 180)
 *   --tps --error --reaction --mode=aim|random   свой бот (или переопределить профиль)
 *   --cfg       временная подмена чисел из config.ts, например
 *               --cfg=bacteria.startSpeed:120,pill.speed:800 (вложенные — через несколько точек)
 *   --shots     в какие секунды партии делать скриншот, например --shots=10,30,60 (нужен --tag)
 *   --tag       папка для скриншотов: qa/screenshots/<tag>/<профиль>-t<секунда>.png
 *   --view      small (по умолчанию, окно 270×480 — игра идёт быстрее) или desktop (1280×720)
 * Все «секунды» здесь — игровые, то есть не зависят от --speed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gameToPage, launchBrowser, parseArgs, ROOT, sleep, startServer, VIEWPORTS } from './lib.mjs';

const PROFILES = {
  random6: { label: 'наугад, 6 тапов/с', mode: 'random', tps: 6, error: 0, reaction: 0, goal: { eachBelow: 30 } },
  random3: { label: 'наугад, 3 тапа/с', mode: 'random', tps: 3, error: 0, reaction: 0, goal: { eachBelow: 25 } },
  average: {
    label: 'целится, «средний»',
    mode: 'aim',
    tps: 3,
    error: 25,
    reaction: 0.3,
    goal: { meanFrom: 45, meanTo: 60, density30: 8, lowerThird: true },
  },
  strong: {
    label: 'целится, «сильный»',
    mode: 'aim',
    tps: 4,
    error: 15,
    reaction: 0.2,
    goal: { meanFrom: 70, meanTo: 100, lowerThird: true },
  },
};

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 5);
const speed = Number(args.speed ?? 2);
const maxSeconds = Number(args.max ?? 180);
const cfg = args.cfg ? `&cfg=${args.cfg}` : '';
const all = args.all === true;
const view = args.view === 'desktop' ? VIEWPORTS.desktop.viewport : { width: 270, height: 480 };
const shotTimes = args.shots ? String(args.shots).split(',').map(Number).filter((n) => n > 0) : [];
const tag = args.tag === undefined ? null : args.tag;
if (shotTimes.length && (typeof tag !== 'string' || !/^[\w-]+$/.test(tag))) {
  console.error('Для --shots нужен --tag=<название> (только буквы, цифры, «_» и «-»).');
  process.exit(2);
}
if (speed > 2) console.warn(`⚠️  --speed=${speed}: выше 2 кадры «грубее», бот тапает реже, чем задано, замер искажается.`);
const shotsDir = shotTimes.length ? path.join(ROOT, 'qa', 'screenshots', tag) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

/** В какие моменты партии (игровые секунды) замеряем, сколько бактерий на экране. */
const CHECKPOINTS = [1, 6, 15, 30];

/** Профиль по имени/флагам: --profile=… берёт пресет, отдельные флаги его переопределяют. */
function resolveProfiles() {
  if (all) return Object.entries(PROFILES).map(([name, p]) => ({ name, ...p }));
  const name = typeof args.profile === 'string' ? args.profile : 'custom';
  if (name !== 'custom' && !PROFILES[name]) {
    console.error(`Неизвестный профиль «${name}». Есть: ${Object.keys(PROFILES).join(', ')}.`);
    process.exit(2);
  }
  const base = PROFILES[name] ?? { label: 'свой бот', mode: 'aim', tps: 3, error: 25, reaction: 0.3, goal: {} };
  return [
    {
      name,
      ...base,
      mode: args.mode === 'random' || args.mode === 'aim' ? args.mode : base.mode,
      tps: args.tps !== undefined ? Number(args.tps) : base.tps,
      error: args.error !== undefined ? Number(args.error) : base.error,
      reaction: args.reaction !== undefined ? Number(args.reaction) : base.reaction,
    },
  ];
}

/** Случайное число с нормальным распределением (среднее 0, разброс sigma). */
function gaussian(sigma) {
  const u = 1 - Math.random();
  const v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const median = (list) => {
  if (!list.length) return NaN;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : NaN);

/** Какую долю игровой площадки (над красной линией) закрывают бактерии, в процентах. */
const fillPercent = (state) =>
  (state.bacteria.reduce((sum, b) => sum + Math.PI * b.r * b.r, 0) / (state.width * state.loseLineY)) * 100;

const server = await startServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: view });
const page = await context.newPage();
const problems = [];
const cfgWarnings = [];
page.on('pageerror', (err) => problems.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(msg.text());
  // Игра пишет «cfg: не понял …», если запись в --cfg не распознана (опечатка в названии)
  if (msg.type() === 'warning' && msg.text().startsWith('cfg:')) cfgWarnings.push(msg.text());
});

await page.goto(`${server.url}?qa&speed=${speed}&lang=ru${cfg}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pvb?.getState().state === 'playing');
if (cfgWarnings.length) {
  console.error(`ОСТАНОВКА: подмена --cfg не применилась, замер был бы по исходным числам.\n${cfgWarnings.join('\n')}`);
  await browser.close();
  await server.close();
  process.exit(2);
}

const getState = () => page.evaluate(() => window.__pvb.getState());

/** Начинает новую партию: перезапуск тапом после проигрыша или перезагрузка, если бот не проиграл. */
async function newGame(previousSurvived) {
  if (previousSurvived) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__pvb?.getState().state === 'playing');
  } else {
    await sleep(700); // защита экрана проигрыша от случайного тапа
    const centre = await gameToPage(page, 360, 640);
    await page.mouse.click(centre.x, centre.y);
    await page.waitForFunction(() => window.__pvb.getState().state === 'playing');
  }
}

/** Играет `runs` партий одним профилем и возвращает итоги. */
async function playProfile(profile, isLast) {
  const sessions = [];
  const density = Object.fromEntries(CHECKPOINTS.map((cp) => [cp, { counts: [], fills: [] }]));
  const shotsDone = new Set();
  console.log(`\n=== Профиль «${profile.name}»: ${profile.label} (${profile.tps} тапов/с${profile.mode === 'aim' ? `, промах ±${profile.error} px, реакция ${profile.reaction} с` : ''}) ===`);

  for (let run = 1; run <= runs; run++) {
    let lastTapAt = -Infinity;
    const seen = new Set();
    const lowIds = new Set(); // какие бактерии заходили в нижнюю треть экрана
    let lowTime = 0;
    let prev = await getState();
    let state = prev;

    while (state.state === 'playing' && state.elapsed < maxSeconds) {
      for (const at of shotTimes) {
        // скриншот делаем один раз на каждую отметку — в первой партии, которая до неё дожила
        if (state.elapsed >= at && !shotsDone.has(at)) {
          shotsDone.add(at);
          await page.screenshot({ path: path.join(shotsDir, `${profile.name}-t${at}.png`) });
          console.log(`  скриншот на ${at}-й секунде (партия ${run}, игровое время ${state.elapsed.toFixed(1)} с, жизней ${state.lives}, бактерий ${state.bacteria.length})`);
        }
      }
      for (const cp of CHECKPOINTS) {
        if (state.elapsed >= cp && !seen.has(cp)) {
          seen.add(cp);
          density[cp].counts.push(state.bacteria.length);
          density[cp].fills.push(fillPercent(state));
        }
      }

      // Нижняя треть экрана: сколько разных бактерий туда заходило и какую долю времени там кто-то был
      const lowerLine = (state.height * 2) / 3;
      const inLower = state.bacteria.filter((b) => b.bottom >= lowerLine);
      for (const b of inLower) lowIds.add(b.id);
      if (inLower.length) lowTime += Math.max(0, state.elapsed - prev.elapsed);

      if (state.elapsed - lastTapAt >= 1 / profile.tps) {
        let aimX = null;
        if (profile.mode === 'random') {
          aimX = 20 + Math.random() * (state.width - 40);
        } else {
          // Цель: бактерия ближе всего к красной линии из тех, что бот уже заметил. Пока к ней летит
          // столько таблеток, сколько у неё HP, новую не выпускает (добивает многожизненных подряд).
          const candidates = state.bacteria
            .filter((b) => b.age >= profile.reaction && b.bottom > 0)
            .filter((b) => state.pills.filter((p) => Math.abs(p.x - b.x) < b.r * 0.6 && p.y > b.y).length < b.hp)
            .sort((a, b) => b.bottom - a.bottom);
          if (candidates.length) aimX = candidates[0].x + gaussian(profile.error);
        }
        if (aimX !== null) {
          const point = await gameToPage(page, Math.min(state.width - 5, Math.max(5, aimX)), state.height - 300);
          await page.mouse.click(point.x, point.y);
          lastTapAt = state.elapsed;
        }
      }
      await sleep(15);
      prev = state;
      state = await getState();
    }

    const survived = state.state === 'playing';
    const accuracy = state.shots ? Math.round((state.hits / state.shots) * 100) : 0;
    const session = {
      seconds: state.elapsed,
      score: state.score,
      shots: state.shots,
      survived,
      lowEntries: lowIds.size,
      lowPercent: state.elapsed > 0 ? (lowTime / state.elapsed) * 100 : 0,
    };
    sessions.push(session);
    console.log(
      `Партия ${run}: ${state.elapsed.toFixed(1)} сек, очков ${state.score}, выстрелов ${state.shots}, ` +
        `меткость ~${accuracy}%, в нижней трети было бактерий: ${session.lowEntries} ` +
        `(${session.lowPercent.toFixed(0)}% времени), жизней осталось ${state.lives}/${state.maxLives}, ` +
        `типов появилось ${state.introduced.length}${survived ? ' (бот сдался по лимиту времени)' : ''}`,
    );
    if (run < runs || !isLast) await newGame(survived); // после самой последней партии перезапуск не нужен
  }
  return { profile, sessions, density };
}

/** Сравнивает итоги профиля с целями баланса: список {text, ok}. */
function judge({ profile, sessions, density }) {
  const goal = profile.goal ?? {};
  const seconds = sessions.map((s) => s.seconds);
  const checks = [];
  if (goal.eachBelow) {
    checks.push({
      text: `каждая партия короче ${goal.eachBelow} с (самая длинная ${Math.max(...seconds).toFixed(1)} с)`,
      ok: Math.max(...seconds) < goal.eachBelow,
    });
  }
  if (goal.meanFrom) {
    const m = mean(seconds);
    checks.push({ text: `средняя партия ${goal.meanFrom}–${goal.meanTo} с (получилось ${m.toFixed(1)} с)`, ok: m >= goal.meanFrom && m <= goal.meanTo });
  }
  if (goal.density30) {
    const c = density[30].counts;
    const med = median(c);
    checks.push({
      text: `к 30-й секунде на экране не меньше ${goal.density30} бактерий (медиана ${Number.isNaN(med) ? 'нет данных' : med.toFixed(1)}, дожили ${c.length} из ${sessions.length})`,
      ok: c.length > 0 && med >= goal.density30,
    });
  }
  if (goal.lowerThird) {
    const withEntry = sessions.filter((s) => s.lowEntries >= 1).length;
    checks.push({ text: `в каждой партии бактерия была в нижней трети (${withEntry} из ${sessions.length})`, ok: withEntry === sessions.length });
  }
  return checks;
}

const results = [];
const profileList = resolveProfiles();
for (const [index, profile] of profileList.entries()) {
  const result = await playProfile(profile, index === profileList.length - 1);
  results.push(result);

  const seconds = result.sessions.map((s) => s.seconds);
  console.log(`--- Итог профиля «${profile.name}» ---`);
  console.log(
    `Длина партии: СРЕДНЯЯ ${mean(seconds).toFixed(1)}, минимум ${Math.min(...seconds).toFixed(1)}, медиана ${median(seconds).toFixed(1)}, ` +
      `максимум ${Math.max(...seconds).toFixed(1)} сек (партий: ${seconds.length}). Очки (медиана): ${median(result.sessions.map((s) => s.score)).toFixed(0)}.`,
  );
  console.log(
    `Нижняя треть экрана: в среднем ${mean(result.sessions.map((s) => s.lowEntries)).toFixed(1)} бактерий за партию заходило, ` +
      `${mean(result.sessions.map((s) => s.lowPercent)).toFixed(0)}% времени там кто-то был.`,
  );
  console.log('Плотность на экране (медиана по партиям; «заполнено» — доля площадки над красной линией):');
  for (const cp of CHECKPOINTS) {
    const { counts, fills } = result.density[cp];
    console.log(
      counts.length
        ? `  ${String(cp).padStart(2)} с: ${median(counts).toFixed(1)} бактерий, заполнено ${median(fills).toFixed(0)}%  (дожили ${counts.length} из ${result.sessions.length})`
        : `  ${String(cp).padStart(2)} с: ни одна партия до этой секунды не дожила`,
    );
  }
  const gaveUp = result.sessions.filter((s) => s.survived).length;
  if (gaveUp) console.log(`⚠️  ${gaveUp} партий бот не проиграл до лимита ${maxSeconds} сек — они учтены в цифрах как есть.`);
  for (const c of judge(result)) console.log(`${c.ok ? '✅' : '❌'} ${c.text}`);
}

if (results.length > 1) {
  console.log('\n=== ИТОГОВАЯ ТАБЛИЦА ЗАМЕРОВ ===');
  console.log(`(партий на профиль: ${runs}, --speed=${speed}, окно ${view.width}×${view.height}${args.cfg ? `, подмена: ${args.cfg}` : ', числа из config.ts'})`);
  console.log('| Профиль | Средняя, с | от–до, с | Цель | Нижняя треть (партий с заходом) | На экране к 30 с | Цели |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = r.sessions.map((x) => x.seconds);
    const g = r.profile.goal;
    const goalText = g.eachBelow ? `каждая < ${g.eachBelow}` : `${g.meanFrom}–${g.meanTo}`;
    const c30 = r.density[30].counts;
    const verdicts = judge(r);
    console.log(
      `| ${r.profile.name} (${r.profile.label}) | ${mean(s).toFixed(1)} | ${Math.min(...s).toFixed(0)}–${Math.max(...s).toFixed(0)} | ${goalText} | ` +
        `${r.sessions.filter((x) => x.lowEntries >= 1).length} из ${r.sessions.length} | ${c30.length ? median(c30).toFixed(1) : '—'} | ` +
        `${verdicts.every((v) => v.ok) ? '✅ все' : `❌ ${verdicts.filter((v) => !v.ok).length} не выполнено`} |`,
    );
  }
}

await browser.close();
await server.close();
if (problems.length) console.log(`Ошибки консоли: ${[...new Set(problems)].join(' | ')}`);
process.exit(problems.length ? 1 : 0);
