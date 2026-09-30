import type { CONFIG } from './config';

type Kind = keyof typeof CONFIG.types;

/** Цвета и шрифт (внешний вид). Баланс игры здесь не меняется — он в config.ts. */
export const COLORS = {
  background: 0x12203a,
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
  /** Таблетка (снаряд и ствол башни): белая половина и голубая. */
  pill: 0xffffff,
  pillEdge: 0xd0d6e4,
  pillBlue: 0x74b8ff,
  hit: 0xfff3a3,
  heart: 0xff4d6d,
  heartLost: 0x2b3a5c,
  gold: 0xffd84d,
  goldEdge: 0xb8901a,
  /** Правая панель и её кнопки. */
  panel: 0x0d162b,
  panelLine: 0x33578f,
  barBack: 0x22355a,
  slot: 0x121d36,
  slotOn: 0x1c3a6a,
  slotLine: 0x26385e,
  locked: 0x4a5c82,
  button: 0x1c2c50,
  /** Башня. */
  tower: 0x2c4a7c,
  towerEdge: 0x8fb0e6,
  /** «Призрак» башни и её радиус при выборе клетки. */
  ghost: 0x74b8ff,
  ghostEdge: 0x9fd0ff,
} as const;

/** Цвета карты в формате CSS (карта рисуется один раз в текстуры обычным canvas). */
export const MAP_COLORS = {
  background: '#12203a',
  tissue: '#1d3760',
  tissueLine: '#33578f',
  lane: '#0b1528',
  laneOuter: '#24406b',
  organismFrom: '#3a1a26',
  organismTo: '#5c2436',
  loseLine: '#ff4d5e',
  organismText: '#ffb3bd',
} as const;

export const TEXT_COLORS = {
  main: '#ffffff',
  accent: '#ffd84d',
  stroke: '#0b1020',
  dim: '#4a5c82',
  bad: '#ff6b7a',
} as const;

export const FONT = 'Arial, "Segoe UI", Roboto, sans-serif';
