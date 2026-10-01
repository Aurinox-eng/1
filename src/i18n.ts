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
  startWave: 'Начать волну',
  tagPill: 'по радиусу',
  tagSyrup: 'лужа',
  tagFizz: 'взрыв',
  tagSyringe: 'луч',
  infoSyrup: 'Сироп: бросает на дорожку лужу — в ней бактерии идут на {pct} % медленнее',
  infoFizz: 'Шипучка: небольшой взрыв — бьёт кучки бактерий',
  infoSyringe: 'Шприц: луч через всю карту. Тапните по башне — повернуть на 45°',
  hintRotate: 'Тапните по Шприцу — повернуть луч на 45°',
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
  newTypeArmored: 'Новая бактерия! Бронированная — броня почти не пускает слабые удары, отнимает 2 жизни',
  newTypeSpore: 'Новая бактерия! Спора — быстрая, глушит башни рядом',
  newTypeSwarm: 'Новая бактерия! Рой — мелкие и быстрые, идут пачкой',
  newTypeRunner: 'Новая бактерия! Бегун — очень быстрый: замедлите его лужей',
  newTypeHealer: 'Новая бактерия! Лекарь — лечит бактерий вокруг себя',
  newTypeSlick: 'Новая бактерия! Слизень — скользкий: лужа Сиропа на него не действует',
  newTypeRegen: 'Новая бактерия! Регенератор — сам быстро лечится: бейте сильно и разом',
  newTypeCommander: 'Новая бактерия! Командир — ускоряет бактерий вокруг себя',
  newTypeBrood: 'Новая бактерия! Матка — на ходу рожает мелких бактерий',
  newTypeGiant: 'БОСС! Гигант — огромный и прочный, отнимает все 3 жизни',
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
  startWave: 'Start wave',
  tagPill: 'in range',
  tagSyrup: 'puddle',
  tagFizz: 'blast',
  tagSyringe: 'beam',
  infoSyrup: 'Syrup: drops a puddle on the path — bacteria in it move {pct}% slower',
  infoFizz: 'Fizz: a small blast — hits clumps of bacteria',
  infoSyringe: 'Syringe: a beam across the whole map. Tap the tower to turn it 45°',
  hintRotate: 'Tap the Syringe to turn its beam by 45°',
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
  newTypeArmored: 'New bacterium! Armored — its armor blocks weak hits, costs 2 lives',
  newTypeSpore: 'New bacterium! Spore — fast, disables nearby towers',
  newTypeSwarm: 'New bacterium! Swarm — small and fast, they come in a pack',
  newTypeRunner: 'New bacterium! Runner — very fast: slow it with a puddle',
  newTypeHealer: 'New bacterium! Healer — heals the bacteria around it',
  newTypeSlick: "New bacterium! Slick — slippery: Syrup puddles don't work on it",
  newTypeRegen: 'New bacterium! Regenerator — heals itself fast: hit hard and all at once',
  newTypeCommander: 'New bacterium! Commander — speeds up the bacteria around it',
  newTypeBrood: 'New bacterium! Broodmother — gives birth to small bacteria on the move',
  newTypeGiant: 'BOSS! Giant — huge and tough, costs all 3 lives',
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
