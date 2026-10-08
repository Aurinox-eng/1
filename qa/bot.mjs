/**
 * БОТ-ЗАМЕРЩИК БАЛАНСА (tower defense). Играет целые партии в тестовую сборку (`npm run build:qa`, режим ?qa) ТОЛЬКО через интерфейс:
 * колесо мыши (карта целиком), клик по кнопке башни на панели, клик по клетке — как игрок. Состояние читает только для решений
 * (монеты, башни, волна), ничего в игре не подкручивает. Печатает по строке на партию и итоговую таблицу по профилям;
 * машиночитаемый итог — qa/bot-results/<tag>.json (дописывается после каждой партии; в git не коммитить).
 *
 * Запуск (сначала `npm run build:qa`; если src новее dist-qa, скрипт остановится сам):
 *   node qa/bot.mjs [--profile=novice|average|strong|expert|all] [--runs=N] [--speed=2] [--exclude=syrup,fizz,syringe,pill]
 *                   [--cfg=путь:число,...] [--tag=имя] [--seed=N] [--max-game-sec=2400] [--verbose] [--shots] [--help]
 *
 * Профили («игроки»; порядок покупок и выбор клеток — в makePlayer ниже):
 *   novice  («новичок»)  только Таблетки, клетки наугад (где хоть что-то видно с дорожки), не больше 6 башен, покупает, как только хватает.
 *   average («средний»)  по кругу [Таблетка, Таблетка, Сироп, Таблетка, Шипучка, Шприц], ждёт монет на очередную; клетка — наугад
 *                        из лучших 15 % по охвату дорожки (длина дорожки в радиусе башни). Не сливает.
 *   (начало партии у expert и strong: пока башен с уроном меньше двух — только самая дешёвая башня с уроном (Таблетка); дальше по кругу, Шипучка первая; копят монеты на дорогую башню,
 *    только если жизни целы и на карте ≤ 8 бактерий — иначе берут первую доступную. Раньше они вторым покупали Сироп и 30 с копили на Шипучку — и проигрывали на 4–5-й волне.)
 *   expert  («особо сильный»)  по кругу [Таблетка, Сироп, Шипучка, Шприц, Таблетка, Шипучка, Сироп, Шприц]; клетка — лучшая именно для
 *                        этой башни (охват с учётом того, сколько бактерий там проходит; Шипучка — где сходятся ветки; Шприц — клетка и
 *                        направление луча, под которым лежит больше всего дорожки с бактериями; после постановки бот поворачивает башню тапами
 *                        на лучшее направление), башни расставляет по всей сети, а не кучкой, копит на дорогую башню до 30 игровых секунд,
 *                        решает каждые 2 с. ЭТО БЫВШИЙ «сильный» из кругов замеров 1–2 (до коммита с профилем expert): те же числа и поведение.
 *   strong  («сильный»)  тот же порядок и та же оценка клеток, но с человеческими несовершенствами: решает реже (раз в 3 с), копит на
 *                        дорогую башню только 8 с (потом берёт то, что по карману — больше дешёвых Таблеток), клетку берёт не самую лучшую,
 *                        а наугад из лучших 15 % клеток (≈ 30 из ≈ 200 свободных), оценка клеток «шумнее» (12 % вместо 3 %) и главное —
 *                        НЕ ЗНАЕТ приёмов: ставит Шипучку без упора на узлы слияния, а Шприц — без учёта, сколько бактерий идёт по каждой ветке,
 *                        и не поворачивает его (остаётся направление, которое игра выбирает при постановке сама). Это тот навык, что отличает
 *                        «особо сильного».
 *
 * СЛИЯНИЕ (правило игры с 8 октября 2026): две одинаковые башни (вид и уровень) сливаются, только если расстояние между их центрами
 * не больше mergeRadiusPx (состояние игры, 235 px мира ≈ 3 новые клетки); башни, ждущие выбора мутации, не сливаются; у получившейся башни мутации обеих складываются.
 * Поэтому профили, которые сливают (strong — только пары 1-го уровня, expert — всё; average и novice не сливают), покупая башню, ПРЕДПОЧИТАЮТ хорошую клетку
 * в радиусе слияния от стоящей башни того же вида и уровня 1 (клетка не хуже MERGE_NEAR_SHARE от лучшей по оценке; Сироп и Шприц — строже, MERGE_NEAR_SHARE_PICKY),
 * а слияние делают, только когда такая пара есть. Если пары нет — не сливают, а «слияния мимо» (mergeMisses: группа ≥ 2 одинаковых башен, но ни одной пары в радиусе;
 * одна и та же группа считается один раз) показывают, хватает ли ботам пар.
 *
 * Все решения принимаются не чаще, чем раз в 2 секунды ИГРОВОГО времени (как человек). Состояние опрашивается каждые ~120 мс реального времени.
 * Генератор случайных чисел бота — с --seed (игра сама случайна: путь на развилках выбирается наугад, поэтому нужно ≥ 10 партий на профиль).
 *
 * ВАЖНО: --speed выше 2 делает замер грубее (кадр игры считается не длиннее 50 мс реального времени, шаг ×speed; башни и бактерии
 * «дёргаются» крупнее, а бот тратит больше игрового времени на каждый тап). Для итоговых чисел баланса — speed 2; для проб — 4.
 * Боты запускать по одному, не параллельно.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buyGreedy,
  buyOrder,
  createInput,
  GAME_H as H,
  GAME_W as W,
  launchBrowser,
  makeGraphGeometry,
  parseArgs,
  readConfigNumber,
  readTowerTable,
  readMetaTable,
  readTowerUnlock,
  ROOT,
  sleep,
  startServer,
} from './lib.mjs';

// ------------------------------------------------------------------ параметры бота

const POLL_MS = 120; // опрос состояния, мс реального времени
const VIEW_W = 1080; // окно карты (без правой панели), px экрана игры
const PATIENCE_SEC = 30; // «особо сильный»: столько секунд игрового времени ждёт монет на дорогую приоритетную башню, потом берёт доступное
const STRONG_PATIENCE_SEC = 8; // «сильный»: ждёт монет на дорогую башню всего столько секунд (нетерпеливый: берёт доступное — больше дешёвых Таблеток)
const STRONG_PICK_SHARE = 0.15; // «сильный»: клетку берёт наугад из лучших 15 % клеток по оценке (но не меньше четырёх) — всегда «в хорошем месте»,
const STRONG_PICK_MIN = 4; // … но не обязательно в лучшем: башни стоят неравномерно (так же выбирает «средний», только по другой оценке)
const STRONG_NOISE = 0.12; // «сильный»: шум оценки клеток (доля), у «особо сильного» — EXPERT_NOISE
const EXPERT_NOISE = 0.03;
const DECIDE_EVERY = { novice: 2, average: 2, strong: 3, expert: 2 }; // как часто игрок принимает решения, игровых секунд (человек: сильный реагирует медленнее)
const OVERLAP_DISCOUNT = 0.5; // «сильный»: охват, уже накрытый другой башней, ценится в столько раз (расставляет по сети, а не кучкой)
const SYRUP_OVERLAP = 0.8; // …но замедляющей башне выгодно стоять там, где уже стреляют: скидка мягче
const ADJACENT_FACTOR = 0.3; // «сильный»: клетка рядом (в том числе по диагонали) с уже стоящей башней ценится в столько раз
const FIZZ_BY_WAVE = 5; // «особо сильный» копит на первую Шипучку, пока идёт не позже этой волны (рой — с 4-й), даже если уже потерял жизни: Таблетками рой всё равно не остановить
const EXPERT_OVERLAP = 0.9; // «особо сильный» знает, что все дорожки сходятся у «ствола» у организма: охват, уже накрытый другой башней, почти не обесценивается (башни кучкой у ствола бьют ВСЕХ бактерий)
const EXPERT_ADJACENT_FACTOR = 1; // … и соседство с другой башней ему не мешает
const NOVICE_MAX_TOWERS = 6;
const OPENING_DAMAGE_TOWERS = 2; // «сильный» и «особо сильный»: пока башен с уроном меньше стольких, покупают самую дешёвую башню с уроном (Таблетку), а не Сироп/дорогую по списку
const CALM_MAX_BACTERIA = 8; // они копят монеты на дорогую башню только в спокойной обстановке: жизни целы и на карте не больше стольких бактерий; иначе берут первую доступную
const AVERAGE_TOP_SHARE = 0.15; // «средний» выбирает наугад из лучших 15 % клеток по охвату (клеток теперь ≈ 200, а не ≈ 115 — доля прежняя)
const MERGE_NEAR_SHARE = 0.8; // слияние по радиусу: покупая башню, профиль выбирает среди клеток с оценкой не хуже этой доли от лучшей ту, что в радиусе слияния от башни того же вида и 1-го уровня
const MERGE_NEAR_SHARE_PICKY = 0.9; // … для Сиропа и Шприца (луч) доля строже: качеством клетки жертвуют меньше
const MERGE_NEAR_STRONG_SHARE = 0.3; // «сильный»: пул для такой клетки — лучшие 30 % клеток (а не 15 %), но не хуже MERGE_NEAR_SHARE от лучшей
const MERGE_NEAR_MARGIN = 0.98; // клетка считается «в радиусе», если расстояние до центра башни ≤ mergeRadiusPx × это (запас от округлений)
const AIM_STEPS = 8; // «Шприц»: сколько направлений луча (тап по башне — шаг 45°; как AIM_STEPS в src/level.ts; 0 — вправо, дальше по часовой стрелке)
const BEAM_MARGIN_PX = 22; // «Шприц»: насколько дальше полуширины луча от линии выстрела может лежать середина дорожки, чтобы луч её задел (как в игре)
const MERGE_ZONE_PX = 170; // «Шипучка»: участки дорожки ближе этого к узлу слияния считаются «кучей»
const MERGE_FACTOR = 2; // … и ценятся вдвое
const MERGE_UP_TO = { novice: -1, average: -1, strong: 1, expert: 99 }; // башни какого уровня и ниже профиль сливает (−1 — не сливает совсем): «сильный» — только пары первого уровня, «особо сильный» — всё; сливают только пары в радиусе mergeRadiusPx
// Какую мутацию выбирает профиль (номер варианта 0/1 по порогам): «сильный» всегда первую; «особо сильный» — по таблице (Сироп — «Едкая» в конце, чтобы лужа ещё и убивала; Шприц — «Бронебойный», затем «Второй луч»)
const MUTATION_PICKS = { strong: { default: [0, 0] }, expert: { pill: [0, 0], syrup: [0, 0], fizz: [0, 0], syringe: [1, 0] } };
const STALL_SEC = 30; // игровое время не идёт столько реальных секунд подряд — партия зависла

const NAMES = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц' };
const SHORT = { pill: 'Таб', syrup: 'Сир', fizz: 'Шип', syringe: 'Шпр' };
const PROFILE_TITLES = { novice: 'новичок', average: 'средний', strong: 'сильный', expert: 'особо сильный' };
const PROFILE_IDS = Object.keys(PROFILE_TITLES);
const AVERAGE_CYCLE = ['pill', 'pill', 'syrup', 'pill', 'fizz', 'syringe'];
const STRONG_CYCLE = ['fizz', 'pill', 'syrup', 'syringe', 'pill', 'fizz', 'syringe', 'syrup', 'pill']; // после «начала партии» (две Таблетки); рой с 4-й волны требует Шипучку — она первая

// шум видеодрайвера контейнера (как в smoke.mjs): к игре не относится
const ENV_NOISE = /GL Driver Message|GPU stall|swiftshader|SwiftShader|Automatic fallback to software WebGL/i;

// ------------------------------------------------------------------ разбор параметров

const HELP = `Бот-замерщик баланса: играет целые партии через интерфейс игры (тестовая сборка, режим ?qa).

  node qa/bot.mjs [параметры]

  --profile=novice|average|strong|expert|all   кто играет (по умолчанию all); expert — «особо сильный» (бывший «сильный» кругов 1–2)
  --runs=N                              партий на профиль (по умолчанию 10; для замера нужно не меньше 10)
  --speed=2                             ускорение игрового времени, 0.1…4 (по умолчанию 2). ВЫШЕ 2 ЗАМЕРЫ ГРУБЕЕ: годится для проб, не для итоговых чисел
  --exclude=syrup,fizz,syringe,pill     каких башен профили не строят (проверка «нужна ли башня»)
  --cfg=путь:число,...                  подмена чисел игры без правки config.ts, например towers.pill.price:40,economy.startCoins:5000
                                        (бот сам учтёт подмену цен и радиусов; непонятная запись останавливает замер)
  --tag=имя                             имя файла результата qa/bot-results/<имя>.json (по умолчанию latest)
  --seed=N                              зерно генератора случайных чисел бота (по умолчанию случайное; печатается в начале)
  --max-game-sec=2400                   потолок игрового времени одной партии (30 волн ≈ 1400 с); дольше — результат «timeout»
  --max-real-sec=3600                   потолок реального времени одной партии (страховка); дольше — «timeout»
  --verbose                             печатать каждую покупку и раз в 30 с — где идёт партия
  --shots                               снимок экрана в конце партии: qa/bot-results/<tag>-shots/
  --level=N                             номер уровня (1…10, по умолчанию 1): от него зависит, какие башни открыты (levels.towerUnlock в config.ts; на уровне 1 — только Таблетка и Сироп);
                                        на уровнях 2–10 партия идёт по составу волн своего уровня (levels.specs; адрес получает &levelwaves)
  --meta=lives:2,coins:5,damage:5,reward:5,shield:1,pillRate:3   фиксированные улучшения вне партии (id и уровни по таблице meta.upgrades из config.ts, в том числе ветки башен; не больше наибольшего уровня; без параметра — 0). Не сочетается с --campaign
  --campaign=N                          режим «серия партий» (этап 6а): каждая из --runs серий — до N партий подряд одним профилем; после каждой партии бот начисляет очки ДНК
                                        (по формуле config.ts, раздел meta) и покупает улучшения по порядку damage, coins, lives, reward, затем остальные по таблице (ветка башни — если башня открыта на уровне партии); серия кончается первой победой.
                                        Итог — номер партии первой победы. Без этого параметра улучшений нет (уровни 0)
  --ladder=K                            «лестница» (этап 5б): каждая из --runs дорожек проходит уровни 1…10 подряд; на уровне играет до K партий до первой победы,
                                        получает очки ДНК за волны, победу и звёзды, докупает улучшения (порядок как в --campaign; ветка башни — когда открыт её уровень).
                                        Дорожка, не выигравшая за K партий, «застряла» и дальше не идёт. Не сочетается с --campaign, --meta, --level
  --run-offset=N                        (лестница) номер дорожки = номер в --runs + N: так дорожки разных задач различаются
  --from-level=N, --to-level=M          участок лестницы (по умолчанию 1…10); дорожку между задачами передают --state-in=файл (состояние до) и --state-out=файл (после)
  --canvas                              рисовать игру через canvas вместо WebGL (?qa&canvas): на слабом контейнере партия идёт ≈ втрое быстрее.
                                        Логика игры та же; для замеров баланса годится (картинка не важна)
  --help                                эта справка

Сначала соберите тестовую игру: npm run build:qa. Партии идут по одной подряд. Одна партия на 30 волн (≈ 1400 игровых секунд) при speed 2 — около 12 минут реального времени в облачном контейнере (с --canvas быстрее), при speed 4 — вдвое меньше.`;

const args = parseArgs(process.argv.slice(2));
const die = (message, code = 2) => {
  console.error(`❌ ${message}`);
  process.exit(code);
};
if (args.help || args.h) {
  console.log(HELP);
  process.exit(0);
}
const KNOWN = new Set(['profile', 'runs', 'speed', 'exclude', 'cfg', 'tag', 'seed', 'max-game-sec', 'max-real-sec', 'verbose', 'shots', 'canvas', 'level', 'meta', 'campaign', 'ladder', 'from-level', 'to-level', 'state-in', 'state-out', 'run-offset', 'help']);
for (const key of Object.keys(args)) if (!KNOWN.has(key)) die(`Неизвестный параметр --${key}. Справка: node qa/bot.mjs --help`);

function numArg(name, fallback, { min = -Infinity, max = Infinity, int = false } = {}) {
  if (args[name] === undefined) return fallback;
  const value = Number(args[name]);
  if (args[name] === true || !Number.isFinite(value) || value < min || value > max || (int && !Number.isInteger(value))) {
    die(`--${name}=«${args[name] === true ? '' : args[name]}»: нужно ${int ? 'целое ' : ''}число от ${min} до ${max}.`);
  }
  return value;
}

const profileArg = args.profile === undefined ? 'all' : String(args.profile);
if (profileArg !== 'all' && !PROFILE_IDS.includes(profileArg)) die(`--profile=«${profileArg}»: есть ${PROFILE_IDS.join(', ')}, all.`);
const PROFILES = profileArg === 'all' ? PROFILE_IDS : [profileArg];
const RUNS = numArg('runs', 10, { min: 1, max: 1000, int: true });
const SPEED = numArg('speed', 2, { min: 0.1, max: 4 });
if (args.speed !== undefined && SPEED > 4) die('--speed не выше 4.');
const MAX_GAME_SEC = numArg('max-game-sec', 2400, { min: 30, max: 100000 });
const MAX_REAL_SEC = numArg('max-real-sec', 3600, { min: 30, max: 100000 });
const LEVEL = numArg('level', 1, { min: 1, max: 10, int: true });
const CAMPAIGN = numArg('campaign', 0, { min: 0, max: 40, int: true }); // 0 — обычный замер одной партии; N — серия до N партий с улучшениями
// «Лестница» (docs/stage-5b-plan.md, Фаза Б): игрок идёт по уровням подряд; на каждом играет до LADDER партий до первой победы, между партиями получает очки ДНК и докупает улучшения
const LADDER = numArg('ladder', 0, { min: 0, max: 20, int: true });
const LADDER_FROM = numArg('from-level', 1, { min: 1, max: 10, int: true });
const LADDER_TO = numArg('to-level', 10, { min: 1, max: 10, int: true });
const RUN_OFFSET = numArg('run-offset', 0, { min: 0, max: 1000, int: true }); // номер дорожки лестницы = номер партии в --runs + это число (дорожки разных задач получают разные номера)
const STATE_IN = args['state-in'] === undefined || args['state-in'] === true ? null : String(args['state-in']);
const STATE_OUT = args['state-out'] === undefined || args['state-out'] === true ? null : String(args['state-out']);
if (LADDER && (CAMPAIGN || args.meta !== undefined || args.level !== undefined)) die('--ladder не сочетается с --campaign, --meta и --level: уровни и улучшения ведёт сам бот (участок уровней — --from-level, --to-level).');
if (!LADDER && (args['from-level'] !== undefined || args['to-level'] !== undefined || args['run-offset'] !== undefined || STATE_IN || STATE_OUT)) die('--from-level, --to-level, --run-offset, --state-in, --state-out работают только вместе с --ladder=K.');
if (LADDER_FROM > LADDER_TO) die('--from-level не может быть больше --to-level.');
const SEED = args.seed === undefined ? Math.floor(Math.random() * 1e9) : numArg('seed', 0, { min: 0, max: 4294967295, int: true });
const TAG = args.tag === undefined ? 'latest' : String(args.tag);
if (!/^[\w-]+$/.test(TAG)) die(`Неверный --tag=«${TAG}»: только буквы, цифры, «_» и «-».`);
const VERBOSE = Boolean(args.verbose);
const SHOTS = Boolean(args.shots);

const TABLE = readTowerTable(); // из config.ts; подмена --cfg накладывается ниже
const TOWER_UNLOCK = readTowerUnlock(); // с какого уровня открыта башня (levels.towerUnlock)
const KNOWN_TOWERS = Object.keys(TABLE);
const EXCLUDE = new Set(
  args.exclude === undefined || args.exclude === true
    ? []
    : String(args.exclude)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
);
for (const id of EXCLUDE) if (!KNOWN_TOWERS.includes(id)) die(`--exclude: нет башни «${id}». Есть: ${KNOWN_TOWERS.join(', ')}.`);

/** --cfg=путь:число,...: проверяем запись и накладываем на то, что бот знает сам (цены и радиусы башен, ширина дорожки). */
const CFG_ITEMS = [];
if (args.cfg !== undefined) {
  if (args.cfg === true) die('--cfg=путь:число,... — после «=» нужна запись, например economy.startCoins:5000');
  for (const item of String(args.cfg).split(',')) {
    const [cfgPath, valueText, ...rest] = item.split(':');
    const value = Number(valueText);
    if (!cfgPath || valueText === undefined || valueText === '' || rest.length || !Number.isFinite(value)) {
      die(`--cfg: не понял «${item}». Нужно путь:число, например towers.pill.range:260`);
    }
    CFG_ITEMS.push([cfgPath, value]);
  }
}
const CFG_STRING = CFG_ITEMS.map(([p, v]) => `${p}:${v}`).join(',');
const cfgGet = (cfgPath) => CFG_ITEMS.filter(([p]) => p === cfgPath).map(([, v]) => v).pop();
for (const [cfgPath, value] of CFG_ITEMS) {
  const m = /^towers\.(\w+)\.(\w+)$/.exec(cfgPath);
  if (m && TABLE[m[1]] && typeof TABLE[m[1]][m[2]] === 'number') TABLE[m[1]][m[2]] = value;
}
const MAP_PATH_WIDTH = cfgGet('map.pathWidth') ?? readConfigNumber('map', 'pathWidth');

