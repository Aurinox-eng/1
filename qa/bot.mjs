/**
 * БОТ-ЗАМЕРЩИК БАЛАНСА (tower defense). Играет целые партии в тестовую сборку (`npm run build:qa`, режим ?qa) ТОЛЬКО через интерфейс:
 * колесо мыши (карта целиком), клик по кнопке башни на панели, клик по клетке — как игрок. Состояние читает только для решений
 * (монеты, башни, волна), ничего в игре не подкручивает. Печатает по строке на партию и итоговую таблицу по профилям;
 * машиночитаемый итог — qa/bot-results/<tag>.json (дописывается после каждой партии; в git не коммитить).
 *
 * Запуск (сначала `npm run build:qa`; если src новее dist-qa, скрипт остановится сам):
 *   node qa/bot.mjs [--strategy=default|zone] [--solo=X] [--pair=a,b] [--focus=a,b] [--mut=башня:мутация,мутация;…] [--runs=N] [--speed=2] [--exclude=…]
 *                   [--cfg=путь:число,...] [--tag=имя] [--seed=N] [--max-game-sec=2400] [--verbose] [--shots] [--help]
 *
 * Профиль один — expert («эксперт», решение владельца 19 октября 2026: ориентир сложности — сильнейшая найденная игра). Стратегии эксперта:
 *   default  по кругу [Шипучка, Таблетка, Сироп, Шприц, Таблетка, Шипучка, Шприц, Сироп, Таблетка] после «начала партии» (пока башен с уроном меньше двух — самая дешёвая башня с уроном);
 *            клетка — лучшая именно для этой башни (охват с учётом того, сколько бактерий там проходит; Шипучка — где сходятся ветки; Шприц — клетка и направление луча, под которым
 *            больше всего дорожки с бактериями, после постановки бот поворачивает башню), копит на дорогую башню до 30 игровых секунд, решает каждые 2 с, сливает всё;
 *   zone     Таблетки и один Сироп только вокруг последней развилки у организма (на «корнях» — узел Z, на «Горле» — развилка F);
 *   --solo=X «каждая башня одна» (раздел 10.1 документа дизайна): строит только X (с --exclude=syrup — без Сиропа; без него — X и один Сироп);
 *   --pair=a,b «каждая пара»: только башни a и b по кругу [a, b];
 *   --focus=a,b «сосредоточение на связке»: только a и b, все башни вида — кучкой в радиусе слияния, слияния до IV.
 * Мутации: --mut=pill:pillRapid,pillDouble;fizz:fizzFast,fizzAcid (id из config.ts, по порогам); по умолчанию — `DEFAULT_MUT` ниже (лучшие по урону в секунду с потолками п. 4.2).
 * Башни открываются узлами древа (уровни улучшений — адресом &meta=); «Лихорадку» (если узел куплен) бот включает, когда босс или мини-босс в радиусе башни с уроном.
 *
 * НОВЫЕ БАШНИ (этап 7, пачка 1; когда открыты — кнопка без замка, узел башни в древе): эксперт
 * докупает их НАД своим кругом. Считают в «обычных башнях» (башня уровня L = 2^(L−1) штук): Ампула — одна на каждые 3–4 Таблетки (первая при 3 Таблетках,
 * дальше при 7, 10, 14…), клетка — с наибольшей длиной дорожки в радиусе башни (радиус 520 px из таблицы: Ампула видит полкарты; охват уже накрытого другими башнями не скидывается,
 * а сама Ампула в «накрытые» участки не записывается — иначе она обесценила бы клетки остальных башен); Антибиотик — по одной на каждые 2 Таблетки, но не раньше, чем стоят ≥ 3 Таблетки
 * и 1 Сироп (если Сироп вообще доступен), клетка — как у Таблетки (радиус из таблицы). Ждут монет на них, как на любую дорогую башню (терпение профиля). Слияние — по общим правилам
 * (пара одноимённых башен 1-го уровня в радиусе слияния; клетка выбирается предпочтительно рядом с такой башней). Мутации на порогах — первая из двух. Новые типы бактерий
 * (Прыгун, Фагоцит) бот отдельно не обрабатывает.
 *
 * НОВЫЕ БАШНИ (этап 7, пачка 2; Лампа и Витамин): эксперт докупает их НАД кругом после Ампулы и Антибиотика.
 * Лампа (`cone`, 200 px; конус 50° сам поворачивается на ближайшую к организму бактерию) — одна на каждые 4 «обычные» Таблетки (первая при 4); клетка — где конус в лучшем из 8 направлений
 * накрывает больше всего длины дорожки, по которой идут бактерии (с весом веток и скидкой за уже накрытое, вдвое ценнее участки
 * у узлов слияния, где бактерии идут толпой): это клетка рядом с дорожкой у поворота, где путь проходит перед башней длинной дугой.
 * Витамин (`aura`, радиус 235 px; сам не стреляет и урона у него нет — damage и cooldownMs в таблице 0, формулы бота на них не делят) — не раньше, чем стоят ≥ 3 стреляющие башни
 * (урон или яд; Сироп и Витамин не считаются), первый при трёх, дальше по одному на каждые 4 стреляющие башни; клетка — в центре группы: свободная клетка, в радиусе ауры от которой стоит больше всего
 * башен (стреляющие — по их числу «обычных» башен, Сироп — вдвое меньше; уже усиленные другим Витамином — вчетверо меньше), не меньше двух стреляющих; при равенстве — ближе к ним. Нет клетки с двумя башнями —
 * Витамин не покупается, пока башни не соберутся в группу. В бюджете Витамин учитывается как любая башня (цена в `spent`). Витамин и Лампа сливаются и берут мутации по общим правилам; мутации — «Узкий пучок» → «Раскал»
 * у Лампы и «Усиление» → «Сильное усиление» у Витамина (выбираются по названиям из config.ts, а не по номерам — перестановка строк не подменит выбор). От бактерий пачки 2 (Скрытная, Токсин) бот особой
 * стратегии не имеет: Скрытную башни видят только в 60 % радиуса, облако Токсина глушит башни — это замер и должен показать.
 *
 * НОВЫЕ БАШНИ (этап 7, пачка 3; Холод и Пластырь): докупаются НАД кругом после Витамина. Это башни управления: damage у обеих 0
 * (Холод — заморозка `freeze`, Пластырь — ловушка `trap`), в «стреляющие» они не считаются, а формулы бота на damage и cooldownMs для них не делят.
 * Холод (радиус 170 px, `freeze`) — не раньше, чем стоят ≥ 3 стреляющие башни, дальше по одному на каждые 3 стреляющие; клетка — с наибольшим охватом дорожки в радиусе (длина × доля бактерий на ветке,
 * участки у узлов слияния вдвое ценнее: толпа): это клетка у поворота или у слияния веток. Пластырь (радиус 200 px, `trap`) — не раньше, чем стоят ≥ 5 стреляющих башен, дальше по одному на каждые 5;
 * клетка — с большим охватом дорожки, но ближе к организму (оценка охвата умножается на 1 − 0,5·(расстояние до организма / наибольшее): ловушка держит первую, самую опасную бактерию).
 * Мутации — по названиям из config.ts: Холод «Глубокая заморозка» → «Долгий мороз», Пластырь «Скорый» → «Едкий». От бактерий пачки 3 (Мутант запоминает вид башни и принимает половину урона от повторных
 * ударов того же вида; Паразит присасывается к башне и замедляет её) бот особой стратегии не имеет — замер и должен показать, мешают ли они.
 *
 * СЛИЯНИЕ (правило игры с 8 октября 2026): две одинаковые башни (вид и уровень) сливаются, только если расстояние между их центрами
 * не больше mergeRadiusPx (состояние игры, 235 px мира ≈ 3 новые клетки); башни, ждущие выбора мутации, не сливаются; у получившейся башни мутации обеих складываются.
 * Поэтому эксперт (сливает всё, до предела игры), покупая башню, ПРЕДПОЧИТАЕТ хорошую клетку
 * в радиусе слияния от стоящей башни того же вида и уровня 1 (клетка не хуже MERGE_NEAR_SHARE от лучшей по оценке; Сироп и Шприц — строже, MERGE_NEAR_SHARE_PICKY),
 * а слияние делают, только когда такая пара есть. Если пары нет — не сливают, а «слияния мимо» (mergeMisses: группа ≥ 2 одинаковых башен, но ни одной пары в радиусе;
 * одна и та же группа считается один раз) показывают, хватает ли боту пар.
 *
 * Все решения принимаются не чаще, чем раз в 2 секунды ИГРОВОГО времени (как человек). Состояние опрашивается каждые ~120 мс реального времени.
 * Генератор случайных чисел бота — с --seed (игра сама случайна: путь на развилках выбирается наугад, поэтому нужно ≥ 10 партий на стратегию).
 *
 * ВАЖНО: --speed выше 2 делает замер грубее (кадр игры считается не длиннее 50 мс реального времени, шаг ×speed; башни и бактерии
 * «дёргаются» крупнее, а бот тратит больше игрового времени на каждый тап). Для итоговых чисел баланса — speed 2; для проб — 4.
 * Боты запускать по одному, не параллельно.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  branchOpen,
  buyBest,
  createInput,
  dnaWavesReward,
  GAME_H as H,
  GAME_W as W,
  launchBrowser,
  makeGraphGeometry,
  parseArgs,
  readConfigNumber,
  readMutationIds,
  readTowerTable,
  readMetaTable,
  towerNodeId,
  ROOT,
  sleep,
  startServer,
} from './lib.mjs';

// ------------------------------------------------------------------ параметры бота

const POLL_MS = 120; // опрос состояния, мс реального времени
const FEVER_BTN = { x: 1280 - 52, y: 40 + 50 }; // кнопка «Лихорадки», px экрана игры (src/scenes/GameScene.ts: FEVER_BTN)
const VIEW = { x: 0, y: 40, w: 1280, h: 568 }; // окно карты между верхней (40 px) и нижней (112 px) полосами, px экрана игры (src/config.ts: map.topH, map.bottomH)
const PATIENCE_SEC = 30; // эксперт: столько секунд игрового времени ждёт монет на дорогую приоритетную башню, потом берёт доступное
const EXPERT_NOISE = 0.03; // шум оценки клеток (доля): идеально одинаковых партий не бывает
const DECIDE_EVERY_SEC = 2; // как часто эксперт принимает решения, игровых секунд
const OVERLAP_DISCOUNT = 0.5; // охват, уже накрытый другой башней, ценится в столько раз (для луча Шприца без «умной» оценки)
const SYRUP_OVERLAP = 0.8; // …но замедляющей башне выгодно стоять там, где уже стреляют: скидка мягче
const FIZZ_BY_WAVE = 5; // эксперт копит на первую Шипучку, пока идёт не позже этой волны (рой — с 4-й), даже если уже потерял жизни: Таблетками рой всё равно не остановить
const EXPERT_OVERLAP = 0.9; // эксперт знает, что все дорожки сходятся у «ствола» у организма: охват, уже накрытый другой башней, почти не обесценивается (башни кучкой у ствола бьют ВСЕХ бактерий)
const EXPERT_ADJACENT_FACTOR = 1; // … и соседство с другой башней ему не мешает
const OPENING_DAMAGE_TOWERS = 2; // эксперт: пока башен с уроном меньше стольких, покупают самую дешёвую башню с уроном (Таблетку), а не Сироп/дорогую по списку
const CALM_MAX_BACTERIA = 8; // они копят монеты на дорогую башню только в спокойной обстановке: жизни целы и на карте не больше стольких бактерий; иначе берут первую доступную
const MERGE_NEAR_SHARE = 0.8; // слияние по радиусу: покупая башню, профиль выбирает среди клеток с оценкой не хуже этой доли от лучшей ту, что в радиусе слияния от башни того же вида и 1-го уровня
const MERGE_NEAR_SHARE_PICKY = 0.9; // … для Сиропа и Шприца (луч) доля строже: качеством клетки жертвуют меньше
const MERGE_NEAR_MARGIN = 0.98; // клетка считается «в радиусе», если расстояние до центра башни ≤ mergeRadiusPx × это (запас от округлений)
const AIM_STEPS = 8; // «Шприц»: сколько направлений луча (тап по башне — шаг 45°; как AIM_STEPS в src/level.ts; 0 — вправо, дальше по часовой стрелке)
const BEAM_MARGIN_PX = 22; // «Шприц»: насколько дальше полуширины луча от линии выстрела может лежать середина дорожки, чтобы луч её задел (как в игре)
const MERGE_ZONE_PX = 170; // «Шипучка»: участки дорожки ближе этого к узлу слияния считаются «кучей»
const MERGE_FACTOR = 2; // … и ценятся вдвое
// Мутации по умолчанию (раздел 10.1 документа дизайна, п. 1): лучшие по урону в секунду с потолками п. 4.2 (урон от мутаций не выше ×2,5) — id из config.ts по порогам (2-й и 4-й уровень башни).
// Таблетка: «Скорострел» (пауза ×0,65) и «Двойной выстрел» (+1 цель) — вместе упираются в потолок ×2,5; Сироп: «Липкая» и «Две капли»; Шипучка: «Быстрая» и «Кислота»; Шприц: «Бронебойный» (урон ×1,5,
// без брони) и «Второй луч»; Ампула: «Скорострел» и «Мощь»; Антибиотик: «Быстрый приём» и «Сильный яд»; Лампа: «Узкий пучок» и «Раскал»; Витамин: «Усиление» и «Сильное усиление»; Холод: «Глубокая заморозка»
// и «Долгий мороз»; Пластырь: «Скорый» и «Едкий». Другой набор — ключом --mut (выбор сверяется с таблицей мутаций: неизвестный id останавливает замер).
const DEFAULT_MUT = {
  pill: ['pillRapid', 'pillDouble'],
  syrup: ['syrupSticky', 'syrupTwin'],
  fizz: ['fizzFast', 'fizzAcid'],
  syringe: ['syringePierce', 'syringeTwin'],
  ampule: ['ampuleRapid', 'ampuleMight'],
  antibiotic: ['antibioticQuick', 'antibioticStrong'],
  lamp: ['lampNarrow', 'lampBlaze'],
  vitamin: ['vitaminBoost', 'vitaminStrong'],
  frost: ['frostDeep', 'frostLong'],
  patch: ['patchQuick', 'patchCaustic'],
};
// Новые башни (этап 7): сколько «обычных» Таблеток приходится на одну Ампулу (3–4: первая при 3 Таблетках, дальше при 7, 10, 14…), на один Антибиотик, и что нужно Антибиотику до первой покупки
const AMPULE_PILLS_PER = 3.5;
const ANTIBIOTIC_PILLS_PER = 2;
const ANTIBIOTIC_MIN_PILLS = 3;
const ANTIBIOTIC_MIN_SYRUPS = 1;
// Башни пачки 2 (этап 7): Лампа — одна на каждые LAMP_PILLS_PER «обычных» Таблеток (первая при стольких же); Витамин — не раньше VITAMIN_MIN_FIGHTING стреляющих башен, дальше по одному на каждые VITAMIN_FIGHTING_PER,
// в центре группы: в радиусе его ауры (из таблицы башни) должно стоять не меньше VITAMIN_MIN_GROUP стреляющих башен
const LAMP_PILLS_PER = 4;
const LAMP_PREP_WAVE = 8; // --lamps: с этой волны эксперт знает, что скоро выйдут скрытные, и ставит Лампы раньше Ампулы
const LAMP_PILLS_PER_STEALTH = 2; // --lamps: одна Лампа на каждые 2 Таблетки (обычно — на 4)
const LAMP_MAX_STEALTH = 3; // --lamps: не больше стольких «обычных» Ламп (Лампа — детектор, docs/lamp-plan.md: смешанный набор с 1–3 Лампами)
const LAMP_LEAD_WAVES = 3; // --lamps=veteran: Лампы начинают покупать за столько волн до выхода скрытных
const VITAMIN_MIN_FIGHTING = 3;
const VITAMIN_FIGHTING_PER = 4;
const VITAMIN_MIN_GROUP = 2;
const VITAMIN_SYRUP_WEIGHT = 0.5; // Сироп в группе Витамина считается за полбашни (ускорение лужи полезно, но урона у Сиропа нет)
const VITAMIN_COVERED_WEIGHT = 0.25; // башня, которую уже усиливает другой Витамин, считается за четверть (второй Витамин её не ускорит: эффекты не складываются)
// Башни пачки 3 (этап 7; управление, урона нет): Холод — не раньше FROST_MIN_FIGHTING стреляющих башен, дальше по одному на каждые FROST_FIGHTING_PER; Пластырь — то же с PATCH_MIN_FIGHTING и PATCH_FIGHTING_PER.
// «Стреляющих» считается штуками (как у Витамина), Холод и Пластырь, Сироп и Витамин в счёт не идут.
const FROST_MIN_FIGHTING = 3;
const FROST_FIGHTING_PER = 3;
const PATCH_MIN_FIGHTING = 5;
const PATCH_FIGHTING_PER = 5;
const PATCH_NEAR_ORGANISM = 0.5; // Пластырь: оценка клетки × (1 − это × расстояние до организма / наибольшее) — клетки ближе к организму ценятся до 2 раз выше
const CONTROL_TOWERS = ['frost', 'patch']; // башни управления: клетку выбирает controlSpot, а не охват «по умолчанию»
const CONE_MARGIN_DEG = 6; // Лампа: запас к половине угла конуса при подсчёте охвата (бактерия шире своей середины; конус поворачивается на цель)
const STALL_SEC = 30; // игровое время не идёт столько реальных секунд подряд — партия зависла

const NAMES = { pill: 'Таблетка', syrup: 'Сироп', fizz: 'Шипучка', syringe: 'Шприц', ampule: 'Ампула', antibiotic: 'Антибиотик', lamp: 'Лампа', vitamin: 'Витамин', frost: 'Холод', patch: 'Пластырь' };
const SHORT = { pill: 'Таб', syrup: 'Сир', fizz: 'Шип', syringe: 'Шпр', ampule: 'Амп', antibiotic: 'Ант', lamp: 'Лмп', vitamin: 'Вит', frost: 'Хол', patch: 'Пла' };
/** Профиль один — эксперт; название строки итогов — эксперт и его стратегия. */
const PROFILE = 'expert';
const PROFILE_TITLE = 'эксперт';
// «Всё у Z» (стратегия zone): Таблетки и один Сироп только вокруг последней развилки у организма — узла, из которого рёбра идут в организм (у «корней» — Z, у «Горла» — F); точка берётся из сети дорожек игры
const ZONE_TOWERS = new Set(['pill', 'syrup']);
const ZONE_CYCLE = ['pill', 'pill', 'syrup', 'pill'];
const DEFAULT_CYCLE = ['fizz', 'pill', 'syrup', 'syringe', 'pill', 'fizz', 'syringe', 'syrup', 'pill']; // после «начала партии» (две башни с уроном); рой требует Шипучку — она первая

