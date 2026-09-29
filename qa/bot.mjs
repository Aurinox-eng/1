/**
 * Бот для замера баланса: играет в собранную игру «как человек» и сообщает, сколько
 * секунд длились партии и насколько густо было на экране. Цель баланса — чтобы обычный игрок
 * проигрывал за 30–60 секунд, а экран к 30-й секунде ощутимо заполнялся.
 *
 * Запуск: npm run qa:bot -- --runs=5 --tps=3 --error=25 --reaction=0.3 --speed=2
 *   --runs      сколько партий сыграть (по умолчанию 5)
 *   --tps       сколько раз в секунду бот способен тапать (человек — примерно 2–4). По умолчанию 3
 *   --error     насколько бот промахивается по горизонтали, пикселей (случайно ±). По умолчанию 25
 *   --reaction  через сколько секунд после появления бактерии бот её замечает. По умолчанию 0.3
 *   --speed     ускорение игрового времени (1 = обычное). По умолчанию 2. Большие значения искажают замер
 *   --max       предел длины партии в игровых секундах, потом бот сдаётся (по умолчанию 180)
 *   --mode      aim — целится в бактерию, ближайшую к красной линии (по умолчанию);
 *               random — «тыкает куда попало»: контроль, что от прицеливания в игре что-то зависит
 *   --shots     в какие секунды партии делать скриншот, например --shots=10,30,60 (нужен --tag)
 *   --tag       папка для скриншотов: qa/screenshots/<tag>/<режим>-t<секунда>.png
 *   --cfg       временная подмена чисел из config.ts, например
 *               --cfg=bacteria.startSpeed:120,sizes.large.points:15 (вложенные — через несколько точек)
 * Все «секунды» здесь — игровые, то есть не зависят от --speed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gameToPage, launchBrowser, parseArgs, ROOT, sleep, startServer, VIEWPORTS } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 5);
const tps = Number(args.tps ?? 3);
const aimError = Number(args.error ?? 25);
const reaction = Number(args.reaction ?? 0.3);
const speed = Number(args.speed ?? 2);
const maxSeconds = Number(args.max ?? 180);
const mode = args.mode === 'random' ? 'random' : 'aim';
const cfg = args.cfg ? `&cfg=${args.cfg}` : '';
const shotTimes = args.shots ? String(args.shots).split(',').map(Number).filter((n) => n > 0) : [];
const tag = args.tag === undefined ? null : args.tag;
if (shotTimes.length && (typeof tag !== 'string' || !/^[\w-]+$/.test(tag))) {
  console.error('Для --shots нужен --tag=<название> (только буквы, цифры, «_» и «-»).');
  process.exit(2);
}
const shotsDir = shotTimes.length ? path.join(ROOT, 'qa', 'screenshots', tag) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const shotsDone = new Set();
/** В какие моменты партии (игровые секунды) замеряем, сколько бактерий на экране. */
const CHECKPOINTS = [1, 6, 15, 30];

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

/** Какую долю игровой площадки (над красной линией) закрывают бактерии, в процентах. */
const fillPercent = (state) =>
  (state.bacteria.reduce((sum, b) => sum + Math.PI * b.r * b.r, 0) / (state.width * state.loseLineY)) * 100;

const server = await startServer();
const browser = await launchBrowser();
const device = VIEWPORTS.desktop;
const context = await browser.newContext({ viewport: device.viewport });
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

