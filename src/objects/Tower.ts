import Phaser from 'phaser';
import { CONFIG } from '../config';
import { aimAngle, AIM_STEPS, bestBeamDirection, remainingNear, WORLD } from '../level';
import { COLORS } from '../theme';
import type { Bacterium } from './Bacterium';

export type TowerId = keyof typeof CONFIG.towers;

/** Как далеко от центра башни вылетает снаряд (длина ствола), пикселей. */
const MUZZLE: Record<TowerId, number> = { pill: 40, syrup: 36, fizz: 34, syringe: 56 };

/** Рисует ствол башни (он повернут вправо; потом поворачивается на цель). */
function drawBarrel(scene: Phaser.Scene, id: TowerId): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  if (id === 'pill') {
    // Таблетка: белая капсула с голубой половиной
    g.fillStyle(COLORS.pill, 1).fillRoundedRect(-6, -13, 46, 26, 13);
    g.lineStyle(2, COLORS.pillEdge, 1).strokeRoundedRect(-6, -13, 46, 26, 13);
    g.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(17, -13, 23, 26, { tl: 0, bl: 0, tr: 13, br: 13 });
  } else if (id === 'syrup') {
    // Сироп: оранжевая бутылочка с тёмной горловиной
    g.fillStyle(COLORS.syrupDark, 1).fillRoundedRect(24, -9, 16, 18, 4);
    g.fillStyle(COLORS.syrup, 1).fillRoundedRect(-10, -16, 38, 32, 11);
    g.lineStyle(2, COLORS.syrupDark, 1).strokeRoundedRect(-10, -16, 38, 32, 11);
    g.fillStyle(0xffffff, 0.55).fillRoundedRect(-2, -10, 18, 5, 2);
  } else if (id === 'fizz') {
    // Шипучка: розовая круглая таблетка с пузырьками и тёмным жерлом
    g.fillStyle(COLORS.fizz, 1).fillCircle(10, 0, 20);
    g.lineStyle(3, COLORS.fizzDark, 1).strokeCircle(10, 0, 20);
    g.fillStyle(COLORS.fizzDark, 1).fillCircle(27, 0, 8);
    g.fillStyle(0xffffff, 0.85).fillCircle(4, -9, 4).fillCircle(10, 7, 3).fillCircle(-3, 3, 2.5);
  } else {
    // Шприц: светлый корпус с бирюзовой жидкостью, поршень сзади, игла спереди
    g.fillStyle(COLORS.syringe, 1).fillRoundedRect(-10, -9, 52, 18, 6);
    g.lineStyle(2, COLORS.syringeEdge, 1).strokeRoundedRect(-10, -9, 52, 18, 6);
    g.fillStyle(COLORS.needle, 1).fillRoundedRect(2, -5, 26, 10, 3);
    g.fillStyle(COLORS.syringeEdge, 1).fillRect(-18, -3, 9, 6).fillRoundedRect(-23, -11, 5, 22, 2);
    g.fillStyle(COLORS.syringe, 1).fillRect(42, -1.5, 10, 3);
  }
  return g;
}

/** Запас к полуширине луча при выборе лучшего направления: бактерии идут не ровно по оси луча, а по ширине дорожки, пикселей. */
const BEAM_COVER_MARGIN = 22;

/** Лучшее направление луча для башни с такой строкой таблицы в этой точке: номер 0…AIM_STEPS-1 (где под лучом больше всего дорожки). */
export function defaultAim(cfg: { beamLengthPx: number; beamHalfWidthPx: number }, x: number, y: number): number {
  return bestBeamDirection(x, y, cfg.beamLengthPx, cfg.beamHalfWidthPx + BEAM_COVER_MARGIN);
}