// шум видеодрайвера контейнера (как в smoke.mjs): к игре не относится
const ENV_NOISE = /GL Driver Message|GPU stall|swiftshader|SwiftShader|Automatic fallback to software WebGL/i;

// ------------------------------------------------------------------ разбор параметров

const HELP = `Бот-замерщик баланса: играет целые партии через интерфейс игры (тестовая сборка, режим ?qa). Профиль один — expert («эксперт»).

  node qa/bot.mjs [параметры]

  --strategy=default|zone|solo:X|pair:a+b|focus:a+b   стратегия эксперта (по умолчанию default; zone — Таблетки и один Сироп у последней развилки у организма; остальные — как ключи ниже)
  --solo=<башня>                        «каждая башня одна»: строит только эту башню (и не больше одного Сиропа; с --exclude=syrup — без Сиропа); башня должна быть открыта (узел древа в --meta или &towers не нужны: бот сам добавит узел)
  --pair=a,b                            «каждая пара»: только башни a и b, по кругу
  --focus=a,b                           «сосредоточение на связке»: только a и b, башни одного вида кучкой в радиусе слияния, слияния до IV
  --mut=башня:мутация,мутация;…         мутации на порогах (id из config.ts), например pill:pillRapid,pillDouble;fizz:fizzBig,fizzChain; не названные башни — по умолчанию (DEFAULT_MUT); --mut=alt — второй набор (на каждом пороге другой вариант)
  --runs=N                              партий (по умолчанию 10)
  --speed=2                             ускорение игрового времени, 0.1…5 (по умолчанию 2)
  --exclude=башня,…                     каких башен эксперт не строит
  --cfg=путь:число,...                  подмена чисел игры без правки config.ts (бот учтёт подмену цен и радиусов; непонятная запись останавливает замер)
  --tag=имя                             имя файла результата qa/bot-results/<имя>.json (по умолчанию latest)
  --seed=N                              зерно генератора случайных чисел бота
  --max-game-sec=2400                   потолок игрового времени одной партии (уровень 1 — 50 волн ≈ 1450 с); дольше — «timeout»
  --max-real-sec=3600                   потолок реального времени одной партии
  --verbose, --shots                    печатать покупки; снимок экрана в конце партии
  --level=N                             номер уровня (1…10, по умолчанию 1); партия идёт по составу волн и карте своего уровня (адрес получает &levelwaves)
  --meta=id:уровень,…                   улучшения вне партии (id из meta.upgrades, в том числе узлы башен towerSyrup…, «Лихорадка» fever); без параметра — нет. Не сочетается с --campaign и --ladder
  --campaign=N                          серия до N партий подряд на одном уровне: после партии — очки ДНК по правилам игры и покупки в лучшем порядке (крупные узлы первыми, затем прирост силы на очко); до первой победы
  --ladder=K                            «лестница»: уровни подряд, на уровне до K партий до первой победы, между партиями — очки ДНК и покупки в лучшем порядке
  --ladder-total, --ladder-budget-sec, --ladder-last, --run-offset, --from-level, --to-level, --state-in, --state-out   участки лестницы между задачами GitHub (как раньше)
  --lamps[=1|veteran|first]             Лампы против скрытных (как раньше)
  --farm                                (лестница) контроль «фарма»: повтор пройденного уровня после первой победы
  --norender, --canvas                  не рисовать сцену / рисовать через canvas
  --help                                эта справка

Сначала соберите тестовую игру: npm run build:qa.`;

const args = parseArgs(process.argv.slice(2));
const die = (message, code = 2) => {
  console.error(`❌ ${message}`);
  process.exit(code);
};
if (args.help || args.h) {
  console.log(HELP);
  process.exit(0);
}
const KNOWN = new Set(['profile', 'strategy', 'pair', 'focus', 'mut', 'runs', 'speed', 'exclude', 'cfg', 'tag', 'seed', 'max-game-sec', 'max-real-sec', 'verbose', 'shots', 'canvas', 'norender', 'level', 'meta', 'campaign', 'ladder', 'ladder-total', 'ladder-budget-sec', 'ladder-last', 'from-level', 'to-level', 'state-in', 'state-out', 'run-offset', 'solo', 'lamps', 'farm', 'help']);
for (const key of Object.keys(args)) if (!KNOWN.has(key)) die(`Неизвестный параметр --${key}. Справка: node qa/bot.mjs --help`);

function numArg(name, fallback, { min = -Infinity, max = Infinity, int = false } = {}) {
  if (args[name] === undefined) return fallback;
  const value = Number(args[name]);
  if (args[name] === true || !Number.isFinite(value) || value < min || value > max || (int && !Number.isInteger(value))) {
    die(`--${name}=«${args[name] === true ? '' : args[name]}»: нужно ${int ? 'целое ' : ''}число от ${min} до ${max}.`);
  }
  return value;
}