// Очки ДНК и улучшения (config.ts, раздел meta) с подменой --cfg: цены, очки за волну и за победу
const META = readMetaTable();
/** Фиксированные улучшения (--meta=lives:2,coins:5,shield:1,pillRate:3,...): null — нет; иначе уровни всех улучшений таблицы (не названные — 0). Нужны, чтобы замерять уровни 2–10 «с полным деревом» без прохождения серии партий. */
const META_FIXED = (() => {
  if (args.meta === undefined) return null;
  const levels = Object.fromEntries(Object.keys(META.upgrades).map((id) => [id, 0]));
  for (const item of String(args.meta).split(',')) {
    const [key, valueText] = item.split(':');
    const value = Number(valueText);
    if (!(key in levels) || !Number.isInteger(value) || value < 0) die(`--meta: не понял «${item}». Нужно вид lives:2,coins:5,damage:5,reward:5,shield:1,pillRate:3 (id — из таблицы meta.upgrades в config.ts: ${Object.keys(META.upgrades).join(', ')})`);
    levels[key] = Math.min(META.upgrades[key].prices.length, value);
  }
  return levels;
})();
if (META_FIXED && args.campaign !== undefined && Number(args.campaign) > 0) die('--meta не сочетается с --campaign: в серии улучшения покупает сам бот');
for (const [cfgPath, value] of CFG_ITEMS) {
  let m = /^meta\.dna\.(\w+)$/.exec(cfgPath);
  if (m && typeof META.dna[m[1]] === 'number') META.dna[m[1]] = value;
  m = /^meta\.upgrades\.(\w+)\.prices\.(\d+)$/.exec(cfgPath);
  if (m && META.upgrades[m[1]] && Number(m[2]) < META.upgrades[m[1]].prices.length) META.upgrades[m[1]].prices[Number(m[2])] = value;
  m = /^meta\.upgrades\.(\w+)\.perLevel$/.exec(cfgPath);
  if (m && META.upgrades[m[1]]) META.upgrades[m[1]].perLevel = value;
}
/** Порядок, в котором бот тратит очки ДНК (docs/upgrades.md, разделы 7 и 16): сначала улучшения этапа 6а, затем остальные по порядку таблицы; ветка башни — только если башня открыта на уровне партии (общий расчёт — `buyGreedy` в `qa/lib.mjs`). */
const BUY_ORDER = buyOrder(META.upgrades);

