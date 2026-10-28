/**
 * Режим проверки (для qa-tester и бота баланса). Он есть ТОЛЬКО в режиме разработки (`npm run dev`)
 * и в специальной тестовой сборке (`npm run build:qa`). В игровую сборку (`npm run build`, она
 * уходит на Яндекс Игры) этот код не попадает вообще — игрок включить его не сможет.
 *
 * Включается параметром ?qa в адресе:
 *   http://localhost:5173/?qa            — открывает доступ к состоянию игры для тестов
 *   http://localhost:5173/?qa&speed=4    — то же, но игровое время идёт в 4 раза быстрее
 *   http://localhost:5173/?qa&cfg=bacteria.baseSpeed:60,towers.pill.cooldownMs:300,economy.startCoins:500
 *                                        — временно подменяет числа из config.ts (для подбора баланса)
 *   http://localhost:5173/?qa&canvas     — рисовать через canvas вместо WebGL (быстрее на слабой машине без видеокарты; для бота баланса)
 *   http://localhost:5173/?qa&menu       — открыть игру на главном меню (в режиме проверки без этого параметра игра открывается сразу на партии; в игровой сборке меню открывается, если в адресе нет ?level=N)
 *   http://localhost:5173/?qa&levelwaves — в режиме проверки волны, награды и карта берутся из таблицы уровня (`levels.specs`; уровень 1 — новый формат: 50 волн, боссы, карта «Горло»);
 *                                        без параметра все уровни идут прежним тестовым уровнем (карта «корни», волны `waves.list`, 30 волн): на нём построены проверки механик
 *   http://localhost:5173/?qa&stress&fps — стресс-сценарий для замера скорости (40 башен, ≈200 бактерий, ×3) со счётчиком кадров
 *   http://localhost:5173/?qa&stress=fizz&fps — второй стресс-сценарий: 12 Шипучек 4-го уровня («Цепная» + «Кислота»), ≈200 бактерий, ×3 (взрывы)
 *   http://localhost:5173/?qa&entrance=<номер ребра> — все бактерии волн выходят по одному входу (номер ребра берётся из `getGraph().entrances`): без этого вход случайный, и проверка «башня у входа» зависит от жребия
 *   http://localhost:5173/?fps          — счётчик кадров в углу; работает и в игровой сборке (только показывает число)
 *   http://localhost:5173/?level=5       — номер уровня; работает и в игровой сборке (уровень должен быть открыт у игрока)
 *   http://localhost:5173/?qa&towers=all — открыты все башни (без узлов древа)
 *   http://localhost:5173/?qa&wave=30    — партия начинается с волны 30 (проверки боссов)
 *   http://localhost:5173/?qa&meta=lives:1,coins:2,damage:3,reward:0,dna:50 — подменяет уровни улучшений вне партии и очки ДНК (в сохранение ничего не пишется)
 *   http://localhost:5173/?lang=en       — принудительно выбирает язык (проверка переводов)
 *   http://localhost:5173/?qa&best=30,19 — лучшие волны уровней 1, 2, … (в сохранение ничего не пишется)
 *   http://localhost:5173/?qa&pilleyes=0 — Таблетки без глаз (снимки пилота этапа 8, qa/art-shots.mjs); по умолчанию глаза есть (theme.PILL_EYES)
 *   http://localhost:5173/?qa&artsheet   — лист образцов: новые и прежние рисунки рядом; &artsheet=b1|b2 — все бактерии, =t1|t2 — все башни, =l — уровни I–VIII (Таблетка, Сироп, Шприц), заклёпки и знаки рангов; &stress=high — плотная сцена с рисунками I–VIII (только режим проверки; в игровую сборку не попадает)
 */
import type { PerfReport } from './perf';

/** Разрешён ли режим проверки в этой сборке (в игровой сборке — всегда false). */
export const QA_ENABLED: boolean = import.meta.env.DEV || import.meta.env.MODE === 'qa';

