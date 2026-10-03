import Phaser from 'phaser';
import { CONFIG } from '../config';
import { EDGES_FROM } from '../level';
import { pointAt, type Edge } from '../pathing';
import { COLORS } from '../theme';
import { artImage, bakeArt, discImage, ringImage, setArt, squareBox, type ArtBox } from '../art';
import { bodyHalfSize, crackCount, drawCracks, drawShape, hasRadialCracks, shellWidth, SPLITTER_LOBE_OFFSET } from './bacteriumArt';

export type BacteriumKind = keyof typeof CONFIG.types;

/** Рамка рисунка тела типа (и трещин у некруглых типов). */
function bodyBox(kind: BacteriumKind): ArtBox {
  const { hx, hy } = bodyHalfSize(kind);
  return { x: -hx, y: -hy, w: hx * 2, h: hy * 2 };
}

/** Толщина оболочки округляется до целого пикселя: столько разных картинок тела у типа (разница в долю пикселя не видна). */
const SHELL_STEP_PX = 1;
/** Полное HP в ключе картинки трещин округляется до четверти (от него зависит, где идут трещины у палочки и шаг между трещинами у круглых). */
const MAXHP_STEP = 0.25;

/** Картинка тела типа с оболочкой толщины sw (рисуется один раз на тип и толщину). */
function bodyTexture(scene: Phaser.Scene, kind: BacteriumKind, sw: number): string {
  const q = Math.round(sw / SHELL_STEP_PX) * SHELL_STEP_PX;
  return bakeArt(scene, `bact-${kind}-${q}`, bodyBox(kind), (g) => drawShape(g, kind, q));
}

/** Картинка трещин: у круглых типов — от угла 0 (картинка поворачивается на свой угол у каждой бактерии), у остальных — на месте. */
function cracksTexture(scene: Phaser.Scene, kind: BacteriumKind, damage: number, maxHp: number): { key: string; box: ArtBox } {
  const radial = hasRadialCracks(kind);
  const hp = radial ? Math.max(3, Math.min(9, maxHp)) : kind === 'rod' ? maxHp : 0;
  const q = Math.round(hp / MAXHP_STEP) * MAXHP_STEP;
  const box = radial ? squareBox(CONFIG.types[kind].radius + 4) : bodyBox(kind);
  return { key: bakeArt(scene, `crack-${kind}-${damage}-${q}`, box, (g) => drawCracks(g, kind, damage, q, 0)), box };
}

