/**
 * Выбор языка игры. Сейчас язык определяется по настройкам браузера.
 * На этапе 4 добавится определение языка через SDK Яндекс Игр (он будет главнее браузера).
 */
import { QA_ENABLED } from './debug';

export type Lang = 'ru' | 'en';

let current: Lang | null = null;

/**
 * Определяет язык: сначала параметр ?lang=ru|en в адресе (только в режиме разработки и тестовой
 * сборке — в игровой сборке его нет), затем язык браузера.
 */
export function detectLang(): Lang {
  const fromUrl = QA_ENABLED ? new URLSearchParams(window.location.search).get('lang') : null;
  if (fromUrl === 'ru' || fromUrl === 'en') return fromUrl;

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