const params = new URLSearchParams(window.location.search);

export const QA_MODE: boolean = QA_ENABLED && params.has('qa');

/** Только режим проверки: `?qa&pilleyes=0` — Таблетки без глаз (для снимков пилота); в игровой сборке всегда false. */
export const PILL_EYES_OFF: boolean = QA_MODE && params.get('pilleyes') === '0';
/** `?qa&fontplan` — крупные надписи по плану MASTER-0025 (решение владельца 28 октября 2026, сообщение 2, п. 4: основной текст не меньше 22 px игры, второстепенный — не меньше 20; сначала снимки). */
export const FONT_PLAN: boolean = QA_MODE && params.has('fontplan');

/**
 * Только режим проверки (разбор удорожания отрисовки ветки стиля, замер `perf`): `?qa&noface` — бактерии без картинки лица, `?qa&nobreath` — без «дыхания» (пульсации масштаба).
 * В игровой сборке всегда false.
 */
export const NO_FACE: boolean = QA_MODE && params.has('noface');
export const NO_BREATH: boolean = QA_MODE && params.has('nobreath');

/** Только режим проверки: `?qa&artsheet` — вместо игры показывается лист образцов пилота этапа 8. */
export const ART_SHEET: boolean = QA_MODE && params.has('artsheet');
/** Страница листа образцов: пусто — пилот (новое рядом с прежним), `b1`, `b2` — все 19 бактерий, `t1`, `t2` — все 10 башен по уровням, `f1` — 19 видов «было / стало» без лиц, `f2` — 10 боссов «было / стало». */
export const ART_SHEET_PAGE: string = params.get('artsheet') ?? '';
/** Только режим проверки: `?qa&treemock` — вместо игры макет радиального древа (п. 5 сообщения владельца 5 от 25 октября 2026), `&zoom=1.8` — начальный масштаб. */
export const TREE_MOCK: boolean = QA_MODE && params.has('treemock');

/** Не показывать плашки с описанием (только вместе с ?qa): нужно проверкам, которые проверяют не плашки, а бой и интерфейс. */

/** Волны, рост прочности, награды и карта берутся из таблицы уровней (`levels.specs`). В игровой сборке — всегда; в режиме проверки — только с `&levelwaves` (без него — прежний тестовый уровень). */
export const LEVEL_WAVES: boolean = !QA_MODE || params.has('levelwaves');

/** `?qa&ready=N` — сколько первых уровней готовы к игре (`levels.ready`) в тестовой сборке и разработке; без параметра в режиме проверки готовы все уровни, чтобы прежние проверки открывали любой уровень. В игровой сборке всегда `null` (действует `levels.ready` из config.ts). */
export const READY_OVERRIDE: number | null = QA_ENABLED ? (Number.isFinite(Number(params.get('ready'))) && params.has('ready') ? Math.floor(Number(params.get('ready'))) : 99) : null;

/** Стресс-сценарий для замера скорости (только вместе с ?qa): 40 башен разных уровней, ≈200 бактерий всех типов, скорость ×3, без волн и без поражения. */
export const STRESS: boolean = QA_MODE && params.has('stress');

/** Второй стресс-сценарий (`?qa&stress=fizz`): 12 Шипучек 4-го уровня с мутациями «Цепная» и «Кислота» и ≈200 бактерий — нагрузка на взрывы (круг и кольцо на каждый взрыв). Включает и `STRESS`. */
export const STRESS_FIZZ: boolean = STRESS && params.get('stress') === 'fizz';
/** Третий стресс-сценарий (`?qa&stress=high`): Таблетки, Сиропы и Шприцы с рисунками уровней I–VIII — лист V–VIII в плотной сцене (решение владельца 28 октября 2026, сообщение 1, п. 6.1); числа башен — до IV. */
export const STRESS_HIGH: boolean = STRESS && params.get('stress') === 'high';
/** Вход (номер ребра), по которому выходят ВСЕ бактерии волн (только вместе с ?qa&entrance=N); null — вход случайный, как в игре. */
export const QA_ENTRANCE: number | null = QA_MODE && params.has('entrance') && Number.isFinite(Number(params.get('entrance'))) ? Number(params.get('entrance')) : null;

