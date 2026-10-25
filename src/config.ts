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
 *   • «пикселей» — точки игрового мира. Карта 24×19 клеток по 77,25 пикселя (это ≈1854×1468 плюс зона организма слева).
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
export type Targeting = 'radius' | 'area' | 'puddle' | 'beam' | 'snipe' | 'poison' | 'cone' | 'aura' | 'freeze' | 'trap';
/** Все типы бактерий (ключи таблицы `types`; нужен для таблицы волн — она описана раньше, чем сам список типов). */
export type KindId = 'coccus' | 'rod' | 'splitter' | 'armored' | 'spore' | 'swarm' | 'runner' | 'healer' | 'slick' | 'regen' | 'commander' | 'brood' | 'giant' | 'leaper' | 'phago' | 'stealth' | 'toxin' | 'mutant' | 'parasite';
/** Строка таблицы уровней (`levels.specs`): что отличает уровень от уровня 1. Все поля необязательные; подробности — в комментарии к таблице. */
export interface LevelSpec {
  count?: number;
  intro?: Partial<Record<KindId, number>>;
  hpBudget?: [number, number];
  bosses?: Record<number, Partial<Record<KindId, number>>>;
  growth?: { perWave: number; fromWave: number; latePerWave: number; lateFromWave: number };
  rewards?: number[][];
  /** Уровень нового формата (переработка, docs/redesign-2026-10-19.md): волны, время, доход и боссы — из плана; поля выше тогда не читаются. */
  plan?: LevelPlan;
}
/** Босс или мини-босс (docs/redesign-2026-10-19.md, раздел 7): одна особая бактерия; рисуется как вид-основа `base`, крупнее и с кольцом своего цвета. */
export type BossId = 'colony' | 'rodLeader' | 'armadillo' | 'swarmQueen' | 'giantColony' | 'sporeling' | 'shaman' | 'hopper' | 'sporeMother' | 'silencer';
/** Волна уровня нового формата: обычные бактерии (`mix`, выходят вперемешку), стена — пачка одного вида одним блоком (`wall`: вид и сколько), босс волны (`boss`). */
export interface PlanWave {
  mix: Partial<Record<KindId, number>>;
  wall?: [KindId, number];
  boss?: BossId;
}
/**
 * План уровня нового формата (раздел 2 и 9 документа дизайна). Прочность одной бактерии на волне n: HP вида × hpScale × (n ≤ hpFlatUntil ? 1 : (n / hpFlatUntil)^hpExp), после волны hpLateFrom — × (n / hpLateFrom)^hpLateExp от волны hpLateFrom;
 * броня вида × (1 + armorPerWave · (n − 1)). Длительность выхода волны: min(spawnMaxSec, spawnBaseSec + spawnPerWaveSec · n), у волны мини-босса ещё +miniBossSec, у волны босса — bossSec;
 * интервал между выходами = длительность ÷ число блоков (одиночная бактерия, пачка роя или стена — блок). Доход волны: incomeBase + incomePerWave · n монет, делится поровну
 * между бактериями волны (дети делящейся и боссов денег не дают); мини-босс несёт ещё incomeMiniBoss.
 */
export interface LevelPlan {
  waves: PlanWave[];
  startCoins: number;
  pauseSec: number;
  spawnBaseSec: number;
  spawnPerWaveSec: number;
  spawnMaxSec: number;
  miniBossSec: number;
  bossSec: number;
  wallGapSec: number;
  bossEnterShare: number;
  incomeBase: number;
  incomePerWave: number;
  incomeMiniBoss: number;
  hpScale: number;
  hpFlatUntil: number;
  hpExp: number;
  /** Поздние волны (решение владельца 20 октября 2026, сообщение 3, п. 3.1: прочность снижать только у волн 31–50): после волны hpLateFrom рост — (n / hpLateFrom)^hpLateExp от прочности волны hpLateFrom;
   *  нет полей или hpLateExp = hpExp — как раньше. */
  hpLateFrom?: number;
  hpLateExp?: number;
  armorPerWave: number;
  /** Жёсткие свойства видов на уровне (вариант «жёсткие стены»; нет — выключены). */
  hardWalls?: HardWalls;
}
/**
 * Жёсткие свойства видов на уровне (вариант «жёсткие стены», документ дизайна, раздел 4.3; решения владельца 19 октября 2026, сообщения 6–7): 0 — выключено, 1 — включено.
 * Без башни нужного вида такую бактерию не ранить при любых улучшениях — пара или одна башня останавливается на ней.
 *  runnerSlow — бегун ранен только в луже Сиропа (пока замедлен);
 *  armoredPierce — бронированного ранит только бронебойный удар (мутации «Бронебойная» Таблетки и «Бронебойный» Шприца) или удар после «Сквозного разряда»; яд лужи — нет;
 *  slickBeam — луч Шприца проходит слизня насквозь, не раня;
 *  slickMemory — слизня не ранит удар башни того же вида, что и прошлый удар по нему («память вида»);
 *  bossArea — последняя фаза босса уровня: урон только от взрыва Шипучки и луча Шприца.
 */
export interface HardWalls {
  runnerSlow: number;
  armoredPierce: number;
  slickBeam: number;
  slickMemory: number;
  bossArea: number;
}
/** Жёсткое свойство одной бактерии (`HardWalls`): кого и чем нельзя ранить. */
export type Ward = 'slow' | 'pierce' | 'beam' | 'memory' | 'area';
/** Фаза босса: когда доля прочности опускается до `below` и ниже, действуют эти числа (не заданные — как у босса). */
export interface BossPhase {
  below: number;
  armor?: number;
  speedMul?: number;
  regenShare?: number;
  spawnKind?: KindId;
  spawnEverySec?: number;
  spawnCount?: number;
}
/**
 * Строка таблицы боссов (`bosses`). Обязательные поля: вид-основа (как рисуется), прочность (HP, без множителя волны), скорость (к `bacteria.baseSpeed`), броня (без роста по волнам),
 * сколько жизней отнимает дошедший (−1 — поражение сразу), цвет кольца. Необязательные — поведение (нет — свойства нет):
 *  burstAt, burstKind, burstCount, burstOnDeath — на доле прочности burstAt и (если burstOnDeath) при гибели выпускает burstCount бактерий вида burstKind;
 *  dashEverySec, dashSec, dashFactor — рывки; rallyRadius, rallyDashMul — палочки ближе rallyRadius делают рывки в rallyDashMul раз чаще; slowFloor — замедление не сильнее этого множителя;
 *  spawnKind, spawnEverySec, spawnCount — раз в spawnEverySec выпускает spawnCount бактерий; capsuleEverySec, capsuleSec — раз в capsuleEverySec становится неуязвимым на capsuleSec;
 *  regenShare — самолечение (доля прочности в секунду); phases — фазы по доле прочности (`BossPhase`).
 */
export interface BossSpec {
  base: KindId;
  hp: number;
  speedFactor: number;
  armor: number;
  lifeDamage: number;
  color: number;
  burstAt?: number;
  burstKind?: KindId;
  burstCount?: number;
  burstOnDeath?: boolean;
  dashEverySec?: number;
  dashSec?: number;
  dashFactor?: number;
  rallyRadius?: number;
  rallyDashMul?: number;
  slowFloor?: number;
  spawnKind?: KindId;
  spawnEverySec?: number;
  spawnCount?: number;
  capsuleEverySec?: number;
  capsuleSec?: number;
  regenShare?: number;
  phases?: BossPhase[];
}
/**
 * Мутация башни (выбор на уровнях 2 и 4): заплатка к числам башни. Все поля необязательны, пропущенное — «не меняет».
 *  damageMul, cooldownMul, blastMul, puddleRadiusMul — множители урона, паузы, радиуса взрыва, радиуса лужи;
 *  slowFactor — замедление в луже (меньше — сильнее; берётся меньшее из текущего и этого);
 *  pulsesAdd — ударов в очереди луча сверх текущих;
 *  armorPierce — удар игнорирует броню; extraTargets — сколько ещё целей бьёт за выстрел; toughest — бьёт самую прочную цель в радиусе;
 *  poisonPerSec — лужа жжёт всех в ней на столько HP в секунду; puddleCount — сколько луж за выстрел;
 *  chain — после взрыва второй (радиус ×0,7, урон ×0,6) на ближайшей бактерии; acidSec, acidMul — цели взрыва с ПОЛНЫМ уроном (первые towers.fizz.blastFullTargets) получают acidMul× урона acidSec секунд (остальным цели круга кислота не накладывается; другие башни с кислотой накладывают её всем задетым);
 *  secondBeam — второй луч под 90° к первому; spiral — каждый следующий удар очереди сильнее на столько урона;
 *  dotSecMul, dotDpsMul — множители времени и силы (HP/с) яда башни с ядом ('poison');
 *  coneMul — множитель угла конуса башни с конусом ('cone'); rangeMul — множитель радиуса стрельбы (у Лампы — длины конуса, у Витамина — радиуса ауры);
 *  auraBonusMul — множитель прибавки ауры Витамина ('aura'): прибавка = 1 − множитель паузы (0,8 → 0,2; ×1,5 → 0,3, то есть пауза ×0,7);
 *  freezeMul — множитель времени заморозки башни с заморозкой ('freeze'); trapSecMul, trapDpsMul — множители времени приклеивания и урона в секунду ловушки башни с ловушкой ('trap').
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
  dotSecMul?: number;
  dotDpsMul?: number;
  coneMul?: number;
  rangeMul?: number;
  auraBonusMul?: number;
  freezeMul?: number;
  trapSecMul?: number;
  trapDpsMul?: number;
}
/**
 * Что делает улучшение вне партии (колонка `effect` таблицы `meta.upgrades`, docs/upgrades.md):
 *  lives, coins, damage, reward — жизни, стартовые монеты, урон всех башен, награда (этап 6а);
 *  shield — сколько бактерий за партию, дошедших до организма, не отнимают жизнь; sellRefund — прибавка к доле возврата при продаже;
 *  waveCoins — монет в начале каждой волны;
 *  price, cooldown, range, blast, puddleSec, puddleRadius — доля, на которую меняются цена башни, пауза между выстрелами, радиус стрельбы, радиус взрыва,
 *  время жизни лужи, радиус лужи (−0,05 = на 5 % меньше); slowFactor — прибавка к множителю скорости в луже (меньше — бактерия медленнее);
 *  beamWidth — прибавка к полуширине луча, пикселей; pulses — ударов в очереди луча сверх обычных;
 *  auraBoost — прибавка к множителю паузы башен рядом у Витамина (−0,01 = пауза ещё на 1 процентный пункт короче);
 *  freezeTime — доля, на которую меняется время заморозки у Холода (0,06 = на 6 % дольше). У Пластыря эффект `towerDamage` меняет урон ловушки в секунду.
 *  tower — узел башни: башня открыта на всех уровнях (ветка `towers`, id узла — `tower` + id башни с заглавной буквы); key — ключевой узел ветки башни (меняет её поведение, `keyNodes`);
 *  fever — умение «Лихорадка» (`abilities.fever`); autoWave — «Автостарт волны»: следующая волна выходит, как только на поле не осталось бактерий.
 *  Эффекты башен действуют на башню, чьё имя совпадает с веткой улучшения.
 */
export type UpgradeEffect =
  | 'lives' | 'coins' | 'damage' | 'reward'
  | 'shield' | 'sellRefund' | 'waveCoins'
  | 'towerDamage' | 'price' | 'cooldown' | 'range' | 'blast' | 'puddleSec' | 'puddleRadius' | 'slowFactor' | 'beamWidth' | 'pulses' | 'auraBoost' | 'freezeTime'
  | 'tower' | 'key' | 'fever' | 'autoWave';
