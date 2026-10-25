import Phaser from 'phaser';
import { CameraRig } from '../cameraRig';
import { CONFIG, type BossId, type Ward } from '../config';
import { exposeDebug, QA_ENABLED, QA_ENTRANCE, QA_MODE, QA_NORENDER, QA_START_WAVE, STRESS, STRESS_FIZZ, STRESS_HIGH, TIME_SCALE, type QaEvent } from '../debug';
import { placeTowerQa, qaLog, qaSnapshot, setupStress, stressFrame } from '../qaTools';
import { Effects } from '../effects';
import { drawStar, setScreenInfo } from '../screens';
import { attemptNumber, autoWaveOwned, awardDna, boughtSinceLast, dnaParts, coinsBonus, exposeMetaDebug, feverOwned, finishAttempt, HIDDEN_SCREEN, isLevelBeaten, isLevelOpen, livesBonus, markSeen, wasMet, metaDna, metaLevels, nextBigNode, recordResult, refundBonus, rewardMul, shieldCharges, starsForLoss, waveCoinsBonus, type DnaInput, type DnaParts } from '../meta';
import { attemptLine, copyText } from '../attempt';
import { num, t, type TextKey } from '../i18n';
import { aimAngle, BLOCKED_TILES, EDGES, ENTRANCE_EDGES, LEVEL, PATH_TILES, WORLD, cellKey, useLevelMap, worldToCell } from '../level';
import { isPortraitPhone } from '../orientation';
import { currentLevel, isTowerOpen, levelParams, setCurrentLevel, setLastBuilt, type LevelParams } from '../progress';
import { addMap } from '../mapArt';
import { MapGestures } from '../mapGestures';
import { Bacterium, type BacteriumExtra, type BacteriumKind } from '../objects/Bacterium';
import { GroundShot } from '../objects/GroundShot';
import { Projectile } from '../objects/Projectile';
import { Cloud } from '../objects/Cloud';
import { Trap } from '../objects/Trap';
import { Puddle } from '../objects/Puddle';
import { beamReach, createTowerArt, defaultAim, drawAimLine, Tower, type TowerId } from '../objects/Tower';
import { artStats } from '../art';
import { pointAt, tileCenter, unitCenter, type Edge } from '../pathing';
import { gameplay } from '../sdk';
import { sfx } from '../sound';
import { wardBlocks } from '../ward';
import { computeStats, MAX_TOWER_LEVEL, mergeCap, mutationById, mutationOptions, mutationStacks, towerPrice, type TowerStats } from '../towerStats';
import { COLORS, FONT, TEXT_COLORS, fs } from '../theme';
import { FPS_ENABLED, FpsMeter, frameReport, installFrameStats } from '../perf';
import { Panel, TOP_H, VIEW } from '../ui/Panel';

const { width: W, height: H } = CONFIG.screen;
/** Самое сильное отдаление камеры: карта помещается целиком и по ширине, и по высоте (≈ 0,499). */
const ZOOM_MIN = Math.min(VIEW.w / WORLD.w, VIEW.h / WORLD.h);
/** Цвет числа урона по способу стрельбы башни: Таблетка — белый, Шипучка — розовый, Шприц — бирюзовый, лужа (ядовитая мутация Сиропа) — оранжевый, Ампула — светло-голубой;
 *  яд Антибиотика чисел не показывает (цвет нужен для полноты таблицы); Лампа — жёлтый, Витамин не бьёт (цвет для полноты); Холод и Пластырь прямым ударом не бьют (цвета для полноты). */
const DAMAGE_COLORS: Record<TowerStats['targeting'], number> = { radius: 0xffffff, area: COLORS.fizz, beam: COLORS.needle, puddle: COLORS.puddle, snipe: 0x9fe4ff, poison: COLORS.poison, cone: COLORS.lamp, aura: 0xffffff, freeze: COLORS.frost, trap: COLORS.patch };
/** Урон одного выстрела в карточке: до 1 — с двумя знаками после запятой (тик Лампы), дальше — с одним. */
const hitNum = (x: number): string => num(x < 1 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10);
/** Цвет числа урона, когда удар ослаблен памятью мутанта (башня того же вида, что и прошлая). */
const RESIST_COLOR = 0x9aa6bd;
/** Цвет облачка у дула по башне (вид, не баланс). */
const MUZZLE_PUFF: Partial<Record<string, number>> = { pill: 0xffffff, syrup: COLORS.syrup, fizz: COLORS.acid, syringe: COLORS.needle, ampule: 0x9fdcff, antibiotic: COLORS.antibiotic };
/** Защита от «прыжков» после сворачивания вкладки: один кадр не длиннее 50 мс. */
const MAX_FRAME_MS = 50;
/** Наибольший шаг расчёта игры, секунды игрового времени: кадр на высокой скорости (×3, ×5) или на медленном устройстве делится на несколько шагов не длиннее этого, поэтому ход боя
 *  (выстрелы, полёт снарядов, рывки, выход бактерий) не зависит от скорости игры и кадров в секунду. Это свойство движка, не число баланса. */
const SIM_STEP_SEC = 1 / 30;
/** Если кадр очень длинный, за него выйдет не больше стольких бактерий (защита от лавины). */
const MAX_SPAWNS_PER_FRAME = 10;
/** Все типы бактерий в порядке появления в игре. */
const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];
/** Цепной взрыв: пауза до второго взрыва, секунд; радиус поиска бактерии для него, пикселей. */
const CHAIN_DELAY_SEC = 0.3;
const CHAIN_REACH_PX = 160;
/** Как часто показывается число урона над бактерией, которую жжёт конус Лампы (тики идут 10 раз в секунду — число накапливает урон), секунд игрового времени. */
const LIGHT_NUMBER_SEC = 0.5;
/** Откуда на экране начинается вспышка луча «Шприца» (от центра башни), пикселей: чуть дальше кончика ствола. */
const BEAM_START_PX = 50;
/** Во что распадается делящаяся (правило игры, не число баланса). */
const SPLITS_INTO: BacteriumKind = 'coccus';
/** Кого рожает матка (правило игры; сколько и как часто — в таблице типов). */
const BREWS_INTO: BacteriumKind = 'swarm';
/** Кто выходит следующим в волне: тип, вход (null — случайный) и сколько секунд ждать до следующего (в пачке — короткая пауза); босс и награда (уровень нового формата: доля дохода волны). */
interface SpawnItem {
  kind: BacteriumKind;
  edge: Edge | null;
  gapSec: number;
  boss?: BossId;
  reward?: number;
}
/** Номер бита босса в записи побед (`DnaInput.bossBits`): мини-боссы 10, 20, 30, 40-й волн — биты 0–3, босс уровня — бит 4. */
const BOSS_BIT = 4;
/** Кнопка «Лихорадки»: круг в правом верхнем углу окна карты, под верхней полосой (пикселей экрана игры). */
const FEVER_BTN = { x: W - 52, y: TOP_H + 50, r: 38 };
/** Полоса прочности босса вверху окна карты: центр, ширина и высота, пикселей экрана игры. */
const BOSS_BAR = { x: W / 2, y: TOP_H + 34, w: 520, h: 16 };
/** Очередь луча «Шприца»: сколько ударов ещё осталось и сколько секунд до следующего. */
interface BeamBurst {
  tower: Tower;
  left: number;
  timer: number;
  /** Номер удара в очереди (с нуля): «Спираль» усиливает каждый следующий. */
  index: number;
}
/** Второй взрыв «Цепной» Шипучки: через сколько секунд, где и с какими числами. */
interface ChainBlast {
  left: number;
  x: number;
  y: number;
  stats: TowerStats;
}

type State = 'playing' | 'paused' | 'won' | 'lost';
type WavePhase = 'countdown' | 'spawning' | 'pause' | 'done';

export class GameScene extends Phaser.Scene {
  private state: State = 'playing';
  private elapsed = 0;
  /** Только режим проверки: сколько кадров посчитано, сумма базовых шагов времени (без кнопки скорости) и журнал событий игры (см. QaEvent в debug.ts). */
  private qaFrames = 0;
  private qaBaseSec = 0;
  private qaEvents: QaEvent[] = [];
  private qaChip = '';
  private coins = 0;
  private lives = 0;
  private kills = 0;
  private splits = 0;
  private disables = 0;
  private leaked = 0;
  private shots = 0;
  private slows = 0;
  /** Сколько раз Антибиотик отравил бактерию, сколько ударов поглотил поглотитель и сколько прыжков сделали прыгуны (за партию). */
  private poisons = 0;
  private absorbs = 0;
  private leaps = 0;
  /** Сколько облаков оставили токсины за партию. */
  private cloudsMade = 0;
  /** Сколько раз Холод замораживал, сколько ловушек положил Пластырь и сколько раз паразит присосался к башне (за партию). */
  private freezes = 0;
  private trapsMade = 0;
  private latches = 0;
  private spawned = 0;
  /** Накопленный урон по жизням от «дробных» бактерий (рой): целые жизни списываются, остаток ждёт следующих. */
  private lifePool = 0;
  /** Сколько бактерий ещё погасит щит у линии (улучшение «Щит у линии») и сколько жизней они отняли бы: для звёзд считаются потерянными. */
  private shieldLeft = 0;
  private shieldAbsorbed = 0;
  /** Скорость игры, выбранная игроком кнопкой (1, 2, 3 …): множитель времени сверх тестового `?speed`. */
  private userSpeed = 1;
  /** Накопленная дробная часть наград (`economy.rewardMul`): целые монеты зачисляются, остаток ждёт следующих бактерий. */
  private rewardPool = 0;
  /** Каких боссов уровня игрок победил в этой партии (биты, см. `BOSS_BIT`). */
  private bossBits = 0;
  /** «Лихорадка»: сколько секунд ещё действует и сколько до готовности (отсчёт перезарядки — с начала действия); кнопка и её надпись. */
  private feverLeft = 0;
  private feverWait = 0;
  private feverGfx: Phaser.GameObjects.Graphics | null = null;
  private feverText: Phaser.GameObjects.Text | null = null;
  private feverKey = '';
  /** (читает снимок режима проверки, qaTools) */ feverUses = 0;
  /** Полоса прочности босса (вверху окна карты): графика, имя; ключ нарисованного состояния. */
  private bossBarGfx!: Phaser.GameObjects.Graphics;
  private bossBarText!: Phaser.GameObjects.Text;
  private bossBarKey = '';

