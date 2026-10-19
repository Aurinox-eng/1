/**
 * Текущий уровень, какие башни на нём открыты и по каким правилам идут его волны.
 *
 * Номер уровня: при запуске — из адреса `?level=5` (по умолчанию 1; адрес с открытым у игрока уровнем открывает игру сразу на нём, минуя меню; с закрытым — главное меню); дальше его задаёт
 * `GameScene` при старте (`setCurrentLevel`). Башни открываются узлами древа (`meta.upgrades`, ветка `towers`); таблица уровней — `CONFIG.levels.specs`.
 */
import { CONFIG, type KindId, type LevelPlan, type LevelSpec } from './config';
import { ALL_TOWERS, LEVEL_WAVES, QA_ENABLED, QA_MODE } from './debug';
import { buildLevelWaves, spreadIntro, type WaveRow } from './waveGen';

/** Номер уровня из адреса (1…`levels.count`); без параметра — 1. */
export function levelFromUrl(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('level'));
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(CONFIG.levels.count, Math.floor(raw));
}

let current: number = levelFromUrl();

/** Открывать ли игру на главном меню: в игровой сборке — всегда, кроме адреса с `?level=N` для уровня, уже открытого у игрока (он открывает партию сразу); адрес с закрытым
 *  уровнем меню не обходит — открывается главное меню, а текущий уровень сбрасывается на 1. В режиме проверки (`?qa`) — только с `&menu` (иначе все прежние сценарии `smoke`
 *  и бот, которые открывают игру без номера уровня, оказывались бы в меню); в тестовой сборке без `?qa` адрес с уровнем работает как раньше, без проверки открытия.
 *  Функция, а не константа: проверку открытия подставляет `meta.ts` (`setLevelReachedCheck`), к моменту вызова из `main.ts` она уже зарегистрирована. */
export function startInMenu(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (QA_MODE) return params.has('menu');
  if (!params.has('level')) return true;
  if (QA_ENABLED || levelReached(current)) return false;
  current = 1;
  return true;
}

/** Номер текущего уровня (1…`levels.count`). */
export function currentLevel(): number {
  return current;
}

export function setCurrentLevel(level: number): void {
  current = Math.max(1, Math.min(CONFIG.levels.count, Math.floor(level)));
}

/** Что игрок больше всего ставил в последней партии: вид башни → вклад (число башен × 2^(уровень − 1)); хранится до закрытия страницы (для метки «рекомендуем» в дереве улучшений). */
let lastBuilt: Record<string, number> = {};

export function setLastBuilt(weights: Record<string, number>): void {
  lastBuilt = { ...weights };
}

/** Вид башни с наибольшим вкладом в последней партии (при равенстве — первый в таблице башен); null — партий ещё не было или башен не стояло. */
export function favoriteBranch(): string | null {
  let best: string | null = null;
  let most = 0;
  for (const id of Object.keys(CONFIG.towers)) {
    const weight = lastBuilt[id] ?? 0;
    if (weight > most) {
      most = weight;
      best = id;
    }
  }
  return best;
}

let levelReached: (level: number) => boolean = () => false;

/** `meta.ts` подставляет проверку «уровень уже открыт у игрока» (напрямую импортировать её сюда нельзя: `meta.ts` сам импортирует этот файл). */
export function setLevelReachedCheck(check: (level: number) => boolean): void {
  levelReached = check;
}

let towerOwned: (id: string) => boolean = () => false;

/** `meta.ts` подставляет проверку «узел башни куплен в древе» (по той же причине, что и выше). */
export function setTowerOwnedCheck(check: (id: string) => boolean): void {
  towerOwned = check;
}

/** Открыта ли башня: Таблетка — с начала, остальные — купленным узлом древа (документ дизайна docs/redesign-2026-10-19.md, раздел 5.1); открытая однажды башня доступна на всех уровнях.
 *  В режиме проверки `?qa&towers=all` открывает все башни (сценариям, которые проверяют сами башни, древо не нужно). */
export function isTowerOpen(id: string): boolean {
  return id === 'pill' || ALL_TOWERS || towerOwned(id);
}

/** Всё, что отличает один уровень от другого при игре: состав волн, их число, рост прочности и кривая наград. */
export interface LevelParams {
  /** Сколько волн идёт на уровне. */
  total: number;
  /** Состав волн: строка — волна, тип → сколько штук. */
  rows: Partial<Record<KindId, number>>[];
  growth: { perWave: number; fromWave: number; latePerWave: number; lateFromWave: number };
  /** Множитель прочности уровня поверх `waves.hpScale` (уровень 1 — `waves.level1HpFactor`, остальные — 1). */
  hpFactor: number;
  /** Точки [волна, множитель награды]. */
  rewardCurve: number[][];
  /** План уровня нового формата (волны, время, доход, боссы) или null — уровень прежнего формата. */
  plan: LevelPlan | null;
  /** Множитель брони видов на уровнях прежнего формата: 1 + `combat.armorGrowth.perLevel` · (уровень − 1); у уровня нового формата броня растёт с волной (`plan.armorPerWave`). */
  armorMul: number;
}

const KINDS = Object.keys(CONFIG.types) as KindId[];
const generated = new Map<number, LevelParams>();

