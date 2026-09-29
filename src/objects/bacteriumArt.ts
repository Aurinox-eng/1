import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';

type Kind = keyof typeof CONFIG.types;

/** На сколько пикселей оболочка толще за каждое лишнее HP (у 1-HP типов оболочка тонкая и не меняется). */
const SHELL_STEP: Record<Kind, number> = { coccus: 0, rod: 3, splitter: 3, armored: 3.4, spore: 0 };
const SHELL_BASE = 4;
/** Расстояние от центра делящейся до центра каждой доли, в радиусах доли (чем больше, тем глубже перетяжка). */
export const SPLITTER_LOBE_OFFSET = 0.95;

/** Толщина оболочки: чем больше осталось HP, тем толще. Так здоровье видно без текста. */
export function shellWidth(kind: Kind, hp: number): number {
  return SHELL_BASE + Math.max(0, hp - 1) * SHELL_STEP[kind];
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
  const damage = state.maxHp - state.hp;
  g.clear();

  if (kind === 'rod') {
    // Палочка: вытянутая капсула
    const w = cfg.radius * 2;
    const l = cfg.length;
    g.fillStyle(col.shell, 1);
    g.fillRoundedRect(-w / 2, -l / 2, w, l, w / 2);
    g.fillStyle(col.body, 1);
    g.fillRoundedRect(-w / 2 + sw, -l / 2 + sw, w - 2 * sw, l - 2 * sw, (w - 2 * sw) / 2);
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
    g.fillCircle(-off, 0, r - sw);
    g.fillCircle(off, 0, r - sw);
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
  g.fillCircle(0, 0, r - sw);
  shine(g, -r * 0.35, -r * 0.38, r * 0.16);
  const step = (Math.PI * 2) / Math.max(3, state.maxHp);
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
