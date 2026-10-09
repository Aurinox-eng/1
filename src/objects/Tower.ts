import Phaser from 'phaser';
import { CONFIG } from '../config';
import { aimAngle, AIM_STEPS, bestBeamDirection, remainingNear, WORLD } from '../level';
import {
  artImage, bakeArt, glowCircle, glowRing, glowRR, ringImage, setArt, shArc, shBox, shCirc, shEll, shLine, shPath, shPoly, shQuad, shRot, shRR, shStar, squareBox,
  type ArtBox, type Pt,
} from '../art';
import { COLORS, TOWER_ART } from '../theme';
import { computeStats, mutationOptions, unlockedTiers, type TowerKey, type TowerStats } from '../towerStats';
import type { Bacterium } from './Bacterium';

export type TowerId = TowerKey;

/** Как далеко от центра башни вылетает снаряд (длина ствола), пикселей. */
const MUZZLE: Record<TowerId, number> = { pill: 40, syrup: 36, fizz: 34, syringe: 56, ampule: 54, antibiotic: 44 };
/** На сколько пикселей дальше дуло с каждым следующим уровнем (стволы 2–4 уровней длиннее: снаряд вылетает из конца ствола). */
const MUZZLE_PER_LEVEL: Record<TowerId, number> = { pill: 7, syrup: 8, fizz: 6, syringe: 9, ampule: 8, antibiotic: 6 };

/** Рамка рисунка ствола (ствол смотрит вправо; центр башни — 0,0): вмещает самые длинные и широкие стволы уровней 2–4 со свечением. */
const BARREL_BOX: ArtBox = { x: -50, y: -50, w: 148, h: 100 };
/** Рамка основания (с шипами и лужами уровня 4). */
const BASE_BOX = squareBox(50);
/** Рамка верхней части (втулка, кольцо со свечением и точки уровня под башней). */
const TOP_BOX: ArtBox = { x: -54, y: -54, w: 108, h: 118 };
/** Рамка стрелок поворота луча. */
const TURN_BOX = squareBox(58);
/** Пунктир направления луча рисуется картинкой обычной плотности: он длинный (до края карты), а точки в нём простые. */
const AIM_DENSITY = 1;

const A = TOWER_ART;

/** Ограничение уровня рисунка: у башни 4 вида рисунков (уровни слияния 1–4). */
function artLevel(level: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(4, Math.round(level))) as 1 | 2 | 3 | 4;
}

/** Ствол башни уровня level (он повернут вправо; потом поворачивается на цель) — готовая картинка. */
function barrelImage(scene: Phaser.Scene, id: TowerId, level: number): Phaser.GameObjects.Image {
  return artImage(scene, barrelTexture(scene, id, level), BARREL_BOX);
}

function barrelTexture(scene: Phaser.Scene, id: TowerId, level: number): string {
  const lv = artLevel(level);
  return bakeArt(scene, `tower-barrel-${id}-${lv}`, BARREL_BOX, (g) => drawBarrel(g, id, lv));
}

/** Рисует ствол башни командами Graphics (один раз, в картинку). */
function drawBarrel(g: Phaser.GameObjects.Graphics, id: TowerId, lv: number): void {
  if (id === 'pill') drawPill(g, lv);
  else if (id === 'syrup') drawSyrup(g, lv);
  else if (id === 'fizz') drawFizz(g, lv);
  else if (id === 'ampule') drawAmpule(g, lv);
  else if (id === 'antibiotic') drawAntibiotic(g, lv);
  else drawSyringe(g, lv);
}

type Gfx = Phaser.GameObjects.Graphics;

/** Капсула таблетки: белая, с цветной половиной от позиции split и бликом. */
function capsule(g: Gfx, x: number, y: number, w: number, h: number, split: number, blue: number = COLORS.pillBlue, edge: number = COLORS.pillEdge): void {
  shRR(g, x, y, w, h, h / 2, COLORS.pill);
  g.fillStyle(blue, 1).fillRoundedRect(split, y, x + w - split, h, { tl: 0, bl: 0, tr: h / 2, br: h / 2 });
  shRR(g, x, y, w, h, h / 2, null, edge, 2);
  shRR(g, x + h * 0.4, y + 3, Math.max(6, split - x - h * 0.8), 3.5, 2, 0xffffff, null, 0, 0.6);
}

function drawPill(g: Gfx, lv: number): void {
  if (lv <= 1) {
    // Таблетка: белая капсула с голубой половиной
    g.fillStyle(COLORS.pill, 1).fillRoundedRect(-6, -13, 46, 26, 13);
    g.lineStyle(2, COLORS.pillEdge, 1).strokeRoundedRect(-6, -13, 46, 26, 13);
    g.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(17, -13, 23, 26, { tl: 0, bl: 0, tr: 13, br: 13 });
    return;
  }
  if (lv === 2) {
    // спаренные стволы на скобе
    shRR(g, -17, -21, 14, 42, 5, A.bracket, COLORS.towerEdge, 2);
    capsule(g, -4, -21, 46, 18, 20);
    capsule(g, -4, 3, 46, 18, 20);
    shRR(g, 8, -24, 8, 48, 3, COLORS.pillEdge, A.rivet, 1.5);
    return;
  }
  if (lv === 3) {
    // три ствола, стабилизаторы, пояса
    for (const s of [-1, 1]) shPoly(g, [[-2, s * 20], [-22, s * 31], [-12, s * 12]], COLORS.pillBlue, A.pillSeam, 2);
    shRR(g, -19, -25, 14, 50, 5, A.bracket, COLORS.towerEdge, 2);
    capsule(g, -4, -9, 56, 18, 26);
    capsule(g, -2, -25, 42, 14, 18);
    capsule(g, -2, 11, 42, 14, 18);
    for (const x of [8, 22]) shRR(g, x, -27, 6, 54, 2, COLORS.pillEdge, A.rivet, 1.5);
    shRR(g, 44, -9, 4, 18, 2, A.skyBlue);
    return;
  }
  // уровень 4: бронепластины, три ствола, светящееся ядро и вспышка
  for (const s of [-1, 1]) shPoly(g, [[-2, s * 20], [-24, s * 36], [-20, s * 24], [-34, s * 30], [-12, s * 12]], A.plate, COLORS.goldEdge, 2);
  shRR(g, -21, -28, 16, 56, 6, A.steelDark, COLORS.gold, 2);
  capsule(g, -2, -29, 46, 15, 20, COLORS.pillBlue, COLORS.goldEdge);
  capsule(g, -2, 14, 46, 15, 20, COLORS.pillBlue, COLORS.goldEdge);
  glowRR(g, -8, -12, 66, 24, 12, COLORS.needle, 10, 0.4);
  capsule(g, -8, -12, 66, 24, 32, COLORS.pillBlue, COLORS.goldEdge);
  glowRR(g, 34, -5, 20, 10, 5, COLORS.needle, 12, 0.5);
  shRR(g, 34, -5, 20, 10, 5, COLORS.needle);
  for (const x of [4, 17, 30]) {
    shRR(g, x, -15, 7, 30, 3, A.plateLight, COLORS.goldEdge, 2);
    shRR(g, x + 2, -11, 3, 22, 1, COLORS.gold);
  }
  // дульная вспышка
  shCirc(g, 64, 0, 17, COLORS.needle, null, 0, 0.12);
  shCirc(g, 64, 0, 14, COLORS.needle, null, 0, 0.2);
  shCirc(g, 64, 0, 10, COLORS.needle, null, 0, 0.3);
  shCirc(g, 64, 0, 6, 0xffffff, null, 0, 0.7);
  shStar(g, 64, 0, 11, 0xffffff);
  for (const s of [-1, 1]) shCirc(g, 43, s * 21.5, 4, COLORS.needle);
}

