/**
 * Эталонные наборы улучшений для ступенчатого замера уровней 2–10 (этап 5б, docs/stage-5b-plan.md, раздел 5).
 *
 * Модель. К приходу на уровень N игрок накопил очки ДНК: `start + perLevel × (N − 2)` (вариант А плана: 250 и 340). Перед k-й партией на уровне
 * к ним добавляется `(k − 1) × fail` (каждая проигранная партия «сильного» даёт ≈ 105 очков). Набор покупается тем же жадным порядком, что у бота
 * (`buyGreedy` в qa/lib.mjs): сначала улучшения этапа 6а, потом остальные по таблице, ветка башни — только если башня открыта на уровне N.
 *
 * Запуск (только расчёт, браузер не нужен):
 *   node qa/ladder-sets.mjs                       таблица для варианта А, партии 1 и 3
 *   node qa/ladder-sets.mjs --attempts=1,2,3      другие партии
 *   node qa/ladder-sets.mjs --start=250 --per-level=340 --fail=105
 *   node qa/ladder-sets.mjs --json                то же в виде JSON: [{ level, attempt, dna, spent, meta, bought }]
 *   node qa/ladder-sets.mjs --solo=fizz           наборы для замера «одна башня» (`bot.mjs --solo=fizz`): те же очки ДНК, но сначала улучшения ветки этой башни
 *                                                 (docs/fizz-solo-plan.md); эталонные наборы без --solo не меняются
 *   node qa/ladder-sets.mjs --solo=fizz --levels=5,10   только эти уровни (по умолчанию 2–10)
 * Строка `meta` вставляется в поле «meta» запуска balance.yml (или в `--meta=` бота).
 */
import { buyGreedy, buyOrder, buyOrderSolo, parseArgs, readMetaTable, readTowerUnlock } from './lib.mjs';

/** Очки к k-й партии на уровне N по модели. */
export function modelDna(level, attempt, { start = 250, perLevel = 340, fail = 105 } = {}) {
  return start + perLevel * (level - 2) + (attempt - 1) * fail;
}

/** Эталонный набор: { level, attempt, dna, spent, meta (строка «id:уровень,…»), levels }. */
export function referenceSet(level, attempt, model = {}, solo = null) {
  const { upgrades } = readMetaTable();
  const unlock = readTowerUnlock();
  const dna = modelDna(level, attempt, model);
  const empty = Object.fromEntries(Object.keys(upgrades).map((id) => [id, 0]));
  const bought = buyGreedy({ upgrades, order: solo ? buyOrderSolo(upgrades, solo) : buyOrder(upgrades), unlock, level, levels: empty, dna });
  const meta = Object.entries(bought.levels)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}:${n}`)
    .join(',');
  return { level, attempt, dna, spent: dna - bought.dna, meta, levels: bought.levels };
}

/** Все наборы для уровней 2–10 и заданных номеров партий. */
export function referenceSets(attempts = [1, 3], model = {}, levels = [2, 3, 4, 5, 6, 7, 8, 9, 10], solo = null) {
  const out = [];
  for (const level of levels) for (const attempt of attempts) out.push(referenceSet(level, attempt, model, solo));
  return out;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const num = (key, fallback) => {
    if (args[key] === undefined) return fallback;
    const value = Number(args[key]);
    if (!Number.isFinite(value) || value < 0) {
      console.error(`--${key}: нужно неотрицательное число`);
      process.exit(2);
    }
    return value;
  };
  const model = { start: num('start', 250), perLevel: num('per-level', 340), fail: num('fail', 105) };
  const attempts = String(args.attempts ?? '1,3')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1);
  if (!attempts.length) {
    console.error('--attempts: нужен список номеров партий, например 1,3');
    process.exit(2);
  }
  const solo = args.solo === undefined || args.solo === true ? null : String(args.solo);
  if (solo && !Object.values(readMetaTable().upgrades).some((u) => u.branch === solo)) console.error(`⚠ у башни «${solo}» нет своей ветки улучшений: набор совпадёт с обычным`);
  const levels = args.levels === undefined || args.levels === true ? undefined : String(args.levels).split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 2 && n <= 10);
  if (levels && !levels.length) {
    console.error('--levels: нужен список уровней 2–10, например 5,10');
    process.exit(2);
  }
  const sets = referenceSets(attempts, model, levels, solo);
  if (args.json) {
    console.log(JSON.stringify(sets.map(({ levels, ...rest }) => rest), null, 1));
  } else {
    if (solo) console.log(`Набор «одна башня»: сначала ветка башни «${solo}»`);
    console.log(`Модель: очки к уровню N = ${model.start} + ${model.perLevel} × (N − 2); к k-й партии + (k − 1) × ${model.fail}`);
    for (const s of sets) console.log(`уровень ${String(s.level).padStart(2)} · партия ${s.attempt} · очков ${String(s.dna).padStart(4)} (потрачено ${String(s.spent).padStart(4)}) · ${s.meta || '—'}`);
  }
}
