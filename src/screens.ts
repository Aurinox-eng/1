/**
 * Общее для экранов вне партии (меню, выбор уровня, «Улучшения»): кнопка, звезда, стиль текста и описание экрана для проверок.
 */
import Phaser from 'phaser';
import { QA_MODE } from './debug';
import { sfx } from './sound';
import { COLORS, FONT, TEXT_COLORS } from './theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Карточка уровня на экране выбора (для проверок). */
export interface LevelCardInfo {
  level: number;
  open: boolean;
  stars: number;
  best: number;
  rect: Rect;
  texts: string[];
}

/** Что сейчас на экране вне партии: имя сцены, кнопки (центр и размер на экране игры 1280×720), тексты, карточки уровней. */
export interface ScreenInfo {
  scene: string;
  buttons: Record<string, Rect>;
  texts: string[];
  levels?: LevelCardInfo[];
}

declare global {
  interface Window {
    __pvbUi?: { get: () => ScreenInfo | null };
  }
}

let provider: (() => ScreenInfo | null) | null = null;

/** Делает описание текущего экрана доступным проверкам (`window.__pvbUi.get()`, только `?qa`); `null` — экрана вне партии сейчас нет. */
export function setScreenInfo(fn: (() => ScreenInfo | null) | null): void {
  provider = fn;
  if (QA_MODE) window.__pvbUi = { get: () => (provider ? provider() : null) };
}

export function textStyle(size: number, color: string = TEXT_COLORS.main, stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
    stroke: TEXT_COLORS.stroke,
    strokeThickness: stroke && size > 20 ? 4 : 0,
    resolution: 2,
  };
}

export interface ButtonSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** Цвет заливки и рамки; по умолчанию зелёная кнопка. */
  fill?: number;
  line?: number;
  fontSize?: number;
  onTap: () => void;
}

/** Кнопка: скруглённый прямоугольник с надписью и зоной нажатия; возвращает прямоугольник для проверок. */
export function addButton(scene: Phaser.Scene, spec: ButtonSpec): Rect {
  const { x, y, w, h } = spec;
  const g = scene.add.graphics();
  g.fillStyle(spec.fill ?? 0x2a8a4a, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  g.lineStyle(4, spec.line ?? COLORS.merge, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  scene.add.text(x, y, spec.label, textStyle(spec.fontSize ?? 34)).setOrigin(0.5);
  scene.add
    .zone(x, y, w, h)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      sfx.place();
      spec.onTap();
    });
  return { x, y, w, h };
}

/** Рисует пятиконечную звезду с центром (cx, cy): заработанная — золотая, остальные — тёмные. */
export function drawStar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, outer: number, earned: boolean): void {
  const inner = outer * 0.43;
  const points: Phaser.Math.Vector2[] = [];
  for (let k = 0; k < 10; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    const radius = k % 2 === 0 ? outer : inner;
    points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
  }
  g.fillStyle(earned ? COLORS.gold : 0x3a3a4a, 1).fillPoints(points, true);
  g.lineStyle(Math.max(2, outer / 12), earned ? 0xfff2b0 : 0x6a6a7a, 1).strokePoints(points, true);
}

/** Рисует замок (закрытый уровень) с центром (cx, cy). */
export function drawLock(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number): void {
  const bodyW = size;
  const bodyH = size * 0.75;
  g.lineStyle(Math.max(4, size / 6), 0x7d8fb5, 1).beginPath().arc(cx, cy - bodyH / 2 + 2, size * 0.32, Math.PI, 0, false).strokePath();
  g.fillStyle(0x7d8fb5, 1).fillRoundedRect(cx - bodyW / 2, cy - bodyH / 2 + 2, bodyW, bodyH, 6);
  g.fillStyle(0x1a1f2e, 1).fillCircle(cx, cy + 2, size * 0.1);
}