/** Капля по точке p0 с «пузом» к c1 и обратно (контур, а не заливка по формуле). */
function dropPts(p0: Pt, c1: Pt, p1: Pt, c2: Pt): Pt[] {
  return [p0, ...shQuad(p0, c1, p1), ...shQuad(p1, c2, p0)];
}

function drawSyrup(g: Gfx, lv: number): void {
  const dark = COLORS.syrupDark;
  const brown = A.syrupBrown;
  if (lv <= 1) {
    // Сироп: оранжевая бутылочка с тёмной горловиной
    g.fillStyle(COLORS.syrupDark, 1).fillRoundedRect(24, -9, 16, 18, 4);
    g.fillStyle(COLORS.syrup, 1).fillRoundedRect(-10, -16, 38, 32, 11);
    g.lineStyle(2, COLORS.syrupDark, 1).strokeRoundedRect(-10, -16, 38, 32, 11);
    g.fillStyle(0xffffff, 0.55).fillRoundedRect(-2, -10, 18, 5, 2);
    return;
  }
  if (lv === 2) {
    // шире, этикетка, воронка и капля
    shPoly(g, [[30, -9], [44, -9], [52, -16], [52, 16], [44, 9], [30, 9]], dark, brown, 1.5);
    shRR(g, 49, -17, 5, 34, 2, A.syrupLight, dark, 1.5);
    shRR(g, -13, -19, 44, 38, 13, COLORS.syrup);
    g.fillStyle(A.label, 1).fillRect(4, -19, 14, 38);
    shRR(g, -13, -19, 44, 38, 13, null, dark, 2);
    shPoly(g, dropPts([11, -8], [17, 0], [11, 5], [5, 0]), COLORS.syrup, dark, 1.2);
    shRR(g, -8, -13, 10, 3.5, 2, 0xffffff, null, 0, 0.6);
    shPoly(g, dropPts([58, 2], [64, 12], [58, 15], [52, 12]), COLORS.syrup, dark, 1.5);
    return;
  }
  if (lv === 3) {
    // бак с манометром, ремни, брызги веером
    shRR(g, -30, -24, 22, 48, 7, dark, brown, 2);
    for (const y of [-12, 0, 12]) shLine(g, -30, y, -8, y, A.syrupLight, 2.5);
    shCirc(g, -19, 0, 6.5, A.label, brown, 1.5);
    shLine(g, -19, 0, -15, -3.5, A.gaugeRed, 1.8);
    shRR(g, -10, -4, 14, 8, 2, dark, brown, 1.5);
    shPoly(g, [[34, -10], [46, -10], [56, -17], [56, 17], [46, 10], [34, 10]], dark, brown, 1.5);
    shRR(g, -6, -18, 40, 36, 12, COLORS.syrup, dark, 2);
    for (const x of [10, 22]) shRR(g, x, -19.5, 5, 39, 2, dark);
    shRR(g, -1, -9, 8, 18, 3, A.label, dark, 1.2);
    shRR(g, 0, -13, 8, 3.5, 2, 0xffffff, null, 0, 0.6);
    shRR(g, 52, -18, 5, 36, 2, A.syrupLight, dark, 1.5);
    for (const [x, y, r] of [[63, -10, 3], [66, 0, 3.4], [63, 10, 3]]) shCirc(g, x, y, r, COLORS.syrup, dark, 1.2);
    return;
  }
  // уровень 4: круглая колба с пузырями, золотые баки, три сопла
  for (const s of [-1, 1]) {
    const y = s > 0 ? 4 : -28;
    glowRR(g, -34, y, 26, 24, 7, A.glowOrange, 12, 0.45);
    shRR(g, -34, y, 26, 24, 7, A.tankGold, COLORS.gold, 2);
    shLine(g, -34, y + 8, -8, y + 8, COLORS.gold, 2);
    shLine(g, -34, y + 16, -8, y + 16, COLORS.gold, 2);
  }
  shRR(g, -8, -4, 14, 8, 2, dark, COLORS.gold, 1.5);
  // три сопла веером
  for (const deg of [-30, 0, 30]) {
    const a = (deg * Math.PI) / 180;
    shPoly(g, shRot(shBox(0, -4.5, 24, 9), 26, 0, a), dark, brown, 1.5);
    shPoly(g, shRot(shBox(20, -6, 6, 12), 26, 0, a), COLORS.gold, COLORS.goldEdge, 1.5);
    const [cx, cy] = shRot([[33, 0]], 26, 0, a)[0];
    shCirc(g, cx, cy, 3, A.syrupSoft, dark, 1);
  }
  glowCircle(g, 6, 0, 22, A.glowOrange, 12, 0.5);
  shCirc(g, 6, 0, 22, COLORS.syrup, dark, 3);
  // жидкость с волной (полосками, обрезанными по кругу колбы)
  const wave = (x: number): number => {
    const t = x < 6 ? (x + 20) / 26 : (x - 6) / 24;
    const u = 1 - t;
    return x < 6 ? 2 * u * u - 12 * t * u + 2 * t * t : 2 * u * u + 20 * t * u + 2 * t * t;
  };
  g.fillStyle(A.syrupSoft, 1);
  for (let x = -14; x < 26; x += 1) {
    const dy = Math.sqrt(Math.max(0, 20 * 20 - (x + 0.5 - 6) ** 2));
    const top = Math.max(wave(x), -dy);
    if (top < dy) g.fillRect(x, top, 1.3, dy - top);
  }
  for (const [x, y, r] of [[-4, 9, 3], [8, 12, 2.4], [14, 6, 3.2], [2, 15, 1.8]]) shCirc(g, x, y, r, 0xffffff, null, 0, 0.75);
  shArc(g, 6, 0, 22, Math.PI * 1.08, Math.PI * 1.55, 0xffffff, 3.5, 0.7);
  shArc(g, 6, 0, 22, -0.5, 0.5, COLORS.gold, 3);
  // пробка и пар сзади-сверху
  shRR(g, -4, -28, 14, 7, 3, COLORS.gold, COLORS.goldEdge, 1.5);
  for (const [x, y, r] of [[-8, -34, 3.5], [2, -38, 2.6]]) shCirc(g, x, y, r, 0xffffff, null, 0, 0.45);
}