/** Числа башен для решений бота (цена и радиус) на начало партии: строка таблицы с учётом купленных улучшений ветки башни. */
const TABLE_BASE = JSON.parse(JSON.stringify(TABLE));
function applyMetaToTable(levels) {
  for (const id of KNOWN_TOWERS) {
    const sum = (effect) => Object.entries(META.upgrades).filter(([, u]) => u.branch === id && u.effect === effect).reduce((acc, [uid, u]) => acc + (levels?.[uid] ?? 0) * u.perLevel, 0);
    TABLE[id].price = Math.max(1, Math.ceil(TABLE_BASE[id].price * (1 + sum('price')) - 1e-9));
    TABLE[id].range = TABLE_BASE[id].range * (1 + sum('range'));
  }
}
/** Звёзды за победу и очки за новые звёзды — как в игре (`levels.stars`, `levels.starDna` в config.ts). */
const STARS_RULE = { for3: readConfigNumber('levels', 'maxLostFor3'), for2: readConfigNumber('levels', 'maxLostFor2'), dna: readConfigNumber('levels', 'starDna') };
function starsOf(game) {
  if (game.result !== 'won') return 0;
  const lost = Math.max(0, game.maxLives - game.lives) + (game.shieldAbsorbed ?? 0);
  return lost <= STARS_RULE.for3 + 1e-9 ? 3 : lost <= STARS_RULE.for2 + 1e-9 ? 2 : 1;
}
const emptyLevels = () => Object.fromEntries(Object.keys(META.upgrades).map((id) => [id, 0]));

/** Очки ДНК за партию: за каждую пройденную волну (при проигрыше — без текущей) и добавка за победу — как в GameScene.endGame. */
function dnaForGame(game) {
  const cleared = game.result === 'won' ? game.waveTotal : Math.max(0, game.wave - 1);
  return cleared * META.dna.perWave + (game.result === 'won' ? META.dna.winBonus : 0);
}

/** Жадная покупка очков ДНК между партиями (`buyGreedy`): первое по порядку BUY_ORDER улучшение, на следующий уровень которого хватает очков; ветка башни — если башня открыта на уровне партии. */
function buyUpgrades(levels, dna, level = LEVEL) {
  return buyGreedy({ upgrades: META.upgrades, order: BUY_ORDER, unlock: TOWER_UNLOCK, level, levels, dna });
}


// ------------------------------------------------------------------ случайные числа (с зерном)

function hashString(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function makeRng(seedText) {
  let a = hashString(seedText);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ карта: клетки, охват, «вперёд/назад»

/**
 * Сеть дорожек из игры (getGraph) → всё, что нужно для выбора клеток:
 *  cells — клетки (центр, на дорожке ли, расстояние до организма по дорожкам rem — как remainingNear в src/level.ts);
 *  segs  — отрезки дорожки (середина, длина, вес = какая доля бактерий идёт по ребру, rem, рядом ли узел слияния);
 *  inRange(range) — для каждой клетки список отрезков в радиусе range (кэш).
 */
function buildWorld(graph, map, cols, rows) {
  const geo = makeGraphGeometry(graph, map, cols, rows); // isPathCell: «не свободна» — дорожка или закрытая (далёкая) клетка
  const edges = graph.edges;
  const cum = new Map();
  for (const e of edges) {
    const c = [0];
    for (let i = 1; i < e.pts.length; i++) c.push(c[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
    cum.set(e.id, c);
  }
  const lengthOf = (e) => cum.get(e.id)[e.pts.length - 1];
  const remNode = {};
  const nodeRemaining = (node) => {
    if (node in remNode) return remNode[node];
    const outs = geo.outOf[node];
    remNode[node] = outs ? Math.min(...outs.map((id) => lengthOf(geo.byId.get(id)) + nodeRemaining(geo.byId.get(id).to))) : 0;
    return remNode[node];
  };
  // узлы слияния (в них входят ≥ 2 ребра): здесь бактерии с разных веток идут кучей
  const mergeNodes = [];
  for (const [node, ids] of Object.entries(geo.inTo)) {
    if (ids.length >= 2) {
      const last = geo.byId.get(ids[0]).pts.at(-1);
      mergeNodes.push({ node, x: last[0], y: last[1] });
    }
  }
  const segs = [];
  for (const e of edges) {
    const c = cum.get(e.id);
    const endRem = nodeRemaining(e.to);
    const len = c[c.length - 1];
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i];
      const b = e.pts[i + 1];
      const x = (a[0] + b[0]) / 2;
      const y = (a[1] + b[1]) / 2;
      segs.push({
        x,
        y,
        len: c[i + 1] - c[i],
        w: geo.prob.get(e.id) ?? 0,
        rem: len - (c[i] + c[i + 1]) / 2 + endRem,
        merge: mergeNodes.some((m) => Math.hypot(m.x - x, m.y - y) <= MERGE_ZONE_PX),
        edge: e.id,
      });
    }
  }
  const cells = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const c = geo.center(col, row);
      let best = Infinity;
      let rem = 0;
      for (const e of edges) {
        const cu = cum.get(e.id);
        const endRem = nodeRemaining(e.to);
        for (let i = 0; i < e.pts.length; i++) {
          const d = Math.hypot(e.pts[i][0] - c.x, e.pts[i][1] - c.y);
          if (d < best) {
            best = d;
            rem = cu[cu.length - 1] - cu[i] + endRem;
          }
        }
      }
      cells.push({ idx: cells.length, col, row, key: `${col},${row}`, x: c.x, y: c.y, path: geo.isPathCell(col, row), rem });
    }
  }
  const rangeCache = new Map();
  const inRange = (range) => {
    if (!rangeCache.has(range)) {
      rangeCache.set(
        range,
        cells.map((c) => {
          const list = [];
          for (let i = 0; i < segs.length; i++) if (Math.hypot(segs[i].x - c.x, segs[i].y - c.y) <= range) list.push(i);
          return list;
        }),
      );
    }
    return rangeCache.get(range);
  };
  const byKey = new Map(cells.map((c) => [c.key, c]));
  const dirs = Array.from({ length: AIM_STEPS }, (_, i) => [Math.cos((i * 2 * Math.PI) / AIM_STEPS), Math.sin((i * 2 * Math.PI) / AIM_STEPS)]);
  /** Отрезки дорожки под лучом «Шприца» из клетки в направлении dir (номер 0…7): середина отрезка в полосе длины beamLengthPx (кэш). */
  const rayCache = new Map();
  const rayOf = (type, cell, dir) => {
    const key = `${type}|${cell.idx}|${dir}`;
    if (!rayCache.has(key)) {
      const T = TABLE[type];
      const [dx, dy] = dirs[dir];
      const half = T.beamHalfWidthPx + BEAM_MARGIN_PX;
      const list = [];
      for (let i = 0; i < segs.length; i++) {
        const px = segs[i].x - cell.x;
        const py = segs[i].y - cell.y;
        const along = px * dx + py * dy;
        if (along >= 0 && along <= T.beamLengthPx && Math.abs(-px * dy + py * dx) <= half) list.push(i);
      }
      rayCache.set(key, list);
    }
    return rayCache.get(key);
  };
  /** Лучшее направление луча из клетки: weighted — с весом «сколько бактерий идёт по ветке» и скидкой за уже накрытое (covCount). Возвращает { dir, value }. */
  const bestAim = (type, cell, weighted, covCount) => {
    let best = { dir: 0, value: -1 };
    for (let dir = 0; dir < AIM_STEPS; dir++) {
      let value = 0;
      for (const si of rayOf(type, cell, dir)) {
        const sg = segs[si];
        value += weighted ? sg.len * sg.w * Math.pow(OVERLAP_DISCOUNT, covCount ? covCount[si] : 0) : sg.len;
      }
      if (value > best.value) best = { dir, value };
    }
    return best;
  };

  /** Подходит ли отрезок башне по стороне («вперёд» — бактериям до организма дальше, чем башне; «назад» — ближе). */
  const sideOk = (T, cell, sg) => (T.side === 'forward' ? sg.rem > cell.rem : T.side === 'back' ? sg.rem < cell.rem : true);

  return {
    cells,
    segs,
    byKey,
    bestAim,
    freeCount: cells.filter((c) => !c.path).length,
    /** «Охват» клетки для башни type: сколько длины дорожки (px) попадает в радиус (для «вперёд/назад» — только нужная сторона). */
    cover(type, cell) {
      const T = TABLE[type];
      if (T.targeting === 'beam') return bestAim(type, cell, false).value;
      let sum = 0;
      for (const si of inRange(T.range)[cell.idx]) if (sideOk(T, cell, segs[si])) sum += segs[si].len;
      return sum;
    },
    /**
     * Оценка клетки для «сильного»: охват с весом «сколько бактерий здесь ходит» и скидкой за уже накрытое другими башнями (covCount);
     * Шипучка — вдвое ценнее участки у узлов слияния; Шприц — ценность лучшего направления луча (длина дорожки под лучом: у «умного» с весом
     * веток и скидкой за уже накрытое, у остальных — просто длина).
     */
    strongScore(type, cell, covCount, smart = true) {
      const T = TABLE[type];
      if (T.targeting === 'beam') return bestAim(type, cell, smart, covCount).value;
      const discount = type === 'syrup' ? SYRUP_OVERLAP : smart ? EXPERT_OVERLAP : OVERLAP_DISCOUNT;
      const list = inRange(T.range)[cell.idx];
      let sum = 0;
      const values = [];
      for (const si of list) {
        const sg = segs[si];
        if (!sideOk(T, cell, sg)) continue;
        let v = sg.len * sg.w * Math.pow(discount, covCount[si]);
        if (smart && T.targeting === 'area' && sg.merge) v *= MERGE_FACTOR;
        sum += v;
        values.push([sg, v]);
      }
      return sum;
    },
    /** Сколько башен уже накрывает каждый отрезок дорожки (по радиусам стоящих башен). */
    coverCounts(towers) {
      const counts = new Int32Array(segs.length);
      for (const tw of towers) {
        const cell = byKey.get(`${tw.col},${tw.row}`);
        const T = TABLE[tw.id];
        if (!cell || !T) continue;
        const list = T.targeting === 'beam' ? rayOf(tw.id, cell, tw.aim ?? 0) : inRange(T.range)[cell.idx];
        for (const si of list) counts[si]++;
      }
      return counts;
    },
  };
}