/** Радиус описанного круга типа (от центра до самой дальней точки). */
export function extentOf(kind: BacteriumKind): number {
  const { radius, length } = CONFIG.types[kind];
  if (kind === 'rod' || kind === 'runner') return length / 2;
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
  /** Ускорение от командира рядом (1 — нет); сцена выставляет его каждый кадр. */
  haste = 1;
  /** Сколько секунд прошло с последнего рождения (у матки). */
  brewClock = 0;

  private readonly baseSpeed: number;
  /** Замедление от «Сиропа»: сколько секунд ещё действует и во сколько раз медленнее идёт (1 — не замедлена). */
  private slowLeft = 0;
  private slowBy = 1;
  private slowRing: Phaser.GameObjects.Image | null = null;
  /** «Кислота» Шипучки: сколько секунд ещё действует и во сколько раз сильнее удары по этой бактерии. */
  private acidLeft = 0;
  private acidBy = 1;
  private acidRing: Phaser.GameObjects.Image | null = null;
  /** Какое HP показано на теле (перерисовываем при заметном изменении: лечение идёт каждый кадр). */
  private drawnHp: number;
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  /** Тело и трещины — готовые картинки (см. art.ts); показанные ключи, чтобы не менять картинку без нужды. */
  private readonly body: Phaser.GameObjects.Image;
  private readonly cracks: Phaser.GameObjects.Image;
  private bodyKey = '';
  private cracksKey = '';
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
    /** Множитель прочности (рост от волны к волне, `waves.hpGrowthPerWave`). */
    hpMul = 1,
  ) {
    this.scene = scene;
    this.kind = kind;
    const cfg = CONFIG.types[kind];
    this.maxHp = cfg.hp * hpMul;
    this.hp = this.maxHp;
    this.radius = extentOf(kind);
    const spread = 1 + (Math.random() * 2 - 1) * CONFIG.bacteria.speedSpread;
    this.baseSpeed = CONFIG.bacteria.baseSpeed * cfg.speedFactor * spread;
    this.dashClock = Math.random() * Math.max(1, cfg.dashEverySec);
    this.edge = edge;
    this.s = Math.max(0, Math.min(edge.length, s));

    const box = bodyBox(kind);
    this.body = artImage(scene, bodyTexture(scene, kind, shellWidth(kind, this.hp)), box);
    this.cracks = artImage(scene, bodyTexture(scene, kind, shellWidth(kind, this.hp)), box).setVisible(false);
    // Круглые типы: трещины повёрнуты на свой угол у каждой бактерии (как раньше: от угла seed)
    if (hasRadialCracks(kind)) this.cracks.setRotation(this.seed);
    this.container = scene.add.container(0, 0, [this.body, this.cracks]);
    // Лекарь: кольцо-аура радиуса лечения, командир — радиуса ускорения (под телом)
    if (cfg.healRadius > 0) {
      const aura = discImage(scene, cfg.healRadius, COLORS.aura, 0.07, COLORS.aura, 3, 0.38);
      this.container.addAt(aura, 0);
    }
    if (cfg.hasteRadius > 0) {
      const aura = discImage(scene, cfg.hasteRadius, COLORS.haste, 0.06, COLORS.haste, 3, 0.42);
      this.container.addAt(aura, 0);
    }
    layer.add(this.container);
    this.drawnHp = this.hp;
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
    if (factor >= 1 || seconds <= 0 || this.hp <= 0 || CONFIG.types[this.kind].slowImmune > 0) return;
    this.slowBy = this.slowLeft > 0 ? Math.min(this.slowBy, factor) : factor;
    this.slowLeft = Math.max(this.slowLeft, seconds);
    if (!this.slowRing) {
      this.slowRing = ringImage(this.scene, 0, 0, this.radius + 8, 4, COLORS.slowRing, 0.9);
      this.container.add(this.slowRing);
    }
    this.slowRing.setVisible(true);
  }

  /** Кислота: следующие `seconds` секунд любой удар по бактерии в `mul` раз сильнее (берётся сильнейшая, время продлевается). */
  expose(mul: number, seconds: number): void {
    if (mul <= 1 || seconds <= 0 || this.hp <= 0) return;
    this.acidBy = this.acidLeft > 0 ? Math.max(this.acidBy, mul) : mul;
    this.acidLeft = Math.max(this.acidLeft, seconds);
    if (!this.acidRing) {
      this.acidRing = ringImage(this.scene, 0, 0, this.radius + 4, 3, COLORS.acid, 0.9);
      this.container.add(this.acidRing);
    }
    this.acidRing.setVisible(true);
  }

  update(dt: number): void {
    const cfg = CONFIG.types[this.kind];
    let factor = 1;
    if (this.acidLeft > 0) {
      this.acidLeft -= dt;
      if (this.acidLeft <= 0) {
        this.acidLeft = 0;
        this.acidBy = 1;
        this.acidRing?.setVisible(false);
      }
    }
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
    if (cfg.regenPerSec > 0) this.heal(cfg.regenPerSec * dt);
    this.advance(this.baseSpeed * factor * this.haste * dt);
  }

  /**
   * Попадание. Броня вычитается из удара (но не меньше доли `combat.armorMinShare`); `pierce` — удар игнорирует броню (мутации).
   * Под кислотой удар сильнее. Возвращает true, если бактерия уничтожена.
   */
  hit(damage: number, pierce = false): boolean {
    const { armor } = CONFIG.types[this.kind];
    const raw = damage * (this.acidLeft > 0 ? this.acidBy : 1);
    const dealt = armor > 0 && !pierce ? Math.max(raw * CONFIG.combat.armorMinShare, raw - armor) : raw;
    this.hp = Math.max(0, this.hp - dealt);
    this.redraw();
    return this.hp <= 0;
  }

  /** Постепенный урон (яд лужи): броню и кислоту не учитывает; тело перерисовывается, когда HP изменилось заметно. Возвращает true, если бактерия погибла. */
  drain(amount: number): boolean {
    if (this.hp <= 0) return true;
    this.hp = Math.max(0, this.hp - amount);
    if (Math.abs(this.hp - this.drawnHp) >= 0.5 || this.hp <= 0) this.redraw();
    return this.hp <= 0;
  }

  /** Лечение (от лекаря рядом): не выше полного HP; тело перерисовывается, когда HP изменилось заметно. */
  heal(amount: number): void {
    if (this.hp <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (Math.abs(this.hp - this.drawnHp) >= 0.5 || this.hp >= this.maxHp) this.redraw();
  }

  /** Точка дорожки впереди на distance пикселей, но не дальше конца текущего ребра (развилку не пересекаем: дальше путь случаен). */
  pointAhead(distance: number): { x: number; y: number } {
    const p = pointAt(this.edge, Math.min(this.edge.length, this.s + Math.max(0, distance)));
    return { x: p.x, y: p.y };
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
    if (this.kind === 'rod' || this.kind === 'runner') this.container.setRotation(p.angle + Math.PI / 2);
  }

  private redraw(): void {
    this.drawnHp = this.hp;
    const bodyKey = bodyTexture(this.scene, this.kind, shellWidth(this.kind, this.hp));
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      setArt(this.body, bodyKey, bodyBox(this.kind));
    }
    const damage = crackCount(this.hp, this.maxHp);
    if (damage === 0) {
      this.cracks.setVisible(false);
      return;
    }
    const { key, box } = cracksTexture(this.scene, this.kind, damage, this.maxHp);
    if (key !== this.cracksKey) {
      this.cracksKey = key;
      setArt(this.cracks, key, box);
    }
    this.cracks.setVisible(true);
  }
}
