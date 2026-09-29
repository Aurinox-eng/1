import type { CONFIG } from './config';

type Kind = keyof typeof CONFIG.types;

/** Цвета и шрифт (внешний вид). Баланс игры здесь не меняется — он в config.ts. */
export const COLORS = {
  background: 0x12203a,
  safeZone: 0x162a4a,
  dangerZone: 0x3a1a26,
  loseLine: 0xff4d5e,
  /**
   * Цвета типов бактерий: тело, оболочка (у бронированной — толстая), трещины.
   * Тип должен читаться с первого взгляда: кокк — зелёный, палочка — синяя, делящаяся — жёлтая,
   * бронированная — фиолетовая, спора — красная.
   */
  kinds: {
    coccus: { body: 0x7bdc7b, shell: 0x2f8f3a, crack: 0x1b5a25 },
    rod: { body: 0x74b8ff, shell: 0x2a62b8, crack: 0x143a78 },
    splitter: { body: 0xffe066, shell: 0xc9981b, crack: 0x7a5800 },
    armored: { body: 0xb99af0, shell: 0x5b3596, crack: 0x2a1650 },
    spore: { body: 0xff7a7a, shell: 0xb02a2a, crack: 0x6a1010 },
  } satisfies Record<Kind, { body: number; shell: number; crack: number }>,
  /** Перегородка «перетяжки» у делящейся. */
  septum: 0x8a6510,
  pill: 0xffffff,
  pillEdge: 0xd0d6e4,
  hit: 0xfff3a3,
  heart: 0xff4d6d,
  heartLost: 0x2b3a5c,
} as const;

export const TEXT_COLORS = {
  main: '#ffffff',
  accent: '#ffd84d',
  stroke: '#0b1020',
  /** Цвета всплывающих очков по типам бактерий. */
  popup: {
    coccus: '#ffffff',
    rod: '#bfe0ff',
    splitter: '#fff0a8',
    armored: '#e2d2ff',
    spore: '#ffc2c2',
  } satisfies Record<Kind, string>,
} as const;

export const FONT = 'Arial, "Segoe UI", Roboto, sans-serif';
