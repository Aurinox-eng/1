import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

type Kind = keyof typeof CONFIG.types;

/** Какую долю радиуса (у палочки — половины ширины) занимает оболочка при полном HP (у кокка и споры оболочка тонкая и не меняется).
 *  Доля меньше половины, поэтому тело внутри не исчезает при любом числе HP в config.ts (раньше толщина росла на фиксированное число
 *  пикселей за каждое HP, и у бронированной с 14 HP радиус тела выходил отрицательным — режим canvas на этом падал). */
const SHELL_MAX_SHARE: Record<Kind, number> = { coccus: 0, rod: 0.45, splitter: 0.4, armored: 0.45, spore: 0, swarm: 0, runner: 0.4, healer: 0.3, slick: 0.25, regen: 0.3, commander: 0.3, brood: 0.3, giant: 0.4 };
const SHELL_BASE = 4;
/** Расстояние от центра делящейся до центра каждой доли, в радиусах доли (чем больше, тем глубже перетяжка). */
export const SPLITTER_LOBE_OFFSET = 0.95;

/** Толщина оболочки: чем больше осталось HP, тем толще (от SHELL_BASE при 1 HP до доли радиуса при полном HP). Так здоровье видно без текста. */
export function shellWidth(kind: Kind, hp: number): number {
  const { hp: maxHp, radius } = CONFIG.types[kind];
  const share = SHELL_MAX_SHARE[kind];
  if (maxHp <= 1 || share <= 0) return SHELL_BASE;
  const top = Math.max(SHELL_BASE, radius * share);
  return SHELL_BASE + (top - SHELL_BASE) * Math.min(1, Math.max(0, hp - 1) / (maxHp - 1));
}

/** Ломаная-трещина от точки на краю внутрь тела. */
function crack(g: Phaser.GameObjects.Graphics, color: number, ...points: [number, number][]): void {
  g.lineStyle(3.5, color, 1);
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) g.lineTo(x, y);
  g.strokePath();
}

/** Блик — маленький светлый кружок: тело выглядит объёмнее. */
function shine(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(x, y, r);
}

export interface BodyState {
  hp: number;
  maxHp: number;
  /** Насколько раздвинуты доли делящейся (перед самоделением). */
  spread: number;
  /** Случайное число, чтобы трещины у разных бактерий шли по-разному. */
  seed: number;
}

/** Сколько трещин рисуется при таком HP: чем больше потеряно, тем их больше (не больше 9, даже у бронированной с 20 HP). */
export function crackCount(hp: number, maxHp: number): number {
  return Math.round(Math.min(1, Math.max(0, maxHp - hp) / maxHp) * Math.min(maxHp, 9));
}

/** Круглые типы: трещины идут от края к центру под углом seed, поэтому их можно нарисовать один раз и поворачивать картинкой. */
export function hasRadialCracks(kind: Kind): boolean {
  return kind !== 'runner' && kind !== 'rod' && kind !== 'splitter';
}

/** Насколько рисунок типа выходит за центр по горизонтали и вертикали (с запасом на толщину линий), пикселей мира. */
export function bodyHalfSize(kind: Kind): { hx: number; hy: number } {
  const { radius: r, length: l } = CONFIG.types[kind];
  const pad = 4;
  if (kind === 'runner') return { hx: r + pad, hy: l / 2 + 24 };
  if (kind === 'rod') return { hx: r + pad, hy: l / 2 + pad };
  if (kind === 'splitter') return { hx: r * SPLITTER_LOBE_OFFSET + r + pad, hy: r + pad };
  if (kind === 'giant') return { hx: r * 1.28 + pad, hy: r * 1.28 + pad };
  if (kind === 'slick') return { hx: r + pad, hy: r * 1.52 + pad };
  return { hx: r + pad, hy: r + pad };
}

/**
 * Рисует тело бактерии в её собственных координатах (центр в 0,0).
 * Форма зависит от типа, толщина оболочки и число трещин — от оставшегося HP.
 */
export function drawBody(g: Phaser.GameObjects.Graphics, kind: Kind, state: BodyState): void {
  g.clear();
  drawShape(g, kind, shellWidth(kind, state.hp), state.spread);
  drawCracks(g, kind, crackCount(state.hp, state.maxHp), state.maxHp, state.seed);
}