  private bacteria: Bacterium[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  /** Капли сиропа в полёте к дорожке, лужи на дорожках и очереди луча «Шприца». */
  private groundShots: GroundShot[] = [];
  private puddles: Puddle[] = [];
  /** Облака токсина на поле. */
  private clouds: Cloud[] = [];
  /** Ловушки Пластыря на дорожках и нити паразитов к башням (одна картинка-линия на всех). */
  private traps: Trap[] = [];
  private threads!: Phaser.GameObjects.Graphics;
  /** Какой множитель паузы от паразита показан в карточке выбранной башни (если изменился — карточка перерисовывается). */
  private cardLatch = 1;
  /** Множитель паузы от ауры Витамина, с которым нарисована карточка (чтобы перерисовать её, когда он изменился). */
  private cardAura = 1;
  private bursts: BeamBurst[] = [];
  private chains: ChainBlast[] = [];
  /** Занятые клетки (ключ «колонка,ряд»). */
  private occupied = new Set<string>();
  /** Какая башня выбрана на панели (тап по клетке поставит её). */
  private selected: TowerId | null = null;
  /** Поставленная башня, выбранная на карте (её карточка — в правой панели), и идёт ли выбор пары для слияния. */
  private selectedTower: Tower | null = null;
  private mergeMode = false;
  /** Сколько жизней отняла каждая порода бактерий за партию (то, что реально списано; поглощённое щитом не считается): для строки на экране проигрыша. */
  private livesLostByKind: Partial<Record<BacteriumKind, number>> = {};
  /** Следующая волна — с боссом: таймер волны красный (п. 3.1 сообщения владельца 1 от 26 октября 2026). */
  private bossNext = false;
  private merges = 0;
  private sells = 0;
  private mutationsPicked = 0;
  /** Для строки итога попытки (src/attempt.ts): сколько башен построено, игровые секунды на каждой скорости, монеты на старте волн 10, 20, …, улучшения на старте партии. */
  private builds = 0;
  private speedSec: Record<number, number> = {};
  private coinsAtWave = new Map<number, number>();
  private entryLevels: [string, number][] = [];
  /** (читает снимок режима проверки, qaTools) */ attemptText = '';
  /** Кнопка «Скопировать итог» на экране конца уровня (или null). */
  /** (читает снимок режима проверки, qaTools) */ copyButton: { x: number; y: number; w: number; h: number } | null = null;

  // Волны
  private phase: WavePhase = 'countdown';
  private phaseTimer = 0;
  /** Сколько волн уже началось. */
  private waveIdx = 0;
  private waveSpawned = 0;
  private waveCount = 0;
  /** Кто выйдет в текущей волне, по порядку выхода. */
  private waveQueue: SpawnItem[] = [];
  /** Какие типы бактерий уже появлялись (в порядке появления). */
  private introduced: BacteriumKind[] = [];
  /** Плашки, ждущие показа (по одной за тап), и когда можно закрыть текущую (реальные часы, мс). */
  /** Кнопка «Заново» на экране конца уровня (центр и размер на экране игры), пока экран не показан — null. */
  /** (читает снимок режима проверки, qaTools) */ endButton: { x: number; y: number; w: number; h: number } | null = null;
  /** Кнопка «Улучшения» на экране конца уровня и сколько очков ДНК начислено за эту партию (0, пока партия идёт). */
  /** (читает снимок режима проверки, qaTools) */ upgradesButton: { x: number; y: number; w: number; h: number } | null = null;
  /** Кнопки «Следующий уровень» и «В меню» на экране конца уровня и «В меню» на паузе (или null). */
  /** (читает снимок режима проверки, qaTools) */ nextButton: { x: number; y: number; w: number; h: number } | null = null;
  /** (читает снимок режима проверки, qaTools) */ menuButton: { x: number; y: number; w: number; h: number } | null = null;
  private pauseResumeButton: { x: number; y: number; w: number; h: number } | null = null;
  private pauseMenuButton: { x: number; y: number; w: number; h: number } | null = null;
  private pauseAlmanacButton: { x: number; y: number; w: number; h: number } | null = null;
  private pauseSoundButton: { x: number; y: number; w: number; h: number } | null = null;
  private pauseRestartButton: { x: number; y: number; w: number; h: number } | null = null;
  /** (читает снимок режима проверки, qaTools) */ dnaGained = 0;
  private dnaAwarded = false;
  /** Уровень уже был пройден до этой партии: очки за волны — доля `meta.dna.replayFactor`. */
  private dnaReplay = false;
  /** Звёзды, заработанные в этой партии (0 при проигрыше), и очки ДНК за впервые полученные звёзды. */
  private stars = 0;
  private starDna = 0;
  /** Разбивка очков ДНК за партию на экране конца уровня (волны, победа, звёзды) и сама строка. */
  private dnaParts: DnaParts & { stars: number } = { waves: 0, win: 0, coins: 0, bosses: 0, flawless: 0, floor: 0, stars: 0 };
  /** Строка «До «узел» не хватает N ДНК» на экране конца уровня (или пусто). */
  /** (читает снимок режима проверки, qaTools) */ needLine = '';
  /** (читает снимок режима проверки, qaTools) */ endDnaLines: string[] = [];
  /** Нижний край и наибольшая ширина текстов на затемнении (конец уровня, пауза), пикселей экрана игры: проверка «текст не налезает на кнопки». */
  /** (читает снимок режима проверки, qaTools) */ overlayBox = { bottom: 0, maxWidth: 0 };
  private coinsLeft = 0;
  private waveInterval = 1;
  private spawnTimer = 0;
  private plannedTotal = 0;
  /** Суммарная прочность всех запланированных бактерий уровня (HP из таблицы типов, без роста прочности по волнам); для проверок. */
  private plannedHp = 0;
  private firstWaves: Record<string, number> = {};
  private panelKey = '';

  /** Тап по экрану паузы не закрывает её раньше этого момента (реальные часы, мс) — иначе тап по кнопке «пауза» сразу её снимет. */
  private resumeAllowedAt = 0;
  /** Паузу поставила площадка (`game_api_pause`), а не игрок: по `game_api_resume` игра продолжается сама. */
  private pausedByPlatform = false;
  /** Кадр, в котором пауза снята (кнопкой «Продолжить», кнопкой паузы или тапом по экрану): касание, начатое в этом кадре, принадлежит интерфейсу паузы, а не карте. */
  private resumeFrame = -1;
  /** Кнопка «Заново» не срабатывает раньше этого момента (реальные часы, мс) — чтобы не нажать случайно, продолжая быстро тапать. */
  private restartAllowedAt = 0;

  private world!: Phaser.GameObjects.Container;
  private puddleLayer!: Phaser.GameObjects.Container;
  private towerLayer!: Phaser.GameObjects.Container;
  private bacteriaLayer!: Phaser.GameObjects.Container;
  private projectileLayer!: Phaser.GameObjects.Container;
  private ghostLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Container;
  private ghostArt!: Phaser.GameObjects.Container;
  private ghostRange!: Phaser.GameObjects.Graphics;
  private ghostAim!: Phaser.GameObjects.Graphics;
  private ghostBarrel!: Phaser.GameObjects.Container;
  private ghostCell!: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Container | null = null;
  private rig!: CameraRig;
  private effects!: Effects;
  private panel!: Panel;

  constructor() {
    super('Game');
  }

  /** Правила текущего уровня: состав волн, рост прочности, кривая наград (`levelParams`). */
  private params!: LevelParams;

  /** Уровень приходит от экрана выбора (`scene.start('Game', { level })`); без него остаётся прежний (из адреса `?level=N` или последний сыгранный). */
  init(data?: { level?: number }): void {
    // закрытый уровень не запускается (в режиме проверки — любой; находка аудита MASTER-0065)
    if (data?.level && (QA_ENABLED || isLevelOpen(data.level))) setCurrentLevel(data.level);
    this.params = levelParams(currentLevel());
    useLevelMap(currentLevel());
  }

  create(): void {
    if (QA_NORENDER) this.sys.setVisible(false); // боты без рисования: менеджер сцен не рисует эту сцену, игровая логика идёт как обычно
    // Сцена при перезапуске не создаётся заново, поэтому всё обнуляем вручную.
    this.state = 'playing';
    // Разметка игрового процесса для площадки (GameplayAPI): партия идёт, пока сцена играет; уход со сцены её останавливает
    gameplay(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameplay(false));
    this.elapsed = 0;
    this.qaFrames = 0;
    this.qaBaseSec = 0;
    this.qaEvents = [];
    this.qaChip = '';
    this.coins = (this.params.plan ? this.params.plan.startCoins : CONFIG.economy.startCoins) + coinsBonus();
    this.lives = this.maxLives();
    this.kills = 0;
    this.splits = 0;
    this.disables = 0;
    this.leaked = 0;
    this.livesLostByKind = {};
    this.shots = 0;
    this.slows = 0;
    this.poisons = 0;
    this.absorbs = 0;
    this.leaps = 0;
    this.cloudsMade = 0;
    this.freezes = 0;
    this.trapsMade = 0;
    this.latches = 0;
    this.cardLatch = 1;
    this.cardAura = 1;
    this.spawned = 0;
    this.lifePool = 0;
    this.shieldLeft = shieldCharges();
    this.shieldAbsorbed = 0;
    this.rewardPool = 0;
    this.endButton = null;
    this.upgradesButton = null;
    this.copyButton = null;
    this.nextButton = null;
    this.menuButton = null;
    this.pauseResumeButton = null;
    this.pauseMenuButton = null;
    this.pauseAlmanacButton = null;
    this.pauseSoundButton = null;
    this.pauseRestartButton = null;
    setScreenInfo(null);
    this.dnaGained = 0;
    this.stars = 0;
    this.starDna = 0;
    this.dnaParts = { waves: 0, win: 0, coins: 0, bosses: 0, flawless: 0, floor: 0, stars: 0 };
    this.needLine = '';
    this.bossBits = 0;
    this.feverLeft = 0;
    this.feverWait = 0;
    this.feverGfx = null;
    this.feverText = null;
    this.feverKey = '';
    this.feverUses = 0;
    this.bossBarKey = '';
    this.endDnaLines = [];
    this.overlayBox = { bottom: 0, maxWidth: 0 };
    this.coinsLeft = 0;
    this.dnaAwarded = false;
    this.dnaReplay = false;
    this.bacteria = [];
    this.towers = [];
    this.projectiles = [];
    this.groundShots = [];
    this.puddles = [];
    this.clouds = [];
    this.traps = [];
    this.bursts = [];
    this.chains = [];
    this.occupied = new Set();
    this.selected = null;
    this.selectedTower = null;
    this.mergeMode = false;
    this.merges = 0;
    this.sells = 0;
    this.mutationsPicked = 0;
    this.builds = 0;
    this.speedSec = {};
    this.coinsAtWave = new Map();
    this.entryLevels = Object.entries(metaLevels()).filter(([, n]) => n > 0);
    this.attemptText = '';
    this.copyButton = null;
    this.phase = 'countdown';
    this.phaseTimer = CONFIG.waves.firstDelaySec;
    this.waveIdx = Math.min(QA_START_WAVE, this.waveTotal()) - 1;
    this.waveSpawned = 0;
    this.waveCount = 0;
    this.waveQueue = [];
    this.introduced = [];
    this.spawnTimer = 0;
    this.plannedTotal = 0;
    this.plannedHp = 0;
    this.firstWaves = {};
    for (let i = 0; i < this.waveTotal(); i++) {
      const kinds = this.waveKinds(i);
      for (const kind of kinds) if (this.firstWaves[kind] === undefined) this.firstWaves[kind] = i + 1;
      this.plannedTotal += kinds.length;
      for (const kind of kinds) this.plannedHp += CONFIG.types[kind].hp;
      if (this.params.plan?.waves[i]?.boss) this.plannedTotal++;
    }
    this.panelKey = '';
    this.resumeAllowedAt = 0;
    this.pausedByPlatform = false;
    this.resumeFrame = -1;
    this.restartAllowedAt = 0;
    this.overlay = null;

    this.input.mouse?.disableContextMenu();
    this.cameras.main.setBackgroundColor(COLORS.background);

    // Мир: карта и всё, что на ней. Камера двигает и масштабирует этот контейнер; панель лежит поверх и не двигается.
    this.world = this.add.container(0, 0);
    const mapLayer = this.add.container(0, 0);
    this.puddleLayer = this.add.container(0, 0);
    this.ghostLayer = this.add.container(0, 0);
    this.towerLayer = this.add.container(0, 0);
    this.bacteriaLayer = this.add.container(0, 0);
    this.projectileLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.world.add([mapLayer, this.puddleLayer, this.ghostLayer, this.towerLayer, this.bacteriaLayer, this.projectileLayer, this.fxLayer]);
    addMap(this, mapLayer);

    this.rig = new CameraRig(this.world, VIEW, WORLD, { min: ZOOM_MIN, max: CONFIG.camera.zoomMax });
    const start = unitCenter(LEVEL.startCenter[0], LEVEL.startCenter[1]);
    this.rig.set(CONFIG.camera.zoomStart, start.x, start.y);

    this.threads = this.add.graphics();
    this.projectileLayer.add(this.threads);
    this.effects = new Effects(this, this.fxLayer, (ms, intensity) => this.rig.shake(ms, intensity));
    this.bossBarGfx = this.add.graphics().setDepth(99).setVisible(false);
    this.bossBarText = this.add.text(BOSS_BAR.x, BOSS_BAR.y - BOSS_BAR.h / 2 - 2, '', this.textStyle(fs(18, 22))).setOrigin(0.5, 1).setDepth(99).setVisible(false);
    if (feverOwned()) this.buildFeverButton();
    this.buildGhost();
    this.userSpeed = this.loadSpeed();
    this.panel = new Panel(this, {
      onTower: (id) => this.toggleTower(id),
      onPause: () => this.togglePause(),
      onSpeed: () => this.cycleSpeed(),
      onWave: () => this.startWaveNow(),
      onMerge: () => this.toggleMerge(),
      onSell: () => this.sellSelected(),
      onPick: (index) => this.pickMutation(index),
      onRotate: (dir) => this.rotateSelected(dir),
      onCardClose: () => this.deselectTower(),
    });
    this.panel.init(this.maxLives());
    this.panel.setSpeed(this.userSpeed);
    this.panel.setCoins(this.coins);
    this.updateHint();
    this.refreshPanel();

    new MapGestures(this, this.rig, VIEW, {
      isActive: () => this.state === 'playing' && !isPortraitPhone(),
      // Нажатие, которое сняло паузу, — не жест карты: иначе отпускание после «Продолжить» становилось тапом по карте и ставило башню под кнопкой (решение владельца 20 октября 2026, сообщение 2, п. 1.3)
      startBlocked: () => this.game.loop.frame === this.resumeFrame,
      onTap: (sx, sy) => this.onTap(sx, sy),
      onHover: (sx, sy) => this.onHover(sx, sy),
      onHoverEnd: () => this.ghost.setVisible(false),
      isCovered: (sx, sy) => this.panel.coversPoint(sx, sy) || (this.feverGfx !== null && Math.hypot(sx - FEVER_BTN.x, sy - FEVER_BTN.y) <= FEVER_BTN.r + 6),
    });
    this.input.on('pointerdown', this.onScreenTap, this);
    if (STRESS) setupStress(this);
    else this.announceStart();
    if (FPS_ENABLED || QA_MODE) installFrameStats(this.game);
    if (FPS_ENABLED) new FpsMeter(this);

    exposeMetaDebug(() => HIDDEN_SCREEN);
    exposeDebug({
      getState: () => qaSnapshot(this),
      getEvents: (from = 0) => this.qaEvents.slice(from),
      getGraph: () => ({
        edges: EDGES.map((e) => ({ id: e.id, from: e.from, to: e.to, length: e.length, pts: e.pts.map((p): [number, number] => [p.x, p.y]) })),
        entrances: ENTRANCE_EDGES.map((e) => e.id),
        exits: Object.keys(LEVEL.nodes).filter((n) => !EDGES.some((e) => e.from === n)),
        blockedCells: [...BLOCKED_TILES].map((key): [number, number] => {
          const [col, row] = key.split(',').map(Number);
          return [col, row];
        }),
        pathCells: [...PATH_TILES].map((key): [number, number] => {
          const [col, row] = key.split(',').map(Number);
          return [col, row];
        }),
      }),
      gameToClient: (gx, gy) => this.gameToClient(gx, gy),
      placeTower: (id, col, row, level) => placeTowerQa(this, id as TowerId, col, row, level),
      getArtStats: (prefix) => artStats(prefix),
      getPerf: (reset) => {
        let objects = 0;
        const count = (list: Phaser.GameObjects.GameObject[]): void => {
          for (const obj of list) {
            if ((obj as unknown as { visible?: boolean }).visible === false) continue;
            objects++;
            if (obj instanceof Phaser.GameObjects.Container) count(obj.list);
          }
        };
        count(this.children.list);
        return {
          ...frameReport(reset),
          objects,
          bacteria: this.bacteria.length,
          towers: this.towers.length,
          renderer: this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
          scenario: STRESS ? (STRESS_FIZZ ? 'fizz' : STRESS_HIGH ? 'high' : 'stress') : undefined,
        };
      },
      worldToClient: (wx, wy) => {
        const s = this.rig.worldToScreen(wx, wy);
        return this.gameToClient(s.x, s.y);
      },
      cellToClient: (col, row) => {
        const p = tileCenter(col, row);
        const s = this.rig.worldToScreen(p.x, p.y);
        return this.gameToClient(s.x, s.y);
      },
      revealTower: (id) => this.panel.revealTower(id as TowerId),
      upgradeTower: (col, row, picks) => {
        const tower = this.towers.find((tw) => tw.col === col && tw.row === row);
        if (!tower) return false;
        tower.upgrade(picks);
        if (this.selectedTower === tower) this.refreshCard();
        return true;
      },
    });
  }

  update(time: number, deltaMs: number): void {
    this.rig.tickShake(Math.min(deltaMs, MAX_FRAME_MS));
    this.updateChip(time / 1000);
    if (this.state !== 'playing' || isPortraitPhone()) return;

    const frameDt = (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * TIME_SCALE * this.userSpeed;
    if (QA_MODE) {
      this.qaFrames++;
      this.qaBaseSec += frameDt / this.userSpeed;
    }
    // Кадр делится на равные шаги не длиннее SIM_STEP_SEC (запас 1e-6 — чтобы кадр ровно в один шаг не делился на два из-за дробной погрешности)
    const steps = Math.max(1, Math.ceil(frameDt / SIM_STEP_SEC - 1e-6));
    const dt = frameDt / steps;
    for (let i = 0; i < steps; i++) {
      this.elapsed += dt;
      this.speedSec[this.userSpeed] = (this.speedSec[this.userSpeed] ?? 0) + dt;
      if (!this.step(dt)) return;
      if (this.state !== 'playing') break;
    }
    this.refreshPanel();
    this.refreshFeverButton();
    this.refreshBossBar();
  }

  /** Один шаг расчёта боя длиной dt секунд игрового времени; false — шаг прерван концом партии (проигрыш), панель в этом кадре не обновляется. */
  private step(dt: number): boolean {
    this.updateFever(dt);
    this.updateWaves(dt);
    if (this.state !== 'playing') return false;

    this.updatePuddles(dt);
    this.applyHealing(dt);
    this.applyHaste();
    for (const bacterium of this.bacteria) {
      const leaps = bacterium.leaps;
      bacterium.update(dt);
      if (bacterium.leaps !== leaps) this.leaps++;
    }
    this.updateBosses(dt);
    this.applyPoison(dt);
    this.applyTraps(dt);
    this.updateBrood(dt);
    // защита от глушения спорами — по Витаминам, стоящим сейчас (а не по прошлому шагу): находки аудита MASTER-0061, 0062
    this.refreshImmunity();
    this.applySpores();
    this.updateClouds(dt);
    this.updateParasites();
    this.applyAuras();
    this.applyLamps();
    for (const tower of this.towers) tower.update(dt, this.bacteria, (target, x, y) => this.fire(tower, target, x, y));
    this.updateProjectiles(dt);
    this.updateGroundShots(dt);
    this.updateBursts(dt);
    this.updateChains(dt);
    this.resolveArrivals();
    if (this.state !== 'playing') return false;

    if (this.phase === 'done' && this.bacteria.length === 0) this.endGame(true);
    return true;
  }


  /** Вход, по которому выходит бактерия: случайный, а в режиме проверки с `&entrance=N` — всегда ребро N. */
  private pickEntrance(): Edge {
    const forced = QA_ENTRANCE === null ? undefined : ENTRANCE_EDGES.find((e) => e.id === QA_ENTRANCE);
    return forced ?? ENTRANCE_EDGES[Math.floor(Math.random() * ENTRANCE_EDGES.length)];
  }

  // ---------------------------------------------------------------- волны

  private updateWaves(dt: number): void {
    if (STRESS) {
      stressFrame(this);
      return;
    }
    if (this.phase === 'done') return;
    if (this.phase === 'countdown' || this.phase === 'pause') {
      this.phaseTimer -= dt;
      // «Автостарт волны» (узел древа): поле пусто — следующая волна выходит сразу, не дожидаясь конца паузы
      // премия за пропущенные секунды — как у кнопки «Начать волну» (находка аудита MASTER-0054, решение владельца 28 октября 2026, сообщение 2, п. 5)
      if (this.phase === 'pause' && this.bacteria.length === 0 && autoWaveOwned() && this.phaseTimer > 0) {
        this.coins += this.skipBonus();
        this.panel.setCoins(this.coins);
        this.phaseTimer = 0;
      }
      if (this.phaseTimer <= 0) this.startWave();
      return;
    }
    // Бактерии волны выходят по одной; если кадр длинный, за него выйдет сразу несколько
    this.spawnTimer -= dt;
    let count = 0;
    while (this.spawnTimer <= 0 && this.waveSpawned < this.waveCount && count < MAX_SPAWNS_PER_FRAME) {
      const item = this.waveQueue[this.waveSpawned];
      this.spawnBacterium(item);
      this.waveSpawned++;
      this.spawnTimer += item.gapSec;
      count++;
    }
    if (this.waveSpawned >= this.waveCount) {
      if (this.waveIdx >= this.waveTotal()) {
        this.phase = 'done';
      } else {
        this.phase = 'pause';
        this.phaseTimer = this.params.plan ? this.params.plan.pauseSec : CONFIG.waves.pauseSec;
        this.extendPauseForNewKinds(this.waveIdx);
        this.announceBoss(this.waveIdx);
      }
    }
  }

  private startWave(): void {
    const w = CONFIG.waves;
    // Улучшение «Подкрепление»: монеты в начале каждой волны (число бактерий на сумму не влияет)
    const reinforcement = waveCoinsBonus();
    if (reinforcement > 0) {
      this.coins += reinforcement;
      this.panel.setCoins(this.coins);
    }
    if (this.params.plan) {
      this.startPlanWave();
      return;
    }
    const i = this.waveIdx;
    const k = w.intervalRampWaves > 1 ? Math.min(1, i / (w.intervalRampWaves - 1)) : 1;
    this.waveInterval = w.intervalStartSec + (w.intervalEndSec - w.intervalStartSec) * k;
    // Новый тип выходит первым и в одном экземпляре (остальные такого же типа — потом, вперемешку с прочими)
    const all = this.waveKinds(i);
    const fresh = KINDS.filter((kind) => !this.introduced.includes(kind) && all.includes(kind));
    const queue: SpawnItem[] = [];
    const rest = [...all];
    for (const kind of fresh) {
      queue.push({ kind, edge: null, gapSec: this.waveInterval });
      rest.splice(rest.indexOf(kind), 1);
    }
    // Остальные собираем в «блоки»: одиночные бактерии и пачки (рой выходит плотно, все по одному входу) — и перемешиваем блоки
    const blocks: SpawnItem[][] = [];
    for (const kind of KINDS) {
      let n = rest.filter((kindOfRest) => kindOfRest === kind).length;
      const gap = CONFIG.types[kind].spawnGapSec;
      if (gap > 0 && n > 0) {
        const packs = Math.ceil(n / w.packMax);
        for (let p = 0; p < packs; p++) {
          const size = Math.ceil(n / (packs - p));
          n -= size;
          const edge = this.pickEntrance();
          const pack: SpawnItem[] = [];
          for (let m = 0; m < size; m++) pack.push({ kind, edge, gapSec: m < size - 1 ? gap : this.waveInterval });
          blocks.push(pack);
        }
      } else {
        for (let m = 0; m < n; m++) blocks.push([{ kind, edge: null, gapSec: this.waveInterval }]);
      }
    }
    for (let a = blocks.length - 1; a > 0; a--) {
      const b = Math.floor(Math.random() * (a + 1));
      [blocks[a], blocks[b]] = [blocks[b], blocks[a]];
    }
    this.waveQueue = [...queue, ...blocks.flat()];
    this.waveCount = this.waveQueue.length;
    this.waveIdx++;
    if (this.waveIdx % 10 === 0) this.coinsAtWave.set(this.waveIdx, this.coins);
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.phase = 'spawning';
    this.bossNext = false;
    sfx.wave();
  }

  /**
   * Волна уровня нового формата (документ дизайна docs/redesign-2026-10-19.md, разделы 2 и 9): длительность выхода задана (8 + 0,6·n с, не больше 30; +15 у мини-босса; 75 у босса),
   * блоки (одиночная бактерия, пачка роя, стена) выходят вперемешку через равные промежутки; стена — одним блоком по одному входу; босс — когда вышла доля `bossEnterShare` блоков.
   * Доход волны делится поровну между её бактериями (мини-босс несёт ещё `incomeMiniBoss`).
   */
  private startPlanWave(): void {
    const plan = this.params.plan!;
    const n = this.waveIdx + 1;
    const wave = plan.waves[n - 1] ?? { mix: {} };
    const last = n >= plan.waves.length;
    const duration = wave.boss && last ? plan.bossSec : Math.min(plan.spawnMaxSec, plan.spawnBaseSec + plan.spawnPerWaveSec * n) + (wave.boss ? plan.miniBossSec : 0);
    const all = this.waveKinds(n - 1);
    const wallKind = wave.wall?.[0];
    let wallLeft = wave.wall?.[1] ?? 0;
    const regular = [...all];
    // стена — отдельный блок (сколько штук — из `wall`, они уже есть в строке волны)
    for (let k = 0; k < wallLeft; k++) regular.splice(regular.indexOf(wallKind as BacteriumKind), 1);
    const fresh = KINDS.filter((kind) => !this.introduced.includes(kind) && all.includes(kind) && kind !== wallKind);
    const blocks: SpawnItem[][] = [];
    for (const kind of fresh) {
      blocks.push([{ kind, edge: null, gapSec: 0 }]);
      regular.splice(regular.indexOf(kind), 1);
    }
    const head = blocks.length;
    const rest: SpawnItem[][] = [];
    for (const kind of KINDS) {
      let count = regular.filter((x) => x === kind).length;
      const gap = CONFIG.types[kind].spawnGapSec;
      if (gap > 0 && count > 0) {
        const packs = Math.ceil(count / CONFIG.waves.packMax);
        for (let p = 0; p < packs; p++) {
          const size = Math.ceil(count / (packs - p));
          count -= size;
          const edge = this.pickEntrance();
          rest.push(Array.from({ length: size }, (_, m) => ({ kind, edge, gapSec: m < size - 1 ? gap : 0 })));
        }
      } else {
        for (let m = 0; m < count; m++) rest.push([{ kind, edge: null, gapSec: 0 }]);
      }
    }
    if (wallKind && wallLeft > 0) {
      const edge = this.pickEntrance();
      const pack: SpawnItem[] = [];
      while (wallLeft-- > 0) pack.push({ kind: wallKind, edge, gapSec: plan.wallGapSec });
      pack[pack.length - 1].gapSec = 0;
      rest.push(pack);
    }
    for (let a = rest.length - 1; a > 0; a--) {
      const b = Math.floor(Math.random() * (a + 1));
      [rest[a], rest[b]] = [rest[b], rest[a]];
    }
    blocks.push(...rest);
    if (wave.boss) blocks.splice(Math.min(blocks.length, Math.max(head, Math.round(blocks.length * plan.bossEnterShare))), 0, [{ kind: CONFIG.bosses[wave.boss].base, edge: null, gapSec: 0, boss: wave.boss }]);
    // Длительность волны — по разделу 9 документа дизайна (решение владельца 20 октября 2026, сообщение 2, п. 2.2): промежутки внутри пачек (рой, стена) входят в неё, а не идут сверх;
    // остаток — поровну после каждого блока. Если промежутки пачек длиннее волны, они сжимаются пропорционально.
    const inner = blocks.reduce((sum, block) => sum + block.slice(0, -1).reduce((s, item) => s + item.gapSec, 0), 0);
    const squeeze = inner > duration ? duration / inner : 1;
    if (squeeze < 1) for (const block of blocks) for (const item of block.slice(0, -1)) item.gapSec *= squeeze;
    const gapAfter = Math.max(0, duration - inner * squeeze) / Math.max(1, blocks.length);
    for (const block of blocks) block[block.length - 1].gapSec = gapAfter;
    const queue = blocks.flat();
    const income = plan.incomeBase + plan.incomePerWave * n;
    const share = income / Math.max(1, queue.length);
    for (const item of queue) item.reward = share + (item.boss && !last ? plan.incomeMiniBoss : 0);
    this.waveQueue = queue;
    this.waveCount = queue.length;
    this.waveIdx = n;
    if (this.waveIdx % 10 === 0) this.coinsAtWave.set(this.waveIdx, this.coins);
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.phase = 'spawning';
    this.bossNext = false;
    sfx.wave();
  }

  /**
   * Перед волной с боссом (индекс `index` с нуля) — знак без текста: таймер волны красный и отдельный звук (решение владельца 26 октября 2026, сообщение 1, п. 3.1;
   * строка «Следующая волна: <имя>» убрана — конфликт 4 документа дизайна отменён в этой части). Таймер гаснет с началом волны.
   */
  private announceBoss(index: number): void {
    this.bossNext = Boolean(this.params.plan?.waves[index]?.boss);
    if (this.bossNext) sfx.bossWarn();
  }

  /** Жизней в начале партии: из таблицы плюс купленные улучшения (docs/upgrades.md). */
  private maxLives(): number {
    return CONFIG.lives.start + livesBonus();
  }

  /** Множитель наград текущей волны по кривой `economy.rewardCurve` (точки [волна, множитель], между ними — по прямой). */
  private rewardFactor(): number {
    const pts = this.params.rewardCurve;
    const w = Math.max(1, this.waveIdx);
    if (w <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [wb, fb] = pts[i];
      if (w <= wb) {
        const [wa, fa] = pts[i - 1];
        return fa + ((fb - fa) * (w - wa)) / (wb - wa);
      }
    }
    return pts[pts.length - 1][1];
  }

  /** Во сколько раз прочнее бактерии текущей волны (рост `waves.hpGrowthPerWave` после волны `hpGrowthFromWave` и добавка `hpGrowthLatePerWave` после волны `hpGrowthLateFromWave`; у уровней со своим ростом — `growth` из таблицы уровней); всё умножается на `waves.hpScale` и на множитель уровня (`hpFactor`: у уровня 1 — `waves.level1HpFactor`); 1 — как в таблице типов. */
  private waveHpMul(): number {
    const plan = this.params.plan;
    if (plan) {
      const n = this.waveIdx;
      const grow = (w: number) => (w <= plan.hpFlatUntil ? 1 : Math.pow(w / plan.hpFlatUntil, plan.hpExp));
      const late = plan.hpLateFrom;
      return plan.hpScale * (late !== undefined && plan.hpLateExp !== undefined && n > late ? grow(late) * Math.pow(n / late, plan.hpLateExp) : grow(n));
    }
    const { perWave, fromWave, latePerWave, lateFromWave } = this.params.growth;
    return CONFIG.waves.hpScale * this.params.hpFactor * (1 + perWave * Math.max(0, this.waveIdx - fromWave) + latePerWave * Math.max(0, this.waveIdx - lateFromWave));
  }

  /** Множитель брони видов на текущей волне: уровень нового формата — 1 + armorPerWave · (волна − 1), прежнего — по номеру уровня. */
  private waveArmorMul(): number {
    const plan = this.params.plan;
    return plan ? 1 + plan.armorPerWave * Math.max(0, this.waveIdx - 1) : this.params.armorMul;
  }

  /** Свойства ребёнка (дети делящейся, матки и босса): броня — как у родителя; на уровне нового формата монет не дают (доход волны уже поделён). */
  private childExtra(parent: Bacterium): BacteriumExtra {
    return this.params.plan ? { armorMul: parent.armorMul, reward: 0 } : { armorMul: parent.armorMul };
  }

  /** Сколько волн идёт на уровне. */
  private waveTotal(): number {
    return this.params.total;
  }

  /** Кто выйдет в волне i (по одному элементу на бактерию, в порядке таблицы типов). */
  private waveKinds(i: number): BacteriumKind[] {
    const row = this.params.rows[i] ?? {};
    const kinds: BacteriumKind[] = [];
    for (const kind of KINDS) for (let n = 0; n < (row[kind] ?? 0); n++) kinds.push(kind);
    return kinds;
  }

  /** Бактерия выходит справа; на какой из входов — случайно. Дальше на каждой развилке она сама выберет путь. */
  private spawnBacterium(item: SpawnItem): void {
    const { kind } = item;
    const edge = item.edge ?? this.pickEntrance();
    const born = new Bacterium(this, this.bacteriaLayer, kind, edge, 0, this.waveHpMul(), { armorMul: this.waveArmorMul(), boss: item.boss, reward: item.reward });
    born.ward = this.wardFor(kind, item.boss);
    this.bacteria.push(born);
    this.spawned++;
    if (QA_MODE) qaLog(this, 'spawn', { id: born.id, kind, edge: edge.id, boss: item.boss ?? null });
    if (item.boss) {
      // босс — не новый вид: в Альманахе открывается его запись (строка о нём — перед волной)
      markSeen(`boss:${item.boss}`);
      return;
    }
    if (!this.introduced.includes(kind)) this.introduced.push(kind);
    this.meet(kind);
  }

  /**
   * Бактерия вышла на поле: её запись в Альманахе открыта (решение владельца 25 октября 2026, сообщение 5, п. 2.1). Уведомления «Новая бактерия» в бою нет (там же, п. 3.1);
   * при первой встрече вида остаётся только звук.
   */
  private meet(kind: BacteriumKind): void {
    if (wasMet(`b:${kind}`)) return;
    markSeen(`b:${kind}`);
    sfx.newType();
  }

  /** Жёсткое свойство бактерии на этом уровне (`plan.hardWalls`): бегун, бронированный, слизень — по виду; босс последней волны — фаза «только взрыв и луч». */
  private wardFor(kind: BacteriumKind, boss?: BossId): Ward | null {
    const hard = this.params.plan?.hardWalls;
    if (!hard) return null;
    if (boss) return hard.bossArea > 0 && this.waveIdx >= (this.params.plan?.waves.length ?? Infinity) ? 'area' : null;
    if (kind === 'runner' && hard.runnerSlow > 0) return 'slow';
    if (kind === 'armored' && hard.armoredPierce > 0) return 'pierce';
    if (kind === 'slick' && hard.slickBeam > 0) return 'beam';
    if (kind === 'slick' && hard.slickMemory > 0) return 'memory';
    return null;
  }

  // ---------------------------------------------------------------- бой

  /**
   * Выстрел башни; возвращает, состоялся ли он. «По радиусу» и «по площади» — снаряд летит за целью; «лужа» — капля (или две, мутация «Две капли»)
   * летит в точку дорожки впереди бактерии (если там уже есть лужа — выстрела нет); «луч» — запускается очередь ударов по линии.
   * Числа берутся из `tower.stats` (уровень и мутации уже учтены).
   */
  private fire(tower: Tower, target: Bacterium, muzzleX: number, muzzleY: number): boolean {
    const st = tower.fireStats;
    if (st.targeting === 'cone') {
      // Лампа: башня отдаёт тики конуса; каждый тик — урон (броня вычитается из каждого) всем, кто сейчас в конусе, без вспышек и звуков попаданий
      const ticks = tower.coneTicks;
      tower.coneTicks = 0;
      if (tower.coneFresh) {
        tower.coneFresh = false;
        sfx.shoot(tower.id);
      }
      const hits = tower.coneHits(this.bacteria);
      for (let i = 0; i < ticks; i++) for (const bacterium of hits) this.damageBacterium(bacterium, st, true, st.damage, true);
      return true;
    }
    if (st.targeting === 'freeze') {
      // Холод: замерзают все в радиусе, кто может (вид замерзает, не заморожен, окно после оттаивания прошло); с ключом «Хрупкость» по замёрзшим удары сильнее
      const frozen = tower.inRange(this.bacteria).filter((b) => b.freezable);
      if (frozen.length === 0) return false;
      for (const bacterium of frozen) bacterium.freeze(st.freezeSec, st.brittle, st.thawSlowSec, st.thawSlowFactor);
      this.freezes++;
      this.effects.frost(tower.x, tower.y, st.range);
    } else if (st.targeting === 'trap') {
      // Пластырь: ловушка на дорожке под этой бактерией (первой из подходящих; с мутацией «Две ловушки» — и под следующей)
      if (target.trapped || CONFIG.types[target.kind].trapImmune > 0) return false;
      target.trap(st.trapSec, st.trapDps);
      this.traps.push(new Trap(this, this.puddleLayer, target.x, target.y, pointAt(target.edge, target.s).angle, target));
      this.trapsMade++;
      this.effects.flash(target.x, target.y, target.radius * 0.8, COLORS.patch);
    } else if (st.targeting === 'puddle') {
      const puddle = { radius: st.puddleRadius, seconds: st.puddleSec, slowFactor: st.slowFactor, slowSec: st.slowSec, poison: st.poisonPerSec };
      let launched = 0;
      for (let k = 0; k < st.puddleCount; k++) {
        const spot = this.puddleSpot(tower, target, st.puddleLeadPx + k * st.puddleRadius * 1.6);
        const taken = (x: number, y: number): boolean => Math.hypot(x - spot.x, y - spot.y) < st.puddleRadius * 0.8;
        if (this.puddles.some((p) => taken(p.x, p.y)) || this.groundShots.some((shot) => taken(shot.tx, shot.ty))) continue;
        this.groundShots.push(new GroundShot(this, this.projectileLayer, muzzleX, muzzleY, spot.x, spot.y, st.projectileSpeed, puddle));
        launched++;
      }
      if (launched === 0) return false;
    } else if (st.targeting === 'beam') {
      this.bursts.push({ tower, left: st.beamPulses, timer: 0, index: 0 });
    } else {
      this.projectiles.push(new Projectile(this, this.projectileLayer, muzzleX, muzzleY, target, tower.id, st.projectileSpeed, st));
    }
    this.shots++;
    sfx.shoot(tower.id);
    // Отдача ствола и облачко у дула (из общего запаса эффектов, без новых объектов на каждый выстрел)
    if (tower.kick()) this.effects.muzzle(muzzleX, muzzleY, Math.atan2(muzzleY - tower.y, muzzleX - tower.x), MUZZLE_PUFF[tower.id] ?? 0xffffff);
    return true;
  }

  /** Куда класть лужу: на дорожке впереди бактерии на `lead` пикселей, но так, чтобы место было в радиусе башни (если дальше — ближе к бактерии). */
  private puddleSpot(tower: Tower, target: Bacterium, lead: number): { x: number; y: number } {
    const { range, puddleRadius } = tower.stats;
    for (let d = lead; d > 0; d -= 20) {
      const p = target.pointAhead(d);
      if (Math.hypot(p.x - tower.x, p.y - tower.y) <= range + puddleRadius * 0.5) return p;
    }
    return { x: target.x, y: target.y };
  }

  private updateProjectiles(dt: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const result = projectile.update(dt);
      if (result === 'flying') return true;
      if (projectile.stats.targeting === 'area') this.explode(projectile.x, projectile.y, projectile.stats);
      else if (result === 'hit') {
        if (projectile.stats.targeting === 'poison') this.poisonBacterium(projectile.target, projectile.stats);
        else {
          const target = projectile.target;
          this.damageBacterium(target, projectile.stats);
          if (projectile.stats.ricochet > 0) this.ricochet(target, projectile.stats);
        }
      }
      projectile.destroy();
      return false;
    });
  }

