/**
 * Тексты игры на русском и английском.
 *
 * Чтобы добавить или изменить текст: правьте строки в `ru`, а затем такую же строку в `en`.
 * Если ключ есть в `ru`, но забыт в `en`, проект не соберётся — так перевод не потеряется.
 * В тексте можно использовать вставки вида {n} — они заменяются значениями в коде.
 */
import { getLang, type Lang } from './lang';

const ru = {
  gameTitle: 'Таблетки против бактерий',
  wave: 'Волна {n} / {total}',
  nextWave: 'Волна через {n} с',
  organism: 'Организм',
  rotatePhone: 'Поверните телефон горизонтально',
  towerPill: 'Таблетка',
  towerSyrup: 'Сироп',
  towerFizz: 'Шипучка',
  towerCapsule: 'Капсула',
  locked: 'закрыто',
  hintPlace: 'Выберите башню справа и тапните по свободной клетке',
  hintNoCoins: 'Не хватает монет',
  hintCantBuild: 'Здесь нельзя ставить башню',
  victory: 'Победа!',
  gameOver: 'Проигрыш',
  killed: 'Уничтожено бактерий: {n}',
  tapToRestart: 'Тапните, чтобы сыграть снова',
  paused: 'Пауза',
  tapToResume: 'Тапните, чтобы продолжить',
  coinsPopup: '+{n}',
};

export type TextKey = keyof typeof ru;

const en: Record<TextKey, string> = {
  gameTitle: 'Pills vs Bacteria',
  wave: 'Wave {n} / {total}',
  nextWave: 'Next in {n} s',
  organism: 'Organism',
  rotatePhone: 'Rotate your phone to landscape',
  towerPill: 'Pill',
  towerSyrup: 'Syrup',
  towerFizz: 'Fizz',
  towerCapsule: 'Capsule',
  locked: 'locked',
  hintPlace: 'Pick a tower on the right, then tap an empty cell',
  hintNoCoins: 'Not enough coins',
  hintCantBuild: "You can't build here",
  victory: 'Victory!',
  gameOver: 'Game over',
  killed: 'Bacteria destroyed: {n}',
  tapToRestart: 'Tap to play again',
  paused: 'Paused',
  tapToResume: 'Tap to resume',
  coinsPopup: '+{n}',
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