/** До какого расстояния от точки (x, y) в направлении angle тянется луч: не дальше длины луча и не дальше края карты, пикселей. */
export function beamReach(x: number, y: number, angle: number, length: number): number {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let reach = length;
  if (ux > 1e-6) reach = Math.min(reach, (WORLD.w - x) / ux);
  else if (ux < -1e-6) reach = Math.min(reach, (0 - x) / ux);
  if (uy > 1e-6) reach = Math.min(reach, (WORLD.h - y) / uy);
  else if (uy < -1e-6) reach = Math.min(reach, (0 - y) / uy);
  return Math.max(0, reach);
}

/** Рисует тонкую пунктирную линию «куда смотрит луч»: вправо от начала координат, длиной length; к концу бледнеет. */
export function drawAimLine(g: Phaser.GameObjects.Graphics, length: number, alpha = 0.55): void {
  g.clear();
  for (let d = 52; d < length; d += 26) {
    g.fillStyle(COLORS.needle, alpha * (1 - (d / length) * 0.7)).fillCircle(d, 0, 3.2);
  }
}

/** Рисует башню (основание и ствол) в контейнере; возвращает ствол — он поворачивается на цель. */
export function createTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: TowerId = 'pill'): Phaser.GameObjects.Container {
  const base = scene.add.graphics();
  base.fillStyle(COLORS.tower, 1).fillCircle(0, 0, 36);
  base.lineStyle(3, COLORS.towerEdge, 1).strokeCircle(0, 0, 36);

  const barrel = scene.add.container(0, 0, [drawBarrel(scene, id)]);

  const hub = scene.add.graphics();
  hub.fillStyle(COLORS.background, 1).fillCircle(0, 0, 9);
  hub.lineStyle(2, COLORS.towerEdge, 1).strokeCircle(0, 0, 9);

  parent.add([base, barrel, hub]);
  return barrel;
}

/**
 * Башня: стоит в клетке и сама стреляет. Способ стрельбы задан в таблице `towers` (config.ts): `targeting` — как бьёт
 * (по радиусу, по площади, лужей на дорожку, лучом), `side` — куда смотрит (любых в радиусе, только «вперёд» или только «назад»).
 * Выбор цели здесь: из бактерий в радиусе и с нужной стороны берётся та, которой до организма ближе всего по дорожкам.
 * У луча цели нет: башня смотрит туда, куда её повернул игрок (тап по башне — шаг 45°), и стреляет, когда на линии кто-то есть.
 * Что делает сам выстрел (снаряд, взрыв, лужа, очередь луча), решает сцена. Спора может «заглушить» башню: она на несколько
 * секунд темнеет и не стреляет.
 */
