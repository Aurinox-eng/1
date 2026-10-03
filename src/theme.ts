import type { CONFIG } from './config';

type Kind = keyof typeof CONFIG.types;

/** Цвета и шрифт (внешний вид). Баланс игры здесь не меняется — он в config.ts. */
export const COLORS = {
  background: 0x12203a,
  loseLine: 0xff4d5e,
  /**
   * Цвета типов бактерий: тело, оболочка (у бронированной — толстая), трещины.
   * Тип должен читаться с первого взгляда: кокк — зелёный, палочка — синяя, делящаяся — ярко-оранжевая,
   * бронированная — фиолетовая, спора — красная.
   */
  kinds: {
    coccus: { body: 0x7bdc7b, shell: 0x2f8f3a, crack: 0x1b5a25 },
    rod: { body: 0x74b8ff, shell: 0x2a62b8, crack: 0x143a78 },
    splitter: { body: 0xff7a00, shell: 0xb84a00, crack: 0x6a2800 },
    armored: { body: 0xb99af0, shell: 0x5b3596, crack: 0x2a1650 },
    spore: { body: 0xff7a7a, shell: 0xb02a2a, crack: 0x6a1010 },
    /** Рой — бирюзовый; бегун — малиновый (оранжевую взяла делящаяся: жёлтая была похожа на монету); лекарь — белый с розовым. */
    swarm: { body: 0x5fe0c8, shell: 0x1f8f7c, crack: 0x0f5a4e },
    runner: { body: 0xf06bd6, shell: 0xa3238f, crack: 0x5a0e4c },
    healer: { body: 0xfff0f5, shell: 0xe05a8a, crack: 0x8a2a50 },
    /** Слизень — лаймовый; регенератор — тёмно-зелёный; командир — тёмно-синий; матка — бежевая; гигант — тёмно-бордовый. */
    slick: { body: 0xc4ee45, shell: 0x7ea516, crack: 0x4a6008 },
    regen: { body: 0x2fbf78, shell: 0x137a47, crack: 0x084a2a },
    commander: { body: 0x4a5aa8, shell: 0x222f6e, crack: 0x10184a },
    brood: { body: 0xecd2a8, shell: 0xa4713f, crack: 0x5c3a18 },
    giant: { body: 0x8a2a3a, shell: 0x3c0e18, crack: 0x1c0408 },
  } satisfies Record<Kind, { body: number; shell: number; crack: number }>,
  /** Крест лекаря, аура лекаря, лужа сиропа и луч шприца. */
  cross: 0xe0457a,
  aura: 0x7dffb0,
  /** Кольцо-аура командира (ускорение) и звезда на нём, пятна на яйцах матки, шипы гиганта. */
  haste: 0xff6b4a,
  /** Кислота Шипучки (кольцо на бактерии) и яд лужи Сиропа. */
  acid: 0xb6ff3c,
  /** Подсветка башен, с которыми можно слить выбранную. */
  merge: 0x5dff9a,
  star: 0xffd84d,
  egg: 0xfff4dc,
  spike: 0xd9b3a0,
  puddle: 0xff9f43,
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
  /** Сироп (оранжевый: замедление), шипучка (розовая: взрыв), шприц (светлый с бирюзовой иглой: пробивание). */
  syrup: 0xff9f43,
  syrupDark: 0xc96a12,
  fizz: 0xff5fa8,
  fizzDark: 0xb02a6a,
  syringe: 0xe8f1ff,
  syringeEdge: 0x9fb4d8,
  needle: 0x5fe3ff,
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
  soft: '#9fb3d9',
  bad: '#ff6b7a',
} as const;

export const FONT = 'Arial, "Segoe UI", Roboto, sans-serif';
