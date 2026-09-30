import Phaser from 'phaser';
import { CONFIG } from '../config';
import { pointAt, type Route } from '../pathing';
import { drawBody, SPLITTER_LOBE_OFFSET } from './bacteriumArt';

export type BacteriumKind = keyof typeof CONFIG.types;

/** Радиус описанного круга типа (от центра до самой дальней точки). */
export function extentOf(kind: BacteriumKind): number {
  const { radius, length } = CONFIG.types[kind];
  if (kind === 'rod') return length / 2;
  if (kind === 'splitter') return radius * (1 + SPLITTER_LOBE_OFFSET);
  return radius;
}

/**
 * Бактерия: идёт по своему маршруту (кривой дорожке) от входа к организму с постоянной скоростью.
 * Тип задаётся таблицей `types` в config.ts. HP видно на самой бактерии: оболочка истончается и появляются трещины.
 * Особое поведение типов (палочка, делящаяся, спора…) — этап 2.
 */
export class Bacterium {
  private static nextId = 1;
  /** Уникальный номер (нужен проверкам: отличать одну бактерию от другой). */
  readonly id = Bacterium.nextId++;
  readonly kind: BacteriumKind;
  readonly maxHp: number;
  hp: number;
  x = 0;
  y = 0;
  /** Сколько пикселей уже прошла по маршруту. */
  s = 0;
  /** Скорость, пикселей в секунду. */
  readonly speed: number;
  /** Радиус описанного круга, пикселей. */
  readonly radius: number;

  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly seed = Math.random() * Math.PI * 2;

  /**
   * @param layer контейнер мира, в который кладётся бактерия
   * @param routeIndex номер маршрута в LEVEL.routes (нужен проверкам)
   */
  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    kind: BacteriumKind,
    private readonly route: Route,
    readonly routeIndex: number,
  ) {
    this.kind = kind;
    const cfg = CONFIG.types[kind];
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.radius = extentOf(kind);
    const spread = 1 + (Math.random() * 2 - 1) * CONFIG.bacteria.speedSpread;
    this.speed = CONFIG.bacteria.baseSpeed * cfg.speedFactor * spread;

    this.gfx = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.gfx]);
    layer.add(this.container);
    this.moveTo(0);
    this.redraw();
  }

  update(dt: number): void {
    this.moveTo(this.s + this.speed * dt);
  }

  /** Попадание. Возвращает true, если бактерия уничтожена. */
  hit(damage: number): boolean {
    this.hp = Math.max(0, this.hp - damage);
    this.redraw();
    return this.hp <= 0;
  }

  get lifeDamage(): number {
    return CONFIG.types[this.kind].lifeDamage;
  }

  get reward(): number {
    return CONFIG.types[this.kind].reward;
  }

  /** Передний край бактерии дошёл до красной линии организма. */
  get reachedOrganism(): boolean {
    return this.x - this.radius <= CONFIG.map.orgW;
  }

  destroy(): void {
    this.container.destroy();
  }

  private moveTo(s: number): void {
    this.s = s;
    const p = pointAt(this.route, s);
    this.x = p.x;
    this.y = p.y;
    this.container.setPosition(p.x, p.y);
    // Палочка вытянута вдоль движения
    if (this.kind === 'rod') this.container.setRotation(p.angle + Math.PI / 2);
  }

  private redraw(): void {
    drawBody(this.gfx, this.kind, { hp: this.hp, maxHp: this.maxHp, spread: 0, seed: this.seed });
  }
}
