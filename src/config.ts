/**
 * ============================================================
 *  ВСЕ ПАРАМЕТРЫ БАЛАНСА ИГРЫ «ТАБЛЕТКИ ПРОТИВ БАКТЕРИЙ» (tower defense)
 * ============================================================
 *
 *  Как менять: правьте ТОЛЬКО числа справа от двоеточия, потом сохраните файл.
 *  Если запущено `npm run dev`, игра обновится сама.
 *  Быстро попробовать число, не трогая файл: в режиме `npm run dev` допишите к адресу игры
 *  `?qa&cfg=раздел.параметр:число`, например  http://localhost:5173/?qa&cfg=economy.startCoins:300
 *  (для вложенных параметров — через несколько точек: `?qa&cfg=towers.pill.range:260`).
 *
 *  Единицы измерения:
 *   • «пикселей» — точки игрового мира. Карта 18×14 клеток по 103 пикселя (это ≈1854×1442 плюс зона организма слева).
 *     Экран игры всегда 1280×720 (горизонтальный, 16:9); на любом устройстве он просто масштабируется.
 *   • «сек» — секунды, «мс» — миллисекунды (1 сек = 1000 мс).
 *
 *  КАК УСТРОЕНА ИГРА (коротко):
 *   • Бактерии выходят справа и идут по кривым дорожкам к организму (красная линия слева); на каждой
 *     развилке выбирают путь случайно. Дошла — исчезает и отнимает жизнь. Жизни кончились — проигрыш. Все волны отбиты — победа.
 *   • Игрок выбирает башню на панели справа и тапает по свободной клетке. Башня сама стреляет по бактериям.
 *   • За каждую убитую бактерию — монеты; на них покупаются новые башни.
 *   • Карту можно двигать пальцем и приближать (щипок, колесо мыши).
 *
 *  Пока баланс — первое приближение и НЕ замерен ботом (бот под tower defense будет на этапе 3).
 */
import { applyConfigOverrides } from './debug';

/** Как башня бьёт (см. таблицу башен ниже). */
export type Targeting = 'radius' | 'area' | 'puddle' | 'beam';
/** Все типы бактерий (ключи таблицы `types`; нужен для таблицы волн — она описана раньше, чем сам список типов). */
export type KindId = 'coccus' | 'rod' | 'splitter' | 'armored' | 'spore' | 'swarm' | 'runner' | 'healer' | 'slick' | 'regen' | 'commander' | 'brood' | 'giant';
/** Строка таблицы уровней (`levels.specs`): что отличает уровень от уровня 1. Все поля необязательные; подробности — в комментарии к таблице. */
export interface LevelSpec {
  count?: number;
  intro?: Partial<Record<KindId, number>>;
  hpBudget?: [number, number];
  bosses?: Record<number, Partial<Record<KindId, number>>>;
  growth?: { perWave: number; fromWave: number; latePerWave: number; lateFromWave: number };
  rewards?: number[][];
}
/**
 * Мутация башни (выбор на уровнях 2 и 4): заплатка к числам башни. Все поля необязательны, пропущенное — «не меняет».
 *  damageMul, cooldownMul, blastMul, puddleRadiusMul — множители урона, паузы, радиуса взрыва, радиуса лужи;
 *  slowFactor — замедление в луже (меньше — сильнее; берётся меньшее из текущего и этого);
 *  pulsesAdd — ударов в очереди луча сверх текущих;
 *  armorPierce — удар игнорирует броню; extraTargets — сколько ещё целей бьёт за выстрел; toughest — бьёт самую прочную цель в радиусе;
 *  poisonPerSec — лужа жжёт всех в ней на столько HP в секунду; puddleCount — сколько луж за выстрел;
 *  chain — после взрыва второй (радиус ×0,7, урон ×0,6) на ближайшей бактерии; acidSec, acidMul — задетые получают acidMul× урона acidSec секунд;
 *  secondBeam — второй луч под 90° к первому; spiral — каждый следующий удар очереди сильнее на столько урона.
 */
export interface MutationSpec {
  id: string;
  damageMul?: number;
  cooldownMul?: number;
  blastMul?: number;
  puddleRadiusMul?: number;
  slowFactor?: number;
  pulsesAdd?: number;
  armorPierce?: boolean;
  extraTargets?: number;
  toughest?: boolean;
  poisonPerSec?: number;
  puddleCount?: number;
  chain?: boolean;
  acidSec?: number;
  acidMul?: number;
  secondBeam?: boolean;
  spiral?: number;
}
/** Куда смотрит башня: любых в радиусе, только «вперёд» (ещё не дошли до башни) или только «назад» (уже прошли). */
export type TowerSide = 'both' | 'forward' | 'back';

