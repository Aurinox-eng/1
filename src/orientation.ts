/**
 * Телефон или планшет держат вертикально: игра рассчитана на горизонтальное положение, поэтому поверх неё показывается
 * подсказка «Поверните телефон» (см. index.html), а игровое время стоит — волна не идёт за закрытым экраном.
 * На компьютере (мышь) это условие не срабатывает никогда.
 */
const query = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
let portrait = query.matches;
const onChange = (event: MediaQueryListEvent): void => {
  portrait = event.matches;
};
// Safari до 14 знает только устаревший addListener (находка аудита MASTER-0110, решение владельца 28 октября 2026, сообщение 1, п. 7.1)
if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
else query.addListener(onChange);

export function isPortraitPhone(): boolean {
  return portrait;
}