// ------------------------------------------------------------------ игроки (профили)

/**
 * Игрок решает, ЧТО построить сейчас: { type, cell } или null (ждать). view: { s (состояние), coins, towers, free (свободные клетки,
 * без занятых и «плохих»), covCount }. После успешной покупки зовётся bought(), после неудачи клетку бот сам помечает «плохой».
 */
function makePlayer(profile, { world, rng, buttons }) {
  const available = (id) => TABLE[id] && buttons.includes(id) && !EXCLUDE.has(id);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  /** Проверка «клетка в радиусе слияния от стоящей башни этого вида 1-го уровня (мутация не ждёт)»; null — таких башен нет (тогда как раньше). */
  const nearPartner = (view, type) => {
    const radius = (view.s.mergeRadiusPx ?? 0) * MERGE_NEAR_MARGIN;
    const partners = view.towers.filter((tw) => tw.id === type && tw.level === 1 && tw.pending === null && tw.level < view.s.maxTowerLevel);
    if (!radius || !partners.length) return null;
    return (cell) => partners.some((tw) => Math.hypot(tw.x - cell.x, tw.y - cell.y) <= radius);
  };

  if (profile === 'novice') {
    return {
      decide(view) {
        if (!available('pill') || view.towers.length >= NOVICE_MAX_TOWERS || view.coins < TABLE.pill.price) return null;
        const cells = view.free.filter((c) => world.cover('pill', c) > 0);
        return cells.length ? { type: 'pill', cell: pick(cells) } : null;
      },
      bought() {},
    };
  }

  if (profile === 'average') {
    let ptr = 0;
    const skip = () => {
      for (let k = 0; k < AVERAGE_CYCLE.length && !available(AVERAGE_CYCLE[ptr % AVERAGE_CYCLE.length]); k++) ptr++;
      return available(AVERAGE_CYCLE[ptr % AVERAGE_CYCLE.length]) ? AVERAGE_CYCLE[ptr % AVERAGE_CYCLE.length] : null;
    };
    return {
      decide(view) {
        const type = skip();
        if (!type || view.coins < TABLE[type].price) return null;
        const scored = view.free
          .map((c) => ({ c, v: world.cover(type, c) }))
          .sort((a, b) => b.v - a.v || a.c.idx - b.c.idx);
        const top = scored.slice(0, Math.max(3, Math.ceil(scored.length * AVERAGE_TOP_SHARE))).filter((x) => x.v > 0);
        if (!top.length) {
          ptr++; // для этой башни нет клеток с охватом — пропускает её
          return null;
        }
        return { type, cell: pick(top).c };
      },
      bought() {
        ptr++;
      },
    };
  }

  // expert / strong: строго по списку приоритетов; ждёт монет на очередную башню, но не дольше patience (тогда берёт первую доступную).
  // expert — прежний «сильный» (кругов 1–2) без изменений; strong — то же с человеческими несовершенствами (см. шапку и константы STRONG_*)
  const imperfect = profile === 'strong';
  const patience = imperfect ? STRONG_PATIENCE_SEC : PATIENCE_SEC;
  const noise = imperfect ? STRONG_NOISE : EXPERT_NOISE;
  const gaveUp = new Set(); // башни, для которых «копить на первую» не вышло (нет подходящих клеток): дальше обычный круг
  let ptr = 0;
  let headSince = 0;
  let lastPtr = -1;
  return {
    decide(view) {
      const now = view.s.elapsed;
      if (ptr !== lastPtr) {
        lastPtr = ptr;
        headSince = now;
      }
      let order = [];
      for (let k = 0; k < STRONG_CYCLE.length; k++) {
        const idx = (ptr + k) % STRONG_CYCLE.length;
        if (available(STRONG_CYCLE[idx])) order.push({ idx, type: STRONG_CYCLE[idx] });
      }
      // Начало партии: пока башен с уроном мало, главное — урон: берётся самая дешёвая башня с уроном (вне списка по кругу; Сироп без урона ничего не убьёт)
      // Считаем в «обычных башнях»: башня уровня L — это 2^(L−1) обычных (иначе после слияния двух Таблеток «начало партии» включалось снова и бот до конца партии покупал только Таблетки: Сироп не строился)
      const damageCount = view.towers.filter((tw) => TABLE[tw.id]?.damage > 0).reduce((sum, tw) => sum + 2 ** ((tw.level ?? 1) - 1), 0);
      const opening = damageCount < OPENING_DAMAGE_TOWERS;
      if (opening) {
        const cheapest = KNOWN_TOWERS.filter((id) => available(id) && TABLE[id].damage > 0).sort((a, b) => TABLE[a].price - TABLE[b].price)[0];
        order = cheapest ? [{ idx: -1, type: cheapest }] : order.filter((o) => TABLE[o.type].damage > 0);
      }
      // «Особо сильный» знает, что с 4-й волны идёт рой, а одними Таблетками он не остановим: до 5-й волны копит монеты на первую Шипучку и ничего другого не покупает (слияния Таблеток при этом идут как обычно)
      // Так же он копит на первый Сироп и первый Шприц (без этого в бою, когда «не спокойно», терпение 0 и он до конца партии покупает только дешёвые Таблетки: Сироп не строился ни разу)
      const firstOf = (id) => available(id) && !gaveUp.has(id) && !view.towers.some((tw) => tw.id === id);
      const needFirst = imperfect || opening ? null : firstOf('fizz') && view.s.wave <= FIZZ_BY_WAVE ? 'fizz' : ['syrup', 'syringe'].find(firstOf) ?? null;
      if (needFirst) order = [{ idx: STRONG_CYCLE.indexOf(needFirst), type: needFirst }];
      if (!order.length) return null;
      const calm = view.s.lives >= view.s.maxLives && view.s.bacteria.length <= CALM_MAX_BACTERIA;
      let chosen = null;
      if (view.coins >= TABLE[order[0].type].price) chosen = order[0];
      else if (!opening && !needFirst && now - headSince >= (calm ? patience : 0)) chosen = order.find((o) => view.coins >= TABLE[o.type].price) ?? null;
      if (!chosen) return null;
      const candidates = [];
      for (const c of view.free) {
        let v = world.strongScore(chosen.type, c, view.covCount, !imperfect);
        if (view.towers.some((tw) => Math.abs(tw.col - c.col) <= 1 && Math.abs(tw.row - c.row) <= 1)) v *= imperfect ? ADJACENT_FACTOR : EXPERT_ADJACENT_FACTOR;
        v *= 1 + noise * rng(); // небольшой шум: идеально одинаковых партий не бывает
        if (v > 0) candidates.push({ c, v });
      }
      candidates.sort((a, b) => b.v - a.v); // сортировка устойчивая: при равных оценках первой остаётся клетка с меньшим номером, как раньше
      let best = candidates[0] ?? null;
      // Слияние по радиусу: если уже стоит башня того же вида уровня 1 (новая — тоже уровня 1), хорошая клетка в радиусе слияния от неё предпочтительнее
      const near = MERGE_UP_TO[profile] >= 1 ? nearPartner(view, chosen.type) : null;
      const share = TABLE[chosen.type].targeting === 'beam' || chosen.type === 'syrup' ? MERGE_NEAR_SHARE_PICKY : MERGE_NEAR_SHARE;
      const nearPool = near && best ? candidates.filter((x) => x.v >= best.v * share && near(x.c)) : [];
      if (imperfect && best) {
        const pool = nearPool.length
          ? nearPool.filter((x) => candidates.indexOf(x) < Math.max(STRONG_PICK_MIN, Math.ceil(candidates.length * MERGE_NEAR_STRONG_SHARE)))
          : [];
        const usual = candidates.slice(0, Math.max(STRONG_PICK_MIN, Math.ceil(candidates.length * STRONG_PICK_SHARE)));
        const from = pool.length ? pool : usual;
        best = from[Math.floor(rng() * from.length)];
      } else if (nearPool.length) {
        best = nearPool[0]; // candidates уже по убыванию оценки: лучшая из клеток в радиусе слияния
      }
      if (!best) {
        if (needFirst) gaveUp.add(chosen.type);
        if (chosen.idx >= 0) ptr = chosen.idx + 1; // клеток для этой башни нет — переходит к следующей в списке
        return null;
      }
      return { type: chosen.type, cell: best.c, cycleIdx: chosen.idx };
    },
    bought(choice) {
      if (choice.cycleIdx >= 0) ptr = (choice.cycleIdx + 1) % STRONG_CYCLE.length; // покупка «начала партии» (cycleIdx -1) место в списке не двигает
    },
  };
}

