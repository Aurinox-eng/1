/**
 * Бот для замера баланса: играет в собранную игру «как человек» и сообщает, сколько
 * секунд длились партии. Цель баланса — чтобы обычный игрок проигрывал за 30–60 секунд.
 *
 * Запуск: npm run qa:bot -- --runs=5 --tps=3 --error=25 --reaction=0.3 --speed=4
 *   --runs      сколько партий сыграть (по умолчанию 5)
 *   --tps       сколько раз в секунду бот способен тапать (человек — примерно 2–4). По умолчанию 3
 *   --error     насколько бот промахивается по горизонтали, пикселей (случайно ±). По умолчанию 25
 *   --reaction  через сколько секунд после появления бактерии бот её замечает. По умолчанию 0.3
 *   --speed     ускорение игрового времени (1 = обычное). По умолчанию 3
 *   --max       предел длины партии в игровых секундах, потом бот сдаётся (по умолчанию 180)
 *   --cfg       временная подмена чисел из config.ts, например --cfg=bacteria.startSpeed:120,pill.cooldownMs:200
 * Все «секунды» здесь — игровые, то есть не зависят от --speed.
 */
import { gameToPage, launchBrowser, parseArgs, sleep, startServer, VIEWPORTS } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runs = Number(args.runs ?? 5);
const tps = Number(args.tps ?? 3);
const aimError = Number(args.error ?? 25);
const reaction = Number(args.reaction ?? 0.3);
const speed = Number(args.speed ?? 3);
const maxSeconds = Number(args.max ?? 180);
const cfg = args.cfg ? `&cfg=${args.cfg}` : '';

/** Случайное число с нормальным распределением (среднее 0, разброс sigma). */
function gaussian(sigma) {
  const u = 1 - Math.random();
  const v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

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
for (let run = 1; run <= runs; run++) {
  let lastTapAt = -Infinity;
  let state = await page.evaluate(() => window.__pvb.getState());

  while (state.state === 'playing' && state.elapsed < maxSeconds) {
    if (state.elapsed - lastTapAt >= 1 / tps) {
      // Цель: самая нижняя бактерия, которую бот уже заметил и по которой ещё не летит таблетка
      const candidates = state.bacteria
        .filter((b) => b.age >= reaction && b.y > 0)
        .filter((b) => !state.pills.some((p) => Math.abs(p.x - b.x) < b.r && p.y > b.y))
        .sort((a, b) => b.y - a.y);
      if (candidates.length) {
        const target = candidates[0];
        const aimX = Math.min(state.width - 5, Math.max(5, target.x + gaussian(aimError)));
        const point = await gameToPage(page, aimX, state.height - 300);
        await page.mouse.click(point.x, point.y);
        lastTapAt = state.elapsed;
      }
    }
    await sleep(15);
    state = await page.evaluate(() => window.__pvb.getState());
  }

  const survived = state.state === 'playing';
  sessions.push({ seconds: state.elapsed, score: state.score, shots: state.shots, survived });
  const accuracy = state.shots ? Math.round((state.kills / state.shots) * 100) : 0;
  console.log(
    `Партия ${run}: ${state.elapsed.toFixed(1)} сек, очков ${state.score}, ` +
      `выстрелов ${state.shots}, меткость ~${accuracy}%${survived ? ' (бот сдался по лимиту времени)' : ''}`,
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
console.log(`Бот: ${tps} тапов/сек, ошибка прицела ±${aimError} px, реакция ${reaction} сек.${args.cfg ? ` Подмена: ${args.cfg}` : ''}`);
console.log(
  `Длина партии: минимум ${Math.min(...seconds).toFixed(1)}, медиана ${median(seconds).toFixed(1)}, ` +
    `максимум ${Math.max(...seconds).toFixed(1)} сек.`,
);
console.log(`В целевые 30–60 сек попало: ${inTarget} из ${sessions.length}`);
const gaveUp = sessions.filter((s) => s.survived).length;
if (gaveUp) console.log(`⚠️  ${gaveUp} партий бот не проиграл до лимита ${maxSeconds} сек — они учтены в цифрах выше как есть.`);
if (problems.length) console.log(`Ошибки консоли: ${[...new Set(problems)].join(' | ')}`);
process.exit(problems.length ? 1 : 0);
