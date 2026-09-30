import Phaser from 'phaser';
import { CONFIG } from '../config';
import { t, type TextKey } from '../i18n';
import { createTowerArt } from '../objects/Tower';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;
const PANEL_W = CONFIG.map.panelW;
/** Левый край панели = ширина окна карты. */
export const VIEW_W = W - PANEL_W;
const PX = VIEW_W;
const CX = PX + PANEL_W / 2;
/** Слои интерфейса: панель ниже всплывающих подсказок, а те — ниже экранов паузы и конца уровня (глубина 200). */
const D = { panel: 100, item: 101, chip: 96, toast: 105 };

/** Закрытые кнопки (открываются на следующих этапах): только названия. */
const LOCKED_SLOTS: TextKey[] = ['towerSyrup', 'towerFizz', 'towerCapsule'];
const SLOT = { x: PX + 12, y0: 158, w: PANEL_W - 24, h: 104, gap: 8 };

/** Сердце по точкам классической кривой; центр — (cx, cy), k — размер. */
function heartPoints(cx: number, cy: number, k: number): Phaser.Types.Math.Vector2Like[] {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = 16 * Math.sin(a) ** 3;
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    pts.push({ x: cx + x * k, y: cy + (y - 2.5) * k });
  }
  return pts;
}

export interface PanelCallbacks {
  /** Тап по кнопке башни. */
  onTower: () => void;
  /** Тап по кнопке паузы. */
  onPause: () => void;
}

/**
 * Правая панель: волна, монеты, жизни, кнопки башен, пауза. Лежит поверх карты и не двигается.
 * Тут же — подсказка «◀ Организм» у левого края (когда организм за краем экрана) и всплывающие сообщения.
 */
