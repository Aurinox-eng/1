/**
 * Тексты игры на русском и английском.
 *
 * Чтобы добавить или изменить текст: правьте строки в `ru`, а затем такую же строку в `en`.
 * Если ключ есть в `ru`, но забыт в `en`, проект не соберётся — так перевод не потеряется.
 * В тексте можно использовать вставки вида {n} — они заменяются значениями в коде.
 */
import { getLang, type Lang } from './lang';

const ru = {
  score: 'Счёт: {n}',
  time: 'Время: {n}',
  gameOver: 'Проигрыш',
  finalScore: 'Ваш счёт: {n}',
  tapToRestart: 'Тапните, чтобы сыграть снова',
  speedUp: 'Быстрее!',
};

export type TextKey = keyof typeof ru;

const en: Record<TextKey, string> = {
  score: 'Score: {n}',
  time: 'Time: {n}',
  gameOver: 'Game over',
  finalScore: 'Your score: {n}',
  tapToRestart: 'Tap to play again',
  speedUp: 'Faster!',
};

const TEXTS: Record<Lang, Record<TextKey, string>> = { ru, en };

/** Возвращает текст на текущем языке. `vars` подставляет значения вместо {имя}. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
  let text = TEXTS[getLang()][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