/** Первая волна каждого типа по прежней таблице волн уровня 1 (`waves.list`; расписание, к которому «сглаживаются» уровни 2–10 прежнего формата). */
function levelOneSchedule(): Record<string, number> {
  const first: Record<string, number> = {};
  CONFIG.waves.list.forEach((row, i) => {
    for (const kind of Object.keys(row)) if (first[kind] === undefined) first[kind] = i + 1;
  });
  return first;
}

/** Расписание выхода типов уровня N: строка уровня со «сглаживанием» (`levels.gen.introSpread`, docs/stage-5b-plan.md, раздел 4). */
function levelIntro(level: number, intro: Record<string, number>): Record<string, number> {
  const spread = CONFIG.levels.gen.introSpread;
  const steps = Math.max(1, CONFIG.levels.count - 2);
  const own = Math.min(1, Math.max(0, (level - 2) / steps));
  const share = 1 - spread * (1 - own);
  return share >= 1 ? intro : spreadIntro(intro, levelOneSchedule(), share);
}

/** Правила уровня: уровень нового формата (`plan`, уровень 1) — по плану; уровень без `intro` (и любой уровень в режиме проверки без `&levelwaves`) — по прежней таблице `waves.list`; остальные — по генератору (`src/waveGen.ts`). */
export function levelParams(level: number): LevelParams {
  const w = CONFIG.waves;
  // В режиме проверки без `&levelwaves` все уровни идут прежним тестовым набором волн (`waves.list`, прежний формат): на нём построены проверки механик
  const spec: LevelSpec = LEVEL_WAVES ? (CONFIG.levels.specs[level - 1] ?? {}) : {};
  const growth = spec.growth ?? { perWave: w.hpGrowthPerWave, fromWave: w.hpGrowthFromWave, latePerWave: w.hpGrowthLatePerWave, lateFromWave: w.hpGrowthLateFromWave };
  const rewardCurve = spec.rewards ?? CONFIG.economy.rewardCurve;
  const count = spec.count ?? w.total;
  const armorMul = 1 + CONFIG.combat.armorGrowth.perLevel * (Math.max(1, level) - 1);
  if (spec.plan) {
    // Новый формат: в строке волны — обычные бактерии и стена (босс идёт отдельно, `plan.waves[i].boss`)
    const rows = spec.plan.waves.map((wave) => {
      const row: Partial<Record<KindId, number>> = { ...wave.mix };
      if (wave.wall) row[wave.wall[0]] = (row[wave.wall[0]] ?? 0) + wave.wall[1];
      return row;
    });
    return { total: rows.length, rows, growth, hpFactor: spec.plan.hpScale, rewardCurve, plan: spec.plan, armorMul: 1 };
  }
  if (!spec.intro || !spec.hpBudget) return { total: Math.min(count, w.list.length), rows: w.list, growth, hpFactor: w.level1HpFactor, rewardCurve, plan: null, armorMul };
  let params = generated.get(level);
  if (!params) {
    const gen = CONFIG.levels.gen;
    const rows = buildLevelWaves(
      { count, intro: levelIntro(level, spec.intro as Record<string, number>), hpBudget: spec.hpBudget, bosses: spec.bosses as Record<number, Record<string, number>> | undefined },
      { curveExp: gen.curveExp, rampWaves: gen.rampWaves, mix: gen.mix as Record<string, number>, introCount: gen.introCount as Record<string, number> },
      KINDS,
      (kind) => CONFIG.types[kind as KindId].hp,
    ) as WaveRow[];
    params = { total: rows.length, rows: rows as Partial<Record<KindId, number>>[], growth, hpFactor: CONFIG.levels.hpFactor[level] ?? 1, rewardCurve, plan: null, armorMul };
    generated.set(level, params);
  }
  return params;
}

/** Типы бактерий уровня по таблице уровней (не зависит от режима проверки): у уровня нового формата — из плана волн; у остальных — `intro` и боссы. */
export function levelKinds(level: number): KindId[] {
  const found = new Set<KindId>();
  const spec: LevelSpec = CONFIG.levels.specs[level - 1] ?? {};
  if (spec.plan) {
    for (const wave of spec.plan.waves) {
      for (const kind of Object.keys(wave.mix) as KindId[]) found.add(kind);
      if (wave.wall) found.add(wave.wall[0]);
    }
  } else if (level <= 1 || !spec.intro) {
    for (const row of CONFIG.waves.list) for (const kind of Object.keys(row) as KindId[]) found.add(kind);
  } else {
    for (const kind of Object.keys(spec.intro) as KindId[]) found.add(kind);
    for (const boss of Object.values(spec.bosses ?? {})) for (const kind of Object.keys(boss) as KindId[]) found.add(kind);
  }
  return KINDS.filter((kind) => found.has(kind));
}

/** Типы бактерий, которых не было на предыдущем уровне (на уровне 1 — пустой список: там все типы «первые», карточка про них не говорит). */
export function levelNewKinds(level: number): KindId[] {
  if (level <= 1) return [];
  const before = new Set(levelKinds(level - 1));
  return levelKinds(level).filter((kind) => !before.has(kind));
}