function drawFizz(g: Gfx, lv: number): void {
  const pink = COLORS.fizz;
  const dk = COLORS.fizzDark;
  const bubbles = (list: readonly (readonly [number, number, number])[]): void => {
    for (const [x, y, r] of list) shCirc(g, x, y, r, 0xffffff, null, 0, 0.88);
  };
  if (lv <= 1) {
    // Шипучка: розовая круглая таблетка с пузырьками и тёмным жерлом
    g.fillStyle(COLORS.fizz, 1).fillCircle(10, 0, 20);
    g.lineStyle(3, COLORS.fizzDark, 1).strokeCircle(10, 0, 20);
    g.fillStyle(COLORS.fizzDark, 1).fillCircle(27, 0, 8);
    g.fillStyle(0xffffff, 0.85).fillCircle(4, -9, 4).fillCircle(10, 7, 3).fillCircle(-3, 3, 2.5);
    return;
  }
  if (lv === 2) {
    // раструб и бороздка
    shPoly(g, [[20, -10], [40, -18], [40, 18], [20, 10]], dk, A.fizzBrown, 1.5);
    shCirc(g, 4, 0, 21, pink, dk, 3);
    shLine(g, 4, -21, 4, 21, dk, 2.5, 0.8);
    shRR(g, 38, -20, 7, 40, 3, A.fizzLight, dk, 2);
    shEll(g, 43, 0, 2.5, 14, A.fizzHole);
    bubbles([[-4, -10, 4.2], [12, 8, 3.2], [-2, 10, 2.6], [10, -12, 2.4]]);
    shCirc(g, 53, -9, 3.2, 0xffffff, null, 0, 0.8);
    shCirc(g, 56, 6, 2.4, 0xffffff, null, 0, 0.8);
    return;
  }
  if (lv === 3) {
    // две таблетки, болты, горящий раструб, запал
    shPath(g, [[-14, -14], ...shQuad([-14, -14], [-18, -28], [-26, -24], 5), ...shQuad([-26, -24], [-30, -22], [-26, -30], 5)], 0xe8f1ff, 2.5);
    glowCircle(g, -26, -31, 7, A.glowOrange, 6, 0.35);
    shStar(g, -26, -31, 7, COLORS.hit);
    shCirc(g, -8, 0, 17, pink, dk, 3);
    shRR(g, 4, -24, 7, 48, 3, A.bolt, A.rivet, 1.5);
    for (const y of [-18, 18]) shCirc(g, 7.5, y, 2, A.rivet);
    shPoly(g, [[30, -11], [46, -22], [46, 22], [30, 11]], dk, A.fizzBrown, 1.5);
    shCirc(g, 14, 0, 21, pink, dk, 3);
    shRR(g, 8, -29, 8, 7, 2, A.clamp, dk, 1.5);
    shRR(g, 8, 22, 8, 7, 2, A.clamp, dk, 1.5);
    shRR(g, 44, -23, 7, 46, 3, A.fizzLight, dk, 2);
    shEll(g, 48, 0, 3, 16, A.fizzHole);
    glowRR(g, 45, -14, 6, 28, 3, 0xff9f43, 12, 0.5);
    shEll(g, 48, 0, 3, 14, A.fire);
    shEll(g, 48, 0, 2.4, 10, 0xff9f43);
    shEll(g, 48, 0, 1.6, 5, COLORS.hit);
    bubbles([[8, -9, 4], [18, 8, 3], [6, 7, 2.4]]);
    shCirc(g, -10, -5, 3.4, 0xffffff, null, 0, 0.88);
    return;
  }
  // уровень 4: бомба с шипами, светящиеся трещины, кислотная пена
  for (const s of [-1, 1]) {
    for (const k of [1, 2]) shPoly(g, shRot([[16, -7], [34, 0], [16, 7]], 6, 0, s * k * 0.62), dk, A.fizzLight, 1.5);
  }
  glowRR(g, 28, -16, 9, 32, 4, COLORS.acid, 12, 0.45);
  shRR(g, 28, -16, 9, 32, 4, dk, A.fizzLight, 2);
  // шар с «объёмом»: светлее вверху слева
  shCirc(g, 6, 0, 24, A.fizzShade, dk, 3.5);
  shCirc(g, 6, 0, 21, pink);
  shCirc(g, 1, -6, 15, A.fizzBright, null, 0, 0.55);
  // светящиеся трещины
  const cracks: Pt[][] = [
    [[-14, -12], [-6, -4], [-10, 4], [0, 10], [-2, 22]],
    [[-6, -4], [4, -12], [8, -24]],
    [[0, 10], [12, 8], [20, 16]],
  ];
  for (const c of cracks) shPath(g, c, COLORS.acid, 7, 0.14);
  for (const c of cracks) shPath(g, c, COLORS.acid, 2.4);
  for (const [x, y] of [[-8, -16], [-10, 14], [14, -18]]) shCirc(g, x, y, 2.2, A.bolt, A.rivet, 1);
  // кислотное жерло и пена
  shCirc(g, 36, 0, 22, COLORS.acid, null, 0, 0.1);
  shCirc(g, 36, 0, 17, COLORS.acid, null, 0, 0.2);
  shCirc(g, 36, 0, 12, COLORS.acid, null, 0, 0.3);
  shCirc(g, 36, 0, 7, A.acidLight, null, 0, 0.7);
  shCirc(g, 33, 0, 8, A.acidDark, COLORS.acid, 2);
  for (const [x, y, r] of [[46, -10, 5.5], [52, 4, 4.5], [47, 12, 3.4], [56, -4, 3]]) {
    shCirc(g, x, y, r, 0xffffff, COLORS.acid, 1.5, 0.9);
  }
  shStar(g, -16, -22, 8, COLORS.hit);
}

