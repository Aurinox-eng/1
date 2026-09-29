/** Цвета и шрифт (внешний вид). Баланс игры здесь не меняется — он в config.ts. */
export const COLORS = {
  background: 0x12203a,
  safeZone: 0x162a4a,
  dangerZone: 0x3a1a26,
  loseLine: 0xff4d5e,
  /** Цвета бактерий по размерам: чем мельче, тем светлее. */
  bacteria: { large: 0x4fb864, medium: 0x76cf6c, small: 0xa6e46a },
  bacteriaEdge: 0x2f8f3a,
  /** Обводка бактерии перед самоделением. */
  warn: 0xffd84d,
  pill: 0xffffff,
  pillEdge: 0xd0d6e4,
  hit: 0xfff3a3,
} as const;

export const TEXT_COLORS = {
  main: '#ffffff',
  accent: '#ffd84d',
  stroke: '#0b1020',
  /** Цвета всплывающих очков по размерам бактерии. */
  popup: { large: '#ffffff', medium: '#ffe08a', small: '#ffd84d' },
} as const;

export const FONT = 'Arial, "Segoe UI", Roboto, sans-serif';
