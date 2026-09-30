import Phaser from 'phaser';
import { CONFIG } from '../config';
import { COLORS } from '../theme';
import type { Bacterium } from './Bacterium';

export type TowerId = keyof typeof CONFIG.towers;

/** Рисует башню (основание и ствол-таблетку) в контейнере; возвращает ствол — он поворачивается на цель. */
export function createTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): Phaser.GameObjects.Container {
  const base = scene.add.graphics();
  base.fillStyle(COLORS.tower, 1).fillCircle(0, 0, 36);
  base.lineStyle(3, COLORS.towerEdge, 1).strokeCircle(0, 0, 36);

  // Ствол: белая капсула с голубой половиной
  const barrelGfx = scene.add.graphics();
  barrelGfx.fillStyle(COLORS.pill, 1).fillRoundedRect(-6, -13, 46, 26, 13);
  barrelGfx.lineStyle(2, COLORS.pillEdge, 1).strokeRoundedRect(-6, -13, 46, 26, 13);
  barrelGfx.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(17, -13, 23, 26, { tl: 0, bl: 0, tr: 13, br: 13 });
  const barrel = scene.add.container(0, 0, [barrelGfx]);

  const hub = scene.add.graphics();
  hub.fillStyle(COLORS.background, 1).fillCircle(0, 0, 9);
  hub.lineStyle(2, COLORS.towerEdge, 1).strokeCircle(0, 0, 9);

  parent.add([base, barrel, hub]);
  return barrel;
}

/**
 * Башня: стоит в клетке и сама стреляет. Способ стрельбы задан в таблице `towers` (config.ts, `targeting`).
 * Сейчас есть только «по радиусу»: из бактерий в радиусе выбирается та, которой до организма ближе всего по дорожкам.
 * Остальные способы — этап 3. Спора может «заглушить» башню: она на несколько секунд темнеет и не стреляет.
 */
export class Tower {
  readonly cfg: (typeof CONFIG.towers)[TowerId];
  /** Пауза до следующего выстрела, секунды игрового времени. */
  private cooldown = 0;
  /** Сколько секунд башня ещё заглушена (0 — работает). */
  private disabledFor = 0;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly barrel: Phaser.GameObjects.Container;
  private readonly container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly id: TowerId,
    readonly col: number,
    readonly row: number,
    readonly x: number,
    readonly y: number,
  ) {
    this.cfg = CONFIG.towers[id];
    this.container = scene.add.container(x, y);
    this.barrel = createTowerArt(scene, this.container);
    // Красное кольцо — башня заглушена
    this.ring = scene.add.circle(0, 0, 44).setStrokeStyle(5, COLORS.loseLine, 1).setFillStyle().setVisible(false);
    this.container.add(this.ring);
    layer.add(this.container);
    // Появление: башня «вырастает» из клетки
    this.container.setScale(0.6);
    scene.tweens.add({ targets: this.container, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  get isDisabled(): boolean {
    return this.disabledFor > 0;
  }

  /** Заглушить башню на seconds секунд (если уже заглушена дольше — не сокращаем). */
  disable(seconds: number): void {
    this.disabledFor = Math.max(this.disabledFor, seconds);
    this.container.setAlpha(0.4);
    this.ring.setVisible(true);
  }

  /** Выбирает цель и стреляет, когда прошла пауза. `fire` создаёт снаряд. */
  update(dt: number, bacteria: readonly Bacterium[], fire: (target: Bacterium, muzzleX: number, muzzleY: number) => void): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.disabledFor > 0) {
      this.disabledFor -= dt;
      if (this.disabledFor <= 0) {
        this.disabledFor = 0;
        this.container.setAlpha(1);
        this.ring.setVisible(false);
      }
      return;
    }
    const target = this.pickTarget(bacteria);
    if (!target) return;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.barrel.setRotation(angle);
    if (this.cooldown > 0) return;
    this.cooldown = this.cfg.cooldownMs / 1000;
    fire(target, this.x + Math.cos(angle) * 40, this.y + Math.sin(angle) * 40);
  }

  /** Бактерии, до которых можно достать: центр не дальше радиуса стрельбы плюс радиус самой бактерии. */
  private pickTarget(bacteria: readonly Bacterium[]): Bacterium | null {
    let best: Bacterium | null = null;
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      if (Math.hypot(b.x - this.x, b.y - this.y) > this.cfg.range + b.radius) continue;
      if (!best || b.remaining < best.remaining) best = b;
    }
    return best;
  }

  destroy(): void {
    this.container.destroy();
  }
}
