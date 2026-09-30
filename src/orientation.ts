/**
 * Телефон или планшет держат вертикально: игра рассчитана на горизонтальное положение, поэтому поверх неё показывается
 * подсказка «Поверните телефон» (см. index.html), а игровое время стоит — волна не идёт за закрытым экраном.
 * На компьютере (мышь) это условие не срабатывает никогда.
 */
const query = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
let portrait = query.matches;
query.addEventListener('change', (event) => {
  portrait = event.matches;
});

export function isPortraitPhone(): boolean {
  return portrait;
}
