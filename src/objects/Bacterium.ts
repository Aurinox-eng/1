import Phaser from 'phaser';
import { CONFIG } from '../config';
import { EDGES_FROM } from '../level';
import { pointAt, type Edge } from '../pathing';
import { COLORS } from '../theme';
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
 * Бактерия: идёт по дорожкам от входа к организму; на каждой развилке выбирает путь случайно. Тип задаётся таблицей `types`
 * в config.ts: кокк — без особенностей; палочка делает рывки; делящаяся при гибели распадается на кокков (это делает сцена);
 * бронированная толстая и медленная; спора быстрая и глушит башни (тоже сцена). HP видно на самой бактерии: оболочка
 * истончается и появляются трещины.
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
  /** Ребро, по которому идёт бактерия, и сколько пикселей она на нём прошла. */
  edge: Edge;
  s: number;
  /** Сколько пикселей прошла за всё время. */
  travel = 0;
  /** Идёт ли рывок (только у палочки). */
  dashing = false;
  /** Башни, которые эта бактерия уже заглушила (спора глушит каждую башню один раз). */
  readonly disabledTowers = new Set<unknown>();
  /** Радиус описанного круга, пикселей. */
  readonly radius: number;

  private readonly baseSpeed: number;
  /** Замедление от «Сиропа»: сколько секунд ещё действует и во сколько раз медленнее идёт (1 — не замедлена). */
  private slowLeft = 0;
  private slowBy = 1;
  private slowRing: Phaser.GameObjects.Arc | null = null;
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly seed = Math.random() * Math.PI * 2;
  /** Часы рывков: у каждой палочки свой сдвиг, чтобы рывки не шли в ногу. */
  private dashClock: number;

  /**
   * @param layer контейнер мира, в который кладётся бактерия
   * @param edge ребро, на котором бактерия появляется, и s — расстояние от его начала
   */
  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    kind: BacteriumKind,
    edge: Edge,
    s = 0,
  ) {
    this.scene = scene;
    this.kind = kind;
    const cfg = CONFIG.types[kind];
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.radius = extentOf(kind);
    const spread = 1 + (Math.random() * 2 - 1) * CONFIG.bacteria.speedSpread;
    this.baseSpeed = CONFIG.bacteria.baseSpeed * cfg.speedFactor * spread;
    this.dashClock = Math.random() * Math.max(1, cfg.dashEverySec);
    this.edge = edge;
    this.s = Math.max(0, Math.min(edge.length, s));

    this.gfx = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.gfx]);
    layer.add(this.container);
    this.place();
    this.redraw();
  }

  /** Сколько пикселей осталось до организма по самому короткому пути (чем меньше, тем бактерия опаснее). */
  get remaining(): number {
    return this.edge.length - this.s + this.edge.remainingAtEnd;
  }

  /** Идёт ли бактерия замедленной (попала под «Сироп»). */
  get slowed(): boolean {
    return this.slowLeft > 0;
  }

  /**
   * Замедлить: идёт в `factor` раз медленнее `seconds` секунд. Повторное попадание не усиливает замедление (берётся сильнейшее)
   * и продлевает время до `seconds`, но не суммируется.
   */
  slow(factor: number, seconds: number): void {
    if (factor >= 1 || seconds <= 0 || this.hp <= 0) return;
    this.slowBy = this.slowLeft > 0 ? Math.min(this.slowBy, factor) : factor;
    this.slowLeft = Math.max(this.slowLeft, seconds);
    if (!this.slowRing) {
      this.slowRing = this.scene.add.circle(0, 0, this.radius + 8).setStrokeStyle(4, COLORS.syrup, 0.9).setFillStyle();
      this.container.add(this.slowRing);
    }
    this.slowRing.setVisible(true);
  }

  update(dt: number): void {
    const cfg = CONFIG.types[this.kind];
    let factor = 1;
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) {
        this.slowLeft = 0;
        this.slowBy = 1;
        this.slowRing?.setVisible(false);
      } else {
        factor *= this.slowBy;
      }
    }
    if (cfg.dashEverySec > 0) {
      // Рывок — последние dashSec секунд каждого периода dashEverySec
      this.dashClock += dt;
      const dashing = this.dashClock % cfg.dashEverySec >= cfg.dashEverySec - cfg.dashSec;
      if (dashing !== this.dashing) {
        this.dashing = dashing;
        this.container.setScale(1, dashing ? 1.22 : 1);
      }
      if (dashing) factor *= cfg.dashFactor;
    }
    this.advance(this.baseSpeed * factor * dt);
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

  /** Сдвигает бактерию вперёд по дорожке на distance пикселей (через конец ребра и развилки тоже). */
  moveForward(distance: number): void {
    this.advance(distance);
  }

  /** Двигает вперёд на distance пикселей; в конце ребра выбирает следующее случайно (развилка). */
  private advance(distance: number): void {
    this.s += distance;
    this.travel += distance;
    while (this.s >= this.edge.length) {
      const next = EDGES_FROM[this.edge.to];
      if (!next || next.length === 0) {
        this.s = this.edge.length;
        break;
      }
      this.s -= this.edge.length;
      this.edge = next[Math.floor(Math.random() * next.length)];
    }
    this.place();
  }

  private place(): void {
    const p = pointAt(this.edge, this.s);
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