function drawSyringe(g: Gfx, lv: number): void {
  const E = COLORS.syringeEdge;
  const W = COLORS.syringe;
  const N = COLORS.needle;
  const needle = (x0: number, x1: number, w: number): void => shPoly(g, [[x0, -w], [x1, 0], [x0, w]], W, E, 1.5);
  const ticks = (x0: number, n: number, step: number, y0: number, y1: number): void => {
    for (let i = 0; i < n; i++) shLine(g, x0 + i * step, y0, x0 + i * step, y1, A.rivet, i % 2 ? 1.2 : 1.8);
  };
  if (lv <= 1) {
    // Шприц: светлый корпус с бирюзовой жидкостью, поршень сзади, игла спереди
    g.fillStyle(COLORS.syringe, 1).fillRoundedRect(-10, -9, 52, 18, 6);
    g.lineStyle(2, COLORS.syringeEdge, 1).strokeRoundedRect(-10, -9, 52, 18, 6);
    g.fillStyle(COLORS.needle, 1).fillRoundedRect(2, -5, 26, 10, 3);
    g.fillStyle(COLORS.syringeEdge, 1).fillRect(-18, -3, 9, 6).fillRoundedRect(-23, -11, 5, 22, 2);
    g.fillStyle(COLORS.syringe, 1).fillRect(42, -1.5, 10, 3);
    return;
  }
  if (lv === 2) {
    // длиннее, шкала, упор для пальцев
    shRR(g, -28, -9, 5, 18, 2, E);
    g.fillStyle(E, 1).fillRect(-23, -3, 12, 6);
    shRR(g, -14, -16, 5, 32, 2, E, A.rivet, 1);
    shRR(g, -10, -10, 54, 20, 6, W, E, 2);
    shRR(g, 0, -6, 36, 12, 3, N);
    ticks(2, 6, 7, -10, -5.5);
    shRR(g, 42, -5, 8, 10, 2, A.syringeMetal, E, 1);
    needle(50, 62, 2);
    return;
  }
  if (lv === 3) {
    // катушки, прицел, стабилизаторы, тормоз на конце
    for (const s of [-1, 1]) shPoly(g, [[-10, s * 10], [-26, s * 26], [-4, s * 12]], E, A.rivet, 2);
    shRR(g, -30, -10, 5, 20, 2, E);
    g.fillStyle(E, 1).fillRect(-25, -3, 14, 6);
    shRR(g, -14, -17, 5, 34, 2, E, A.rivet, 1);
    shRR(g, 4, -23, 24, 8, 3, A.scope, E, 1.5);
    shCirc(g, 29, -19, 4.5, N, 0xffffff, 1.2);
    shLine(g, 14, -15, 14, -11, E, 2);
    shRR(g, -10, -12, 54, 24, 7, W, E, 2);
    shRR(g, 0, -7, 38, 14, 4, N);
    ticks(2, 6, 7, -12, -8);
    for (const x of [8, 20, 32]) {
      glowRR(g, x, -15, 4, 30, 2, N, 8, 0.4);
      shRR(g, x, -15, 4, 30, 2, A.syringeWhite, N, 1.8);
    }
    shRR(g, 42, -6, 8, 12, 2, A.syringeMetal, E, 1);
    shRR(g, 49, -8, 7, 16, 2, E, A.rivet, 1.5);
    needle(56, 66, 2.4);
    return;
  }
  // уровень 4: рельсотрон — светящееся ядро, три катушки, боковые иглы, кристалл на острие
  for (const s of [-1, 1]) shPoly(g, [[-8, s * 11], [-18, s * 30], [-34, s * 30], [-22, s * 16], [-4, s * 13]], A.syringeWhite, N, 2);
  glowRing(g, -32, 0, 8, 3.5, N, 8, 0.45);
  shCirc(g, -32, 0, 8, null, N, 3.5);
  shRR(g, -26, -6, 14, 3, 1, E);
  shRR(g, -26, 3, 14, 3, 1, E);
  shRR(g, -14, -19, 5, 38, 2, E, A.rivet, 1);
  shRR(g, 2, -26, 28, 9, 3, A.scope, E, 1.5);
  glowCircle(g, 32, -21.5, 5.5, N, 8, 0.5);
  shCirc(g, 32, -21.5, 5.5, N, 0xffffff, 1.5);
  // корпус-стекло и светящаяся жидкость
  shRR(g, -10, -14, 56, 28, 8, W, E, 2);
  glowRR(g, -4, -7, 46, 14, 7, N, 12, 0.5);
  shRR(g, -4, -7, 46, 14, 7, N);
  shRR(g, -3, -6.5, 44, 6, 3, A.liquidLight, null, 0, 0.7);
  shRR(g, -3, 2, 44, 5, 2.5, A.liquidDark, null, 0, 0.55);
  // катушки
  for (const x of [4, 16, 28]) {
    glowRR(g, x, -19, 6, 38, 3, N, 8, 0.3);
    shRR(g, x, -19, 6, 38, 3, A.syringeWhite, N, 2);
    shRR(g, x + 1.5, -15, 3, 30, 1, COLORS.gold);
  }
  // боковые иглы
  for (const s of [-1, 1]) {
    shRR(g, 36, s * 17 - 2, 20, 4, 2, W, E, 1.2);
    shPoly(g, [[56, s * 17 - 2], [66, s * 17], [56, s * 17 + 2]], W, E, 1);
  }
  shRR(g, 44, -7, 10, 14, 3, A.syringeMetal, E, 1);
  needle(54, 70, 2.6);
  // кристалл на острие
  glowCircle(g, 75, 0, 9, N, 14, 0.55);
  shPoly(g, [[66, 0], [74, -6], [84, 0], [74, 6]], N, 0xffffff, 1.5);
  shPoly(g, [[70, 0], [74, -3], [78, 0], [74, 3]], 0xffffff, null, 0, 0.8);
}