  /** Ключ «Рикошет» Таблетки: снаряд отскакивает в ближайшую другую бактерию (не дальше `keyNodes.pill.rangePx`) с долей урона. */
  private ricochet(from: Bacterium, st: TowerStats): void {
    const best = this.nearestPreferHurt(from.x, from.y, CONFIG.keyNodes.pill.rangePx, st, from);
    if (!best) return;
    this.effects.flash(best.x, best.y, best.radius * 0.6, COLORS.hit);
    this.damageBacterium(best, st, true, st.damage * st.ricochet);
  }

  /** Капли сиропа летят в точку дорожки; долетев, оставляют лужу. */
  private updateGroundShots(dt: number): void {
    this.groundShots = this.groundShots.filter((shot) => {
      if (!shot.update(dt)) return true;
      const { radius, seconds, slowFactor, slowSec, poison } = shot.puddle;
      this.puddles.push(new Puddle(this, this.puddleLayer, shot.tx, shot.ty, radius, seconds, slowFactor, slowSec, poison));
      this.effects.splat(shot.tx, shot.ty, radius);
      sfx.splash();
      shot.destroy();
      return false;
    });
  }

  /** Лужи: каждая бактерия в луже замедляется (и ещё немного после выхода), в «едкой» луже ещё и теряет HP; когда время лужи вышло, она исчезает. */
  private updatePuddles(dt: number): void {
    if (this.puddles.length === 0) return;
    for (const bacterium of [...this.bacteria]) {
      for (const puddle of this.puddles) {
        if (bacterium.hp <= 0 || !puddle.covers(bacterium)) continue;
        if (puddle.poison > 0 && bacterium.drain(puddle.poison * dt)) {
          this.killBacterium(bacterium);
          break;
        }
        if (CONFIG.types[bacterium.kind].slowImmune > 0) continue;
        if (!bacterium.slowed) this.slows++;
        bacterium.slow(puddle.slowFactor, puddle.slowSec, true);
      }
    }
    this.puddles = this.puddles.filter((puddle) => {
      if (puddle.update(dt)) return true;
      puddle.destroy();
      return false;
    });
  }

