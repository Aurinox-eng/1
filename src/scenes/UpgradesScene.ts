import Phaser from 'phaser';
import { CONFIG, type UpgradeEffect } from '../config';
import { exposeMetaDebug, branchUnlockLevel, buyUpgrade, canBuy, isBranchOpen, isNodeOpen, metaDna, metaLevel, nextPrice, requirementMet, requirementOf, type MetaScreenInfo } from '../meta';
import { num, t, type TextKey } from '../i18n';
import { maxLevel, UPGRADE_IDS, type UpgradeId } from '../save';
import { sfx } from '../sound';
import { drawLock, setScreenInfo } from '../screens';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Раскладка (экран игры 1280×720): сверху заголовок и очки ДНК; слева окно дерева (прокручивается пальцем и колесом), справа карточка выбранного узла; снизу «Играть» и «В меню». */
const VIEW = { x: 20, y: 124, w: 850, h: 476 };
const DETAIL = { x: 890, y: 124, w: 370, h: 476 };
const BUY = { w: 330, h: 56 };
const BUY_CENTER = { x: DETAIL.x + DETAIL.w / 2, y: DETAIL.y + DETAIL.h - 16 - BUY.h / 2 };
const PLAY = { x: W / 2 + 190, y: 650, w: 340, h: 76 };
const MENU = { x: W / 2 - 190, y: 650, w: 340, h: 76 };
/** Узел дерева: радиус круга, шаг сетки по колонкам и рядам, отступ от левого и верхнего края окна, пикселей. */
const NODE_R = 36;
const STEP = { x: 215, y: 105 };
const ORIGIN = { x: 90, y: 56 };
/** Касание короче этого и не дальше этого от места нажатия — тап (выбор узла), иначе — прокрутка. */
const TAP_MAX_MOVE = 12;

/** Ключ названия улучшения: `upg` + id с заглавной буквы (`lives` → `upgLives`). */
const nameKey = (id: UpgradeId): TextKey => `upg${id[0].toUpperCase()}${id.slice(1)}` as TextKey;
/** Ключ описания по действию улучшения (`UpgradeEffect`): у 6а — `upgLivesDesc` и т. д., у остальных — `upgDesc` + действие с заглавной буквы. */
const DESC_KEY: Partial<Record<UpgradeEffect, TextKey>> = { lives: 'upgLivesDesc', coins: 'upgCoinsDesc', damage: 'upgDamageDesc', reward: 'upgRewardDesc' };
const descKey = (effect: UpgradeEffect): TextKey => DESC_KEY[effect] ?? (`upgDesc${effect[0].toUpperCase()}${effect.slice(1)}` as TextKey);

/** Что даёт улучшение на уровне level (суммарно): числом (жизни, монеты, щит, удары, пиксели), процентами (урон, награда, цена, пауза, радиусы, время лужи, возврат) или множителем (скорость в луже). */
function effectText(id: UpgradeId, level: number): string {
  const spec = CONFIG.meta.upgrades[id];
  const total = spec.perLevel * level;
  let value: number;
  switch (spec.effect) {
    case 'sellRefund':
      value = Math.round((CONFIG.economy.sellRefund + total) * 100);
      break;
    case 'slowFactor':
      value = Math.round(Math.max(CONFIG.meta.minSlowFactor, CONFIG.towers.syrup.slowFactor + total) * 100) / 100;
      break;
    case 'damage': case 'towerDamage': case 'reward': case 'price': case 'cooldown': case 'range': case 'blast': case 'puddleSec': case 'puddleRadius':
      value = Math.round(Math.abs(total) * 100);
      break;
    default:
      value = total;
  }
  return t(descKey(spec.effect), { n: num(value) });
}

/** Центр узла в координатах содержимого дерева (до прокрутки). */
function nodeCenter(id: UpgradeId): { x: number; y: number } {
  const [col, row] = CONFIG.meta.treePos[id] ?? [0, 0];
  return { x: ORIGIN.x + col * STEP.x, y: ORIGIN.y + row * STEP.y };
}

const CONTENT_H = Math.max(...UPGRADE_IDS.map((id) => nodeCenter(id).y)) + NODE_R + 52;