// Профиль один (решение владельца 19 октября 2026): --profile принимается только как expert (прежние novice, average, strong убраны); zone — стратегия (--strategy=zone; --profile=zone читается так же)
if (args.profile !== undefined && !['expert', 'zone'].includes(String(args.profile))) die(`--profile=«${args.profile}»: профиль один — expert (стратегии — --strategy, --solo, --pair, --focus).`);
// --strategy: default | zone | solo:X | pair:a+b | focus:a+b (то же, что --solo=X, --pair=a,b, --focus=a,b; так стратегию задаёт одно поле workflow)
const STRATEGY_SPEC = String(args.strategy ?? (args.profile === 'zone' ? 'zone' : 'default'));
const specMatch = /^(solo|pair|focus):([\w+,]+)$/.exec(STRATEGY_SPEC);
if (!specMatch && !['default', 'expert', 'zone'].includes(STRATEGY_SPEC)) die(`--strategy=«${STRATEGY_SPEC}»: есть default, zone, solo:X, pair:a+b, focus:a+b.`);
if (specMatch && args[specMatch[1]] !== undefined) die(`--strategy=${STRATEGY_SPEC} и --${specMatch[1]} вместе не задаются.`);
if (specMatch) args[specMatch[1]] = specMatch[2].replace(/\+/g, ',');
const STRATEGY = STRATEGY_SPEC === 'zone' ? 'zone' : 'default';
const listArg = (name) => (args[name] === undefined || args[name] === true ? null : String(args[name]).split(',').map((x) => x.trim()).filter(Boolean));
const PAIR = listArg('pair');
const FOCUS = listArg('focus');
if ((PAIR && PAIR.length !== 2) || (FOCUS && FOCUS.length !== 2)) die('--pair и --focus: две башни через запятую, например --pair=pill,fizz.');
/** Стратегия партии (метка в итогах): default, zone, solo:X, pair:a+b, focus:a+b. */
const STRATEGY_LABEL = (PAIR ? `pair:${PAIR.join('+')}` : FOCUS ? `focus:${FOCUS.join('+')}` : args.solo !== undefined ? `solo:${args.solo}` : STRATEGY) + (args.mut === 'alt' ? ' · мутации alt' : args.mut !== undefined ? ' · мутации --mut' : '');
const PROFILES = [PROFILE];
const profileTitle = () => `${PROFILE_TITLE}${STRATEGY_LABEL === 'default' ? '' : ` (${STRATEGY_LABEL})`}`;
const RUNS = numArg('runs', 10, { min: 1, max: 1000, int: true });
const SPEED = numArg('speed', 2, { min: 0.1, max: 5 });
if (args.speed !== undefined && SPEED > 5) die('--speed не выше 5.');
const MAX_GAME_SEC = numArg('max-game-sec', 2400, { min: 30, max: 100000 });
const MAX_REAL_SEC = numArg('max-real-sec', 3600, { min: 30, max: 100000 });
const LEVEL = numArg('level', 1, { min: 1, max: 10, int: true });
const CAMPAIGN = numArg('campaign', 0, { min: 0, max: 40, int: true }); // 0 — обычный замер одной партии; N — серия до N партий с улучшениями
// «Лестница» (docs/stage-5b-plan.md, Фаза Б): игрок идёт по уровням подряд; на каждом играет до LADDER партий до первой победы, между партиями получает очки ДНК и докупает улучшения
const LADDER = numArg('ladder', 0, { min: 0, max: 20, int: true });
// Всего партий на уровне до «застряла» (по умолчанию = LADDER): LADDER — сколько партий этот запуск, остальные доигрывает следующий запуск с --state-in (дорожка помнит `resume`): предел задачи GitHub 5 ч 50 мин не даёт сыграть 20 партий за раз
const LADDER_TOTAL = numArg('ladder-total', 0, { min: 0, max: 40, int: true }) || LADDER;
// Бюджет реального времени запуска, секунд (0 — без бюджета): перед новой партией бот проверяет, успеет ли она закончиться (по самой долгой из уже сыгранных в этом запуске); не успевает — партии уровня на этом запуске кончаются
// (уровень доиграет следующий запуск, если он есть), задача не обрывается пределом GitHub 5 ч 50 мин. --ladder-last — последний запуск уровня: недоигранный уровень считается «застряла».
const LADDER_BUDGET_SEC = numArg('ladder-budget-sec', 0, { min: 0, max: 100000 });
const LADDER_LAST = args['ladder-last'] === true;
const PROCESS_START = Date.now();
// --farm: контроль «фарма» очков ДНК (решение владельца 13 октября, docs/tester-feedback-plan.md): после первой победы на уровне L дорожка играет одну повторную партию на
// пройденном уровне (L − 1, у первого уровня — он же) со всеми башнями, открытыми к уровню L; очки за неё и время только записываются, на дорожку не переходят.
const FARM = args.farm !== undefined && args.farm !== '0' && args.farm !== false;
const LADDER_FROM = numArg('from-level', 1, { min: 1, max: 10, int: true });
const LADDER_TO = numArg('to-level', 10, { min: 1, max: 10, int: true });
const RUN_OFFSET = numArg('run-offset', 0, { min: 0, max: 1000, int: true }); // номер дорожки лестницы = номер партии в --runs + это число (дорожки разных задач получают разные номера)
const STATE_IN = args['state-in'] === undefined || args['state-in'] === true ? null : String(args['state-in']);
const STATE_OUT = args['state-out'] === undefined || args['state-out'] === true ? null : String(args['state-out']);
if (LADDER && (CAMPAIGN || args.meta !== undefined || args.level !== undefined)) die('--ladder не сочетается с --campaign, --meta и --level: уровни и улучшения ведёт сам бот (участок уровней — --from-level, --to-level).');
if (!LADDER && (args['from-level'] !== undefined || args['to-level'] !== undefined || args['run-offset'] !== undefined || STATE_IN || STATE_OUT)) die('--from-level, --to-level, --run-offset, --state-in, --state-out работают только вместе с --ladder=K.');
if (FARM && !LADDER) die('--farm работает только вместе с --ladder=K.');
if (LADDER_FROM > LADDER_TO) die('--from-level не может быть больше --to-level.');
// --lamps: true / «1» — прежний вариант (prep8), «veteran», «first»
const LAMP_MODE = args.lamps === undefined || args.lamps === '0' ? null : args.lamps === true || args.lamps === '1' ? 'prep8' : String(args.lamps);
if (LAMP_MODE !== null && !['prep8', 'veteran', 'first'].includes(LAMP_MODE)) die(`--lamps=«${LAMP_MODE}»: есть 1, veteran, first.`);
const LAMPS = LAMP_MODE !== null;
/** Волна выхода скрытных на уровне — из таблицы `levels.specs` в src/config.ts (null — на уровне их нет); нужна режиму --lamps=veteran. */
function stealthIntroWave(level) {
  const lines = fs.readFileSync(path.join(ROOT, 'src/config.ts'), 'utf8').split('\n');
  const start = lines.findIndex((l) => /^\s*specs:\s*\[/.test(l));
  if (start < 0) return null;
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const text = line.trim();
    if (text.startsWith(']')) break;
    if (text.startsWith('{')) rows.push(text);
  }
  const found = /\bstealth:\s*(\d+)/.exec(rows[level - 1] ?? '');
  return found ? Number(found[1]) : null;
}
const SOLO_SUPPORT = ['vitamin', 'frost', 'patch']; // не бьют сами: идут поверх Таблеток
const SOLO = args.solo === undefined ? null : String(args.solo);
if (SOLO !== null && (args.solo === true || !SOLO)) die('--solo=<башня>: после «=» нужен id башни, например --solo=fizz.');
if (LAMP_MODE === 'veteran' && LADDER) die('--lamps=veteran не сочетается с --ladder: волна выхода скрытных берётся с одного уровня (--level).');
const STEALTH_WAVE = LAMP_MODE === 'veteran' ? stealthIntroWave(LEVEL) : null;
if (LAMP_MODE === 'veteran' && STEALTH_WAVE === null) console.warn(`--lamps=veteran: на уровне ${LEVEL} нет скрытных — Лампы не покупаются`);
if (LAMPS && SOLO) die('--lamps не сочетается с --solo (при --solo башни выбирает сам режим).');
if (SOLO && (LADDER || CAMPAIGN)) die('--solo не сочетается с --ladder и --campaign: сравнение «одна башня» идёт на одном уровне с фиксированными улучшениями (--meta).');
const SEED = args.seed === undefined ? Math.floor(Math.random() * 1e9) : numArg('seed', 0, { min: 0, max: 4294967295, int: true });
const TAG = args.tag === undefined ? 'latest' : String(args.tag);
if (!/^[\w-]+$/.test(TAG)) die(`Неверный --tag=«${TAG}»: только буквы, цифры, «_» и «-».`);
const VERBOSE = Boolean(args.verbose);
const SHOTS = Boolean(args.shots);

const TABLE = readTowerTable(); // из config.ts; подмена --cfg накладывается ниже
const KNOWN_TOWERS = Object.keys(TABLE);
const EXCLUDE = new Set(
  args.exclude === undefined || args.exclude === true
    ? []
    : String(args.exclude)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
);
if (SOLO && (!KNOWN_TOWERS.includes(SOLO) || SOLO === 'syrup')) die(`--solo: нет такой башни «${SOLO}». Есть: ${KNOWN_TOWERS.filter((id) => id !== 'syrup').join(', ')}.`);
for (const id of [...(PAIR ?? []), ...(FOCUS ?? [])]) if (!KNOWN_TOWERS.includes(id)) die(`--pair/--focus: нет башни «${id}». Есть: ${KNOWN_TOWERS.join(', ')}.`);
if ([SOLO, PAIR, FOCUS].filter(Boolean).length > 1 || (STRATEGY === 'zone' && (SOLO || PAIR || FOCUS))) die('--solo, --pair, --focus и --strategy=zone — разные стратегии: выберите одну.');
/** Какие башни строит игрок: --solo — сама башня, Сироп (не больше одного; если не исключён) и, если башня не бьёт сама, Таблетки; --pair и --focus — две башни. null — все. */
const SOLO_ALLOWED = SOLO ? new Set([SOLO, 'syrup', ...(SOLO === 'pill' || SOLO_SUPPORT.includes(SOLO) ? ['pill'] : [])]) : PAIR ? new Set(PAIR) : FOCUS ? new Set(FOCUS) : null;
/** Круг покупок стратегии (вместо DEFAULT_CYCLE): --solo — Сироп один раз, дальше основа; --pair и --focus — две башни по очереди. */
const SOLO_CYCLE = SOLO ? (SOLO_SUPPORT.includes(SOLO) ? ['pill', 'pill', 'syrup', 'pill'] : [SOLO, 'syrup', SOLO]) : PAIR ? [...PAIR] : FOCUS ? [...FOCUS] : null;
/** Башни, которые стратегия должна иметь открытыми: узлы древа добавляются к улучшениям партии (иначе кнопка башни в игре закрыта). */
const STRATEGY_TOWERS = [...(SOLO ? [SOLO, ...(excludesSyrup() ? [] : ['syrup'])] : []), ...(PAIR ?? []), ...(FOCUS ?? [])].filter((id) => id !== 'pill');
function excludesSyrup() {
  return String(args.exclude ?? '').split(',').map((x) => x.trim()).includes('syrup');
}
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