export class Panel {
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly nextWaveText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly coinsText: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Graphics;
  private readonly slotGfx: Phaser.GameObjects.Graphics;
  private readonly priceText: Phaser.GameObjects.Text;
  private readonly chip: Phaser.GameObjects.Container;
  private readonly chipBg: Phaser.GameObjects.Graphics;
  private readonly toastText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private selected = false;
  private lives = 0;
  private chipDanger: boolean | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    callbacks: PanelCallbacks,
  ) {
    // Фон панели и её левая граница
    scene.add.rectangle(PX + PANEL_W / 2, H / 2, PANEL_W, H, COLORS.panel, 0.97).setDepth(D.panel);
    scene.add.rectangle(PX + 1.5, H / 2, 3, H, COLORS.panelLine, 1).setDepth(D.item);

    // Волна и полоска прогресса
    this.waveText = this.text(CX, 22, '', 21);
    this.bar = scene.add.graphics().setDepth(D.item);
    this.nextWaveText = this.text(CX, 60, '', 13, TEXT_COLORS.dim);

    // Монеты
    this.coin(PX + 44, 90, 16);
    this.coinsText = this.text(PX + 72, 90, '0', 32, TEXT_COLORS.accent, 0, 0.5);

    // Жизни
    this.hearts = scene.add.graphics().setDepth(D.item);

    // Кнопка башни «Таблетка» и закрытые кнопки
    this.slotGfx = scene.add.graphics().setDepth(D.item);
    const first = this.slotRect(0);
    const icon = scene.add.container(first.x + 38, first.y + first.h / 2).setDepth(D.item).setScale(0.68);
    createTowerArt(scene, icon);
    this.text(first.x + 74, first.y + 28, t('towerPill'), 18, TEXT_COLORS.main, 0, 0.5);
    this.coin(first.x + 84, first.y + 74, 10);
    this.priceText = this.text(first.x + 100, first.y + 74, String(CONFIG.towers.pill.price), 25, TEXT_COLORS.accent, 0, 0.5);
    LOCKED_SLOTS.forEach((key, i) => {
      const r = this.slotRect(i + 1);
      this.lock(r.x + 38, r.y + 40);
      this.text(r.x + 74, r.y + 28, t(key), 18, TEXT_COLORS.dim, 0, 0.5);
      this.text(r.x + 74, r.y + 66, t('locked'), 15, TEXT_COLORS.dim, 0, 0.5).setFontStyle('normal');
    });
    scene.add
      .zone(first.x + first.w / 2, first.y + first.h / 2, first.w, first.h)
      .setDepth(D.item)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callbacks.onTower);

    // Пауза
    scene.add.circle(CX, 668, 24, COLORS.button, 1).setStrokeStyle(2, COLORS.panelLine, 1).setDepth(D.item);
    scene.add.rectangle(CX - 6, 668, 6, 22, 0xffffff).setDepth(D.item);
    scene.add.rectangle(CX + 6, 668, 6, 22, 0xffffff).setDepth(D.item);
    scene.add
      .zone(CX, 668, 60, 60)
      .setDepth(D.item)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callbacks.onPause);

    // Подсказка «◀ Организм» у левого края
    this.chipBg = scene.add.graphics();
    const chipText = scene.add
      .text(20, 17, `◀ ${t('organism')}`, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: TEXT_COLORS.main, resolution: 2 })
      .setOrigin(0, 0.5);
    this.chip = scene.add.container(0, 328, [this.chipBg, chipText]).setDepth(D.chip).setVisible(false);
    this.drawChip(false);

    // Всплывающее сообщение сверху и постоянная подсказка снизу
    this.toastText = this.text(VIEW_W / 2, 46, '', 26, TEXT_COLORS.accent).setDepth(D.toast).setAlpha(0);
    this.hintText = this.text(VIEW_W / 2, H - 38, '', 24, TEXT_COLORS.main).setDepth(D.toast).setVisible(false);
  }

  // ---------------------------------------------------------------- что показывать

  setWave(n: number, total: number, progress: number, nextInSec: number | null): void {
    this.waveText.setText(t('wave', { n, total }));
    this.nextWaveText.setText(nextInSec === null ? '' : t('nextWave', { n: Math.ceil(nextInSec) }));
    this.bar.clear();
    this.bar.fillStyle(COLORS.barBack, 1).fillRoundedRect(PX + 22, 40, PANEL_W - 44, 8, 4);
    if (progress > 0) this.bar.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(PX + 22, 40, Math.max(8, (PANEL_W - 44) * Math.min(1, progress)), 8, 4);
  }

  setCoins(n: number): void {
    this.coinsText.setText(String(n));
  }

  /** Красным мигает число монет, если на башню не хватило. */
  flashCoins(): void {
    this.coinsText.setColor(TEXT_COLORS.bad);
    this.scene.time.delayedCall(350, () => this.coinsText.setColor(TEXT_COLORS.accent));
  }

  setLives(lives: number): void {
    this.lives = lives;
    this.hearts.clear();
    for (let i = 0; i < CONFIG.lives.start; i++) {
      this.hearts.fillStyle(i < lives ? COLORS.heart : COLORS.heartLost, 1);
      this.hearts.fillPoints(heartPoints(PX + 46 + i * 54, 132, 1.25), true);
    }
  }

  /** Кнопка башни выбрана (золотая рамка) или нет. */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.drawSlots();
  }

  /** Цена красным, если монет на башню не хватает. */
  setAffordable(affordable: boolean): void {
    this.priceText.setColor(affordable ? TEXT_COLORS.accent : TEXT_COLORS.bad);
  }

  /** Подсказка «◀ Организм»: показывать, когда организм за краем экрана; danger — бактерия близко (мигает). */
  setChip(visible: boolean, danger: boolean, timeSec: number): void {
    this.chip.setVisible(visible);
    if (!visible) return;
    if (danger !== this.chipDanger) this.drawChip(danger);
    this.chip.setAlpha(danger ? 0.65 + 0.35 * Math.sin(timeSec * 9) : 0.92);
  }

  /** Всплывающее сообщение сверху экрана. */
  toast(message: string): void {
    this.toastTween?.stop();
    this.toastText.setText(message).setAlpha(1);
    this.toastTween = this.scene.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: CONFIG.ui.toastMs,
      duration: 400,
    });
  }

  /** Постоянная подсказка снизу (null — убрать). */
  setHint(message: string | null): void {
    this.hintText.setVisible(message !== null);
    if (message !== null) this.hintText.setText(message);
  }

  /** Где кнопки на экране игры — для проверок. */
  geometry(): { towerButton: { x: number; y: number; w: number; h: number }; pauseButton: { x: number; y: number }; lives: number } {
    const r = this.slotRect(0);
    return { towerButton: { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h }, pauseButton: { x: CX, y: 668 }, lives: this.lives };
  }

  // ---------------------------------------------------------------- рисование

  private slotRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: SLOT.x, y: SLOT.y0 + i * (SLOT.h + SLOT.gap), w: SLOT.w, h: SLOT.h };
  }

  private drawSlots(): void {
    this.slotGfx.clear();
    for (let i = 0; i <= LOCKED_SLOTS.length; i++) {
      const r = this.slotRect(i);
      const on = i === 0;
      this.slotGfx.fillStyle(on ? COLORS.slotOn : COLORS.slot, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
      const gold = on && this.selected;
      this.slotGfx.lineStyle(gold ? 4 : 2, gold ? COLORS.gold : on ? COLORS.panelLine : COLORS.slotLine, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
    }
  }

  private drawChip(danger: boolean): void {
    this.chipDanger = danger;
    this.chipBg.clear();
    this.chipBg.fillStyle(danger ? COLORS.loseLine : 0x5c2436, 0.95).fillRoundedRect(0, 0, 150, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
    this.chipBg.lineStyle(2, COLORS.loseLine, 1).strokeRoundedRect(0, 0, 150, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
  }

  private text(x: number, y: number, str: string, size: number, color: string = TEXT_COLORS.main, ox = 0.5, oy = 0.5): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: TEXT_COLORS.stroke, strokeThickness: size > 20 ? 4 : 0, resolution: 2 })
      .setOrigin(ox, oy)
      .setDepth(D.item);
  }

  private coin(x: number, y: number, r: number): void {
    const g = this.scene.add.graphics().setDepth(D.item);
    g.fillStyle(COLORS.gold, 1).fillCircle(x, y, r);
    g.lineStyle(2.5, COLORS.goldEdge, 1).strokeCircle(x, y, r);
    g.lineStyle(2, COLORS.goldEdge, 1).strokeCircle(x, y, r * 0.55);
  }

  private lock(x: number, y: number): void {
    const g = this.scene.add.graphics().setDepth(D.item);
    g.fillStyle(COLORS.locked, 1).fillRoundedRect(x - 13, y - 4, 26, 20, 4);
    g.lineStyle(4, COLORS.locked, 1).beginPath().arc(x, y - 4, 8, Math.PI, Math.PI * 2).strokePath();
  }

  /** Первичная отрисовка (после создания всех объектов). */
  init(): void {
    this.drawSlots();
    this.setLives(CONFIG.lives.start);
  }
}