export const CONFIG = {
  // ------------------------------------------------------------
  //  ЭКРАН И КАРТА
  // ------------------------------------------------------------
  screen: {
    /** Размер экрана игры, пикселей. Соотношение 16:9. */
    width: 1280,
    height: 720,
  },
  map: {
    /** Ширина зоны «организм» слева, пикселей. Красная линия — на её правом краю. */
    orgW: 150,
    /** Сторона клетки, пикселей. На телефоне 844×390 при обычном приближении это ≈56 px: палец (44 px) помещается. */
    tile: 103,
    /** Ширина правой панели (волна, монеты, жизни, башни), пикселей. Панель всегда на экране. */
    panelW: 200,
    /** Ширина дорожки, пикселей. Бактерия чуть шире дорожки (бронированная) слегка выходит за её край. */
    pathWidth: 86,
    /** Клетки, центр которых дальше этого расстояния от дорожки, закрыты для башен (там башня ничего бы не достала): пикселей.
     *  240 — для самой дальнобойной башни; оставляет около 115 из 158 свободных клеток (было 158, из них 35 бесполезных). */
    buildMaxDistPx: 240,
  },

  // ------------------------------------------------------------
  //  КАМЕРА (сдвиг и приближение карты)
  // ------------------------------------------------------------
  camera: {
    /** Приближение при старте: 1 = обычный размер клеток. */
    zoomStart: 1,
    /** Самое сильное отдаление не задаётся числом: считается из размеров карты и окна так, чтобы карта помещалась целиком и по ширине, и по высоте (≈ 0.499). */
    /** Самое сильное приближение. */
    zoomMax: 1.5,
    /** Чувствительность колеса мыши: во сколько раз меняется масштаб за один «щелчок» (~100 единиц колеса) —
     *  это e в степени этого числа × 100. 0.0015 → примерно ×1,16 за щелчок. */
    wheelSpeed: 0.0015,
    /** Касание считается тапом (а не началом сдвига карты), если палец сместился не больше, пикселей экрана игры.
     *  22 на телефоне 844×390 ≈ 12 px на самом стекле: обычное дрожание пальца при тапе (5–10 px) — ещё тап. */
    tapMaxMovePx: 22,
    /** … и продержалось не дольше, миллисекунд. */
    tapMaxMs: 500,
  },

  // ------------------------------------------------------------
  //  ЖИЗНИ И МОНЕТЫ
  // ------------------------------------------------------------
  lives: {
    /** Сколько жизней у игрока в начале уровня. */
    start: 3,
  },
  economy: {
    /** Сколько монет у игрока в начале уровня: четыре «Таблетки» с запасом или «Таблетка» + «Сироп» + «Таблетка».
     *  Было 250 (круг 15, замер): «средний» гибнет на 5,6-й волне с 30 монетами в кармане; при 350 — без изменений (5,6), при 450 — 9,2 (цель 8–14). */
    startCoins: 450,
    /** Доля цены, которая возвращается при продаже башни (продажа появится позже). */
    sellRefund: 0.7,
    /** «Дефляция»: награда за бактерию = номинал из таблицы `types` × rewardMul × множитель волны из `rewardCurve`. Бактерий на волнах много, поэтому деньги от их
     *  числа не должны расти: игрок вкладывается в слияние и мутации, а не в ряды башен. Дробные монеты копятся и добавляются, когда набирается целая
     *  (на экране монеты целые). rewardMul — общий множитель (1 — как в кривой; удобно для замеров «веером»). */
    rewardMul: 1,
    /** Множитель наград по волнам: точки [волна, множитель], между ними — по прямой, после последней — как в ней. Деньги в начале уровня нужны на первые башни
     *  (волны 1–12 — самые тесные), а к концу уровня наград меньше: слитые башни 4-го уровня и так справляются, лишние деньги не нужны.
     *  Доход за 30 волн уровня 1 при этой кривой (расчёт): к 4-й волне ≈ 104 монеты, к 8-й ≈ 434, к 12-й ≈ 1 004, к 20-й ≈ 2 583, к 30-й ≈ 4 991 (плюс старт 250).
     *  Было (круг 14, первая версия): 0,3 на всех волнах — 49 / 234 / 635 / 2 357 / 7 084. Замер: боты умирали на 3–8-й волне, а победившие к 10-й волне побеждали легко. */
    rewardCurve: [
      [1, 0.7],
      [8, 0.5],
      [16, 0.28],
      [30, 0.1],
    ] as number[][],
  },

  // ------------------------------------------------------------
  //  УРОВНИ: КАКИЕ БАШНИ ОТКРЫТЫ
  // ------------------------------------------------------------
  levels: {
    /** Сколько уровней в игре (план: 10; меню уровней — этап 5). Номер текущего уровня берётся из адреса `?level=N` (по умолчанию 1). */
    count: 10,
    /** С какого уровня башня доступна (до него в панели серая, с замком и надписью «Уровень N»). Шприц открывается последним: он слишком сильный.
     *  Игра на уровне 1 идёт только Таблеткой и Сиропом; в начале уровня, на котором башня открылась, показывается плашка с её описанием. */
    towerUnlock: { pill: 1, syrup: 1, fizz: 5, syringe: 10 } as Record<string, number>,
    /** Звёзды за победу (docs/stage-5-plan.md, раздел 4): ★ — любая победа; ★★ — потеряно жизней не больше maxLostFor2; ★★★ — не больше maxLostFor3 (0 — без потерь).
     *  Считается по числу потерянных жизней (жизни от улучшений порог не сдвигают); дробные потери (рой отнимает по 0,25) учитываются как есть. */
    stars: { maxLostFor3: 0, maxLostFor2: 1 },
    /** Очков ДНК за каждую новую, ещё не получавшуюся звезду уровня (максимум 3 × это число за уровень). 0 — звёзды очков не дают. */
    starDna: 10,
    /** Правила генератора состава волн уровней 2–10 (`src/waveGen.ts`; уровень 1 записан вручную в таблице волн раздела ниже и через генератор не идёт).
     *  curveExp — показатель кривой суммарной прочности волны (1 — прямая; у уровня 1 около 1,5: медленный старт, крутой конец);
     *  rampWaves — за сколько волн после выхода доля нового типа доходит до полной;
     *  mix — доля прочности волны у типа на полном росте (относительные веса; взяты из состава 30-й волны уровня 1, у новых типов — по смыслу: сильные поменьше, слабые побольше);
     *  introCount — сколько штук типа выходит в его первую волну (рой — пачкой в 8; боссы идут отдельно, через bosses). */
    gen: {
      curveExp: 1.5,
      rampWaves: 4,
      mix: { coccus: 0.06, rod: 0.24, swarm: 0.1, runner: 0.18, splitter: 0.17, armored: 0.26, spore: 0.1, slick: 0.1, regen: 0.1, healer: 0.06, commander: 0.05, brood: 0.1 } as Partial<Record<KindId, number>>,
      introCount: { rod: 2, swarm: 8, runner: 3, splitter: 2, armored: 2, spore: 3, slick: 2, regen: 2, healer: 2, commander: 1, brood: 1 } as Partial<Record<KindId, number>>,
    },
    /** Уровни: строка номер N — уровень N. Пустая строка (уровень 1) — всё из таблицы волн, роста прочности и наград ниже (`waves`, `economy.rewardCurve`).
     *  Поля строки (все необязательные):
     *   count    — сколько волн (нет — `waves.total`);
     *   intro    — первая волна каждого типа бактерий; есть — состав волн строит генератор (тогда нужен и hpBudget);
     *   hpBudget — суммарная прочность первой и последней волны до роста прочности и без боссов (у уровня 1: 8 и 1012);
     *   bosses   — боссы: номер волны → сколько каких бактерий добавить сверх бюджета;
     *   growth   — свой рост прочности {perWave, fromWave, latePerWave, lateFromWave} (нет — как в `waves`);
     *   rewards  — своя кривая наград (нет — `economy.rewardCurve`).
     *  Числа уровней 2–10 — предварительные (этап 5а, docs/stage-5-plan.md): итоговый подбор — после расширения дерева улучшений (этап 6б).
     *  Известные по прошлым уровням типы выходят с 1–6-й волны подряд, новый тип этого уровня — после них. Названия уровней — в `src/i18n.ts`. */
    specs: [
      {},
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 8 }, hpBudget: [10, 1093] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 9 }, hpBudget: [10, 1174] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 10 }, hpBudget: [10, 1255] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 11 }, hpBudget: [10, 1336] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 12 }, hpBudget: [10, 1417] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 13 }, hpBudget: [10, 1498] },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12 }, hpBudget: [10, 1579], bosses: { 20: { giant: 1 }, 25: { giant: 1 }, 30: { giant: 2 } } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12 }, hpBudget: [10, 1659], bosses: { 15: { giant: 1 }, 20: { giant: 1 }, 25: { giant: 2 }, 30: { giant: 2 } } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12 }, hpBudget: [10, 1740], bosses: { 20: { giant: 1 }, 25: { giant: 2 }, 30: { giant: 3 } } },
    ] as LevelSpec[],
  },

  // ------------------------------------------------------------
  //  БАШНИ (таблица: одна строка — одна башня; новая башня = новая строка)
  // ------------------------------------------------------------
  //  Колонки:
  //   price          — цена в монетах
  //   range          — радиус стрельбы, пикселей (клетка = 103 px, то есть 200 ≈ две клетки); у башни с лучом ('beam') радиуса нет — 0
  //   damage         — сколько HP снимает один выстрел (каждой задетой бактерии; у бронированных броня вычитается, см. combat)
  //   cooldownMs     — пауза между выстрелами, мс
  //   projectileSpeed— скорость снаряда, пикселей в секунду
  //  Способ стрельбы — колонка targeting (КАК бьёт) и side (КУДА смотрит):
  //   targeting:
  //     'radius' — каждый выстрел по одной бактерии из тех, что в радиусе (выбирается ближайшая к организму);
  //     'area'   — снаряд летит в цель и взрывается: урон ВСЕМ в круге blastRadius вокруг места взрыва;
  //     'puddle' — НЕ бьёт бактерий: бросает на дорожку (впереди идущей бактерии) лужу, в которой бактерии замедляются;
  //     'beam'   — НАПРАВЛЕННЫЙ ЛУЧ: игрок поворачивает башню (тап по башне — на 45°), башня бьёт очередью по линии через всю карту.
  //   side (для 'radius' и 'area'; «вперёд/назад» считается по дорожкам — расстояние до организма у башни и у бактерии):
  //     'both' — любых в радиусе; 'forward' — только тех, кто ещё не дошёл до башни; 'back' — только тех, кто уже прошёл.
  //  Особые свойства (0 — свойства нет):
  //   blastRadius — радиус взрыва, пикселей ('area')
  //   slowFactor, slowSec — замедление: бактерия идёт в slowFactor раз медленнее (0.4 = на 60 % медленнее); slowSec — сколько секунд
  //                         замедление держится после того, как бактерия вышла из лужи ('puddle')
  //   puddleRadius, puddleSec, puddleLeadPx — лужа ('puddle'): радиус, сколько секунд живёт, на сколько пикселей впереди бактерии кладётся
  //   beamPulses, beamGapMs, beamLengthPx, beamHalfWidthPx — луч ('beam'): сколько ударов в очереди, пауза между ними, длина луча
  //                         (больше диагонали карты: луч идёт до её края), полуширина попадания (к радиусу бактерии прибавляется)
  towers: {
    /** Таблетка — базовая башня: дёшево, бьёт одну бактерию в радиусе. Слаба против брони (урон 1 — броня 2 почти не пробивается). */
    pill: {
      price: 70,
      range: 200,
      damage: 1,
      cooldownMs: 1000,
      projectileSpeed: 620,
      targeting: 'radius' as Targeting,
      side: 'both' as TowerSide,
      blastRadius: 0,
      slowFactor: 1,
      slowSec: 0,
      puddleRadius: 0,
      puddleSec: 0,
      puddleLeadPx: 0,
      beamPulses: 0,
      beamGapMs: 0,
      beamLengthPx: 0,
      beamHalfWidthPx: 0,
    },
    /** Сироп — не стреляет по бактериям: бросает на дорожку лужу, в которой все идут на 60 % медленнее. Урона нет; нужен там, где остальные не успевают (быстрые, броня). */
    syrup: {
      price: 100,
      range: 210,
      damage: 0,
      cooldownMs: 2200,
      projectileSpeed: 520,
      targeting: 'puddle' as Targeting,
      side: 'both' as TowerSide,
      blastRadius: 0,
      slowFactor: 0.4,
      slowSec: 0.6,
      puddleRadius: 62,
      puddleSec: 7,
      puddleLeadPx: 130,
      beamPulses: 0,
      beamGapMs: 0,
      beamLengthPx: 0,
      beamHalfWidthPx: 0,
    },
    /** Шипучка — взрыв по малой площади: медленный снаряд, большой урон всем в маленьком круге. Убийца кучек (Рой, дети делящейся); по одиночным слабее Таблетки. */
    fizz: {
      price: 140,
      range: 210,
      damage: 3,
      cooldownMs: 2600,
      projectileSpeed: 420,
      targeting: 'area' as Targeting,
      side: 'both' as TowerSide,
      blastRadius: 55,
      slowFactor: 1,
      slowSec: 0,
      puddleRadius: 0,
      puddleSec: 0,
      puddleLeadPx: 0,
      beamPulses: 0,
      beamGapMs: 0,
      beamLengthPx: 0,
      beamHalfWidthPx: 0,
    },
    /** Шприц — направленный луч: игрок задаёт направление (тап по правой половине башни — поворот на 45° по часовой стрелке, по левой — против),
     *  башня бьёт очередью по линии через всю карту, всех на линии. Радиуса действия у Шприца нет (range 0): луч идёт до края карты (beamLengthPx больше
     *  диагонали карты). Очередь — два удара по 3 (урон 3 против брони 2 даёт 1 — настоящую броню пробивает мутация «Бронебойный»); ставить надо вдоль
     *  прямого участка дороги. Ослаблен по просьбе владельца (было: цена 150, урон 5, три удара — слишком сильный, а Шипучка рядом теряла смысл). */
    syringe: {
      price: 200,
      range: 0,
      damage: 3,
      cooldownMs: 2400,
      projectileSpeed: 0,
      targeting: 'beam' as Targeting,
      side: 'both' as TowerSide,
      blastRadius: 0,
      slowFactor: 1,
      slowSec: 0,
      puddleRadius: 0,
      puddleSec: 0,
      puddleLeadPx: 0,
      beamPulses: 2,
      beamGapMs: 180,
      beamLengthPx: 3000,
      beamHalfWidthPx: 10,
    },
  },

  // ------------------------------------------------------------
  //  УРОВНИ БАШЕН И МУТАЦИИ (этап 4: слияние)
  // ------------------------------------------------------------
  //  Две одинаковые башни одного уровня сливаются в одну уровнем выше (бесплатно; результат — в клетке, по которой тапнули вторым). Уровней столько,
  //  сколько строк в `towerLevels`. Башня уровня L стоит (для продажи) цены × 2^(L−1): в неё «вложено» столько обычных башен.
  //  Колонки строки уровня:
  //   damageMul     — множитель урона (у Сиропа урона нет: вместо него растут лужа и замедление, см. ниже)
  //   cooldownMul   — множитель паузы между выстрелами (меньше — быстрее)
  //   reachMul      — множитель радиуса стрельбы, радиуса взрыва и радиуса лужи
  //   pulsesAdd     — ударов в очереди луча (Шприц) сверх обычных
  //   slowPower     — замедление лужи Сиропа возводится в эту степень (1 — как у уровня 1; больше — сильнее: 0.4 → 0.4^1.25 ≈ 0.32)
  //   puddleSecMul  — множитель времени жизни лужи
  towerLevels: [
    { damageMul: 1, cooldownMul: 1, reachMul: 1, pulsesAdd: 0, slowPower: 1, puddleSecMul: 1 },
    { damageMul: 1.9, cooldownMul: 0.95, reachMul: 1.04, pulsesAdd: 0, slowPower: 1.15, puddleSecMul: 1.15 },
    { damageMul: 3.6, cooldownMul: 0.9, reachMul: 1.08, pulsesAdd: 0, slowPower: 1.3, puddleSecMul: 1.3 },
    { damageMul: 6.4, cooldownMul: 0.85, reachMul: 1.12, pulsesAdd: 1, slowPower: 1.45, puddleSecMul: 1.45 },
  ],
  /** Уровни, на которых башня получает выбор мутации (по одному выбору на каждый порог; выбор бесплатный и окончательный). */
  mutationLevels: [2, 4] as number[],
  /** Мутации по башням: для каждой башни — список порогов (по порядку mutationLevels), в каждом два варианта на выбор. */
  mutations: {
    pill: [
      [{ id: 'pillRapid', cooldownMul: 0.65 }, { id: 'pillPierce', armorPierce: true }],
      [{ id: 'pillDouble', extraTargets: 1 }, { id: 'pillHunter', toughest: true, damageMul: 1.5 }],
    ],
    syrup: [
      [{ id: 'syrupSticky', slowFactor: 0.25 }, { id: 'syrupWide', puddleRadiusMul: 1.6 }],
      [{ id: 'syrupCaustic', poisonPerSec: 1.5 }, { id: 'syrupTwin', puddleCount: 2 }],
    ],
    fizz: [
      [{ id: 'fizzBig', blastMul: 1.5 }, { id: 'fizzFast', cooldownMul: 0.65 }],
      [{ id: 'fizzChain', chain: true }, { id: 'fizzAcid', acidSec: 3, acidMul: 1.5 }],
    ],
    syringe: [
      [{ id: 'syringeMore', pulsesAdd: 1 }, { id: 'syringePierce', damageMul: 1.5, armorPierce: true }],
      [{ id: 'syringeTwin', secondBeam: true }, { id: 'syringeSpiral', spiral: 2 }],
    ],
  } as Record<string, MutationSpec[][]>,

  // ------------------------------------------------------------
  //  ТИПЫ БАКТЕРИЙ (таблица: одна строка — один тип)
  // ------------------------------------------------------------
  //  Колонки:
  //   hp          — сколько HP (1 выстрел = damage башни)
  //   speedFactor — во сколько раз быстрее (>1) или медленнее (<1), чем bacteria.baseSpeed
  //   reward      — монеты за уничтожение
  //   lifeDamage  — сколько жизней отнимает, дойдя до организма (дробное число копится: 0.25 — четыре таких отнимают одну жизнь)
  //   radius      — радиус, пикселей (у палочки — половина ширины)
  //   length      — длина, пикселей (только у палочки; у остальных 0)
  //  Особые свойства (0 — свойства нет):
  //   armor                             — БРОНЯ: каждый удар слабее на armor (но не меньше combat.armorMinShare от удара)
  //   dashEverySec, dashSec, dashFactor — РЫВКИ: раз в dashEverySec секунд на dashSec секунд скорость растёт в dashFactor раз
  //   splitCount, splitGapPx            — ДЕЛЕНИЕ при гибели: сколько кокков появляется и на каком расстоянии друг от друга
  //                                       (вдоль дорожки), пикселей
  //   disableSec, disableRadius         — ГЛУШЕНИЕ БАШЕН: проходя ближе disableRadius пикселей к башне, отключает её на disableSec
  //                                       секунд (каждую башню одна бактерия глушит один раз)
  //   healRadius, healPerSec            — ЛЕЧЕНИЕ: бактерии в радиусе healRadius пикселей лечатся на healPerSec HP в секунду
  //   spawnGapSec                       — ПАЧКА: бактерии этого типа выходят подряд с такой паузой (секунд) и по одному входу
  //   regenPerSec                       — САМОЛЕЧЕНИЕ: сколько HP в секунду бактерия восстанавливает сама (не выше полного)
  //   hasteRadius, hasteFactor          — УСКОРЕНИЕ: остальные бактерии в радиусе hasteRadius пикселей идут в hasteFactor раз быстрее
  //   slowImmune                        — 1: лужа Сиропа на эту бактерию не действует
  //   brewEverySec, brewCount           — РОЖДЕНИЕ: раз в brewEverySec секунд рожает brewCount бактерий роя на своём месте
  types: {
    /** Кокк — зелёный круг. Базовый: 2 HP, медленный. */
    coccus: { hp: 2, speedFactor: 0.8, reward: 5, lifeDamage: 1, radius: 30, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Палочка — синяя вытянутая капсула. 5 HP, идёт быстрее кокка и делает рывки. */
    rod: { hp: 5, speedFactor: 1, reward: 6, lifeDamage: 1, radius: 22, length: 104, armor: 0, dashEverySec: 3, dashSec: 1, dashFactor: 2.5, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Делящаяся — ярко-оранжевая, с перетяжкой посередине. 4 HP. Уничтожена — на этом месте появляются два кокка. */
    splitter: { hp: 4, speedFactor: 0.9, reward: 8, lifeDamage: 1, radius: 27, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 2, splitGapPx: 64, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Бронированная — фиолетовая, с толстой оболочкой. 20 HP, броня 2, медленная, отнимает 2 жизни. Таблетка (урон 1) почти не берёт — нужен сильный удар. */
    armored: { hp: 20, speedFactor: 0.6, reward: 20, lifeDamage: 2, radius: 48, length: 0, armor: 2, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Спора — маленькая красная. 3 HP, быстрая; проходя рядом с башней, глушит её на 3 секунды. */
    spore: { hp: 3, speedFactor: 1.4, reward: 12, lifeDamage: 1, radius: 18, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 3, disableRadius: 150, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Рой — крошечные бирюзовые, быстрые, выходят плотной пачкой по одному входу. 2 HP. Против кучи — Шипучка. */
    swarm: { hp: 2, speedFactor: 1.3, reward: 2, lifeDamage: 0.25, radius: 14, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0.15, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Бегун — малиновая «капля» со следом, очень быстрый (×2,2). 4 HP. Башни не успевают — нужна лужа Сиропа. */
    runner: { hp: 4, speedFactor: 2.2, reward: 8, lifeDamage: 1, radius: 20, length: 52, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Лекарь — белый с розовым крестом и кольцом-аурой. 6 HP; пока жив, лечит всех рядом на 0,8 HP/с — одиночные Таблетки не справляются. Против него — линия Шприца и взрыв Шипучки. */
    healer: { hp: 6, speedFactor: 0.9, reward: 14, lifeDamage: 1, radius: 24, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 140, healPerSec: 0.8, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Слизень — лаймовый, скользкий: лужа Сиропа на него не действует (slowImmune). 12 HP. Нужен чистый урон — поэтому Сироп против него бесполезен. */
    slick: { hp: 12, speedFactor: 0.9, reward: 12, lifeDamage: 1, radius: 28, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 1, brewEverySec: 0, brewCount: 0 },
    /** Регенератор — тёмно-зелёный с белой стрелкой-кольцом. 10 HP, сам лечится на 1,5 HP/с: слабые одиночные удары не добивают, нужен сильный урон разом. */
    regen: { hp: 10, speedFactor: 0.85, reward: 14, lifeDamage: 1, radius: 30, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 1.5, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Командир — тёмно-синий с золотой звездой и красным кольцом. 8 HP; все бактерии в кольце радиуса 150 идут в 1,5 раза быстрее. Убить первым или замедлить лужей. */
    commander: { hp: 8, speedFactor: 0.9, reward: 16, lifeDamage: 1, radius: 26, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 150, hasteFactor: 1.5, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Матка — бежевая, в яйцах. 24 HP, медленная; каждые 4 с рожает на ходу двух бактерий роя. Убить быстро (луч Шприца), детей — взрывом Шипучки. */
    brood: { hp: 24, speedFactor: 0.7, reward: 18, lifeDamage: 1, radius: 38, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 4, brewCount: 2 },
    /** Гигант — босс: огромный, тёмно-бордовый, в шипах. 100 HP, броня 1, очень медленный; дошёл — отнимает все 3 жизни. Выходит редко (волны 21, 24, 27, 30). */
    giant: { hp: 100, speedFactor: 0.5, reward: 80, lifeDamage: 3, radius: 66, length: 0, armor: 1, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
  },
  combat: {
    /** Броня не может свести удар меньше, чем эта доля от удара: Таблетка (урон 1) против брони 2 наносит 0,25, а не 0. */
    armorMinShare: 0.25,
  },
  bacteria: {
    /** Базовая скорость бактерий, пикселей в секунду (у каждого типа умножается на speedFactor).
     *  Кокк: 140 × 0.8 ≈ 112 px/с. Путь от входа до организма — около 2000–2500 px, то есть 18–22 секунды.
     *  (Было 112 — по просьбе владельца игра стала быстрее.) */
    baseSpeed: 140,
    /** Разброс скорости между бактериями: 0.1 = каждая быстрее или медленнее на случайные ±10%. */
    speedSpread: 0.1,
  },

  // ------------------------------------------------------------
  //  ВОЛНЫ
  // ------------------------------------------------------------
  waves: {
    /** Сколько волн идёт на уровне (не больше, чем строк в списке ниже). Все отбиты (никого не осталось на карте) — победа. */
    total: 30,
    /** Пауза между выходом бактерий в первой волне, секунд … */
    intervalStartSec: 1.8,
    /** … и в волне intervalRampWaves и во всех следующих (между ними меняется плавно). Меньше — гуще. */
    intervalEndSec: 0.45,
    /** К какой волне пауза между бактериями доходит до intervalEndSec (дальше остаётся такой). Волны длиннее — а гуще они не становятся. */
    intervalRampWaves: 12,
    /** Сколько секунд до первой волны: игрок успевает поставить башню. */
    firstDelaySec: 8,
    /** Пауза между волнами (после того, как вышла последняя бактерия волны), секунд. */
    pauseSec: 6,
    /** Сколько секунд добавляется к паузе перед волной, в которой выходит новый тип (после того как игрок закрыл плашку): чтобы успеть подготовиться. */
    newTypePauseSec: 6,
    /** Рост прочности бактерий от волны к волне: с волны hpGrowthFromWave (не считая её) HP каждой бактерии × (1 + hpGrowthPerWave × (волна − hpGrowthFromWave)).
     *  0 — прочность не растёт. 0.08 — круг 14: 12-я волна ×1,32, 20-я ×1,96, 30-я ×2,76 (числа бактерий при этом тоже растут). Было 0.03 (×1,66 к 30-й волне):
     *  замер показал, что поздние волны слабее слитых Таблеток 4-го уровня (на 0,03 и 0,05 «особо сильный» побеждал). Подбирается ботом. */
    hpGrowthPerWave: 0.08,
    hpGrowthFromWave: 8,
    /** Добавка к росту прочности для поздних волн: после волны hpGrowthLateFromWave множитель прочности растёт ещё на hpGrowthLatePerWave за волну (к основному росту).
     *  0 — добавки нет. Нужна, чтобы слабые игроки, умирающие до этой волны, ничего не замечали, а игрок со слитыми башнями 4-го уровня упирался в стену (замер круга 15:
     *  «сильный» гибнет при множителе ≈ ×1,8, «особо сильный» держит ≈ ×4,5; одним равномерным ростом оба в цель не выводятся). Подбирается ботом. Круг 15: 0,3 — «особо сильный» побеждает 3 из 3; 0,5 — гибнет на 29–30-й волне; 0,6 — ожидается 25–27-я (множитель 30-й волны ≈ ×11,2, 20-й ≈ ×4,4). */
    hpGrowthLatePerWave: 0.6,
    hpGrowthLateFromWave: 16,
    /** Самая большая «пачка» бактерий с spawnGapSec (рой): больше — делится на несколько пачек, каждая на свой вход. */
    packMax: 10,
    /** Бонус за досрочный вызов волны кнопкой «Начать волну»: монет за каждую пропущенную секунду ожидания. */
    skipBonusPerSec: 1,
    /** Состав волн уровня 1: одна строка — одна волна, числа — сколько бактерий каждого типа. Типы выходят в случайном порядке.
     *  Типов на уровне 1 шесть, они появляются редко: кокк — волна 1, палочка — 4, рой — 8, бегун — 13, делящаяся — 18, бронированная — 24
     *  (шаги 3, 4, 5, 5, 6 волн). Остальные типы (лекарь, спора, слизень, регенератор, командир, матка, гигант) пока в таблице `types`, но в волны уровня 1 не входят:
     *  их раздаст по уровням этап 5. Нагрузка растёт числом бактерий, а не новыми типами: суммарная HP волны (до роста `hpGrowthPerWave`) — как в прежних волнах 1–12
     *  (8 → 272), дальше плавно до 1012 на 30-й волне; в волне, где тип появляется впервые, его 2–8 штук (палочка 2, рой 8, бегун 3, делящаяся 2, бронированная 2),
     *  потом доля растёт на протяжении 3–4 волн. Новый тип в свою первую волну выходит первым (игра перед волной показывает плашку с описанием). */
    list: [
      { coccus: 4 },
      { coccus: 6 },
      { coccus: 8 },
      { coccus: 12, rod: 2 },
      { coccus: 18, rod: 3 },
      { coccus: 18, rod: 5 },
      { coccus: 22, rod: 11 },
      { coccus: 24, rod: 13, swarm: 8 },
      { coccus: 28, rod: 17, swarm: 4 },
      { coccus: 34, rod: 22, swarm: 9 },
      { coccus: 35, rod: 25, swarm: 13 },
      { coccus: 38, rod: 31, swarm: 20 },
      { coccus: 43, rod: 36, swarm: 25, runner: 3 },
      { coccus: 41, rod: 36, swarm: 27, runner: 11 },
      { coccus: 39, rod: 36, swarm: 29, runner: 17 },
      { coccus: 36, rod: 36, swarm: 31, runner: 25 },
      { coccus: 33, rod: 35, swarm: 33, runner: 33 },
      { coccus: 34, rod: 37, swarm: 35, runner: 34, splitter: 2 },
      { coccus: 33, rod: 37, swarm: 35, runner: 34, splitter: 10 },
      { coccus: 33, rod: 38, swarm: 36, runner: 34, splitter: 16 },
      { coccus: 33, rod: 39, swarm: 37, runner: 35, splitter: 23 },
      { coccus: 32, rod: 40, swarm: 38, runner: 35, splitter: 30 },
      { coccus: 32, rod: 41, swarm: 38, runner: 35, splitter: 38 },
      { coccus: 31, rod: 41, swarm: 39, runner: 36, splitter: 38, armored: 2 },
      { coccus: 32, rod: 43, swarm: 41, runner: 38, splitter: 40, armored: 3 },
      { coccus: 32, rod: 44, swarm: 43, runner: 39, splitter: 40, armored: 4 },
      { coccus: 31, rod: 44, swarm: 44, runner: 40, splitter: 41, armored: 6 },
      { coccus: 31, rod: 45, swarm: 45, runner: 41, splitter: 41, armored: 8 },
      { coccus: 30, rod: 46, swarm: 47, runner: 42, splitter: 41, armored: 10 },
      { coccus: 30, rod: 48, swarm: 50, runner: 45, splitter: 43, armored: 13 },
    ] as Partial<Record<KindId, number>>[],
  },

  // ------------------------------------------------------------
  //  ИНТЕРФЕЙС
  // ------------------------------------------------------------
  ui: {
    /** Если организм за краем экрана и бактерия ближе этого расстояния до него, подсказка «◀ Организм» мигает красным. Пикселей. */
    dangerDistancePx: 520,
    /** Сколько миллисекунд держится всплывающая подсказка сверху экрана. */
    toastMs: 1800,
    /** Какие скорости игры переключает кнопка рядом с паузой (по кругу): 1 — обычная. Ускоряется всё: бактерии, башни, волны. */
    speeds: [1, 2, 3] as number[],
  },

  // ------------------------------------------------------------
  //  ОТКЛИК (вспышка, частицы, «+монеты», тряска, звук)
  // ------------------------------------------------------------
  feedback: {
    /** Сколько частиц разлетается на месте уничтоженной бактерии. 0 — без частиц. */
    particlesPerKill: 12,
    /** Скорость самых быстрых частиц, пикселей в секунду, и сколько они живут, миллисекунд. */
    particleSpeed: 220,
    particleLifeMs: 450,

    /** При частых уничтожениях частиц на каждое меньше: до стольких уничтожений в секунду — полное число (particlesPerKill), при большем —
     *  во столько раз меньше, во сколько уничтожений больше, но не меньше particleMinPerKill на каждое. */
    particleFullRate: 6,
    particleMinPerKill: 3,

    /** Сколько миллисекунд всплывает надпись «+монеты». */
    popupMs: 800,
    /** Сколько надписей «+монеты» может быть на экране одновременно; лишние не показываются. */
    popupMax: 12,
    /** Сколько вспышек попадания может быть на экране одновременно; лишние не показываются. */
    flashMax: 40,

    /** Тряска экрана при потере жизни: сколько миллисекунд и насколько сильно
     *  (0.006 — лёгкая, 0.02 — сильная). 0 — без тряски. */
    lifeLostShakeMs: 240,
    lifeLostShakeIntensity: 0.012,

    /** Громкость звуков от 0 до 1. 0 — звука нет вообще. */
    soundVolume: 0.3,
  },

  // ------------------------------------------------------------
  //  ОЧКИ ДНК И УЛУЧШЕНИЯ ВНЕ ПАРТИИ (этап 6а, проект — docs/upgrades.md)
  // ------------------------------------------------------------
  meta: {
    dna: {
      /** Очков ДНК за каждую полностью пройденную волну (достигнутая волна − 1; при победе — все волны уровня). Начисляются и за проигрыш. */
      perWave: 5,
      /** Добавка за победу, очков ДНК. */
      winBonus: 15,
    },
    /** Улучшения вне партии (одна строка — одно улучшение). perLevel — эффект одного уровня: lives — жизней, coins — стартовых монет,
     *  damage — доля к урону всех башен (0,1 = +10 %), reward — доля к награде за бактерий (0,08 = +8 %). prices — цена каждого уровня, очков ДНК
     *  (число цен = наибольший уровень). Подобрано замером серий партий (docs/balance-history.md, «Этап 6а»): проектные 1 очко за волну и +10 % урона за уровень давали слишком слабый рост. */
    upgrades: {
      lives: { perLevel: 1, prices: [12, 30] },
      coins: { perLevel: 150, prices: [8, 14, 20, 28, 36] },
      damage: { perLevel: 0.5, prices: [15, 25, 40, 60, 90] },
      reward: { perLevel: 0.2, prices: [10, 18, 28, 42, 60] },
    } as Record<string, { perLevel: number; prices: number[] }>,
  },

  // ------------------------------------------------------------
  //  ЭКРАН ПРОИГРЫША И ПОБЕДЫ
  // ------------------------------------------------------------
  gameOver: {
    /** Сколько миллисекунд после конца уровня тап не запускает игру заново — чтобы не нажать
     *  случайно, продолжая быстро тапать. 500 = полсекунды. */
    restartLockMs: 500,
  },
};

// Только для проверок (?qa&cfg=...): подмена чисел без правки файла. Обычным игрокам не влияет.
applyConfigOverrides(CONFIG);