/** Одна ампула, лежащая горизонтально: тело со стеклом и жидкостью, узкое горлышко и запаянный кончик. x — левый край тела, y — середина; bodyW, bodyH — тело, neck — длина горлышка. */
function ampoule(g: Gfx, x: number, y: number, bodyW: number, bodyH: number, neck: number, liquid: number = A.ampuleLiquid, edge: number = COLORS.ampuleEdge): void {
  const nh = Math.max(5, bodyH * 0.34);
  shRR(g, x + bodyW - 6, y - nh / 2, neck + 6, nh, nh / 2.5, COLORS.ampule, edge, 2);
  shPoly(g, [[x + bodyW + neck - 2, y - nh / 2], [x + bodyW + neck + nh * 1.1, y], [x + bodyW + neck - 2, y + nh / 2]], COLORS.ampule, edge, 1.5);
  shRR(g, x, y - bodyH / 2, bodyW, bodyH, bodyH / 2.2, COLORS.ampule, edge, 2);
  shRR(g, x + 4, y - bodyH / 2 + 4, bodyW - 8, bodyH - 8, Math.max(2, bodyH / 3), liquid);
  shRR(g, x + 4, y - bodyH / 2 + 4, bodyW - 8, Math.max(2, (bodyH - 8) * 0.38), 2, A.ampuleLiquidLight, null, 0, 0.55);
  shRR(g, x + bodyW * 0.18, y - bodyH / 2 + 2.5, bodyW * 0.4, 2.5, 1.2, 0xffffff, null, 0, 0.8);
}

function drawAmpule(g: Gfx, lv: number): void {
  if (lv <= 1) {
    // Ампула: голубая стеклянная колба с узким горлышком
    ampoule(g, -12, 0, 38, 26, 20);
    return;
  }
  if (lv === 2) {
    // две ампулы на скобе
    shRR(g, -16, -22, 9, 44, 4, A.bracket, COLORS.towerEdge, 2);
    ampoule(g, -10, -11, 36, 18, 22);
    ampoule(g, -10, 11, 36, 18, 22);
    shRR(g, 8, -24, 6, 48, 2, A.steel, A.rivet, 1.5);
    return;
  }
  if (lv === 3) {
    // три ампулы в обойме: большая посередине, две малые по бокам; хвост-стабилизатор
    for (const s of [-1, 1]) shPoly(g, [[-4, s * 18], [-24, s * 30], [-12, s * 12]], A.steelDark, A.rivet, 2);
    shRR(g, -20, -27, 12, 54, 5, A.bracket, COLORS.towerEdge, 2);
    ampoule(g, -10, 0, 46, 22, 28);
    ampoule(g, -6, -19, 36, 14, 22, A.ampuleLiquid);
    ampoule(g, -6, 19, 36, 14, 22, A.ampuleLiquid);
    for (const x of [6, 22]) shRR(g, x, -29, 5, 58, 2, A.steel, A.rivet, 1.5);
    shRR(g, 4, -11, 30, 5, 2, A.ampuleGold, COLORS.goldEdge, 1.2);
    return;
  }
  // уровень 4: золочёный снайперский ствол с оптикой и светящейся ампулой-патронником
  glowRR(g, -26, -14, 36, 28, 12, A.ampuleLiquid, 12, 0.4);
  ampoule(g, -26, 0, 36, 26, 8, A.ampuleLiquid, COLORS.goldEdge);
  shRR(g, -2, -9, 80, 18, 5, COLORS.gold, COLORS.goldEdge, 2);
  shRR(g, 6, -6, 66, 4, 2, 0xfff0b0, null, 0, 0.8);
  for (const x of [14, 34, 54]) shRR(g, x, -11, 5, 22, 2, A.ampuleGold, COLORS.goldEdge, 1.5);
  // дульный тормоз
  shRR(g, 74, -13, 14, 26, 4, A.steelDark, COLORS.gold, 2);
  for (const x of [77, 82]) shLine(g, x, -11, x, 11, COLORS.gold, 2);
  // оптика
  shRR(g, 4, -28, 36, 11, 5, A.scope, COLORS.gold, 2);
  shLine(g, 14, -18, 14, -9, COLORS.goldEdge, 3);
  shLine(g, 30, -18, 30, -9, COLORS.goldEdge, 3);
  glowCircle(g, 40, -22.5, 7, A.ampuleLens, 10, 0.55);
  shCirc(g, 40, -22.5, 7, A.ampuleLens, 0xffffff, 1.8);
  shCirc(g, 38, -24.5, 2.2, 0xffffff, null, 0, 0.85);
  // вспышка у дула
  shCirc(g, 90, 0, 8, A.ampuleLens, null, 0, 0.2);
  shCirc(g, 90, 0, 5, 0xffffff, null, 0, 0.5);
  shStar(g, 90, 0, 7, 0xffffff);
}

/** Горизонтальная зелёная капсула: x — левый край, y — середина; делится пополам, посередине белый крест (cross — размер креста, 0 — без креста). */
function greenCapsule(g: Gfx, x: number, y: number, w: number, h: number, cross: number): void {
  shRR(g, x, y - h / 2, w, h, h / 2, COLORS.antibiotic, COLORS.antibioticEdge, 2);
  g.fillStyle(A.capsuleDark, 1).fillRoundedRect(x + w / 2, y - h / 2, w / 2, h, { tl: 0, bl: 0, tr: h / 2, br: h / 2 });
  shRR(g, x, y - h / 2, w, h, h / 2, null, COLORS.antibioticEdge, 2);
  shRR(g, x + h * 0.4, y - h / 2 + 3, Math.max(6, w / 2 - h * 0.7), 3, 1.5, 0xffffff, null, 0, 0.6);
  if (cross > 0) {
    const cx = x + w / 2;
    shRR(g, cx - cross * 0.2, y - cross / 2, cross * 0.4, cross, 1, 0xffffff);
    shRR(g, cx - cross / 2, y - cross * 0.2, cross, cross * 0.4, 1, 0xffffff);
  }
}

