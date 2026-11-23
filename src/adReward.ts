/**
 * Награда за рекламу с вознаграждением (этап 9, раздел 2.1 плана docs/stage-9-plan-2026-10-23.md; решение владельца 23 октября 2026, сообщение 3, п. 5.1):
 * прибавка к стартовым монетам СЛЕДУЮЩЕЙ попытки (`ads.rewardStartCoins` в config.ts), не ДНК. Награда ждёт в хранилище браузера (ключ `AD_COINS_KEY`), чтобы не пропасть,
 * если игру закрыли после просмотра; новая попытка забирает её при старте. Награды не складываются: одна попытка — не больше одного показа, следующая попытка забирает одну награду.
 */

/** Ключ хранилища. */
export const AD_COINS_KEY = 'pvb.adCoins5';
/** Больше этого при чтении — запись испорчена (защита от чужой записи), монет. */
const MAX_AD_COINS = 100000;

/** В памяти — если хранилище недоступно (закрытый режим браузера): награда живёт до закрытия страницы. */
let memory = 0;

function read(): number {
  try {
    const n = Number(window.localStorage.getItem(AD_COINS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_AD_COINS, Math.floor(n)) : 0;
  } catch {
    return memory;
  }
}

function write(n: number): void {
  memory = n;
  try {
    if (n > 0) window.localStorage.setItem(AD_COINS_KEY, String(n));
    else window.localStorage.removeItem(AD_COINS_KEY);
  } catch {
    /* хранилище недоступно: награда — в памяти страницы */
  }
}

/** Площадка выдала награду (`onRewarded`): монеты ждут следующую попытку. */
export function grantAdCoins(n: number): void {
  write(Math.max(0, Math.floor(n)));
}

/** Сколько монет ждёт следующую попытку. */
export function pendingAdCoins(): number {
  return read();
}

/** Начало попытки: забрать награду (после этого её нет). */
export function takeAdCoins(): number {
  const n = read();
  if (n > 0) write(0);
  return n;
}