interface NodeView {
  id: UpgradeId;
  gfx: Phaser.GameObjects.Graphics;
  level: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

/**
 * Экран «Улучшения» — дерево (docs/upgrades.md, часть 3, решение владельца 8 октября 2026): узлы-кружки, линии к родителю, закрытые узлы затемнены.
 * Тап по узлу выбирает его, справа — название, что даст следующий уровень, условие открытия и кнопка покупки. Дерево двигается пальцем и колесом мыши.
 * Ветка башни закрыта, пока не открыт уровень, на котором башня становится доступной. Открывается с экрана конца уровня и из главного меню.
 */
export class UpgradesScene extends Phaser.Scene {
  private nodes: NodeView[] = [];
  private selected: UpgradeId = UPGRADE_IDS[0];
  private scrollY = 0;
  private world!: Phaser.GameObjects.Container;
  private edges!: Phaser.GameObjects.Graphics;
  private balance!: Phaser.GameObjects.Text;
  private detailName!: Phaser.GameObjects.Text;
  private detailLevel!: Phaser.GameObjects.Text;
  private detailEffect!: Phaser.GameObjects.Text;
  private detailNeed!: Phaser.GameObjects.Text;
  private buyBg!: Phaser.GameObjects.Graphics;
  private buyLabel!: Phaser.GameObjects.Text;
  /** Откуда пришли: 'menu' — из главного меню («Играть» ведёт на выбор уровня); иначе с экрана конца уровня («Играть» начинает новую партию того же уровня). */
  private from: 'menu' | 'game' = 'game';
  private dragFrom: { x: number; y: number; scroll: number; moved: boolean } | null = null;

  constructor() {
    super('Upgrades');
  }

  init(data?: { from?: 'menu' | 'game' }): void {
    this.from = data?.from === 'menu' ? 'menu' : 'game';
  }

  create(): void {
    this.nodes = [];
    this.scrollY = 0;
    this.selected = UPGRADE_IDS[0];
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.text(W / 2, 40, t('upgradesTitle'), this.style(46, TEXT_COLORS.accent)).setOrigin(0.5);
    this.balance = this.add.text(W / 2, 88, '', this.style(30)).setOrigin(0.5);

    // Окно дерева: рамка и прокручиваемое содержимое под маской
    const frame = this.add.graphics();
    frame.fillStyle(0x0e1b38, 1).fillRoundedRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 16);
    frame.lineStyle(3, 0x3a5f9c, 1).strokeRoundedRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 16);
    this.world = this.add.container(VIEW.x, VIEW.y);
    const mask = this.make.graphics({ x: 0, y: 0 }, false);
    mask.fillStyle(0xffffff, 1).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    this.world.setMask(mask.createGeometryMask());
    this.edges = this.add.graphics();
    this.world.add(this.edges);
    for (const id of UPGRADE_IDS) this.addNode(id);

