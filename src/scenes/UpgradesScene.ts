import Phaser from 'phaser';
import { CONFIG } from '../config';
import { exposeMetaDebug, buyUpgrade, canBuy, metaDna, metaLevel, nextPrice, type MetaScreenInfo } from '../meta';
import { num, t, type TextKey } from '../i18n';
import { maxLevel, UPGRADE_IDS, type UpgradeId } from '../save';
import { sfx } from '../sound';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Раскладка: две колонки по две карточки, сверху заголовок и очки ДНК, снизу «Играть». Координаты — экран игры 1280×720, центры. */
const CARD = { w: 560, h: 190 };
const CARD_CENTERS = [
  { x: 340, y: 250 },
  { x: 940, y: 250 },
  { x: 340, y: 460 },
  { x: 940, y: 460 },
];
const BUY = { w: 250, h: 58 };
const PLAY = { x: W / 2, y: 640, w: 360, h: 76 };

const NAME_KEY: Record<UpgradeId, TextKey> = { lives: 'upgLives', coins: 'upgCoins', damage: 'upgDamage', reward: 'upgReward' };
const DESC_KEY: Record<UpgradeId, TextKey> = { lives: 'upgLivesDesc', coins: 'upgCoinsDesc', damage: 'upgDamageDesc', reward: 'upgRewardDesc' };

/** Что даёт улучшение на уровне level (суммарно): жизней и монет — числом, урон и награда — в процентах. */
function effectText(id: UpgradeId, level: number): string {
  const per = CONFIG.meta.upgrades[id].perLevel;
  const value = id === 'damage' || id === 'reward' ? Math.round(per * level * 100) : per * level;
  return t(DESC_KEY[id], { n: num(value) });
}

interface CardView {
  id: UpgradeId;
  center: { x: number; y: number };
  name: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  buyBg: Phaser.GameObjects.Graphics;
  buyLabel: Phaser.GameObjects.Text;
}

/**
 * Экран «Улучшения» (этап 6а, docs/upgrades.md): траты очков ДНК на четыре улучшения вне партии. Открывается с экрана конца уровня,
 * кнопка «Играть» запускает новую партию.
 */
export class UpgradesScene extends Phaser.Scene {
  private cards: CardView[] = [];
  private balance!: Phaser.GameObjects.Text;

  constructor() {
    super('Upgrades');
  }

  create(): void {
    this.cards = [];
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.text(W / 2, 52, t('upgradesTitle'), this.style(54, TEXT_COLORS.accent)).setOrigin(0.5);
    this.balance = this.add.text(W / 2, 112, '', this.style(34)).setOrigin(0.5);

    UPGRADE_IDS.forEach((id, i) => this.addCard(id, CARD_CENTERS[i]));
    this.addPlayButton();
    this.refresh();

    exposeMetaDebug(() => this.describe());
  }

  private addCard(id: UpgradeId, c: { x: number; y: number }): void {
    const x0 = c.x - CARD.w / 2;
    const y0 = c.y - CARD.h / 2;
    const g = this.add.graphics();
    g.fillStyle(0x14264b, 1).fillRoundedRect(x0, y0, CARD.w, CARD.h, 20);
    g.lineStyle(4, 0x3a5f9c, 1).strokeRoundedRect(x0, y0, CARD.w, CARD.h, 20);
    const name = this.add.text(x0 + 24, y0 + 18, t(NAME_KEY[id]), this.style(36, TEXT_COLORS.accent)).setOrigin(0, 0);
    const level = this.add.text(x0 + 24, y0 + 66, '', this.style(24, TEXT_COLORS.soft, false)).setOrigin(0, 0);
    const effect = this.add.text(x0 + 24, y0 + 98, '', this.style(24, TEXT_COLORS.main, false)).setOrigin(0, 0).setWordWrapWidth(CARD.w - 48);
    const buyX = x0 + CARD.w - 24 - BUY.w / 2;
    const buyY = y0 + CARD.h - 20 - BUY.h / 2;
    const buyBg = this.add.graphics();
    const buyLabel = this.add.text(buyX, buyY, '', this.style(28)).setOrigin(0.5);
    const zone = this.add.zone(buyX, buyY, BUY.w, BUY.h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.onBuy(id));
    this.cards.push({ id, center: c, name, level, effect, buyBg, buyLabel });
  }

  private addPlayButton(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2a8a4a, 1).fillRoundedRect(PLAY.x - PLAY.w / 2, PLAY.y - PLAY.h / 2, PLAY.w, PLAY.h, 18);
    g.lineStyle(4, COLORS.merge, 1).strokeRoundedRect(PLAY.x - PLAY.w / 2, PLAY.y - PLAY.h / 2, PLAY.w, PLAY.h, 18);
    this.add.text(PLAY.x, PLAY.y, t('upgPlay'), this.style(36)).setOrigin(0.5);
    this.add
      .zone(PLAY.x, PLAY.y, PLAY.w, PLAY.h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Game'));
  }

  private onBuy(id: UpgradeId): void {
    if (buyUpgrade(id)) {
      sfx.place();
      this.refresh();
      return;
    }
    // не хватает очков (или куплен наибольший уровень): красная вспышка числа очков
    sfx.denied();
    this.balance.setColor(TEXT_COLORS.bad);
    this.time.delayedCall(350, () => this.balance.setColor(TEXT_COLORS.main));
  }

  /** Перерисовывает очки, уровни, описания и кнопки покупки. */
  private refresh(): void {
    this.balance.setText(t('dnaBalance', { n: metaDna() }));
    for (const card of this.cards) {
      const level = metaLevel(card.id);
      const max = maxLevel(card.id);
      const price = nextPrice(card.id);
      card.level.setText(t('upgLevel', { n: level, max }));
      card.effect.setText(price === null ? effectText(card.id, level) : t('upgNext', { text: effectText(card.id, level + 1) }));
      const enabled = canBuy(card.id);
      const bx = card.center.x - CARD.w / 2 + CARD.w - 24 - BUY.w / 2;
      const by = card.center.y - CARD.h / 2 + CARD.h - 20 - BUY.h / 2;
      card.buyBg.clear();
      card.buyBg.fillStyle(enabled ? 0x2a8a4a : 0x2a3550, 1).fillRoundedRect(bx - BUY.w / 2, by - BUY.h / 2, BUY.w, BUY.h, 14);
      card.buyBg.lineStyle(3, enabled ? COLORS.merge : 0x4a5c82, 1).strokeRoundedRect(bx - BUY.w / 2, by - BUY.h / 2, BUY.w, BUY.h, 14);
      card.buyLabel.setText(price === null ? t('upgMax') : t('upgBuy', { n: price })).setColor(enabled ? TEXT_COLORS.main : TEXT_COLORS.dim);
    }
  }

  /** Описание экрана для проверок (`window.__pvbMeta`). */
  private describe(): MetaScreenInfo {
    return {
      visible: this.scene.isActive(),
      balance: this.balance.text,
      play: { x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h },
      cards: this.cards.map((c) => ({
        id: c.id,
        level: metaLevel(c.id),
        max: maxLevel(c.id),
        price: nextPrice(c.id),
        canBuy: canBuy(c.id),
        rect: { x: c.center.x, y: c.center.y, w: CARD.w, h: CARD.h },
        buy: { x: c.center.x - CARD.w / 2 + CARD.w - 24 - BUY.w / 2, y: c.center.y - CARD.h / 2 + CARD.h - 20 - BUY.h / 2, w: BUY.w, h: BUY.h },
        texts: [c.name.text, c.level.text, c.effect.text, c.buyLabel.text],
      })),
    };
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
