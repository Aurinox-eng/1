// Заглушка: улучшения вне партии. META[effect] — сумма бонуса (по умолчанию 0); keyOwned — ключевые узлы (по умолчанию нет).
export const META: Record<string, number> = {};
export let KEYS = false;
export function setKeys(v: boolean) { KEYS = v; }
export function upgradeBonus(effect: string, _branch?: string): number { return META[effect] ?? 0; }
export function damageMul(): number { return 1 + (META['damage'] ?? 0); }
export function keyOwned(_id: string): boolean { return KEYS; }