/** Ветка улучшений: «body» (Организм), «defense» (Защита), «towers» (узлы башен), «skills» (умения и автоматизация) или id башни (`pill`, `syrup`, … `patch`). Ветка башни открыта, когда куплен узел башни (Таблетка открыта с начала). */
export type UpgradeBranch = 'body' | 'defense' | 'towers' | 'skills' | 'pill' | 'syrup' | 'fizz' | 'syringe' | 'ampule' | 'antibiotic' | 'lamp' | 'vitamin' | 'frost' | 'patch';
/** Строка таблицы улучшений вне партии: ветка, действие, эффект одного уровня и цены уровней. */
export interface UpgradeSpec {
  branch: UpgradeBranch;
  effect: UpgradeEffect;
  perLevel: number;
  prices: number[];
  /** Условие открытия узла дерева: [id другого узла, нужный уровень]; нет — узел открыт с начала (корень). */
  requires?: [string, number];
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
    /** Сторона клетки под башню, пикселей. Решение владельца 8 октября 2026: клетки меньше (было 103), чтобы башен можно было ставить больше и плотнее; размер мира (≈1854 px
     *  в ширину) и дорожки не менялись: 103 × 18 = 77,25 × 24. На телефоне 844×390 при обычном приближении клетка ≈ 42 px: палец (44 px) почти помещается — нажатие
     *  принимается по ближайшей к пальцу клетке. */
    tile: 77.25,
    /** Единица, в которой записаны координаты узлов сети дорожек в `src/level.ts` (пикселей): прежняя клетка 103 px. Дорожки от размера клетки под башню не зависят. */
    pathUnit: 103,
    /** Высота верхней полосы (волна, монеты, жизни — только вывод), пикселей экрана игры (макет docs/mockups/bottom-bar.html, решение владельца 13 октября 2026). */
    topH: 40,
    /** Высота нижней панели (список башен с прокруткой, «Начать волну», скорость, пауза), пикселей. Окно карты — между полосами: 1280 × (720 − 40 − 112) = 1280 × 568. */
    bottomH: 112,
    /** Ширина дорожки, пикселей. Бактерия чуть шире дорожки (бронированная) слегка выходит за её край. */
    pathWidth: 86,
    /** Клетки, центр которых дальше этого расстояния от дорожки, закрыты для башен (там башня ничего бы не достала): пикселей.
     *  Число подобрано по дальности обычных башен (170–235 px; у Шприца луч через всю карту). У Ампулы дальность 520 (на 4-м уровне ×1,12 = 582), и поставить её можно не дальше 240 px от дорожки:
     *  дальше клетки закрыты, хотя достала бы она и оттуда (площадки дальнего огня — в макетах карт уровней 2–4). На нынешней сетке 24 × 19 (456 клеток, 174 из них дорожка) при 240 открыто 196 клеток
     *  из 282 не на дорожке (закрыто 86); без предела были бы открыты все 282 (пересчёт 18 октября 2026, раньше здесь стояло «около 115 из 158» по прежней сетке). */
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
    /** Сколько жизней у игрока в начале уровня. Решение владельца 14 октября 2026 (замер «3 и 20 жизней», docs/balance-history.md): 20 вместо 3 — потери растягиваются на несколько волн, а не уходят одной волной; цена утечки зависит от вида бактерии (`types.*.lifeDamage`: обычная 1, рой 0,25, бронированная 2, гигант 3). */
    start: 20,
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
    /** Сколько первых уровней готовы к игре (переработаны и приняты владельцем): остальные закрыты строкой «Скоро» (решение владельца 23 октября 2026); повтор пройденного уровня 1 остаётся. Значение 2 ставится вместе с окончательными числами уровня 2 после «да» владельца (24 октября 2026); для проверок уровень 2 открывается подменой `&ready=2`. Единицы: число уровней. */
    ready: 1,
    /** Множитель прочности бактерий для каждого уровня 2–10 поверх `waves.hpScale` (как `waves.level1HpFactor` у уровня 1; форма роста по волнам не меняется): 1 — без изменения.
     *  Ключ — номер уровня. Нужен для подбора силы уровней под прокачку игрока (docs/balance-history.md, «Уровни 2–4»); замеры подменяют его через `?qa&cfg=levels.hpFactor.2:3.6`. */
    hpFactor: { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 } as Record<number, number>,
    // Башни открываются только в древе за очки ДНК (документ дизайна docs/redesign-2026-10-19.md, раздел 5.1; узлы `tower…` в `meta.upgrades`); стартовая — Таблетка. Таблица «с какого уровня открыта башня» убрана.
    /** Звёзды за победу (docs/stage-5-plan.md, раздел 4): ★ — любая победа; ★★ — потеряно жизней не больше maxLostFor2; ★★★ — не больше maxLostFor3 (0 — без потерь). Решение владельца 14 октября 2026 при 20 жизнях: ★★★ — не больше 2, ★★ — не больше 6.
     *  Считается по числу потерянных жизней (жизни от улучшений порог не сдвигают); дробные потери (рой отнимает по 0,25) учитываются как есть. */
    stars: { maxLostFor3: 2, maxLostFor2: 6 },
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
      // Доли типов со «стенами» снижены (10 октября 2026, шаг Е, docs/balance-history.md): спора (глушит башни) 0,1 → 0,02 (при 0,1 «особо сильный» бот гибнет на 19–21-й волне уровня 2, при 0,0001 — на 27-й); слизень 0,1 → 0,05, токсин 0,08 → 0,04, паразит 0,08 → 0,05
      mix: { coccus: 0.06, rod: 0.24, swarm: 0.1, runner: 0.18, splitter: 0.17, armored: 0.26, spore: 0.02, slick: 0.05, regen: 0.1, healer: 0.06, commander: 0.05, brood: 0.1, leaper: 0.12, phago: 0.1, stealth: 0.1, toxin: 0.04, mutant: 0.08, parasite: 0.05 } as Partial<Record<KindId, number>>,
      /** Сглаживание выхода известных типов (docs/stage-5b-plan.md, раздел 4): 1 — первая волна типов уровня 1 (кокк, палочка, рой, бегун, делящаяся, бронированная)
       *  смешивается между расписанием уровня 1 и строкой уровня `intro` с долей строки (N − 2) / (число уровней − 2): уровень 2 выпускает типы как уровень 1,
       *  уровень 10 — как в своей строке; 0 — везде как в строке уровня (как было до этапа 5б). */
      introSpread: 1,
      introCount: { rod: 2, swarm: 8, runner: 3, splitter: 2, armored: 2, spore: 3, slick: 2, regen: 2, healer: 2, commander: 1, brood: 1, leaper: 3, phago: 2, stealth: 3, toxin: 2, mutant: 1, parasite: 2 } as Partial<Record<KindId, number>>,
    },
    /** Уровни: строка номер N — уровень N. Пустая строка (уровень 1) — всё из таблицы волн, роста прочности и наград ниже (`waves`, `economy.rewardCurve`).
     *  Поля строки (все необязательные):
     *   count    — сколько волн (нет — `waves.total`);
     *   intro    — первая волна каждого типа бактерий; есть — состав волн строит генератор (тогда нужен и hpBudget);
     *   hpBudget — суммарная прочность первой и последней волны до роста прочности и без боссов (у уровня 1: 8 и 1012);
     *   bosses   — боссы: номер волны → сколько каких бактерий добавить сверх бюджета;
     *   growth   — свой рост прочности {perWave, fromWave, latePerWave, lateFromWave} (нет — как в `waves`);
     *   rewards  — своя кривая наград (нет — `economy.rewardCurve`).
     *  Числа уровней 2–10 подбираются этапом 5б (docs/stage-5b-plan.md, docs/balance-history.md): сложность растёт не числом бактерий (оно удлиняет партию до потолка времени), а прочностью поздних
     *  волн — `growth.latePerWave` (у уровня 1 — 0,6). Значения подобраны ботом (docs/balance-history.md, «Этап 5б»), проверка полной лестницей — в работе.
     *  Известные по прошлым уровням типы выходят с 1–6-й волны подряд, новый тип этого уровня — после них. Названия уровней — в `src/i18n.ts`. */
    specs: [
      // Уровень 1 «Горло» — новый формат (документ дизайна docs/redesign-2026-10-19.md, пакет «Уровень 1» принят владельцем 19 октября 2026): 50 волн не дольше 24 минут при ×1, стены, мини-боссы на 10/20/30/40-й, босс на 50-й.
      // Состав волн — таблица 2.2 документа. Лестницами подобраны рост прочности волн 31–50 и прочность мини-боссов и босса (решения владельца 21 и 22 октября 2026);
      // волны 7–12 и стены 8-й и 12-й — вариант Б1 (решение владельца 19 октября 2026, сообщение 7, п. 1); остальные составы — модель docs/redesign-model-2026-10-19.mjs (`compositionL1`)
      // с опорным уроном на монету 0,022, волны 49–50 — по стене босса 4,71 (`3d94b9f`). Лестница эксперта: гибель сдвигается хотя бы на одну стену не реже раза в 3 попытки.
      {
        plan: {
          /** Монеты на старте партии (было 450). */
          startCoins: 200,
          /** Пауза после выхода последней бактерии волны, секунд (было 6); перед первым выходом нового вида — ещё `waves.newTypePauseSec`. */
          pauseSec: 4,
          /** Длительность выхода волны n, секунд: min(30, 8 + 0,6 · n); волна мини-босса — ещё +15; волна босса — 75. */
          spawnBaseSec: 8,
          spawnPerWaveSec: 0.6,
          spawnMaxSec: 30,
          miniBossSec: 15,
          bossSec: 75,
          /** Пауза между бактериями стены (пачка одним блоком, один вход), секунд. */
          wallGapSec: 0.4,
          /** Босс выходит, когда вышла эта доля обычных бактерий волны (0,5 — в середине волны). */
          bossEnterShare: 0.5,
          /** Доход за волну n: 25 + 7 · n монет, на волнах мини-боссов ещё +60 (их получает убийца мини-босса). Делится поровну между бактериями волны: больше бактерий денег не прибавляет. */
          incomeBase: 25,
          incomePerWave: 7,
          incomeMiniBoss: 60,
          /** Прочность одной бактерии: HP вида × hpScale × (n/8)^1,75 с 9-й по 30-ю волну (×2,03 на 12-й, ×10,1 на 30-й), с 31-й — по hpLateExp (×16,8 на 50-й).
           *  hpScale 1 — урон на монету e «одной Таблетки» по её первой попытке (19 октября 2026, сообщение владельца 3, п. 2.1): 0,0213 против опорных 0,022 (в пределах разброса). */
          hpScale: 1,
          hpFlatUntil: 8,
          hpExp: 1.75,
          /** С 31-й волны рост прочности — (n / 30)^hpLateExp от прочности 30-й волны: 1,0 — прямой рост (×1,67 к 30-й на 50-й волне; при 1,75, как у волн 9–30, было ×2,45).
           *  Решение владельца 22 октября 2026, п. 1 (лестница эксперта 39679327696: первая победа на 9–10-й попытке; docs/balance-history.md, раздел «Эксперт late25x2: рост волн 31–50 и прочность босса»). */
          hpLateFrom: 30,
          hpLateExp: 1.0,
          /** Броня растёт с волной: × (1 + 0,03 · (n − 1)) — бронированная 3 на 1-й волне, 5,2 на 25-й, 7,4 на 50-й. */
          armorPerWave: 0.03,
          /** Жёсткие свойства видов (`HardWalls`): бегун, бронированный, «луч насквозь» у слизня и последняя фаза босса — включены, «память вида» — нет (решения владельца 20 октября 2026, сообщение 1, п. 1, и 22 октября 2026); замер другого набора — подменой --cfg levels.specs.0.plan.hardWalls.<свойство>:0|1. */
          hardWalls: { runnerSlow: 1, armoredPierce: 1, slickBeam: 1, slickMemory: 0, bossArea: 1 },
          /** Волны 1–50 (таблица 2.2): mix — обычные бактерии, wall — стена (вид, сколько штук одной пачкой), boss — босс волны (таблица `bosses`). */
          waves: [
        { mix: { coccus: 3 } }, // 1
        { mix: { coccus: 4 } }, // 2
        { mix: { coccus: 7 } }, // 3
        { mix: { coccus: 3, rod: 2 } }, // 4
        { mix: { coccus: 5, rod: 2 } }, // 5
        { mix: { coccus: 6, rod: 3 }, wall: ['rod', 1] }, // 6
        { mix: { coccus: 10, rod: 7, swarm: 12 } }, // 7
        { mix: { coccus: 12, rod: 8, swarm: 12 }, wall: ['rod', 3] }, // 8
        { mix: { coccus: 14, rod: 9, swarm: 12 } }, // 9
        { mix: { coccus: 23, rod: 13, swarm: 12 }, boss: 'colony' }, // 10 Колония 169 HP
        { mix: { coccus: 16, rod: 10, swarm: 24 } }, // 11
        { mix: { coccus: 16, rod: 10, swarm: 24 }, wall: ['rod', 4] }, // 12
        { mix: { coccus: 26, rod: 13, swarm: 24 } }, // 13
        { mix: { coccus: 26, rod: 13, swarm: 24 } }, // 14
        { mix: { coccus: 21, rod: 11, swarm: 12, runner: 8 }, wall: ['runner', 11] }, // 15
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9 } }, // 16
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9 } }, // 17
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9 }, wall: ['rod', 6] }, // 18
        { mix: { coccus: 27, rod: 14, swarm: 24, runner: 10 } }, // 19
        { mix: { coccus: 36, rod: 18, swarm: 24, runner: 14 }, boss: 'rodLeader' }, // 20 Вожак палочек 200 HP
        { mix: { coccus: 26, rod: 13, swarm: 24, runner: 10, splitter: 7 } }, // 21
        { mix: { coccus: 27, rod: 13, swarm: 24, runner: 10, splitter: 7 } }, // 22
        { mix: { coccus: 27, rod: 14, swarm: 24, runner: 10, splitter: 7 }, wall: ['splitter', 11] }, // 23
        { mix: { coccus: 30, rod: 15, swarm: 24, runner: 11, splitter: 7 } }, // 24
        { mix: { coccus: 25, rod: 12, swarm: 24, runner: 9, splitter: 6, armored: 2 } }, // 25
        { mix: { coccus: 25, rod: 13, swarm: 24, runner: 9, splitter: 6, armored: 3 }, wall: ['armored', 3] }, // 26
        { mix: { coccus: 28, rod: 14, swarm: 24, runner: 10, splitter: 7, armored: 3 } }, // 27
        { mix: { coccus: 28, rod: 14, swarm: 24, runner: 11, splitter: 7, armored: 3 } }, // 28
        { mix: { coccus: 29, rod: 15, swarm: 24, runner: 11, splitter: 7, armored: 3 } }, // 29
        { mix: { coccus: 36, rod: 18, swarm: 24, runner: 14, splitter: 9, armored: 4 }, boss: 'armadillo' }, // 30 Броненосец 1530 HP
        { mix: { coccus: 33, rod: 16, swarm: 24, runner: 12, splitter: 8, armored: 3 } }, // 31
        { mix: { coccus: 33, rod: 17, swarm: 24, runner: 12, splitter: 8, armored: 3 } }, // 32
        { mix: { coccus: 34, rod: 17, swarm: 24, runner: 13, splitter: 8, armored: 3 }, wall: ['armored', 4] }, // 33
        { mix: { coccus: 37, rod: 18, swarm: 24, runner: 14, splitter: 9, armored: 4 } }, // 34
        { mix: { coccus: 32, rod: 16, swarm: 24, runner: 12, splitter: 8, armored: 3, slick: 5 } }, // 35
        { mix: { coccus: 33, rod: 17, swarm: 24, runner: 12, splitter: 8, armored: 3, slick: 5 }, wall: ['slick', 9] }, // 36
        { mix: { coccus: 36, rod: 18, swarm: 24, runner: 14, splitter: 9, armored: 4, slick: 5 } }, // 37
        { mix: { coccus: 36, rod: 18, swarm: 24, runner: 14, splitter: 9, armored: 4, slick: 5 } }, // 38
        { mix: { coccus: 36, rod: 18, swarm: 24, runner: 14, splitter: 9, armored: 4, slick: 5 } }, // 39
        { mix: { coccus: 42, rod: 21, swarm: 36, runner: 16, splitter: 11, armored: 4, slick: 6 }, boss: 'swarmQueen' }, // 40 Матка роя 6891 HP
        { mix: { coccus: 39, rod: 19, swarm: 24, runner: 14, splitter: 10, armored: 4, slick: 6 } }, // 41
        { mix: { coccus: 39, rod: 19, swarm: 24, runner: 14, splitter: 10, armored: 4, slick: 6 } }, // 42
        { mix: { coccus: 39, rod: 19, swarm: 24, runner: 15, splitter: 10, armored: 4, slick: 6 }, wall: ['armored', 6] }, // 43
        { mix: { coccus: 41, rod: 20, swarm: 36, runner: 15, splitter: 10, armored: 4, slick: 6 } }, // 44
        { mix: { coccus: 41, rod: 20, swarm: 36, runner: 15, splitter: 10, armored: 4, slick: 6 } }, // 45
        { mix: { coccus: 41, rod: 20, swarm: 36, runner: 15, splitter: 10, armored: 4, slick: 6 }, wall: ['runner', 37] }, // 46
        { mix: { coccus: 43, rod: 21, swarm: 36, runner: 16, splitter: 11, armored: 4, slick: 6 } }, // 47
        { mix: { coccus: 43, rod: 21, swarm: 36, runner: 16, splitter: 11, armored: 4, slick: 6 }, wall: ['armored', 6] }, // 48
        { mix: { coccus: 65, rod: 32, swarm: 48, runner: 24, splitter: 16, armored: 6, slick: 10 } }, // 49
        { mix: { coccus: 94, rod: 47, swarm: 72, runner: 35, splitter: 24, armored: 9, slick: 14 }, boss: 'giantColony' }, // 50 Гигантская колония 4000 HP
          ] as PlanWave[],
        },
      },
      // Уровень 2 «Нос» — новый формат (план docs/level2-plan-2026-10-23.md; решение владельца 23 октября 2026: вариант C рабочий, устройство принято, числа — начальные, окончательные — по лестницам и после «да» владельца).
      // Состав волн — приложение А плана (модель docs/level2-model-2026-10-23.mjs, `--comp=C`): 14 стен-пачек, мини-боссы на 10/20/30/40-й, босс на 50-й; новые виды — спора (8), лекарь (12), прыгун (18).
      // Параметры времени и дохода — как у уровня 1; отличаются `hpScale` (прочность одной бактерии ×4,8 к форме уровня 1) и `armorPerWave`. Жёсткие свойства — те же, что у уровня 1.
      {
        plan: {
          startCoins: 200,
          pauseSec: 4,
          spawnBaseSec: 8,
          spawnPerWaveSec: 0.6,
          spawnMaxSec: 30,
          miniBossSec: 15,
          bossSec: 75,
          wallGapSec: 0.4,
          bossEnterShare: 0.5,
          incomeBase: 25,
          incomePerWave: 7,
          incomeMiniBoss: 60,
          /** Множитель прочности всех видов к уровню 1 (вариант C плана: наименьшее значение с шагом 0,1, при котором в 50-й волне не больше 300 бактерий). */
          hpScale: 4.8,
          hpFlatUntil: 8,
          hpExp: 1.75,
          hpLateFrom: 30,
          hpLateExp: 1.0,
          /** Броня растёт с волной: × (1 + 0,04 · (n − 1)) (на уровне 1 — 0,03). */
          armorPerWave: 0.04,
          hardWalls: { runnerSlow: 1, armoredPierce: 1, slickBeam: 1, slickMemory: 0, bossArea: 1 },
          /** Волны 1–50 (приложение А плана): mix — обычные бактерии, wall — стена (вид, сколько штук одной пачкой), boss — босс волны (таблица `bosses`). */
          waves: [
        { mix: { coccus: 5 } }, // 1
        { mix: { coccus: 2, rod: 1 } }, // 2
        { mix: { coccus: 3, rod: 2 } }, // 3
        { mix: { coccus: 3, rod: 2, swarm: 12 } }, // 4
        { mix: { coccus: 4, rod: 2, swarm: 12 }, wall: ['rod', 1] }, // 5
        { mix: { coccus: 6, rod: 3, swarm: 12, runner: 2 } }, // 6
        { mix: { coccus: 7, rod: 3, swarm: 12, runner: 3 } }, // 7
        { mix: { coccus: 7, rod: 4, swarm: 12, runner: 3, spore: 2 } }, // 8
        { mix: { coccus: 7, rod: 4, swarm: 12, runner: 3, spore: 2 }, wall: ['runner', 4] }, // 9
        { mix: { coccus: 11, rod: 6, swarm: 12, runner: 4, spore: 3 }, boss: 'sporeling' }, // 10 Споровик 489 HP
        { mix: { coccus: 8, rod: 4, swarm: 12, runner: 3, spore: 2, splitter: 2 } }, // 11
        { mix: { coccus: 8, rod: 4, swarm: 12, runner: 3, spore: 2, splitter: 2, healer: 1 } }, // 12
        { mix: { coccus: 8, rod: 4, swarm: 12, runner: 3, spore: 2, splitter: 2, healer: 1 }, wall: ['splitter', 3] }, // 13
        { mix: { coccus: 10, rod: 5, swarm: 12, runner: 4, spore: 2, splitter: 2, healer: 1 } }, // 14
        { mix: { coccus: 8, rod: 4, swarm: 12, runner: 3, spore: 2, splitter: 2, healer: 1, armored: 1 } }, // 15
        { mix: { coccus: 8, rod: 4, swarm: 12, runner: 3, spore: 2, splitter: 2, healer: 1, armored: 1 }, wall: ['spore', 12] }, // 16
        { mix: { coccus: 10, rod: 5, swarm: 12, runner: 4, spore: 3, splitter: 3, healer: 1, armored: 1 } }, // 17
        { mix: { coccus: 10, rod: 5, swarm: 12, runner: 4, spore: 2, splitter: 2, healer: 1, armored: 1, leaper: 2 } }, // 18
        { mix: { coccus: 10, rod: 5, swarm: 12, runner: 4, spore: 2, splitter: 2, healer: 1, armored: 1, leaper: 2 }, wall: ['armored', 2] }, // 19
        { mix: { coccus: 19, rod: 10, swarm: 12, runner: 7, spore: 5, splitter: 5, healer: 2, armored: 2, leaper: 4 }, boss: 'shaman' }, // 20 Знахарь 900 HP
        { mix: { coccus: 11, rod: 6, swarm: 12, runner: 4, spore: 3, splitter: 3, healer: 1, armored: 1, leaper: 2 } }, // 21
        { mix: { coccus: 12, rod: 6, swarm: 12, runner: 4, spore: 3, splitter: 3, healer: 1, armored: 1, leaper: 2 } }, // 22
        { mix: { coccus: 12, rod: 6, swarm: 12, runner: 4, spore: 3, splitter: 3, healer: 1, armored: 1, leaper: 2 }, wall: ['healer', 7] }, // 23
        { mix: { coccus: 12, rod: 6, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 2 } }, // 24
        { mix: { coccus: 13, rod: 6, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 3 } }, // 25
        { mix: { coccus: 13, rod: 6, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 3 }, wall: ['leaper', 10] }, // 26
        { mix: { coccus: 14, rod: 7, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 3 } }, // 27
        { mix: { coccus: 12, rod: 6, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 2, slick: 2 } }, // 28
        { mix: { coccus: 13, rod: 6, swarm: 12, runner: 5, spore: 3, splitter: 3, healer: 2, armored: 1, leaper: 3, slick: 2 }, wall: ['splitter', 8] }, // 29
        { mix: { coccus: 20, rod: 10, swarm: 12, runner: 7, spore: 5, splitter: 5, healer: 2, armored: 2, leaper: 4, slick: 3 }, boss: 'hopper' }, // 30 Скакун 5312 HP
        { mix: { coccus: 15, rod: 7, swarm: 12, runner: 6, spore: 4, splitter: 4, healer: 2, armored: 1, leaper: 3, slick: 2 } }, // 31
        { mix: { coccus: 15, rod: 8, swarm: 12, runner: 6, spore: 4, splitter: 4, healer: 2, armored: 2, leaper: 3, slick: 2 } }, // 32
        { mix: { coccus: 16, rod: 8, swarm: 12, runner: 6, spore: 4, splitter: 4, healer: 2, armored: 2, leaper: 3, slick: 2 }, wall: ['slick', 5] }, // 33
        { mix: { coccus: 17, rod: 9, swarm: 12, runner: 6, spore: 4, splitter: 4, healer: 2, armored: 2, leaper: 3, slick: 3 } }, // 34
        { mix: { coccus: 18, rod: 9, swarm: 12, runner: 7, spore: 5, splitter: 5, healer: 2, armored: 2, leaper: 4, slick: 3 } }, // 35
        { mix: { coccus: 19, rod: 9, swarm: 12, runner: 7, spore: 5, splitter: 5, healer: 2, armored: 2, leaper: 4, slick: 3 }, wall: ['armored', 3] }, // 36
        { mix: { coccus: 20, rod: 10, swarm: 12, runner: 8, spore: 5, splitter: 5, healer: 3, armored: 2, leaper: 4, slick: 3 } }, // 37
        { mix: { coccus: 21, rod: 10, swarm: 12, runner: 8, spore: 5, splitter: 5, healer: 3, armored: 2, leaper: 4, slick: 3 } }, // 38
        { mix: { coccus: 21, rod: 10, swarm: 12, runner: 8, spore: 5, splitter: 5, healer: 3, armored: 2, leaper: 4, slick: 3 }, wall: ['rod', 11] }, // 39
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9, spore: 6, splitter: 6, healer: 3, armored: 2, leaper: 5, slick: 4 }, boss: 'sporeMother' }, // 40 Мать спор 21979 HP
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9, spore: 6, splitter: 6, healer: 3, armored: 2, leaper: 5, slick: 4 } }, // 41
        { mix: { coccus: 24, rod: 12, swarm: 24, runner: 9, spore: 6, splitter: 6, healer: 3, armored: 2, leaper: 5, slick: 4 } }, // 42
        { mix: { coccus: 25, rod: 12, swarm: 24, runner: 9, spore: 6, splitter: 6, healer: 3, armored: 2, leaper: 5, slick: 4 }, wall: ['healer', 16] }, // 43
        { mix: { coccus: 26, rod: 13, swarm: 24, runner: 10, spore: 7, splitter: 7, healer: 3, armored: 3, leaper: 5, slick: 4 } }, // 44
        { mix: { coccus: 27, rod: 13, swarm: 24, runner: 10, spore: 7, splitter: 7, healer: 3, armored: 3, leaper: 5, slick: 4 } }, // 45
        { mix: { coccus: 27, rod: 14, swarm: 24, runner: 10, spore: 7, splitter: 7, healer: 3, armored: 3, leaper: 5, slick: 4 }, wall: ['runner', 29] }, // 46
        { mix: { coccus: 29, rod: 14, swarm: 24, runner: 11, spore: 7, splitter: 7, healer: 4, armored: 3, leaper: 6, slick: 4 } }, // 47
        { mix: { coccus: 29, rod: 15, swarm: 24, runner: 11, spore: 7, splitter: 7, healer: 4, armored: 3, leaper: 6, slick: 4 }, wall: ['leaper', 26] }, // 48
        { mix: { coccus: 31, rod: 16, swarm: 24, runner: 12, spore: 8, splitter: 8, healer: 4, armored: 3, leaper: 6, slick: 5 } }, // 49
        { mix: { coccus: 80, rod: 40, swarm: 60, runner: 30, spore: 20, splitter: 20, healer: 10, armored: 8, leaper: 16, slick: 12 }, boss: 'silencer' }, // 50 Глушитель 19226 HP
          ] as PlanWave[],
        },
      },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 9 }, hpBudget: [10, 1174], growth: { perWave: 0.08, fromWave: 8, latePerWave: 0.95, lateFromWave: 16 } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 10, leaper: 14 }, hpBudget: [10, 1255], growth: { perWave: 0.08, fromWave: 8, latePerWave: 1.6, lateFromWave: 16 } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, leaper: 10, healer: 11, stealth: 15 }, hpBudget: [10, 1336], growth: { perWave: 0.08, fromWave: 8, latePerWave: 2.6, lateFromWave: 16 } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, leaper: 11, commander: 12, phago: 15, stealth: 18 }, hpBudget: [10, 1417], growth: { perWave: 0.08, fromWave: 8, latePerWave: 3.2, lateFromWave: 16 } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, leaper: 12, brood: 13, phago: 15, stealth: 17, toxin: 21 }, hpBudget: [10, 1498], growth: { perWave: 0.08, fromWave: 8, latePerWave: 2.9, lateFromWave: 16 } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12, leaper: 13, phago: 14, stealth: 16, toxin: 19, parasite: 22 }, hpBudget: [10, 1579], growth: { perWave: 0.08, fromWave: 8, latePerWave: 3.0, lateFromWave: 16 }, bosses: { 20: { giant: 1 }, 25: { giant: 1 }, 30: { giant: 2 } } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12, leaper: 13, phago: 14, stealth: 17, toxin: 22, parasite: 19, mutant: 27 }, hpBudget: [10, 1659], growth: { perWave: 0.08, fromWave: 8, latePerWave: 2.95, lateFromWave: 16 }, bosses: { 15: { giant: 1 }, 20: { giant: 1 }, 25: { giant: 2 }, 30: { giant: 2 } } },
      { intro: { coccus: 1, rod: 2, swarm: 3, runner: 4, splitter: 5, armored: 6, spore: 7, slick: 8, regen: 9, healer: 10, commander: 11, brood: 12, leaper: 13, phago: 14, stealth: 16, toxin: 23, parasite: 18, mutant: 26 }, hpBudget: [10, 1740], growth: { perWave: 0.08, fromWave: 8, latePerWave: 2.7, lateFromWave: 16 }, bosses: { 20: { giant: 1 }, 25: { giant: 2 }, 30: { giant: 3 } } },
    ] as LevelSpec[],
  },

  // ------------------------------------------------------------
  //  БАШНИ (таблица: одна строка — одна башня; новая башня = новая строка)
  // ------------------------------------------------------------
  //  Колонки:
  //   price          — цена в монетах
  //   range          — радиус стрельбы, пикселей (клетка = 77,25 px, то есть 200 ≈ две с половиной клетки); у башни с лучом ('beam') радиуса нет — 0
  //   damage         — сколько HP снимает один выстрел (каждой задетой бактерии; у бронированных броня вычитается, см. combat)
  //   cooldownMs     — пауза между выстрелами, мс
  //   projectileSpeed— скорость снаряда, пикселей в секунду
  //  Способ стрельбы — колонка targeting (КАК бьёт) и side (КУДА смотрит):
  //   targeting:
  //     'radius' — каждый выстрел по одной бактерии из тех, что в радиусе (выбирается ближайшая к организму);
  //     'area'   — снаряд летит в цель и взрывается: в круге blastRadius вокруг места взрыва полный урон получают только blastFullTargets ближайших к центру бактерий, остальные — урон × blastRestMul (см. ниже);
  //     'puddle' — НЕ бьёт бактерий: бросает на дорожку (впереди идущей бактерии) лужу, в которой бактерии замедляются;
  //     'beam'   — НАПРАВЛЕННЫЙ ЛУЧ: игрок поворачивает башню (тап по башне — на 45°), башня бьёт очередью по линии через всю карту;
  //     'snipe'  — как 'radius', но цель — самая прочная (по текущему HP) бактерия в радиусе (Ампула: огромный радиус, редкий сильный выстрел);
  //     'poison' — как 'radius' (цель — ближайшая к организму), но снаряд не бьёт, а накладывает яд (см. dotPerSec, dotSec);
  //     'cone'   — КОНУС СВЕТА (Лампа): снарядов нет, башня смотрит на ближайшую к организму бактерию в радиусе и каждый тик (cooldownMs — пауза между тиками) наносит
  //                damage (за тик, броня вычитается из каждого тика) ВСЕМ бактериям в конусе: длина — range, угол — coneDeg; скрытных видит полностью;
  //     'aura'   — АУРА (Витамин): сама не стреляет; башни в радиусе range (расстояние между центрами) ждут паузу между выстрелами × auraMul (меньше 1 — быстрее);
  //                у нескольких Витаминов берётся сильнейший (не складываются); Витамин в облаке Токсина или заглушенный спорой не действует.
  //   side (для 'radius' и 'area'; «вперёд/назад» считается по дорожкам — расстояние до организма у башни и у бактерии):
  //     'both' — любых в радиусе; 'forward' — только тех, кто ещё не дошёл до башни; 'back' — только тех, кто уже прошёл.
  //  Особые свойства (0 — свойства нет):
  //   blastRadius — радиус взрыва, пикселей ('area')
  //   slowFactor, slowSec — замедление: бактерия идёт в slowFactor раз медленнее (0.4 = на 60 % медленнее); slowSec — сколько секунд
  //                         замедление держится после того, как бактерия вышла из лужи ('puddle')
  //   puddleRadius, puddleSec, puddleLeadPx — лужа ('puddle'): радиус, сколько секунд живёт, на сколько пикселей впереди бактерии кладётся
  //   beamPulses, beamGapMs, beamLengthPx, beamHalfWidthPx — луч ('beam'): сколько ударов в очереди, пауза между ними, длина луча
  //                         (больше диагонали карты: луч идёт до её края), полуширина попадания (к радиусу бактерии прибавляется)
  //   dotPerSec, dotSec — ЯД ('poison'): сколько HP в секунду снимает яд и сколько секунд он идёт. Яд броню не учитывает; новый укол продлевает время до полного
  //                         и берёт большую силу (не складывается); отравленная бактерия не лечится (лекарь, самолечение регенератора не работают).
  //   coneDeg           — угол конуса, градусов ('cone'; у остальных башен 0)
  //   auraMul, auraStep — АУРА ('aura'): множитель паузы башен в радиусе у Витамина 1-го уровня (0.8 = пауза на 20 % короче) и на сколько он уменьшается с каждым следующим
  //                       уровнем (0.05: 0.8 / 0.75 / 0.7 / 0.65); у остальных башен auraMul 1, auraStep 0
  //   freezeSec         — ЗАМОРОЗКА ('freeze', Холод): на сколько секунд замерзают все бактерии в радиусе (стоят на месте); у остальных башен 0. С уровнем башни растёт медленно (`freezeLevelPower`)
  //   blastFullTargets, blastRestMul — ОГРАНИЧЕНИЕ ВЗРЫВА ПО ПЛОЩАДИ ('area', Шипучка): из бактерий, которых касается круг взрыва, ПОЛНЫЙ урон получают blastFullTargets ближайших к центру взрыва
  //                         (при равенстве расстояний — с меньшим номером), остальные в круге — урон × blastRestMul (0.35 = 35 %); «Кислота» (мутация) накладывается только первым.
  //                         Относится к каждому взрыву отдельно (цепной взрыв считается заново). Радиус взрыва (улучшения, мутация «Большой взрыв») число целей с полным уроном НЕ меняет.
  //                         blastFullTargets 0 — не ограничено (у остальных башен 0 и blastRestMul 1)
  //   lightSec              — ПОДСВЕТКА СКРЫТНЫХ (Лампа): каждую скрытную бактерию в круге радиуса range башни (а не только в конусе) Лампа подсвечивает; подсвеченную остальные башни видят на ПОЛНОМ радиусе (а не на доле stealth типа),
  //                         подсветка держится ещё lightSec секунд после выхода из круга; несколько Ламп не складываются; 0 — башня не подсвечивает (все башни кроме Лампы)
  //   trapSec, trapDps  — ЛОВУШКА ('trap', Пластырь): на сколько секунд бактерия приклеивается к месту и сколько HP в секунду теряет (броню не учитывает); у остальных башен 0
  //   'freeze' — ХОЛОД: когда в радиусе есть хотя бы одна бактерия, которая может замёрзнуть, и пауза прошла, замораживает ВСЕХ бактерий в радиусе (кроме `freezeImmune`);
  //   'trap'   — ПЛАСТЫРЬ: когда в радиусе есть бактерия, которая может прилипнуть, кладёт на дорожку под первую (ближайшую к организму) ловушку (кроме `trapImmune`; с мутацией — под несколько).
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Шипучка — взрыв по малой площади: медленный снаряд, большой урон бактериям в маленьком круге: первым пяти (ближайшим к центру) — полный, остальным — 35 %. Убийца кучек (Рой, дети делящейся);
     *  по одиночным слабее Таблетки. Ограничение по площади введено по решению владельца 11 октября 2026: без него одни Шипучки проходили любой уровень. */
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 5,
      blastRestMul: 0.35,
      lightSec: 0,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Ампула — снайпер: огромный радиус, один сильный выстрел в самую прочную бактерию в радиусе, долго перезаряжается. Убивает гигантов и броненосных ещё на подходе; по рою и толпе бесполезна; дорогая.
     *  Первое приближение (docs/stage-7-plan.md), числа подбирает бот. Открывается на уровне 3. */
    ampule: {
      price: 260,
      range: 520,
      damage: 12,
      cooldownMs: 5500,
      projectileSpeed: 900,
      targeting: 'snipe' as Targeting,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Антибиотик — яд: снаряд ничего не ломает сразу, а отравляет бактерию (1,2 HP/с шесть секунд ≈ 7,2 HP). Яд броню не учитывает, идёт и после гибели башни; отравленный не лечится.
     *  Слаб против быстрых (не успевает). Первое приближение (docs/stage-7-plan.md). Открывается на уровне 6. */
    antibiotic: {
      price: 120,
      range: 190,
      damage: 0,
      cooldownMs: 1800,
      projectileSpeed: 560,
      targeting: 'poison' as Targeting,
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
      dotPerSec: 1.2,
      dotSec: 6,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Лампа — детектор (решение владельца 12 октября 2026, docs/lamp-plan.md): подсвечивает скрытных бактерий в круге радиуса range (подсветка держится ещё lightSec секунд), подсвеченных видят все башни на полном радиусе;
     *  урон за тик 0,06 (документ дизайна docs/redesign-2026-10-19.md, п. 4.2: нерф, было 0,1). История: собственный урон слабый: конус света бьёт всех бактерий перед башней, но 1 урона в секунду каждой (0,1 за тик раз в 100 мс; броня вычитается из каждого тика, но не меньше armorMinShare тика). Число 0,1 — наибольшее из сетки 0,05 / 0,1 / 0,2 / 0,3,
     *  при котором одна Лампа + Сироп не выиграла ни одной партии из 6 на уровнях 5, 6 и 10 (замер 12 октября, `expert`; при 0,2 на уровне 10 — 6 побед из 6, при 0,3 на уровне 5 — 3 победы; до этого было 1,4 — 14 урона в секунду).
     *  Открывается на уровне 5. */
    lamp: {
      price: 200,
      range: 200,
      damage: 0.06,
      cooldownMs: 100,
      projectileSpeed: 0,
      targeting: 'cone' as Targeting,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 50,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 1.5,
    },
    /** Витамин — усилитель: сам не стреляет, но башни в радиусе 235 px (равен радиусу слияния; граница — по центру башни) ждут между выстрелами на 20 % меньше
     *  (пауза ×0,8; 2–4 уровни Витамина — ×0,75 / ×0,7 / ×0,65). Несколько Витаминов не складываются: берётся сильнейший. Действует и на Ампулу, и на Антибиотик, и на Лампу (быстрее тики).
     *  Первое приближение (docs/stage-7-plan.md). Открывается на уровне 7. */
    vitamin: {
      price: 150,
      range: 235,
      damage: 0,
      cooldownMs: 0,
      projectileSpeed: 0,
      targeting: 'aura' as Targeting,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 0.8,
      auraStep: 0.05,
      freezeSec: 0,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Холод — заморозка: раз в 8 с, когда в радиусе есть хотя бы одна бактерия, замораживает ВСЕХ бактерий в радиусе на 1,5 с (стоят на месте). Сам ничего не наносит; останавливает толпу целиком и даёт время
     *  другим башням. Слизень и гигант не замерзают (`types.*.freezeImmune`). Первое приближение (docs/stage-7-plan.md), числа подбирает бот. Открывается на уровне 8. */
    frost: {
      price: 180,
      range: 170,
      damage: 0,
      cooldownMs: 8000,
      projectileSpeed: 0,
      targeting: 'freeze' as Targeting,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 1.5,
      trapSec: 0,
      trapDps: 0,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
    },
    /** Пластырь — ловушка: раз в 14 с, когда в радиусе есть бактерия, кладёт на дорожку под первую (ближайшую к организму) пластырь: бактерия приклеивается к месту на 3 с и теряет 2 HP/с (≈ 6 HP; броню
     *  не учитывает). Прыгун и слизень не липнут (`types.*.trapImmune`). Держит самую опасную бактерию, пока подходят остальные. Первое приближение (docs/stage-7-plan.md). Открывается на уровне 9. */
    patch: {
      price: 140,
      range: 200,
      damage: 0,
      cooldownMs: 14000,
      projectileSpeed: 0,
      targeting: 'trap' as Targeting,
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
      dotPerSec: 0,
      dotSec: 0,
      coneDeg: 0,
      auraMul: 1,
      auraStep: 0,
      freezeSec: 0,
      trapSec: 3,
      trapDps: 2,
      blastFullTargets: 0,
      blastRestMul: 1,
      lightSec: 0,
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
  /** Рост времени заморозки Холода с уровнем башни: время × (damageMul уровня) ^ это число (0,25: уровень 2 — ×1,17, 3 — ×1,38, 4 — ×1,59; у Холода своего урона нет). Время приклеивания Пластыря с уровнем не растёт, его урон в секунду растёт как урон (damageMul). */
  freezeLevelPower: 0.25,
  /** Уровни, на которых башня получает выбор мутации (по одному выбору на каждый порог; выбор бесплатный и окончательный). */
  /** Радиус слияния, пикселей между центрами башен (решение владельца 8 октября 2026: слияние по радиусу, а не по всей карте). Две одинаковые башни одного уровня
   *  сливаются, только если расстояние между ними не больше этого числа; ≈ 3 клетки по 77,25 px. */
  mergeRadiusPx: 235,
  mutationLevels: [2, 4] as number[],
  /** Сложение мутаций при слиянии (решение владельца 8 октября 2026): башня получает мутации обеих сливаемых башен. Одинаковые мутации складываются с убывающей отдачей:
   *  k-й экземпляр даёт долю copyShares[k] своего эффекта (первый — 100 %, второй — 50 %, третий и дальше — последняя доля). Пример: «Скорострел» (пауза −35 %) дважды — пауза ×0,65 × 0,825 ≈ ×0,54. */
  mutationStack: { copyShares: [1, 0.5, 0.25, 0] as number[] },
  /** Потолки мутаций (документ дизайна docs/redesign-2026-10-19.md, п. 4.2; копии одной мутации — доли 1; 0,5; 0,25; 0 выше):
   *  coneDeg — самый широкий конус Лампы, градусов; freezeShareOfCooldown — заморозка Холода не дольше этой доли его паузы; refreezeSec — ту же бактерию снова заморозить не раньше чем через столько секунд
   *  после оттаивания; extraTargetsMax — дополнительных целей не больше; pulsesMax — ударов в очереди Шприца не больше; dpsMul — урон в секунду одной башни от всех её мутаций не больше этого множителя
   *  к той же башне без мутаций; auraExcluded — на эти башни аура Витамина не действует; spiralInCap — 1: прибавка «Спирали» входит в потолок dpsMul (при превышении масштабируются урон и прибавка), 0 — не входит,
   *  как прежде (ключ для замера варианта А, решение владельца 25 октября 2026; по умолчанию 0, игра не меняется). Нижние границы замедления в луже и паузы от ауры — `meta.minSlowFactor`, `meta.minAuraMul`. */
  mutationCaps: { coneDeg: 75, freezeShareOfCooldown: 0.5, refreezeSec: 3, extraTargetsMax: 2, pulsesMax: 5, dpsMul: 2.5, spiralInCap: 0, auraExcluded: ['lamp', 'vitamin', 'syrup', 'frost', 'patch'] as string[] },
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
    ampule: [
      [{ id: 'ampuleRapid', cooldownMul: 0.65 }, { id: 'ampulePierce', armorPierce: true }],
      [{ id: 'ampuleMight', damageMul: 1.6 }, { id: 'ampuleTwin', extraTargets: 1 }],
    ],
    antibiotic: [
      [{ id: 'antibioticLong', dotSecMul: 1.5 }, { id: 'antibioticQuick', cooldownMul: 0.65 }],
      [{ id: 'antibioticStrong', dotDpsMul: 1.6 }, { id: 'antibioticSpread', extraTargets: 1 }],
    ],
    lamp: [
      [{ id: 'lampNarrow', coneMul: 0.6, damageMul: 1.5 }, { id: 'lampWide', coneMul: 1.6 }],
      [{ id: 'lampBlaze', damageMul: 1.6 }, { id: 'lampFar', rangeMul: 1.4 }],
    ],
    vitamin: [
      [{ id: 'vitaminBoost', auraBonusMul: 1.5 }, { id: 'vitaminFar', rangeMul: 1.3 }],
      [{ id: 'vitaminStrong', auraBonusMul: 1.5 }, { id: 'vitaminDouble', rangeMul: 1.3 }],
    ],
    frost: [
      [{ id: 'frostDeep', freezeMul: 1.5 }, { id: 'frostFrequent', cooldownMul: 0.7 }],
      [{ id: 'frostLong', freezeMul: 1.5 }, { id: 'frostWide', rangeMul: 1.4 }],
    ],
    patch: [
      [{ id: 'patchSticky', trapSecMul: 1.5 }, { id: 'patchQuick', cooldownMul: 0.65 }],
      [{ id: 'patchCaustic', trapDpsMul: 2 }, { id: 'patchTwin', extraTargets: 1 }],
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
  //   armor                             — БРОНЯ: каждый удар слабее на armor (но не меньше combat.armorMinShare от удара); растёт с волной и уровнем (`combat.armorGrowth`)
  //   dashEverySec, dashSec, dashFactor — РЫВКИ: раз в dashEverySec секунд на dashSec секунд скорость растёт в dashFactor раз
  //   splitCount, splitGapPx            — ДЕЛЕНИЕ при гибели: сколько кокков появляется и на каком расстоянии друг от друга
  //                                       (вдоль дорожки), пикселей
  //   disableSec, disableRadius         — ГЛУШЕНИЕ БАШЕН: проходя ближе disableRadius пикселей к башне, отключает её на disableSec
  //                                       секунд (каждую башню одна бактерия глушит один раз)
  //   healRadius, healShare             — ЛЕЧЕНИЕ: бактерии в радиусе healRadius пикселей лечатся на долю healShare своей полной прочности в секунду (0,02 = 2 % в секунду; растёт вместе с прочностью)
  //   spawnGapSec                       — ПАЧКА: бактерии этого типа выходят подряд с такой паузой (секунд) и по одному входу
  //   regenShare                        — САМОЛЕЧЕНИЕ: какую долю полной прочности в секунду бактерия восстанавливает сама (не выше полного; 0,015 = 1,5 % в секунду)
  //   hasteRadius, hasteFactor          — УСКОРЕНИЕ: остальные бактерии в радиусе hasteRadius пикселей идут в hasteFactor раз быстрее
  //   slowImmune                        — 1: лужа Сиропа на эту бактерию не действует
  //   brewEverySec, brewCount           — РОЖДЕНИЕ: раз в brewEverySec секунд рожает brewCount бактерий роя на своём месте
  //   leapEverySec, leapPx              — ПРЫЖОК: раз в leapEverySec секунд бактерия мгновенно сдвигается вперёд по дорожке на leapPx пикселей
  //   absorbEvery                       — ПОГЛОЩЕНИЕ: каждый absorbEvery-й удар по бактерии (снаряд, взрыв, удар луча; яд не считается) ничего не снимает
  //   stealth                           — СКРЫТНОСТЬ: башня выбирает такую цель и стреляет по ней, только если расстояние до неё не больше stealth × радиус башни (плюс радиус бактерии);
  //                                       0 — не скрытная. Конус Лампы и луч Шприца видят скрытных полностью
  //   cloudRadius, cloudSec             — ОБЛАКО: после гибели бактерия оставляет облако радиуса cloudRadius пикселей на cloudSec секунд; башня в облаке (по центру башни) не стреляет,
  //                                       Витамин в облаке не усиливает; 0 — облака нет. Бактерия, дошедшая до организма, облака не оставляет
  //   memoryMul                         — ПАМЯТЬ ВИДА (Мутант): удар башни того же вида, что и прошлый удар по этой бактерии, наносит memoryMul от обычного (0,5 = вдвое меньше); удар башни другого вида штрафа
  //                                       не получает и запоминается; яд, лужи и ловушки не считаются ударами; 0 — нет памяти
  //   latchRadius, latchMul             — ПРИСОСКА (Паразит): подойдя к башне ближе latchRadius пикселей, присасывается к ближайшей: пока паразит жив и не дошёл до организма, пауза этой башни ×latchMul
  //                                       (несколько паразитов на одной башне не складываются); у Витамина во столько же раз слабее прибавка ауры; 0 — нет присоски
  //   freezeImmune, trapImmune          — 1: бактерия не замерзает от Холода / не прилипает к ловушке Пластыря
  types: {
    /** Кокк — зелёный круг. Базовый: 3 HP (было 2; документ дизайна docs/redesign-2026-10-19.md, раздел 3), медленный. */
    coccus: { hp: 3, speedFactor: 0.8, reward: 5, lifeDamage: 1, radius: 30, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Палочка — синяя вытянутая капсула. 10 HP (было 5), идёт быстрее кокка и делает рывки; на уровне 1 создаёт стены пачками. */
    rod: { hp: 10, speedFactor: 1, reward: 6, lifeDamage: 1, radius: 22, length: 104, armor: 0, dashEverySec: 3, dashSec: 1, dashFactor: 2.5, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Делящаяся — ярко-оранжевая, с перетяжкой посередине. 8 HP (было 4). Уничтожена — на этом месте появляются три кокка (было два). */
    splitter: { hp: 8, speedFactor: 0.9, reward: 8, lifeDamage: 1, radius: 27, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 3, splitGapPx: 64, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Бронированная — фиолетовая, с толстой оболочкой. 30 HP (было 20), броня 3 (было 2; растёт с волной), скорость ×0,55 (было 0,6), отнимает 2 жизни. Таблетка (урон 1) почти не берёт — нужен сильный удар. */
    armored: { hp: 30, speedFactor: 0.55, reward: 20, lifeDamage: 2, radius: 48, length: 0, armor: 3, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Спора — маленькая красная. 3 HP, быстрая (×1,6, было 1,4); проходя рядом с башней, глушит её на 3 секунды. */
    spore: { hp: 3, speedFactor: 1.6, reward: 12, lifeDamage: 1, radius: 18, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 3, disableRadius: 150, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Рой — крошечные бирюзовые, быстрые (×1,4, было 1,3), выходят плотной пачкой по одному входу. 1 HP (было 2). Против кучи — Шипучка. */
    swarm: { hp: 1, speedFactor: 1.4, reward: 2, lifeDamage: 0.25, radius: 14, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0.15, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Бегун — малиновая «капля» со следом, очень быстрый (×2,4, было 2,2). 5 HP (было 4). Башни не успевают — нужна лужа Сиропа. */
    runner: { hp: 5, speedFactor: 2.4, reward: 8, lifeDamage: 1, radius: 20, length: 52, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Лекарь — белый с розовым крестом и кольцом-аурой. 8 HP (было 6); пока жив, лечит всех рядом на 2 % их прочности в секунду (было 0,8 HP/с) — одиночные Таблетки не справляются. Против него — линия Шприца и взрыв Шипучки. */
    healer: { hp: 8, speedFactor: 0.9, reward: 14, lifeDamage: 1, radius: 24, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 140, healShare: 0.02, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Слизень — лаймовый, скользкий: лужа Сиропа на него не действует (slowImmune). 16 HP (было 12). Нужен чистый урон — поэтому Сироп против него бесполезен. */
    slick: { hp: 16, speedFactor: 0.9, reward: 12, lifeDamage: 1, radius: 28, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 1, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 1, trapImmune: 1 },
    /** Регенератор — тёмно-зелёный с белой стрелкой-кольцом. 14 HP (было 10), сам лечится на 1,5 % прочности в секунду (было 1,5 HP/с): слабые одиночные удары не добивают, нужен сильный урон разом. */
    regen: { hp: 14, speedFactor: 0.85, reward: 14, lifeDamage: 1, radius: 30, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0.015, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Командир — тёмно-синий с золотой звездой и красным кольцом. 10 HP (было 8); все бактерии в кольце радиуса 150 идут в 1,4 раза быстрее (было 1,5). Убить первым или замедлить лужей. */
    commander: { hp: 10, speedFactor: 0.9, reward: 16, lifeDamage: 1, radius: 26, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 150, hasteFactor: 1.4, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Матка — бежевая, в яйцах. 26 HP (было 24), броня 1, медленная; каждые 4 с рожает на ходу двух бактерий роя. Убить быстро (луч Шприца), детей — взрывом Шипучки. */
    brood: { hp: 26, speedFactor: 0.7, reward: 18, lifeDamage: 1, radius: 38, length: 0, armor: 1, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 4, brewCount: 2, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Гигант — огромный, тёмно-бордовый, в шипах. 100 HP, броня 2 (было 1), очень медленный; дошёл — отнимает 3 жизни. Выходит редко (уровни 8–10). */
    giant: { hp: 100, speedFactor: 0.5, reward: 80, lifeDamage: 3, radius: 66, length: 0, armor: 2, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 1, trapImmune: 0 },
    /** Прыгун — лимонно-жёлтый, с «пружинкой». 6 HP; раз в 4 с мгновенно прыгает вперёд на 130 px; на замедление не реагирует (лужа Сиропа бессильна). Бить прямым уроном. Выходит с уровня 4. */
    leaper: { hp: 6, speedFactor: 1, reward: 12, lifeDamage: 1, radius: 22, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 1, brewEverySec: 0, brewCount: 0, leapEverySec: 4, leapPx: 130, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 1 },
    /** Фагоцит — светло-розовый, с тёмным «ртом». 22 HP (было 20), медленный; поглощает каждый третий удар по нему (3, 6, 9…). Против него — площадь, луч и яд. Выходит с уровня 6. */
    phago: { hp: 22, speedFactor: 0.8, reward: 16, lifeDamage: 1, radius: 32, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 3, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Скрытная — тёмно-серая, полупрозрачная, с бледным ободком. 9 HP; башни видят её только на 60 % своего радиуса (цель выбирается и снаряд летит, только если она ближе 0,6 радиуса). Конус Лампы и луч Шприца видят её полностью; Ампуле хватает и 60 % её огромного радиуса. Выходит с уровня 5. */
    stealth: { hp: 9, speedFactor: 1, reward: 14, lifeDamage: 1, radius: 24, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0.6, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Токсин — болотно-зелёный с жёлтыми пузырями. 14 HP; после гибели оставляет облако радиуса 130 px на 3 с: башни в облаке не стреляют (Витамин не усиливает). Убивать вдали от башен (Ампула, Шприц). Выходит с уровня 7. */
    toxin: { hp: 14, speedFactor: 0.9, reward: 16, lifeDamage: 1, radius: 28, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 130, cloudSec: 3, memoryMul: 0, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Мутант — фиолетовый, с переливами. 30 HP, чуть медленнее базовой; запоминает вид башни, которая ударила последней: следующий удар башни того же вида наносит вдвое меньше (×0,5),
     *  а удар башни другого вида штрафа не получает и запоминается (метка вида видна рядом с полоской прочности). Бить башнями разных видов по очереди. Выходит с уровня 9. */
    mutant: { hp: 30, speedFactor: 0.9, reward: 22, lifeDamage: 1, radius: 30, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0.5, latchRadius: 0, latchMul: 0, freezeImmune: 0, trapImmune: 0 },
    /** Паразит — болотно-коричневый, с присоской-щупальцем. 12 HP, чуть быстрее базовой; подойдя ближе 140 px к башне, присасывается к ближайшей: её пауза ×1,5, пока паразит жив и не дошёл до организма
     *  (несколько паразитов на одну башню не складываются). Убить быстро или заморозить Холодом. Выходит с уровня 8. */
    parasite: { hp: 12, speedFactor: 1.1, reward: 14, lifeDamage: 1, radius: 22, length: 0, armor: 0, dashEverySec: 0, dashSec: 0, dashFactor: 1, splitCount: 0, splitGapPx: 0, disableSec: 0, disableRadius: 0, healRadius: 0, healShare: 0, spawnGapSec: 0, regenShare: 0, hasteRadius: 0, hasteFactor: 1, slowImmune: 0, brewEverySec: 0, brewCount: 0, leapEverySec: 0, leapPx: 0, absorbEvery: 0, stealth: 0, cloudRadius: 0, cloudSec: 0, memoryMul: 0, latchRadius: 140, latchMul: 1.5, freezeImmune: 0, trapImmune: 0 },
  },
  // ------------------------------------------------------------
  //  БОССЫ И МИНИ-БОССЫ (документ дизайна docs/redesign-2026-10-19.md, раздел 7.2; колонки — у типа `BossSpec`)
  // ------------------------------------------------------------
  //  Прочность уровня 1 — по замерам ботом (решения владельца 21 октября 2026, сообщение 1, и 22 октября 2026): Колония 169, Вожак палочек 200, Броненосец 1 530, Гигантская колония 4 000;
  //  лестницы и проверки — docs/balance-history.md, раздел «Эксперт late25x2: рост волн 31–50 и прочность босса». Дошедший мини-босс отнимает 5 жизней, дошедший босс — поражение сразу.
  bosses: {
    /** Колония (10-я волна): медленная (×0,5); на половине прочности и при гибели выпускает по 6 кокков. */
    colony: { base: 'coccus', hp: 169, speedFactor: 0.5, armor: 0, lifeDamage: 5, color: 0x7be07b, burstAt: 0.5, burstKind: 'coccus', burstCount: 6, burstOnDeath: true },
    /** Вожак палочек (20-я волна): рывок раз в 2 с; палочки ближе 150 px делают рывки вдвое чаще; замедляется не сильнее ×0,6. */
    rodLeader: { base: 'rod', hp: 200, speedFactor: 1, armor: 0, lifeDamage: 5, color: 0x5aa8ff, dashEverySec: 2, dashSec: 1, dashFactor: 2.5, rallyRadius: 150, rallyDashMul: 2, slowFloor: 0.6 },
    /** Броненосец (30-я волна): броня 13; на половине прочности сбрасывает панцирь — броня 0, скорость ×1,5. */
    armadillo: { base: 'armored', hp: 1530, speedFactor: 0.55, armor: 13, lifeDamage: 5, color: 0xb88cff, phases: [{ below: 0.5, armor: 0, speedMul: 1.5 }] },
    /** Матка роя (40-я волна): раз в 3 с выпускает 6 роёв; каждые 15 с — капсула на 3 с (неуязвима, видна как пузырь). */
    swarmQueen: { base: 'brood', hp: 6891, speedFactor: 0.7, armor: 0, lifeDamage: 5, color: 0x5fe0d0, spawnKind: 'swarm', spawnEverySec: 3, spawnCount: 6, capsuleEverySec: 15, capsuleSec: 3 },
    /** Гигантская колония (50-я волна; прочность 4 000 — решение владельца 22 октября 2026, п. 1: эксперт побеждает в первой партии, дошедшей до 50-й волны, первая победа на 9–10-й попытке;
     *  условие, что босс уровня 1 без «Лихорадки» сильнейшей стратегией не проходится (19 октября 2026, сводное сообщение, п. 3.2), для уровня 1 снято): три фазы — 100–66 % медленно и выпускает кокков; 66–33 % броня 6 и палочки пачками; 33–0 % скорость ×1,6 и самолечение 1 % прочности в секунду. */
    giantColony: {
      base: 'giant', hp: 4000, speedFactor: 0.4, armor: 0, lifeDamage: -1, color: 0xff6a5a, spawnKind: 'coccus', spawnEverySec: 4, spawnCount: 4,
      phases: [{ below: 0.66, armor: 6, spawnKind: 'rod', spawnEverySec: 5, spawnCount: 3 }, { below: 0.33, armor: 0, speedMul: 1.6, regenShare: 0.01, spawnCount: 0 }],
    },
    // Уровень 2 «Нос» (план docs/level2-plan-2026-10-23.md, раздел 2.4; прочность — вариант C, начальные числа: доли прочности волны с уровня 1, окончательные — по лестницам, шаг 5 раздела 5 плана).
    // Мать спор (40-я волна) прочнее Глушителя (50-я): так же, как Матка роя прочнее Гигантской колонии на уровне 1.
    /** Споровик (10-я волна): медленный (×0,5); на половине прочности и при гибели выпускает по 6 спор; как спора, глушит каждую башню ближе 150 px на 3 с. */
    sporeling: { base: 'spore', hp: 489, speedFactor: 0.5, armor: 0, lifeDamage: 5, color: 0xc58bff, burstAt: 0.5, burstKind: 'spore', burstCount: 6, burstOnDeath: true },
    /** Знахарь (20-я волна): раз в 6 с выпускает 2 лекарей. */
    shaman: { base: 'healer', hp: 900, speedFactor: 0.6, armor: 0, lifeDamage: 5, color: 0x7be0a0, spawnKind: 'healer', spawnEverySec: 6, spawnCount: 2 },
    /** Скакун (30-я волна): броня 8; прыгает на 130 px раз в 4 с (свойство прыгуна); на половине прочности сбрасывает броню и ускоряется ×1,5. */
    hopper: { base: 'leaper', hp: 5312, speedFactor: 0.8, armor: 8, lifeDamage: 5, color: 0xffb74a, phases: [{ below: 0.5, armor: 0, speedMul: 1.5 }] },
    /** Мать спор (40-я волна): раз в 4 с выпускает 5 спор; на половине прочности вместо спор — 3 прыгуна раз в 6 с. */
    sporeMother: { base: 'brood', hp: 21979, speedFactor: 0.6, armor: 0, lifeDamage: 5, color: 0xe05fb0, spawnKind: 'spore', spawnEverySec: 4, spawnCount: 5, phases: [{ below: 0.5, spawnKind: 'leaper', spawnEverySec: 6, spawnCount: 3 }] },
    /** Глушитель (50-я волна; имя — решение владельца 24 октября 2026): три фазы — 100–66 % раз в 4 с 4 споры; 66–33 % броня 6 и раз в 5 с 2 лекаря; 33–0 % скорость ×1,6 и самолечение 1 % прочности в секунду,
     *  ранят только взрыв Шипучки и луч Шприца (`plan.hardWalls.bossArea`); глушит башни ближе 150 px (свойство споры). */
    silencer: {
      base: 'spore', hp: 19226, speedFactor: 0.4, armor: 0, lifeDamage: -1, color: 0x8a5fff, spawnKind: 'spore', spawnEverySec: 4, spawnCount: 4,
      phases: [{ below: 0.66, armor: 6, spawnKind: 'healer', spawnEverySec: 5, spawnCount: 2 }, { below: 0.33, armor: 0, speedMul: 1.6, regenShare: 0.01, spawnCount: 0 }],
    },
  } as Record<BossId, BossSpec>,
  bossRules: {
    /** Во сколько раз босс крупнее своего вида-основы (рисунок и радиус попадания). */
    scale: 2.5,
  },
  combat: {
    /** Броня не может свести удар меньше, чем эта доля от удара: Таблетка (урон 1) против брони 2 наносит 0,25, а не 0. */
    armorMinShare: 0.25,
    /** Рост брони вида (документ дизайна, раздел 3): на уровне нового формата — с волной (`plan.armorPerWave`); на уровнях прежнего формата — × (1 + perLevel · (уровень − 1)). */
    armorGrowth: { perLevel: 0.25 },
  },
  /** Умения из древа (документ дизайна, раздел 5.1). «Лихорадка»: все башни стреляют в cooldownMul раз чаще (пауза ×0,5) durationSec секунд, перезарядка rechargeSec секунд (отсчёт — с начала действия). */
  abilities: {
    fever: { cooldownMul: 0.5, durationSec: 8, rechargeSec: 60 },
  },
  /** Ключевые узлы веток башен (документ дизайна, раздел 5.2): числа поведения. Узел — строка `meta.upgrades` с эффектом `key` в ветке башни. */
  keyNodes: {
    /** Таблетка «Рикошет»: после попадания снаряд отскакивает в ближайшую другую бактерию не дальше rangePx с долей урона damageShare. */
    pill: { damageShare: 0.5, rangePx: 160 },
    /** Сироп «Разлив»: ещё одна лужа вплотную впереди первой (вдоль дорожки) — длина лужи ×2. */
    syrup: { extraPuddles: 1 },
    /** Шипучка «Осколки»: взрыв разбрасывает shards осколков в ближайшие бактерии вне круга (не дальше rangeMul радиусов взрыва), каждый — damageShare урона. */
    fizz: { shards: 4, damageShare: 0.3, rangeMul: 2.5 },
    /** Шприц «Сквозной разряд»: первая бактерия на линии теряет броню на armorBreakSec секунд. */
    syringe: { armorBreakSec: 3 },
    /** Ампула «Разрыв»: убитая выстрелом бактерия взрывается — радиус radiusPx, доля урона выстрела damageShare. */
    ampule: { radiusPx: 60, damageShare: 0.5 },
    /** Антибиотик «Эпидемия»: яд погибшей бактерии переходит на ближайшую не дальше rangePx (с оставшимся временем). */
    antibiotic: { rangePx: 140 },
    /** Лампа «Прожектор»: бактерии в круге Лампы получают от всех башен damageMul урона (держится, как подсветка, lightSec Лампы). */
    lamp: { damageMul: 1.2 },
    /** Витамин «Иммунитет»: башни в его ауре не глушат спора и токсин. */
    vitamin: { immune: 1 },
    /** Холод «Хрупкость»: замёрзшие получают damageMul урона. */
    frost: { damageMul: 1.3 },
    /** Пластырь «Капкан»: ловушка держит ещё extraTargets цель. */
    patch: { extraTargets: 1 },
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
    /** Рост прочности бактерий от волны к волне (УРОВЕНЬ 1; у уровней 2–10 свой — `levels.specs`): с волны hpGrowthFromWave (не считая её) HP каждой бактерии × (1 + hpGrowthPerWave × (волна − hpGrowthFromWave)).
     *  0 — прочность не растёт. Кривая уровня 1 — 13–14 октября 2026 (docs/difficulty-plan.md, docs/balance-history.md, «Новая цель сложности»): 0,10 с 4-й волны, плюс поздний рост ниже;
     *  до этого было 0,08 с 8-й (круг 14). «Особо сильный» бот (лестница, 4 дорожки) побеждает на 4-й попытке, первая попытка гибнет на 7–11-й волне. */
    hpGrowthPerWave: 0.1,
    hpGrowthFromWave: 4,
    /** Общий множитель прочности всех бактерий на всех волнах и уровнях (поверх роста по волнам): 1 — как в таблице типов. Решение владельца 8 октября 2026: игра слишком лёгкая,
     *  нужно сложнее в несколько раз (docs/expert-plan.md, раздел 9); число подбирается замером ботом. */
    hpScale: 2.5,
    /** Множитель прочности ТОЛЬКО для уровня 1 (и любого уровня без `intro` в `levels.specs`), на который умножается `hpScale`: 0,8 → 2,5 × 0,8 = 2 — так подобрана кривая уровня 1
     *  (замеры «hpScale 2»). Уровни 2–10 подобраны при общем 2,5 и этот множитель не получают. Проверки `smoke` ставят 1 (им нужна прочность из таблицы типов). */
    level1HpFactor: 0.8,
    /** Добавка к росту прочности для поздних волн: после волны hpGrowthLateFromWave множитель прочности растёт ещё на hpGrowthLatePerWave за волну (к основному росту).
     *  0 — добавки нет. Нужна, чтобы слабые игроки, умирающие до этой волны, ничего не замечали, а игрок со слитыми башнями 4-го уровня упирался в стену (замер круга 15:
     *  «сильный» гибнет при множителе ≈ ×1,8, «особо сильный» держит ≈ ×4,5; одним равномерным ростом оба в цель не выводятся). Подбирается ботом.
     *  Уровень 1 при 20 жизнях (14 октября 2026, лестница `expert`, по 4 дорожки, награда 10, docs/balance-history.md): 0,4 с 12-й волны — первая попытка гибнет на 11-й волне у всех четырёх, первая победа на 4–5-й попытке
     *  (4, 5, 5, 4); 0,45 — первая попытка 10–14, победа на 4–5-й; 0,5 — победа на 5–6-й. Прежние числа при 3 жизнях: 0,3 (победа на 4-й), раньше 0,6 с 16-й. */
    hpGrowthLatePerWave: 0.4,
    hpGrowthLateFromWave: 12,
    /** Самая большая «пачка» бактерий с spawnGapSec (рой): больше — делится на несколько пачек, каждая на свой вход (12 — документ дизайна, раздел 3; было 10). */
    packMax: 12,
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
    /** Какие скорости игры переключает кнопка рядом с паузой (по кругу): 1 — обычная. Ускоряется всё: бактерии, башни, волны. ×5 добавлена 15 октября 2026 (решение владельца, пункт 5 плана тестировщика): кадр на высокой скорости делится на шаги не длиннее 1/30 с (`SIM_STEP_SEC` в `GameScene`), а остаток паузы башни переносится на следующий выстрел, поэтому урон в секунду от скорости не зависит. */
    speeds: [1, 2, 3, 5] as number[],
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
    /** Сколько расходящихся колец, кругов и искр (взрыв Шипучки, холод, кольца постановки, слияния, глушения и лужи) может быть на экране одновременно. Запас объектов
     *  готовится заранее; когда все заняты, самый старый (почти угасший) заменяется новым. */
    ringMax: 60,
    /** Сколько лучей Шприца (по одному на удар очереди) может быть на экране одновременно; когда все заняты, самый старый заменяется новым. */
    beamMax: 40,
    /** Числа урона над бактерией при каждом попадании (решение владельца 8 октября 2026: числа не ограничивать). Живут damageNumMs миллисекунд; удары по одной бактерии подряд
     *  в пределах damageNumMergeMs складываются в одно растущее число. На экране не больше damageNumMax чисел одновременно (запас объектов для телефона: при переполнении
     *  вытесняется самое мелкое число, если новое крупнее). Размер числа растёт с долей прочности бактерии, которую снял удар: от damageNumSizes[0] до последнего; пороги —
     *  damageNumSteps (доли прочности). */
    damageNumMs: 750,
    damageNumMergeMs: 260,
    /** Число урона не рисуется поверх соседнего свежего (младше damageNumMergeMs), если оно ближе этого расстояния, пикселей мира: удары складываются в одно число (у развилки толпа, 14 октября 2026). */
    damageNumNearPx: 44,
    damageNumMax: 90,
    damageNumSteps: [0.06, 0.15, 0.3] as number[],
    damageNumSizes: [0.5, 0.7, 0.95, 1.25] as number[],

    /** Красная вспышка экрана при потере жизни: сколько миллисекунд гаснет и наименьший промежуток между началами вспышек, миллисекунд. На экране одна вспышка за раз:
     *  потеря жизни раньше чем через lifeFlashMinGapMs после начала прошлой вспышки новой вспышки не даёт (жизнь списывается, тряска — как обычно).
     *  Не чаще 3 вспышек в секунду — WCAG 2.1, критерий 2.3.1 «Три вспышки» (решение владельца 20 октября 2026, сообщение 2, п. 1.5): промежуток ≥ 334 мс;
     *  400 мс > lifeFlashMs — прошлая вспышка успевает погаснуть, вспышки не складываются (было: новая вспышка на каждую потерю, вспышки складывались). */
    lifeFlashMs: 380,
    lifeFlashMinGapMs: 400,
    /** Яркость вспышки потери жизни в начале (0–1, режим сложения цветов). */
    lifeFlashAlpha: 0.45,

    /** Тряска экрана при потере жизни: сколько миллисекунд и насколько сильно
     *  (0.006 — лёгкая, 0.02 — сильная). 0 — без тряски. */
    lifeLostShakeMs: 240,
    lifeLostShakeIntensity: 0.012,

    /** Громкость звуков от 0 до 1. 0 — звука нет вообще. */
    soundVolume: 0.3,
    /** Частые звуки (выстрелы, попадания, гибели, взрывы): не чаще одного звука одного вида за столько миллисекунд (решение владельца 15 октября 2026, docs/tester-feedback-plan-2026-10-15.md, пункт 6: на поздних волнах выходило до 160 тонов в секунду игры, на ×3 — 485 в реальную секунду). */
    soundMinGapMs: 80,
    /** … и не больше стольких тонов одновременно (лишние частые звуки пропускаются; постановка, слияние, волна, победа и проигрыш идут всегда). */
    soundMaxVoices: 16,
  },

  // ------------------------------------------------------------
  //  ОЧКИ ДНК И УЛУЧШЕНИЯ ВНЕ ПАРТИИ (этап 6а, проект — docs/upgrades.md)
  // ------------------------------------------------------------
  meta: {
    dna: {
      /** Очки ДНК за пройденные волны (документ дизайна docs/redesign-2026-10-19.md, раздел 6.1): за n-ю волну `waveBase + waveStep · n`, за k пройденных волн `waveBase · k + waveStep · k · (k + 1) / 2` = 2k + 0,1·k(k+1)
       *  (было 2 + 0,516·n), умножается на множитель уровня `levelMul`; округление один раз за партию. Начисляются и за проигрыш. Единицы: ДНК. */
      waveBase: 2,
      waveStep: 0.2,
      /** Множитель очков за волны по уровням 1–10: 1; 1,6; 2,4 и дальше +0,8 за уровень. */
      levelMul: [1, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4, 7.2, 8] as number[],
      /** Нижняя граница очков за попытку, ДНК: 0 — границы нет (решение владельца 20 октября 2026, сообщение 2, п. 1.1: граница 12 ДНК отменена — «В меню» до первой волны давало 12 бесплатных ДНК,
       *  быстрая гибель на повторе — 12 вместо 3–4). Попытка платит только за пройденные волны, боссов, «без потерь», монеты и звёзды. Было 12. */
      floor: 0,
      /** За первую победу над каждым мини-боссом уровня и над боссом уровня, очков ДНК (один раз). */
      miniBossFirst: 30,
      bossFirst: 150,
      /** Уровень без потери жизней: +25 % очков за волны, один раз на уровень. */
      flawlessShare: 0.25,
      /** Добавка за победу на уровне без босса (уровни прежнего формата), очков ДНК; платится только при первой победе. На уровне с боссом её заменяет `bossFirst`. */
      winBonus: 15,
      /** Доля очков за волны на уже пройденном уровне (было 0,1, правило В; документ дизайна, раздел 6.2): мини-боссы, босс и «без потерь» на повторе не платятся. */
      replayFactor: 0.3,
      /** Остаток монет на победе переводится в очки ДНК (решение владельца 14 октября 2026, вариант А): 1 очко за каждые coinsPerPoint монет, но не больше coinsCapShare от очков за волны. На повторе — × replayFactor. */
      coinsPerPoint: 100,
      coinsCapShare: 0.1,
    },
    /** Улучшения вне партии — древо (документ дизайна, раздел 5). Одна строка — один узел; порядок строк — порядок в сохранении. branch — ветка, effect — что меняется (`UpgradeEffect`), perLevel — эффект уровня,
     *  prices — цены уровней в очках ДНК (число цен = наибольший уровень), requires — родитель и его нужный уровень. Башни открываются только узлами ветки `towers` (Таблетка — с начала);
     *  ветка башни (Сила, Скорострельность, Дальность, Оптовая закупка, ключевой узел) открыта, когда куплен узел башни. Потолок урона вне партии одной башни: ×2,0 («Сильное вещество») × ×1,4 (Сила ветки) = ×2,8. */
    upgrades: {
      /** Сильное вещество: урон всех башен +10 % за уровень, 10 уровней (всего ×2,0); цены по возрастанию, всего 1 252 (решение владельца 19 октября 2026). «Сильное вещество II» убрано. */
      damage: { branch: 'body', effect: 'damage', perLevel: 0.1, prices: [50, 65, 80, 95, 110, 125, 145, 165, 190, 227] },
      /** Питательная среда: +25 стартовых монет, 6 уровней (было +50 × 10). */
      coins: { branch: 'body', effect: 'coins', perLevel: 25, prices: [10, 14, 18, 24, 30, 40], requires: ['damage', 1] },
      /** Быстрый обмен веществ: награда +4 %, 5 уровней (было +5 % × 10). */
      reward: { branch: 'body', effect: 'reward', perLevel: 0.04, prices: [15, 20, 30, 40, 55], requires: ['damage', 2] },
      lives: { branch: 'defense', effect: 'lives', perLevel: 1, prices: [40, 50, 70], requires: ['coins', 3] },
      shield: { branch: 'defense', effect: 'shield', perLevel: 1, prices: [35, 45, 60, 75, 100], requires: ['lives', 1] },
      recycle: { branch: 'defense', effect: 'sellRefund', perLevel: 0.03, prices: [25, 30, 40, 55, 70], requires: ['coins', 5] },
      reinforce: { branch: 'defense', effect: 'waveCoins', perLevel: 3, prices: [25, 30, 40, 55, 70, 95, 120, 155], requires: ['reward', 3] },
      /** Узлы башен (раздел 5.1): Сироп 10 → Шипучка 20 → Шприц 40 (решение владельца 22 октября 2026) → Ампула 320 и Лампа 380 → Антибиотик 480 → Витамин 700 → Холод 800 → Пластырь 900. */
      towerSyrup: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [10] },
      towerFizz: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [20], requires: ['towerSyrup', 1] },
      towerSyringe: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [40], requires: ['towerFizz', 1] },
      towerAmpule: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [320], requires: ['towerSyringe', 1] },
      towerAntibiotic: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [480], requires: ['towerAmpule', 1] },
      towerLamp: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [380], requires: ['towerSyringe', 1] },
      towerVitamin: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [700], requires: ['towerAntibiotic', 1] },
      towerFrost: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [800], requires: ['towerVitamin', 1] },
      towerPatch: { branch: 'towers', effect: 'tower', perLevel: 1, prices: [900], requires: ['towerFrost', 1] },
      /** «Лихорадка» (умение, 150 ДНК, после Шипучки): все башни стреляют вдвое чаще 8 с, перезарядка 60 с (`abilities.fever`). */
      fever: { branch: 'skills', effect: 'fever', perLevel: 1, prices: [150], requires: ['towerFizz', 1] },
      /** «Автостарт волны» (40 ДНК, после Шипучки): следующая волна выходит сразу, как только на поле не осталось бактерий, не дожидаясь конца паузы. */
      autoWave: { branch: 'skills', effect: 'autoWave', perLevel: 1, prices: [40], requires: ['towerFizz', 1] },
      /** Ветки башен (раздел 5.2): Сила (урон +8 % × 5), Скорострельность (пауза −4 % × 5), Дальность (радиус +3 % × 4), Оптовая закупка (цена −3 % × 4), ключевой узел (требует Силу 3). Цены у Таблетки; у остальных ×1,2–7. */
      pillPower: { branch: 'pill', effect: 'towerDamage', perLevel: 0.08, prices: [10, 14, 18, 24, 32], requires: ['damage', 2] },
      pillRate: { branch: 'pill', effect: 'cooldown', perLevel: -0.04, prices: [12, 16, 22, 30, 40], requires: ['pillPower', 2] },
      pillRange: { branch: 'pill', effect: 'range', perLevel: 0.03, prices: [10, 14, 20, 28], requires: ['pillPower', 2] },
      pillCheap: { branch: 'pill', effect: 'price', perLevel: -0.03, prices: [12, 16, 22, 30], requires: ['pillRate', 2] },
      pillKey: { branch: 'pill', effect: 'key', perLevel: 1, prices: [110], requires: ['pillPower', 3] },
      syrupPower: { branch: 'syrup', effect: 'puddleSec', perLevel: 0.08, prices: [12, 16, 22, 30, 40], requires: ['towerSyrup', 1] },
      syrupRate: { branch: 'syrup', effect: 'cooldown', perLevel: -0.04, prices: [14, 19, 26, 36, 48], requires: ['syrupPower', 2] },
      syrupRange: { branch: 'syrup', effect: 'range', perLevel: 0.03, prices: [12, 17, 24, 34], requires: ['syrupPower', 2] },
      syrupCheap: { branch: 'syrup', effect: 'price', perLevel: -0.03, prices: [14, 19, 26, 36], requires: ['syrupRate', 2] },
      syrupKey: { branch: 'syrup', effect: 'key', perLevel: 1, prices: [130], requires: ['syrupPower', 3] },
      fizzPower: { branch: 'fizz', effect: 'towerDamage', perLevel: 0.08, prices: [14, 18, 24, 32, 42], requires: ['towerFizz', 1] },
      fizzRate: { branch: 'fizz', effect: 'cooldown', perLevel: -0.04, prices: [16, 21, 29, 40, 53], requires: ['fizzPower', 2] },
      fizzRange: { branch: 'fizz', effect: 'range', perLevel: 0.03, prices: [13, 19, 27, 37], requires: ['fizzPower', 2] },
      fizzCheap: { branch: 'fizz', effect: 'price', perLevel: -0.03, prices: [16, 21, 29, 40], requires: ['fizzRate', 2] },
      fizzKey: { branch: 'fizz', effect: 'key', perLevel: 1, prices: [160], requires: ['fizzPower', 3] },
      syringePower: { branch: 'syringe', effect: 'towerDamage', perLevel: 0.08, prices: [30, 40, 52, 66, 82], requires: ['towerSyringe', 1] },
      syringeRate: { branch: 'syringe', effect: 'cooldown', perLevel: -0.04, prices: [36, 48, 66, 90, 120], requires: ['syringePower', 2] },
      syringeRange: { branch: 'syringe', effect: 'beamWidth', perLevel: 2, prices: [30, 42, 60, 84], requires: ['syringePower', 2] },
      syringeCheap: { branch: 'syringe', effect: 'price', perLevel: -0.03, prices: [36, 48, 66, 90], requires: ['syringeRate', 2] },
      syringeKey: { branch: 'syringe', effect: 'key', perLevel: 1, prices: [360], requires: ['syringePower', 3] },
      ampulePower: { branch: 'ampule', effect: 'towerDamage', perLevel: 0.08, prices: [40, 52, 66, 82, 100], requires: ['towerAmpule', 1] },
      ampuleRate: { branch: 'ampule', effect: 'cooldown', perLevel: -0.04, prices: [48, 64, 88, 120, 160], requires: ['ampulePower', 2] },
      ampuleRange: { branch: 'ampule', effect: 'range', perLevel: 0.03, prices: [40, 56, 80, 112], requires: ['ampulePower', 2] },
      ampuleCheap: { branch: 'ampule', effect: 'price', perLevel: -0.03, prices: [48, 64, 88, 120], requires: ['ampuleRate', 2] },
      ampuleKey: { branch: 'ampule', effect: 'key', perLevel: 1, prices: [420], requires: ['ampulePower', 3] },
      antibioticPower: { branch: 'antibiotic', effect: 'towerDamage', perLevel: 0.08, prices: [50, 64, 80, 98, 120], requires: ['towerAntibiotic', 1] },
      antibioticRate: { branch: 'antibiotic', effect: 'cooldown', perLevel: -0.04, prices: [60, 80, 110, 150, 200], requires: ['antibioticPower', 2] },
      antibioticRange: { branch: 'antibiotic', effect: 'range', perLevel: 0.03, prices: [50, 70, 100, 140], requires: ['antibioticPower', 2] },
      antibioticCheap: { branch: 'antibiotic', effect: 'price', perLevel: -0.03, prices: [60, 80, 110, 150], requires: ['antibioticRate', 2] },
      antibioticKey: { branch: 'antibiotic', effect: 'key', perLevel: 1, prices: [520], requires: ['antibioticPower', 3] },
      lampPower: { branch: 'lamp', effect: 'towerDamage', perLevel: 0.08, prices: [40, 52, 66, 82, 100], requires: ['towerLamp', 1] },
      lampRate: { branch: 'lamp', effect: 'cooldown', perLevel: -0.04, prices: [48, 64, 88, 120, 160], requires: ['lampPower', 2] },
      lampRange: { branch: 'lamp', effect: 'range', perLevel: 0.03, prices: [40, 56, 80, 112], requires: ['lampPower', 2] },
      lampCheap: { branch: 'lamp', effect: 'price', perLevel: -0.03, prices: [48, 64, 88, 120], requires: ['lampRate', 2] },
      lampKey: { branch: 'lamp', effect: 'key', perLevel: 1, prices: [400], requires: ['lampPower', 3] },
      vitaminPower: { branch: 'vitamin', effect: 'auraBoost', perLevel: -0.02, prices: [70, 90, 115, 145, 180], requires: ['towerVitamin', 1] },
      vitaminRange: { branch: 'vitamin', effect: 'range', perLevel: 0.03, prices: [70, 98, 140, 196], requires: ['vitaminPower', 2] },
      vitaminCheap: { branch: 'vitamin', effect: 'price', perLevel: -0.03, prices: [84, 112, 154, 210], requires: ['vitaminRange', 2] },
      vitaminKey: { branch: 'vitamin', effect: 'key', perLevel: 1, prices: [500], requires: ['vitaminPower', 3] },
      frostPower: { branch: 'frost', effect: 'freezeTime', perLevel: 0.06, prices: [80, 100, 125, 155, 190], requires: ['towerFrost', 1] },
      frostRate: { branch: 'frost', effect: 'cooldown', perLevel: -0.04, prices: [96, 128, 176, 240, 320], requires: ['frostPower', 2] },
      frostRange: { branch: 'frost', effect: 'range', perLevel: 0.03, prices: [80, 112, 160, 224], requires: ['frostPower', 2] },
      frostCheap: { branch: 'frost', effect: 'price', perLevel: -0.03, prices: [96, 128, 176, 240], requires: ['frostRate', 2] },
      frostKey: { branch: 'frost', effect: 'key', perLevel: 1, prices: [500], requires: ['frostPower', 3] },
      patchPower: { branch: 'patch', effect: 'towerDamage', perLevel: 0.08, prices: [70, 98, 126, 168, 224], requires: ['towerPatch', 1] },
      patchRate: { branch: 'patch', effect: 'cooldown', perLevel: -0.04, prices: [84, 112, 154, 210, 280], requires: ['patchPower', 2] },
      patchRange: { branch: 'patch', effect: 'range', perLevel: 0.03, prices: [70, 98, 140, 196], requires: ['patchPower', 2] },
      patchCheap: { branch: 'patch', effect: 'price', perLevel: -0.03, prices: [84, 112, 154, 210], requires: ['patchRate', 2] },
      patchKey: { branch: 'patch', effect: 'key', perLevel: 1, prices: [420], requires: ['patchPower', 3] },
    } as Record<string, UpgradeSpec>,
    /** Положение узлов на экране «Улучшения»: [колонка, ряд] в клетках дерева; линия идёт от узла к тому, что указан в `requires`. Только вид, на баланс не влияет. */
    treePos: {
      damage: [0, 1.0],
      coins: [1, 0.5],
      reward: [1, 1.6],
      lives: [2, 0.0],
      shield: [3, 0.0],
      recycle: [2, 1.0],
      reinforce: [2, 2.1],
      pillPower: [1, 3.3],
      pillRate: [2, 3.3],
      pillCheap: [3, 3.3],
      pillKey: [1, 4.4],
      pillRange: [2, 4.4],
      towerSyrup: [0, 5.6],
      syrupPower: [1, 5.6],
      syrupRate: [2, 5.6],
      syrupCheap: [3, 5.6],
      syrupKey: [1, 6.7],
      syrupRange: [2, 6.7],
      towerFizz: [0, 7.9],
      fizzPower: [1, 7.9],
      fizzRate: [2, 7.9],
      fizzCheap: [3, 7.9],
      fizzKey: [1, 9.0],
      fizzRange: [2, 9.0],
      fever: [1, 10.2],
      autoWave: [1, 11.3],
      towerSyringe: [0, 12.5],
      syringePower: [1, 12.5],
      syringeRate: [2, 12.5],
      syringeCheap: [3, 12.5],
      syringeKey: [1, 13.6],
      syringeRange: [2, 13.6],
      towerAmpule: [0, 14.8],
      ampulePower: [1, 14.8],
      ampuleRate: [2, 14.8],
      ampuleCheap: [3, 14.8],
      ampuleKey: [1, 15.9],
      ampuleRange: [2, 15.9],
      towerAntibiotic: [0, 17.1],
      antibioticPower: [1, 17.1],
      antibioticRate: [2, 17.1],
      antibioticCheap: [3, 17.1],
      antibioticKey: [1, 18.2],
      antibioticRange: [2, 18.2],
      towerVitamin: [0, 19.4],
      vitaminPower: [1, 19.4],
      vitaminCheap: [3, 20.5],
      vitaminKey: [1, 20.5],
      vitaminRange: [2, 20.5],
      towerFrost: [0, 21.7],
      frostPower: [1, 21.7],
      frostRate: [2, 21.7],
      frostCheap: [3, 21.7],
      frostKey: [1, 22.8],
      frostRange: [2, 22.8],
      towerPatch: [0, 24.0],
      patchPower: [1, 24.0],
      patchRate: [2, 24.0],
      patchCheap: [3, 24.0],
      patchKey: [1, 25.1],
      patchRange: [2, 25.1],
      towerLamp: [0, 26.3],
      lampPower: [1, 26.3],
      lampRate: [2, 26.3],
      lampCheap: [3, 26.3],
      lampKey: [1, 27.4],
      lampRange: [2, 27.4],
    } as Record<string, [number, number]>,
    /** Нижняя граница множителя скорости бактерии в луже Сиропа после всех улучшений и мутаций (было 0,1; документ дизайна, п. 4.2). */
    minSlowFactor: 0.25,
    /** Нижняя граница множителя паузы у ауры Витамина после уровня, мутаций и улучшений: не больше +67 % скорострельности (было 0,3; документ дизайна, п. 4.2). */
    minAuraMul: 0.6,
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