// ------------------------------------------------------------------ страница игры

class FatalConsole extends Error {}

const getState = (page) => page.evaluate(() => window.__pvb?.getState());

/** Ждёт, пока условие выполнится (возвращает состояние); по истечении времени возвращает последнее состояние (не бросает). */
async function pollUntil(page, predicate, timeoutMs, pollMs = 35) {
  const started = Date.now();
  let s = await getState(page);
  while (!predicate(s) && Date.now() - started < timeoutMs) {
    await sleep(pollMs);
    s = await getState(page);
  }
  return s;
}

let WORLD = null; // строится один раз по сети дорожек из первой партии

/** Играет одну партию. Возвращает запись о партии. Бросает FatalConsole (ошибка консоли / «cfg:»), остальные ошибки — наверх. */
async function playGame(browser, baseUrl, profile, run, metaLevels = null, salt = '', level = LEVEL) {
  applyMetaToTable(metaLevels);
  const rng = makeRng(`${SEED}:${profile}:${run}${salt}`);
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const problems = [];
  const warnings = [];
  const recentConsole = [];
  page.on('console', (msg) => {
    const type = msg.type();
    recentConsole.push(`${type}: ${msg.text().slice(0, 160)}`);
    if (recentConsole.length > 6) recentConsole.shift();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (ENV_NOISE.test(text)) return;
    if (type === 'error' || /^cfg:/.test(text)) problems.push(`console.${type}: ${text}`);
    else warnings.push(`console.${type}: ${text}`);
  });
  page.on('pageerror', (err) => problems.push(`ОШИБКА СТРАНИЦЫ: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`не загрузилось: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  const checkConsole = () => {
    if (problems.length) throw new FatalConsole([...new Set(problems)].slice(0, 8).join('\n   '));
  };

  const realStart = Date.now();
  try {
    await page.goto(`${baseUrl}?qa&speed=${SPEED}${args.canvas ? '&canvas' : ''}${CFG_STRING ? `&cfg=${CFG_STRING}` : ''}&level=${level}${level > 1 ? '&levelwaves' : ''}${metaLevels ? `&meta=${Object.entries(metaLevels).map(([id, n]) => `${id}:${n}`).join(',')}` : ''}`, { waitUntil: 'load' });
    // В начале уровня игра сама встаёт на паузу и показывает плашки (башни уровня и бактерии 1-й волны): state 'info'. Бот закрывает их тапом (раньше 0,4 с после показа плашка тап не принимает)
    let s = await pollUntil(page, (x) => x && (x.state === 'playing' || x.state === 'info'), 20000, 100);
    checkConsole();
    if (!s || (s.state !== 'playing' && s.state !== 'info')) throw new Error('Игра не запустилась за 20 секунд');
    const cdp = await context.newCDPSession(page);
    const input = createInput(page, cdp, false);
    const rect = await page.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const g2c = (x, y) => ({ x: rect.left + (x * rect.width) / W, y: rect.top + (y * rect.height) / H });
    const c2g = (p) => ({ x: ((p.x - rect.left) * W) / rect.width, y: ((p.y - rect.top) * H) / rect.height });
    const cellPos = (col, row) => page.evaluate(([c, r]) => window.__pvb.cellToClient(c, r), [col, row]);
    /** Закрывает плашки с описанием (state 'info'): тап в центр экрана, пока игра не вернётся в 'playing'; возвращает свежее состояние. */
    const closePlaques = async () => {
      let st = await getState(page);
      for (let k = 0; k < 30 && st.state === 'info'; k++) {
        await sleep(450);
        await input.tap(g2c(W / 2, H / 2));
        await sleep(100);
        st = await getState(page);
      }
      return st;
    };
    s = await closePlaques();
    if (s.state !== 'playing') throw new Error(`После закрытия плашек игра не в состоянии «playing», а «${s.state}»`);

    if (!WORLD) {
      const graph = await page.evaluate(() => window.__pvb.getGraph());
      WORLD = buildWorld(graph, { orgW: s.map.orgW, tile: s.map.tile, pathWidth: MAP_PATH_WIDTH, pathMarginTile: 0.55 }, s.map.cols, s.map.rows);
    }
    if (!WORLD.reported) {
      WORLD.reported = true;
      const free = WORLD.cells.filter((c) => !c.path);
      const withCover = KNOWN_TOWERS.map((id) => `${NAMES[id] ?? id} ${free.filter((c) => WORLD.cover(id, c) > 0).length}`).join(', ');
      console.log(`  карта: клеток ${WORLD.cells.length}, под дорожкой ${WORLD.cells.length - free.length}, свободных ${free.length}; клеток с охватом > 0: ${withCover}`);
    }
    const buttons = s.ui.towerButtons.filter((b) => !b.locked).map((b) => b.id); // закрытые башни (замок) профили не строят
    const player = makePlayer(profile, { world: WORLD, rng, buttons });

    // 1) один раз отдаляем камеру до минимума колесом мыши (карта целиком в окне)
    for (let k = 0; k < 6 && s.camera.zoom > s.camera.zoomMin + 0.001; k++) {
      await input.wheel(g2c(VIEW_W / 2, H / 2), 500);
      await sleep(80);
      s = await getState(page);
    }

    // 2) поставить башню: кнопка на панели (если не выбрана), при необходимости сдвинуть карту, тап по клетке; проверка по состоянию
    const record = { builds: [], failures: [], anomalies: [], spent: 0, merges: 0, mergeMisses: 0, picks: 0 };
    const missSeen = new Set(); // группы башен без пары в радиусе, уже посчитанные в mergeMisses
    const ensureVisible = async (col, row) => {
      for (let k = 0; k < 3; k++) {
        const g = c2g(await cellPos(col, row));
        if (g.x >= 12 && g.x <= VIEW_W - 12 && g.y >= 12 && g.y <= H - 12) return true;
        const dx = Math.max(-420, Math.min(420, VIEW_W / 2 - g.x));
        const dy = Math.max(-300, Math.min(300, H / 2 - g.y));
        await input.drag(g2c(VIEW_W / 2 - dx / 2, H / 2 - dy / 2), g2c(VIEW_W / 2 + dx / 2, H / 2 + dy / 2), { steps: 6, stepMs: 12 });
        await sleep(120);
      }
      return false;
    };
    const clickCard = async (rect) => {
      await input.tap(g2c(rect.x, rect.y));
      await sleep(120);
    };
    /** Выбирает поставленную башню тапом по клетке (если она уже выбрана — ничего не делает: повторный тап по Шприцу повернул бы его). Возвращает состояние или null. */
    const selectTower = async (tw) => {
      const st = await getState(page);
      if (st.selectedTower && st.selectedTower.col === tw.col && st.selectedTower.row === tw.row) return st;
      if (!(await ensureVisible(tw.col, tw.row))) return null;
      await input.tap(await cellPos(tw.col, tw.row));
      const after = await pollUntil(page, (x) => (x.selectedTower?.col === tw.col && x.selectedTower?.row === tw.row) || x.state !== 'playing', 1000);
      return after.selectedTower ? after : null;
    };
    /** «Особо сильный» после постановки Шприца выбирает его и поворачивает кнопками-стрелками карточки (на 45° влево/вправо) на лучшее направление луча. */
    const aimTower = async (st, tower, cell) => {
      const others = st.towers.filter((tw) => !(tw.col === cell.col && tw.row === cell.row));
      const best = WORLD.bestAim(tower.id, cell, true, WORLD.coverCounts(others));
      const cw = (best.dir - tower.aim + AIM_STEPS) % AIM_STEPS;
      const steps = Math.min(cw, AIM_STEPS - cw);
      if (steps === 0) return;
      const sel = await selectTower(tower);
      const card = sel?.ui.card;
      const button = cw <= AIM_STEPS - cw ? card?.rotateRight : card?.rotateLeft;
      if (!button?.visible) {
        record.anomalies.push(`Шприц в ${cell.key}: кнопок поворота в карточке нет`);
        return;
      }
      for (let k = 0; k < steps; k++) await clickCard(button);
      const after = await pollUntil(page, (x) => x.towers.find((tw) => tw.col === cell.col && tw.row === cell.row)?.aim === best.dir || x.state !== 'playing', 1500);
      const now = after.towers.find((tw) => tw.col === cell.col && tw.row === cell.row);
      if (after.state === 'playing' && now?.aim !== best.dir) record.anomalies.push(`Шприц в ${cell.key}: ждали направление ${best.dir}, в игре ${now?.aim}`);
    };
    /** Выбирает мутацию для башни, которая её ждёт (tw.pending — номер порога): выбирает башню, жмёт кнопку варианта в карточке. */
    const pickMutation = async (tw) => {
      const table = MUTATION_PICKS[profile];
      const index = table ? (table[tw.id] ?? table.default)?.[tw.pending] : undefined;
      if (index === undefined) return false;
      const sel = await selectTower(tw);
      const rect = sel?.ui.card.visible ? sel.ui.card.picks[index] : null;
      if (!rect?.visible) return false;
      const before = sel.mutationsPicked;
      await clickCard(rect);
      const after = await pollUntil(page, (x) => x.mutationsPicked > before || x.state !== 'playing', 1000);
      if (after.mutationsPicked > before) {
        record.picks++;
        return true;
      }
      record.anomalies.push(`мутация в ${tw.col},${tw.row}: кнопка варианта ${index} не сработала`);
      return false;
    };
    /**
     * Одно слияние (правило игры: пара одинаковых башен — вид и уровень — в радиусе mergeRadiusPx друг от друга, мутация у обеих выбрана).
     * Башни группируются по виду и уровню (не выше предела профиля); в группе ищется пара в радиусе. Результат стоит в клетке второй башни (target),
     * поэтому target — та, у которой охват дорожки больше (при равенстве — первая); source — другая: выбирается («Слить»), затем тап по target.
     * Нет пары в радиусе — не сливает; группа ≥ 2 башен без пары считается в mergeMisses (один раз, пока состав группы не изменился).
     * Возвращает true, если слилось.
     */
    const mergeOnce = async (s0) => {
      const limit = MERGE_UP_TO[profile];
      if (limit < 1) return false;
      const radius = s0.mergeRadiusPx;
      const groups = new Map();
      for (const tw of s0.towers) {
        if (tw.level > limit || tw.level >= s0.maxTowerLevel || tw.pending !== null) continue;
        const key = `${tw.id}|${tw.level}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tw);
      }
      let found = null;
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        let pair = null;
        for (let i = 0; i < list.length && !pair; i++) {
          for (let j = i + 1; j < list.length; j++) {
            if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) <= radius) {
              pair = [list[i], list[j]];
              break;
            }
          }
        }
        if (pair) {
          found ??= pair;
        } else {
          const sig = list.map((tw) => `${tw.id}${tw.level}@${tw.col},${tw.row}`).sort().join(' ');
          if (!missSeen.has(sig)) {
            missSeen.add(sig);
            record.mergeMisses++;
          }
        }
      }
      if (!found) return false;
      const coverOf = (tw) => {
        const cell = WORLD.byKey.get(`${tw.col},${tw.row}`);
        return cell ? WORLD.cover(tw.id, cell) : 0;
      };
      const [target, source] = coverOf(found[1]) > coverOf(found[0]) ? [found[1], found[0]] : [found[0], found[1]];
      let st = await selectTower(source);
      if (!st || !st.ui.card.merge.enabled) return false;
      await clickCard(st.ui.card.merge);
      st = await pollUntil(page, (x) => x.mergeMode || x.state !== 'playing', 800);
      if (!st.mergeMode) {
        record.anomalies.push(`слияние не включилось (${source.id} ${source.col},${source.row})`);
        return false;
      }
      const before = st.merges;
      if (!(await ensureVisible(target.col, target.row))) {
        await clickCard(st.ui.card.merge); // отмена: вторая башня не видна на экране
        return false;
      }
      await input.tap(await cellPos(target.col, target.row));
      st = await pollUntil(page, (x) => x.merges > before || x.state !== 'playing', 1200);
      if (st.merges > before) {
        record.merges++;
        const tw = st.towers.find((x) => x.col === target.col && x.row === target.row);
        if (tw && tw.pending !== null) await pickMutation(tw);
        return true;
      }
      record.anomalies.push(`слияние не удалось: ${source.id} ${source.col},${source.row} → ${target.col},${target.row}`);
      return false;
    };
    const buy = async (choice) => {
      const { type, cell } = choice;
      let st = await getState(page);
      if (st.state !== 'playing') return { ok: false, ended: true };
      // Карточка выбранной башни лежит поверх кнопок башен: сначала закрываем её (крестик), иначе нажатие по кнопке башни попало бы в карточку (например, в «Продать»)
      if (st.ui.card.visible) {
        await clickCard(st.ui.card.close);
        st = await pollUntil(page, (x) => !x.ui.card.visible || x.state !== 'playing', 800);
        if (st.state !== 'playing') return { ok: false, ended: true };
        if (st.ui.card.visible) return { ok: false, reason: 'карточка не закрылась' };
      }
      const before = st.towers.length;
      const coinsBefore = st.coins;
      if (st.selected !== type) {
        const b = st.ui.towerButtons.find((x) => x.id === type);
        if (!b) return { ok: false, reason: 'нет кнопки башни' };
        await input.tap(g2c(b.x, b.y));
        st = await pollUntil(page, (x) => x.selected === type || x.state !== 'playing', 1000);
        if (st.state !== 'playing') return { ok: false, ended: true };
        if (st.selected !== type) return { ok: false, reason: 'кнопка не выбралась' };
      }
      if (!(await ensureVisible(cell.col, cell.row))) return { ok: false, reason: 'клетки нет на экране' };
      await input.tap(await cellPos(cell.col, cell.row));
      st = await pollUntil(page, (x) => x.towers.length > before || x.state !== 'playing', 1500);
      if (st.towers.length > before) {
        const tower = st.towers.find((tw) => tw.col === cell.col && tw.row === cell.row);
        if (!tower || tower.id !== type) record.anomalies.push(`поставилась не та башня или не в ту клетку: ждали ${type} в ${cell.key}`);
        else if (Math.abs(tower.remaining - cell.rem) > 2) record.anomalies.push(`расстояние до организма у клетки ${cell.key}: бот ${Math.round(cell.rem)}, игра ${Math.round(tower.remaining)}`);
        const drop = coinsBefore - st.coins;
        if (drop > TABLE[type].price + 0.5) record.anomalies.push(`монеты упали на ${drop}, а цена ${type} по таблице ${TABLE[type].price}`);
        record.spent += TABLE[type].price;
        if (tower && TABLE[type].targeting === 'beam' && profile === 'expert') await aimTower(st, tower, cell);
        return { ok: true, tower };
      }
      if (st.state !== 'playing') return { ok: false, ended: true };
      return { ok: false, reason: st.coins < TABLE[type].price ? 'не хватило монет (цена в таблице бота неверна?)' : 'игра не приняла башню' };
    };

    // 3) главный цикл
    const bad = new Set(); // клетки, где не вышло
    const waveSeen = { wave: 0 };
    const timeline = [];
    const lifeLossWaves = [];
    let lastLives = s.lives;
    let minLives = s.lives;
    let maxOnMap = 0;
    let nextDecisionAt = 0;
    let lastElapsed = -1;
    let lastProgressReal = Date.now();
    let lastBeat = Date.now();
    let result = null;
    let last = s;
    for (;;) {
      checkConsole();
      s = await getState(page);
      last = s;
      if (s.state === 'info') {
        // Плашка перед волной с новым типом: закрыть тапом и продолжить (игровое время на ней стоит — сторож «время не идёт» не должен сработать)
        s = await closePlaques();
        lastProgressReal = Date.now();
        continue;
      }
      if (s.state === 'won' || s.state === 'lost') {
        result = s.state;
        break;
      }
      if (s.elapsed >= MAX_GAME_SEC || (Date.now() - realStart) / 1000 >= MAX_REAL_SEC) {
        result = 'timeout';
        break;
      }
      if (s.elapsed > lastElapsed + 1e-9) {
        lastElapsed = s.elapsed;
        lastProgressReal = Date.now();
      } else if (Date.now() - lastProgressReal > STALL_SEC * 1000) {
        const info = await page
          .evaluate(
            () =>
              new Promise((resolve) => {
                let frames = 0;
                const t0 = performance.now();
                const loop = () => (performance.now() - t0 > 1500 ? resolve(`кадров браузера за 1,5 с: ${frames}, вкладка ${document.visibilityState}, фокус ${document.hasFocus()}`) : (frames++, requestAnimationFrame(loop)));
                requestAnimationFrame(loop);
                setTimeout(() => resolve('страница не отвечает (кадров нет)'), 4000);
              }),
          )
          .catch((e) => `страница не отвечает: ${String(e).slice(0, 80)}`);
        throw new Error(`Игровое время не идёт ${STALL_SEC} с (состояние «${s.state}», волна ${s.wave}, башен ${s.towers.length}, на карте ${s.bacteria.length}) — партия зависла; ${info}; последние сообщения консоли: ${recentConsole.join(' | ') || 'нет'}`);
      }
      if (VERBOSE && Date.now() - lastBeat > 30000) {
        lastBeat = Date.now();
        console.log(`      … ${PROFILE_TITLES[profile]} #${run}: реальных ${Math.round((lastBeat - realStart) / 1000)} с, игровых ${s.elapsed.toFixed(0)} с, волна ${s.wave}/${s.waveTotal}, башен ${s.towers.length}, монет ${s.coins}, жизни ${s.lives}, бактерий на карте ${s.bacteria.length}`);
      }
      if (s.wave !== waveSeen.wave) {
        waveSeen.wave = s.wave;
        timeline.push({ wave: s.wave, t: Math.round(s.elapsed), coins: s.coins, towers: s.towers.length, lives: s.lives });
      }
      if (s.lives < lastLives) {
        for (let k = 0; k < lastLives - s.lives; k++) lifeLossWaves.push(s.wave);
        lastLives = s.lives;
      }
      minLives = Math.min(minLives, s.lives);
      maxOnMap = Math.max(maxOnMap, s.bacteria.length);

      if (s.state === 'playing' && s.elapsed >= nextDecisionAt) {
        const decisionStart = s.elapsed; // следующее решение — через 2 игровые секунды ОТ НАЧАЛА этого (тап тоже занимает время)
        // Слияния и мутации (бесплатные) — раньше покупок: сначала башни, ждущие выбора мутации, потом одно слияние
        const waiting = s.towers.find((tw) => tw.pending !== null);
        if (waiting && (await pickMutation(waiting))) {
          nextDecisionAt = decisionStart + DECIDE_EVERY[profile];
          continue;
        }
        if (await mergeOnce(s)) {
          nextDecisionAt = decisionStart + DECIDE_EVERY[profile];
          continue;
        }
        s = await getState(page);
        for (let attempt = 0; attempt < 3; attempt++) {
          const occupied = new Set(s.towers.map((tw) => `${tw.col},${tw.row}`));
          const view = {
            s,
            coins: s.coins,
            towers: s.towers,
            free: WORLD.cells.filter((c) => !c.path && !occupied.has(c.key) && !bad.has(c.key)),
            covCount: WORLD.coverCounts(s.towers),
          };
          const choice = player.decide(view);
          if (!choice) break;
          const res = await buy(choice);
          if (res.ok) {
            player.bought(choice);
            record.builds.push({ t: Math.round(s.elapsed), type: choice.type, col: choice.cell.col, row: choice.cell.row });
            if (VERBOSE) console.log(`      + ${PROFILE_TITLES[profile]} #${run}: ${(NAMES[choice.type] ?? choice.type).padEnd(8)} клетка ${choice.cell.col},${choice.cell.row}  (игровое время ${s.elapsed.toFixed(0)} с, волна ${s.wave}, монет было ${s.coins})`);
            break; // не больше одной покупки за решение
          }
          if (res.ended) break;
          record.failures.push(`${choice.type} ${choice.cell.key}: ${res.reason}`);
          bad.add(choice.cell.key);
          s = await getState(page);
        }
        nextDecisionAt = decisionStart + DECIDE_EVERY[profile];
        continue;
      }
      await sleep(POLL_MS);
    }
    checkConsole();
    if (SHOTS) {
      const dir = path.join(ROOT, 'qa', 'bot-results', `${TAG}-shots`);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${profile}-${run}-${result}.png`) });
    }
    const counts = {};
    for (const id of KNOWN_TOWERS) counts[id] = last.towers.filter((tw) => tw.id === id).length;
    const startCoins = (cfgGet('economy.startCoins') ?? readConfigNumber('economy', 'startCoins')) + (metaLevels ? metaLevels.coins * META.upgrades.coins.perLevel : 0);
    return {
      profile,
      run,
      result,
      wave: last.wave,
      waveTotal: last.waveTotal,
      lives: last.lives,
      maxLives: last.maxLives,
      shieldAbsorbed: last.shieldAbsorbed ?? 0,
      minLives,
      lifeLossWaves,
      kills: last.kills,
      leaked: last.leaked,
      spawned: last.spawned,
      coins: last.coins,
      earned: last.coins + record.spent - startCoins,
      spent: record.spent,
      towers: counts,
      towerTotal: last.towers.length,
      maxOnMap,
      gameSec: Math.round(last.elapsed * 10) / 10,
      realSec: Math.round((Date.now() - realStart) / 100) / 10,
      timeline,
      merges: record.merges,
      mergeMisses: record.mergeMisses,
      picks: record.picks,
      levels: last.towers.reduce((acc, tw) => ((acc[tw.level] = (acc[tw.level] ?? 0) + 1), acc), {}),
      builds: record.builds,
      failures: record.failures,
      anomalies: record.anomalies,
      warnings: [...new Set(warnings)],
    };
  } finally {
    await context.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ итоги

const RESULT_RU = { won: 'победа', lost: 'проигрыш', timeout: 'timeout', error: 'ОШИБКА' };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : '—');
const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)} %` : '—');

function gameLine(g, runs) {
  const head = `[${PROFILE_TITLES[g.profile]} ${g.run}/${runs}]`;
  if (g.result === 'error') return `${head} ОШИБКА: ${g.error}`;
  const towers = KNOWN_TOWERS.map((id) => `${SHORT[id] ?? id} ${g.towers[id]}`).join(' ');
  const merged = g.merges || g.mergeMisses || g.picks ? ` · слияний ${g.merges} (мимо ${g.mergeMisses ?? 0}), мутаций ${g.picks}` : '';
  return `${head} ${RESULT_RU[g.result]} · волна ${g.wave}/${g.waveTotal} · жизни ${g.lives}/${g.maxLives} · убито ${g.kills}, дошло ${g.leaked} · монеты ${g.coins} · башни ${towers}${merged} · игра ${f1(g.gameSec)} с · реал. ${f1(g.realSec)} с`;
}

function summarize(games) {
  const out = {};
  for (const profile of PROFILES) {
    const own = games.filter((g) => g.profile === profile && g.result !== 'error');
    if (!own.length) continue;
    const losses = own.filter((g) => g.result === 'lost');
    out[profile] = {
      games: own.length,
      won: own.filter((g) => g.result === 'won').length,
      lost: losses.length,
      timeout: own.filter((g) => g.result === 'timeout').length,
      winRate: own.filter((g) => g.result === 'won').length / own.length,
      avgLivesLost: mean(own.map((g) => g.maxLives - g.lives)),
      avgLossWave: mean(losses.map((g) => g.wave)),
      avgTowers: Object.fromEntries(KNOWN_TOWERS.map((id) => [id, mean(own.map((g) => g.towers[id]))])),
      avgTowerTotal: mean(own.map((g) => g.towerTotal)),
      avgCoinsEnd: mean(own.map((g) => g.coins)),
      avgEarned: mean(own.map((g) => g.earned)),
      avgRealSec: mean(own.map((g) => g.realSec)),
      avgGameSec: mean(own.map((g) => g.gameSec)),
      avgKills: mean(own.map((g) => g.kills)),
      avgLeaked: mean(own.map((g) => g.leaked)),
      avgMerges: mean(own.map((g) => g.merges ?? 0)),
      avgMergeMisses: mean(own.map((g) => g.mergeMisses ?? 0)),
    };
  }
  return out;
}

function printSummary(summary) {
  const cols = ['Профиль', 'Партий', 'Побед', 'Потеряно жизней', 'Волна гибели', `Башни (${KNOWN_TOWERS.map((id) => SHORT[id] ?? id).join('/')})`, 'Монеты в конце', 'Слияний (мимо)', 'Реал. время партии'];
  const rows = Object.entries(summary).map(([profile, x]) => [
    PROFILE_TITLES[profile],
    `${x.games}${x.timeout ? ` (timeout ${x.timeout})` : ''}`,
    `${x.won}/${x.games} (${pct(x.winRate)})`,
    f1(x.avgLivesLost),
    x.lost ? f1(x.avgLossWave) : '—',
    KNOWN_TOWERS.map((id) => f1(x.avgTowers[id])).join(' / '),
    f1(x.avgCoinsEnd),
    `${f1(x.avgMerges)} (${f1(x.avgMergeMisses)})`,
    `${f1(x.avgRealSec)} с (игра ${f1(x.avgGameSec)} с)`,
  ]);
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(widths[i])).join(' │ ');
  console.log(line(cols));
  console.log(widths.map((w) => '─'.repeat(w)).join('─┼─'));
  for (const r of rows) console.log(line(r));
}

// ------------------------------------------------------------------ запуск

let server;
try {
  server = await startServer('dist-qa');
} catch (error) {
  die(error.message, 1);
}
const startedAt = new Date();
const games = [];
/** Серии партий (--campaign): профиль, номер серии, сколько партий сыграно, номер партии первой победы (null — не победил за N), волна гибели в каждой партии, купленные улучшения. */
const series = [];
/** Дорожки «лестницы» (--ladder): по одной на пару «профиль + номер»; состояние дорожки передаётся между задачами через --state-in / --state-out. */
const ladderLanes = [];
const ladderState = { lanes: {} };
const resultsDir = path.join(ROOT, 'qa', 'bot-results');
fs.mkdirSync(resultsDir, { recursive: true });
const resultsFile = path.join(resultsDir, `${TAG}.json`);
const saveResults = () => {
  const payload = {
    tag: TAG,
    startedAt: startedAt.toISOString(),
    args: { profiles: PROFILES, runs: RUNS, speed: SPEED, level: LEVEL, exclude: [...EXCLUDE], cfg: CFG_STRING, seed: SEED, maxGameSec: MAX_GAME_SEC, campaign: CAMPAIGN, meta: META_FIXED },
    campaign: CAMPAIGN ? { n: CAMPAIGN, series, metaTable: META } : undefined,
    ladder: LADDER ? { k: LADDER, from: LADDER_FROM, to: LADDER_TO, lanes: ladderLanes, metaTable: META } : undefined,
    towerTable: TABLE,
    summary: summarize(games),
    games,
  };
  fs.writeFileSync(resultsFile, JSON.stringify(payload, null, 1));
  if (LADDER && STATE_OUT) fs.writeFileSync(path.resolve(STATE_OUT), JSON.stringify(ladderState, null, 1));
};

let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) process.exit(130);
  stopRequested = true;
  console.log('\n⏹  Получен сигнал остановки: дожидаюсь конца текущей партии и печатаю итог (ещё раз Ctrl+C — выйти сразу).');
});