/** Тело без трещин: sw — толщина оболочки (от HP, см. shellWidth), spread — насколько раздвинуты доли делящейся. */
export function drawShape(g: Phaser.GameObjects.Graphics, kind: Kind, sw: number, spread = 0): void {
  const cfg = CONFIG.types[kind];
  const col = COLORS.kinds[kind];

  if (kind === 'runner') {
    // Бегун: острая «капля», голова вперёд (вверх по своим осям), сзади три полоски скорости
    const w = cfg.radius * 2;
    const l = cfg.length;
    g.lineStyle(4, col.shell, 0.55);
    for (const dx of [-w * 0.28, 0, w * 0.28]) g.lineBetween(dx, l / 2 + 4, dx, l / 2 + 14 + Math.abs(dx) * 0.3);
    g.fillStyle(col.shell, 1);
    g.fillEllipse(0, 0, w, l);
    g.fillStyle(col.body, 1);
    g.fillEllipse(0, 0, Math.max(2, w - 2 * sw), Math.max(2, l - 2 * sw));
    shine(g, -w * 0.12, -l * 0.22, w * 0.1);
    return;
  }

  if (kind === 'rod') {
    // Палочка: вытянутая капсула
    const w = cfg.radius * 2;
    const l = cfg.length;
    g.fillStyle(col.shell, 1);
    g.fillRoundedRect(-w / 2, -l / 2, w, l, w / 2);
    g.fillStyle(col.body, 1);
    g.fillRoundedRect(-w / 2 + sw, -l / 2 + sw, Math.max(1, w - 2 * sw), Math.max(1, l - 2 * sw), Math.max(1, w - 2 * sw) / 2);
    shine(g, -w * 0.18, -l * 0.28, w * 0.1);
    return;
  }

  if (kind === 'splitter') {
    // Делящаяся: две доли с перетяжкой посередине
    const r = cfg.radius;
    const off = r * SPLITTER_LOBE_OFFSET + spread;
    g.fillStyle(col.shell, 1);
    g.fillCircle(-off, 0, r);
    g.fillCircle(off, 0, r);
    g.fillStyle(col.body, 1);
    g.fillCircle(-off, 0, Math.max(1, r - sw));
    g.fillCircle(off, 0, Math.max(1, r - sw));
    // перетяжка: тёмная перегородка и две «зарубки» сверху и снизу
    const waist = Math.sqrt(Math.max(1, r * r - (r * SPLITTER_LOBE_OFFSET) ** 2)) + 2;
    g.lineStyle(5, COLORS.septum, 1);
    g.lineBetween(0, -waist - spread * 0.3, 0, waist + spread * 0.3);
    shine(g, -off - r * 0.3, -r * 0.35, r * 0.16);
    shine(g, off - r * 0.3, -r * 0.35, r * 0.16);
    return;
  }

  // Кокк, бронированная, спора и остальные круглые: круг. Оболочка — кольцо по краю, толщина зависит от HP.
  const r = cfg.radius;
  if (kind === 'giant') {
    // Гигант: шипы по кругу (под телом)
    g.fillStyle(COLORS.spike, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      g.fillTriangle(nx * (r - 4) - ny * r * 0.16, ny * (r - 4) + nx * r * 0.16, nx * (r - 4) + ny * r * 0.16, ny * (r - 4) - nx * r * 0.16, nx * (r + r * 0.28), ny * (r + r * 0.28));
    }
  }
  if (kind === 'slick') {
    // Слизень: подтёки под телом
    g.fillStyle(col.shell, 1);
    for (const [dx, len] of [[-0.45, 0.45], [0.05, 0.62], [0.5, 0.38]] as const) g.fillRoundedRect(dx * r - r * 0.12, r * 0.5, r * 0.24, r * len + r * 0.4, r * 0.12);
  }
  g.fillStyle(col.shell, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(col.body, 1);
  g.fillCircle(0, 0, Math.max(1, r - sw));
  shine(g, -r * 0.35, -r * 0.38, r * (kind === 'slick' ? 0.24 : 0.16));
  if (kind === 'regen') {
    // Регенератор: белая стрелка-кольцо (круговая)
    g.lineStyle(Math.max(3, r * 0.1), 0xffffff, 0.9);
    g.beginPath();
    g.arc(0, 0, r * 0.5, -0.4, Math.PI * 1.45);
    g.strokePath();
    const tipA = Math.PI * 1.45;
    const tx = Math.cos(tipA) * r * 0.5;
    const ty = Math.sin(tipA) * r * 0.5;
    g.fillStyle(0xffffff, 0.95);
    g.fillTriangle(tx + r * 0.2, ty - r * 0.02, tx - r * 0.14, ty - r * 0.2, tx - r * 0.14, ty + r * 0.2);
  }
  if (kind === 'commander') {
    // Командир: золотая звезда
    g.fillStyle(COLORS.star, 1);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r * 0.62 : r * 0.28;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillPath();
  }
  if (kind === 'brood') {
    // Матка: светлые «яйца» внутри
    g.fillStyle(COLORS.egg, 0.95);
    for (const [ex, ey, er] of [[-0.3, 0.18, 0.2], [0.3, 0.3, 0.17], [0.05, -0.28, 0.19], [0.38, -0.12, 0.12], [-0.28, -0.3, 0.1]] as const) g.fillCircle(ex * r, ey * r, er * r);
    g.lineStyle(2, col.shell, 0.8);
    for (const [ex, ey, er] of [[-0.3, 0.18, 0.2], [0.3, 0.3, 0.17], [0.05, -0.28, 0.19]] as const) g.strokeCircle(ex * r, ey * r, er * r);
  }
  if (kind === 'healer') {
    // Лекарь: розовый крест на белом теле
    g.fillStyle(COLORS.cross, 1);
    g.fillRoundedRect(-r * 0.13, -r * 0.55, r * 0.26, r * 1.1, 3);
    g.fillRoundedRect(-r * 0.55, -r * 0.13, r * 1.1, r * 0.26, 3);
  }
}

/** Трещины поверх тела: damage — сколько (crackCount), maxHp — полное HP этой бактерии, seed — угол первой трещины у круглых типов. */
export function drawCracks(g: Phaser.GameObjects.Graphics, kind: Kind, damage: number, maxHp: number, seed: number): void {
  const cfg = CONFIG.types[kind];
  const col = COLORS.kinds[kind];
  if (kind === 'runner') {
    const w = cfg.radius * 2;
    const l = cfg.length;
    for (let i = 0; i < damage; i++) crack(g, col.crack, [(i % 2 === 0 ? -1 : 1) * w * 0.5, -l * 0.2 + i * 7], [(i % 2 === 0 ? -1 : 1) * w * 0.1, -l * 0.1 + i * 7], [0, l * 0.05 + i * 5]);
    return;
  }
  if (kind === 'rod') {
    const w = cfg.radius * 2;
    const l = cfg.length;
    for (let i = 0; i < damage; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const y = -l / 2 + ((i + 1) * l) / (maxHp + 1);
      crack(g, col.crack, [side * w * 0.5, y], [side * w * 0.12, y + 9], [-side * w * 0.08, y - 5]);
    }
    return;
  }
  if (kind === 'splitter') {
    const r = cfg.radius;
    const off = r * SPLITTER_LOBE_OFFSET;
    for (let i = 0; i < damage; i++) {
      const cx = i % 2 === 0 ? -off : off;
      crack(g, col.crack, [cx - r * 0.9, -r * 0.2 + i * 6], [cx - r * 0.45, r * 0.1], [cx - r * 0.2, -r * 0.05]);
    }
    return;
  }
  const r = cfg.radius;
  const step = (Math.PI * 2) / Math.max(3, Math.min(9, maxHp));
  for (let i = 0; i < damage; i++) {
    const a = seed + i * step;
    crack(
      g,
      col.crack,
      [Math.cos(a) * r, Math.sin(a) * r],
      [Math.cos(a + 0.14) * r * 0.72, Math.sin(a + 0.14) * r * 0.72],
      [Math.cos(a - 0.1) * r * 0.45, Math.sin(a - 0.1) * r * 0.45],
    );
  }
}