/** `?qa&towers=all` — открыты все башни (без узлов древа): сценариям проверки, которые проверяют сами башни. Без параметра башни открываются, как в игре, узлами древа (`&meta=towerFizz:1,…`). */
export const ALL_TOWERS: boolean = QA_MODE && params.get('towers') === 'all';

/** `?qa&wave=N` — партия начинается с волны N (предыдущие считаются пройденными, монеты — как на старте): проверкам боссов и поздних волн. Без параметра — с первой волны. */
export const QA_START_WAVE: number = QA_MODE && Number.isFinite(Number(params.get('wave'))) && Number(params.get('wave')) > 1 ? Math.floor(Number(params.get('wave'))) : 1;

/** `?qa&norender` — сцена партии не рисуется, цикл кадров идёт по таймеру: боты идут в 3–5 раз быстрее (ответ владельца 12, сверка с рисованием 19 октября 2026 — docs/process-speedup-2026-10-18.md, раздел 4.3). */
export const QA_NORENDER: boolean = QA_MODE && params.has('norender');

/** Множитель игрового времени (1 = обычная скорость). Работает только вместе с ?qa. */
export const TIME_SCALE: number = QA_MODE ? Math.min(10, Math.max(0.1, Number(params.get('speed')) || 1)) : 1;

/**
 * Событие журнала игры (только режим проверки). `t` — игровое время (`elapsed`) в момент события, остальные поля зависят от типа:
 *  spawn   — бактерия вышла: id, kind, edge (ребро входа), boss (id босса или null);
 *  kill    — бактерия убита: id, kind, gain (монет за неё), coins (монет после);
 *  blast   — взрыв Шипучки: x, y, radius, hits (сколько задето), kills (сколько убито), chain (второй взрыв «Цепной»);
 *  beam    — удар очереди луча Шприца: col, row (башня), index (номер удара с нуля), hits (сколько на линии), kills;
 *  latch   — паразит присосался: id, col, row (башня), dist (расстояние до неё в этот момент);
 *  chip    — подсказка «◀ Организм» сменила состояние: visible, danger, nearest (до организма от ближайшей бактерии, px; null — бактерий нет);
 *  leak    — бактерия дошла до организма: id, kind, wave (номер волны), damage (сколько жизней она отнимает), absorbed (true — погашена «Щитом у линии», жизни не отняты), boss (id босса или нет);
 *  boss    — босс побеждён: id, boss (id босса), bits (побеждённые боссы партии, биты);
 *  fever   — включена «Лихорадка»: uses (сколько раз за партию);
 *  menuExit — «В меню» с паузы: cleared (пройдено волн), dna (начислено очков ДНК), attempt (true — засчитана попытка; без пройденных волн — false).
 * Журнал пишет сама игра в тот кадр, когда событие случилось, поэтому проверкам не нужно «ловить» его опросом состояния, а реальное время (и скорость сервера) на него не влияет.
 */
export interface QaEvent {
  type: 'spawn' | 'kill' | 'blast' | 'beam' | 'latch' | 'chip' | 'leak' | 'boss' | 'fever' | 'menuExit';
  t: number;
  [key: string]: unknown;
}

/** Сколько событий журнал хранит (дальше новые не пишутся: в обычной проверке их тысячи, а не сотни тысяч). */
export const QA_EVENTS_MAX = 100000;