  /** Облака токсина: время идёт, истёкшие исчезают; башни, чей центр в облаке, не стреляют (флаг выставляется каждый кадр). */
  private updateClouds(dt: number): void {
    if (this.clouds.length > 0) {
      this.clouds = this.clouds.filter((cloud) => {
        if (cloud.update(dt)) return true;
        cloud.destroy();
        return false;
      });
    }
    for (const tower of this.towers) tower.setSuppressed(!tower.immune && this.clouds.some((cloud) => cloud.covers(tower.x, tower.y)));
  }

  /** Аура Витамина: каждая башня получает самый сильный (наименьший) множитель паузы среди работающих Витаминов, в радиусе которых стоит её центр; Витамины не складываются. */
  /** Защита Витамина с «Иммунитетом» (`stats.immunity`) по башням в радиусе работающих Витаминов; `applyAuras` ставит её ещё раз вместе с аурой. */
  private refreshImmunity(): void {
    const vitamins = this.towers.filter((tower) => tower.isAura && tower.isWorking && tower.stats.immunity);
    for (const tower of this.towers) tower.immune = vitamins.some((v) => v !== tower && Math.hypot(v.x - tower.x, v.y - tower.y) <= v.stats.range);
  }

  private applyAuras(): void {
    const vitamins = this.towers.filter((tower) => tower.isAura && tower.isWorking);
    const excluded = CONFIG.mutationCaps.auraExcluded;
    // «Лихорадка»: пока действует, паузы всех башен короче
    const fever = this.feverLeft > 0 ? CONFIG.abilities.fever.cooldownMul : 1;
    for (const tower of this.towers) {
      let mul = 1;
      let immune = false;
      let dmg = 1;
      for (const vitamin of vitamins) {
        if (vitamin === tower || Math.hypot(vitamin.x - tower.x, vitamin.y - tower.y) > vitamin.stats.range) continue;
        if (vitamin.stats.immunity) immune = true;
        // Аура не действует на Лампу, Витамин, Сироп, Холод и Пластырь (документ дизайна, п. 4.2)
        if (excluded.includes(tower.id)) continue;
        // «Сильное усиление»: урон сильнее, между Витаминами не складывается — наибольшее (сообщение 3 от 28 октября 2026, п. 5)
        dmg = Math.max(dmg, vitamin.stats.auraDamageMul);
        // Присосавшийся к Витамину паразит ослабляет его прибавку в latchMul раз (пауза соседей ближе к 1)
        const aura = vitamin.latchMul > 1 ? 1 - (1 - vitamin.stats.auraMul) / vitamin.latchMul : vitamin.stats.auraMul;
        mul = Math.min(mul, aura);
      }
      tower.auraMul = mul * fever;
      tower.immune = immune;
      tower.auraDamageMul = dmg;
    }
    // Карточка выбранной башни показывает урон в секунду с учётом ауры: перерисовать, когда она изменилась
    if (this.selectedTower && this.selectedTower.auraMul !== this.cardAura) this.refreshCard();
  }

  /** Паразиты: подойдя ближе latchRadius к башне, паразит присасывается к ближайшей и держится, пока жив и не дошёл до организма (исчезнувшую башню меняет на другую); пауза присосанной башни ×latchMul
   *  (несколько паразитов на одной башне не складываются — берётся наибольший множитель). Множитель выставляется заново каждый кадр; нить паразит — башня рисуется здесь же. */
  private updateParasites(): void {
    for (const tower of this.towers) tower.latchMul = 1;
    const g = this.threads;
    g.clear();
    for (const b of this.bacteria) {
      const { latchRadius, latchMul } = CONFIG.types[b.kind];
      if (latchRadius <= 0 || b.hp <= 0) continue;
      if (b.latchedTo && !this.towers.includes(b.latchedTo)) b.latchedTo = null;
      if (!b.latchedTo) {
        let bestDist = latchRadius;
        for (const tower of this.towers) {
          const d = Math.hypot(tower.x - b.x, tower.y - b.y);
          if (d <= bestDist) {
            bestDist = d;
            b.latchedTo = tower;
          }
        }
        if (b.latchedTo) {
          this.latches++;
          if (QA_MODE) qaLog(this, 'latch', { id: b.id, col: b.latchedTo.col, row: b.latchedTo.row, dist: bestDist });
        }
      }
      const host = b.latchedTo;
      if (!host) continue;
      host.latchMul = Math.max(host.latchMul, latchMul);
      // Нить: слегка провисающая линия от бактерии к башне, на башне — присоска
      const dx = host.x - b.x;
      const dy = host.y - b.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const sag = Math.min(36, len * 0.12);
      g.lineStyle(3.5, COLORS.thread, 0.9);
      g.beginPath();
      g.moveTo(b.x, b.y);
      for (let i = 1; i <= 10; i++) {
        const u = i / 10;
        g.lineTo(b.x + dx * u - (dy / len) * sag * Math.sin(Math.PI * u), b.y + dy * u + (dx / len) * sag * Math.sin(Math.PI * u));
      }
      g.strokePath();
      g.fillStyle(COLORS.thread, 1).fillCircle(host.x, host.y, 7);
    }
    // Карточка выбранной башни показывает паузу с множителем паразита: перерисовать, когда он изменился
    if (this.selectedTower && this.selectedTower.latchMul !== this.cardLatch) this.refreshCard();
  }

  /** Ловушки Пластыря: приклеенные бактерии теряют HP (погибшая в ловушке — обычное убийство); пластырь без бактерии (погибла или время вышло) убирается. */
  private applyTraps(dt: number): void {
    if (this.traps.length === 0) return;
    let died: Bacterium[] | null = null;
    for (const bacterium of this.bacteria) {
      if (bacterium.trapLeft > 0 && bacterium.tickTrap(dt)) (died ??= []).push(bacterium);
    }
    if (died) for (const bacterium of died) this.killBacterium(bacterium);
    this.traps = this.traps.filter((trap) => {
      if (trap.update()) return true;
      trap.destroy();
      return false;
    });
  }

