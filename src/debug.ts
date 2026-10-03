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
 *   http://localhost:5173/?qa&noplaque   — не показывать плашки с описанием бактерий и башен (игра не встаёт на паузу сама; для проверок, которым плашки мешают)
 *   http://localhost:5173/?level=5       — номер уровня (какие башни открыты); работает и в игровой сборке, пока нет меню уровней (этап 5)
 *   http://localhost:5173/?lang=en       — принудительно выбирает язык (проверка переводов)
 */
/** Разрешён ли режим проверки в этой сборке (в игровой сборке — всегда false). */
export const QA_ENABLED: boolean = import.meta.env.DEV || import.meta.env.MODE === 'qa';

const params = new URLSearchParams(window.location.search);

export const QA_MODE: boolean = QA_ENABLED && params.has('qa');

/** Не показывать плашки с описанием (только вместе с ?qa): нужно проверкам, которые проверяют не плашки, а бой и интерфейс. */
export const NO_PLAQUES: boolean = QA_MODE && params.has('noplaque');

/** Множитель игрового времени (1 = обычная скорость). Работает только вместе с ?qa. */
export const TIME_SCALE: number = QA_MODE ? Math.min(10, Math.max(0.1, Number(params.get('speed')) || 1)) : 1;

export interface DebugSnapshot {
  /** 'info' — на экране плашка с описанием новой бактерии или башни (игра на паузе до тапа). */
  state: 'playing' | 'paused' | 'info' | 'won' | 'lost';
  coins: number;
  lives: number;
  maxLives: number;
  /** Сколько волн уже началось и сколько их всего; сколько бактерий вышло за уровень и сколько уничтожено. */
  wave: number;
  waveTotal: number;
  spawned: number;
  kills: number;
  /** Сколько бактерий дошло до организма. */
  leaked: number;
  /** Какие типы бактерий уже появлялись (в порядке появления); сколько делящихся распалось; сколько раз спора заглушила башню;
   *  сколько бактерий «Сироп» (лужа) замедлил. */
  introduced: string[];
  splits: number;
  disables: number;
  slows: number;
  /** Сколько выстрелов сделано башнями. */
  shots: number;
  /** Скорость игры, выбранная игроком кнопкой (1, 2, 3). */
  speed: number;
  elapsed: number;
  lang: string;
  renderer: 'webgl' | 'canvas';
  /** Размер экрана игры и ширина окна карты (без правой панели), пикселей. */
  width: number;
  height: number;
  viewW: number;
  /** Карта: размер в клетках, сторона клетки, ширина зоны организма, размер мира в пикселях. */
  map: { cols: number; rows: number; tile: number; orgW: number; worldW: number; worldH: number };
  /** Камера: приближение, центр (в пикселях мира) и допустимые пределы приближения. */
  camera: { zoom: number; cx: number; cy: number; zoomMin: number; zoomMax: number };
  /** Номер текущего уровня (адрес `?level=N`, по умолчанию 1). */
  level: number;
  /** Плашка с описанием: видна ли, что на ней (bacterium/tower и тип) и сколько плашек ещё ждёт в очереди после текущей. */
  info: { visible: boolean; kind: 'bacterium' | 'tower' | null; id: string | null; queue: number };
  /** Кнопка «Заново» на экране конца уровня (центр и размер на экране игры) или null, пока уровень идёт. */
  endButton: { x: number; y: number; w: number; h: number } | null;
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
    stats: { damage: number; cooldownMs: number; range: number; beamPulses: number; blastRadius: number; puddleRadius: number; slowFactor: number };
  }[];
  /** Выбранная на карте башня (клетка), идёт ли режим выбора пары для слияния, сколько слияний, продаж и выборов мутаций было за партию. */
  selectedTower: { col: number; row: number } | null;
  mergeMode: boolean;
  /** Самый высокий уровень башни. */
  maxTowerLevel: number;
  merges: number;
  sells: number;
  mutationsPicked: number;
  /** Лужи сиропа на дорожках: центр, радиус и сколько секунд ещё живёт. */
  puddles: { x: number; y: number; r: number; left: number }[];
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
    remaining: number;
  }[];
  /** Снаряды, капли сиропа и очереди луча в полёте. */
  projectiles: number;
  /** Где на экране игры кнопки панели (центры) и сколько жизней нарисовано: towerButton — первая башня (Таблетка), towerButtons — все. */
  ui: {
    towerButton: { x: number; y: number; w: number; h: number };
    towerButtons: { id: string; x: number; y: number; w: number; h: number; locked: boolean }[];
    /** Компактные кнопки открытых башен над карточкой (видны, только пока открыта карточка). */
    towerStrip: { visible: boolean; buttons: { id: string; x: number; y: number; w: number; h: number }[] };
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
    };
    lives: number;
  };
  /** Сколько обработчиков нажатия навешено на сцену (при перезапуске не должно расти — иначе утечка). */
  pointerListeners: number;
  /** Сколько раз сработали вспышка, частицы, «+монеты», кольцо постановки, красная вспышка потери жизни, кольцо глушения башни, взрыв шипучки, удар луча шприца и всплеск лужи. */
  effects: { flashes: number; bursts: number; popups: number; placements: number; lifeLosses: number; zaps: number; blasts: number; beams: number; splats: number };
  /** Звук: состояние аудио («running» — играет) и сколько звуков сыграно с загрузки страницы. */
  sound: { state: string; played: number };
}

/** Сеть дорожек для проверок: рёбра-кривые (точки в пикселях мира), входы (номера рёбер) и выходы (узлы). */
export interface DebugGraph {
  edges: { id: number; from: string; to: string; length: number; pts: [number, number][] }[];
  entrances: number[];
  exits: string[];
  /** Закрытые для башен клетки (не на дорожке, но слишком далеко от неё): [колонка, ряд]. */
  blockedCells: [number, number][];
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
  /** Показать плашку с описанием бактерии (kind 'bacterium', id — тип) или башни (kind 'tower', id — башня) сейчас, в любой момент игры (для снимков и проверок вида). */
  showPlaque: (kind: 'bacterium' | 'tower', id: string) => void;
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
    if (last && holder && typeof holder[last] === 'number' && valueText !== undefined && valueText !== '' && Number.isFinite(value)) {
      holder[last] = value;
    } else {
      console.warn(`cfg: не понял «${item}» — пропускаю`);
    }
  }
}
