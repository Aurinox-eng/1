import Phaser from 'phaser';
import { CONFIG } from '../config';
import { aimAngle, AIM_STEPS, bestBeamDirection, remainingNear, WORLD } from '../level';
import { artImage, bakeArt, setArt, squareBox, type ArtBox } from '../art';
import { COLORS } from '../theme';
import { computeStats, mutationOptions, unlockedTiers, type TowerKey, type TowerStats } from '../towerStats';
import type { Bacterium } from './Bacterium';

export type TowerId = TowerKey;

/** Как далеко от центра башни вылетает снаряд (длина ствола), пикселей. */
const MUZZLE: Record<TowerId, number> = { pill: 40, syrup: 36, fizz: 34, syringe: 56 };

/** Рамка рисунка ствола (ствол смотрит вправо; центр башни — 0,0). */
const BARREL_BOX: ArtBox = { x: -26, y: -24, w: 84, h: 48 };
/** Рамка основания и верхней части (втулка, кольцо и точки уровня под башней). */
const BASE_BOX = squareBox(38);
const TOP_BOX: ArtBox = { x: -46, y: -46, w: 92, h: 100 };
/** Рамка стрелок поворота луча. */
const TURN_BOX = squareBox(58);
/** Пунктир направления луча рисуется картинкой обычной плотности: он длинный (до края карты), а точки в нём простые. */
const AIM_DENSITY = 1;

/** Ствол башни (он повернут вправо; потом поворачивается на цель) — готовая картинка. */
function barrelImage(scene: Phaser.Scene, id: TowerId): Phaser.GameObjects.Image {
  return artImage(scene, bakeArt(scene, `tower-barrel-${id}`, BARREL_BOX, (g) => drawBarrel(g, id)), BARREL_BOX);
}

/** Рисует ствол башни командами Graphics (один раз, в картинку). */
function drawBarrel(g: Phaser.GameObjects.Graphics, id: TowerId): void {
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
  paintAimLine(g, length, alpha);
}

/** Точки пунктира направления луча (без очистки рисунка). */
function paintAimLine(g: Phaser.GameObjects.Graphics, length: number, alpha = 0.55): void {
  for (let d = 52; d < length; d += 26) {
    g.fillStyle(COLORS.needle, alpha * (1 - (d / length) * 0.7)).fillCircle(d, 0, 3.2);
  }
}

/** Пунктир направления луча длиной length — готовая картинка (одна на длину, округлённую до пикселя); начало картинки — центр башни. */
function aimLineImage(scene: Phaser.Scene, image: Phaser.GameObjects.Image | null, length: number): Phaser.GameObjects.Image {
  const len = Math.max(1, Math.round(length));
  const box: ArtBox = { x: 0, y: -4, w: len + 4, h: 8 };
  const key = bakeArt(scene, `tower-aim-${len}`, box, (g) => paintAimLine(g, len), AIM_DENSITY);
  if (!image) return artImage(scene, key, box, AIM_DENSITY);
  setArt(image, key, box, AIM_DENSITY);
  return image;
}

/** Две изогнутые стрелки по бокам башни с лучом: левая — «повернуть против часовой», правая — «по часовой» (тап по левой/правой половине башни). */
function turnArrowsImage(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return artImage(scene, bakeArt(scene, 'tower-turn', TURN_BOX, drawTurnArrows), TURN_BOX);
}

function drawTurnArrows(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(3.5, COLORS.needle, 0.85).fillStyle(COLORS.needle, 0.85);
  const radius = 46;
  // dir: 1 — стрелка по часовой стрелке (справа), -1 — против (слева); center — угол середины дуги, градусы
  for (const [dir, center] of [[1, 0], [-1, 180]] as const) {
    const from = ((center - 38 * dir) * Math.PI) / 180;
    const to = ((center + 38 * dir) * Math.PI) / 180;
    g.beginPath();
    g.arc(0, 0, radius, from, to, dir < 0);
    g.strokePath();
    // наконечник в конце дуги: по касательной в сторону движения
    const px = Math.cos(to) * radius;
    const py = Math.sin(to) * radius;
    const tx = -Math.sin(to) * dir;
    const ty = Math.cos(to) * dir;
    const nx = Math.cos(to);
    const ny = Math.sin(to);
    g.fillTriangle(px + tx * 9, py + ty * 9, px + nx * 6, py + ny * 6, px - nx * 6, py - ny * 6);
  }
}

/** Цвет кольца башни по уровню: 1 — обычное, дальше серебро, золото, фиолетовый. */
const LEVEL_COLORS = [COLORS.towerEdge, 0xdfe6f5, 0xffd84d, 0xc78bff];

