import Phaser from 'phaser';
import { CONFIG, type UpgradeBranch, type UpgradeEffect } from '../config';
import { exposeMetaDebug, branchUnlockLevel, buyUpgrade, canBuy, isBranchOpen, metaDna, metaLevel, nextPrice, type MetaScreenInfo } from '../meta';
import { num, t, type TextKey } from '../i18n';
import { maxLevel, UPGRADE_IDS, type UpgradeId } from '../save';
import { sfx } from '../sound';
import { drawLock, setScreenInfo } from '../screens';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Раскладка: сверху заголовок, очки ДНК и вкладки веток, под ними две колонки по две карточки, снизу «Играть» и «В меню». Координаты — экран игры 1280×720, центры. */
const CARD = { w: 560, h: 200 };
const CARD_CENTERS = [
  { x: 340, y: 275 },
  { x: 940, y: 275 },
  { x: 340, y: 482 },
  { x: 940, y: 482 },
];
const BUY = { w: 250, h: 48 };
/** Центр кнопки покупки: правый нижний угол карточки, под описанием (описание — до двух строк, кончается выше кнопки). */
const buyCenter = (c: { x: number; y: number }): { x: number; y: number } => ({ x: c.x + CARD.w / 2 - 24 - BUY.w / 2, y: c.y + CARD.h / 2 - 10 - BUY.h / 2 });
const PLAY = { x: W / 2 + 190, y: 640, w: 340, h: 76 };
const MENU = { x: W / 2 - 190, y: 640, w: 340, h: 76 };

/** Ветки (вкладки) в порядке строк таблицы улучшений. */
const BRANCHES: UpgradeBranch[] = Array.from(new Set(UPGRADE_IDS.map((id) => CONFIG.meta.upgrades[id].branch)));
const TAB = { w: 190, h: 46, y: 140, gap: 10 };
const tabCenter = (i: number): { x: number; y: number } => ({ x: W / 2 - (BRANCHES.length * TAB.w + (BRANCHES.length - 1) * TAB.gap) / 2 + TAB.w / 2 + i * (TAB.w + TAB.gap), y: TAB.y });

/** Подпись вкладки: «Организм», «Защита» или название башни. */
function tabLabel(branch: UpgradeBranch): string {
  if (branch === 'body') return t('upgTabBody');
  if (branch === 'defense') return t('upgTabDefense');
  return t(`tower${branch[0].toUpperCase()}${branch.slice(1)}` as TextKey);
}

/** Вкладка, открытая в прошлый раз (в пределах одной загрузки страницы). */
let lastBranch: UpgradeBranch = BRANCHES[0];

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
    case 'damage': case 'reward': case 'price': case 'cooldown': case 'range': case 'blast': case 'puddleSec': case 'puddleRadius':
      value = Math.round(Math.abs(total) * 100);
      break;
    default:
      value = total;
  }
  return t(descKey(spec.effect), { n: num(value) });
}

interface CardView {
  id: UpgradeId;
  branch: UpgradeBranch;
  center: { x: number; y: number };
  name: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  buyBg: Phaser.GameObjects.Graphics;
  buyLabel: Phaser.GameObjects.Text;
  /** Всё, что рисует карточка: прячется вместе с вкладкой. */
  parts: Phaser.GameObjects.GameObject[];
  zone: Phaser.GameObjects.Zone;
}

interface TabView {
  branch: UpgradeBranch;
  center: { x: number; y: number };
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/**
 * Экран «Улучшения» (этапы 6а и 6б, docs/upgrades.md): траты очков ДНК на улучшения вне партии. Вкладки — ветки древа (Организм, Защита, по башне на каждую);
 * на вкладке до четырёх карточек. Ветка башни закрыта, пока не открыт уровень, на котором башня становится доступной. Открывается с экрана конца уровня
 * и из главного меню, кнопка «Играть» запускает партию.
 */
export class UpgradesScene extends Phaser.Scene {
  private cards: CardView[] = [];
  private tabs: TabView[] = [];
  private active: UpgradeBranch = BRANCHES[0];
  private balance!: Phaser.GameObjects.Text;
  /** Откуда пришли: 'menu' — из главного меню («Играть» ведёт на выбор уровня); иначе с экрана конца уровня («Играть» начинает новую партию того же уровня). */
  private from: 'menu' | 'game' = 'game';

  constructor() {
    super('Upgrades');
  }

  init(data?: { from?: 'menu' | 'game' }): void {
    this.from = data?.from === 'menu' ? 'menu' : 'game';
  }

