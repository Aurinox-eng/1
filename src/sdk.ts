/**
 * Обёртка SDK Яндекс Игр (этап 9, раздел 1 плана docs/stage-9-plan-2026-10-23.md). Вне площадки SDK нет — все вызовы ничего не делают, игра работает как раньше.
 *
 * Что делает обёртка (требования площадки — docs/stage-9-plan-2026-10-23.md):
 *  • п. 1.19.1: SDK инициализируется скриптом `/sdk.js` и `YaGames.init()`;
 *  • п. 1.19.2: `LoadingAPI.ready()` — когда пользователь уже может начать игру (`sdkReady`, один раз за запуск);
 *  • п. 1.3: по событиям `game_api_pause` и `game_api_resume` игра глушит и возвращает звук и ставит партию на паузу (`onPlatformPause`);
 *  • п. 2.14: язык берётся из `environment.i18n.lang` при запуске (`sdkLanguage`);
 *  • п. 1.19.3: `GameplayAPI.start()` и `GameplayAPI.stop()` размечают игровой процесс (`gameplay`).
 *
 * Скрипт SDK подгружается только на площадке: в тестовой сборке (`?qa`), на localhost, на github.io и из файла его нет; подставной SDK для проверок — `window.YaGames`, заданный до запуска игры.
 * Любая ошибка или молчание SDK дольше `LOAD_TIMEOUT_MS` не мешают игре: она запускается без SDK.
 */
import { QA_ENABLED } from './debug';

interface YandexSdk {
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

let sdk: YandexSdk | null = null;
let readySent = false;
let playing = false;

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

/** Подписка на `game_api_pause` и `game_api_resume`. */
export function onPlatformPause(pause: () => void, resume: () => void): void {
  try {
    sdk?.on?.('game_api_pause', pause);
    sdk?.on?.('game_api_resume', resume);
  } catch {
    /* см. выше */
  }
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
