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
    /** Самое сильное отдаление. 0.54 — по ширине карта помещается на экране целиком. */
    zoomMin: 0.54,
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
    /** Сколько монет у игрока в начале уровня: три «Таблетки» с запасом или «Таблетка» + «Шипучка» (рой с 4-й волны не остановить одними Таблетками).
     *  Было 180 — боты всех уровней проигрывали на 3–6-й волне (круги 6–7), раньше, чем появлялись остальные башни. */
    startCoins: 250,
    /** Доля цены, которая возвращается при продаже башни (продажа появится позже). */
    sellRefund: 0.7,
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
      price: 170,
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
     *  диагонали карты). Урон 5 пробивает броню; ставить надо вдоль прямого участка дороги. */
    syringe: {
      price: 150,
      range: 0,
      damage: 5,
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
      beamPulses: 3,
      beamGapMs: 180,
      beamLengthPx: 3000,
      beamHalfWidthPx: 10,
    },
  },

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
    /** Делящаяся — жёлтая, с перетяжкой посередине. 4 HP. Уничтожена — на этом месте появляются два кокка. */
    splitter: { hp: 4, speedFactor: 0.9, reward: 8, lifeDamage: 1, radius: 27, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 2, splitGapPx: 64, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Бронированная — фиолетовая, с толстой оболочкой. 20 HP, броня 2, медленная, отнимает 2 жизни. Таблетка (урон 1) почти не берёт — нужен сильный удар. */
    armored: { hp: 20, speedFactor: 0.6, reward: 20, lifeDamage: 2, radius: 48, length: 0, armor: 2, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Спора — маленькая красная. 3 HP, быстрая; проходя рядом с башней, глушит её на 3 секунды. */
    spore: { hp: 3, speedFactor: 1.4, reward: 12, lifeDamage: 1, radius: 18, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 3, disableRadius: 150, healRadius: 0, healPerSec: 0, spawnGapSec: 0, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Рой — крошечные бирюзовые, быстрые, выходят плотной пачкой по одному входу. 2 HP. Против кучи — Шипучка. */
    swarm: { hp: 2, speedFactor: 1.3, reward: 2, lifeDamage: 0.25, radius: 14, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healPerSec: 0, spawnGapSec: 0.15, regenPerSec: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0 },
    /** Бегун — оранжевая «капля» со следом, очень быстрый (×2,2). 4 HP. Башни не успевают — нужна лужа Сиропа. */
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
    intervalEndSec: 0.6,
    /** К какой волне пауза между бактериями доходит до intervalEndSec (дальше остаётся такой). Волны длиннее — а гуще они не становятся. */
    intervalRampWaves: 12,
    /** Сколько секунд до первой волны: игрок успевает поставить башню. */
    firstDelaySec: 8,
    /** Пауза между волнами (после того, как вышла последняя бактерия волны), секунд. */
    pauseSec: 6,
    /** Самая большая «пачка» бактерий с spawnGapSec (рой): больше — делится на несколько пачек, каждая на свой вход. */
    packMax: 10,
    /** Бонус за досрочный вызов волны кнопкой «Начать волну»: монет за каждую пропущенную секунду ожидания. */
    skipBonusPerSec: 1,
    /** Состав волн: одна строка — одна волна, числа — сколько бактерий каждого типа. Типы выходят в случайном порядке.
     *  Новый тип в первую свою волну выходит ОДИН и первым (игра подсказывает сигналом и сообщением): кокк — волна 1,
     *  палочка — 3, рой — 4, бегун — 5, делящаяся — 6, бронированная — 7, лекарь — 8, спора — 9, слизень — 13, регенератор — 15,
     *  командир — 17, матка — 19, гигант (босс) — 21. Волны 1–12 — как были; с 13-й число бактерий растёт на ≈ 4,5 % за волну, а «акцент»
     *  волны меняется по кругу: больше роя / больше бронированных и лекарей / больше бегунов и спор / больше делящихся и палочек.
     *  Гиганты: волны 21 и 24 — по одному, 27 — два, 30 — три. */
    list: [
      { coccus: 4 },
      { coccus: 6 },
      { coccus: 5, rod: 1 },
      { coccus: 4, rod: 2, swarm: 8 },
      { coccus: 5, rod: 3, swarm: 10, runner: 1 },
      { coccus: 5, rod: 3, swarm: 10, runner: 3, splitter: 1 },
      { coccus: 6, rod: 4, swarm: 12, runner: 3, splitter: 2, armored: 1 },
      { coccus: 6, rod: 4, swarm: 12, runner: 4, splitter: 3, armored: 2, healer: 1 },
      { coccus: 6, rod: 5, swarm: 14, runner: 4, splitter: 3, armored: 2, healer: 2, spore: 1 },
      { coccus: 8, rod: 6, swarm: 16, runner: 5, splitter: 4, armored: 3, healer: 2, spore: 3 },
      { coccus: 8, rod: 7, swarm: 18, runner: 6, splitter: 5, armored: 3, healer: 3, spore: 4 },
      { coccus: 10, rod: 8, swarm: 20, runner: 8, splitter: 6, armored: 4, healer: 3, spore: 6 },
      { coccus: 10, rod: 8, swarm: 21, runner: 8, splitter: 6, armored: 7, healer: 4, spore: 6, slick: 1 },
      { coccus: 11, rod: 9, swarm: 22, runner: 14, splitter: 7, armored: 4, healer: 3, spore: 9, slick: 1 },
      { coccus: 11, rod: 12, swarm: 23, runner: 9, splitter: 10, armored: 5, healer: 3, spore: 7, slick: 1, regen: 1 },
      { coccus: 12, rod: 9, swarm: 35, runner: 9, splitter: 7, armored: 5, healer: 4, spore: 7, slick: 2, regen: 1 },
      { coccus: 12, rod: 10, swarm: 24, runner: 10, splitter: 7, armored: 8, healer: 5, spore: 7, slick: 2, regen: 1, commander: 1 },
      { coccus: 13, rod: 10, swarm: 25, runner: 16, splitter: 8, armored: 5, healer: 4, spore: 11, slick: 2, regen: 1, commander: 1 },
      { coccus: 13, rod: 14, swarm: 26, runner: 11, splitter: 12, armored: 5, healer: 4, spore: 8, slick: 3, regen: 2, commander: 1, brood: 1 },
      { coccus: 14, rod: 11, swarm: 41, runner: 11, splitter: 8, armored: 5, healer: 4, spore: 8, slick: 3, regen: 2, commander: 1, brood: 1 },
      { coccus: 14, rod: 11, swarm: 28, runner: 11, splitter: 8, armored: 9, healer: 6, spore: 8, slick: 3, regen: 2, commander: 1, brood: 1, giant: 1 },
      { coccus: 14, rod: 12, swarm: 29, runner: 19, splitter: 9, armored: 6, healer: 4, spore: 12, slick: 4, regen: 2, commander: 2, brood: 1 },
      { coccus: 15, rod: 16, swarm: 30, runner: 12, splitter: 13, armored: 6, healer: 4, spore: 9, slick: 4, regen: 3, commander: 2, brood: 1 },
      { coccus: 15, rod: 12, swarm: 46, runner: 12, splitter: 9, armored: 6, healer: 5, spore: 9, slick: 4, regen: 3, commander: 2, brood: 1, giant: 1 },
      { coccus: 16, rod: 13, swarm: 32, runner: 13, splitter: 10, armored: 10, healer: 7, spore: 10, slick: 5, regen: 3, commander: 2, brood: 2 },
      { coccus: 16, rod: 13, swarm: 33, runner: 21, splitter: 10, armored: 7, healer: 5, spore: 14, slick: 5, regen: 3, commander: 2, brood: 2 },
      { coccus: 17, rod: 17, swarm: 34, runner: 13, splitter: 15, armored: 7, healer: 5, spore: 10, slick: 5, regen: 4, commander: 3, brood: 2, giant: 2 },
      { coccus: 17, rod: 14, swarm: 52, runner: 14, splitter: 10, armored: 7, healer: 5, spore: 10, slick: 6, regen: 4, commander: 3, brood: 2 },
      { coccus: 18, rod: 14, swarm: 35, runner: 14, splitter: 11, armored: 11, healer: 7, spore: 11, slick: 6, regen: 4, commander: 3, brood: 2 },
      { coccus: 18, rod: 14, swarm: 36, runner: 23, splitter: 11, armored: 7, healer: 5, spore: 15, slick: 6, regen: 4, commander: 3, brood: 2, giant: 3 },
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

    /** Сколько миллисекунд всплывает надпись «+монеты». */
    popupMs: 800,

    /** Тряска экрана при потере жизни: сколько миллисекунд и насколько сильно
     *  (0.006 — лёгкая, 0.02 — сильная). 0 — без тряски. */
    lifeLostShakeMs: 240,
    lifeLostShakeIntensity: 0.012,

    /** Громкость звуков от 0 до 1. 0 — звука нет вообще. */
    soundVolume: 0.3,
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