  create(): void {
    this.cards = [];
    this.tabs = [];
    this.active = lastBranch;
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.text(W / 2, 40, t('upgradesTitle'), this.style(46, TEXT_COLORS.accent)).setOrigin(0.5);
    this.balance = this.add.text(W / 2, 88, '', this.style(30)).setOrigin(0.5);

    BRANCHES.forEach((branch, i) => this.addTab(branch, tabCenter(i)));
    for (const branch of BRANCHES) {
      UPGRADE_IDS.filter((id) => CONFIG.meta.upgrades[id].branch === branch).forEach((id, i) => this.addCard(id, branch, CARD_CENTERS[Math.min(i, CARD_CENTERS.length - 1)]));
    }
    this.addPlayButton();
    this.refresh();

    exposeMetaDebug(() => this.describe());
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'upgrades', buttons: { play: PLAY, menu: MENU }, texts: [this.balance.text] } : null));
  }

  private addTab(branch: UpgradeBranch, c: { x: number; y: number }): void {
    const bg = this.add.graphics();
    const label = this.add.text(c.x, c.y, tabLabel(branch), this.style(26)).setOrigin(0.5);
    this.add.zone(c.x, c.y, TAB.w, TAB.h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectTab(branch));
    this.tabs.push({ branch, center: c, bg, label });
  }

  private selectTab(branch: UpgradeBranch): void {
    if (branch === this.active) return;
    this.active = branch;
    lastBranch = branch;
    sfx.place();
    this.refresh();
  }

  private addCard(id: UpgradeId, branch: UpgradeBranch, c: { x: number; y: number }): void {
    const x0 = c.x - CARD.w / 2;
    const y0 = c.y - CARD.h / 2;
    const g = this.add.graphics();
    g.fillStyle(0x14264b, 1).fillRoundedRect(x0, y0, CARD.w, CARD.h, 20);
    g.lineStyle(4, 0x3a5f9c, 1).strokeRoundedRect(x0, y0, CARD.w, CARD.h, 20);
    const name = this.add.text(x0 + 24, y0 + 12, t(nameKey(id)), this.style(34, TEXT_COLORS.accent)).setOrigin(0, 0);
    const level = this.add.text(x0 + 24, y0 + 54, '', this.style(22, TEXT_COLORS.soft, false)).setOrigin(0, 0);
    const effect = this.add.text(x0 + 24, y0 + 82, '', this.style(22, TEXT_COLORS.main, false)).setOrigin(0, 0).setWordWrapWidth(CARD.w - 48);
    const { x: buyX, y: buyY } = buyCenter(c);
    const buyBg = this.add.graphics();
    const buyLabel = this.add.text(buyX, buyY, '', this.style(26)).setOrigin(0.5);
    const zone = this.add.zone(buyX, buyY, BUY.w, BUY.h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.onBuy(id));
    this.cards.push({ id, branch, center: c, name, level, effect, buyBg, buyLabel, parts: [g, name, level, effect, buyBg, buyLabel], zone });
  }

  private addPlayButton(): void {
    this.addBottomButton(PLAY, t('upgPlay'), 0x2a8a4a, COLORS.merge, () => this.scene.start(this.from === 'menu' ? 'Levels' : 'Game'));
    this.addBottomButton(MENU, t('toMenu'), 0x2a3550, 0x4a5c82, () => this.scene.start('Menu'));
  }

  private addBottomButton(r: { x: number; y: number; w: number; h: number }, label: string, fill: number, line: number, onTap: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    g.lineStyle(4, line, 1).strokeRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    this.add.text(r.x, r.y, label, this.style(36)).setOrigin(0.5);
    this.add.zone(r.x, r.y, r.w, r.h).setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
  }

  private onBuy(id: UpgradeId): void {
    if (buyUpgrade(id)) {
      sfx.place();
      this.refresh();
      return;
    }
    // не хватает очков, ветка закрыта или куплен наибольший уровень: красная вспышка числа очков
    sfx.denied();
    this.balance.setColor(TEXT_COLORS.bad);
    this.time.delayedCall(350, () => this.balance.setColor(TEXT_COLORS.main));
  }

  private isLocked(card: CardView): boolean {
    return !isBranchOpen(card.branch);
  }

  /** Перерисовывает очки, вкладки, карточки выбранной вкладки (уровни, описания, кнопки покупки). */
  private refresh(): void {
    this.balance.setText(t('dnaBalance', { n: metaDna() }));
    for (const tab of this.tabs) this.drawTab(tab);
    for (const card of this.cards) {
      const shown = card.branch === this.active;
      for (const part of card.parts) (part as Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }).setVisible(shown);
      if (card.zone.input) card.zone.input.enabled = shown;
      if (!shown) continue;
      const level = metaLevel(card.id);
      const max = maxLevel(card.id);
      const price = nextPrice(card.id);
      const locked = this.isLocked(card);
      card.level.setText(t('upgLevel', { n: level, max }));
      card.effect.setText(price === null ? effectText(card.id, level) : t('upgNext', { text: effectText(card.id, level + 1) }));
      const enabled = canBuy(card.id);
      const { x: bx, y: by } = buyCenter(card.center);
      card.buyBg.clear();
      card.buyBg.fillStyle(enabled ? 0x2a8a4a : 0x2a3550, 1).fillRoundedRect(bx - BUY.w / 2, by - BUY.h / 2, BUY.w, BUY.h, 14);
      card.buyBg.lineStyle(3, enabled ? COLORS.merge : 0x4a5c82, 1).strokeRoundedRect(bx - BUY.w / 2, by - BUY.h / 2, BUY.w, BUY.h, 14);
      const label = locked ? t('upgLocked', { n: branchUnlockLevel(card.branch) }) : price === null ? t('upgMax') : t('upgBuy', { n: price });
      card.buyLabel.setText(label).setColor(enabled ? TEXT_COLORS.main : TEXT_COLORS.dim);
      // длинная надпись («Откроется на уровне 10») уменьшается, пока не поместится в кнопку
      let size = 26;
      card.buyLabel.setFontSize(size);
      while (card.buyLabel.width > BUY.w - 24 && size > 14) card.buyLabel.setFontSize((size -= 2));
    }
  }

  private drawTab(tab: TabView): void {
    const open = isBranchOpen(tab.branch);
    const on = tab.branch === this.active;
    const { x, y } = tab.center;
    tab.bg.clear();
    tab.bg.fillStyle(on ? 0x2a5aa8 : 0x14264b, 1).fillRoundedRect(x - TAB.w / 2, y - TAB.h / 2, TAB.w, TAB.h, 14);
    tab.bg.lineStyle(3, on ? COLORS.merge : 0x3a5f9c, 1).strokeRoundedRect(x - TAB.w / 2, y - TAB.h / 2, TAB.w, TAB.h, 14);
    tab.label.setColor(open ? TEXT_COLORS.main : TEXT_COLORS.dim);
    if (!open) drawLock(tab.bg, x - TAB.w / 2 + 24, y - 1, 16);
    tab.label.setX(open ? x : x + 12);
  }

  /** Описание экрана для проверок (`window.__pvbMeta`): вкладки и карточки выбранной вкладки. */
  private describe(): MetaScreenInfo {
    return {
      visible: this.scene.isActive(),
      balance: this.balance.text,
      activeTab: this.active,
      tabs: this.tabs.map((tab) => ({
        branch: tab.branch,
        locked: !isBranchOpen(tab.branch),
        unlockLevel: branchUnlockLevel(tab.branch),
        label: tab.label.text,
        rect: { x: tab.center.x, y: tab.center.y, w: TAB.w, h: TAB.h },
      })),
      play: { x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h },
      cards: this.cards
        .filter((c) => c.branch === this.active)
        .map((c) => ({
          id: c.id,
          level: metaLevel(c.id),
          max: maxLevel(c.id),
          price: nextPrice(c.id),
          canBuy: canBuy(c.id),
          locked: this.isLocked(c),
          fits: this.textFits(c),
          rect: { x: c.center.x, y: c.center.y, w: CARD.w, h: CARD.h },
          buy: { ...buyCenter(c.center), w: BUY.w, h: BUY.h },
          texts: [c.name.text, c.level.text, c.effect.text, c.buyLabel.text],
        })),
    };
  }

  /** Тексты карточки помещаются: название и уровень — по ширине карточки, описание — по ширине и выше кнопки покупки. */
  private textFits(c: CardView): boolean {
    const right = c.center.x + CARD.w / 2 - 16;
    const buyTop = buyCenter(c.center).y - BUY.h / 2;
    return c.name.x + c.name.width <= right && c.level.x + c.level.width <= right && c.effect.x + c.effect.width <= right && c.effect.y + c.effect.height <= buyTop - 2 && c.buyLabel.width <= BUY.w - 12;
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