function drawAntibiotic(g: Gfx, lv: number): void {
  const L = A.capsuleLight;
  const D = A.capsuleDark;
  if (lv <= 1) {
    // Антибиотик: зелёная капсула с белым крестом
    greenCapsule(g, -8, 0, 48, 26, 16);
    return;
  }
  if (lv === 2) {
    // двойная капсула на скобе
    shRR(g, -16, -21, 12, 42, 5, A.bracket, COLORS.towerEdge, 2);
    greenCapsule(g, -4, -11, 46, 18, 11);
    greenCapsule(g, -4, 11, 46, 18, 11);
    shRR(g, 8, -24, 6, 48, 2, D, A.rivet, 1.5);
    return;
  }
  if (lv === 3) {
    // капельница: пузырь с раствором сзади, трубки, капсула и капельница на конце
    shRR(g, -34, -25, 20, 22, 7, A.label, D, 2);
    shRR(g, -32, -14, 16, 9, 4, COLORS.antibiotic);
    shPath(g, [[-24, -3], ...shQuad([-24, -3], [-20, 12], [-6, 8], 6)], D, 2.5);
    shPath(g, [[-24, 3], ...shQuad([-24, 3], [-22, 20], [-4, 14], 6)], D, 2.5);
    greenCapsule(g, -6, 0, 52, 26, 15);
    shRR(g, 8, -16, 6, 32, 2, A.steel, A.rivet, 1.5);
    shRR(g, 36, -16, 6, 32, 2, A.steel, A.rivet, 1.5);
    // капельница
    shRR(g, 44, -6, 10, 12, 3, A.syringeWhite, D, 1.5);
    shPoly(g, [[54, -3], [64, 0], [54, 3]], A.syringeWhite, D, 1.2);
    shPoly(g, dropPts([68, 0], [72, 6], [68, 9], [64, 6]), COLORS.antibiotic, D, 1.2);
    return;
  }
  // уровень 4: светящиеся двойная капсула и капельница, зелёные пузыри
  glowRR(g, -4, -26, 56, 52, 12, COLORS.antibiotic, 14, 0.4);
  shRR(g, -34, -27, 22, 24, 8, A.label, D, 2);
  shRR(g, -32, -15, 18, 10, 4, L);
  glowRR(g, -32, -15, 18, 10, 4, L, 6, 0.4);
  shPath(g, [[-24, -3], ...shQuad([-24, -3], [-20, 12], [-6, 10], 6)], D, 3);
  shPath(g, [[-24, 4], ...shQuad([-24, 4], [-22, 22], [-4, 18], 6)], D, 3);
  shRR(g, -16, -27, 12, 54, 5, A.steelDark, COLORS.gold, 2);
  greenCapsule(g, -2, -14, 54, 20, 12);
  greenCapsule(g, -2, 14, 54, 20, 12);
  glowRR(g, -6, -10, 66, 20, 10, L, 10, 0.4);
  greenCapsule(g, -6, 0, 66, 20, 13);
  for (const x of [8, 22, 36]) shRR(g, x, -26, 5, 52, 2, A.syringeWhite, COLORS.gold, 1.5);
  shRR(g, 58, -6, 10, 12, 3, A.syringeWhite, COLORS.gold, 1.5);
  shPoly(g, [[68, -3], [80, 0], [68, 3]], A.syringeWhite, COLORS.gold, 1.2);
  glowCircle(g, 85, 0, 7, L, 10, 0.55);
  shPoly(g, dropPts([84, 0], [90, 6], [84, 10], [78, 6]), L, 0xffffff, 1.2);
  for (const [x, y, r] of [[-14, 24, 4], [6, 30, 3], [40, -30, 3.4], [26, 29, 2.4], [52, 24, 3]]) shCirc(g, x, y, r, A.capsuleBubble, COLORS.antibiotic, 1.2, 0.9);
}