export interface DebugSnapshot {
  state: 'playing' | 'paused' | 'won' | 'lost';
  coins: number;
  lives: number;
  maxLives: number;
  /** Сколько волн уже началось и сколько их всего; сколько бактерий вышло за уровень и сколько уничтожено. */
  wave: number;
  waveTotal: number;
  /** Сколько бактерий выйдет за весь уровень по составу волн (сумма по всем строкам таблицы волн уровня). */
  plannedTotal: number;
  /** Суммарная прочность (HP из таблицы типов, без роста по волнам) всех бактерий уровня. */
  plannedHp: number;
  /** Фаза волны (`countdown`, `spawning`, `waiting`…), сколько бактерий текущей волны уже вышло и сколько выйдет всего: бот по ним отличает «поле пусто, потому что волна кончилась» от «ещё не вышли». */
  wavePhase: string;
  waveSpawned: number;
  waveCount: number;
  /** Первая волна каждого типа по составу волн уровня (с единицы): расписание выхода типов. */
  firstWaves: Record<string, number>;
  spawned: number;
  kills: number;
  /** Сколько бактерий дошло до организма. */
  leaked: number;
  /** «Щит у линии»: сколько бактерий щит ещё погасит и сколько жизней они отняли бы (для звёзд считаются потерянными). */
  shieldLeft: number;
  shieldAbsorbed: number;
  /** Цена постройки каждой башни с учётом улучшений и доля возврата при продаже (0,7 + «Утилизация»). */
  towerPrices: Record<string, number>;
  sellRefundShare: number;
  /** Какие типы бактерий уже появлялись (в порядке появления); сколько делящихся распалось; сколько раз спора заглушила башню;
   *  сколько бактерий «Сироп» (лужа) замедлил. */
  introduced: string[];
  splits: number;
  disables: number;
  slows: number;
  /** Сколько раз Антибиотик отравил бактерию, сколько ударов поглотил поглотитель, сколько прыжков сделали прыгуны (за партию). */
  poisons: number;
  absorbs: number;
  leaps: number;
  /** Сколько облаков оставили токсины за партию. */
  cloudsMade: number;
  /** Сколько раз Холод замораживал, сколько ловушек положил Пластырь и сколько раз паразит присосался к башне (за партию). */
  freezes: number;
  trapsMade: number;
  latches: number;
  /** Сколько выстрелов сделано башнями. */
  shots: number;
  /** Скорость игры, выбранная игроком кнопкой (1, 2, 3). */
  speed: number;
  elapsed: number;
  /** Часы игры: сколько кадров посчитано (пока идёт партия) и сумма «базовых» шагов времени (шаг кадра, не больше MAX_FRAME_MS, × ?speed=, БЕЗ кнопки скорости).
   *  За любой отрезок при одной и той же кнопке скорости `Δelapsed = speed × ΔbaseSec`, а `ΔbaseSec / Δframes` не больше MAX_FRAME_MS / 1000 × ?speed=: проверки скорости опираются на это, а не на секунды реального времени. */
  clock: { frames: number; baseSec: number };
  /** Подсказка «◀ Организм»: видна ли, тревога ли (красная), прозрачность сейчас (в тревоге мигает 0,3…1) и цвет заливки (число 0xRRGGBB). */
  chip: { visible: boolean; danger: boolean; alpha: number; fill: number };
  /** Сколько событий в журнале игры (`getEvents`). */
  events: number;
  lang: string;
  renderer: 'webgl' | 'canvas';
  /** Размер экрана игры, ширина окна карты и само окно (между верхней и нижней полосами), пикселей. */
  width: number;
  height: number;
  viewW: number;
  view: { x: number; y: number; w: number; h: number };
  /** Карта: размер в клетках, сторона клетки, ширина зоны организма, размер мира в пикселях. */
  map: { cols: number; rows: number; tile: number; orgW: number; worldW: number; worldH: number };
  /** Камера: приближение, центр (в пикселях мира) и допустимые пределы приближения. */
  camera: { zoom: number; cx: number; cy: number; zoomMin: number; zoomMax: number };
  /** Номер текущего уровня (адрес `?level=N`, по умолчанию 1). */
  level: number;
  /** Плашка с описанием: видна ли, что на ней (bacterium/tower и тип) и сколько плашек ещё ждёт в очереди после текущей. */
  /** Кнопка «Заново» на экране конца уровня (центр и размер на экране игры) или null, пока уровень идёт. */
  endButton: { x: number; y: number; w: number; h: number } | null;
  /** Кнопка «Улучшения» на экране конца уровня (или null) и сколько очков ДНК начислено за партию (0, пока партия идёт). */
  upgradesButton: { x: number; y: number; w: number; h: number } | null;
  /** «Следующий уровень» (только после победы, не на последнем уровне) и «В меню» на экране конца уровня; «В меню» на паузе (или null). */
  nextButton: { x: number; y: number; w: number; h: number } | null;
  menuButton: { x: number; y: number; w: number; h: number } | null;
  /** «Скопировать итог» на экране конца уровня (или null). */
  copyButton: { x: number; y: number; w: number; h: number } | null;
  pauseResumeButton: { x: number; y: number; w: number; h: number } | null;
  pauseMenuButton: { x: number; y: number; w: number; h: number } | null;
  pauseAlmanacButton: { x: number; y: number; w: number; h: number } | null;
  pauseSoundButton: { x: number; y: number; w: number; h: number } | null;
  pauseRestartButton: { x: number; y: number; w: number; h: number } | null;
  /** Фактические числа роста прочности текущего уровня, с которыми идёт партия (после подмены `?qa&cfg=`): бот пишет их в журнал и сверяет с `--cfg`, чтобы подмена не прошла незамеченной (не на тот уровень, не тем числом). */
  levelGrowth: { level: number; perWave: number; fromWave: number; latePerWave: number; lateFromWave: number; hpFactor: number; hpScale: number };
  /** Тряска при потере жизни: трясётся только карта (контейнер мира), главная камера сцены (а с ней панели и надписи) не трясётся и не сдвинута. */
  shake: { active: boolean; offset: { x: number; y: number }; mapX: number; mapY: number; cameraShaking: boolean; cameraScroll: { x: number; y: number } };
  dnaGained: number;
  /** Звёзды, заработанные в этой партии (0 — партия не выиграна или ещё идёт), и очки ДНК за впервые полученные звёзды (в `dnaGained` не входят). */
  stars: number;
  starDna: number;
  /** Разбивка очков ДНК за партию на экране конца уровня (волны, победа, новые звёзды) и строка, которую видит игрок. */
  dnaParts: { waves: number; win: number; coins: number; bosses: number; flawless: number; floor: number; stars: number };
  /** Уровень нового формата: сколько волн, монет на старте и пауза между волнами (null — прежний формат); id карты; побеждённые за партию боссы (биты); «Лихорадка»; строка «не хватает N ДНК»; фаза волн и её таймер. */
  plan: { waves: number; startCoins: number; pauseSec: number } | null;
  mapId: string;
  bossBits: number;
  fever: { owned: boolean; left: number; wait: number; uses: number };
  needLine: string;
  phase: string;
  phaseTimer: number;
  /** Строки очков ДНК на экране конца уровня (итог; из чего сложился; монеты — только после победы; пометка пройденного уровня) и остаток монет, из которого посчитана добавка. */
  endDnaLines: string[];
  /** Строка итога попытки (src/attempt.ts): пусто, пока партия идёт. */
  attemptLine: string;
  /** Уведомление сверху окна карты: что показано сейчас (null — ничего), новость это или ответ на нажатие, и какие новости ждут в очереди (по порядку показа). */
  toast: { text: string | null; news: boolean; queued: string[] };
  coinsLeft: number;
  /** Нижний край и наибольшая ширина текстов на затемнении (конец уровня), пикселей экрана игры. */
  overlayBox: { bottom: number; maxWidth: number };
  /** Выбрана ли башня на панели (её название) и цена. */
  selected: string | null;
  /** Поставленные башни: клетка и центр в пикселях мира; заглушена ли (спорой); расстояние до организма по дорожкам (для «вперёд/назад»);
   *  aim — номер направления луча 0…7 (0 — вправо, дальше по часовой стрелке; у башен без луча всегда 0);
   *  level — уровень (слияние), picks — выбранные мутации (id), pending — какой порог мутации ждёт выбора (0/1) или null,
   *  stats — итоговые числа (урон, пауза мс, радиус, ударов в очереди) с учётом уровня и мутаций. */
  towers: {
    id: string;
    col: number;
    row: number;
    x: number;
    y: number;
    disabled: boolean;
    remaining: number;
    aim: number;
    level: number;
    picks: string[];
    pending: number | null;
    /** Стоит ли башня в облаке токсина (не стреляет) и множитель паузы от ауры Витамина рядом (1 — нет). */
    suppressed: boolean;
    auraMul: number;
    /** Множитель паузы от присосавшегося паразита (1 — нет). */
    latchMul: number;
    stats: { damage: number; cooldownMs: number; range: number; beamPulses: number; blastRadius: number; blastFullTargets: number; blastRestMul: number; puddleRadius: number; puddleSec: number; slowFactor: number; beamHalfWidthPx: number; dotPerSec: number; dotSec: number; coneDeg: number; auraMul: number; freezeSec: number; trapSec: number; trapDps: number; spiral: number };
  }[];
  /** Выбранная на карте башня (клетка), идёт ли режим выбора пары для слияния, сколько слияний, продаж и выборов мутаций было за партию. */
  selectedTower: { col: number; row: number } | null;
  mergeMode: boolean;
  /** Клетки башен пары, на которую показана разовая подсказка о слиянии (пусто — подсказки нет). */
  mergeHint: { col: number; row: number }[];
  /** Самый высокий уровень башни. */
  maxTowerLevel: number;
  /** Радиус слияния башен, пикселей между центрами (`mergeRadiusPx`). */
  mergeRadiusPx: number;
  merges: number;
  sells: number;
  mutationsPicked: number;
  /** Лужи сиропа на дорожках: центр, радиус и сколько секунд ещё живёт. */
  puddles: { x: number; y: number; r: number; left: number }[];
  /** Облака токсина: центр, радиус и сколько секунд ещё живут. */
  clouds: { x: number; y: number; r: number; left: number }[];
  /** Ловушки Пластыря: где приклеена бактерия и сколько секунд ещё держит. */
  traps: { x: number; y: number; left: number }[];
  /** Накопленный, но ещё не списанный урон по жизням от «дробных» бактерий (рой: 0,25 за штуку); при 1 списывается целая жизнь. */
  lifePool: number;
  /** Бактерии: центр в пикселях мира, радиус, номер ребра дорожки и пройденный по нему путь, идёт ли рывок, замедлена ли («Сироп»),
   *  сколько пикселей осталось до организма по самому короткому пути. */
  bacteria: {
    id: number;
    x: number;
    y: number;
    r: number;
    kind: string;
    hp: number;
    maxHp: number;
    edge: number;
    s: number;
    dashing: boolean;
    slowed: boolean;
    /** Подсвечена ли скрытная бактерия Лампой (башни видят её на полном радиусе). */
    lit: boolean;
    remaining: number;
    /** Яд: сколько секунд ещё идёт (0 — не отравлена); поглотитель: ударов было и поглощено; прыгун: прыжков сделано. */
    poisonLeft: number;
    hits: number;
    absorbed: number;
    leaps: number;
    /** Ключ картинки тела сейчас (в нём число — толщина оболочки, от доли оставшегося HP): проверка, что оболочка худеет вместе с HP усиленных бактерий. */
    bodyKey: string;
    /** Сколько секунд ещё заморожена (0 — нет), сколько секунд ещё приклеена, мутант: вид башни, ударившей последней; паразит: клетка башни, к которой присосался. */
    freezeLeft: number;
    trapLeft: number;
    memory: string | null;
    latchedTo: { col: number; row: number } | null;
  }[];
  /** Снаряды, капли сиропа и очереди луча в полёте. */
  projectiles: number;
  /** Где на экране игры кнопки панели (центры) и сколько жизней нарисовано: towerButton — первая башня (Таблетка), towerButtons — все. */
  ui: {
    towerButton: { x: number; y: number; w: number; h: number };
    /** Карточки башен в нижней панели по порядку таблицы; visible — центр карточки в окне списка (иначе список нужно сдвинуть: `revealTower`). */
    towerButtons: { id: string; x: number; y: number; w: number; h: number; locked: boolean; visible: boolean }[];
    /** Окно списка башен и его сдвиг (pixels) и наибольший сдвиг. */
    towerList: { x: number; y: number; w: number; h: number; scroll: number; maxScroll: number };
    pauseButton: { x: number; y: number };
    /** Кнопка скорости (×1/×2/×3) и кнопка «Начать волну» (visible — видна ли сейчас, bonus — сколько монет даст досрочный вызов). */
    speedButton: { x: number; y: number };
    waveButton: { x: number; y: number; w: number; h: number; visible: boolean; bonus: number };
    /** Карточка выбранной башни: видна ли и где её кнопки (центры и размеры на экране игры). */
    card: {
      visible: boolean;
      merge: { x: number; y: number; w: number; h: number; enabled: boolean };
      sell: { x: number; y: number; w: number; h: number };
      picks: { x: number; y: number; w: number; h: number; visible: boolean }[];
      rotateLeft: { x: number; y: number; w: number; h: number; visible: boolean };
      rotateRight: { x: number; y: number; w: number; h: number; visible: boolean };
      close: { x: number; y: number; w: number; h: number };
      /** Что написано на карточке: строки чисел башни, строка выбранных мутаций и тексты вариантов мутации, ожидающей выбора («название — описание»). */
      lines: { stats: string[]; mutations: string; pending: string[] };
    };
    lives: number;
    /** Что написано в окошке жизней верхней полосы («18 / 20»). */
    livesText: string;
    /** Постоянная подсказка снизу окна карты (null — не показана). */
    hint: string | null;
  };
  /** Сколько обработчиков нажатия навешено на сцену (при перезапуске не должно расти — иначе утечка). */
  pointerListeners: number;
  /** Сколько раз сработали вспышка, частицы, «+монеты», кольцо постановки, красная вспышка потери жизни, кольцо глушения башни, взрыв шипучки, удар луча шприца и всплеск лужи. */
  effects: { flashes: number; bursts: number; popups: number; damageNumbers: number; placements: number; lifeLosses: number; lifeFlashes: number; zaps: number; blasts: number; beams: number; splats: number; frosts: number };
  /** Звук: состояние аудио («running» — играет) и сколько звуков сыграно с загрузки страницы. */
  sound: { state: string; played: number; muted: boolean };
}