  /** Яд Антибиотика: снаряд ничего не ломает, а накладывает яд (сила и время — из чисел башни на момент выстрела). */
  private poisonBacterium(bacterium: Bacterium, st: TowerStats): void {
    if (bacterium.hp <= 0) return;
    bacterium.poison(st.dotPerSec, st.dotSec, st.epidemic);
    this.poisons++;
    this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.7, COLORS.poison);
  }

  /** Яд идёт каждый кадр; погибшая от яда бактерия — обычное убийство (награда, частицы, распад делящейся). */
  /** Лампы подсвечивают скрытных в круге радиуса range (башня работает: не заглушена спорой и не в облаке); подсвеченных видят все башни на полном радиусе. */
  private applyLamps(): void {
    for (const tower of this.towers) {
      const sec = tower.stats.lightSec;
      if (sec <= 0 || !tower.isWorking) continue;
      const spot = tower.stats.spotlight;
      for (const b of this.bacteria) {
        if (b.hp <= 0 || Math.hypot(b.x - tower.x, b.y - tower.y) > tower.stats.range + b.radius) continue;
        if (b.stealth > 0) b.light(sec);
        // Ключ «Прожектор»: бактерии в круге Лампы получают от всех башен больше урона
        if (spot > 1) b.spotlight(spot, sec);
      }
    }
  }

  private applyPoison(dt: number): void {
    let died: Bacterium[] | null = null;
    for (const bacterium of this.bacteria) {
      if (bacterium.poisonLeft > 0 && bacterium.tickPoison(dt)) (died ??= []).push(bacterium);
    }
    if (died) for (const bacterium of died) this.killBacterium(bacterium);
  }

  /** Лекарь: пока жив, лечит всех остальных бактерий в радиусе healRadius на долю healShare их полной прочности в секунду. */
  private applyHealing(dt: number): void {
    for (const healer of this.bacteria) {
      const { healRadius, healShare } = CONFIG.types[healer.kind];
      if (healRadius <= 0 || healer.hp <= 0 || healer.boss) continue;
      for (const bacterium of this.bacteria) {
        if (bacterium === healer) continue;
        if (Math.hypot(bacterium.x - healer.x, bacterium.y - healer.y) > healRadius) continue;
        bacterium.heal(healShare * bacterium.maxHp * dt);
      }
    }
  }

  /** Командир: все остальные бактерии в его кольце идут быстрее (берётся сильнейшее из ускорений); выставляется заново каждый кадр. */
  private applyHaste(): void {
    for (const bacterium of this.bacteria) bacterium.haste = 1;
    for (const commander of this.bacteria) {
      const { hasteRadius, hasteFactor } = CONFIG.types[commander.kind];
      if (hasteRadius <= 0 || commander.hp <= 0) continue;
      for (const bacterium of this.bacteria) {
        if (bacterium === commander) continue;
        if (Math.hypot(bacterium.x - commander.x, bacterium.y - commander.y) > hasteRadius) continue;
        bacterium.haste = Math.max(bacterium.haste, hasteFactor);
      }
    }
  }

  /** Матка: раз в brewEverySec секунд рожает brewCount бактерий роя на своём месте (чуть друг за другом). Рождённые в «вышло за волну» не считаются. */
  private updateBrood(dt: number): void {
    for (const mother of [...this.bacteria]) {
      const { brewEverySec, brewCount } = CONFIG.types[mother.kind];
      if (brewEverySec <= 0 || mother.hp <= 0 || mother.held || mother.boss) continue;
      mother.brewClock += dt;
      if (mother.brewClock < brewEverySec) continue;
      mother.brewClock -= brewEverySec;
      for (let i = 0; i < brewCount; i++) {
        const child = new Bacterium(this, this.bacteriaLayer, BREWS_INTO, mother.edge, mother.s, mother.hpMul, this.childExtra(mother));
        child.moveForward(i * CONFIG.types[BREWS_INTO].radius * 2);
        this.bacteria.push(child);
        this.meet(BREWS_INTO);
      }
      this.effects.flash(mother.x, mother.y, mother.radius * 0.8, COLORS.egg);
    }
  }

  /** Очереди луча: каждые beamGapMs — удар по всем, кто сейчас на линии башни; заглушенная спорой (или проданная) башня очередь бросает. */
  private updateBursts(dt: number): void {
    this.bursts = this.bursts.filter((burst) => {
      if (burst.tower.isDisabled || burst.tower.isSuppressed || !this.towers.includes(burst.tower)) return false;
      burst.timer -= dt;
      while (burst.timer <= 0 && burst.left > 0) {
        this.beamPulse(burst.tower, burst.index);
        burst.index++;
        burst.left--;
        burst.timer += burst.tower.stats.beamGapMs / 1000;
      }
      return burst.left > 0;
    });
  }

  /** Один удар луча (номер в очереди — index): линия (две, если «Второй луч») вспыхивает, каждая бактерия на ней получает урон башни («Спираль» — сильнее с каждым ударом). */
  private beamPulse(tower: Tower, index: number): void {
    const st = tower.fireStats;
    for (const dir of tower.beamDirections()) {
      const angle = aimAngle(dir);
      const reach = beamReach(tower.x, tower.y, angle, st.beamLengthPx);
      this.effects.beam(tower.x + Math.cos(angle) * BEAM_START_PX, tower.y + Math.sin(angle) * BEAM_START_PX, angle, Math.max(0, reach - BEAM_START_PX));
    }
    sfx.zap();
    const damage = st.damage + index * st.spiral * CONFIG.towerLevels[Math.min(tower.level, CONFIG.towerLevels.length) - 1].damageMul;
    const hits = tower.beamHits(this.bacteria);
    const killsBefore = this.kills;
    // Ключ «Сквозной разряд»: первая бактерия на линии (ближайшая к башне) теряет броню до удара
    if (st.armorBreakSec > 0 && hits.length > 0) {
      let first = hits[0];
      for (const b of hits) if (Math.hypot(b.x - tower.x, b.y - tower.y) < Math.hypot(first.x - tower.x, first.y - tower.y)) first = b;
      first.breakArmor(st.armorBreakSec);
    }
    for (const bacterium of hits) this.damageBacterium(bacterium, st, true, damage);
    if (QA_MODE) qaLog(this, 'beam', { col: tower.col, row: tower.row, index, hits: hits.length, kills: this.kills - killsBefore });
  }

  /**
   * Попадание: урон (у бронированных броня вычитается, если мутация не «бронебойная»); «кислота» делает следующие удары сильнее (`acid` false — кислоту не накладывать:
   * так взрыв Шипучки не даёт её целям со сниженным уроном). Если бактерия погибла — монеты, частицы, распад делящейся. Возвращает true, если на бактерию наложена кислота.
   */
  private damageBacterium(bacterium: Bacterium, st: TowerStats, quiet = false, damage: number = st.damage, light = false, acid = true): boolean {
    if (bacterium.hp <= 0) return false;
    // Жёсткое свойство уровня: удар не ранит (серая пометка «неуязвим»); «память вида» запоминает башню и после отражённого удара
    if (wardBlocks(bacterium, st)) {
      bacterium.lastDealt = 0; // журнал взрыва режима проверки не берёт урон прошлого удара (находка аудита MASTER-0038)
      if (!light) this.effects.immune(bacterium.id, bacterium.x, bacterium.y - bacterium.radius * 0.7, t('wardImmune'), RESIST_COLOR);
      return false;
    }
    // Капсула Матки роя: удар не проходит — без вспышки, числа и кислоты, звук брони, как поглощение у Поглотителя (находки аудита MASTER-0036, 0092; сообщение 2 от 28 октября 2026, п. 5)
    if (bacterium.shielded) {
      bacterium.lastDealt = 0;
      if (!quiet) sfx.hit('armored');
      return false;
    }
    if (bacterium.ward === 'memory') bacterium.remember(st.towerId);
    // Мутант помнит вид башни, ударившей последней: удар башни того же вида слабее; удар другого вида штрафа не получает и запоминается
    const memoryMul = CONFIG.types[bacterium.kind].memoryMul;
    const resisted = memoryMul > 0 && bacterium.memory === st.towerId;
    if (resisted) damage *= memoryMul;
    const color = resisted ? RESIST_COLOR : DAMAGE_COLORS[st.targeting];
    const killed = bacterium.hit(damage, st.armorPierce);
    if (memoryMul > 0 && !killed && !bacterium.justAbsorbed) bacterium.remember(st.towerId);
    if (bacterium.justAbsorbed) {
      // Поглотитель поглотил удар: урона нет (вспышку «поглощено» рисует сама бактерия), числа не показываем
      this.absorbs++;
      if (!quiet) sfx.hit('armored');
      return false;
    }
    if (light) {
      // Тик конуса Лампы: вспышки нет; число урона раз в LIGHT_NUMBER_SEC, с накопленным уроном
      bacterium.numAcc += bacterium.lastDealt;
      if (this.elapsed - bacterium.numAt >= LIGHT_NUMBER_SEC) {
        this.effects.damageNumber(bacterium.id, bacterium.x, bacterium.y - bacterium.radius * 0.7, bacterium.numAcc, bacterium.numAcc / bacterium.maxHp, color);
        bacterium.numAcc = 0;
        bacterium.numAt = this.elapsed;
      }
      if (killed) this.killBacterium(bacterium, st);
      return false;
    }
    this.effects.damageNumber(bacterium.id, bacterium.x, bacterium.y - bacterium.radius * 0.7, bacterium.lastDealt, bacterium.lastDealt / bacterium.maxHp, color);
    if (killed) {
      this.killBacterium(bacterium, st);
      return false;
    }
    const exposed = acid && st.acidSec > 0 && st.acidMul > 1;
    if (exposed) bacterium.expose(st.acidMul, st.acidSec);
    // Чем сильнее удар относительно прочности бактерии, тем крупнее вспышка: до полуторных размеров обычной
    const strength = Math.min(1, (bacterium.lastDealt / bacterium.maxHp) * 2);
    this.effects.flash(bacterium.x, bacterium.y, bacterium.radius * 0.6 * (1 + 0.5 * strength), st.targeting === 'beam' ? COLORS.needle : COLORS.hit);
    if (!quiet) sfx.hit(bacterium.kind);
    return exposed;
  }

  /**
   * Взрыв «Шипучки»: бактерии, которых касается круг взрыва (в том числе когда цель уже погибла от другого выстрела), сортируются по расстоянию от центра
   * (ближайшие первыми, при равенстве — по номеру); первые `blastFullTargets` получают полный урон и «кислоту», остальные — урон × `blastRestMul` и без кислоты.
   * `blastFullTargets` 0 — не ограничено (у башен кроме Шипучки). Радиус взрыва число целей с полным уроном не меняет.
   * Мутация «Цепная»: через 0,3 с второй взрыв (радиус ×0,7, урон ×0,6) на ближайшей бактерии рядом (`allowChain` — только у первого); у него ограничение считается отдельно.
   */
  private explode(x: number, y: number, st: TowerStats, radiusMul = 1, damageMul = 1, allowChain = true): void {
    const radius = st.blastRadius * radiusMul;
    this.effects.blast(x, y, radius);
    sfx.blast();
    const killsBefore = this.kills;
    const inCircle: { bacterium: Bacterium; dist: number }[] = [];
    for (const bacterium of this.bacteria) {
      if (bacterium.hp <= 0) continue;
      const dist = Math.hypot(bacterium.x - x, bacterium.y - y);
      if (dist - bacterium.radius > radius) continue;
      inCircle.push({ bacterium, dist });
    }
    // цели, которых удар не ранит, слоты полного урона не занимают — идут последними (находка аудита MASTER-0016, решение владельца 28 октября 2026, сообщение 2, п. 5)
    const blocked = (b: Bacterium): number => (wardBlocks(b, st) || b.shielded ? 1 : 0);
    inCircle.sort((a, b) => blocked(a.bacterium) - blocked(b.bacterium) || a.dist - b.dist || a.bacterium.id - b.bacterium.id);
    const fullLimit = st.blastFullTargets > 0 ? st.blastFullTargets : inCircle.length;
    let full = 0;
    let rest = 0;
    let acid = 0;
    const fullDealt: number[] = [];
    const restDealt: number[] = [];
    let fullFar = 0; // расстояние от центра до самой дальней цели с полным уроном и до ближайшей цели со сниженным (только для журнала QA)
    let restNear: number | null = null;
    for (let i = 0; i < inCircle.length; i++) {
      const { bacterium } = inCircle[i];
      if (QA_MODE) {
        if (i < fullLimit) fullFar = inCircle[i].dist;
        else if (restNear === null) restNear = inCircle[i].dist;
      }
      if (i < fullLimit) {
        full++;
        if (this.damageBacterium(bacterium, st, true, st.damage * damageMul)) acid++;
        if (QA_MODE) fullDealt.push(bacterium.lastDealt);
      } else {
        rest++;
        this.damageBacterium(bacterium, st, true, st.damage * damageMul * st.blastRestMul, false, false);
        if (QA_MODE) restDealt.push(bacterium.lastDealt);
      }
    }
    if (QA_MODE) qaLog(this, 'blast', { x, y, radius, hits: inCircle.length, full, rest, acid, fullDealt, restDealt, fullFar, restNear, kills: this.kills - killsBefore, chain: !allowChain });
    if (allowChain && st.chain) this.chains.push({ left: CHAIN_DELAY_SEC, x, y, stats: st });
    // Ключ «Осколки»: осколки летят в ближайшие бактерии вне круга взрыва (не дальше rangeMul радиусов), каждый — доля урона
    if (allowChain && st.shards > 0) {
      const { damageShare, rangeMul } = CONFIG.keyNodes.fizz;
      const hit = new Set(inCircle.map((c) => c.bacterium));
      const near = this.bacteria
        .filter((b) => b.hp > 0 && !hit.has(b) && Math.hypot(b.x - x, b.y - y) - b.radius <= radius * rangeMul)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
        .slice(0, st.shards);
      for (const b of near) this.damageBacterium(b, st, true, st.damage * damageMul * damageShare, false, false);
    }
  }

  /** Вторые взрывы «Цепной» Шипучки. */
  /**
   * Ближайшая к точке бактерия не дальше `reach`; цель, которую удар не ранит (`wardBlocks`), — только если других нет (рикошет Таблетки, центр цепного взрыва:
   * решение владельца 28 октября 2026, сообщение 1, п. 7.1, находки аудита MASTER-0042, 0045).
   */
  private nearestPreferHurt(x: number, y: number, reach: number, st: TowerStats, skip?: Bacterium): Bacterium | null {
    let best: Bacterium | null = null;
    let bestD = Infinity;
    let blocked: Bacterium | null = null;
    let blockedD = Infinity;
    for (const b of this.bacteria) {
      if (b === skip || b.hp <= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d > reach) continue;
      if (wardBlocks(b, st)) {
        if (d < blockedD) [blocked, blockedD] = [b, d];
      } else if (d < bestD) [best, bestD] = [b, d];
    }
    return best ?? blocked;
  }

  private updateChains(dt: number): void {
    this.chains = this.chains.filter((chain) => {
      chain.left -= dt;
      if (chain.left > 0) return true;
      const best = this.nearestPreferHurt(chain.x, chain.y, CHAIN_REACH_PX, chain.stats);
      if (best) this.explode(best.x, best.y, chain.stats, 0.7, 0.6, false);
      return false;
    });
  }

  /** Опыт за погибшую бактерию: её `lifeDamage` (финальный босс с отрицательным — 0) каждой башне, в зоне которой она была; Витамин получает долю опыта башен в своей ауре (`config.xp.vitaminShare`). */
  private awardXp(bacterium: Bacterium): void {
    const points = Math.max(0, bacterium.lifeDamage);
    if (points <= 0) return;
    for (const tower of this.towers) {
      if (!tower.inXpZone(bacterium)) continue;
      tower.xp += points;
      for (const aura of this.towers) {
        if (aura.isAura && Math.hypot(aura.x - tower.x, aura.y - tower.y) <= aura.stats.range) aura.xp += points * CONFIG.xp.vitaminShare;
      }
    }
  }

  private killBacterium(bacterium: Bacterium, by?: TowerStats): void {
    this.awardXp(bacterium);
    this.kills++;
    // «Дефляция»: уровень нового формата — доля дохода волны (уже в награде бактерии); прежний — номинал × economy.rewardMul × множитель волны из economy.rewardCurve; дробная часть копится до целой монеты
    const curve = this.params.plan ? 1 : CONFIG.economy.rewardMul * this.rewardFactor();
    this.rewardPool += bacterium.reward * curve * rewardMul();
    const gain = Math.floor(this.rewardPool + 1e-9);
    this.rewardPool -= gain;
    this.coins += gain;
    if (QA_MODE) qaLog(this, 'kill', { id: bacterium.id, kind: bacterium.kind, gain, coins: this.coins });
    this.effects.burst(bacterium.x, bacterium.y, bacterium.kind);
    if (gain > 0) this.effects.popup(bacterium.x, bacterium.y, t('coinsPopup', { n: gain }));
    sfx.destroy();
    this.removeBacterium(bacterium);
    this.splitIntoChildren(bacterium);
    this.leaveCloud(bacterium);
    if (bacterium.boss) this.bossDefeated(bacterium);
    // Ключ «Разрыв» Ампулы: убитая выстрелом бактерия взрывается с долей урона
    if (by && by.killBurst > 0) this.ampuleBurst(bacterium, by);
    // Ключ «Эпидемия» Антибиотика: яд погибшей переходит на ближайшую
    if (bacterium.poisoned) this.spreadPoison(bacterium);
    this.panel.setCoins(this.coins);
  }

  /** Босс побеждён: бит в записи побед партии; Колония при гибели выпускает бактерий. */
  private bossDefeated(boss: Bacterium): void {
    const plan = this.params.plan;
    const index = plan ? plan.waves.findIndex((w) => w.boss === boss.bossId) : -1;
    if (index >= 0) this.bossBits |= index === plan!.waves.length - 1 ? 1 << BOSS_BIT : 1 << Math.min(BOSS_BIT - 1, Math.floor((index + 1) / 10) - 1);
    // выпуск на доле прочности `burstAt`, пропущенный из-за гибели одним ударом, — при гибели (находка аудита MASTER-0050, решение владельца 28 октября 2026, сообщение 2, п. 5)
    const spec = boss.boss;
    if (spec?.burstAt && !boss.burstDone) {
      boss.burstDone = true;
      this.releaseFrom(boss, spec.burstKind ?? 'coccus', spec.burstCount ?? 0);
    }
    if (boss.boss?.burstOnDeath) this.releaseFrom(boss, boss.boss.burstKind ?? 'coccus', boss.boss.burstCount ?? 0);
    if (QA_MODE) qaLog(this, 'boss', { id: boss.id, boss: boss.bossId, bits: this.bossBits });
  }

  /** Выпускает `count` бактерий вида `kind` на месте `parent` (чуть друг за другом вперёд по дорожке); множитель прочности — волны, в которой вышел родитель. */
  private releaseFrom(parent: Bacterium, kind: BacteriumKind, count: number): void {
    for (let i = 0; i < count; i++) {
      const child = new Bacterium(this, this.bacteriaLayer, kind, parent.edge, parent.s, parent.hpMul, this.childExtra(parent));
      child.moveForward(i * CONFIG.types[kind].radius * 1.6);
      this.bacteria.push(child);
      this.meet(kind);
    }
    if (count > 0) this.effects.flash(parent.x, parent.y, parent.radius * 0.6, COLORS.egg);
  }

  /** Боссы: выпуск бактерий по часам (с учётом фазы), выпуск на доле прочности `burstAt`; палочки рядом с Вожаком делают рывки чаще. */
  private updateBosses(dt: number): void {
    for (const b of this.bacteria) b.dashRate = 1;
    for (const boss of [...this.bacteria]) {
      const spec = boss.boss;
      if (!spec || boss.hp <= 0) continue;
      const plan = boss.spawnPlan;
      if (plan && !boss.held) {
        boss.spawnClock += dt;
        if (boss.spawnClock >= plan.everySec) {
          boss.spawnClock -= plan.everySec;
          this.releaseFrom(boss, plan.kind, plan.count);
        }
      }
      if (spec.burstAt && !boss.burstDone && boss.hp / boss.maxHp <= spec.burstAt) {
        boss.burstDone = true;
        this.releaseFrom(boss, spec.burstKind ?? 'coccus', spec.burstCount ?? 0);
      }
      if (spec.rallyRadius && spec.rallyDashMul) {
        for (const b of this.bacteria) {
          if (b !== boss && b.kind === 'rod' && !b.boss && Math.hypot(b.x - boss.x, b.y - boss.y) <= spec.rallyRadius) b.dashRate = spec.rallyDashMul;
        }
      }
    }
  }

  /** Ключ «Разрыв» Ампулы: взрыв на месте убитой бактерии — радиус `keyNodes.ampule.radiusPx`, доля урона выстрела. */
  private ampuleBurst(dead: Bacterium, st: TowerStats): void {
    const r = CONFIG.keyNodes.ampule.radiusPx;
    this.effects.blast(dead.x, dead.y, r);
    for (const b of [...this.bacteria]) {
      if (b.hp > 0 && Math.hypot(b.x - dead.x, b.y - dead.y) - b.radius <= r) this.damageBacterium(b, { ...st, killBurst: 0 }, true, st.damage * st.killBurst);
    }
  }

  /** Ключ «Эпидемия» Антибиотика: яд погибшей бактерии (если его наложил Антибиотик с ключом) переходит на ближайшую не дальше `keyNodes.antibiotic.rangePx`. */
  private spreadPoison(dead: Bacterium): void {
    if (!dead.epidemic) return;
    let best: Bacterium | null = null;
    let bestD: number = CONFIG.keyNodes.antibiotic.rangePx;
    for (const b of this.bacteria) {
      if (b.hp <= 0) continue;
      const d = Math.hypot(b.x - dead.x, b.y - dead.y);
      if (d <= bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return;
    best.poison(dead.poisonDps, dead.poisonLeft, true);
    this.effects.flash(best.x, best.y, best.radius * 0.7, COLORS.poison);
  }

  /** Токсин при гибели оставляет облако: башни в нём не стреляют. Дошедшая до организма бактерия облака не оставляет (сюда она не попадает). */
  private leaveCloud(bacterium: Bacterium): void {
    const { cloudRadius, cloudSec } = CONFIG.types[bacterium.kind];
    if (cloudRadius <= 0 || cloudSec <= 0) return;
    this.clouds.push(new Cloud(this, this.puddleLayer, bacterium.x, bacterium.y, cloudRadius, cloudSec));
    this.cloudsMade++;
  }

  /** Делящаяся при гибели распадается: первый кокк появляется на её месте, каждый следующий — на splitGapPx дальше вперёд по
   *  дорожке (если место у конца ребра, кокк переходит на следующее ребро, на развилке выбирая путь случайно). */
  private splitIntoChildren(parent: Bacterium): void {
    const { splitCount, splitGapPx } = CONFIG.types[parent.kind];
    if (splitCount <= 0) return;
    this.splits++;
    sfx.split();
    for (let i = 0; i < splitCount; i++) {
      const child = new Bacterium(this, this.bacteriaLayer, SPLITS_INTO, parent.edge, parent.s, parent.hpMul, this.childExtra(parent));
      child.moveForward(i * splitGapPx);
      this.bacteria.push(child);
      this.meet(SPLITS_INTO);
    }
  }

  /** Спора, проходя близко к башне, «глушит» её на несколько секунд; каждую башню одна спора глушит один раз. */
  private applySpores(): void {
    for (const bacterium of this.bacteria) {
      const { disableSec, disableRadius } = CONFIG.types[bacterium.kind];
      if (disableSec <= 0) continue;
      for (const tower of this.towers) {
        if (tower.isDisabled || tower.immune || bacterium.disabledTowers.has(tower)) continue;
        if (Math.hypot(tower.x - bacterium.x, tower.y - bacterium.y) > disableRadius) continue;
        bacterium.disabledTowers.add(tower);
        tower.disable(disableSec);
        this.disables++;
        this.effects.zap(tower.x, tower.y);
        sfx.disabled();
      }
    }
  }

  private removeBacterium(bacterium: Bacterium): void {
    this.bacteria = this.bacteria.filter((b) => b !== bacterium);
    // Убрана с карты (убита или дошла до организма): снаряды в полёте больше не должны считать её живой целью
    bacterium.hp = 0;
    bacterium.destroy();
  }

  /** Бактерии, дошедшие до красной линии организма, исчезают и отнимают жизни. Дробный урон (рой) копится: целая жизнь списывается, когда набралась. */
  private resolveArrivals(): void {
    let damage = 0;
    let lastY = 0;
    for (const bacterium of [...this.bacteria]) {
      if (!bacterium.reachedOrganism) continue;
      lastY = bacterium.y;
      this.leaked++;
      if (bacterium.lifeDamage < 0) {
        // Дошедший босс уровня — поражение сразу (документ дизайна, раздел 7.1)
        this.livesLostByKind[bacterium.kind] = (this.livesLostByKind[bacterium.kind] ?? 0) + this.lives;
        if (QA_MODE) qaLog(this, 'leak', { id: bacterium.id, kind: bacterium.kind, wave: this.waveIdx, damage: this.lives, absorbed: false, boss: bacterium.bossId });
        this.removeBacterium(bacterium);
        if (!STRESS) this.lives = 0;
        this.panel.setLives(this.lives, this.maxLives());
        this.effects.lifeLost();
        sfx.lifeLost();
        this.endGame(false);
        return;
      }
      if (QA_MODE) qaLog(this, 'leak', { id: bacterium.id, kind: bacterium.kind, wave: this.waveIdx, damage: bacterium.lifeDamage, absorbed: this.shieldLeft > 0 });
      if (this.shieldLeft > 0) {
        // «Щит у линии»: бактерия гасится, жизни не отнимаются (для звёзд она считается потерянной жизнью)
        this.shieldLeft--;
        this.shieldAbsorbed += bacterium.lifeDamage;
        this.effects.flash(CONFIG.map.orgW, bacterium.y, 44, COLORS.shield);
        sfx.place();
      } else {
        damage += bacterium.lifeDamage;
        this.livesLostByKind[bacterium.kind] = (this.livesLostByKind[bacterium.kind] ?? 0) + bacterium.lifeDamage;
      }
      this.removeBacterium(bacterium);
    }
    if (damage === 0) return;
    this.lifePool += damage;
    const whole = Math.floor(this.lifePool + 1e-9);
    this.lifePool -= whole;
    if (whole <= 0) {
      // Жизнь ещё не потеряна, но ощутимо: красная вспышка у линии организма
      this.effects.flash(CONFIG.map.orgW, lastY, 36, COLORS.loseLine);
      return;
    }
    // Стресс-сценарий: жизни не убывают (вспышка и тряска остаются — это тоже нагрузка)
    if (!STRESS) this.lives = Math.max(0, this.lives - whole);
    this.panel.setLives(this.lives, this.maxLives());
    this.effects.lifeLost();
    sfx.lifeLost();
    if (this.lives <= 0) this.endGame(false);
  }

  // ---------------------------------------------------------------- ввод

  /** Кнопка башни на панели: выбрать эту башню, а если она уже выбрана — снять выбор. */
  private toggleTower(id: TowerId): void {
    // Вертикальный телефон: поверх игры подсказка «Поверните телефон», касания сквозь неё ничего не делают
    if (this.state !== 'playing' || isPortraitPhone()) return;
    if (!isTowerOpen(id)) {
      this.deny(t('hintLockedTree'));
      return;
    }
    this.deselectTower();
    this.selected = this.selected === id ? null : id;
    this.panel.setSelected(this.selected);
    if (this.selected) this.setGhostArt(this.selected);
    else this.ghost.setVisible(false);
    this.updateHint();
  }

  /** Нижняя подсказка в бою не показывается (решение владельца 25 октября 2026, сообщение 5, п. 3.1: подсказок слияния нет); строка снимается. */
  private updateHint(): void {
    this.panel.setHint(null);
  }

  /** Башня, стоящая в клетке (или null). */
  private towerAt(col: number, row: number): Tower | null {
    return this.towers.find((tower) => tower.col === col && tower.row === row) ?? null;
  }

  /**
   * Тап по карте. Идёт выбор пары для слияния: по подсвеченной башне — слить, мимо — отмена. Иначе тап по поставленной башне выбирает её
   * (карточка в панели); по уже выбранной башне с лучом — поворачивает её на 45° (по правой половине — по часовой, по левой — против).
   * Тап по пустой клетке: если выбрана башня на панели — ставим её; если нет — снимаем выбор башни.
   */
  private onTap(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = worldToCell(world.x, world.y);
    const own = cell ? this.towerAt(cell[0], cell[1]) : null;
    if (this.mergeMode && this.selectedTower) {
      if (own && this.mergeCandidates(this.selectedTower).includes(own)) this.doMerge(this.selectedTower, own);
      else this.cancelMerge();
      return;
    }
    if (own) {
      if (own === this.selectedTower && own.isBeam) {
        own.rotateAim(world.x < own.x ? -1 : 1);
        sfx.rotate();
        this.refreshCard();
      } else {
        this.selectTower(own);
      }
      return;
    }
    if (!this.selected) {
      if (this.selectedTower) this.deselectTower();
      return;
    }
    if (!cell) {
      this.deny(t('hintCantBuild'));
      return;
    }
    this.tryPlace(this.selected, cell[0], cell[1]);
  }

  // ---------------------------------------------------------------- выбор башни, слияние, мутации, продажа

  /** Выбрать поставленную башню: золотое кольцо, карточка в панели; выбор башни для постройки на панели снимается. */
  private selectTower(tower: Tower): void {
    if (this.selected) {
      this.selected = null;
      this.panel.setSelected(null);
      this.ghost.setVisible(false);
    }
    if (this.selectedTower && this.selectedTower !== tower) this.selectedTower.setSelected(false);
    this.cancelMerge(false);
    this.selectedTower = tower;
    tower.setSelected(true);
    sfx.select();
    this.refreshCard();
    this.updateHint();
    // Карточка лежит на карте внизу: если башня оказалась под ней или вплотную, камера сдвигается вверх, чтобы башня осталась на виду
    const onScreen = this.rig.worldToScreen(tower.x, tower.y);
    const limit = this.panel.cardTop() - 46;
    if (onScreen.y > limit) this.rig.panBy(0, limit - onScreen.y);
  }

  private deselectTower(): void {
    this.cancelMerge(false);
    this.selectedTower?.setSelected(false);
    this.selectedTower = null;
    this.panel.hideCard();
    this.updateHint();
  }

  /** С какими башнями можно слить эту: другие того же вида и уровня в радиусе слияния `mergeRadiusPx` (если уровень не высший и мутация выбрана у обеих). */
  private mergeCandidates(tower: Tower): Tower[] {
    if (tower.level >= mergeCap(currentLevel()) || tower.pendingTier !== null) return [];
    return this.towers.filter(
      (other) =>
        other !== tower &&
        other.id === tower.id &&
        other.level === tower.level &&
        other.pendingTier === null &&
        Math.hypot(other.x - tower.x, other.y - tower.y) <= CONFIG.mergeRadiusPx,
    );
  }

  /** Кнопка «Слить» / «Отмена» в карточке. */
  private toggleMerge(): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    if (this.mergeMode) {
      this.cancelMerge();
      return;
    }
    const candidates = this.mergeCandidates(this.selectedTower);
    if (candidates.length === 0) return;
    this.mergeMode = true;
    for (const tower of this.towers) tower.setMergeCandidate(false);
    for (const tower of candidates) tower.setMergeCandidate(true);
    sfx.select();
    this.refreshCard();
    this.updateHint();
    // Полная карточка сменилась узкой полосой: башня и все кандидаты должны остаться выше неё (камера сдвигается вверх, если кто-то оказался под полосой)
    const limit = this.panel.cardTop() - 40;
    let lowest = -Infinity;
    for (const tower of [this.selectedTower, ...candidates]) lowest = Math.max(lowest, this.rig.worldToScreen(tower.x, tower.y).y);
    if (lowest > limit) this.rig.panBy(0, limit - lowest);
  }

  private cancelMerge(update = true): void {
    if (!this.mergeMode) return;
    this.mergeMode = false;
    for (const tower of this.towers) tower.setMergeCandidate(false);
    if (update) {
      this.refreshCard();
      this.updateHint();
    }
  }

  /** Слияние: `target` становится уровнем выше (его направление луча остаётся, мутации обеих башен складываются), `source` исчезает, клетка освобождается. Бесплатно. */
  private doMerge(source: Tower, target: Tower): void {
    this.merges++;
    this.cancelMerge(false);
    const carried = [...source.picks];
    const carriedXp = source.xp;
    this.removeTower(source);
    target.upgrade(carried, carriedXp);
    this.effects.merged(target.x, target.y);
    sfx.merge();
    this.selectedTower = null;
    this.selectTower(target);
  }

  /** Убирает башню с карты (слияние или продажа): клетка свободна, её очередь луча обрывается. */
  private removeTower(tower: Tower): void {
    this.towers = this.towers.filter((other) => other !== tower);
    this.occupied.delete(cellKey(tower.col, tower.row));
    this.bursts = this.bursts.filter((burst) => burst.tower !== tower);
    if (this.selectedTower === tower) {
      this.selectedTower = null;
      this.panel.hideCard();
    }
    tower.destroy();
  }

  /** Сколько монет вернёт продажа: доля уплаченной цены (с учётом скидки) × число обычных башен, «вложенных» в эту (2^(уровень−1)); долю повышает улучшение «Утилизация». */
  private sellValue(tower: Tower): number {
    return Math.round(towerPrice(tower.id) * 2 ** (tower.level - 1) * (CONFIG.economy.sellRefund + refundBonus()));
  }

  private sellSelected(): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    const tower = this.selectedTower;
    const value = this.sellValue(tower);
    this.cancelMerge(false);
    this.coins += value;
    this.sells++;
    this.effects.popup(tower.x, tower.y - 30, t('coinsPopup', { n: value }));
    this.effects.placed(tower.x, tower.y);
    this.removeTower(tower);
    sfx.sell();
    this.panel.setCoins(this.coins);
    this.updateHint();
    for (const other of this.towers) other.setMergeCandidate(false);
  }

  private pickMutation(index: number): void {
    if (this.state !== 'playing' || !this.selectedTower) return;
    if (!this.selectedTower.pickMutation(index)) return;
    this.mutationsPicked++;
    this.effects.merged(this.selectedTower.x, this.selectedTower.y);
    sfx.mutation();
    this.refreshCard();
  }

  private rotateSelected(dir: 1 | -1): void {
    if (this.state !== 'playing' || !this.selectedTower?.isBeam) return;
    this.selectedTower.rotateAim(dir);
    sfx.rotate();
    this.refreshCard();
  }

  /**
   * Вариант мутации на карточке выбора (решение владельца 20 октября 2026, сообщение 2, п. 3.1): что изменится — «было → станет» по `computeStats` (числа без ауры, паразита и «Лихорадки»),
   * и потолок, в который числа упрутся после выбора (документ дизайна, п. 4.2). Ничего не меняется (копия с долей 0, второй «включатель») — «без изменений».
   */
  private mutationChange(tower: Tower, pickId: string): string {
    const a = computeStats(tower.id, tower.level, tower.picks);
    const b = computeStats(tower.id, tower.level, [...tower.picks, pickId]);
    const n = (x: number): string => num(Math.round(x * 10) / 10);
    const n2 = (x: number): string => num(Math.round(x * 100) / 100);
    const yesNo = (x: number): string => t(x > 0 ? 'chgYes' : 'chgNo');
    const spiralMul = CONFIG.towerLevels[Math.min(Math.max(1, tower.level), MAX_TOWER_LEVEL) - 1].damageMul;
    const rows: [TextKey, number, number, (x: number) => string][] = [
      ['chgHit', a.damage, b.damage, hitNum],
      ['chgTargets', 1 + a.extraTargets, 1 + b.extraTargets, String],
      ['chgPulses', a.beamPulses, b.beamPulses, String],
      // прибавка «Спирали»: каждый следующий удар очереди сильнее на столько (растёт с уровнем башни; находка аудита MASTER-0005, сообщение 1 от 28 октября 2026, п. 7.1)
      ['chgSpiral', a.spiral * spiralMul, b.spiral * spiralMul, hitNum],
      ['chgBeams', a.secondBeam ? 2 : 1, b.secondBeam ? 2 : 1, String],
      ['chgPause', a.cooldownMs / 1000, b.cooldownMs / 1000, n2],
      ['chgBlast', a.blastRadius, b.blastRadius, (x) => String(Math.round(x))],
      ['chgPuddle', a.puddleRadius, b.puddleRadius, (x) => String(Math.round(x))],
      ['chgPuddles', a.puddleCount, b.puddleCount, String],
      ['chgPuddleSec', a.puddleSec, b.puddleSec, n],
      ['chgSlow', a.slowFactor, b.slowFactor, n2],
      ['chgPoison', a.poisonPerSec, b.poisonPerSec, n],
      ['chgDotHp', a.dotPerSec * a.dotSec, b.dotPerSec * b.dotSec, n],
      ['chgDotSec', a.dotSec, b.dotSec, n],
      ['chgAcid', a.acidMul, b.acidMul, n2],
      ['chgCone', a.coneDeg, b.coneDeg, (x) => String(Math.round(x))],
      ['chgRange', a.range, b.range, (x) => String(Math.round(x))],
      ['chgAura', a.auraMul, b.auraMul, n2],
      ['chgFreeze', a.freezeSec, b.freezeSec, n],
      ['chgThawSlow', a.thawSlowSec, b.thawSlowSec, n],
      ['chgAuraDamage', a.auraDamageMul, b.auraDamageMul, n2],
      ['chgTrap', a.trapSec, b.trapSec, n],
      ['chgTrapHp', a.trapDps * a.trapSec, b.trapDps * b.trapSec, n],
      // «Включатели» (бронебойность, самая прочная цель, цепной взрыв) числами не видны — «нет → да»
      ['chgPierce', Number(a.armorPierce), Number(b.armorPierce), yesNo],
      ['chgToughest', Number(a.toughest), Number(b.toughest), yesNo],
      ['chgChain', Number(a.chain), Number(b.chain), yesNo],
    ];
    const parts = rows.filter(([, x, y, f]) => f(x) !== f(y)).map(([key, x, y, f]) => t(key, { a: f(x), b: f(y) }));
    // потолка в строке нет (решение владельца 25 октября 2026, сообщение 5, п. 3.1: знак «потолок» убран)
    return parts.length > 0 ? parts.join(', ') : t('chgNone');
  }

  /**
   * Строка «Пауза» карточки — действующая пауза, как в бою (та же, по которой считается «Урон в секунду»): с аурой Витамина и «Лихорадкой» короче, с присосавшимся паразитом длиннее;
   * при любом из них — множитель и причина в скобках, как у паразита (решение владельца 20 октября 2026, сообщение 2, п. 1.6).
   */
  private pauseLine(tower: Tower): string {
    const n = (x: number): string => num(Math.round(x * 10) / 10);
    const base = tower.stats.cooldownMs / 1000;
    const fever = this.feverLeft > 0 ? CONFIG.abilities.fever.cooldownMul : 1;
    const why: string[] = [];
    if (tower.auraMul / fever < 1 - 1e-9) why.push(t('towerVitamin'));
    if (fever < 1 && tower.auraMul < 1 - 1e-9) why.push(t('feverName'));
    if (why.length === 0) return tower.latchMul > 1 ? t('statCooldownLatched', { n: n(base * tower.latchMul), m: num(tower.latchMul) }) : t('statCooldown', { n: n(base) });
    if (tower.latchMul > 1) why.push(t('statWhyParasite'));
    const mul = tower.auraMul * tower.latchMul;
    return t('statCooldownBoost', { n: n(base * mul), m: num(Math.round(mul * 100) / 100), why: why.join(', ') });
  }

  /**
   * Числа для карточки: у каждой башни свои строки. «Урон N» — урон одного выстрела (у Шприца — урон удара и число ударов, у Лампы — за один тик конуса),
   * у яда и ловушки — урон за одно применение (решение владельца 25 октября 2026, сообщение 5, п. 3.2).
   */
  private cardStats(tower: Tower): string[] {
    const st = tower.stats;
    const n = (x: number): string => num(Math.round(x * 10) / 10);
    const pause = this.pauseLine(tower);
    const hit = t('statHit', { n: hitNum(st.damage) });
    if (st.targeting === 'puddle') return [t('statPuddle', { r: Math.round(st.puddleRadius), s: n(st.puddleSec) }), t('statSlow', { n: n(st.slowFactor) }), pause];
    if (st.targeting === 'beam') {
      const pulses = t('statBeamHit', { n: hitNum(st.damage), k: Math.max(1, st.beamPulses) });
      return st.secondBeam ? [pulses, t('statBeams', { n: 2 }), pause] : [pulses, pause];
    }
    if (st.targeting === 'area') return [hit, t('statBlast', { r: Math.round(st.blastRadius) }), pause];
    if (st.targeting === 'cone') return [hit, t('statCone', { a: Math.round(st.coneDeg), r: Math.round(st.range) }), pause];
    if (st.targeting === 'aura') {
      const aura = tower.latchMul > 1 ? 1 - (1 - st.auraMul) / tower.latchMul : st.auraMul;
      return [t(tower.latchMul > 1 ? 'statAuraLatched' : 'statAura', { n: num(Math.round(aura * 100) / 100) }), t('statRange', { n: Math.round(st.range) })];
    }
    if (st.targeting === 'freeze') return [t('statFreeze', { n: n(st.freezeSec) }), pause, t('statRange', { n: Math.round(st.range) })];
    if (st.targeting === 'trap') return [t('statTrap', { s: n(st.trapSec), n: n(st.trapDps * st.trapSec) }), pause, t('statRange', { n: Math.round(st.range) })];
    if (st.targeting === 'poison') return [t('statPoison', { n: n(st.dotPerSec * st.dotSec), s: n(st.dotSec) }), pause, t('statRange', { n: Math.round(st.range) })];
    return [hit, pause, t('statRange', { n: Math.round(st.range) })];
  }

  /** Перерисовать карточку выбранной башни (или скрыть, если башня не выбрана). */
  private refreshCard(): void {
    const tower = this.selectedTower;
    if (!tower) {
      this.panel.hideCard();
      return;
    }
    const label = (id: string): { name: string; desc: string } => {
      const key = id.charAt(0).toUpperCase() + id.slice(1);
      // «Спираль»: прибавка к удару зависит от уровня башни (spiral × множитель урона уровня, как в `beamPulse`) — в описании стоит число, которое будет в бою
      const spiral = mutationById(tower.id, id)?.spiral;
      // при ключе `mutationCaps.spiralInCap` прибавка «Спирали» ужимается потолком: в описании — настоящая прибавка удара башни с этой мутацией (с выбранными ранее)
      const levelMul = CONFIG.towerLevels[Math.min(tower.level, CONFIG.towerLevels.length) - 1].damageMul;
      const step = spiral
        ? CONFIG.mutationCaps.spiralInCap > 0
          ? computeStats(tower.id, tower.level, tower.picks.includes(id) ? tower.picks : [...tower.picks, id]).spiral * levelMul
          : spiral * levelMul
        : 0;
      const desc = spiral ? t(`mutd${key}` as TextKey, { n: num(Math.round(step * 10) / 10) }) : t(`mutd${key}` as TextKey);
      return { name: t(`mut${key}` as TextKey), desc };
    };
    this.cardLatch = tower.latchMul;
    this.cardAura = tower.auraMul;
    const tier = tower.pendingTier;
    const merge = tower.level >= MAX_TOWER_LEVEL ? 'max' : tower.level >= mergeCap(currentLevel()) ? 'cap' : this.mergeMode ? 'active' : this.mergeCandidates(tower).length > 0 ? 'ready' : 'none';
    this.panel.showCard({
      id: tower.id,
      name: t(`tower${tower.id.charAt(0).toUpperCase()}${tower.id.slice(1)}` as TextKey),
      level: tower.level,
      maxLevel: MAX_TOWER_LEVEL,
      stats: this.cardStats(tower),
      pending: tier === null ? null : mutationOptions(tower.id, tier).map((m) => ({ ...label(m.id), change: this.mutationChange(tower, m.id) })),
      picked: [...new Map(tower.picks.map((id) => [id, tower.picks.filter((p) => p === id).length] as const))].map(([id, n]) => {
        const l = label(id);
        return n > 1 && mutationStacks(tower.id, id) ? { ...l, name: `${l.name} ×${n}` } : l;
      }),
      beam: tower.isBeam,
      merge,
      sell: this.sellValue(tower),
      mergeHint: null,
    });
  }

  private tryPlace(id: TowerId, col: number, row: number): void {
    if (!isTowerOpen(id)) return;
    const price = towerPrice(id);
    const key = cellKey(col, row);
    if (PATH_TILES.has(key) || BLOCKED_TILES.has(key) || this.occupied.has(key)) {
      this.deny(t('hintCantBuild'));
      return;
    }
    if (this.coins < price) {
      this.panel.flashCoins();
      this.deny(t('hintNoCoins'));
      return;
    }
    const center = tileCenter(col, row);
    this.coins -= price;
    this.occupied.add(key);
    this.towers.push(new Tower(this, this.towerLayer, id, col, row, center.x, center.y));
    this.builds++;
    this.effects.placed(center.x, center.y);
    sfx.place();
    this.panel.setCoins(this.coins);
    this.updateHint();
    this.ghost.setVisible(false);
    this.refreshCard();
  }

  private deny(message: string): void {
    sfx.denied();
    this.panel.toast(message);
  }

  /** Мышь над картой: показываем «призрак» выбранной башни и её радиус. */
  private onHover(sx: number, sy: number): void {
    const world = this.rig.screenToWorld(sx, sy);
    const cell = this.selected ? worldToCell(world.x, world.y) : null;
    if (!this.selected || !cell || PATH_TILES.has(cellKey(cell[0], cell[1])) || BLOCKED_TILES.has(cellKey(cell[0], cell[1])) || this.occupied.has(cellKey(cell[0], cell[1]))) {
      this.ghost.setVisible(false);
      return;
    }
    const center = tileCenter(cell[0], cell[1]);
    const half = (CONFIG.map.tile - 6) / 2;
    this.ghost.setPosition(center.x, center.y).setVisible(true);
    this.ghostRange.clear();
    this.ghostAim.clear();
    const cfg = computeStats(this.selected, 1, []);
    if (cfg.targeting === 'beam') {
      // Луч: вместо круга радиуса — пунктир по лучшему направлению (так башня встанет, если не поворачивать)
      const angle = aimAngle(defaultAim(cfg, center.x, center.y));
      drawAimLine(this.ghostAim, beamReach(center.x, center.y, angle, cfg.beamLengthPx), 0.8);
      this.ghostAim.setRotation(angle);
      this.ghostBarrel.setRotation(angle);
    } else {
      this.ghostRange.fillStyle(COLORS.ghost, 0.1).fillCircle(0, 0, cfg.range);
      this.ghostRange.lineStyle(2.5, COLORS.ghostEdge, 1).strokeCircle(0, 0, cfg.range);
    }
    this.ghostCell.clear();
    this.ghostCell.fillStyle(COLORS.ghost, 0.25).fillRoundedRect(-half, -half, half * 2, half * 2, 10);
    this.ghostCell.lineStyle(3, COLORS.ghostEdge, 1).strokeRoundedRect(-half, -half, half * 2, half * 2, 10);
  }

  private buildGhost(): void {
    this.ghostRange = this.add.graphics();
    this.ghostAim = this.add.graphics();
    this.ghostCell = this.add.graphics();
    this.ghostArt = this.add.container(0, 0).setAlpha(0.65);
    this.ghostBarrel = createTowerArt(this, this.ghostArt);
    this.ghost = this.add.container(0, 0, [this.ghostRange, this.ghostAim, this.ghostCell, this.ghostArt]).setVisible(false);
    this.ghostLayer.add(this.ghost);
  }

  /** «Призрак» рисуется как выбранная башня. */
  private setGhostArt(id: TowerId): void {
    this.ghostArt.removeAll(true);
    this.ghostBarrel = createTowerArt(this, this.ghostArt, id);
  }

  /** Скорость игры из прошлой партии (браузер запоминает выбор игрока); без хранилища — обычная. */
  private loadSpeed(): number {
    try {
      const saved = Number(window.localStorage.getItem('pvb.speed'));
      if (CONFIG.ui.speeds.includes(saved)) return saved;
    } catch {
      /* хранилище недоступно (приватное окно и т. п.) — играем на обычной скорости */
    }
    return CONFIG.ui.speeds[0];
  }

  /** Кнопка скорости: ×1 → ×2 → ×3 → ×1 …; выбор запоминается. */
  private cycleSpeed(): void {
    if (this.state !== 'playing' || isPortraitPhone()) return;
    const speeds = CONFIG.ui.speeds;
    this.userSpeed = speeds[(Math.max(0, speeds.indexOf(this.userSpeed)) + 1) % speeds.length];
    this.panel.setSpeed(this.userSpeed);
    try {
      window.localStorage.setItem('pvb.speed', String(this.userSpeed));
    } catch {
      /* не страшно: просто не запомнится */
    }
  }

  /** Кнопка «Начать волну»: пропускает ожидание до волны, за каждую пропущенную секунду — монеты. */
  private startWaveNow(): void {
    if (this.state !== 'playing' || isPortraitPhone()) return;
    if (this.phase !== 'countdown' && this.phase !== 'pause') return;
    this.coins += this.skipBonus();
    this.panel.setCoins(this.coins);
    this.phaseTimer = 0;
  }

  /** Сколько монет даст досрочный вызов волны прямо сейчас. */
  private skipBonus(): number {
    return Math.max(0, Math.floor(this.phaseTimer * CONFIG.waves.skipBonusPerSec));
  }

  /** Любое касание экрана: на паузе — продолжить, на плашке — закрыть её. После конца уровня тап по экрану ничего не делает: заново — только кнопкой. */
  private onScreenTap(pointer?: Phaser.Input.Pointer): void {
    if (isPortraitPhone()) return;
    const now = performance.now();
    // Тап по кнопке меню паузы игру сам не возобновляет (кнопка делает своё дело; «Продолжить» возобновляет сама)
    for (const b of [this.pauseResumeButton, this.pauseMenuButton, this.pauseAlmanacButton, this.pauseSoundButton, this.pauseRestartButton]) {
      if (this.state === 'paused' && b && pointer && Math.abs(pointer.x - b.x) <= b.w / 2 && Math.abs(pointer.y - b.y) <= b.h / 2) return;
    }
    if (this.state === 'paused' && now >= this.resumeAllowedAt) this.togglePause();
  }

  /** «Альманах» с паузы: экран альманаха ложится поверх приостановленной партии, «Назад» возвращает на паузу. */
  private openAlmanac(): void {
    if (this.state !== 'paused' || performance.now() < this.resumeAllowedAt) return;
    this.scene.launch('Almanac', { from: 'game' });
    this.scene.pause();
  }

  /**
   * «В меню» с паузы (решение владельца 20 октября 2026, сообщение 2, п. 1.1–1.2): после хотя бы одной пройденной волны — попытка без экрана конца уровня: очки ДНК только за пройденные волны
   * (нижней границы нет), лучшая волна уровня, строка итога с пометкой выхода в журнал, счётчик попыток +1; звёзд нет. Без пройденных волн — не попытка: ни ДНК, ни строки, ни счётчика.
   */
  private leaveToMenu(): void {
    if (this.state !== 'paused' || performance.now() < this.resumeAllowedAt) return;
    // волна засчитана, если она вся вышла и поле пустое — пауза между волнами (находка аудита MASTER-0001, решение владельца 28 октября 2026, сообщение 1, п. 7.1)
    const cleared = Math.max(0, this.phase === 'pause' && this.bacteria.length === 0 ? this.waveIdx : this.waveIdx - 1);
    if (!this.dnaAwarded && cleared >= 1) {
      this.dnaAwarded = true;
      this.dnaReplay = isLevelBeaten(currentLevel());
      this.dnaGained = awardDna(this.dnaInput(cleared, false));
      this.stars = 0;
      this.starDna = recordResult(currentLevel(), cleared, 0).starDna;
      this.attemptText = this.buildAttemptLine(false, true);
      finishAttempt(currentLevel(), this.attemptText);
    }
    if (QA_MODE) qaLog(this, 'menuExit', { cleared, dna: this.dnaAwarded ? this.dnaGained : 0, attempt: this.dnaAwarded });
    this.scene.start('Menu');
  }

  /** Строка итога попытки (src/attempt.ts): номер попытки — до записи этой, покупки — с конца прошлой; `exit` — выход в меню с паузы (пометка вместо «гибель»). */
  private buildAttemptLine(won: boolean, exit: boolean): string {
    const level = currentLevel();
    const waves: [number, number | null][] = [];
    for (let w = 10; w <= this.waveTotal(); w += 10) waves.push([w, this.coinsAtWave.get(w) ?? null]);
    return attemptLine({
      level,
      attempt: attemptNumber(level),
      won,
      exit,
      wave: this.waveIdx,
      waveTotal: this.waveTotal(),
      stars: this.stars,
      livesLeft: this.lives,
      livesMax: this.maxLives(),
      speedSec: this.speedSec,
      elapsedSec: this.elapsed,
      towers: this.towers.map((tower) => ({ id: tower.id, level: tower.level })),
      merges: this.merges,
      mutations: this.mutationsPicked,
      builds: this.builds,
      sells: this.sells,
      coinsAtWave: waves,
      dna: this.dnaGained + this.starDna,
      entry: this.entryLevels,
      bought: boughtSinceLast(),
    });
  }

  /** Итог партии для очков ДНК: пройдено волн, победа, повтор пройденного уровня, остаток монет, побеждённые боссы, «без потерь». */
  private dnaInput(cleared: number, won: boolean): DnaInput {
    const lost = Math.max(0, this.maxLives() - this.lives) + this.lifePool + this.shieldAbsorbed;
    return {
      level: currentLevel(),
      waves: cleared,
      won,
      replay: isLevelBeaten(currentLevel()),
      coinsLeft: Math.floor(this.coins),
      bossBits: this.bossBits,
      flawless: won && lost <= 1e-9,
      hasBoss: Boolean(this.params.plan?.waves.some((w) => w.boss)),
    };
  }

  /**
   * Пауза по событию площадки `game_api_pause` (реклама, смена вкладки): ставит идущую партию на паузу и запоминает, что паузу поставила площадка. Паузу игрока кнопкой площадка не меняет.
   * Ставится и в портретной ориентации: телефон повернули во время рекламы — партия стоит до `game_api_resume` (находка аудита MASTER-0002, сообщение 1 от 28 октября 2026, п. 7.1).
   */
  pauseByPlatform(): void {
    if (this.state !== 'playing') return;
    this.togglePause(true);
    this.pausedByPlatform = (this.state as State) === 'paused';
  }

  /** Событие площадки `game_api_resume` (п. 1.3 требований): снимает паузу, которую поставила площадка; пауза, поставленная игроком кнопкой, остаётся. */
  resumeByPlatform(): void {
    if (this.pausedByPlatform && this.state === 'paused') this.togglePause(true);
    this.pausedByPlatform = false;
  }

  /** `platform` — пауза и снятие по событию площадки: работают и в портретной ориентации (кнопки игрока в портрете не действуют). */
  private togglePause(platform = false): void {
    if (!platform && isPortraitPhone()) return;
    if (this.state === 'playing') {
      gameplay(false);
      this.state = 'paused';
      this.resumeAllowedAt = performance.now() + 250;
      this.ghost.setVisible(false);
      this.showOverlay(t('paused'), TEXT_COLORS.accent, '');
      // Меню паузы: «Продолжить» по центру, ниже два ряда по 76 px — «Альманах» и «Звук», затем «Заново» и «В меню»; тап по свободному месту экрана тоже продолжает игру
      this.pauseResumeButton = this.addEndButton(W / 2, H / 2 + 20, 320, 76, t('resumeBtn'), 0x2a8a4a, COLORS.merge, () => {
        if (performance.now() >= this.resumeAllowedAt) this.togglePause();
      });
      this.pauseAlmanacButton = this.addEndButton(W / 2 - 180, H / 2 + 110, 320, 76, t('almanacBtn'), 0x2a3550, 0x4a5c82, () => this.openAlmanac());
      const sound = this.addLabeledButton(W / 2 + 180, H / 2 + 110, 320, 76, t(sfx.muted ? 'soundOff' : 'soundOn'), 0x2a3550, 0x4a5c82, () => {
        sfx.setMuted(!sfx.muted);
        sound.label.setText(t(sfx.muted ? 'soundOff' : 'soundOn'));
      }, 30);
      this.pauseSoundButton = sound.rect;
      this.pauseRestartButton = this.addEndButton(W / 2 - 180, H / 2 + 200, 320, 76, t('restart'), 0x2a3550, 0x4a5c82, () => {
        if (performance.now() >= this.resumeAllowedAt) this.scene.restart();
      });
      this.pauseMenuButton = this.addEndButton(W / 2 + 180, H / 2 + 200, 320, 76, t('toMenu'), 0x2a3550, 0x4a5c82, () => this.leaveToMenu());
    } else if (this.state === 'paused') {
      gameplay(true);
      this.pausedByPlatform = false;
      this.state = 'playing';
      this.resumeFrame = this.game.loop.frame;
      this.overlay?.destroy();
      this.overlay = null;
      this.pauseResumeButton = null;
      this.pauseMenuButton = null;
      this.pauseAlmanacButton = null;
      this.pauseSoundButton = null;
      this.pauseRestartButton = null;
    }
  }

  // ---------------------------------------------------------------- плашки с описанием (игра на паузе)

  // ---------------------------------------------------------------- стресс-сценарий (замер скорости)




  /** В начале уровня: пауза перед 1-й волной длиннее, если в ней выходит незнакомый вид. Уведомление «Открыта башня» — на экране «Улучшения» при покупке узла (конфликт 3 документа дизайна, принят владельцем). */
  private announceStart(): void {
    this.extendPauseForNewKinds(0);
    this.announceBoss(0);
  }

  // ---------------------------------------------------------------- «Лихорадка» и полоса босса

  /** Кнопка «Лихорадки» (узел древа куплен): круг в правом верхнем углу окна карты; тап включает умение, если оно готово. */
  private buildFeverButton(): void {
    this.feverGfx = this.add.graphics().setDepth(98);
    this.feverText = this.add.text(FEVER_BTN.x, FEVER_BTN.y + 1, '', this.textStyle(fs(20, 24))).setOrigin(0.5).setDepth(98.5);
    this.add
      .zone(FEVER_BTN.x, FEVER_BTN.y, FEVER_BTN.r * 2 + 8, FEVER_BTN.r * 2 + 8)
      .setDepth(98.6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.useFever());
    this.refreshFeverButton();
  }

  /** Включить «Лихорадку»: все башни стреляют вдвое чаще `durationSec`, перезарядка `rechargeSec` (отсчёт с начала действия). */
  private useFever(): void {
    if (this.state !== 'playing' || isPortraitPhone() || !feverOwned() || this.feverWait > 0) return;
    const f = CONFIG.abilities.fever;
    this.feverLeft = f.durationSec;
    this.feverWait = f.rechargeSec;
    this.feverUses++;
    sfx.mutation();
    if (QA_MODE) qaLog(this, 'fever', { uses: this.feverUses });
  }

  private updateFever(dt: number): void {
    if (this.feverLeft > 0) this.feverLeft = Math.max(0, this.feverLeft - dt);
    if (this.feverWait > 0) this.feverWait = Math.max(0, this.feverWait - dt);
  }

  /** Кнопка «Лихорадки»: готова — яркий круг со значком; действует — оранжевое кольцо и оставшиеся секунды; перезаряжается — тёмный круг, сектор готовности и секунды. */
  private refreshFeverButton(): void {
    const g = this.feverGfx;
    if (!g || !this.feverText) return;
    const f = CONFIG.abilities.fever;
    const state = this.feverLeft > 0 ? 'on' : this.feverWait > 0 ? 'wait' : 'ready';
    const sec = state === 'on' ? Math.ceil(this.feverLeft) : state === 'wait' ? Math.ceil(this.feverWait) : 0;
    const key = `${state}|${sec}`;
    if (key === this.feverKey) return;
    this.feverKey = key;
    const { x, y, r } = FEVER_BTN;
    g.clear();
    g.fillStyle(state === 'wait' ? 0x2a3550 : 0x8a2a1a, 1).fillCircle(x, y, r);
    if (state === 'wait') {
      const done = 1 - this.feverWait / f.rechargeSec;
      g.fillStyle(0x8a2a1a, 0.8).slice(x, y, r, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2, false).fillPath();
    }
    g.lineStyle(5, state === 'on' ? COLORS.gold : state === 'ready' ? 0xff8a3a : 0x4a5c82, 1).strokeCircle(x, y, r);
    // Значок — термометр (рисуется кодом)
    if (state === 'ready') {
      g.fillStyle(0xffffff, 1).fillRoundedRect(x - 5, y - 22, 10, 30, 5).fillCircle(x, y + 12, 9);
      g.fillStyle(0xff3a2a, 1).fillRect(x - 2, y - 8, 4, 18).fillCircle(x, y + 12, 6);
    }
    this.feverText.setText(state === 'ready' ? '' : String(sec));
  }

  /** Полоса прочности босса вверху окна карты: имя, заливка по доле прочности и отметки фаз; без босса на поле — скрыта. */
  private refreshBossBar(): void {
    const boss = this.bacteria.find((b) => b.boss && b.hp > 0);
    if (!boss || !boss.boss) {
      if (this.bossBarKey !== '') {
        this.bossBarKey = '';
        this.bossBarGfx.setVisible(false);
        this.bossBarText.setVisible(false);
      }
      return;
    }
    const share = Math.max(0, boss.hp / boss.maxHp);
    const key = `${boss.id}|${Math.round(share * 300)}|${boss.shielded}`;
    if (key === this.bossBarKey) return;
    this.bossBarKey = key;
    const { x, y, w, h } = BOSS_BAR;
    const g = this.bossBarGfx.setVisible(true);
    g.clear();
    g.fillStyle(0x000000, 0.65).fillRoundedRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, 6);
    g.fillStyle(boss.shielded ? COLORS.iceEdge : boss.boss.color, 1).fillRect(x - w / 2, y - h / 2, w * share, h);
    g.lineStyle(2, 0xffffff, 0.9).strokeRect(x - w / 2, y - h / 2, w, h);
    const marks = [...(boss.boss.burstAt ? [boss.boss.burstAt] : []), ...(boss.boss.phases ?? []).map((p) => p.below)];
    g.lineStyle(3, 0xffffff, 1);
    for (const m of marks) g.lineBetween(x - w / 2 + w * m, y - h / 2 - 4, x - w / 2 + w * m, y + h / 2 + 4);
    const id = boss.bossId!;
    this.bossBarText.setText(t(`boss${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey)).setVisible(true);
  }

  /** Перед волной с номером `index` (с нуля): если в ней выходит тип бактерий, который игрок ещё не встречал, пауза перед ней длиннее (уведомления о типе нет). */
  private extendPauseForNewKinds(index: number): void {
    if (index >= this.waveTotal()) return;
    const fresh = this.waveKinds(index).some((kind) => !wasMet(`b:${kind}`));
    if (fresh) this.phaseTimer += CONFIG.waves.newTypePauseSec;
  }

  // ---------------------------------------------------------------- конец уровня

  private endGame(won: boolean): void {
    this.state = won ? 'won' : 'lost';
    gameplay(false);
    this.restartAllowedAt = performance.now() + CONFIG.gameOver.restartLockMs;
    this.ghost.setVisible(false);
    this.panel.clearToasts(); // уведомление (например, «Новая бактерия») гаснет, когда показывается экран победы или проигрыша
    // Снаряды в полёте не должны «зависать» под экраном конца уровня
    for (const projectile of this.projectiles) projectile.destroy();
    this.projectiles = [];
    for (const shot of this.groundShots) shot.destroy();
    this.groundShots = [];
    this.bursts = [];
    this.chains = [];
    this.deselectTower();
    // Какая башня стояла на поле больше всех — на экране «Улучшения» её ветка получает метку «рекомендуем»
    const built: Record<string, number> = {};
    for (const tower of this.towers) built[tower.id] = (built[tower.id] ?? 0) + 2 ** (tower.level - 1);
    setLastBuilt(built);
    if (won) sfx.win();
    else sfx.lose();
    // Очки ДНК за партию начисляются один раз: за каждую пройденную волну (при проигрыше — без текущей), добавка за победу и перевод остатка монет (только при победе)
    if (!this.dnaAwarded) {
      this.dnaAwarded = true;
      const cleared = won ? this.waveTotal() : Math.max(0, this.waveIdx - 1);
      this.dnaReplay = isLevelBeaten(currentLevel());
      const coinsLeft = Math.floor(this.coins);
      const input = this.dnaInput(cleared, won);
      const parts = dnaParts(input);
      this.dnaGained = awardDna(input);
      // Звёзды по потерянным жизням (docs/stage-5-plan.md, раздел 4) и лучшая волна уровня; за новые звёзды — очки ДНК
      // Потеря = целые списанные жизни + накопленный дробной остаток (рой отнимает по 0,25) + погашенное щитом: дробные потери учитываются как есть (config.ts, levels.stars)
      this.stars = won ? starsForLoss(Math.max(0, this.maxLives() - this.lives) + this.lifePool + this.shieldAbsorbed) : 0;
      this.starDna = recordResult(currentLevel(), cleared, this.stars).starDna;
      this.dnaParts = { ...parts, stars: this.starDna };
      this.coinsLeft = coinsLeft;
      // Строка итога попытки: номер попытки — до записи этой, покупки — с конца прошлой; после записи счётчик попыток уровня +1, строка — в журнал меню
      this.attemptText = this.buildAttemptLine(won, false);
      finishAttempt(currentLevel(), this.attemptText);
    }
    // Экран конца уровня: итог, из чего он сложился (волны + победа + звёзды; нулевые слагаемые, кроме волн, не показываются), монеты отдельной строкой (только после победы), пометка пройденного уровня
    const pieces = [t('dnaPartWaves', { n: this.dnaParts.waves })];
    if (this.dnaParts.win > 0) pieces.push(t('dnaPartWin', { n: this.dnaParts.win }));
    if (this.dnaParts.bosses > 0) pieces.push(t('dnaPartBosses', { n: this.dnaParts.bosses }));
    if (this.dnaParts.flawless > 0) pieces.push(t('dnaPartFlawless', { n: this.dnaParts.flawless }));
    if (this.dnaParts.stars > 0) pieces.push(t('dnaPartStars', { n: this.dnaParts.stars }));
    const total = this.dnaParts.waves + this.dnaParts.win + this.dnaParts.coins + this.dnaParts.bosses + this.dnaParts.flawless + this.dnaParts.floor + this.dnaParts.stars;
    const rows: { row: number; text: string }[] = [
      { row: 0, text: t('dnaTotal', { sum: total, total: metaDna() }) },
      { row: 1, text: pieces.join(' + ') },
    ];
    // Строка про остаток монет — только при ненулевой добавке (решение владельца 15 октября 2026: «остаток монет 47 → +0 очков ДНК» ничего не говорит)
    if (won && this.dnaParts.coins > 0) rows.push({ row: 2, text: t('dnaCoinsLine', { coins: this.coinsLeft, n: this.dnaParts.coins }) });
    else {
      const leak = this.leakLine();
      if (leak) rows.push({ row: 2, text: leak });
    }
    // До ближайшего крупного узла древа (башня, умение, ключевой узел) — сколько очков не хватает (документ дизайна, раздел 6.1); на повторе — пометка повтора
    const need = nextBigNode();
    this.needLine = need ? t('dnaNeed', { name: t(`upg${need.id.charAt(0).toUpperCase()}${need.id.slice(1)}` as TextKey), n: need.need }) : '';
    if (this.dnaReplay) rows.push({ row: 3, text: t('dnaReplayNote', { k: Math.round(CONFIG.meta.dna.replayFactor * 100) }) });
    else if (this.needLine) rows.push({ row: 3, text: this.needLine });
    this.endDnaLines = rows.map((r) => r.text);
    this.showOverlay(won ? t('victory') : t('gameOver'), TEXT_COLORS.accent, t('killed', { n: this.kills }), rows);
    if (won) this.drawStars(this.stars);
    this.addEndButtons(won);
  }

  /** Строка проигрыша: порода, отнявшая больше всего жизней; null — жизни никто не отнял. Советов, чем бить, нет: механики игрок изучает в альманахе. */
  private leakLine(): string | null {
    let top: BacteriumKind | null = null;
    let most = 0;
    for (const kind of KINDS) {
      const n = this.livesLostByKind[kind] ?? 0;
      if (n > most) {
        most = n;
        top = kind;
      }
    }
    if (top === null) return null;
    const cap = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);
    const kind = t(`bacName${cap(top)}` as TextKey);
    // дробные потери (рой отнимает по 0,25) — точно, до двух знаков (находка аудита MASTER-0103, решение владельца 28 октября 2026, сообщение 2, п. 5)
    return t('loseLeakOnly', { kind, n: num(Math.round(most * 100) / 100) });
  }

  /**
   * Кнопки экрана конца уровня: первый ряд «Заново» (перезапуск только ею: тап мимо кнопки уровень не перезапускает) и «Улучшения» (экран трат очков ДНК);
   * второй ряд — «Следующий уровень» (только после победы и не на последнем уровне) и «В меню».
   */
  private addEndButtons(won: boolean): void {
    const w = 320;
    const h = 76;
    const y = H / 2 + 200;
    const y2 = y + h + 14;
    const restart = this.addEndButton(W / 2 - 180, y, w, h, t('restart'), 0x2a8a4a, COLORS.merge, () => {
      if (performance.now() >= this.restartAllowedAt) this.scene.restart();
    });
    const upgrades = this.addEndButton(W / 2 + 180, y, w, h, t('upgradesBtn'), 0x2a5c9a, COLORS.gold, () => {
      if (performance.now() >= this.restartAllowedAt) this.scene.start('Upgrades');
    });
    const hasNext = won && currentLevel() < CONFIG.levels.count && isLevelOpen(currentLevel() + 1);
    if (hasNext) {
      this.nextButton = this.addEndButton(W / 2 - 180, y2, w, h, t('nextLevel'), 0x2a8a4a, COLORS.merge, () => {
        if (performance.now() < this.restartAllowedAt) return;
        // прогресс мог измениться в другой вкладке: уровень закрыт — экран выбора уровней (находка аудита MASTER-0063)
        if (isLevelOpen(currentLevel() + 1)) this.scene.start('Game', { level: currentLevel() + 1 });
        else this.scene.start('Levels');
      }, 28);
    }
    this.menuButton = this.addEndButton(hasNext ? W / 2 + 180 : W / 2, y2, w, h, t('toMenu'), 0x2a3550, 0x4a5c82, () => {
      if (performance.now() >= this.restartAllowedAt) this.scene.start('Menu');
    });
    this.endButton = restart;
    this.upgradesButton = upgrades;
    // «Скопировать итог» — в правом верхнем углу экрана конца уровня; после нажатия надпись сообщает, получилось ли
    const copyW = 340;
    const copy = this.addLabeledButton(W - copyW / 2 - 24, 56, copyW, 60, t('copyAttempt'), 0x2a3550, 0x4a5c82, () => {
      void copyText(this.attemptText).then((ok) => copy.label.setText(t(ok ? 'copyAttemptDone' : 'copyAttemptFail')));
    }, 26);
    this.copyButton = copy.rect;
  }

  private addEndButton(x: number, y: number, w: number, h: number, label: string, fill: number, line: number, onTap: () => void, fontSize = 34): { x: number; y: number; w: number; h: number } {
    return this.addLabeledButton(x, y, w, h, label, fill, line, onTap, fontSize).rect;
  }

  /** Кнопка затемнения вместе с её надписью (надпись нужна кнопкам, что меняют подпись по тапу, — «Звук: вкл / выкл»). */
  private addLabeledButton(x: number, y: number, w: number, h: number, label: string, fill: number, line: number, onTap: () => void, fontSize = 34): { rect: { x: number; y: number; w: number; h: number }; label: Phaser.GameObjects.Text } {
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    g.lineStyle(4, line, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
    const text = this.add.text(x, y, label, this.textStyle(fontSize)).setOrigin(0.5);
    // Нажатие кнопки затемнения дальше сцены не идёт: ни жесты карты, ни «тап по экрану продолжает игру» его не получают (решение владельца 20 октября 2026, сообщение 2, п. 1.3)
    const zone = this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        onTap();
      });
    this.overlay?.add([g, text, zone]);
    return { rect: { x, y, w, h }, label: text };
  }

  /** Затемнение с надписью: заголовок, вторая строка и (конец уровня) до четырёх строк очков ДНК: итог, из чего сложился, монеты, пометка пройденного уровня. */
  private showOverlay(title: string, titleColor: string, line2: string, extra: { row: number; text: string }[] = []): void {
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78),
      this.add.text(W / 2, H / 2 - 90, title, this.textStyle(76, titleColor)).setOrigin(0.5),
      this.add.text(W / 2, H / 2 + 2, line2, this.textStyle(38)).setOrigin(0.5),
    ];
    const rows = [
      { y: 46, size: 30, color: TEXT_COLORS.accent },
      { y: 80, size: 24, color: TEXT_COLORS.main },
      { y: 108, size: 24, color: TEXT_COLORS.main },
      { y: 134, size: fs(20, 22), color: TEXT_COLORS.soft },
    ];
    for (const { row, text } of extra) {
      const r = rows[row];
      const line = this.add.text(W / 2, H / 2 + r.y, text, this.textStyle(r.size, r.color)).setOrigin(0.5);
      if (line.width > W - 100) line.setScale((W - 100) / line.width); // длинная строка (названия бактерий и башен) сжимается, а не выходит за экран
      items.push(line);
    }
    let bottom = 0;
    let maxWidth = 0;
    for (const item of items) {
      if (!(item instanceof Phaser.GameObjects.Text)) continue;
      bottom = Math.max(bottom, item.y + item.displayHeight / 2);
      maxWidth = Math.max(maxWidth, item.displayWidth);
    }
    this.overlayBox = { bottom, maxWidth };
    this.overlay = this.add.container(0, 0, items).setDepth(200);
  }

  /** Три звезды над надписью конца уровня: заработанные — золотые, остальные — тёмные (рисуются кодом). */
  private drawStars(count: number): void {
    const g = this.add.graphics();
    for (let i = 0; i < 3; i++) drawStar(g, W / 2 + (i - 1) * 110, H / 2 - 200, 46, i < count);
    this.overlay?.add(g);
  }

  private textStyle(size: number, color: string = TEXT_COLORS.main): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: TEXT_COLORS.stroke,
      strokeThickness: Math.max(4, Math.round(size / 9)),
      resolution: 2,
    };
  }

  // ---------------------------------------------------------------- интерфейс

  /** Волна и прогресс на панели (обновляется, только когда что-то изменилось). */
  private refreshPanel(): void {
    const next = this.phase === 'countdown' || this.phase === 'pause' ? Math.max(0, this.phaseTimer) : null;
    const progress = this.plannedTotal > 0 ? this.spawned / this.plannedTotal : 0;
    const key = `${Math.max(1, this.waveIdx)}|${next === null ? '-' : Math.ceil(next)}|${Math.round(progress * 200)}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panel.setWave(Math.max(1, this.waveIdx), this.waveTotal(), progress, next, this.bossNext);
    this.panel.setWaveButton(next !== null, next === null ? 0 : this.skipBonus());
  }

  /** Подсказка «◀ Организм»: показываем, когда организм за краем экрана; мигает, если бактерия близко к нему. */
  private updateChip(timeSec: number): void {
    const leftEdge = this.rig.cx - VIEW.w / 2 / this.rig.zoom;
    const visible = leftEdge > CONFIG.map.orgW;
    const danger = visible && this.bacteria.some((b) => b.x - CONFIG.map.orgW < CONFIG.ui.dangerDistancePx);
    this.panel.setChip(visible, danger, timeSec);
    if (QA_MODE) {
      const key = `${visible}|${danger}`;
      if (key !== this.qaChip) {
        this.qaChip = key;
        qaLog(this, 'chip', { visible, danger, nearest: this.bacteria.length ? Math.min(...this.bacteria.map((b) => b.x - CONFIG.map.orgW)) : null });
      }
    }
  }

  // ---------------------------------------------------------------- проверка

  private gameToClient(gx: number, gy: number): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: rect.left + (gx / W) * rect.width, y: rect.top + (gy / H) * rect.height };
  }

}