/** Основание башни (неподвижное, не вращается): диск, у уровней 2–4 — свои пояса, болты, шкалы; у 4-го — шипы и лужи по краю. */
function drawBase(g: Gfx, id: TowerId, lv: number): void {
  if (id === 'syrup' && lv === 4) {
    // лужи-«капли» по краю
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      glowCircle(g, Math.cos(a) * 34, Math.sin(a) * 34, 6.5, A.glowOrange, 8, 0.3);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      shCirc(g, Math.cos(a) * 34, Math.sin(a) * 34, 6.5, COLORS.syrup, COLORS.syrupDark, 1.5);
    }
  }
  if (id === 'fizz' && lv === 4) {
    // шипы мины
    for (let i = 0; i < 8; i++) {
      const a = ((22.5 + 45 * i) * Math.PI) / 180;
      if (Math.abs(Math.sin(a)) > 0.9 && Math.sin(a) > 0) continue;
      shPoly(g, shRot([[30, -7], [45, 0], [30, 7]], 0, 0, a), COLORS.fizzDark, A.fizzLight, 1.5);
    }
  }
  shCirc(g, 0, 0, 36, COLORS.tower, COLORS.towerEdge, 3);
  const at = (i: number, n: number, off: number, r: number): Pt => [Math.cos((i * Math.PI * 2) / n + off) * r, Math.sin((i * Math.PI * 2) / n + off) * r];
  if (id === 'pill') {
    if (lv === 2) shCirc(g, 0, 0, 29, null, A.steel, 3);
    if (lv === 3) {
      shCirc(g, 0, 0, 29, null, A.steel, 3);
      shCirc(g, 0, 0, 22, null, A.steelDark, 2);
      for (let i = 0; i < 6; i++) {
        const [x, y] = at(i, 6, 0.5, 29);
        shCirc(g, x, y, 2.4, COLORS.pillBlue);
      }
    }
    if (lv === 4) {
      for (let i = 0; i < 8; i++) {
        const a0 = (i * Math.PI) / 4 + 0.08;
        shArc(g, 0, 0, 27, a0, a0 + 0.62, 0x9fd0ff, 12, 0.15);
        shArc(g, 0, 0, 27, a0, a0 + 0.62, A.plate, 8);
        shArc(g, 0, 0, 31.2, a0, a0 + 0.62, COLORS.gold, 1.5);
      }
    }
  } else if (id === 'syrup') {
    if (lv >= 2) shCirc(g, 0, 0, 29, null, lv >= 4 ? A.glowOrange : COLORS.syrupDark, 3);
    if (lv === 3) {
      for (let i = 0; i < 6; i++) {
        const [x, y] = at(i, 6, 0.3, 29);
        shCirc(g, x, y, 3.6, COLORS.syrup, COLORS.syrupDark, 1.2);
      }
    }
    if (lv === 4) {
      shCirc(g, 0, 0, 22, null, COLORS.gold, 2);
      for (let i = 0; i < 8; i++) {
        const [x, y] = at(i, 8, 0, 22);
        shCirc(g, x, y, 2.4, COLORS.gold);
      }
    }
  } else if (id === 'fizz') {
    if (lv === 2) {
      shCirc(g, 0, 0, 29, null, A.steel, 3);
      shCirc(g, -20, 20, 3.4, COLORS.fizz, null, 0, 0.8);
      shCirc(g, 18, -22, 2.6, COLORS.fizz, null, 0, 0.8);
      shCirc(g, -26, -10, 2.2, COLORS.fizz, null, 0, 0.8);
    }
    if (lv >= 3) {
      shCirc(g, 0, 0, 29, null, A.steel, 3);
      for (let i = 0; i < 8; i++) {
        const [x, y] = at(i, 8, 0.2, 29);
        shCirc(g, x, y, 2.6, lv === 4 ? COLORS.acid : A.bolt, A.boltEdge, 1);
      }
    }
  } else if (id === 'ampule') {
    // ампула: тонкие кольца; выше — капли жидкости, на 4-м — золото и голубое свечение
    if (lv >= 2) shCirc(g, 0, 0, 29, null, lv >= 4 ? COLORS.gold : A.steel, 3);
    if (lv === 3) {
      for (let i = 0; i < 6; i++) {
        const [x, y] = at(i, 6, 0.4, 29);
        shCirc(g, x, y, 3, A.ampuleLiquid, COLORS.ampuleEdge, 1.2);
      }
    }
    if (lv === 4) {
      glowRing(g, 0, 0, 23, 3, A.ampuleLiquid, 10, 0.5);
      shCirc(g, 0, 0, 23, null, A.ampuleLiquid, 3);
      for (let i = 0; i < 8; i++) {
        const [x, y] = at(i, 8, 0, 29);
        shCirc(g, x, y, 2.4, COLORS.gold, COLORS.goldEdge, 1);
      }
    }
  } else if (id === 'antibiotic') {
    // антибиотик: зелёные кольца и пузырьки; на 4-м — светящееся кольцо с крестиками
    if (lv >= 2) shCirc(g, 0, 0, 29, null, lv >= 4 ? A.capsuleLight : A.capsuleDark, 3);
    if (lv === 3) {
      for (let i = 0; i < 6; i++) {
        const [x, y] = at(i, 6, 0.3, 29);
        shCirc(g, x, y, 3.4, A.capsuleBubble, COLORS.antibiotic, 1.2);
      }
    }
    if (lv === 4) {
      glowRing(g, 0, 0, 23, 3, COLORS.antibiotic, 10, 0.5);
      shCirc(g, 0, 0, 23, null, COLORS.antibiotic, 3);
      for (let i = 0; i < 4; i++) {
        const [x, y] = at(i, 4, Math.PI / 4, 23);
        shRR(g, x - 1.5, y - 5, 3, 10, 1, 0xffffff);
        shRR(g, x - 5, y - 1.5, 10, 3, 1, 0xffffff);
      }
    }
  } else {
    // шприц: шкала по кругу
    if (lv >= 2) {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        const l = i % 6 === 0 ? 7 : 4;
        shLine(g, Math.cos(a) * (32 - l), Math.sin(a) * (32 - l), Math.cos(a) * 32, Math.sin(a) * 32, A.rivet, 1.6);
      }
    }
    if (lv === 3) g.lineStyle(2.5, COLORS.needle, 0.55).strokeCircle(0, 0, 25);
    if (lv === 4) {
      glowRing(g, 0, 0, 25, 3, COLORS.needle, 10, 0.5);
      shCirc(g, 0, 0, 25, null, COLORS.needle, 3);
      for (let i = 0; i < 4; i++) {
        const [x, y] = at(i, 4, Math.PI / 4, 25);
        shStar(g, x, y, 5, 0xffffff);
      }
    }
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
  if (!image) return artImage(scene, key, box);
  setArt(image, key, box);
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

/** Верхняя неподвижная часть башни id уровня level — одна картинка: втулка над стволом, ядро 4-го уровня, кольцо и точки уровня под башней. */
function topTexture(scene: Phaser.Scene, id: TowerId, level: number): string {
  const lv = artLevel(level);
  return bakeArt(scene, `tower-top-${id}-${lv}`, TOP_BOX, (g) => {
    shCirc(g, 0, 0, 9, COLORS.background, COLORS.towerEdge, 2);
    if (lv === 4) {
      const core = { pill: COLORS.gold, syrup: COLORS.gold, fizz: COLORS.acid, syringe: COLORS.needle, ampule: A.ampuleLiquid, antibiotic: COLORS.antibiotic }[id];
      if (id === 'pill') {
        // золотая корона вокруг втулки
        for (let i = 0; i < 8; i++) shPoly(g, shRot([[9, -4], [20, 0], [9, 4]], 0, 0, (i * Math.PI) / 4), COLORS.gold, COLORS.goldEdge, 1.2);
      }
      glowCircle(g, 0, 0, 5, core, 10, 0.5);
      shCirc(g, 0, 0, 5, core, 0xffffff, 1.5);
    } else if (lv >= 2) {
      shCirc(g, 0, 0, 4, LEVEL_COLORS[lv - 1]);
    }
    if (lv <= 1) return;
    const color = LEVEL_COLORS[lv - 1];
    if (lv === 4) glowRing(g, 0, 0, 40, 4, color, 8, 0.5);
    g.lineStyle(4, color, 0.95).strokeCircle(0, 0, 40);
    for (let i = 0; i < lv; i++) {
      const dx = (i - (lv - 1) / 2) * 13;
      g.fillStyle(color, 1).fillCircle(dx, 46, 5);
      g.lineStyle(1.5, 0x0b1020, 1).strokeCircle(dx, 46, 5);
    }
  });
}

