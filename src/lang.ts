/**
 * Выбор языка игры: параметр `?lang` (только разработка и тестовая сборка), затем язык SDK Яндекс Игр (требование площадки 2.14), затем язык браузера.
 */
import { QA_ENABLED } from './debug';
import { sdkLanguage } from './sdk';

export type Lang = 'ru' | 'en';

let current: Lang | null = null;

/**
 * Определяет язык: сначала параметр ?lang=ru|en в адресе (только в режиме разработки и тестовой
 * сборке — в игровой сборке его нет), затем язык SDK площадки (определён при запуске, до создания игры), затем язык браузера.
 */
export function detectLang(): Lang {
  const fromUrl = QA_ENABLED ? new URLSearchParams(window.location.search).get('lang') : null;
  if (fromUrl === 'ru' || fromUrl === 'en') return fromUrl;
  const fromSdk = sdkLanguage();
  if (fromSdk) return fromSdk;

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const first = (languages[0] ?? 'en').toLowerCase();
  return first.startsWith('ru') ? 'ru' : 'en';
}

export function getLang(): Lang {
  if (!current) current = detectLang();
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}