/** Верхняя неподвижная часть башни уровня level — одна картинка: втулка над стволом и (с уровня 2) кольцо и точки уровня под башней. */
function topTexture(scene: Phaser.Scene, level: number): string {
  return bakeArt(scene, `tower-top-${level}`, TOP_BOX, (g) => {
    g.fillStyle(COLORS.background, 1).fillCircle(0, 0, 9);
    g.lineStyle(2, COLORS.towerEdge, 1).strokeCircle(0, 0, 9);
    if (level <= 1) return;
    const color = LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length) - 1];
    g.lineStyle(4, color, 0.95).strokeCircle(0, 0, 40);
    for (let i = 0; i < level; i++) {
      const dx = (i - (level - 1) / 2) * 13;
      g.fillStyle(color, 1).fillCircle(dx, 46, 5);
      g.lineStyle(1.5, 0x0b1020, 1).strokeCircle(dx, 46, 5);
    }
  });
}

/** Основание, ствол и верхняя часть башни в контейнере; ствол (контейнер) поворачивается на цель, верхнюю часть Tower меняет по уровню. */
function buildTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: TowerId): { barrel: Phaser.GameObjects.Container; top: Phaser.GameObjects.Image } {
  const baseKey = bakeArt(scene, 'tower-base', BASE_BOX, (g) => {
    g.fillStyle(COLORS.tower, 1).fillCircle(0, 0, 36);
    g.lineStyle(3, COLORS.towerEdge, 1).strokeCircle(0, 0, 36);
  });
  const base = artImage(scene, baseKey, BASE_BOX);
  const barrel = scene.add.container(0, 0, [barrelImage(scene, id)]);
  const top = artImage(scene, topTexture(scene, 1), TOP_BOX);
  parent.add([base, barrel, top]);
  return { barrel, top };
}

/** Рисует башню (основание и ствол) в контейнере; возвращает ствол — он поворачивается на цель. */
export function createTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: TowerId = 'pill'): Phaser.GameObjects.Container {
  return buildTowerArt(scene, parent, id).barrel;
}

/**
 * Башня: стоит в клетке и сама стреляет. Способ стрельбы задан в таблице `towers` (config.ts): `targeting` — как бьёт
 * (по радиусу, по площади, лужей на дорожку, лучом), `side` — куда смотрит (любых в радиусе, только «вперёд» или только «назад»).
 * Выбор цели здесь: из бактерий в радиусе и с нужной стороны берётся та, которой до организма ближе всего по дорожкам (мутация «Охотник» —
 * самая прочная). У луча цели нет: башня смотрит туда, куда её повернул игрок (тап по половине выбранной башни — шаг 45°), и стреляет, когда на линии кто-то есть.
 * Что делает сам выстрел (снаряд, взрыв, лужа, очередь луча), решает сцена. Спора может «заглушить» башню: она на несколько
 * секунд темнеет и не стреляет.
 *
 * Уровень (слияние) и мутации меняют числа: все они берутся из `stats` (см. `towerStats.ts`), а не из строки таблицы.
 */