export class Tower {
  readonly cfg: (typeof CONFIG.towers)[TowerId];
  /** Расстояние от башни до организма по дорожкам (по ближайшей к ней точке сети), пикселей: по нему считается «вперёд/назад». */
  readonly remaining: number;
  /** Пауза до следующего выстрела, секунды игрового времени. */
  private cooldown = 0;
  /** Сколько секунд башня ещё заглушена (0 — работает). */
  private disabledFor = 0;
  /** Куда смотрит луч: номер направления 0…AIM_STEPS-1 (только у башен с лучом). */
  aim = 0;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly barrel: Phaser.GameObjects.Container;
  private readonly container: Phaser.GameObjects.Container;
  private readonly aimLine: Phaser.GameObjects.Graphics | null = null;
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    readonly id: TowerId,
    readonly col: number,
    readonly row: number,
    readonly x: number,
    readonly y: number,
  ) {
    this.scene = scene;
    this.cfg = CONFIG.towers[id];
    this.remaining = remainingNear(x, y);
    this.container = scene.add.container(x, y);
    if (this.isBeam) {
      // Сразу смотрит туда, где под лучом больше всего дорожки; игрок потом повернёт тапом
      this.aim = defaultAim(this.cfg, x, y);
      this.aimLine = scene.add.graphics();
      this.container.add(this.aimLine);
    }
    this.barrel = createTowerArt(scene, this.container, id);
    // Красное кольцо — башня заглушена
    this.ring = scene.add.circle(0, 0, 44).setStrokeStyle(5, COLORS.loseLine, 1).setFillStyle().setVisible(false);
    this.container.add(this.ring);
    if (this.aimLine) {
      // линия — под основанием башни
      this.container.sendToBack(this.aimLine);
      this.applyAim();
    }
    layer.add(this.container);
    // Появление: башня «вырастает» из клетки
    this.container.setScale(0.6);
    scene.tweens.add({ targets: this.container, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  /** Бьёт ли башня лучом (тогда её направление задаёт игрок). */
  get isBeam(): boolean {
    return this.cfg.targeting === 'beam';
  }

  /** Угол луча, радианы. */
  get aimRad(): number {
    return aimAngle(this.aim);
  }

  /** Повернуть луч на один шаг (45°) по часовой стрелке. Для башен без луча ничего не делает. */
  rotateAim(): void {
    if (!this.isBeam) return;
    this.aim = (this.aim + 1) % AIM_STEPS;
    this.applyAim();
    this.scene.tweens.add({ targets: this.container, scale: { from: 1.12, to: 1 }, duration: 140, ease: 'Quad.easeOut' });
  }

  private applyAim(): void {
    const angle = this.aimRad;
    this.barrel.setRotation(angle);
    if (this.aimLine) {
      drawAimLine(this.aimLine, beamReach(this.x, this.y, angle, this.cfg.beamLengthPx));
      this.aimLine.setRotation(angle);
    }
  }

  /** Кого сейчас задевает луч: бактерии на линии от башни по направлению луча (до длины луча или края карты). */
  beamHits(bacteria: readonly Bacterium[]): Bacterium[] {
    const { beamLengthPx, beamHalfWidthPx } = this.cfg;
    const angle = this.aimRad;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const hits: Bacterium[] = [];
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      const dx = b.x - this.x;
      const dy = b.y - this.y;
      const along = dx * ux + dy * uy;
      if (along < 0 || along > beamLengthPx + b.radius) continue;
      if (Math.abs(-dx * uy + dy * ux) > beamHalfWidthPx + b.radius * 0.7) continue;
      hits.push(b);
    }
    return hits;
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

  /**
   * Выбирает цель и стреляет, когда прошла пауза. `fire` делает сам выстрел и отвечает, состоялся ли он (лужу, например,
   * не бросают, если на этом месте уже есть лужа): пауза начинается только после состоявшегося выстрела.
   */
  update(dt: number, bacteria: readonly Bacterium[], fire: (target: Bacterium, muzzleX: number, muzzleY: number) => boolean): void {
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
    const muzzle = MUZZLE[this.id];
    if (this.isBeam) {
      // Луч: цель — любой на линии; башня смотрит туда, куда повернул игрок
      if (this.cooldown > 0) return;
      const hits = this.beamHits(bacteria);
      if (hits.length === 0) return;
      const angle = this.aimRad;
      if (fire(hits[0], this.x + Math.cos(angle) * muzzle, this.y + Math.sin(angle) * muzzle)) this.cooldown = this.cfg.cooldownMs / 1000;
      return;
    }
    const target = this.pickTarget(bacteria);
    if (!target) return;
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    this.barrel.setRotation(angle);
    if (this.cooldown > 0) return;
    if (fire(target, this.x + Math.cos(angle) * muzzle, this.y + Math.sin(angle) * muzzle)) this.cooldown = this.cfg.cooldownMs / 1000;
  }

  /** Бактерии, до которых можно достать: центр не дальше радиуса стрельбы плюс радиус самой бактерии и с нужной стороны от башни. */
  private pickTarget(bacteria: readonly Bacterium[]): Bacterium | null {
    const { range, side } = this.cfg;
    let best: Bacterium | null = null;
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      if (Math.hypot(b.x - this.x, b.y - this.y) > range + b.radius) continue;
      if (side === 'forward' && !(b.remaining > this.remaining)) continue;
      if (side === 'back' && !(b.remaining < this.remaining)) continue;
      if (!best || b.remaining < best.remaining) best = b;
    }
    return best;
  }

  destroy(): void {
    this.container.destroy();
  }
}
