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
  towerSyringe: 'Шприц',
  tagPill: 'по радиусу',
  tagSyrup: 'замедляет',
  tagFizz: 'по площади',
  tagSyringe: 'насквозь',
  infoSyrup: 'Сироп: попавшая бактерия идёт на {pct} % медленнее {sec} с',
  infoFizz: 'Шипучка: взрыв задевает всех бактерий в круге',
  infoSyringe: 'Шприц: игла насквозь, бьёт только тех, кто не дошёл до башни',
  hintPlace: 'Выберите башню справа и тапните по свободной клетке',
  hintNoCoins: 'Не хватает монет',
  hintCantBuild: 'Здесь нельзя ставить башню',
  victory: 'Победа!',
  gameOver: 'Проигрыш',
  killed: 'Уничтожено бактерий: {n}',
  tapToRestart: 'Тапните, чтобы сыграть снова',
  paused: 'Пауза',
  tapToResume: 'Тапните, чтобы продолжить',
  newTypeRod: 'Новая бактерия! Палочка — делает рывки',
  newTypeSplitter: 'Новая бактерия! Делящаяся — при гибели распадается на два кокка',
  newTypeArmored: 'Новая бактерия! Бронированная — очень прочная, отнимает 2 жизни',
  newTypeSpore: 'Новая бактерия! Спора — быстрая, глушит башни рядом',
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
  towerSyringe: 'Syringe',
  tagPill: 'in range',
  tagSyrup: 'slows',
  tagFizz: 'area blast',
  tagSyringe: 'pierces',
  infoSyrup: 'Syrup: a hit bacterium moves {pct}% slower for {sec} s',
  infoFizz: 'Fizz: the blast hits every bacterium in the circle',
  infoSyringe: "Syringe: needle goes through; hits only bacteria not yet past it",
  hintPlace: 'Pick a tower on the right, then tap an empty cell',
  hintNoCoins: 'Not enough coins',
  hintCantBuild: "You can't build here",
  victory: 'Victory!',
  gameOver: 'Game over',
  killed: 'Bacteria destroyed: {n}',
  tapToRestart: 'Tap to play again',
  paused: 'Paused',
  tapToResume: 'Tap to resume',
  newTypeRod: 'New bacterium! Rod — makes dashes',
  newTypeSplitter: 'New bacterium! Splitter — splits into two cocci when killed',
  newTypeArmored: 'New bacterium! Armored — very tough, costs 2 lives',
  newTypeSpore: 'New bacterium! Spore — fast, disables nearby towers',
  coinsPopup: '+{n}',
};

const TEXTS: Record<Lang, Record<TextKey, string>> = { ru, en };

/** Число для текста: по-русски с десятичной запятой («2,5»), по-английски с точкой. */
export function num(n: number): string {
  const text = String(n);
  return getLang() === 'ru' ? text.replace('.', ',') : text;
}

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
