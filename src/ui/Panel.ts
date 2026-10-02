import Phaser from 'phaser';
import { CONFIG } from '../config';
import { t, type TextKey } from '../i18n';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { COLORS, FONT, TEXT_COLORS } from '../theme';
import { card, drawPlate, panelBackground, roundButton, slot as slotTexture, waveButton as waveButtonTexture } from './panelArt';

const { width: W, height: H } = CONFIG.screen;
const PANEL_W = CONFIG.map.panelW;
/** Левый край панели = ширина окна карты. */
export const VIEW_W = W - PANEL_W;
const PX = VIEW_W;
const CX = PX + PANEL_W / 2;
/** Слои интерфейса: панель ниже всплывающих подсказок, а те — ниже экранов паузы и конца уровня (глубина 200). */
const D = { panel: 100, item: 101, chip: 96, toast: 105 };

/** Все башни по порядку таблицы `towers`; у каждой — название и короткая подпись на кнопке. */
const TOWER_IDS = Object.keys(CONFIG.towers) as TowerId[];
const TOWER_TEXT: Record<TowerId, { name: TextKey; tag: TextKey }> = {
  pill: { name: 'towerPill', tag: 'tagPill' },
  syrup: { name: 'towerSyrup', tag: 'tagSyrup' },
  fizz: { name: 'towerFizz', tag: 'tagFizz' },
  syringe: { name: 'towerSyringe', tag: 'tagSyringe' },
};

// Раскладка панели сверху вниз, пикселей экрана игры
const CARD_X = PX + 12;
const CARD_W = PANEL_W - 24;
const WAVE_CARD = { y: 10, h: 78 };
const RES_CARD = { y: 96, h: 84 };
const SLOT = { x: PX + 12, y0: 190, w: PANEL_W - 24, h: 96, gap: 8 };
const WAVE_BTN = { y: 614, w: PANEL_W - 24, h: 38 };
const CTRL = { y: 686, r: 22, dx: 38 };

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
  onTower: (id: TowerId) => void;
  /** Тап по кнопке паузы. */
  onPause: () => void;
  /** Тап по кнопке скорости (×1 → ×2 → ×3). */
  onSpeed: () => void;
  /** Тап по кнопке «Начать волну». */
  onWave: () => void;
}

/**
 * Правая панель: волна, монеты, жизни, кнопки башен (все башни таблицы `towers`), скорость, пауза, «Начать волну».
 * Лежит поверх карты и не двигается. Тут же — подсказка «◀ Организм» у левого края и всплывающие сообщения.
 */
