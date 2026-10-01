import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

type Kind = keyof typeof CONFIG.types;

/** Какую долю радиуса (у палочки — половины ширины) занимает оболочка при полном HP (у кокка и споры оболочка тонкая и не меняется).
 *  Доля меньше половины, поэтому тело внутри не исчезает при любом числе HP в config.ts (раньше толщина росла на фиксированное число
 *  пикселей за каждое HP, и у бронированной с 14 HP радиус тела выходил отрицательным — режим canvas на этом падал). */
const SHELL_MAX_SHARE: Record<Kind, number> = { coccus: 0, rod: 0.45, splitter: 0.4, armored: 0.45, spore: 0, swarm: 0, runner: 0.4, healer: 0.3 };
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

/**
 * Рисует тело бактерии в её собственных координатах (центр в 0,0).
 * Форма зависит от типа, толщина оболочки и число трещин — от оставшегося HP.
 */
export function drawBody(g: Phaser.GameObjects.Graphics, kind: Kind, state: BodyState): void {
  const cfg = CONFIG.types[kind];
  const col = COLORS.kinds[kind];
  const sw = shellWidth(kind, state.hp);
  // Трещины: чем больше потеряно HP, тем их больше (не больше 9, даже у бронированной с 20 HP)
  const damage = Math.round(Math.min(1, Math.max(0, state.maxHp - state.hp) / state.maxHp) * Math.min(state.maxHp, 9));
  g.clear();

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
    for (let i = 0; i < damage; i++) crack(g, col.crack, [(i % 2 === 0 ? -1 : 1) * w * 0.5, -l * 0.2 + i * 7], [(i % 2 === 0 ? -1 : 1) * w * 0.1, -l * 0.1 + i * 7], [0, l * 0.05 + i * 5]);
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
    for (let i = 0; i < damage; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const y = -l / 2 + ((i + 1) * l) / (state.maxHp + 1);
      crack(g, col.crack, [side * w * 0.5, y], [side * w * 0.12, y + 9], [-side * w * 0.08, y - 5]);
    }
    return;
  }

  if (kind === 'splitter') {
    // Делящаяся: две доли с перетяжкой посередине
    const r = cfg.radius;
    const off = r * SPLITTER_LOBE_OFFSET + state.spread;
    g.fillStyle(col.shell, 1);
    g.fillCircle(-off, 0, r);
    g.fillCircle(off, 0, r);
    g.fillStyle(col.body, 1);
    g.fillCircle(-off, 0, Math.max(1, r - sw));
    g.fillCircle(off, 0, Math.max(1, r - sw));
    // перетяжка: тёмная перегородка и две «зарубки» сверху и снизу
    const waist = Math.sqrt(Math.max(1, r * r - (r * SPLITTER_LOBE_OFFSET) ** 2)) + 2;
    g.lineStyle(5, COLORS.septum, 1);
    g.lineBetween(0, -waist - state.spread * 0.3, 0, waist + state.spread * 0.3);
    shine(g, -off - r * 0.3, -r * 0.35, r * 0.16);
    shine(g, off - r * 0.3, -r * 0.35, r * 0.16);
    for (let i = 0; i < damage; i++) {
      const cx = i % 2 === 0 ? -off : off;
      crack(g, col.crack, [cx - r * 0.9, -r * 0.2 + i * 6], [cx - r * 0.45, r * 0.1], [cx - r * 0.2, -r * 0.05]);
    }
    return;
  }

  // Кокк, бронированная, спора: круг. Оболочка — кольцо по краю, толщина зависит от HP.
  const r = cfg.radius;
  g.fillStyle(col.shell, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(col.body, 1);
  g.fillCircle(0, 0, Math.max(1, r - sw));
  shine(g, -r * 0.35, -r * 0.38, r * 0.16);
  if (kind === 'healer') {
    // Лекарь: розовый крест на белом теле
    g.fillStyle(COLORS.cross, 1);
    g.fillRoundedRect(-r * 0.13, -r * 0.55, r * 0.26, r * 1.1, 3);
    g.fillRoundedRect(-r * 0.55, -r * 0.13, r * 1.1, r * 0.26, 3);
  }
  const step = (Math.PI * 2) / Math.max(3, Math.min(9, state.maxHp));
  for (let i = 0; i < damage; i++) {
    const a = state.seed + i * step;
    crack(
      g,
      col.crack,
      [Math.cos(a) * r, Math.sin(a) * r],
      [Math.cos(a + 0.14) * r * 0.72, Math.sin(a + 0.14) * r * 0.72],
      [Math.cos(a - 0.1) * r * 0.45, Math.sin(a - 0.1) * r * 0.45],
    );
  }
}