/** Сеть дорожек для проверок: рёбра-кривые (точки в пикселях мира), входы (номера рёбер) и выходы (узлы). */
export interface DebugGraph {
  edges: { id: number; from: string; to: string; length: number; pts: [number, number][] }[];
  entrances: number[];
  exits: string[];
  /** Закрытые для башен клетки (не на дорожке, но слишком далеко от неё): [колонка, ряд]. */
  blockedCells: [number, number][];
  /** Клетки дорожек (строить нельзя). */
  pathCells: [number, number][];
}

/** Что игра отдаёт проверкам через window.__pvb. */
export interface DebugApi {
  getState: () => DebugSnapshot;
  getGraph: () => DebugGraph;
  /** Точка мира → координаты на странице (для мыши и касаний Playwright), с учётом камеры и масштаба экрана. */
  worldToClient: (wx: number, wy: number) => { x: number; y: number };
  /** Точка экрана игры (1280×720) → координаты на странице. */
  gameToClient: (gx: number, gy: number) => { x: number; y: number };
  /** Центр клетки → координаты на странице. */
  cellToClient: (col: number, row: number) => { x: number; y: number };
  /** Сдвинуть список башен в нижней панели так, чтобы карточка этой башни была видна (проверки и бот нажимают на карточки по координатам). */
  revealTower: (id: string) => void;
  /** Поставить башню вида `id` уровня `level` (1–4) в свободную клетку без оплаты и слияний — для снимков (qa/art-shots.mjs); false — клетка занята, закрыта или на дорожке. */
  placeTower: (id: string, col: number, row: number, level: number) => boolean;
  /** Сколько картинок нарисовано и сколько памяти они занимают (ширина × высота × 4 байта); prefix — только ключи, начинающиеся с него (qa/art-shots.mjs). */
  getArtStats: (prefix?: string) => { count: number; bytes: number; keys: Record<string, [number, number]> };
  /** Только проверки: поднять башню в клетке на уровень выше и добавить ей мутации `picks` (как при слиянии, когда мутации сливаемой башни переходят к новой). */
  upgradeTower: (col: number, row: number, picks: string[]) => boolean;
  /** Замер скорости с последнего сброса (reset — начать заново) и сколько объектов сейчас рисуется. */
  /** Журнал событий игры (с номера `from`): см. QaEvent. Сбрасывается при перезапуске уровня. */
  getEvents: (from?: number) => QaEvent[];
  getPerf: (reset?: boolean) => PerfReport & { objects: number; bacteria: number; towers: number; renderer: 'webgl' | 'canvas'; scenario?: 'stress' | 'fizz' | 'high' };
}

