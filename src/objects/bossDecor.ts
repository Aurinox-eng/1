import Phaser from 'phaser';
import type { BossId } from '../config';

/**
 * Свой вид боссов, у которых одно тело с другим боссом (решение владельца 26 октября 2026, сообщение 6, п. 4): Матка роя и Мать спор (тело Матки), Споровик и Глушитель (тело споры).
 * Тело окрашивается своим цветом (`BOSS_TINT`, умножение цвета картинки тела), поверх — свой отличительный элемент (`drawBossDecor`). Пока только лист образцов (`?qa&artsheet=f3`);
 * в бой — после «да» владельца по листу. Размеры — в долях радиуса вида-основы `r` (босс крупнее в `bossRules.scale` раз: рисунок масштабируется вместе с телом).
 */
export const BOSS_TINT: Partial<Record<BossId, number>> = {
  swarmQueen: 0xb8f4ec,
  sporeMother: 0xf6c2e2,
  sporeling: 0xe2c8ff,
  silencer: 0x9c86d8,
};

/** Отличительный элемент босса поверх тела: Матка роя — кольцо роя-«бусин» по краю; Мать спор — споры на стебельках сверху; Споровик — венчик из спор; Глушитель — тёмные дуги глушения по бокам. */
export function drawBossDecor(g: Phaser.GameObjects.Graphics, id: BossId, r: number): void {
  switch (id) {
    case 'swarmQueen': {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = Math.cos(a) * r * 1.02;
        const y = Math.sin(a) * r * 1.02;
        g.fillStyle(0x3fd6c4, 1).fillCircle(x, y, r * 0.11);
        g.lineStyle(1.5, 0x0e5a52, 1).strokeCircle(x, y, r * 0.11);
        g.fillStyle(0xffffff, 0.6).fillCircle(x - r * 0.03, y - r * 0.03, r * 0.035);
      }
      return;
    }
    case 'sporeMother': {
      for (const dx of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const bx = dx * r;
        const by = -Math.sqrt(Math.max(0, 1 - dx * dx)) * r * 0.92;
        const tx = bx * 1.15;
        const ty = by - r * 0.32;
        g.lineStyle(2.5, 0x7a2a5a, 1).lineBetween(bx, by, tx, ty);
        g.fillStyle(0xe8566e, 1).fillCircle(tx, ty, r * 0.1);
        g.lineStyle(1.5, 0x6a1020, 1).strokeCircle(tx, ty, r * 0.1);
      }
      return;
    }
    case 'sporeling': {
      // венчик из шести спор снаружи кольца босса
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r * 1.62;
        const y = Math.sin(a) * r * 1.62;
        g.lineStyle(3, 0x8a5ac0, 1).lineBetween(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, x, y);
        g.fillStyle(0xc58bff, 1).fillEllipse(x, y, r * 0.5, r * 0.36);
        g.lineStyle(2, 0x4a1a7a, 1).strokeEllipse(x, y, r * 0.5, r * 0.36);
        g.fillStyle(0xe8566e, 1).fillCircle(x, y, r * 0.1);
      }
      return;
    }
    case 'silencer': {
      // дуги глушения по бокам, снаружи кольца: три светлые волны, гаснущие наружу
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const rad = r * (1.45 + k * 0.28);
          const from = side < 0 ? Math.PI * 0.72 : -Math.PI * 0.28;
          const to = side < 0 ? Math.PI * 1.28 : Math.PI * 0.28;
          g.lineStyle(5 - k * 1.2, 0xb48cff, 0.95 - k * 0.25).beginPath().arc(0, 0, rad, from, to).strokePath();
        }
      }
      return;
    }
    default:
      return;
  }
}
