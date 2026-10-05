/**
 * Генератор состава волн для уровней 2–10 (docs/stage-5-plan.md, раздел 3). Модуль чистый: не читает `CONFIG`, всё получает параметрами,
 * поэтому его можно проверять отдельно от игры. Уровень 1 записан в таблице `waves.list` вручную и через генератор не идёт.
 *
 * Правила те же, по которым собраны волны уровня 1:
 *  • суммарная прочность волны (сумма HP всех бактерий до роста прочности) растёт плавно от `hpBudget[0]` в первой волне до `hpBudget[1]` в последней;
 *  • тип появляется в волне `intro[тип]`; в первую свою волну он выходит в небольшом числе (`introCount`), потом его доля растёт `rampWaves` волн
 *    до полной (`mix`: доля прочности волны, относительные веса);
 *  • у типов, уже вышедших, в каждой волне не меньше одной бактерии;
 *  • боссы (`bosses`) добавляются к волне сверх бюджета.
 */

/** Строка таблицы волн: тип бактерии → сколько штук. Ключ — id типа (`KindId` в config.ts). */
export type WaveRow = Record<string, number>;

export interface WaveGenSpec {
  /** Сколько волн. */
  count: number;
  /** Первая волна каждого типа (с единицы). Типа в таблице нет — на уровне его нет (кроме боссов). */
  intro: Record<string, number>;
  /** Суммарная прочность первой и последней волны (без роста прочности и без боссов). */
  hpBudget: [number, number];
  /** Боссы: номер волны → сколько каких бактерий добавить. */
  bosses?: Record<number, Record<string, number>>;
}

export interface WaveGenRules {
  /** Показатель кривой роста: 1 — по прямой, больше — медленный старт и крутой конец (у уровня 1 — около 1,5). */
  curveExp: number;
  /** За сколько волн после выхода доля типа доходит до полной. */
  rampWaves: number;
  /** Доля прочности волны у типа на полном росте (относительные веса: делятся на сумму весов вышедших типов). */
  mix: Record<string, number>;
  /** Сколько штук нового типа в его первую волну (нет в таблице — тип входит наравне с остальными по доле). */
  introCount: Record<string, number>;
}

/** Состав волн по правилам: `kinds` — все типы в порядке таблицы (порядок ключей в строках), `hpOf` — прочность типа из таблицы типов. */
export function buildLevelWaves(spec: WaveGenSpec, rules: WaveGenRules, kinds: string[], hpOf: (kind: string) => number): WaveRow[] {
  const rows: WaveRow[] = [];
  const [b0, b1] = spec.hpBudget;
  for (let w = 1; w <= spec.count; w++) {
    const t = spec.count > 1 ? (w - 1) / (spec.count - 1) : 1;
    const budget = b0 + (b1 - b0) * Math.pow(t, rules.curveExp);
    const active = kinds.filter((kind) => spec.intro[kind] !== undefined && spec.intro[kind] <= w);
    // Новые типы в первую волну: заданное число, но не больше половины бюджета на все новые вместе (хотя бы одна штука)
    const fresh = active.filter((kind) => spec.intro[kind] === w && rules.introCount[kind] !== undefined && active.length > 1);
    const row: WaveRow = {};
    let spent = 0;
    for (const kind of fresh) {
      const room = Math.floor((0.5 * budget) / fresh.length / hpOf(kind));
      const n = Math.max(1, Math.min(rules.introCount[kind], room));
      row[kind] = n;
      spent += n * hpOf(kind);
    }
    const rest = Math.max(0, budget - spent);
    const others = active.filter((kind) => !fresh.includes(kind));
    const weight = (kind: string): number => (rules.mix[kind] ?? 0) * Math.min(1, (w - spec.intro[kind] + 1) / rules.rampWaves);
    const sum = others.reduce((total, kind) => total + weight(kind), 0);
    for (const kind of others) {
      const share = sum > 0 ? weight(kind) / sum : 1 / others.length;
      const established = spec.intro[kind] < w;
      row[kind] = Math.max(established ? 1 : 0, Math.round((rest * share) / hpOf(kind)));
    }
    for (const [kind, n] of Object.entries(spec.bosses?.[w] ?? {})) row[kind] = (row[kind] ?? 0) + n;
    for (const kind of Object.keys(row)) if (row[kind] <= 0) delete row[kind];
    rows.push(row);
  }
  return rows;
}