declare global {
  interface Window {
    __pvb?: DebugApi;
  }
}

export function exposeDebug(api: DebugApi): void {
  if (QA_MODE) window.__pvb = api;
}

/**
 * Подменяет числа в CONFIG значениями из адреса (?qa&cfg=раздел.параметр:число,...).
 * Меняются только уже существующие числовые параметры; сам файл config.ts не трогается.
 * Непонятную запись игра пропускает и пишет в консоль предупреждение, начинающееся с «cfg:»
 * (бот баланса по нему останавливается, чтобы не выдать замер исходных чисел за замер новых).
 */
export function applyConfigOverrides(config: Record<string, unknown>): void {
  const raw = params.get('cfg');
  if (!QA_MODE || !raw) return;
  for (const item of raw.split(',')) {
    const [path, valueText] = item.split(':');
    const keys = (path ?? '').split('.');
    const last = keys.pop();
    let target: unknown = config;
    for (const key of keys) target = (target as Record<string, unknown> | undefined)?.[key];
    const value = Number(valueText);
    const holder = target as Record<string, unknown> | undefined;
    // Состав волны (`waves.list.N.<тип>`): в строках таблицы только типы уровня 1, а проверкам нужны все 13 — любой тип из таблицы `types` можно добавить в строку
    const kinds = (config as { types?: Record<string, unknown> }).types ?? {};
    // то же для состава волны уровня (`levels.specs.N.plan.waves.M.mix.<тип>`): замер другого состава волн без правки config.ts
    const planMix = keys[0] === 'levels' && keys[1] === 'specs' && keys[3] === 'plan' && keys[4] === 'waves' && keys[6] === 'mix' && keys.length === 7;
    const addsKind = ((keys[0] === 'waves' && keys[1] === 'list' && keys.length === 3) || planMix) && last !== undefined && last in kinds;
    if (last && holder && (typeof holder[last] === 'number' || addsKind) && valueText !== undefined && valueText !== '' && Number.isFinite(value)) {
      holder[last] = value;
    } else {
      console.warn(`cfg: не понял «${item}» — пропускаю`);
    }
  }
}
