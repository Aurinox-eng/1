import type { CONFIG } from './config';

type Kind = keyof typeof CONFIG.types;

/** Цвета и шрифт (внешний вид). Баланс игры здесь не меняется — он в config.ts. */
export const COLORS = {
  background: 0x12203a,
  loseLine: 0xff4d5e,
  /** Вспышка «Щита у линии»: бактерия погашена, жизнь цела. */
  shield: 0x6fd3ff,
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
    /** Прыгун — лимонно-жёлтый; фагоцит — светло-розовый с тёмным ртом. */
    leaper: { body: 0xf2e04a, shell: 0x9a8a10, crack: 0x5a4c06 },
    phago: { body: 0xffc4d6, shell: 0xc0507a, crack: 0x6a2040 },
    /** Скрытная — тёмно-серая (рисуется полупрозрачной) с бледным ободком; токсин — болотно-зелёный с жёлтыми пузырями. */
    stealth: { body: 0x4a525c, shell: 0xc4d0dc, crack: 0x1c2026 },
    toxin: { body: 0x7a9a2a, shell: 0x3e5a14, crack: 0x1f2e08 },
    /** Мутант — фиолетовый с радужными пятнами; паразит — болотно-коричневый с присоской-щупальцем. */
    mutant: { body: 0xa24fd8, shell: 0x56208a, crack: 0x2a0c4a },
    parasite: { body: 0x9a7240, shell: 0x4c3416, crack: 0x261a08 },
  } satisfies Record<Kind, { body: number; shell: number; crack: number }>,
  /** Крест лекаря, аура лекаря, лужа сиропа и луч шприца. */
  cross: 0xe0457a,
  aura: 0x7dffb0,
  /** Кольцо-аура командира (ускорение) и звезда на нём, пятна на яйцах матки, шипы гиганта. */
  haste: 0xff6b4a,
  /** Кислота Шипучки (кольцо на бактерии) и яд лужи Сиропа. */
  acid: 0xb6ff3c,
  /** Яд «Антибиотика» (кольцо на отравленной бактерии) и вспышка «поглощено» у фагоцита. */
  poison: 0x6fe07a,
  absorb: 0xffd0e0,
  /** Подсветка башен, с которыми можно слить выбранную. */
  merge: 0x5dff9a,
  star: 0xffd84d,
  egg: 0xfff4dc,
  spike: 0xd9b3a0,
  puddle: 0x9a5412,
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
  /** Кольцо вокруг замедленной бактерии (светло-голубое: оранжевое сливалось с оранжевой делящейся). */
  slowRing: 0xcfeeff,
  syrupDark: 0xc96a12,
  fizz: 0xff5fa8,
  fizzDark: 0xb02a6a,
  syringe: 0xe8f1ff,
  syringeEdge: 0x9fb4d8,
  needle: 0x5fe3ff,
  /** Ампула (стеклянная, голубая: точный дальний выстрел) и антибиотик (зелёная капсула: яд). */
  ampule: 0xbfe9ff,
  ampuleEdge: 0x2a78b8,
  antibiotic: 0x3fbf6a,
  antibioticEdge: 0x1d7a3e,
  /** Лампа (тёплый жёлтый свет конуса) и витамин (оранжевая таблетка-усилитель). */
  lamp: 0xffe27a,
  lampEdge: 0xa8780c,
  lampLight: 0xfff3a0,
  vitamin: 0xff9f43,
  vitaminEdge: 0xb85a10,
  /** Облако токсина: заливка, обводка и пузыри. */
  cloud: 0x9bbd2a,
  cloudEdge: 0xd2e257,
  cloudBubble: 0xf2e04a,
  /** Бледный ободок и светлая точка скрытной бактерии. */
  stealthRim: 0xdde6ee,
  /** Холод (ледяной кристалл: заморозка) и пластырь (телесная липучка: ловушка). */
  frost: 0x9fe6ff,
  frostEdge: 0x3a8ec0,
  frostLight: 0xe6fbff,
  patch: 0xf2c48a,
  patchEdge: 0xa8703a,
  patchPad: 0xfff6e6,
  /** Лёд на замороженной бактерии, нить паразита к башне, радужные пятна мутанта. */
  ice: 0xcff3ff,
  iceEdge: 0xffffff,
  thread: 0xb98a4a,
  mutantA: 0x5fe3ff,
  mutantB: 0xff6bd6,
  mutantC: 0xc4ee45,
  /** «Призрак» башни и её радиус при выборе клетки. */
  ghost: 0x74b8ff,
  ghostEdge: 0x9fd0ff,
} as const;

/** Дополнительные цвета рисунков башен уровней слияния 2–4 (оттенки и детали; основные цвета башен — в COLORS). */
export const TOWER_ART = {
  steel: 0x4a72b0,
  steelDark: 0x3b5f98,
  bracket: 0x3f65a3,
  rivet: 0x6f8cc2,
  plate: 0xeef3fb,
  plateLight: 0xf4f7fc,
  skyBlue: 0x4aa0ff,
  pillSeam: 0x3b6aa6,
  glowOrange: 0xffb04d,
  syrupBrown: 0x7a3f08,
  syrupLight: 0xffb866,
  syrupSoft: 0xffc67d,
  label: 0xfff3d6,
  gaugeRed: 0xc0392b,
  tankGold: 0xe28a2a,
  fizzBrown: 0x7a1745,
  fizzLight: 0xff8cc4,
  fizzHole: 0x4a0a2a,
  fizzBright: 0xff9ccb,
  fizzShade: 0xd63b8a,
  bolt: 0xcfd8ea,
  boltEdge: 0x5a6f98,
  clamp: 0x3f2a44,
  fire: 0xe04a1a,
  acidDark: 0x2a4a0a,
  acidLight: 0xf0ffaa,
  syringeMetal: 0x7a93bf,
  scope: 0x3a5890,
  syringeWhite: 0xf4f9ff,
  liquidLight: 0xd8ffff,
  liquidDark: 0x25b8e0,
  crystalDark: 0x1fa8d0,
  ampuleLiquid: 0x3aa8ff,
  ampuleLiquidLight: 0x9fdcff,
  ampuleGold: 0xe8c25a,
  ampuleLens: 0x7fe9ff,
  capsuleLight: 0x8df0a8,
  capsuleDark: 0x1d7a3e,
  capsuleBubble: 0xc8ffd8,
  lampBody: 0x56637a,
  lampBodyDark: 0x2e3648,
  lampGlow: 0xffd84d,
  vitaminLight: 0xffd29a,
  vitaminGreen: 0x7be07b,
  vitaminDark: 0xd06a14,
  frostDeep: 0x2a6a9a,
  frostMid: 0x5ab8e8,
  frostShard: 0xc8f2ff,
  patchStrip: 0xe0a868,
  patchHole: 0xb07a40,
  patchRed: 0xe0453a,
} as const;

/** Цвет метки «запомненный вид башни» у мутанта (по id башни). */
export const TOWER_MARK: Record<string, number> = {
  pill: 0xffffff,
  syrup: 0xff9f43,
  fizz: 0xff5fa8,
  syringe: 0x5fe3ff,
  ampule: 0x3aa8ff,
  antibiotic: 0x3fbf6a,
  lamp: 0xffe27a,
  vitamin: 0xff7a1a,
  frost: 0x9fe6ff,
  patch: 0xf2c48a,
};

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