const sessions = [];
const density = Object.fromEntries(CHECKPOINTS.map((cp) => [cp, { counts: [], fills: [] }]));
for (let run = 1; run <= runs; run++) {
  let lastTapAt = -Infinity;
  const seen = new Set();
  let state = await page.evaluate(() => window.__pvb.getState());

  while (state.state === 'playing' && state.elapsed < maxSeconds) {
    for (const at of shotTimes) {
      // скриншот делаем один раз на каждую отметку — в первой партии, которая до неё дожила
      if (state.elapsed >= at && !shotsDone.has(at)) {
        shotsDone.add(at);
        await page.screenshot({ path: path.join(shotsDir, `${mode}-t${at}.png`) });
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

    if (state.elapsed - lastTapAt >= 1 / tps) {
      let aimX = null;
      if (mode === 'random') {
        aimX = 20 + Math.random() * (state.width - 40);
      } else {
        // Цель: бактерия ближе всего к красной линии из тех, что бот уже заметил. Пока к ней летит
        // столько таблеток, сколько у неё HP, новую не выпускает (добивает многожизненных подряд).
        const candidates = state.bacteria
          .filter((b) => b.age >= reaction && b.bottom > 0)
          .filter((b) => state.pills.filter((p) => Math.abs(p.x - b.x) < b.r * 0.6 && p.y > b.y).length < b.hp)
          .sort((a, b) => b.bottom - a.bottom);
        if (candidates.length) aimX = candidates[0].x + gaussian(aimError);
      }
      if (aimX !== null) {
        const point = await gameToPage(page, Math.min(state.width - 5, Math.max(5, aimX)), state.height - 300);
        await page.mouse.click(point.x, point.y);
        lastTapAt = state.elapsed;
      }
    }
    await sleep(15);
    state = await page.evaluate(() => window.__pvb.getState());
  }

  const survived = state.state === 'playing';
  sessions.push({ seconds: state.elapsed, score: state.score, shots: state.shots, survived });
  const accuracy = state.shots ? Math.round((state.hits / state.shots) * 100) : 0;
  console.log(
    `Партия ${run}: ${state.elapsed.toFixed(1)} сек, очков ${state.score}, выстрелов ${state.shots}, ` +
      `меткость ~${accuracy}%, уничтожено ${state.kills}, жизней осталось ${state.lives}/${state.maxLives}, ` +
      `типов появилось ${state.introduced.length}${survived ? ' (бот сдался по лимиту времени)' : ''}`,
  );

  if (run < runs) {
    if (survived) {
      // Партию не проиграли: перезапускаем страницу
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__pvb?.getState().state === 'playing');
    } else {
      await sleep(700); // защита экрана проигрыша от случайного тапа
      const centre = await gameToPage(page, 360, 640);
      await page.mouse.click(centre.x, centre.y);
      await page.waitForFunction(() => window.__pvb.getState().state === 'playing');
    }
  }
}

await browser.close();
await server.close();

const seconds = sessions.map((s) => s.seconds);
const inTarget = seconds.filter((s) => s >= 30 && s <= 60).length;
console.log('\n--- Итог ---');
console.log(
  `Бот (${mode === 'random' ? 'тыкает куда попало' : 'целится'}): ${tps} тапов/сек, ошибка прицела ±${aimError} px, ` +
    `реакция ${reaction} сек, --speed=${speed}.${args.cfg ? ` Подмена: ${args.cfg}` : ''}`,
);
const mean = seconds.reduce((sum, v) => sum + v, 0) / seconds.length;
console.log(
  `Длина партии: СРЕДНЯЯ ${mean.toFixed(1)}, минимум ${Math.min(...seconds).toFixed(1)}, медиана ${median(seconds).toFixed(1)}, ` +
    `максимум ${Math.max(...seconds).toFixed(1)} сек (партий: ${seconds.length}).`,
);
console.log(`В целевые 30–60 сек попало: ${inTarget} из ${sessions.length}`);
console.log(`Очки (медиана): ${median(sessions.map((s) => s.score)).toFixed(0)}`);
console.log('Плотность на экране (медиана по партиям; «заполнено» — доля площадки над красной линией):');
for (const cp of CHECKPOINTS) {
  const { counts, fills } = density[cp];
  console.log(
    counts.length
      ? `  ${String(cp).padStart(2)} с: ${median(counts).toFixed(1)} бактерий, заполнено ${median(fills).toFixed(0)}%  (дожили до этой секунды ${counts.length} из ${sessions.length})`
      : `  ${String(cp).padStart(2)} с: ни одна партия до этой секунды не дожила`,
  );
}
const gaveUp = sessions.filter((s) => s.survived).length;
if (gaveUp) console.log(`⚠️  ${gaveUp} партий бот не проиграл до лимита ${maxSeconds} сек — они учтены в цифрах выше как есть.`);
if (problems.length) console.log(`Ошибки консоли: ${[...new Set(problems)].join(' | ')}`);
process.exit(problems.length ? 1 : 0);
