import Phaser from 'phaser';
import { ALMANAC_BEATEN_BY, ALMANAC_TOWERS } from '../almanac';
import { CONFIG } from '../config';
import { t, type TextKey } from '../i18n';
import { drawBody } from '../objects/bacteriumArt';
import { extentOf, type BacteriumKind } from '../objects/Bacterium';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { addButton, setScreenInfo, textStyle, type Rect } from '../screens';
import { COLORS, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;

/** Область списка: слева направо на всю ширину, сверху вниз от полосы вкладок до низа экрана, пикселей. */
const LIST = { x: 40, y: 138, w: W - 80, h: H - 138 - 16 };
const ROW_H = 92;
const ICON_X = 52;
const NAME_X = 120;
const LINE_X = 330;
const LINE_W = 470;
const MARKS_X = 830;
const MARK = 46;

type Tab = 'towers' | 'bacteria';

const TOWERS = Object.keys(CONFIG.towers) as TowerId[];
const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];

const cap = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * «Альманах» (решение владельца 8 октября 2026, docs/expert-plan.md, раздел 3): вместо плашек с автопаузой — один экран со списком башен и бактерий.
 * Запись: рисунок, название, одна короткая строка и значки (против кого башня сильна и слаба; какие башни бьют бактерию). Без заголовков и подписей-абзацев.
 * Открывается из главного меню и с паузы партии (тогда партия стоит под экраном и после «Назад» продолжается с паузы).
 */
export class AlmanacScene extends Phaser.Scene {
  private from: 'menu' | 'game' = 'menu';
  private tab: Tab = 'towers';
  private list!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private tabGraphics!: Phaser.GameObjects.Graphics;
  private tabRects: Record<Tab, Rect> = { towers: { x: 0, y: 0, w: 0, h: 0 }, bacteria: { x: 0, y: 0, w: 0, h: 0 } };
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowTexts: string[] = [];

  constructor() {
    super('Almanac');
  }

  init(data?: { from?: 'menu' | 'game' }): void {
    this.from = data?.from === 'game' ? 'game' : 'menu';
    this.tab = 'towers';
    this.scrollY = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // Сплошной фон: под экраном может стоять приостановленная партия
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.background, 1).setDepth(-1);
    this.add.text(W / 2, 40, t('almanacTitle'), textStyle(46, TEXT_COLORS.accent)).setOrigin(0.5);
    this.backRect = addButton(this, { x: 130, y: 44, w: 190, h: 64, label: t('almBack'), fontSize: 32, fill: 0x2a3550, line: 0x4a5c82, onTap: () => this.leave() });

    this.tabGraphics = this.add.graphics();
    this.tabRects.towers = this.addTab(W / 2 - 160, 100, 'towers', t('almTabTowers'));
    this.tabRects.bacteria = this.addTab(W / 2 + 160, 100, 'bacteria', t('almTabBacteria'));

