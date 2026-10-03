import Phaser from 'phaser';
import { CONFIG } from '../config';
import { drawBody } from '../objects/bacteriumArt';
import { extentOf, type BacteriumKind } from '../objects/Bacterium';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;

/** Что показывает плашка (тексты уже на нужном языке; собирает сцена). */
export interface PlaqueModel {
  /** Что нарисовать слева: бактерию типа `id` или башню `id`. */
  kind: 'bacterium' | 'tower';
  id: string;
  /** Заголовок сверху («Новая бактерия»), название, две строки «подпись + текст» и подсказка внизу. */
  title: string;
  name: string;
  lines: { label: string; text: string }[];
  hint: string;
}

/** Где плашка и что на ней — для проверок и бота. */
export interface PlaqueGeometry {
  visible: boolean;
  kind: 'bacterium' | 'tower' | null;
  id: string | null;
}

const CARD = { w: 900, h: 470 };
const DEPTH = 220;
/** Правая колонка текста: левый край и ширина, пикселей. */
const TEXT_X = W / 2 - CARD.w / 2 + 380;
const TEXT_W = CARD.w - 380 - 36;
/** Крупный рисунок на плашке: во сколько раз увеличиваем и какого размера (радиус описанного круга) делаем бактерию, пикселей. */
const ART_RADIUS = 118;
const TOWER_SCALE = 2.3;

/**
 * Плашка с описанием: игра на паузе, поверх поля — рисунок новой бактерии (или башни), название и две строки. Один тап по экрану закрывает её
 * (тап принимает сцена). Рисунок — тот же, что на поле, только крупнее.
 */
export class Plaque {
  private readonly root: Phaser.GameObjects.Container;
  private readonly art: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly labelTexts: Phaser.GameObjects.Text[];
  private readonly bodyTexts: Phaser.GameObjects.Text[];
  private readonly hintText: Phaser.GameObjects.Text;
  private shown = false;
  private current: PlaqueModel | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const x0 = W / 2 - CARD.w / 2;
    const y0 = H / 2 - CARD.h / 2;
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8);
    const card = scene.add.graphics();
    card.fillStyle(0x14264b, 1).fillRoundedRect(x0, y0, CARD.w, CARD.h, 22);
    card.lineStyle(4, 0x3a5f9c, 1).strokeRoundedRect(x0, y0, CARD.w, CARD.h, 22);
    card.fillStyle(0x0e1b38, 1).fillCircle(x0 + 190, H / 2 + 8, 150);
    card.lineStyle(3, COLORS.gold, 0.7).strokeCircle(x0 + 190, H / 2 + 8, 150);
    this.art = scene.add.container(x0 + 190, H / 2 + 8);
    this.titleText = this.text(W / 2, y0 + 36, '', 34, TEXT_COLORS.accent).setOrigin(0.5);
    this.nameText = this.text(TEXT_X, y0 + 100, '', 46, TEXT_COLORS.main).setOrigin(0, 0.5);
    this.labelTexts = [0, 1].map(() => this.text(TEXT_X, 0, '', 22, TEXT_COLORS.accent).setOrigin(0, 0));
    this.bodyTexts = [0, 1].map(() =>
      this.text(TEXT_X, 0, '', 24, TEXT_COLORS.main)
        .setOrigin(0, 0)
        .setFontStyle('normal')
        .setWordWrapWidth(TEXT_W),
    );
    this.hintText = this.text(W / 2, y0 + CARD.h - 34, '', 26, TEXT_COLORS.soft).setOrigin(0.5);
    this.root = scene.add
      .container(0, 0, [dim, card, this.art, this.titleText, this.nameText, ...this.labelTexts, ...this.bodyTexts, this.hintText])
      .setDepth(DEPTH)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.shown;
  }

  geometry(): PlaqueGeometry {
    return { visible: this.shown, kind: this.current?.kind ?? null, id: this.current?.id ?? null };
  }

  show(model: PlaqueModel): void {
    this.current = model;
    this.shown = true;
    this.art.removeAll(true);
    if (model.kind === 'bacterium') {
      const kind = model.id as BacteriumKind;
      const g = this.scene.add.graphics();
      const hp = CONFIG.types[kind].hp;
      drawBody(g, kind, { hp, maxHp: hp, spread: 0, seed: 1 });
      g.setScale(Math.min(2.6, ART_RADIUS / extentOf(kind)));
      this.art.add(g);
    } else {
      const holder = this.scene.add.container(0, 0).setScale(TOWER_SCALE);
      createTowerArt(this.scene, holder, model.id as TowerId);
      this.art.add(holder);
    }
    this.titleText.setText(model.title);
    this.nameText.setText(model.name);
    let y = H / 2 - CARD.h / 2 + 150;
    for (let i = 0; i < 2; i++) {
      const line = model.lines[i];
      this.labelTexts[i].setVisible(Boolean(line)).setText(line?.label ?? '').setPosition(TEXT_X, y);
      this.bodyTexts[i].setVisible(Boolean(line)).setText(line?.text ?? '');
      if (!line) continue;
      y += 30;
      this.bodyTexts[i].setPosition(TEXT_X, y);
      y += this.bodyTexts[i].height + 22;
    }
    this.hintText.setText(model.hint);
    this.root.setVisible(true);
  }

  hide(): void {
    this.shown = false;
    this.current = null;
    this.root.setVisible(false);
    this.art.removeAll(true);
  }

  private text(x: number, y: number, str: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: TEXT_COLORS.stroke,
      strokeThickness: size > 20 ? 4 : 0,
      resolution: 2,
    });
  }
}
