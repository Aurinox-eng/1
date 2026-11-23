/**
 * Обёртка SDK Яндекс Игр (этап 9, раздел 1 плана docs/stage-9-plan-2026-10-23.md). Вне площадки SDK нет — все вызовы ничего не делают, игра работает как раньше.
 *
 * Что делает обёртка (требования площадки — docs/stage-9-plan-2026-10-23.md):
 *  • п. 1.19.1: SDK инициализируется скриптом `/sdk.js` и `YaGames.init()`;
 *  • п. 1.19.2: `LoadingAPI.ready()` — когда пользователь уже может начать игру (`sdkReady`, один раз за запуск);
 *  • п. 1.3: по `game_api_pause` игра глушит звук и ставит партию на паузу, по `game_api_resume` возвращает звук и снимает паузу, поставленную площадкой (`onPlatformPause`);
 *  • п. 2.14: язык берётся из `environment.i18n.lang` при запуске (`sdkLanguage`);
 *  • п. 1.19.3: `GameplayAPI.start()` и `GameplayAPI.stop()` размечают игровой процесс (`gameplay`);
 *  • раздел 2 плана, п. 4.4 требований: полноэкранная реклама (`showFullscreenAd`) и реклама с вознаграждением (`showRewardedAd`); пока реклама открыта, игра стоит и звук молчит —
 *    так же, как по `game_api_pause` (общая «остановка» `onGameHold`: звук и партия возвращаются, когда закрылись и реклама, и пауза площадки).
 *
 * Скрипт SDK подгружается только на площадке: в тестовой сборке (`?qa`), на localhost, на github.io и из файла его нет; подставной SDK для проверок — `window.YaGames`, заданный до запуска игры.
 * Любая ошибка или молчание SDK дольше `LOAD_TIMEOUT_MS` не мешают игре: она запускается без SDK.
 */
import { QA_ENABLED } from './debug';

/** Обработчики показа рекламы (`ysdk.adv`, страница `sdk-adv` документации площадки). */
interface AdCallbacks {
  onOpen?(): void;
  onClose?(wasShown?: boolean): void;
  onError?(error?: unknown): void;
  onOffline?(): void;
  onRewarded?(): void;
}

interface YandexSdk {
  adv?: {
    showFullscreenAdv?(options: { callbacks: AdCallbacks }): void;
    showRewardedVideo?(options: { callbacks: AdCallbacks }): void;
  };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  environment?: { i18n?: { lang?: string } };
  on?(event: string, listener: () => void): unknown;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> };
  }
}

/** Путь к скрипту SDK: относительный по правилу площадки для архива игры (docs/stage-9-plan: п. 1.19.1). */
const SDK_SRC = '/sdk.js';
/** Сколько ждать загрузку и инициализацию SDK, мс; дальше игра запускается без него. */
const LOAD_TIMEOUT_MS = 4000;
/** Адреса, где площадки нет: скрипт SDK не подгружается (иначе в консоли ошибка 404). */
const NO_PLATFORM = /^$|^localhost$|^127\.0\.0\.1$|\.github\.io$/;

/** Сколько ждать, что реклама откроется, мс: дальше игра идёт без неё (п. 4.4: от действия до показа — не больше 2 с; если окно откроется позже, игра всё равно встанет по `onOpen`). */
const AD_OPEN_TIMEOUT_MS = 3000;

let sdk: YandexSdk | null = null;
let readySent = false;
let playing = false;
/** Причины остановки игры: `platform` — пауза площадки (`game_api_pause`), `ad` — открыта реклама. Звук молчит и партия стоит, пока есть хоть одна. */
const holds = new Set<'platform' | 'ad'>();
let holdListener: ((held: boolean) => void) | null = null;

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/** Подключает SDK, если он есть; ждёт не дольше `LOAD_TIMEOUT_MS`. Вызывать один раз до создания игры. */
export async function initSdk(): Promise<void> {
  try {
    if (!window.YaGames) {
      if (QA_ENABLED || NO_PLATFORM.test(window.location.hostname)) return;
      const loaded = await Promise.race([loadScript(), wait(LOAD_TIMEOUT_MS).then(() => false)]);
      if (!loaded || !window.YaGames) return;
    }
    const ready = await Promise.race([window.YaGames.init(), wait(LOAD_TIMEOUT_MS).then(() => null)]);
    sdk = ready ?? null;
  } catch {
    sdk = null;
  }
}

/** Подключён ли SDK (для проверок). */
export function sdkActive(): boolean {
  return sdk !== null;
}