// Мутации: id по порогам (DEFAULT_MUT, поверх — --mut=башня:id,id;…) → номера вариантов в карточке по таблице мутаций config.ts (readMutationIds); id не нашёлся на своём пороге — замер останавливается
const MUTATION_IDS = readMutationIds();
const MUT_IDS = { ...DEFAULT_MUT };
// --mut=alt — второй набор (раздел 10.2: «2 набора мутаций»): на каждом пороге — другой из двух вариантов, чем в DEFAULT_MUT
const MUT_ALT = args.mut === 'alt';
if (MUT_ALT) for (const [towerId, ids] of Object.entries(DEFAULT_MUT)) MUT_IDS[towerId] = ids.map((id, tier) => (MUTATION_IDS[towerId]?.[tier] ?? []).find((x) => x !== id) ?? id);
else if (args.mut !== undefined) {
  if (args.mut === true) die('--mut=башня:мутация,мутация;… — после «=» нужна запись, например pill:pillRapid,pillDouble');
  for (const part of String(args.mut).split(';').filter(Boolean)) {
    const [towerId, list] = part.split(':');
    if (!TABLE[towerId] || !list) die(`--mut: не понял «${part}». Нужно башня:мутация,мутация (башни: ${KNOWN_TOWERS.join(', ')})`);
    MUT_IDS[towerId] = list.split(',').map((x) => x.trim());
  }
}
/** Номер варианта мутации (0/1) на каждом пороге для каждой башни. */
const MUT_PICKS = {};
for (const [towerId, ids] of Object.entries(MUT_IDS)) {
  if (!TABLE[towerId]) continue;
  const picks = ids.map((id, tier) => MUTATION_IDS[towerId]?.[tier]?.indexOf(id) ?? -1);
  if (picks.some((index) => index < 0)) die(`Мутации «${towerId}»: в config.ts на порогах нет вариантов ${ids.join(', ')} (есть ${JSON.stringify(MUTATION_IDS[towerId])}) — поправьте --mut или DEFAULT_MUT в qa/bot.mjs.`);
  MUT_PICKS[towerId] = picks;
}

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
/** Первые победы над боссами и «без потерь» по уровням — то, что игра хранит в сохранении (бот передаёт улучшения адресом, сохранение не пишется, поэтому ведёт их сам). */
const emptyProgress = () => ({ bossWins: Array(10).fill(0), flawless: Array(10).fill(0) });

/**
 * Очки ДНК за партию — как `dnaParts` в src/meta.ts (документ дизайна, раздел 6): за волны (2k + 0,1·k(k+1)) × множитель уровня; добавка за первую победу на уровне без босса; перевод остатка монет (только при победе);
 * первые победы над мини-боссами и боссом (биты `game.bossBits` против `progress.bossWins`); «без потерь» один раз; не меньше `floor`. Повтор пройденного уровня: волны и монеты × replayFactor.
 * `progress` (bossWins, flawless) обновляется. Возвращает число очков.
 */
function dnaForGame(game, replay = false, progress = emptyProgress(), level = LEVEL) {
  const D = META.dna;
  const won = game.result === 'won';
  const cleared = won ? game.waveTotal : Math.max(0, game.wave - 1);
  const full = dnaWavesReward(D, cleared, level);
  const coinsRaw = won && D.coinsPerPoint > 0 ? Math.min(Math.floor(Math.max(0, Math.floor(game.coins ?? 0)) / D.coinsPerPoint), Math.floor(full * D.coinsCapShare)) : 0;
  const fresh = (game.bossBits ?? 0) & ~(progress.bossWins[level - 1] ?? 0);
  let bosses = 0;
  for (let bit = 0; bit < 4; bit++) if (fresh & (1 << bit)) bosses += D.miniBossFirst;
  if (fresh & (1 << 4)) bosses += D.bossFirst;
  const lost = Math.max(0, game.maxLives - game.lives) + (game.shieldAbsorbed ?? 0);
  const flawless = won && lost <= 1e-9 && !progress.flawless[level - 1] ? Math.round(full * D.flawlessShare) : 0;
  const waves = replay ? Math.floor(full * D.replayFactor) : full;
  const coins = replay ? Math.floor(coinsRaw * D.replayFactor) : coinsRaw;
  const win = won && !replay && !game.hasBoss ? D.winBonus : 0;
  progress.bossWins[level - 1] = (progress.bossWins[level - 1] ?? 0) | (game.bossBits ?? 0);
  if (flawless > 0) progress.flawless[level - 1] = 1;
  return Math.max(D.floor, waves + win + coins + bosses + flawless);
}

/** Сколько очков ДНК ещё не потрачено в древе улучшений при уровнях `levels`: { all — всё древо (все ветки), open — только открытые ветки (ветка башни — после узла башни) }. */
function treeLeft(levels) {
  let all = 0;
  let open = 0;
  for (const [id, u] of Object.entries(META.upgrades)) {
    const rest = u.prices.slice(levels[id] ?? 0).reduce((a, b) => a + b, 0);
    all += rest;
    if (branchOpen(u.branch, levels)) open += rest;
  }
  return { all, open };
}

/** Покупка очков ДНК между партиями в лучшем найденном порядке (`buyBest` в qa/lib.mjs: крупные узлы первыми, затем наибольший прирост силы на очко ДНК). */
function buyUpgrades(levels, dna) {
  return buyBest({ upgrades: META.upgrades, levels, dna, towers: BUY_TOWERS });
}
/** Башни, узлы и ветки которых покупает стратегия (null — все): --solo/--pair/--focus — свои башни и Таблетка (основа), zone — Таблетка и Сироп; без исключённых (--exclude). */
const BUY_TOWERS = SOLO_ALLOWED ? [...new Set(['pill', ...SOLO_ALLOWED])].filter((id) => !EXCLUDE.has(id) || id === 'pill') : STRATEGY === 'zone' ? [...ZONE_TOWERS] : EXCLUDE.size ? KNOWN_TOWERS.filter((id) => !EXCLUDE.has(id)) : null;

/** Узлы башен, которые стратегия открывает для замера первой попытки (раздел 10.2 документа дизайна: «без улучшений вне партии, но с открытыми башнями набора»): --solo/--pair/--focus — свои башни;
 *  default — башни уровня 1 (Сироп, Шипучка, Шприц), zone — Сироп. В лестнице и серии партий башни покупаются за очки ДНК, эти узлы не добавляются. */