console.log(`Бот-замерщик: профили ${PROFILES.map((p) => PROFILE_TITLES[p]).join(', ')}; партий на профиль ${RUNS}; speed ${SPEED}; потолок ${MAX_GAME_SEC} игровых с; seed ${SEED}`);
console.log(`  башни из config.ts${CFG_STRING ? ' с подменой --cfg' : ''}: ${KNOWN_TOWERS.map((id) => `${NAMES[id] ?? id} ${TABLE[id].price}₽/${TABLE[id].targeting === 'beam' ? 'луч' : `${TABLE[id].range}px`}`).join(', ')}`);
console.log(`  уровень ${LEVEL}: открыты башни ${KNOWN_TOWERS.filter((id) => (TOWER_UNLOCK[id] ?? 1) <= LEVEL).map((id) => NAMES[id] ?? id).join(', ')}`);
if (EXCLUDE.size) console.log(`  не строят: ${[...EXCLUDE].map((id) => NAMES[id] ?? id).join(', ')}`);
if (CFG_STRING) console.log(`  подмена чисел (--cfg): ${CFG_STRING}`);
if (SPEED > 2) console.log(`  ⚠ speed ${SPEED} выше 2: замеры грубее (кадры крупнее, бот тратит больше игрового времени на тап). Для итоговых чисел баланса используйте speed 2.`);
if (EXCLUDE.has('pill') && PROFILES.includes('novice')) console.log('  ⚠ «новичок» строит только Таблетки: без неё он ничего не построит.');