function baseTexture(scene: Phaser.Scene, id: TowerId, level: number): string {
  const lv = artLevel(level);
  return bakeArt(scene, `tower-base-${id}-${lv}`, BASE_BOX, (g) => drawBase(g, id, lv));
}

/** Картинки башни: основание, ствол (в контейнере — он поворачивается на цель) и верхняя часть; уровень 1–4 — свой рисунок каждой части. */
interface TowerArt {
  base: Phaser.GameObjects.Image;
  barrel: Phaser.GameObjects.Container;
  barrelImg: Phaser.GameObjects.Image;
  top: Phaser.GameObjects.Image;
}

/** Основание, ствол и верхняя часть башни в контейнере. */
function buildTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: TowerId, level = 1): TowerArt {
  const base = artImage(scene, baseTexture(scene, id, level), BASE_BOX);
  const barrelImg = barrelImage(scene, id, level);
  const barrel = scene.add.container(0, 0, [barrelImg]);
  const top = artImage(scene, topTexture(scene, id, level), TOP_BOX);
  parent.add([base, barrel, top]);
  return { base, barrel, barrelImg, top };
}

/** Меняет все картинки башни на рисунки уровня level. */
function setTowerArtLevel(scene: Phaser.Scene, art: TowerArt, id: TowerId, level: number): void {
  setArt(art.base, baseTexture(scene, id, level), BASE_BOX);
  setArt(art.barrelImg, barrelTexture(scene, id, level), BARREL_BOX);
  setArt(art.top, topTexture(scene, id, level), TOP_BOX);
}

/** Рисует башню (основание и ствол) в контейнере; возвращает ствол — он поворачивается на цель. level (1–4) — уровень слияния, по умолчанию 1. */
export function createTowerArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: TowerId = 'pill', level = 1): Phaser.GameObjects.Container {
  return buildTowerArt(scene, parent, id, level).barrel;
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
  /** Уровень башни (1…MAX_TOWER_LEVEL) и все её мутации: свои и принесённые слиянием (одна и та же может повторяться — см. `mutationStack`). */
  level = 1;
  picks: string[] = [];
  /** Сколько порогов мутаций эта башня уже прошла выбором (свой выбор на уровнях 2 и 4; мутации, пришедшие со слиянием, порогов не закрывают). */
  private tiersDone = 0;
  /** Расстояние от башни до организма по дорожкам (по ближайшей к ней точке сети), пикселей: по нему считается «вперёд/назад». */
  readonly remaining: number;
  /** Пауза до следующего выстрела, секунды игрового времени. */
  private cooldown = 0;
  /** Сколько секунд башня ещё заглушена (0 — работает). */
  private disabledFor = 0;
  /** Куда смотрит луч: номер направления 0…AIM_STEPS-1 (только у башен с лучом). */
  aim = 0;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly barrel: Phaser.GameObjects.Container;
  private readonly container: Phaser.GameObjects.Container;
  private aimLine: Phaser.GameObjects.Image | null = null;
  private aimLine2: Phaser.GameObjects.Image | null = null;
  /** Картинки башни (основание, ствол, верх) — свои на каждый уровень слияния. */
  private readonly art: TowerArt;
  private readonly mergeTween: Phaser.Tweens.Tween;
  private readonly badgeTween: Phaser.Tweens.Tween;
  private readonly selectRing: Phaser.GameObjects.Graphics;
  private readonly mergeRing: Phaser.GameObjects.Image;
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
      this.aim = defaultAim(this.stats, x, y);
      this.aimLine = aimLineImage(scene, null, 1);
      this.container.add(this.aimLine);
    }
    this.selectRing = scene.add.graphics().setVisible(false);
    this.container.add(this.selectRing);
    const art = buildTowerArt(scene, this.container, id);
    this.barrel = art.barrel;
    this.art = art;
    // Красное кольцо — башня заглушена
    this.ring = ringImage(scene, 0, 0, 44, 5, COLORS.loseLine).setVisible(false);
    this.container.add(this.ring);
    // Зелёное мигающее кольцо — башню можно слить с выбранной
    this.mergeRing = ringImage(scene, 0, 0, 49, 5, COLORS.merge).setVisible(false);
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
    return this.tiersDone < unlockedTiers(this.level) ? this.tiersDone : null;
  }

  /** Слияние: башня становится уровнем выше и получает мутации сливаемой башни `extraPicks` (свои остаются; решение владельца 8 октября 2026), пауза до выстрела не сбрасывается. */
  upgrade(extraPicks: readonly string[] = []): void {
    this.level++;
    this.picks.push(...extraPicks);
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
    this.tiersDone++;
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
    setTowerArtLevel(this.scene, this.art, this.id, this.level);
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
    const muzzle = MUZZLE[this.id] + (this.level - 1) * MUZZLE_PER_LEVEL[this.id];
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
    const { range, side, toughest, extraTargets, targeting } = this.stats;
    const found: Bacterium[] = [];
    for (const b of bacteria) {
      if (b.hp <= 0) continue;
      if (Math.hypot(b.x - this.x, b.y - this.y) > range + b.radius) continue;
      if (side === 'forward' && !(b.remaining > this.remaining)) continue;
      if (side === 'back' && !(b.remaining < this.remaining)) continue;
      found.push(b);
    }
    // ближайшая к организму первой; «Охотник» — сначала самая прочная (по полному HP); «снайпер» (Ампула) — самая прочная по текущему HP
    if (targeting === 'snipe') found.sort((a, b) => b.hp - a.hp || a.remaining - b.remaining);
    else found.sort((a, b) => (toughest ? b.maxHp - a.maxHp || a.remaining - b.remaining : a.remaining - b.remaining));
    return found.slice(0, 1 + extraTargets);
  }

  destroy(): void {
    this.mergeTween.remove();
    this.badgeTween.remove();
    this.scene.tweens.killTweensOf([this.mergeRing, this.badge, this.container]);
    this.container.destroy();
  }
}
