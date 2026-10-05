import Phaser from 'phaser';
import { CONFIG, type KindId } from '../config';
import { t, type TextKey } from '../i18n';
import { isLevelOpen, levelBest, levelStars } from '../meta';
import { levelNewKinds, levelNewTowers } from '../progress';
import { addButton, drawLock, drawStar, setScreenInfo, textStyle, type LevelCardInfo, type Rect } from '../screens';
import { sfx } from '../sound';
import { COLORS, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Раскладка: пять карточек в ряд, два ряда; сверху заголовок, снизу «Назад». Координаты — экран игры 1280×720. */
const CARD = { w: 220, h: 240, gap: 30, cols: 5, left: 30, top: 110, rowGap: 24 };

const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const levelName = (level: number): string => t(`levelName${level}` as TextKey);
const kindName = (kind: KindId): string => t(`bacName${cap(kind)}` as TextKey);
const towerName = (id: string): string => t(`tower${cap(id)}` as TextKey);

/** Выбор уровня: 10 карточек (номер, название, что нового, звёзды или замок), тап по открытой начинает партию, по закрытой — «нельзя». */
export class LevelsScene extends Phaser.Scene {
  private cards: LevelCardInfo[] = [];
  private back!: Rect;

  constructor() {
    super('Levels');
  }

  create(): void {
    this.cards = [];
    this.cameras.main.setBackgroundColor(COLORS.background);
    const title = this.add.text(W / 2, 54, t('levelsTitle'), textStyle(50, TEXT_COLORS.accent)).setOrigin(0.5);
    for (let level = 1; level <= CONFIG.levels.count; level++) this.addCard(level);
    this.back = addButton(this, { x: 150, y: 668, w: 240, h: 60, label: t('back'), fontSize: 30, fill: 0x2a3550, line: 0x4a5c82, onTap: () => this.scene.start('Menu') });
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'levels', buttons: { back: this.back }, texts: [title.text], levels: this.cards } : null));
  }

  private addCard(level: number): void {
    const i = level - 1;
    const col = i % CARD.cols;
    const row = Math.floor(i / CARD.cols);
    const x0 = CARD.left + col * (CARD.w + CARD.gap);
    const y0 = CARD.top + row * (CARD.h + CARD.rowGap);
    const cx = x0 + CARD.w / 2;
    const open = isLevelOpen(level);
    const stars = levelStars(level);
    const best = levelBest(level);
    const g = this.add.graphics();
    g.fillStyle(open ? 0x14264b : 0x1a1f2e, 1).fillRoundedRect(x0, y0, CARD.w, CARD.h, 20);
    g.lineStyle(4, !open ? 0x2c3448 : stars > 0 ? COLORS.gold : 0x3a5f9c, 1).strokeRoundedRect(x0, y0, CARD.w, CARD.h, 20);

    const texts: string[] = [];
    const add = (y: number, text: string, size: number, color: string, wrap = false): Phaser.GameObjects.Text => {
      const obj = this.add.text(cx, y, text, textStyle(size, color, false)).setOrigin(0.5, 0);
      if (wrap) obj.setWordWrapWidth(CARD.w - 24).setAlign('center');
      texts.push(text);
      return obj;
    };
    add(y0 + 14, t('levelLabel', { n: level }), 30, open ? TEXT_COLORS.main : TEXT_COLORS.dim);
    add(y0 + 54, levelName(level), 26, open ? TEXT_COLORS.accent : TEXT_COLORS.dim);

    if (!open) {
      add(y0 + 100, t('levelLocked', { n: level - 1 }), 20, TEXT_COLORS.dim, true);
      drawLock(g, cx, y0 + CARD.h - 50, 44);
    } else {
      let y = y0 + 96;
      const towers = levelNewTowers(level);
      if (towers.length > 0) {
        add(y, t('levelOpens', { names: towers.map(towerName).join(', ') }), 20, TEXT_COLORS.soft, true);
        y += 50;
      }
      const kinds = levelNewKinds(level);
      if (kinds.length > 0) add(y, t('levelNewBac', { names: kinds.map(kindName).join(', ') }), 20, TEXT_COLORS.soft, true);
      if (stars === 0 && best > 0) add(y0 + CARD.h - 84, t('levelBest', { n: best }), 20, TEXT_COLORS.bad);
      for (let s = 0; s < 3; s++) drawStar(g, cx + (s - 1) * 56, y0 + CARD.h - 40, 22, s < stars);
    }
    this.add
      .zone(cx, y0 + CARD.h / 2, CARD.w, CARD.h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (isLevelOpen(level)) {
          sfx.place();
          this.scene.start('Game', { level });
        } else {
          sfx.denied();
        }
      });
    this.cards.push({ level, open, stars, best, rect: { x: cx, y: y0 + CARD.h / 2, w: CARD.w, h: CARD.h }, texts });
  }
}