/**
 * Одна дорожка «лестницы»: идёт по уровням от следующего непройденного до LADDER_TO; на уровне играет до LADDER партий до первой победы.
 * После партии: очки за волны и победу + очки за новые звёзды (как в игре), затем жадная покупка улучшений (после победы на уровне N открыт
 * уровень N + 1, поэтому ветки башен покупаются по нему). Не выиграла за LADDER партий — дорожка «застряла» (stuckAt) и дальше не идёт.
 * Возвращает false, если замер надо остановить (консоль игры сообщила о проблеме).
 */
async function ladderLane(profile, run) {
  const key = `${profile}:${run}`;
  const saved = STATE_IN ? JSON.parse(fs.readFileSync(path.resolve(STATE_IN), 'utf8')).lanes?.[key] : null;
  const lane = saved
    ? { ...saved, levels: { ...emptyLevels(), ...saved.levels }, stars: [...saved.stars], perLevel: [...saved.perLevel] }
    : { profile, run, dna: 0, levels: emptyLevels(), stars: Array(10).fill(0), nextLevel: 1, stuckAt: null, perLevel: [] };
  ladderLanes.push(lane);
  ladderState.lanes[key] = lane;
  const tag = `${PROFILE_TITLES[profile]} дорожка ${run}`;
  if (lane.stuckAt) {
    console.log(`[${tag}] застряла на уровне ${lane.stuckAt}: дальше не идёт`);
    return true;
  }
  if (lane.nextLevel < LADDER_FROM) die(`Состояние дорожки ${key}: следующий уровень ${lane.nextLevel}, а --from-level=${LADDER_FROM}: пропущены уровни.`);
  for (let level = Math.max(LADDER_FROM, lane.nextLevel); level <= LADDER_TO; level++) {
    const rec = { level, games: 0, firstWin: null, waves: [], results: [], stars: 0, dnaIn: lane.dna, levelsIn: { ...lane.levels }, bought: [], dnaGained: [] };
    lane.perLevel.push(rec);
    for (let n = 1; n <= LADDER; n++) {
      if (stopRequested) return true;
      let game = null;
      for (let attempt = 1; attempt <= 2 && !game; attempt++) {
        try {
          game = await playGame(browser, server.url, profile, run, lane.levels, `:L${level}:${n}`, level);
        } catch (error) {
          if (error instanceof FatalConsole) {
            fatal = `Остановлено: дорожка «${tag}», уровень ${level}, партия ${n}, консоль игры сообщила о проблеме. Замер с такой партией был бы недостоверным.\n   ${error.message}`;
            return false;
          }
          console.log(`   ⚠ [${tag}, уровень ${level}, партия ${n}] сбой (попытка ${attempt}): ${error.message.split('\n')[0]}`);
          if (!browser.isConnected()) browser = await launchBrowser();
          if (attempt === 2) game = { profile, run, result: 'error', error: error.message.split('\n')[0], realSec: 0 };
        }
      }
      Object.assign(game, { ladderLevel: level, ladderGame: n, metaLevels: { ...lane.levels }, dnaBefore: lane.dna });
      games.push(game);
      rec.games = n;
      if (game.result === 'error') {
        console.log(`[${tag}, уровень ${level}, партия ${n}] ОШИБКА: ${game.error}`);
        rec.results.push('error');
        lane.stuckAt = level;
        saveResults();
        return true;
      }
      const stars = starsOf(game);
      const newStars = Math.max(0, stars - lane.stars[level - 1]);
      if (stars > lane.stars[level - 1]) lane.stars[level - 1] = stars;
      const gained = dnaForGame(game) + newStars * STARS_RULE.dna;
      lane.dna += gained;
      const buy = buyUpgrades(lane.levels, lane.dna, game.result === 'won' ? Math.min(10, level + 1) : level);
      lane.levels = buy.levels;
      lane.dna = buy.dna;
      rec.waves.push(game.result === 'won' ? game.waveTotal : game.wave);
      rec.results.push(game.result);
      rec.bought.push(buy.bought);
      rec.dnaGained.push(gained);
      console.log(`[${tag}, уровень ${level}, партия ${n}] ${RESULT_RU[game.result]} · волна ${game.wave}/${game.waveTotal} · жизни ${game.lives}/${game.maxLives}${stars ? ` · звёзд ${stars}` : ''} · очков ДНК +${gained} (остаток ${lane.dna}) · куплено ${buy.bought.length ? buy.bought.join(', ') : '—'} · слияний ${game.merges} (мимо ${game.mergeMisses}) · игра ${game.gameSec} с, реал. ${game.realSec} с`);
      for (const a of game.anomalies ?? []) console.log(`      ⚠ ${a}`);
      saveResults();
      if (game.result === 'won') {
        rec.firstWin = n;
        rec.stars = lane.stars[level - 1];
        break;
      }
    }
    rec.dnaOut = lane.dna;
    rec.levelsOut = { ...lane.levels };
    if (!rec.firstWin) {
      lane.stuckAt = level;
      console.log(`[${tag}] победы на уровне ${level} за ${LADDER} партий нет: дорожка застряла`);
      saveResults();
      return true;
    }
    lane.nextLevel = level + 1;
    saveResults();
  }
  return true;
}

