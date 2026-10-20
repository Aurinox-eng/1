// Наборы предложений (вариант правил для lib/towerStatsV.ts). Рекомендованные — «rec».
type V = Record<string, any>;
export const PRESETS: Record<string, (v: V) => void> = {
  // Холод: предел 4 с от паузы уровня 1 + «Долгий холод» поднимает предел ×1,3
  frost: (v) => { v.freezeCapAbs = true; v.freezeCapMulBy = { frostLong: 1.3 }; },
  // Холод, минимальный вариант: правило предела прежнее, «Долгий холод» вместо ×1,5 времени поднимает долю паузы 0,5 → 0,65
  frostMin: (v) => { v.overrides = { ...v.overrides, frostLong: { id: 'frostLong', freezeMul: 0 } }; v.freezeCapMulBy = { frostLong: 1.3 }; },
  // Витамин: «Сильная аура» — своя нижняя граница 0,5 (вместо 0,6) и прежний ×1,5
  vitamin: (v) => { v.auraFloorBy = { vitaminStrong: 0.5 }; },
  vitamin55: (v) => { v.auraFloorBy = { vitaminStrong: 0.55 }; },
  // Антибиотик: потолок яда без частоты и лишних целей
  antibiotic: (v) => { v.dotCapNoRate = true; },
  // Лишние цели в потолке урона — с весом 0,5 / 0
  extraHalf: (v) => { v.extraWeight = 0.5; },
  extraZero: (v) => { v.extraWeight = 0; },
  // Потолок урона 3,0 вместо 2,5
  dps3: (v) => { v.dpsMul = 3; },
  // Доли копий 1; 0,5; 0,25; 0,125
  shares: (v) => { v.copyShares = [1, 0.5, 0.25, 0.125]; },
  // Сироп: «Липкий» ещё и последействие замедления ×1,5 (0,6 с → 0,9 с)
  syrup: (v) => { v.slowSecMulBy = { syrupSticky: 1.5 }; },
  // Лампа: потолок конуса один раз после всех мутаций, «Широкий» ×1,25
  lamp: (v) => { v.coneCapPost = true; v.overrides = { ...v.overrides, lampWide: { id: 'lampWide', coneMul: 1.25 } }; },
  lampPost: (v) => { v.coneCapPost = true; },
  // Бронебойные Таблетка/Ампула: + урон ×1,2 (копии складываются)
  pierce: (v) => { v.extraDamageBy = { pillPierce: 1.2, ampulePierce: 1.2 }; },
};
PRESETS.rec = (v) => { for (const k of ['frost', 'vitamin', 'antibiotic', 'extraHalf', 'shares', 'syrup', 'lamp', 'pierce']) PRESETS[k](v); };