export class Tower {
  /** Строка таблицы башен (числа уровня 1): цена, способ стрельбы. */
  readonly cfg: (typeof CONFIG.towers)[TowerId];
  /** Итоговые числа башни с учётом уровня и мутаций. */
  stats: TowerStats;
  /** Уровень башни (1…MAX_TOWER_LEVEL) и выбранные мутации по порядку порогов. */
  level = 1;
  picks: string[] = [];
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
  private aimLine: Phaser.GameObjects.Image | null = null;
  private aimLine2: Phaser.GameObjects.Image | null = null;
  /** Втулка, кольцо и точки уровня — одна картинка на уровень. */
  private readonly top: Phaser.GameObjects.Image;
  private readonly mergeTween: Phaser.Tweens.Tween;
  private readonly badgeTween: Phaser.Tweens.Tween;
  private readonly selectRing: Phaser.GameObjects.Graphics;
  private readonly mergeRing: Phaser.GameObjects.Arc;
  private readonly badge: Phaser.GameObjects.Container;
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
    this.stats = computeStats(id, 1, []);
    this.remaining = remainingNear(x, y);
    this.container = scene.add.container(x, y);
    if (this.isBeam) {
      // Сразу смотрит туда, где под лучом больше всего дорожки; игрок потом повернёт тапом
      this.aim = defaultAim(this.cfg, x, y);
      this.aimLine = aimLineImage(scene, null, 1);
      this.container.add(this.aimLine);
    }
    this.selectRing = scene.add.graphics().setVisible(false);
    this.container.add(this.selectRing);
    const art = buildTowerArt(scene, this.container, id);
    this.barrel = art.barrel;
    this.top = art.top;
    // Красное кольцо — башня заглушена
    this.ring = scene.add.circle(0, 0, 44).setStrokeStyle(5, COLORS.loseLine, 1).setFillStyle().setVisible(false);
    this.container.add(this.ring);
    // Зелёное мигающее кольцо — башню можно слить с выбранной
    this.mergeRing = scene.add.circle(0, 0, 49).setStrokeStyle(5, COLORS.merge, 1).setFillStyle().setVisible(false);
    this.container.add(this.mergeRing);
    // Мигание колец и «!» идёт, только пока они видны (иначе 40 башен крутили бы 80 невидимых анимаций каждый кадр)
    this.mergeTween = scene.tweens.add({ targets: this.mergeRing, alpha: { from: 1, to: 0.35 }, duration: 380, yoyo: true, repeat: -1, paused: true });
    // Золотой «!» — можно выбрать мутацию
    const badgeBg = scene.add.circle(0, 0, 13, COLORS.gold, 1).setStrokeStyle(3, COLORS.goldEdge, 1);
    const badgeText = scene.add.text(0, 0, '!', { fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#3a2a00' }).setOrigin(0.5);
    this.badge = scene.add.container(32, -34, [badgeBg, badgeText]).setVisible(false);
    this.container.add(this.badge);
    this.badgeTween = scene.tweens.add({ targets: this.badge, scale: { from: 0.85, to: 1.2 }, duration: 420, yoyo: true, repeat: -1, paused: true });
    if (this.aimLine) {
      // линия — под основанием башни; стрелки поворота (влево/вправо на 45°) — над ней
      this.container.sendToBack(this.aimLine);
      this.container.add(turnArrowsImage(scene));
      this.applyAim();
    }
    this.refreshVisuals();
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

  /** Какой порог мутации ждёт выбора (0 — первый, 1 — второй) или null, если выбирать нечего. */
  get pendingTier(): number | null {
    return this.picks.length < unlockedTiers(this.level) ? this.picks.length : null;
  }

  /** Слияние: башня становится уровнем выше (мутации остаются), пауза до выстрела не сбрасывается. */
  upgrade(): void {
    this.level++;
    this.recompute();
    this.scene.tweens.add({ targets: this.container, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  /** Выбрать мутацию на текущем пороге (index — 0 или 1 из двух вариантов). Возвращает false, если выбирать нечего. */
  pickMutation(index: number): boolean {
    const tier = this.pendingTier;
    if (tier === null) return false;
    const spec = mutationOptions(this.id, tier)[index];
    if (!spec) return false;
    this.picks.push(spec.id);
    this.recompute();
    this.scene.tweens.add({ targets: this.container, scale: { from: 1.2, to: 1 }, duration: 220, ease: 'Quad.easeOut' });
    return true;
  }

  private recompute(): void {
    this.stats = computeStats(this.id, this.level, this.picks);
    this.refreshVisuals();
    if (this.isBeam) this.applyAim();
  }

  /** Метки на башне: кольцо цвета уровня, точки уровня под башней, «!» при невыбранной мутации. */
  private refreshVisuals(): void {
    setArt(this.top, topTexture(this.scene, this.level), TOP_BOX);
    const badge = this.pendingTier !== null;
    this.badge.setVisible(badge);
    if (badge) this.badgeTween.resume();
    else this.badgeTween.pause();
    if (this.selectRing.visible) this.drawSelectRing();
  }

  private drawSelectRing(): void {
    this.selectRing.clear();
    // радиус стрельбы (у луча его нет — там пунктир направления)
    if (!this.isBeam) {
      this.selectRing.fillStyle(COLORS.ghost, 0.1).fillCircle(0, 0, this.stats.range);
      this.selectRing.lineStyle(2.5, COLORS.ghostEdge, 0.9).strokeCircle(0, 0, this.stats.range);
    }
    this.selectRing.lineStyle(5, COLORS.gold, 1).strokeCircle(0, 0, 46);
  }

  /** Башня выбрана игроком: золотое кольцо и (кроме луча) круг радиуса стрельбы. */
  setSelected(on: boolean): void {
    this.selectRing.setVisible(on);
    if (on) this.drawSelectRing();
  }

  /** Подсветка «с этой башней можно слить». */
  setMergeCandidate(on: boolean): void {
    this.mergeRing.setVisible(on);
    if (on) this.mergeTween.resume();
    else this.mergeTween.pause();
  }

  /** Повернуть луч на один шаг (45°): dir 1 — по часовой стрелке, -1 — против. Для башен без луча ничего не делает. */
  rotateAim(dir: 1 | -1 = 1): void {
    if (!this.isBeam) return;
    this.aim = (this.aim + dir + AIM_STEPS) % AIM_STEPS;
    this.applyAim();
    this.scene.tweens.add({ targets: this.container, scale: { from: 1.12, to: 1 }, duration: 140, ease: 'Quad.easeOut' });
  }

  private applyAim(): void {
    const angle = this.aimRad;
    this.barrel.setRotation(angle);
    if (this.aimLine) {
      this.aimLine = aimLineImage(this.scene, this.aimLine, beamReach(this.x, this.y, angle, this.stats.beamLengthPx));
      this.aimLine.setRotation(angle);
    }
    if (this.stats.secondBeam) {
      const angle2 = aimAngle(this.aim + 2);
      const fresh = !this.aimLine2;
      this.aimLine2 = aimLineImage(this.scene, this.aimLine2, beamReach(this.x, this.y, angle2, this.stats.beamLengthPx));
      if (fresh) {
        this.container.add(this.aimLine2);
        this.container.sendToBack(this.aimLine2);
      }
      this.aimLine2.setRotation(angle2);
    }
  }

  /** Направления лучей (номера): основной и, если есть мутация «Второй луч», второй — под 90° к первому. */
  beamDirections(): number[] {
    return this.stats.secondBeam ? [this.aim, (this.aim + 2) % AIM_STEPS] : [this.aim];
  }

  /** Кого сейчас задевает луч (оба луча, если их два): бактерии на линии от башни по направлению луча (до длины луча или края карты). */
  beamHits(bacteria: readonly Bacterium[]): Bacterium[] {
    const { beamLengthPx, beamHalfWidthPx } = this.stats;
    const lines = this.beamDirections().map((d) => {
      const angle = aimAngle(d);
      return { ux: Math.cos(angle), uy: Math.sin(angle) };
    });
    const hits: Bacterium[] = [];
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      const dx = b.x - this.x;
      const dy = b.y - this.y;
      for (const { ux, uy } of lines) {
        const along = dx * ux + dy * uy;
        if (along < 0 || along > beamLengthPx + b.radius) continue;
        if (Math.abs(-dx * uy + dy * ux) > beamHalfWidthPx + b.radius * 0.7) continue;
        hits.push(b);
        break;
      }
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
   * С мутацией «Двойной выстрел» башня бьёт ещё `extraTargets` целей за тот же выстрел.
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
      if (fire(hits[0], this.x + Math.cos(angle) * muzzle, this.y + Math.sin(angle) * muzzle)) this.cooldown = this.stats.cooldownMs / 1000;
      return;
    }
    const targets = this.pickTargets(bacteria);
    if (targets.length === 0) return;
    const angle = Math.atan2(targets[0].y - this.y, targets[0].x - this.x);
    this.barrel.setRotation(angle);
    if (this.cooldown > 0) return;
    const shoot = (target: Bacterium): boolean => {
      const a = Math.atan2(target.y - this.y, target.x - this.x);
      return fire(target, this.x + Math.cos(a) * muzzle, this.y + Math.sin(a) * muzzle);
    };
    if (!shoot(targets[0])) return;
    this.cooldown = this.stats.cooldownMs / 1000;
    for (let i = 1; i < targets.length; i++) shoot(targets[i]);
  }

  /** Бактерии, до которых можно достать (центр не дальше радиуса стрельбы плюс радиус самой бактерии, нужная сторона от башни), по приоритету; не больше 1 + extraTargets. */
  private pickTargets(bacteria: readonly Bacterium[]): Bacterium[] {
    const { range, side, toughest, extraTargets } = this.stats;
    const found: Bacterium[] = [];
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      if (Math.hypot(b.x - this.x, b.y - this.y) > range + b.radius) continue;
      if (side === 'forward' && !(b.remaining > this.remaining)) continue;
      if (side === 'back' && !(b.remaining < this.remaining)) continue;
      found.push(b);
    }
    // ближайшая к организму первой; «Охотник» — сначала самая прочная
    found.sort((a, b) => (toughest ? b.maxHp - a.maxHp || a.remaining - b.remaining : a.remaining - b.remaining));
    return found.slice(0, 1 + extraTargets);
  }

  destroy(): void {
    this.mergeTween.remove();
    this.badgeTween.remove();
    this.scene.tweens.killTweensOf([this.mergeRing, this.badge, this.container]);
    this.container.destroy();
  }
}