    // Нажатие и прокрутка: короткое касание — выбор узла, движение — прокрутка
    const area = this.add.zone(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2, VIEW.w, VIEW.h).setInteractive();
    area.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragFrom = { x: p.x, y: p.y, scroll: this.scrollY, moved: false };
    });
    area.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.dragFrom;
      if (!d || !p.isDown) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_MAX_MOVE) d.moved = true;
      if (d.moved) this.setScroll(d.scroll - (p.y - d.y));
    });
    const release = (p: Phaser.Input.Pointer): void => {
      const d = this.dragFrom;
      this.dragFrom = null;
      if (d && !d.moved) this.tapAt(p.x, p.y);
    };
    area.on('pointerup', release);
    area.on('pointerupoutside', () => (this.dragFrom = null));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.setScroll(this.scrollY + dy));

    this.buildDetail();
    this.addBottomButton(PLAY, t('upgPlay'), 0x2a8a4a, COLORS.merge, () => this.scene.start(this.from === 'menu' ? 'Levels' : 'Game'));
    this.addBottomButton(MENU, t('toMenu'), 0x2a3550, 0x4a5c82, () => this.scene.start('Menu'));
    this.drawEdges();
    this.refresh();

    exposeMetaDebug(() => this.describe());
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'upgrades', buttons: { play: PLAY, menu: MENU }, texts: [this.balance.text] } : null));
  }

  private addNode(id: UpgradeId): void {
    const c = nodeCenter(id);
    const gfx = this.add.graphics().setPosition(c.x, c.y);
    const level = this.add.text(c.x, c.y, '', this.style(22)).setOrigin(0.5);
    const label = this.add.text(c.x, c.y + NODE_R + 6, t(nameKey(id)), { ...this.style(17, TEXT_COLORS.main, false), align: 'center', wordWrap: { width: STEP.x - 24 } }).setOrigin(0.5, 0);
    this.world.add([gfx, level, label]);
    this.nodes.push({ id, gfx, level, label });
  }

  private buildDetail(): void {
    const g = this.add.graphics();
    g.fillStyle(0x14264b, 1).fillRoundedRect(DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h, 16);
    g.lineStyle(3, 0x3a5f9c, 1).strokeRoundedRect(DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h, 16);
    const x = DETAIL.x + 20;
    const ww = DETAIL.w - 40;
    this.detailName = this.add.text(x, DETAIL.y + 18, '', { ...this.style(30, TEXT_COLORS.accent), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.detailLevel = this.add.text(x, DETAIL.y + 100, '', this.style(22, TEXT_COLORS.soft, false)).setOrigin(0, 0);
    this.detailEffect = this.add.text(x, DETAIL.y + 136, '', { ...this.style(22, TEXT_COLORS.main, false), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.detailNeed = this.add.text(x, DETAIL.y + 240, '', { ...this.style(21, TEXT_COLORS.bad, false), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.buyBg = this.add.graphics();
    this.buyLabel = this.add.text(BUY_CENTER.x, BUY_CENTER.y, '', this.style(26)).setOrigin(0.5);
    this.add.zone(BUY_CENTER.x, BUY_CENTER.y, BUY.w, BUY.h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onBuy(this.selected));
  }

  private addBottomButton(r: { x: number; y: number; w: number; h: number }, label: string, fill: number, line: number, onTap: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    g.lineStyle(4, line, 1).strokeRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    this.add.text(r.x, r.y, label, this.style(36)).setOrigin(0.5);
    this.add.zone(r.x, r.y, r.w, r.h).setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
  }

  private setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, Math.max(0, CONTENT_H - VIEW.h));
    this.world.y = VIEW.y - this.scrollY;
  }

  /** Тап по окну дерева: ближайший узел в пределах круга (с запасом под палец) становится выбранным. */
  private tapAt(sx: number, sy: number): void {
    const cx = sx - VIEW.x;
    const cy = sy - VIEW.y + this.scrollY;
    let best: UpgradeId | null = null;
    let bestD = NODE_R + 14;
    for (const id of UPGRADE_IDS) {
      const c = nodeCenter(id);
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best && best !== this.selected) {
      this.selected = best;
      sfx.select();
      this.refresh();
    }
  }

  private onBuy(id: UpgradeId): void {
    if (buyUpgrade(id)) {
      sfx.place();
      this.refresh();
      return;
    }
    // не хватает очков, узел закрыт или куплен наибольший уровень: красная вспышка числа очков
    sfx.denied();
    this.balance.setColor(TEXT_COLORS.bad);
    this.time.delayedCall(350, () => this.balance.setColor(TEXT_COLORS.main));
  }

  /** Линии от родителя к узлу: зелёные, если узел открыт, иначе серые. */
  private drawEdges(): void {
    this.edges.clear();
    for (const id of UPGRADE_IDS) {
      const req = requirementOf(id);
      if (!req) continue;
      const a = nodeCenter(req.id);
      const b = nodeCenter(id);
      const open = isNodeOpen(id);
      this.edges.lineStyle(open ? 5 : 3, open ? COLORS.merge : 0x4a5c82, open ? 0.9 : 0.7);
      const mid = (a.x + b.x) / 2;
      this.edges.beginPath().moveTo(a.x + NODE_R, a.y).lineTo(mid, a.y).lineTo(mid, b.y).lineTo(b.x - NODE_R, b.y).strokePath();
    }
  }

  /** Перерисовывает очки, линии, узлы и карточку выбранного узла. */
  private refresh(): void {
    this.balance.setText(t('dnaBalance', { n: metaDna() }));
    this.drawEdges();
    for (const n of this.nodes) this.drawNode(n);
    this.refreshDetail();
  }

  private drawNode(n: NodeView): void {
    const id = n.id;
    const level = metaLevel(id);
    const max = maxLevel(id);
    const open = isNodeOpen(id);
    const maxed = level >= max;
    const can = canBuy(id);
    const g = n.gfx;
    g.clear();
    const fill = maxed ? 0x6a5a18 : open ? 0x1d366a : 0x1a2338;
    const edge = maxed ? COLORS.gold : can ? COLORS.merge : open ? 0x5a8fd8 : 0x3a4560;
    g.fillStyle(fill, 1).fillCircle(0, 0, NODE_R);
    g.lineStyle(id === this.selected ? 7 : 4, id === this.selected ? 0xffffff : edge, 1).strokeCircle(0, 0, NODE_R);
    if (id === this.selected) g.lineStyle(3, edge, 1).strokeCircle(0, 0, NODE_R - 6);
    if (!open) drawLock(g, 0, -2, 16);
    n.level.setText(open ? `${level}/${max}` : '').setColor(maxed ? TEXT_COLORS.accent : TEXT_COLORS.main);
    n.label.setColor(open ? TEXT_COLORS.main : TEXT_COLORS.dim);
  }

  private refreshDetail(): void {
    const id = this.selected;
    const spec = CONFIG.meta.upgrades[id];
    const level = metaLevel(id);
    const price = nextPrice(id);
    this.detailName.setText(t(nameKey(id)));
    this.detailLevel.setText(t('upgLevel', { n: level, max: maxLevel(id) }));
    this.detailEffect.setText(price === null ? effectText(id, level) : t('upgNext', { text: effectText(id, level + 1) }));
    // условие открытия: ветка башни по уровню карты, родитель по дереву
    const lines: string[] = [];
    if (!isBranchOpen(spec.branch)) lines.push(t('upgLocked', { n: branchUnlockLevel(spec.branch) }));
    const req = requirementOf(id);
    if (req && !requirementMet(id)) lines.push(t('upgRequires', { name: t(nameKey(req.id)), n: req.level }));
    this.detailNeed.setText(lines.join('\n'));
    const open = isNodeOpen(id);
    const enabled = canBuy(id);
    this.buyBg.clear();
    this.buyBg.fillStyle(enabled ? 0x2a8a4a : 0x2a3550, 1).fillRoundedRect(BUY_CENTER.x - BUY.w / 2, BUY_CENTER.y - BUY.h / 2, BUY.w, BUY.h, 14);
    this.buyBg.lineStyle(3, enabled ? COLORS.merge : 0x4a5c82, 1).strokeRoundedRect(BUY_CENTER.x - BUY.w / 2, BUY_CENTER.y - BUY.h / 2, BUY.w, BUY.h, 14);
    const label = price === null ? t('upgMax') : !open ? t('upgClosed') : t('upgBuy', { n: price });
    this.buyLabel.setText(label).setColor(enabled ? TEXT_COLORS.main : TEXT_COLORS.dim);
    let size = 26;
    this.buyLabel.setFontSize(size);
    while (this.buyLabel.width > BUY.w - 24 && size > 14) this.buyLabel.setFontSize((size -= 2));
  }

  /** Описание экрана для проверок (`window.__pvbMeta`): все узлы с положением на экране, выбранный узел и его карточка. */
  private describe(): MetaScreenInfo {
    const id = this.selected;
    return {
      visible: this.scene.isActive(),
      balance: this.balance.text,
      selected: id,
      scroll: this.scrollY,
      view: { ...VIEW },
      nodes: UPGRADE_IDS.map((nid) => {
        const c = nodeCenter(nid);
        const y = VIEW.y + c.y - this.scrollY;
        const x = VIEW.x + c.x;
        return {
          id: nid,
          level: metaLevel(nid),
          max: maxLevel(nid),
          price: nextPrice(nid),
          canBuy: canBuy(nid),
          open: isNodeOpen(nid),
          onScreen: y - NODE_R >= VIEW.y && y + NODE_R <= VIEW.y + VIEW.h,
          rect: { x, y, w: NODE_R * 2, h: NODE_R * 2 },
        };
      }),
      detail: {
        texts: [this.detailName.text, this.detailLevel.text, this.detailEffect.text, this.detailNeed.text, this.buyLabel.text],
        buy: { x: BUY_CENTER.x, y: BUY_CENTER.y, w: BUY.w, h: BUY.h },
        fits: this.detailFits(),
      },
      play: { x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h },
    };
  }

  /** Тексты карточки помещаются: название — не выше уровня, описание и условие — выше кнопки покупки, надпись кнопки — по её ширине. */
  private detailFits(): boolean {
    const buyTop = BUY_CENTER.y - BUY.h / 2;
    return (
      this.detailName.y + this.detailName.height <= this.detailLevel.y &&
      this.detailEffect.y + this.detailEffect.height <= this.detailNeed.y &&
      this.detailNeed.y + this.detailNeed.height <= buyTop - 2 &&
      this.buyLabel.width <= BUY.w - 12
    );
  }

  private style(size: number, color: string = TEXT_COLORS.main, stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
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
}