export class Panel {
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly nextWaveText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly coinsText: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Graphics;
  private readonly slotOff = new Map<TowerId, Phaser.GameObjects.Image>();
  private readonly slotOn = new Map<TowerId, Phaser.GameObjects.Image>();
  private readonly priceTexts = new Map<TowerId, Phaser.GameObjects.Text>();
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly waveBtnItems: { setVisible(v: boolean): unknown }[] = [];
  private readonly waveBtnBonus: Phaser.GameObjects.Text;
  private readonly waveBtnLabel: Phaser.GameObjects.Text;
  private readonly chip: Phaser.GameObjects.Container;
  private readonly chipBg: Phaser.GameObjects.Graphics;
  private readonly toastText: Phaser.GameObjects.Text;
  private readonly toastPlate: Phaser.GameObjects.Graphics;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly hintPlate: Phaser.GameObjects.Graphics;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private selected: TowerId | null = null;
  private lives = 0;
  private chipDanger: boolean | null = null;
  private waveBtnVisible = false;
  private waveBtnBonusValue = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    callbacks: PanelCallbacks,
  ) {
    // Фон панели и карточки
    scene.add.image(PX + PANEL_W / 2, H / 2, panelBackground(scene, PANEL_W, H)).setDepth(D.panel);
    scene.add.image(CX, WAVE_CARD.y + WAVE_CARD.h / 2, card(scene, 'ui-card-wave', CARD_W, WAVE_CARD.h)).setDepth(D.panel);
    scene.add.image(CX, RES_CARD.y + RES_CARD.h / 2, card(scene, 'ui-card-res', CARD_W, RES_CARD.h)).setDepth(D.panel);

    // Волна и полоска прогресса
    this.waveText = this.text(CX, WAVE_CARD.y + 24, '', 24);
    this.bar = scene.add.graphics().setDepth(D.item);
    this.nextWaveText = this.text(CX, WAVE_CARD.y + 63, '', 16, TEXT_COLORS.soft).setFontStyle('normal');

    // Монеты и жизни
    this.coin(PX + 42, RES_CARD.y + 28, 16);
    this.coinsText = this.text(PX + 70, RES_CARD.y + 28, '0', 34, TEXT_COLORS.accent, 0, 0.5);
    this.hearts = scene.add.graphics().setDepth(D.item);

    // Кнопки башен: значок, название, подпись способа стрельбы, цена
    TOWER_IDS.forEach((id, i) => {
      const r = this.slotRect(i);
      const cy = r.y + r.h / 2;
      this.slotOff.set(id, scene.add.image(CX, cy, slotTexture(scene, false, r.w, r.h)).setDepth(D.item));
      this.slotOn.set(id, scene.add.image(CX, cy, slotTexture(scene, true, r.w, r.h)).setDepth(D.item).setVisible(false));
      scene.add.circle(r.x + 36, cy, 29, 0x0e1b38, 1).setStrokeStyle(2, 0x3a5f9c, 1).setDepth(D.item + 1);
      const icon = scene.add.container(r.x + 36, cy).setDepth(D.item + 1).setScale(0.62);
      createTowerArt(scene, icon, id);
      this.text(r.x + 74, r.y + 26, t(TOWER_TEXT[id].name), 20, TEXT_COLORS.main, 0, 0.5);
      this.text(r.x + 74, r.y + 50, t(TOWER_TEXT[id].tag), 16, TEXT_COLORS.soft, 0, 0.5).setFontStyle('normal');
      this.coin(r.x + 84, r.y + 76, 10);
      this.priceTexts.set(id, this.text(r.x + 100, r.y + 76, String(CONFIG.towers[id].price), 24, TEXT_COLORS.accent, 0, 0.5));
      scene.add
        .zone(r.x + r.w / 2, cy, r.w, r.h)
        .setDepth(D.item + 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => callbacks.onTower(id));
    });

    // «Начать волну» (видна, пока идёт отсчёт до волны)
    const wy = WAVE_BTN.y + WAVE_BTN.h / 2;
    this.waveBtnItems.push(scene.add.image(CX, wy, waveButtonTexture(scene, WAVE_BTN.w, WAVE_BTN.h)).setDepth(D.item));
    this.waveBtnLabel = this.text(CX, wy, t('startWave'), 17);
    this.waveBtnBonus = this.text(PX + PANEL_W - 28, wy, '', 17, TEXT_COLORS.accent, 1, 0.5);
    this.waveBtnItems.push(this.waveBtnLabel, this.waveBtnBonus);
    this.waveBtnItems.push(
      scene.add
        .zone(CX, wy, WAVE_BTN.w, WAVE_BTN.h)
        .setDepth(D.item + 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.waveBtnVisible) callbacks.onWave();
        }),
    );
    this.setWaveButton(false, 0);

    // Скорость и пауза
    scene.add.image(CX - CTRL.dx, CTRL.y, roundButton(scene, CTRL.r)).setDepth(D.item);
    this.speedText = this.text(CX - CTRL.dx, CTRL.y, '×1', 19);
    scene.add.zone(CX - CTRL.dx, CTRL.y, 64, 64).setDepth(D.item + 2).setInteractive({ useHandCursor: true }).on('pointerdown', callbacks.onSpeed);
    scene.add.image(CX + CTRL.dx, CTRL.y, roundButton(scene, CTRL.r)).setDepth(D.item);
    scene.add.rectangle(CX + CTRL.dx - 5.5, CTRL.y, 5, 20, 0xffffff).setDepth(D.item + 1);
    scene.add.rectangle(CX + CTRL.dx + 5.5, CTRL.y, 5, 20, 0xffffff).setDepth(D.item + 1);
    scene.add.zone(CX + CTRL.dx, CTRL.y, 64, 64).setDepth(D.item + 2).setInteractive({ useHandCursor: true }).on('pointerdown', callbacks.onPause);

    // Подсказка «◀ Организм» у левого края
    this.chipBg = scene.add.graphics();
    const chipText = scene.add
      .text(14, 17, `◀ ${t('organism')}`, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: TEXT_COLORS.main, resolution: 2 })
      .setOrigin(0, 0.5);
    this.chip = scene.add.container(0, 328, [this.chipBg, chipText]).setDepth(D.chip).setVisible(false);
    this.drawChip(false);

    // Всплывающее сообщение сверху и постоянная подсказка снизу (на тёмных плашках)
    this.toastPlate = scene.add.graphics().setDepth(D.toast - 1).setAlpha(0);
    this.toastText = this.text(VIEW_W / 2, 46, '', 26, TEXT_COLORS.accent).setDepth(D.toast).setAlpha(0);
    this.hintPlate = scene.add.graphics().setDepth(D.toast - 1).setVisible(false);
    this.hintText = this.text(VIEW_W / 2, H - 38, '', 24, TEXT_COLORS.main).setDepth(D.toast).setVisible(false);
  }

  // ---------------------------------------------------------------- что показывать

  setWave(n: number, total: number, progress: number, nextInSec: number | null): void {
    this.waveText.setText(t('wave', { n, total }));
    this.nextWaveText.setText(nextInSec === null ? '' : t('nextWave', { n: Math.ceil(nextInSec) }));
    const bx = CARD_X + 14;
    const bw = CARD_W - 28;
    const by = WAVE_CARD.y + 42;
    this.bar.clear();
    this.bar.fillStyle(0x0a1530, 1).fillRoundedRect(bx, by, bw, 11, 5.5);
    this.bar.lineStyle(1.5, 0x3a5f9c, 1).strokeRoundedRect(bx, by, bw, 11, 5.5);
    if (progress > 0) {
      const fw = Math.max(11, bw * Math.min(1, progress));
      this.bar.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(bx, by, fw, 11, 5.5);
      this.bar.fillStyle(0xffffff, 0.3).fillRoundedRect(bx + 3, by + 2, Math.max(0, fw - 6), 3, 1.5);
    }
  }

  /** Число монет; цена башни красная, если на неё не хватает. */
  setCoins(n: number): void {
    this.coinsText.setText(String(n));
    for (const [id, text] of this.priceTexts) text.setColor(n >= CONFIG.towers[id].price ? TEXT_COLORS.accent : TEXT_COLORS.bad);
  }

  /** Красным мигает число монет, если на башню не хватило. */
  flashCoins(): void {
    this.coinsText.setColor(TEXT_COLORS.bad);
    this.scene.time.delayedCall(350, () => this.coinsText.setColor(TEXT_COLORS.accent));
  }

  setLives(lives: number): void {
    this.lives = lives;
    this.hearts.clear();
    const n = CONFIG.lives.start;
    for (let i = 0; i < n; i++) {
      const x = CX + (i - (n - 1) / 2) * 50;
      this.hearts.fillStyle(0x000000, 0.35).fillPoints(heartPoints(x + 1.5, RES_CARD.y + 66, 1.2), true);
      this.hearts.fillStyle(i < lives ? COLORS.heart : COLORS.heartLost, 1);
      this.hearts.fillPoints(heartPoints(x, RES_CARD.y + 64, 1.2), true);
    }
  }

  /** Какая кнопка башни выбрана (золотая рамка со свечением); null — никакая. */
  setSelected(id: TowerId | null): void {
    this.selected = id;
    for (const tid of TOWER_IDS) {
      const on = this.selected === tid;
      this.slotOn.get(tid)?.setVisible(on);
      this.slotOff.get(tid)?.setVisible(!on);
    }
  }

  /** Скорость игры на кнопке: «×2»; ускорение подсвечено золотым. */
  setSpeed(n: number): void {
    this.speedText.setText(`×${n}`).setColor(n > 1 ? TEXT_COLORS.accent : TEXT_COLORS.main);
  }

  /** Кнопка «Начать волну»: показывать (идёт отсчёт до волны) и сколько монет даст досрочный вызов. */
  setWaveButton(visible: boolean, bonus: number): void {
    this.waveBtnVisible = visible;
    this.waveBtnBonusValue = bonus;
    for (const item of this.waveBtnItems) item.setVisible(visible);
    const showBonus = visible && bonus > 0;
    this.waveBtnBonus.setVisible(showBonus).setText(showBonus ? `+${bonus}` : '');
    this.waveBtnLabel.setOrigin(showBonus ? 0 : 0.5, 0.5).setX(showBonus ? PX + 28 : CX);
  }

  /** Подсказка «◀ Организм»: показывать, когда организм за краем экрана; danger — бактерия близко (мигает). */
  setChip(visible: boolean, danger: boolean, timeSec: number): void {
    this.chip.setVisible(visible);
    if (!visible) return;
    if (danger !== this.chipDanger) this.drawChip(danger);
    this.chip.setAlpha(danger ? 0.65 + 0.35 * Math.sin(timeSec * 9) : 0.92);
  }

  /** Кладёт текст в плашку и, если он не помещается в окно карты, уменьшает его (до 0,5): так длинные сообщения не уходят за край и под панель. */
  private fitPlate(text: Phaser.GameObjects.Text, plate: Phaser.GameObjects.Graphics, y: number): void {
    const scale = Math.min(1, (VIEW_W - 40) / (text.width + 48));
    text.setScale(scale);
    drawPlate(plate, VIEW_W / 2, y, text.width * scale + 48, text.height * scale + 18);
  }

  /** Всплывающее сообщение сверху экрана. */
  toast(message: string, ms: number = CONFIG.ui.toastMs): void {
    this.toastTween?.stop();
    this.toastText.setText(message).setAlpha(1);
    this.fitPlate(this.toastText, this.toastPlate, 46);
    this.toastPlate.setAlpha(1);
    this.toastTween = this.scene.tweens.add({
      targets: [this.toastText, this.toastPlate],
      alpha: 0,
      delay: ms,
      duration: 400,
    });
  }

  /** Постоянная подсказка снизу (null — убрать). */
  setHint(message: string | null): void {
    this.hintText.setVisible(message !== null);
    this.hintPlate.setVisible(message !== null);
    if (message !== null) {
      this.hintText.setText(message);
      this.fitPlate(this.hintText, this.hintPlate, H - 38);
    }
  }

  /** Где кнопки на экране игры — для проверок: towerButton — первая башня (Таблетка), towerButtons — все по порядку таблицы. */
  geometry(): {
    towerButton: { x: number; y: number; w: number; h: number };
    towerButtons: { id: string; x: number; y: number; w: number; h: number }[];
    pauseButton: { x: number; y: number };
    speedButton: { x: number; y: number };
    waveButton: { x: number; y: number; w: number; h: number; visible: boolean; bonus: number };
    lives: number;
  } {
    const towerButtons = TOWER_IDS.map((id, i) => {
      const r = this.slotRect(i);
      return { id, x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
    });
    const first = towerButtons[0];
    return {
      towerButton: { x: first.x, y: first.y, w: first.w, h: first.h },
      towerButtons,
      pauseButton: { x: CX + CTRL.dx, y: CTRL.y },
      speedButton: { x: CX - CTRL.dx, y: CTRL.y },
      waveButton: { x: CX, y: WAVE_BTN.y + WAVE_BTN.h / 2, w: WAVE_BTN.w, h: WAVE_BTN.h, visible: this.waveBtnVisible, bonus: this.waveBtnBonusValue },
      lives: this.lives,
    };
  }

  // ---------------------------------------------------------------- рисование

  private slotRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: SLOT.x, y: SLOT.y0 + i * (SLOT.h + SLOT.gap), w: SLOT.w, h: SLOT.h };
  }

  private drawChip(danger: boolean): void {
    this.chipDanger = danger;
    this.chipBg.clear();
    this.chipBg.fillStyle(danger ? COLORS.loseLine : 0x5c2436, 0.95).fillRoundedRect(0, 0, 128, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
    this.chipBg.lineStyle(2, COLORS.loseLine, 1).strokeRoundedRect(0, 0, 128, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
  }

  private text(x: number, y: number, str: string, size: number, color: string = TEXT_COLORS.main, ox = 0.5, oy = 0.5): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: TEXT_COLORS.stroke, strokeThickness: size > 20 ? 4 : 0, resolution: 2 })
      .setOrigin(ox, oy)
      .setDepth(D.item + 1);
  }

  private coin(x: number, y: number, r: number): void {
    const g = this.scene.add.graphics().setDepth(D.item + 1);
    g.fillStyle(COLORS.gold, 1).fillCircle(x, y, r);
    g.lineStyle(2.5, COLORS.goldEdge, 1).strokeCircle(x, y, r);
    g.lineStyle(2, COLORS.goldEdge, 1).strokeCircle(x, y, r * 0.55);
  }

  /** Первичная отрисовка (после создания всех объектов). */
  init(): void {
    this.setSelected(null);
    this.setLives(CONFIG.lives.start);
    this.setSpeed(1);
  }
}