const OPEN_NODES = (() => {
  const towers = STRATEGY_TOWERS.length || SOLO ? STRATEGY_TOWERS : STRATEGY === 'zone' ? ['syrup'] : ['syrup', 'fizz', 'syringe'];
  return Object.fromEntries(towers.filter((id) => !EXCLUDE.has(id)).map((id) => [towerNodeId(id), 1]));
})();
/** Улучшения одиночной партии (без --ladder и --campaign): --meta (не названные — 0) и поверх — узлы башен стратегии (OPEN_NODES). */
const SINGLE_META = (() => {
  const levels = META_FIXED ? { ...META_FIXED } : emptyLevels();
  for (const [id, n] of Object.entries(OPEN_NODES)) if (id in levels) levels[id] = Math.max(levels[id], n);
  return levels;
})();


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
  const maxRem = Math.max(0, ...cells.map((c) => c.rem));
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

  /**
   * Отрезки дорожки в конусе Лампы из клетки в направлении dir (номер 0…7): середина отрезка не дальше длины конуса и в пределах половины угла конуса плюс CONE_MARGIN_DEG (кэш; ключ — и длина конуса:
   * улучшения ветки башни меняют радиус).
   */
  const coneCache = new Map();
  const coneOf = (type, cell, dir) => {
    const T = TABLE[type];
    const key = `${type}|${Math.round(T.range)}|${cell.idx}|${dir}`;
    if (!coneCache.has(key)) {
      const [dx, dy] = dirs[dir];
      const cosMin = Math.cos(((T.coneDeg / 2 + CONE_MARGIN_DEG) * Math.PI) / 180);
      const list = [];
      for (let i = 0; i < segs.length; i++) {
        const px = segs[i].x - cell.x;
        const py = segs[i].y - cell.y;
        const dist = Math.hypot(px, py);
        if (dist > T.range) continue;
        if (dist < 1 || (px * dx + py * dy) / dist >= cosMin) list.push(i);
      }
      coneCache.set(key, list);
    }
    return coneCache.get(key);
  };
  /**
   * Лучшее направление конуса из клетки: сколько длины дорожки он накрывает. weighted — с весом «сколько бактерий идёт по ветке» и скидкой за уже накрытое (covCount); smart — скидка мягче и участки у узлов
   * слияния (толпа) вдвое ценнее. Лампа сама поворачивается на цель, поэтому берётся лучшее из направлений: клетка у поворота, где путь идёт перед башней длинной дугой, выигрывает у клетки у прямого участка.
   */
  const bestCone = (type, cell, weighted, covCount, smart = false) => {
    let best = 0;
    for (let dir = 0; dir < AIM_STEPS; dir++) {
      let value = 0;
      for (const si of coneOf(type, cell, dir)) {
        const sg = segs[si];
        if (!sideOk(TABLE[type], cell, sg)) continue;
        let v = weighted ? sg.len * sg.w * Math.pow(smart ? EXPERT_OVERLAP : OVERLAP_DISCOUNT, covCount ? covCount[si] : 0) : sg.len;
        if (weighted && smart && sg.merge) v *= MERGE_FACTOR;
        value += v;
      }
      if (value > best) best = value;
    }
    return best;
  };

  /** Подходит ли отрезок башне по стороне («вперёд» — бактериям до организма дальше, чем башне; «назад» — ближе). */
  const sideOk = (T, cell, sg) => (T.side === 'forward' ? sg.rem > cell.rem : T.side === 'back' ? sg.rem < cell.rem : true);

  // «Всё у Z» (стратегия zone): последняя развилка у организма — узел, из которого рёбра идут в организм (выход); при нескольких — тот, через который идёт больше бактерий
  const exitSet = new Set(graph.exits ?? []);
  const zoneScore = new Map();
  for (const e of edges) if (exitSet.has(e.to)) zoneScore.set(e.from, { w: (zoneScore.get(e.from)?.w ?? 0) + (geo.prob.get(e.id) ?? 0), x: e.pts[0][0], y: e.pts[0][1], node: e.from });
  const zone = [...zoneScore.values()].sort((a, b) => b.w - a.w)[0] ?? { x: 0, y: 0, node: null };

  return {
    cells,
    segs,
    byKey,
    bestAim,
    zone,
    freeCount: cells.filter((c) => !c.path).length,
    /** «Охват» клетки для башни type: сколько длины дорожки (px) попадает в радиус (для «вперёд/назад» — только нужная сторона). */
    cover(type, cell) {
      const T = TABLE[type];
      if (T.targeting === 'beam') return bestAim(type, cell, false).value;
      if (T.targeting === 'aura') return 0; // Витамин ничего не бьёт: охвата дорожки у него нет (его клетку выбирает vitaminSpot по соседним башням)
      if (T.targeting === 'cone') return bestCone(type, cell, false);
      let sum = 0;
      for (const si of inRange(T.range)[cell.idx]) if (sideOk(T, cell, segs[si])) sum += segs[si].len;
      return sum;
    },
    /**
     * Охват клетки башней управления (Холод, Пластырь): сумма длин отрезков дорожки в радиусе башни × доля бактерий на ветке; у Холода участки у узлов слияния (толпа) вдвое ценнее; у Пластыря оценка
     * ещё умножается на 1 − PATCH_NEAR_ORGANISM × (rem клетки / наибольший rem): клетки ближе к организму лучше. Урона у этих башен нет — на damage и cooldownMs здесь не делим.
     */
    controlScore(type, cell) {
      const T = TABLE[type];
      let sum = 0;
      for (const si of inRange(T.range)[cell.idx]) {
        const sg = segs[si];
        let v = sg.len * sg.w;
        if (type === 'frost' && sg.merge) v *= MERGE_FACTOR;
        sum += v;
      }
      if (type === 'patch') sum *= 1 - PATCH_NEAR_ORGANISM * (maxRem > 0 ? cell.rem / maxRem : 0);
      return sum;
    },
    /**
     * Оценка клетки: охват с весом «сколько бактерий здесь ходит» и скидкой за уже накрытое другими башнями (covCount);
     * Шипучка — вдвое ценнее участки у узлов слияния; Шприц — ценность лучшего направления луча (длина дорожки под лучом с весом
     * веток и скидкой за уже накрытое; smart = false — просто длина).
     */
    strongScore(type, cell, covCount, smart = true) {
      const T = TABLE[type];
      if (T.targeting === 'beam') return bestAim(type, cell, smart, covCount).value;
      if (T.targeting === 'aura') return 0;
      if (T.targeting === 'cone') return bestCone(type, cell, true, covCount, smart);
      if (T.targeting === 'snipe') {
        // Ампула: радиус огромный (полкарты) — важна длина дорожки в круге; скидка за «уже накрытое» не нужна (накрыто почти всё); список отрезков в круге — из кэша inRange
        let total = 0;
        for (const si of inRange(T.range)[cell.idx]) if (sideOk(T, cell, segs[si])) total += segs[si].len * segs[si].w;
        return total;
      }
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
        if (!cell || !T || T.targeting === 'snipe' || T.targeting === 'aura' || T.targeting === 'freeze' || T.targeting === 'trap') continue; // Ампула накрывает полкарты: в «накрытое другими башнями» её не записываем, иначе клетки остальных башен обесценятся; Витамин, Холод и Пластырь урона не наносят и дорожку не «накрывают»
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
function makePlayer({ world, rng, buttons }) {
  const zone = STRATEGY === 'zone'; // «всё у Z»: только Таблетки и один Сироп, клетки — ближайшие к последней развилке у организма
  const available = (id) => TABLE[id] && buttons.includes(id) && !EXCLUDE.has(id) && (!SOLO_ALLOWED || SOLO_ALLOWED.has(id)) && (!zone || ZONE_TOWERS.has(id));
  const cycle = zone ? ZONE_CYCLE : SOLO_CYCLE ?? DEFAULT_CYCLE;
  /** Проверка «клетка в радиусе слияния от стоящей башни этого вида 1-го уровня (мутация не ждёт)»; null — таких башен нет (тогда как раньше). */
  const nearPartner = (view, type) => {
    const radius = (view.s.mergeRadiusPx ?? 0) * MERGE_NEAR_MARGIN;
    const partners = view.towers.filter((tw) => tw.id === type && tw.level === 1 && tw.pending === null && tw.level < view.s.maxTowerLevel);
    if (!radius || !partners.length) return null;
    return (cell) => partners.some((tw) => Math.hypot(tw.x - cell.x, tw.y - cell.y) <= radius);
  };

  /** Сколько «обычных» башен вида id стоит (башня уровня L — это 2^(L−1) штук). */
  const unitsOf = (view, id) => view.towers.filter((tw) => tw.id === id).reduce((sum, tw) => sum + 2 ** ((tw.level ?? 1) - 1), 0);
  const extraGaveUp = new Set(); // новые башни, для которых клеток с охватом не нашлось: больше не пробуем
  /** Стреляющая башня (урон или яд): Сироп и Витамин не в счёте (у Витамина damage и cooldownMs — 0, он сам не стреляет). */
  const isFighting = (tw) => (TABLE[tw.id]?.damage ?? 0) > 0 || (TABLE[tw.id]?.dotPerSec ?? 0) > 0;
  /**
   * Клетка для Витамина — «центр группы»: свободная клетка, в радиусе ауры (радиус башни из таблицы, но не больше радиуса слияния) от которой стоит больше всего башен: стреляющая — за её число «обычных» башен,
   * Сироп — за VITAMIN_SYRUP_WEIGHT от него, уже усиленная другим Витамином (auraMul < 1) — за VITAMIN_COVERED_WEIGHT; нужно не меньше VITAMIN_MIN_GROUP стреляющих башен в радиусе. При равенстве — клетка
   * ближе к охваченным башням. Возвращает { cell, score } или null (подходящей клетки нет).
   */
  const vitaminSpot = (view) => {
    const T = TABLE.vitamin;
    if (!T) return null;
    const reach = Math.min(T.range, view.s.mergeRadiusPx || T.range) * 0.97; // граница ауры — по центру башни; небольшой запас от округлений
    const targets = view.towers.filter((tw) => TABLE[tw.id] && TABLE[tw.id].targeting !== 'aura');
    let best = null;
    for (const c of view.free) {
      let score = 0;
      let fighting = 0;
      let near = 0;
      for (const tw of targets) {
        const d = Math.hypot(tw.x - c.x, tw.y - c.y);
        if (d > reach) continue;
        const units = 2 ** ((tw.level ?? 1) - 1);
        const fights = isFighting(tw);
        if (fights) fighting++;
        score += units * (fights ? 1 : VITAMIN_SYRUP_WEIGHT) * ((tw.auraMul ?? 1) < 1 ? VITAMIN_COVERED_WEIGHT : 1);
        near += d;
      }
      if (fighting < VITAMIN_MIN_GROUP) continue;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && near < best.near)) best = { cell: c, score, near };
    }
    return best;
  };
  /**
   * Клетка для башни управления (Холод, Пластырь): лучшая по `world.controlScore` среди свободных. Возвращает клетку или null (охвата нет нигде).
   */
  const controlSpot = (view, type) => {
    const scored = view.free
      .map((c) => ({ c, v: world.controlScore(type, c) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v || a.c.idx - b.c.idx);
    if (!scored.length) return null;
    return scored[0].c;
  };
  /** --lamps: пора ли покупать Лампы вне очереди. 1 — с LAMP_PREP_WAVE-й волны; veteran — за LAMP_LEAD_WAVES волн до выхода скрытных; first — когда первая скрытная уже вышла (плашка нового типа). */
  const lampTime = (view) => {
    if (LAMP_MODE === 'veteran') return STEALTH_WAVE !== null && view.s.wave >= STEALTH_WAVE - LAMP_LEAD_WAVES;
    if (LAMP_MODE === 'first') return (view.s.introduced ?? []).includes('stealth');
    return view.s.wave >= LAMP_PREP_WAVE;
  };
  /** Какую новую башню (Ампула, Антибиотик, Лампа, Витамин, Холод, Пластырь) пора докупить поверх круга: null — никакую (башня закрыта на уровне, исключена или ещё рано). */
  const wantedExtra = (view) => {
    const pills = unitsOf(view, 'pill');
    if (pills < 3) return null;
    // --lamps: перед скрытными (с 15–16-й волны) Лампа идёт первой — иначе очередь стоит на дорогой Ампуле и до Ламп не доходит
    if (LAMPS && available('lamp') && !extraGaveUp.has('lamp') && lampTime(view) && unitsOf(view, 'lamp') < Math.min(LAMP_MAX_STEALTH, Math.floor(pills / LAMP_PILLS_PER_STEALTH))) return 'lamp';
    if (available('ampule') && !extraGaveUp.has('ampule') && unitsOf(view, 'ampule') < Math.floor((pills + 0.5) / AMPULE_PILLS_PER)) return 'ampule';
    const syrupOk = !available('syrup') || unitsOf(view, 'syrup') >= ANTIBIOTIC_MIN_SYRUPS;
    if (available('antibiotic') && !extraGaveUp.has('antibiotic') && pills >= ANTIBIOTIC_MIN_PILLS && syrupOk && unitsOf(view, 'antibiotic') < Math.floor(pills / ANTIBIOTIC_PILLS_PER)) return 'antibiotic';
    if (LAMP_MODE !== 'veteran' && LAMP_MODE !== 'first' && available('lamp') && !extraGaveUp.has('lamp') && pills >= LAMP_PILLS_PER && unitsOf(view, 'lamp') < Math.floor(pills / LAMP_PILLS_PER) && !(LAMPS && unitsOf(view, 'lamp') >= LAMP_MAX_STEALTH)) return 'lamp';
    if (available('vitamin') && !extraGaveUp.has('vitamin')) {
      const fighting = view.towers.filter(isFighting).length; // штук, а не «обычных» башен
      const allowed = fighting >= VITAMIN_MIN_FIGHTING ? 1 + Math.floor((fighting - VITAMIN_MIN_FIGHTING) / VITAMIN_FIGHTING_PER) : 0;
      if (view.towers.filter((tw) => tw.id === 'vitamin').length < allowed && vitaminSpot(view)) return 'vitamin';
    }
    // Холод и Пластырь: урона нет, считаем по стреляющим башням (штуками); клетка есть почти всегда (охват дорожки > 0), иначе башня уходит в extraGaveUp при попытке покупки
    const fightingCount = view.towers.filter(isFighting).length;
    const controlAllowed = (min, per) => (fightingCount >= min ? 1 + Math.floor((fightingCount - min) / per) : 0);
    if (available('frost') && !extraGaveUp.has('frost') && view.towers.filter((tw) => tw.id === 'frost').length < controlAllowed(FROST_MIN_FIGHTING, FROST_FIGHTING_PER)) return 'frost';
    if (available('patch') && !extraGaveUp.has('patch') && view.towers.filter((tw) => tw.id === 'patch').length < controlAllowed(PATCH_MIN_FIGHTING, PATCH_FIGHTING_PER)) return 'patch';
    return null;
  };

  // Эксперт: строго по списку приоритетов; ждёт монет на очередную башню, но не дольше PATIENCE_SEC (тогда берёт первую доступную)
  const patience = PATIENCE_SEC;
  const noise = EXPERT_NOISE;
  const gaveUp = new Set(); // башни, для которых «копить на первую» не вышло (нет подходящих клеток): дальше обычный круг
  let ptr = 0;
  let headSince = 0;
  let lastPtr = -1; // голова очереди (номер в круге или «x:вид» для новой башни)
  return {
    decide(view) {
      const now = view.s.elapsed;
      const extraHead = wantedExtra(view);
      const headKey = extraHead ? `x:${extraHead}` : ptr;
      if (headKey !== lastPtr) {
        lastPtr = headKey;
        headSince = now;
      }
      let order = [];
      const syrupDone = (SOLO || zone) && view.towers.some((tw) => tw.id === 'syrup'); // при --solo и zone Сироп один: построен — из круга уходит
      for (let k = 0; k < cycle.length; k++) {
        const idx = (ptr + k) % cycle.length;
        if (available(cycle[idx]) && !(syrupDone && cycle[idx] === 'syrup')) order.push({ idx, type: cycle[idx] });
      }
      // Начало партии: пока башен с уроном мало, главное — урон: берётся самая дешёвая башня с уроном (вне списка по кругу; Сироп без урона ничего не убьёт)
      // Считаем в «обычных башнях»: башня уровня L — это 2^(L−1) обычных (иначе после слияния двух Таблеток «начало партии» включалось снова и бот до конца партии покупал только Таблетки: Сироп не строился)
      const hitsHard = (id) => TABLE[id]?.damage > 0 || (Boolean(SOLO_ALLOWED) && TABLE[id]?.dotPerSec > 0); // при --solo яд (Антибиотик, damage 0) тоже считается уроном: иначе «начало партии» не находит башню и ничего не строится
      const damageCount = view.towers.filter((tw) => hitsHard(tw.id)).reduce((sum, tw) => sum + 2 ** ((tw.level ?? 1) - 1), 0);
      const opening = damageCount < OPENING_DAMAGE_TOWERS;
      if (opening) {
        const cheapest = KNOWN_TOWERS.filter((id) => available(id) && hitsHard(id)).sort((a, b) => TABLE[a].price - TABLE[b].price)[0];
        order = cheapest ? [{ idx: -1, type: cheapest }] : order.filter((o) => hitsHard(o.type));
      }
      // «Особо сильный» знает, что с 4-й волны идёт рой, а одними Таблетками он не остановим: до 5-й волны копит монеты на первую Шипучку и ничего другого не покупает (слияния Таблеток при этом идут как обычно)
      // Так же он копит на первый Сироп и первый Шприц (без этого в бою, когда «не спокойно», терпение 0 и он до конца партии покупает только дешёвые Таблетки: Сироп не строился ни разу)
      const firstOf = (id) => available(id) && !gaveUp.has(id) && !view.towers.some((tw) => tw.id === id);
      const needFirst = opening ? null : firstOf('fizz') && view.s.wave <= FIZZ_BY_WAVE ? 'fizz' : ['syrup', 'syringe'].find(firstOf) ?? null;
      if (needFirst) order = [{ idx: cycle.indexOf(needFirst), type: needFirst }];
      else if (LAMPS && extraHead === 'lamp' && !opening) order = [{ idx: -2, type: 'lamp' }]; // --lamps: копит на Лампу и ничего другого не покупает (иначе в бою, когда «не спокойно», терпение 0 и дешёвые Таблетки забирают все монеты: Лампа не строилась ни разу)
      else if (extraHead && !opening) order.unshift({ idx: -2, type: extraHead }); // Ампула / Антибиотик — во главе очереди (ждёт монет, как на любую дорогую башню); место в круге не двигает
      if (!order.length) return null;
      const calm = view.s.lives >= view.s.maxLives && view.s.bacteria.length <= CALM_MAX_BACTERIA;
      let chosen = null;
      if (view.coins >= TABLE[order[0].type].price) chosen = order[0];
      else if (!opening && !needFirst && now - headSince >= (calm ? patience : 0)) chosen = order.find((o) => view.coins >= TABLE[o.type].price) ?? null;
      if (!chosen) return null;
      if (chosen.type === 'vitamin') {
        const spot = vitaminSpot(view); // Витамин — в центре группы башен: охвата дорожки у него нет, оценка клеток и слияние по радиусу не нужны
        return spot ? { type: 'vitamin', cell: spot.cell, cycleIdx: chosen.idx } : null;
      }
      if (CONTROL_TOWERS.includes(chosen.type)) {
        const cell = controlSpot(view, chosen.type); // Холод и Пластырь — по охвату дорожки; слияние по радиусу не ищем (башен мало)
        if (!cell) {
          if (chosen.idx === -2) extraGaveUp.add(chosen.type);
          return null;
        }
        return { type: chosen.type, cell, cycleIdx: chosen.idx };
      }
      const candidates = [];
      for (const c of view.free) {
        // «всё у Z»: оценка — близость к Z (при условии, что клетка вообще достаёт до дорожки); остальные профили — охват дорожки
        let v = zone ? (world.cover(chosen.type, c) > 0 ? 1000 / (50 + Math.hypot(c.x - world.zone.x, c.y - world.zone.y)) : 0) : world.strongScore(chosen.type, c, view.covCount, true);
        if (view.towers.some((tw) => Math.abs(tw.col - c.col) <= 1 && Math.abs(tw.row - c.row) <= 1)) v *= EXPERT_ADJACENT_FACTOR;
        v *= 1 + noise * rng(); // небольшой шум: идеально одинаковых партий не бывает
        if (v > 0) candidates.push({ c, v });
      }
      candidates.sort((a, b) => b.v - a.v); // сортировка устойчивая: при равных оценках первой остаётся клетка с меньшим номером, как раньше
      let best = candidates[0] ?? null;
      // Слияние по радиусу: если уже стоит башня того же вида уровня 1 (новая — тоже уровня 1), хорошая клетка в радиусе слияния от неё предпочтительнее
      const near = nearPartner(view, chosen.type);
      const share = TABLE[chosen.type].targeting === 'beam' || chosen.type === 'syrup' ? MERGE_NEAR_SHARE_PICKY : MERGE_NEAR_SHARE;
      const nearPool = near && best ? candidates.filter((x) => x.v >= best.v * share && near(x.c)) : [];
      // --focus: все башни вида — кучкой в радиусе слияния от первой такой башни (качество клетки не важно): пары каждого уровня оказываются рядом и сливаются до IV
      const anchor = FOCUS ? view.towers.find((tw) => tw.id === chosen.type) : null;
      const focusPool = anchor ? candidates.filter((x) => Math.hypot(x.c.x - anchor.x, x.c.y - anchor.y) <= (view.s.mergeRadiusPx ?? 0) * MERGE_NEAR_MARGIN) : [];
      if (focusPool.length) best = focusPool[0];
      else if (nearPool.length) best = nearPool[0]; // candidates уже по убыванию оценки: лучшая из клеток в радиусе слияния
      if (!best) {
        if (needFirst) gaveUp.add(chosen.type);
        if (chosen.idx >= 0) ptr = chosen.idx + 1; // клеток для этой башни нет — переходит к следующей в списке
        else if (chosen.idx === -2) extraGaveUp.add(chosen.type);
        return null;
      }
      return { type: chosen.type, cell: best.c, cycleIdx: chosen.idx };
    },
    bought(choice) {
      if (choice.cycleIdx >= 0) ptr = (choice.cycleIdx + 1) % cycle.length; // покупка «начала партии» (cycleIdx -1) место в списке не двигает
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

const WORLDS = new Map(); // id карты → сеть дорожек и клетки (строится по первой партии на этой карте)

/**
 * Сверка фактических чисел роста прочности уровня (levelGrowth из игры) с тем, что задал --cfg для ЭТОГО уровня: levels.specs.<номер уровня − 1>.growth.*, levels.hpFactor.<уровень>,
 * для уровня 1 — waves.hpGrowth*, waves.level1HpFactor; waves.hpScale — для любого. Подмена другого уровня (не текущего) не проверяется. Возвращает список расхождений.
 */
function growthMismatches(lg, level) {
  const out = [];
  const same = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9;
  for (const [path, value] of CFG_ITEMS) {
    let actual;
    let m = /^levels\.specs\.(\d+)\.growth\.(perWave|fromWave|latePerWave|lateFromWave)$/.exec(path);
    if (m) {
      if (Number(m[1]) !== level - 1) continue;
      actual = lg[m[2]];
    } else if ((m = /^levels\.hpFactor\.(\d+)$/.exec(path))) {
      if (Number(m[1]) !== level) continue;
      actual = lg.hpFactor;
    } else if (level === 1 && (m = /^waves\.hpGrowth(PerWave|FromWave|LatePerWave|LateFromWave)$/.exec(path))) {
      actual = lg[m[1].charAt(0).toLowerCase() + m[1].slice(1)];
    } else if (level === 1 && path === 'waves.level1HpFactor') actual = lg.hpFactor;
    else if (path === 'waves.hpScale') actual = lg.hpScale;
    else continue;
    if (!same(actual, value)) out.push(`${path} задано ${value}, в игре ${actual}`);
  }
  return out;
}

/** Играет одну партию. Возвращает запись о партии. Бросает FatalConsole (ошибка консоли / «cfg:»), остальные ошибки — наверх. */
async function playGame(browser, baseUrl, run, metaLevels = null, salt = '', level = LEVEL, extraQuery = '') {
  applyMetaToTable(metaLevels);
  const profile = PROFILE;
  const rng = makeRng(`${SEED}:${STRATEGY_LABEL}:${run}${salt}`);
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

  let levelGrowth = null;
  const realStart = Date.now();
  try {
    await page.goto(`${baseUrl}?qa&speed=${SPEED}${args.canvas ? '&canvas' : ''}${args.norender ? '&norender' : ''}${CFG_STRING ? `&cfg=${CFG_STRING}` : ''}&level=${level}&levelwaves${metaLevels ? `&meta=${Object.entries(metaLevels).map(([id, n]) => `${id}:${n}`).join(',')}` : ''}${extraQuery}`, { waitUntil: 'load' });
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

    // Защита от тихой подмены: фактические числа роста прочности уровня (из игры) — в журнал; те из них, что задал --cfg, сверяются с фактом, расхождение останавливает замер
    levelGrowth = s.levelGrowth ?? null;
    if (levelGrowth) {
      console.log(`  рост уровня ${levelGrowth.level} в игре: perWave ${levelGrowth.perWave}, fromWave ${levelGrowth.fromWave}, latePerWave ${levelGrowth.latePerWave}, lateFromWave ${levelGrowth.lateFromWave}, hpFactor ${levelGrowth.hpFactor}, hpScale ${levelGrowth.hpScale}`);
      const mismatch = growthMismatches(levelGrowth, level);
      if (mismatch.length) throw new FatalConsole(`Расхождение чисел уровня ${level} с --cfg (подмена не дошла или попала не туда): ${mismatch.join('; ')}`);
    }

    // карта своя у каждого уровня (уровень 1 — «Горло»): сеть дорожек кэшируется по id карты
    if (!WORLDS.has(s.mapId)) {
      const graph = await page.evaluate(() => window.__pvb.getGraph());
      WORLDS.set(s.mapId, buildWorld(graph, { orgW: s.map.orgW, tile: s.map.tile, pathWidth: MAP_PATH_WIDTH, pathMarginTile: 0.55 }, s.map.cols, s.map.rows));
    }
    const WORLD = WORLDS.get(s.mapId);
    if (!WORLD.reported) {
      WORLD.reported = true;
      console.log(`  карта «${s.mapId}»: последняя развилка у организма — узел ${WORLD.zone.node ?? '—'} (${Math.round(WORLD.zone.x)}, ${Math.round(WORLD.zone.y)})`);
      const free = WORLD.cells.filter((c) => !c.path);
      const withCover = KNOWN_TOWERS.map((id) => `${NAMES[id] ?? id} ${free.filter((c) => WORLD.cover(id, c) > 0).length}`).join(', ');
      console.log(`  карта: клеток ${WORLD.cells.length}, под дорожкой ${WORLD.cells.length - free.length}, свободных ${free.length}; клеток с охватом > 0: ${withCover}`);
    }
    const buttons = s.ui.towerButtons.filter((b) => !b.locked).map((b) => b.id); // закрытые башни (замок) профили не строят
    const player = makePlayer({ world: WORLD, rng, buttons });

    // 1) один раз отдаляем камеру до минимума колесом мыши (карта целиком в окне)
    for (let k = 0; k < 6 && s.camera.zoom > s.camera.zoomMin + 0.001; k++) {
      await input.wheel(g2c(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2), 500);
      await sleep(80);
      s = await getState(page);
    }

    // 2) поставить башню: кнопка на панели (если не выбрана), при необходимости сдвинуть карту, тап по клетке; проверка по состоянию
    const record = { builds: [], failures: [], anomalies: [], spent: 0, merges: 0, mergeMisses: 0, picks: 0, fevers: [] };
    const missSeen = new Set(); // группы башен без пары в радиусе, уже посчитанные в mergeMisses
    const ensureVisible = async (col, row) => {
      for (let k = 0; k < 3; k++) {
        const g = c2g(await cellPos(col, row));
        if (g.x >= VIEW.x + 12 && g.x <= VIEW.x + VIEW.w - 12 && g.y >= VIEW.y + 12 && g.y <= VIEW.y + VIEW.h - 12) return true;
        const cx = VIEW.x + VIEW.w / 2;
        const cy = VIEW.y + VIEW.h / 2;
        const dx = Math.max(-420, Math.min(420, cx - g.x));
        const dy = Math.max(-300, Math.min(300, cy - g.y));
        await input.drag(g2c(cx - dx / 2, cy - dy / 2), g2c(cx + dx / 2, cy + dy / 2), { steps: 6, stepMs: 12 });
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
      const index = MUT_PICKS[tw.id]?.[tw.pending];
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
      const limit = 99; // эксперт сливает до предела игры (maxTowerLevel)
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
        await page.evaluate((towerId) => window.__pvb.revealTower(towerId), type); // карточка башни может быть за краем списка
        st = await getState(page);
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
        if (tower && TABLE[type].targeting === 'beam') await aimTower(st, tower, cell);
        return { ok: true, tower };
      }
      if (st.state !== 'playing') return { ok: false, ended: true };
      return { ok: false, reason: st.coins < TABLE[type].price ? 'не хватило монет (цена в таблице бота неверна?)' : 'игра не приняла башню' };
    };

    // 3) главный цикл
    const bad = new Set(); // клетки, где не вышло
    const waveSeen = { wave: 0 };
    const timeline = [];
    // Журнал волны (план переработки баланса, 18 октября 2026): сколько HP вышло в волне, за сколько игровых секунд после выхода последней бактерии поле опустело, «бумажный» урон обороны
    // (урон × удары в очереди луча / настоящая пауза, по одной цели), сколько бактерий было на карте одновременно; пишется в запись волны при переходе к следующей.
    const seenIds = new Set();
    let ws = { hp: 0, startT: 0, clearT: null, maxOnMap: 0, buildsAt: 0 };
    const paperDps = (st) => st.towers.reduce((sum, tw) => {
      const hits = tw.stats.beamPulses > 0 ? tw.stats.beamPulses : 1;
      return sum + (tw.stats.damage * hits) / ((tw.stats.cooldownMs / 1000) * (tw.auraMul ?? 1) * (tw.latchMul ?? 1));
    }, 0);
    const lifeLossWaves = [];
    const lifeLossKinds = []; // вид бактерии, ближайшей к организму в последнем опросе до потери жизни (кто пробивает оборону)
    let frontKind = null;
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
        console.log(`      … ${profileTitle()} #${run}: реальных ${Math.round((lastBeat - realStart) / 1000)} с, игровых ${s.elapsed.toFixed(0)} с, волна ${s.wave}/${s.waveTotal}, башен ${s.towers.length}, монет ${s.coins}, жизни ${s.lives}, бактерий на карте ${s.bacteria.length}`);
      }
      if (s.wave !== waveSeen.wave) {
        const prev = timeline[timeline.length - 1];
        if (prev) Object.assign(prev, { hpSpawned: Math.round(ws.hp), clearSec: ws.clearT === null ? null : Math.round((ws.clearT - ws.startT) * 10) / 10, maxOnMap: ws.maxOnMap, builds: record.builds.length - ws.buildsAt });
        ws = { hp: 0, startT: s.elapsed, clearT: null, maxOnMap: 0, buildsAt: record.builds.length };
        waveSeen.wave = s.wave;
        timeline.push({ wave: s.wave, t: Math.round(s.elapsed), coins: s.coins, towers: s.towers.length, lives: s.lives, dps: Math.round(paperDps(s) * 10) / 10, merges: record.merges, picks: record.picks });
      }
      for (const b of s.bacteria) {
        if (!seenIds.has(b.id)) {
          seenIds.add(b.id);
          ws.hp += b.maxHp;
        }
      }
      ws.maxOnMap = Math.max(ws.maxOnMap, s.bacteria.length);
      if (ws.clearT === null && s.bacteria.length === 0 && ws.hp > 0 && s.waveSpawned >= s.waveCount) ws.clearT = s.elapsed;
      if (s.lives < lastLives) {
        for (let k = 0; k < lastLives - s.lives; k++) {
          lifeLossWaves.push(s.wave);
          lifeLossKinds.push(frontKind ?? '?');
        }
        lastLives = s.lives;
      }
      if (s.bacteria.length) frontKind = s.bacteria.reduce((a, b) => (b.remaining < a.remaining ? b : a)).kind;
      minLives = Math.min(minLives, s.lives);
      maxOnMap = Math.max(maxOnMap, s.bacteria.length);

      // «Лихорадка» (раздел 10.1, п. 3): готова и куплена — эксперт включает её на волне босса или мини-босса, когда босс вошёл в радиус башни с уроном
      if (s.state === 'playing' && s.fever?.owned && s.fever.wait === 0 && s.fever.left === 0) {
        const boss = s.bacteria.find((b) => b.boss);
        if (boss && s.towers.some((tw) => tw.stats.damage > 0 && Math.hypot(tw.x - boss.x, tw.y - boss.y) <= tw.stats.range)) {
          await input.tap(g2c(FEVER_BTN.x, FEVER_BTN.y));
          const after = await pollUntil(page, (x) => x.fever.uses > s.fever.uses || x.state !== 'playing', 1000);
          if (after.fever.uses > s.fever.uses) record.fevers.push(after.wave);
          else if (after.state === 'playing') record.anomalies.push(`«Лихорадка» на волне ${s.wave}: кнопка не сработала`);
          continue;
        }
      }

      if (s.state === 'playing' && s.elapsed >= nextDecisionAt) {
        const decisionStart = s.elapsed; // следующее решение — через 2 игровые секунды ОТ НАЧАЛА этого (тап тоже занимает время)
        // Слияния и мутации (бесплатные) — раньше покупок: сначала башни, ждущие выбора мутации, потом одно слияние
        const waiting = s.towers.find((tw) => tw.pending !== null);
        if (waiting && (await pickMutation(waiting))) {
          nextDecisionAt = decisionStart + DECIDE_EVERY_SEC;
          continue;
        }
        if (await mergeOnce(s)) {
          nextDecisionAt = decisionStart + DECIDE_EVERY_SEC;
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
            if (VERBOSE) console.log(`      + ${profileTitle()} #${run}: ${(NAMES[choice.type] ?? choice.type).padEnd(8)} клетка ${choice.cell.col},${choice.cell.row}  (игровое время ${s.elapsed.toFixed(0)} с, волна ${s.wave}, монет было ${s.coins})`);
            break; // не больше одной покупки за решение
          }
          if (res.ended) break;
          record.failures.push(`${choice.type} ${choice.cell.key}: ${res.reason}`);
          bad.add(choice.cell.key);
          s = await getState(page);
        }
        nextDecisionAt = decisionStart + DECIDE_EVERY_SEC;
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
    // Жизни по видам бактерий, дошедших до организма (журнал игры: событие leak; погашенные «Щитом у линии» не считаются) — для критерия «жизней от скрытных» (docs/lamp-plan.md)
    const leakEvents = (await page.evaluate(() => window.__pvb?.getEvents(0) ?? []).catch(() => [])).filter((e) => e.type === 'leak' && !e.absorbed);
    const leakLives = {};
    for (const e of leakEvents) leakLives[e.kind] = Math.round(((leakLives[e.kind] ?? 0) + e.damage) * 100) / 100;
    // последняя запись журнала волны закрывается концом партии
    {
      const tail = timeline[timeline.length - 1];
      if (tail && tail.hpSpawned === undefined) Object.assign(tail, { hpSpawned: Math.round(ws.hp), clearSec: ws.clearT === null ? null : Math.round((ws.clearT - ws.startT) * 10) / 10, maxOnMap: ws.maxOnMap, builds: record.builds.length - ws.buildsAt });
    }
    const counts = {};
    for (const id of KNOWN_TOWERS) counts[id] = last.towers.filter((tw) => tw.id === id).length;
    const startCoins = (last.plan?.startCoins ?? cfgGet('economy.startCoins') ?? readConfigNumber('economy', 'startCoins')) + (metaLevels ? (metaLevels.coins ?? 0) * META.upgrades.coins.perLevel : 0); // уровень нового формата — монеты плана (200)
    return {
      profile,
      strategy: STRATEGY_LABEL,
      run,
      result,
      wave: last.wave,
      waveTotal: last.waveTotal,
      dnaGained: last.dnaGained ?? null,
      // боссы партии (биты: 0–3 мини-боссы, 4 босс) и есть ли босс на уровне — для очков ДНК (dnaForGame); волны, на которых включалась «Лихорадка»
      bossBits: last.bossBits ?? 0,
      hasBoss: Boolean(last.plan),
      fevers: record.fevers,
      // строка итога попытки, как у человека (src/attempt.ts); улучшения бот задаёт адресом (&meta=), сохранение не пишется, поэтому номер попытки в строке всегда «п.1» — номер попытки лестницы в журнале бота
      attemptLine: last.attemptLine ?? null,
      lives: last.lives,
      maxLives: last.maxLives,
      shieldAbsorbed: last.shieldAbsorbed ?? 0,
      minLives,
      lifeLossWaves,
      lifeLossKinds,
      levelGrowth,
      leakLives,
      stealthLives: leakLives.stealth ?? 0,
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
      frames: last.clock?.frames ?? null, // кадров игры за партию (кадров в секунду = frames / realSec)
      norender: Boolean(args.norender),
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
  const head = `[${profileTitle()} ${g.run}/${runs}]`;
  if (g.result === 'error') return `${head} ОШИБКА: ${g.error}`;
  const towers = KNOWN_TOWERS.map((id) => `${SHORT[id] ?? id} ${g.towers[id]}`).join(' ');
  const merged = g.merges || g.mergeMisses || g.picks ? ` · слияний ${g.merges} (мимо ${g.mergeMisses ?? 0}), мутаций ${g.picks}` : '';
  return `${head} ${RESULT_RU[g.result]} · волна ${g.wave}/${g.waveTotal} · жизни ${g.lives}/${g.maxLives} · убито ${g.kills}, дошло ${g.leaked} · монеты ${g.coins} · башни ${towers}${merged} · игра ${f1(g.gameSec)} с · реал. ${f1(g.realSec)} с${g.frames ? ` · кадров/с ${f1(g.frames / g.realSec)}` : ''}`;
}

/** До какой волны дошла партия: победа — все волны уровня, иначе номер волны на момент конца (проигрыш, timeout). */
const waveReached = (g) => (g.result === 'won' ? g.waveTotal ?? g.wave : g.wave);
function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
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
      medianWave: median(own.map(waveReached)),
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
  const cols = ['Профиль', 'Партий', 'Побед', 'Потеряно жизней', 'Волна гибели', 'Медиана волны (победа = все волны)', `Башни (${KNOWN_TOWERS.map((id) => SHORT[id] ?? id).join('/')})`, 'Монеты в конце', 'Слияний (мимо)', 'Реал. время партии'];
  const rows = Object.entries(summary).map(([profile, x]) => [
    profileTitle(),
    `${x.games}${x.timeout ? ` (timeout ${x.timeout})` : ''}`,
    `${x.won}/${x.games} (${pct(x.winRate)})`,
    f1(x.avgLivesLost),
    x.lost ? f1(x.avgLossWave) : '—',
    f1(x.medianWave),
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
    args: { profiles: PROFILES, strategy: STRATEGY_LABEL, mut: MUT_IDS, runs: RUNS, speed: SPEED, level: LEVEL, exclude: [...EXCLUDE], solo: SOLO, lamps: LAMP_MODE, cfg: CFG_STRING, seed: SEED, maxGameSec: MAX_GAME_SEC, campaign: CAMPAIGN, meta: META_FIXED },
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

console.log(`Бот-замерщик: ${profileTitle()}; партий ${RUNS}; speed ${SPEED}; потолок ${MAX_GAME_SEC} игровых с; seed ${SEED}`);
console.log(`  башни из config.ts${CFG_STRING ? ' с подменой --cfg' : ''}: ${KNOWN_TOWERS.map((id) => `${NAMES[id] ?? id} ${TABLE[id].price}₽/${TABLE[id].targeting === 'beam' ? 'луч' : `${TABLE[id].range}px`}`).join(', ')}`);
if (!LADDER && !CAMPAIGN) console.log(`  уровень ${LEVEL}: открыты башни ${KNOWN_TOWERS.filter((id) => id === 'pill' || SINGLE_META[towerNodeId(id)] > 0).map((id) => NAMES[id] ?? id).join(', ')}`);
if (SOLO) console.log(`  --solo=${SOLO}: строят только ${[...SOLO_ALLOWED].map((id) => NAMES[id] ?? id).join(', ')} (Сироп — не больше одного)`);
if (EXCLUDE.size) console.log(`  не строят: ${[...EXCLUDE].map((id) => NAMES[id] ?? id).join(', ')}`);
if (CFG_STRING) console.log(`  подмена чисел (--cfg): ${CFG_STRING}`);
if (SPEED > 2) console.log(`  ⚠ speed ${SPEED} выше 2: замеры грубее (кадры крупнее, бот тратит больше игрового времени на тап). Для итоговых чисел баланса используйте speed 2.`);

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
    ? { ...saved, levels: { ...emptyLevels(), ...saved.levels }, stars: [...saved.stars], best: [...(saved.best ?? Array(10).fill(0))], progress: saved.progress ?? emptyProgress(), perLevel: [...saved.perLevel] }
    : { profile, strategy: STRATEGY_LABEL, run, dna: 0, levels: emptyLevels(), stars: Array(10).fill(0), best: Array(10).fill(0), progress: emptyProgress(), nextLevel: 1, stuckAt: null, perLevel: [] };
  ladderLanes.push(lane);
  ladderState.lanes[key] = lane;
  const tag = `${profileTitle()} дорожка ${run}`;
  if (lane.stuckAt) {
    console.log(`[${tag}] застряла на уровне ${lane.stuckAt}: дальше не идёт`);
    return true;
  }
  if (lane.nextLevel < LADDER_FROM) die(`Состояние дорожки ${key}: следующий уровень ${lane.nextLevel}, а --from-level=${LADDER_FROM}: пропущены уровни.`);
  for (let level = Math.max(LADDER_FROM, lane.nextLevel); level <= LADDER_TO; level++) {
    // продолжение уровня: прошлый запуск сыграл часть партий и не выиграл (lane.resume = уровень), его запись продолжается, номера партий идут дальше
    const prevRec = lane.resume === level ? lane.perLevel.at(-1) : null;
    const rec = prevRec && prevRec.level === level && !prevRec.firstWin ? prevRec : { level, games: 0, firstWin: null, waves: [], results: [], stars: 0, dnaIn: lane.dna, levelsIn: { ...lane.levels }, bought: [], dnaGained: [], treeLeftIn: treeLeft(lane.levels), treeLeftAfter: [] };
    if (rec !== prevRec) lane.perLevel.push(rec);
    lane.resume = null;
    const firstN = rec.games + 1;
    const lastN = Math.min(LADDER_TOTAL, rec.games + LADDER);
    for (let n = firstN; n <= lastN; n++) {
      if (stopRequested) return true;
      if (LADDER_BUDGET_SEC) {
        const longest = Math.max(0, ...games.map((g) => g.realSec || 0));
        if ((Date.now() - PROCESS_START) / 1000 + longest * 1.2 > LADDER_BUDGET_SEC) {
          console.log(`[${tag}, уровень ${level}] бюджет времени запуска исчерпан (${Math.round((Date.now() - PROCESS_START) / 1000)} с из ${LADDER_BUDGET_SEC}, самая долгая партия ${Math.round(longest)} с): партии на этом запуске кончаются`);
          break;
        }
      }
      let game = null;
      for (let attempt = 1; attempt <= 2 && !game; attempt++) {
        try {
          game = await playGame(browser, server.url, run, lane.levels, `:L${level}:${n}`, level);
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
      const gained = dnaForGame(game, false, lane.progress, level) + newStars * STARS_RULE.dna;
      lane.dna += gained;
      // лучшая волна уровня — число пройденных волн (как `progress.best` в игре): победа — все волны, проигрыш — без текущей
      lane.best[level - 1] = Math.max(lane.best[level - 1] ?? 0, game.result === 'won' ? game.waveTotal : Math.max(0, game.wave - 1));
      const buy = buyUpgrades(lane.levels, lane.dna);
      lane.levels = buy.levels;
      lane.dna = buy.dna;
      rec.waves.push(game.result === 'won' ? game.waveTotal : game.wave);
      rec.results.push(game.result);
      rec.bought.push(buy.bought);
      rec.treeLeftAfter.push(treeLeft(lane.levels));
      rec.dnaGained.push(gained);
      console.log(`[${tag}, уровень ${level}, партия ${n}] ${RESULT_RU[game.result]} · волна ${game.wave}/${game.waveTotal} · жизни ${game.lives}/${game.maxLives}${stars ? ` · звёзд ${stars}` : ''}${game.fevers?.length ? ` · «Лихорадка» на волнах ${game.fevers.join(', ')}` : ''} · очков ДНК +${gained} (остаток ${lane.dna}) · куплено ${buy.bought.length ? buy.bought.join(', ') : '—'} · древа не куплено ${rec.treeLeftAfter.at(-1).all} (в открытых ветках ${rec.treeLeftAfter.at(-1).open}) · слияний ${game.merges} (мимо ${game.mergeMisses}) · игра ${game.gameSec} с, реал. ${game.realSec} с`);
      if (game.attemptLine) console.log(`    итог: ${game.attemptLine}`);
      for (const a of game.anomalies ?? []) console.log(`      ⚠ ${a}`);
      saveResults();
      if (game.result === 'won') {
        rec.firstWin = n;
        rec.stars = lane.stars[level - 1];
        if (FARM) {
          // Одна повторная партия на пройденном уровне (L − 1; у первого уровня — он же): звёзды всех уровней до L заданы адресом (`&stars=`), улучшения — как после покупок;
          // башни открыты по прогрессу игрока (открытая однажды башня доступна на пройденных уровнях). Очки и время только записываются.
          const replayLevel = Math.max(1, level - 1);
          const stars = Array(level).fill(1).join(',');
          try {
            const rg = await playGame(browser, server.url, run, lane.levels, `:L${level}:farm`, replayLevel, `&stars=${stars}`);
            games.push(Object.assign(rg, { ladderLevel: level, ladderGame: n + 1, farmReplay: true, metaLevels: { ...lane.levels }, dnaBefore: lane.dna }));
            const modelDna = rg.result === 'error' ? null : dnaForGame(rg, true, structuredClone(lane.progress), replayLevel);
            rec.farm = { level: replayLevel, result: rg.result, wave: rg.wave, dnaModel: modelDna, dnaGame: rg.dnaGained ?? null, gameSec: rg.gameSec, realSec: rg.realSec, attemptDna: rec.dnaGained.at(-1) };
            console.log(`[${tag}, уровень ${level}] контроль фарма: повтор уровня ${replayLevel}: ${RESULT_RU[rg.result]} · волна ${rg.wave}/${rg.waveTotal} · очков ДНК ${rg.dnaGained ?? '?'} (по модели ${modelDna ?? '?'}) против ${rec.dnaGained.at(-1)} за победную попытку · игра ${rg.gameSec} с, реал. ${rg.realSec} с`);
          } catch (error) {
            if (error instanceof FatalConsole) {
              fatal = `Остановлено: дорожка «${tag}», контроль фарма на уровне ${level}, консоль игры сообщила о проблеме.\n   ${error.message}`;
              return false;
            }
            console.log(`   ⚠ [${tag}, уровень ${level}] контроль фарма не удался: ${error.message.split('\n')[0]}`);
          }
        }
        break;
      }
    }
    rec.dnaOut = lane.dna;
    rec.levelsOut = { ...lane.levels };
    if (!rec.firstWin && rec.games < LADDER_TOTAL && !LADDER_LAST) {
      // партий на уровне ещё не набралось до LADDER_TOTAL: дорожка не застряла, уровень доиграет следующий запуск с этим состоянием (--state-in)
      lane.resume = level;
      console.log(`[${tag}] победы на уровне ${level} пока нет (сыграно ${rec.games} из ${LADDER_TOTAL}): уровень продолжит следующий запуск`);
      saveResults();
      return true;
    }
    if (!rec.firstWin) {
      lane.stuckAt = level;
      console.log(`[${tag}] победы на уровне ${level} за ${rec.games} партий нет: дорожка застряла`);
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
        const progress = emptyProgress();
        let dna = 0;
        const entry = { profile, strategy: STRATEGY_LABEL, run, games: 0, firstWin: null, waves: [], bought: [], error: null };
        for (let n = 1; n <= CAMPAIGN; n++) {
          if (stopRequested) break;
          let game = null;
          for (let attempt = 1; attempt <= 2 && !game; attempt++) {
            try {
              game = await playGame(browser, server.url, run, levels, `:${n}`);
            } catch (error) {
              if (error instanceof FatalConsole) {
                fatal = `Остановлено: в серии «${profileTitle()} ${run}», партия ${n}, консоль игры сообщила о проблеме. Замер с такой партией был бы недостоверным.\n   ${error.message}`;
                break outer;
              }
              console.log(`   ⚠ [${profileTitle()} серия ${run}, партия ${n}] сбой (попытка ${attempt}): ${error.message.split('\n')[0]}`);
              if (!browser.isConnected()) browser = await launchBrowser();
              if (attempt === 2) game = { profile, run, result: 'error', error: error.message.split('\n')[0], realSec: 0 };
            }
          }
          Object.assign(game, { series: run, game: n, metaLevels: { ...levels }, dnaBefore: dna });
          games.push(game);
          entry.games = n;
          if (game.result === 'error') {
            entry.error = game.error;
            console.log(`[${profileTitle()} серия ${run}, партия ${n}] ОШИБКА: ${game.error}`);
            break;
          }
          entry.waves.push(game.result === 'won' ? game.waveTotal : game.wave);
          const gained = dnaForGame(game, false, progress, LEVEL);
          dna += gained;
          const buy = buyUpgrades(levels, dna);
          levels = buy.levels;
          dna = buy.dna;
          entry.bought.push(buy.bought);
          console.log(`[${profileTitle()} серия ${run}, партия ${n}] ${RESULT_RU[game.result]} · волна ${game.wave}/${game.waveTotal} · очков ДНК +${gained} (остаток ${dna}) · куплено ${buy.bought.length ? buy.bought.join(', ') : '—'} · уровни ${Object.entries(levels).map(([id, v]) => `${id} ${v}`).join(', ')} · слияний ${game.merges} (мимо ${game.mergeMisses}) · игра ${game.gameSec} с, реал. ${game.realSec} с`);
          for (const a of game.anomalies ?? []) console.log(`      ⚠ ${a}`);
          if (game.result === 'won') {
            entry.firstWin = n;
            break;
          }
        }
        series.push(entry);
        console.log(`[${profileTitle()} серия ${run}/${RUNS}] ${entry.firstWin ? `первая победа в партии ${entry.firstWin}` : `победы за ${entry.games} парт. нет`}`);
        saveResults();
        continue;
      }
      let game = null;
      for (let attempt = 1; attempt <= 2 && !game; attempt++) {
        try {
          game = await playGame(browser, server.url, run, SINGLE_META);
        } catch (error) {
          if (error instanceof FatalConsole) {
            fatal = `Остановлено: в партии «${profileTitle()} ${run}» консоль игры сообщила о проблеме. Замер с такой партией был бы недостоверным.\n   ${error.message}`;
            break outer;
          }
          console.log(`   ⚠ [${profileTitle()} ${run}] сбой (попытка ${attempt}): ${error.message.split('\n')[0]}`);
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
    const parts = lane.perLevel.map((r) => `${r.level}: ${r.firstWin ? r.firstWin : `—(${r.games})`} [волны ${r.waves.join(' ')}; древа на входе ${r.treeLeftIn?.all ?? '?'}]`);
    console.log(`  ${profileTitle()} ${lane.run}: ${parts.join(' · ')}${lane.stuckAt ? ` · застряла на уровне ${lane.stuckAt}` : ''} · очков ${lane.dna}`);
  }
} else if (CAMPAIGN) {
  console.log('\nИТОГ ПО СЕРИЯМ ПАРТИЙ (номер партии первой победы)');
  for (const profile of PROFILES) {
    const own = series.filter((x) => x.profile === profile && !x.error);
    if (!own.length) continue;
    const wins = own.filter((x) => x.firstWin);
    console.log(`  ${profileTitle()}: серий ${own.length}, побед в серии ${wins.length}, первая победа в партии: ${wins.length ? `в среднем ${f1(mean(wins.map((x) => x.firstWin)))} (${wins.map((x) => x.firstWin).join(', ')})` : '—'}; волны по партиям: ${own.map((x) => `[${x.waves.join(' ')}]`).join(' ')}`);
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