/** Язык интерфейса площадки: русский — `ru`, любой другой — `en` (в игре два языка, остальные — резервный набор); нет SDK или языка — `null`. */
export function sdkLanguage(): 'ru' | 'en' | null {
  const lang = sdk?.environment?.i18n?.lang;
  if (!lang) return null;
  return lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** `LoadingAPI.ready()`: игра нарисована и принимает ввод. Один раз за запуск. */
export function sdkReady(): void {
  if (readySent) return;
  readySent = true;
  try {
    sdk?.features?.LoadingAPI?.ready();
  } catch {
    /* площадка не обязана отвечать: игра идёт дальше */
  }
}

function setHold(reason: 'platform' | 'ad', on: boolean): void {
  const before = holds.size > 0;
  if (on) holds.add(reason);
  else holds.delete(reason);
  const after = holds.size > 0;
  if (before !== after) holdListener?.(after);
}

/**
 * Остановка игры площадкой: `held` true — пришло `game_api_pause` или открылась реклама (заглушить звук, поставить партию на паузу), false — закрылось всё, что останавливало игру
 * (вернуть звук, снять паузу, поставленную площадкой). Подписка на `game_api_pause` и `game_api_resume` — здесь же.
 */
export function onGameHold(listener: (held: boolean) => void): void {
  holdListener = listener;
  try {
    sdk?.on?.('game_api_pause', () => setHold('platform', true));
    sdk?.on?.('game_api_resume', () => setHold('platform', false));
  } catch {
    /* см. выше */
  }
}

/** Стоит ли игра сейчас по воле площадки (пауза или реклама). */
export function gameHeld(): boolean {
  return holds.size > 0;
}

/** Есть ли реклама: SDK подключён и умеет показывать оба вида (вне площадки — нет, кнопки рекламы не показываются). */
export function adsAvailable(): boolean {
  return typeof sdk?.adv?.showFullscreenAdv === 'function' && typeof sdk?.adv?.showRewardedVideo === 'function';
}

/** Итог показа рекламы с вознаграждением: `rewarded` — площадка выдала награду (`onRewarded`), `closed` — окно закрыто без награды, `error` — реклама не показана. */
export type RewardedResult = 'rewarded' | 'closed' | 'error';

/**
 * Показ рекламы (общая часть): пока окно открыто — остановка `ad`; итог — когда окно закрылось, показ не удался или окно не открылось за `AD_OPEN_TIMEOUT_MS`.
 * Окно, открывшееся позже срока, всё равно останавливает игру до своего закрытия.
 */
function showAd(kind: 'fullscreen' | 'rewarded'): Promise<RewardedResult> {
  return new Promise((resolve) => {
    let opened = false;
    let rewarded = false;
    let done = false;
    const finish = (result: RewardedResult): void => {
      if (done) return;
      done = true;
      resolve(result);
    };
    const timer = window.setTimeout(() => {
      if (!opened) finish('error');
    }, AD_OPEN_TIMEOUT_MS);
    const close = (result: RewardedResult): void => {
      window.clearTimeout(timer);
      setHold('ad', false);
      finish(result);
    };
    const callbacks: AdCallbacks = {
      onOpen: () => {
        opened = true;
        setHold('ad', true);
      },
      onRewarded: () => {
        rewarded = true;
      },
      onClose: () => close(rewarded ? 'rewarded' : opened ? 'closed' : 'error'),
      onError: () => close(rewarded ? 'rewarded' : 'error'),
      onOffline: () => close('error'),
    };
    try {
      if (kind === 'fullscreen') sdk!.adv!.showFullscreenAdv!({ callbacks });
      else sdk!.adv!.showRewardedVideo!({ callbacks });
    } catch {
      close('error');
    }
  });
}

/** Полноэкранная реклама (раздел 2.4 плана): только после «Заново» или «В меню» на экране конца попытки. Без SDK — сразу. Итог — когда можно продолжать. */
export async function showFullscreenAd(): Promise<void> {
  if (!adsAvailable()) return;
  await showAd('fullscreen');
}

/** Реклама с вознаграждением (раздел 2.1 плана): награду выдаёт `onRewarded`, а не закрытие окна. Без SDK — `error`. */
export async function showRewardedAd(): Promise<RewardedResult> {
  if (!adsAvailable()) return 'error';
  return showAd('rewarded');
}

/** Разметка игрового процесса (`GameplayAPI.start()` / `stop()`): идёт ли партия, а не пауза, меню или экран конца. Повторные вызовы с тем же значением игнорируются. */
export function gameplay(active: boolean): void {
  if (playing === active) return;
  playing = active;
  try {
    if (active) sdk?.features?.GameplayAPI?.start();
    else sdk?.features?.GameplayAPI?.stop();
  } catch {
    /* см. выше */
  }
}