let browser = await launchBrowser();
let fatal = null;
let exitCode = 0;
try {
  outer: for (let run = 1; run <= RUNS; run++) {
    for (const profile of PROFILES) {
      if (stopRequested) break outer;
      if (LADDER) {
        if (!(await ladderLane(profile, run + RUN_OFFSET))) break outer;
        continue;
      }
      if (CAMPAIGN) {
        // ---- серия партий: очки ДНК копятся, улучшения покупаются между партиями; серия кончается первой победой или после CAMPAIGN партий
        let levels = emptyLevels();
        let dna = 0;
        const entry = { profile, run, games: 0, firstWin: null, waves: [], bought: [], error: null };
        for (let n = 1; n <= CAMPAIGN; n++) {
          if (stopRequested) break;
          let game = null;
          for (let attempt = 1; attempt <= 2 && !game; attempt++) {
            try {
              game = await playGame(browser, server.url, profile, run, levels, `:${n}`);
            } catch (error) {
              if (error instanceof FatalConsole) {
                fatal = `Остановлено: в серии «${PROFILE_TITLES[profile]} ${run}», партия ${n}, консоль игры сообщила о проблеме. Замер с такой партией был бы недостоверным.\n   ${error.message}`;
                break outer;
              }
              console.log(`   ⚠ [${PROFILE_TITLES[profile]} серия ${run}, партия ${n}] сбой (попытка ${attempt}): ${error.message.split('\n')[0]}`);
              if (!browser.isConnected()) browser = await launchBrowser();
              if (attempt === 2) game = { profile, run, result: 'error', error: error.message.split('\n')[0], realSec: 0 };
            }
          }
          Object.assign(game, { series: run, game: n, metaLevels: { ...levels }, dnaBefore: dna });
          games.push(game);
          entry.games = n;
          if (game.result === 'error') {
            entry.error = game.error;
            console.log(`[${PROFILE_TITLES[profile]} серия ${run}, партия ${n}] ОШИБКА: ${game.error}`);
            break;
          }
          entry.waves.push(game.result === 'won' ? game.waveTotal : game.wave);
          const gained = dnaForGame(game);
          dna += gained;
          const buy = buyUpgrades(levels, dna);
          levels = buy.levels;
          dna = buy.dna;
          entry.bought.push(buy.bought);
          console.log(`[${PROFILE_TITLES[profile]} серия ${run}, партия ${n}] ${RESULT_RU[game.result]} · волна ${game.wave}/${game.waveTotal} · очков ДНК +${gained} (остаток ${dna}) · куплено ${buy.bought.length ? buy.bought.join(', ') : '—'} · уровни ${Object.entries(levels).map(([id, v]) => `${id} ${v}`).join(', ')} · слияний ${game.merges} (мимо ${game.mergeMisses}) · игра ${game.gameSec} с, реал. ${game.realSec} с`);
          for (const a of game.anomalies ?? []) console.log(`      ⚠ ${a}`);
          if (game.result === 'won') {
            entry.firstWin = n;
            break;
          }
        }
        series.push(entry);
        console.log(`[${PROFILE_TITLES[profile]} серия ${run}/${RUNS}] ${entry.firstWin ? `первая победа в партии ${entry.firstWin}` : `победы за ${entry.games} парт. нет`}`);
        saveResults();
        continue;
      }
      let game = null;
      for (let attempt = 1; attempt <= 2 && !game; attempt++) {
        try {
          game = await playGame(browser, server.url, profile, run, META_FIXED);
        } catch (error) {
          if (error instanceof FatalConsole) {
            fatal = `Остановлено: в партии «${PROFILE_TITLES[profile]} ${run}» консоль игры сообщила о проблеме. Замер с такой партией был бы недостоверным.\n   ${error.message}`;
            break outer;
          }
          console.log(`   ⚠ [${PROFILE_TITLES[profile]} ${run}] сбой (попытка ${attempt}): ${error.message.split('\n')[0]}`);
          if (!browser.isConnected()) browser = await launchBrowser();
          if (attempt === 2) game = { profile, run, result: 'error', error: error.message.split('\n')[0], realSec: 0 };
        }
      }
      games.push(game);
      console.log(gameLine(game, RUNS));
      for (const a of game.anomalies ?? []) console.log(`      ⚠ ${a}`);
      if (game.failures?.length) console.log(`      ℹ не вышло поставить: ${game.failures.length} раз (${[...new Set(game.failures)].slice(0, 3).join('; ')})`);
      saveResults();
    }
  }
} catch (error) {
  console.error(`❌ Бот упал: ${error.stack ?? error.message}`);
  exitCode = 1;
} finally {
  await Promise.race([browser.close().catch(() => {}), sleep(8000)]);
  await server.close().catch(() => {});
}
saveResults();

if (fatal) {
  console.error(`\n❌ ${fatal}`);
  console.error(`   Частичный итог сохранён: ${path.relative(ROOT, resultsFile)}`);
  process.exit(3);
}

if (LADDER) {
  console.log('\nИТОГ ЛЕСТНИЦЫ (партий до первой победы по уровням)');
  for (const lane of ladderLanes) {
    const parts = lane.perLevel.map((r) => `${r.level}: ${r.firstWin ? r.firstWin : `—(${r.games})`}`);
    console.log(`  ${PROFILE_TITLES[lane.profile]} ${lane.run}: ${parts.join(' · ')}${lane.stuckAt ? ` · застряла на уровне ${lane.stuckAt}` : ''} · очков ${lane.dna}`);
  }
} else if (CAMPAIGN) {
  console.log('\nИТОГ ПО СЕРИЯМ ПАРТИЙ (номер партии первой победы)');
  for (const profile of PROFILES) {
    const own = series.filter((x) => x.profile === profile && !x.error);
    if (!own.length) continue;
    const wins = own.filter((x) => x.firstWin);
    console.log(`  ${PROFILE_TITLES[profile]}: серий ${own.length}, побед в серии ${wins.length}, первая победа в партии: ${wins.length ? `в среднем ${f1(mean(wins.map((x) => x.firstWin)))} (${wins.map((x) => x.firstWin).join(', ')})` : '—'}; волны по партиям: ${own.map((x) => `[${x.waves.join(' ')}]`).join(' ')}`);
  }
} else {
  console.log('\nИТОГ ПО ПРОФИЛЯМ');
  printSummary(summarize(games));
}
const warningsAll = [...new Set(games.flatMap((g) => g.warnings ?? []))];
const anomaliesAll = games.flatMap((g) => g.anomalies ?? []);
const failuresAll = games.flatMap((g) => g.failures ?? []);
if (warningsAll.length) console.log(`\nПредупреждения консоли игры (не остановили замер): ${warningsAll.slice(0, 5).join(' | ')}`);
if (anomaliesAll.length) console.log(`Расхождения с моделью бота: ${anomaliesAll.length} (см. строки ⚠ выше)`);
if (failuresAll.length) console.log(`Не вышло поставить башню: ${failuresAll.length} раз за все партии`);
const errors = games.filter((g) => g.result === 'error').length;
if (errors) console.log(`⚠ Партий с ошибкой (не вошли в таблицу): ${errors}`);
const timeouts = games.filter((g) => g.result === 'timeout').length;
if (timeouts) console.log(`⚠ Партий по потолку времени (timeout): ${timeouts}`);
console.log(`\nРезультат: ${path.relative(ROOT, resultsFile)}`);
process.exit(exitCode || (errors ? 1 : 0));