    this.list = this.add.container(LIST.x, LIST.y);
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff, 1).fillRect(LIST.x, LIST.y, LIST.w, LIST.h);
    this.list.setMask(maskShape.createGeometryMask());

    // Прокрутка: пальцем (тянуть список) и колесом мыши
    const area = this.add.zone(LIST.x + LIST.w / 2, LIST.y + LIST.h / 2, LIST.w, LIST.h).setInteractive();
    area.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.scrollBy(pointer.y - pointer.prevPosition.y);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollBy(-dy));

    this.showTab('towers');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setScreenInfo(null));
    setScreenInfo(() =>
      this.scene.isActive()
        ? { scene: 'almanac', buttons: { back: this.backRect, towers: this.tabRects.towers, bacteria: this.tabRects.bacteria }, texts: this.rowTexts }
        : null,
    );
  }

  private addTab(x: number, y: number, tab: Tab, label: string): Rect {
    const w = 290;
    const h = 56;
    this.add.text(x, y, label, textStyle(32)).setOrigin(0.5);
    this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showTab(tab));
    return { x, y, w, h };
  }

  private drawTabs(): void {
    const g = this.tabGraphics;
    g.clear();
    for (const tab of ['towers', 'bacteria'] as Tab[]) {
      const r = this.tabRects[tab];
      const on = tab === this.tab;
      g.fillStyle(on ? 0x2a5c9a : 0x1b2a4a, 1).fillRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 14);
      g.lineStyle(3, on ? COLORS.gold : 0x3a5f9c, 1).strokeRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 14);
    }
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    this.scrollY = 0;
    this.drawTabs();
    this.list.removeAll(true);
    this.list.y = LIST.y;
    this.rowTexts = [];
    const ids: string[] = tab === 'towers' ? TOWERS : KINDS;
    ids.forEach((id, i) => this.addRow(tab, id, i * ROW_H));
    this.maxScroll = Math.max(0, ids.length * ROW_H - LIST.h);
  }

  private scrollBy(dy: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, this.maxScroll);
    this.list.y = LIST.y - this.scrollY;
  }

  private addRow(tab: Tab, id: string, y: number): void {
    const key = cap(id);
    const g = this.add.graphics();
    g.fillStyle(0x14264b, 1).fillRoundedRect(0, y + 4, LIST.w, ROW_H - 8, 14);
    g.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(0, y + 4, LIST.w, ROW_H - 8, 14);
    this.list.add(g);
    const cy = y + ROW_H / 2;

    const name = t(tab === 'towers' ? (`tower${key}` as TextKey) : (`bacName${key}` as TextKey));
    const line = t(tab === 'towers' ? (`almTower${key}` as TextKey) : (`almBac${key}` as TextKey));
    this.rowTexts.push(`${name}: ${line}`);
    this.list.add(this.add.text(NAME_X, cy, name, textStyle(28)).setOrigin(0, 0.5));
    this.list.add(this.add.text(LINE_X, cy, line, { ...textStyle(22, TEXT_COLORS.main, false), fontStyle: 'normal', wordWrap: { width: LINE_W } }).setOrigin(0, 0.5));

    if (tab === 'towers') {
      this.list.add(this.towerIcon(ICON_X, cy, id as TowerId, 0.78));
      const entry = ALMANAC_TOWERS[id as TowerId];
      this.addMarks(MARKS_X, y + 26, t('almStrong'), entry.strong.map((k) => this.bacteriumIcon(k)), COLORS.merge);
      this.addMarks(MARKS_X, y + 66, t('almWeak'), entry.weak.map((k) => this.bacteriumIcon(k)), COLORS.loseLine);
    } else {
      this.list.add(this.bacteriumIcon(id as BacteriumKind, ICON_X, cy, 30));
      this.addMarks(MARKS_X, cy, t('almBeatenBy'), ALMANAC_BEATEN_BY[id as BacteriumKind].map((tower) => this.towerIcon(0, 0, tower, 0.6)), COLORS.merge);
    }
  }

  /** Подпись и ряд значков справа в строке; значки создаются без позиции и расставляются здесь. */
  private addMarks(x: number, cy: number, label: string, icons: Phaser.GameObjects.Container[], color: number): void {
    // Пустой список (у Витамина) — без подписи
    if (icons.length === 0) return;
    const text = this.add.text(x, cy, label, { ...textStyle(18, '#' + color.toString(16).padStart(6, '0'), false) }).setOrigin(0, 0.5);
    this.list.add(text);
    let ix = x + text.width + 14 + MARK / 2;
    for (const icon of icons) {
      icon.setPosition(ix, cy);
      this.list.add(icon);
      ix += MARK + 6;
    }
  }

  private towerIcon(x: number, y: number, id: TowerId, scale: number): Phaser.GameObjects.Container {
    const holder = this.add.container(x, y).setScale(scale);
    createTowerArt(this, holder, id);
    return holder;
  }

  /** Значок бактерии: тело нужного вида, вписанное в круг радиуса `radius` (по умолчанию — значок для ряда справа). */
  private bacteriumIcon(kind: BacteriumKind, x = 0, y = 0, radius = MARK / 2 - 2): Phaser.GameObjects.Container {
    const hp = CONFIG.types[kind].hp;
    const g = this.add.graphics();
    drawBody(g, kind, { hp, maxHp: hp, spread: 0, seed: 1 });
    g.setScale(radius / extentOf(kind));
    return this.add.container(x, y, [g]);
  }

  private leave(): void {
    if (this.from === 'game') {
      this.scene.stop();
      this.scene.resume('Game');
    } else {
      this.scene.start('Menu');
    }
  }
}
