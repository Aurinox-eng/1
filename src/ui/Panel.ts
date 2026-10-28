import Phaser from 'phaser';
import { CONFIG } from '../config';
import { t, type TextKey } from '../i18n';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { isTowerOpen } from '../progress';
import { towerPrice } from '../towerStats';
import { COLORS, FONT, TEXT_COLORS } from '../theme';
import { drawPlate, roundButton, waveButton as waveButtonTexture } from './panelArt';
import { TowerCard, type CardGeometry, type CardModel } from './TowerCard';

const { width: W, height: H } = CONFIG.screen;
/** Высота верхней полосы (волна, монеты, жизни) и нижней панели (список башен, «Начать волну», скорость, пауза), пикселей экрана игры. */
export const TOP_H = CONFIG.map.topH;
export const BOTTOM_H = CONFIG.map.bottomH;
const BOTTOM_Y = H - BOTTOM_H;
/** Окно карты: между верхней и нижней полосами, на всю ширину экрана. */
export const VIEW = { x: 0, y: TOP_H, w: W, h: H - TOP_H - BOTTOM_H };
/** Слои интерфейса: полосы ниже всплывающих подсказок, а те — ниже экранов паузы и конца уровня (глубина 200). */
const D = { panel: 100, item: 101, chip: 96, toast: 105 };

/** Все башни по порядку таблицы `towers`. */
const TOWER_IDS = Object.keys(CONFIG.towers) as TowerId[];

// Раскладка нижней панели, пикселей экрана игры (макет docs/mockups/bottom-bar.html)
/** Список башен слева: окно прокрутки и карточка башни (значок и цена). */
const LIST = { x: 10, y: BOTTOM_Y, w: 896, h: BOTTOM_H };
/** Окошко жизней в верхней полосе: левый край и ширина (сердце и число «18 / 20»). */
const LIVES_X = 636;
const LIVES_W = 150;
const CARD = { w: 108, h: 92, gap: 8, top: BOTTOM_Y + 8 };
/** Правая часть: «Начать волну» (всегда на месте), скорость и пауза — круглые по 80 px, чтобы попадать большим пальцем. */
const WAVE_BTN = { x: 916, w: 170, h: 98 };
const CTRL_Y = BOTTOM_Y + 56;
const SPEED_BTN = { x: 1134, r: 40 };
const PAUSE_BTN = { x: 1222, r: 40 };
/** Карточка выбранной башни лежит над нижней панелью, на карте; список башен остаётся доступным. */
const CARD_AREA = { x: 10, y: BOTTOM_Y - 108, w: W - 20, h: 104 };
/** Сколько пикселей нужно сдвинуть палец, чтобы касание списка стало прокруткой, а не нажатием на башню. */
const DRAG_PX = CONFIG.camera.tapMaxMovePx; // как у карты (находка аудита MASTER-0088)
/** Цвет подложки полос (как у нижней панели в макете). */
const BAR_FILL = 0x12203a;
const BAR_EDGE = 0x33578f;

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
  /** Нажатие на карточку башни в списке. */
  onTower: (id: TowerId) => void;
  /** Тап по кнопке паузы. */
  onPause: () => void;
  /** Тап по кнопке скорости (×1 → ×2 → ×3). */
  onSpeed: () => void;
  /** Тап по кнопке «Начать волну». */
  onWave: () => void;
  /** Кнопки карточки выбранной башни: слить, продать, выбрать мутацию (0/1), повернуть луч (-1 влево, 1 вправо), закрыть. */
  onMerge: () => void;
  onSell: () => void;
  onPick: (index: number) => void;
  onRotate: (dir: 1 | -1) => void;
  onCardClose: () => void;
}

/** Карточка башни в списке: контейнер со всем, что на ней нарисовано, и её состояние. */
interface ListCard {
  id: TowerId;
  open: boolean;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  need: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text | null;
  /** Состояние, с которым карточка нарисована в последний раз (перерисовка — только при изменении). */
  key: string;
}

/**
 * Интерфейс игры вокруг карты: верхняя полоса (волна, монеты, жизни — только вывод), нижняя панель (список башен с прокруткой вбок,
 * «Начать волну», скорость, пауза) и карточка выбранной стоящей башни над нижней панелью. Лежит поверх карты и не двигается.
 * Тут же — подсказка «◀ Организм» у левого края и всплывающие сообщения.
 */
export class Panel {
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly nextWaveText: Phaser.GameObjects.Text;
  /** Таймер волны красный: следующая волна с боссом. */
  private waveWarn = false;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly coinsText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Graphics;
  private readonly topGfx: Phaser.GameObjects.Graphics;
  private readonly cards: ListCard[] = [];
  /** Порядок карточек в списке: открытые башни (в порядке таблицы), потом закрытые. */
  private readonly order: TowerId[];
  private readonly listFade: Phaser.GameObjects.Graphics;
  private readonly listCover: Phaser.GameObjects.Graphics;
  private readonly listArrows: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly listTrack: Phaser.GameObjects.Graphics;
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
  private readonly card: TowerCard;
  private toastTween: Phaser.Tweens.Tween | null = null;
  /** Очередь новостей (`news`): следующая показывается, когда закончился показ предыдущей. */
  private readonly newsQueue: { message: string; ms: number }[] = [];
  /** Что показано сейчас: новость (после мгновенного ответа она возвращается в начало очереди) или ответ на нажатие. */
  private toastCurrent: { message: string; ms: number; news: boolean } | null = null;
  private selected: TowerId | null = null;
  private coins = 0;
  private lives = 0;
  private maxLives: number = CONFIG.lives.start;
  private chipDanger: boolean | null = null;
  private chipFill = 0;
  private waveBtnVisible = false;
  private waveBtnBonusValue = 0;
  private hintMessage: string | null = null;
  /** Сдвиг списка башен влево, пикселей (0 — первая карточка у левого края). */
  private scroll = 0;
  private drag: { id: number; startX: number; startY: number; scroll0: number; moved: boolean } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: PanelCallbacks,
  ) {
    // Открытые — по таблице башен; закрытые — по цене узла в древе (по порядку открытия)
    const open = TOWER_IDS.filter((id) => isTowerOpen(id));
    const nodePrice = (id: TowerId): number => CONFIG.meta.upgrades[`tower${id.charAt(0).toUpperCase()}${id.slice(1)}`]?.prices[0] ?? 0;
    const locked = TOWER_IDS.filter((id) => !open.includes(id)).sort((a, b) => nodePrice(a) - nodePrice(b));
    this.order = [...open, ...locked];

    // ---- верхняя полоса: только вывод
    const top = scene.add.graphics().setDepth(D.panel);
    top.fillStyle(BAR_FILL, 1).fillRect(0, 0, W, TOP_H);
    top.lineStyle(2, BAR_EDGE, 1).lineBetween(0, TOP_H - 1, W, TOP_H - 1);
    this.topGfx = scene.add.graphics().setDepth(D.panel + 0.5);
    this.chipPlate(12, 470);
    this.chipPlate(494, 130);
    this.waveText = this.text(28, TOP_H / 2, '', 20, TEXT_COLORS.main, 0);
    this.bar = scene.add.graphics().setDepth(D.item);
    this.nextWaveText = this.text(344, TOP_H / 2, '', 14, TEXT_COLORS.soft, 0).setFontStyle('normal');
    this.coin(512, TOP_H / 2, 9);
    this.coinsText = this.text(530, TOP_H / 2, '0', 20, TEXT_COLORS.accent, 0, 0.5);
    this.hearts = scene.add.graphics().setDepth(D.item);
    this.livesText = this.text(LIVES_X + 46, TOP_H / 2, '', 20, TEXT_COLORS.main, 0, 0.5);

    // ---- нижняя панель: подложка
    const bottom = scene.add.graphics().setDepth(D.panel);
    bottom.fillStyle(BAR_FILL, 1).fillRect(0, BOTTOM_Y, W, BOTTOM_H);
    bottom.lineStyle(2, BAR_EDGE, 1).lineBetween(0, BOTTOM_Y + 1, W, BOTTOM_Y + 1);

    // ---- список башен: карточки (значок и цена), затухание у правого края, стрелки и ползунок положения
    this.order.forEach((id) => this.cards.push(this.buildCard(id)));
    // подложка правой части панели и левого поля закрывает карточки, уехавшие за край окна списка (ниже кнопок правой части, выше карточек)
    this.listCover = scene.add.graphics().setDepth(D.item + 0.5);
    this.listFade = scene.add.graphics().setDepth(D.item + 0.6);
    this.listArrows = [
      this.text(LIST.x + LIST.w - 10, BOTTOM_Y + 52, '›', 38, TEXT_COLORS.accent).setDepth(D.item + 3),
      this.text(LIST.x + 4, BOTTOM_Y + 52, '‹', 38, TEXT_COLORS.accent).setDepth(D.item + 3),
    ];
    this.listTrack = scene.add.graphics().setDepth(D.item + 3);
    this.bindList();
    this.layoutCards();

    // ---- карточка выбранной башни — над нижней панелью
    this.card = new TowerCard(scene, CARD_AREA, D.item + 3, {
      onMerge: callbacks.onMerge,
      onSell: callbacks.onSell,
      onPick: callbacks.onPick,
      onRotate: callbacks.onRotate,
      onClose: callbacks.onCardClose,
    });

    // ---- «Начать волну» (видна, пока идёт отсчёт до волны), скорость и пауза — правая часть панели, на месте всегда
    const wy = CTRL_Y;
    this.waveBtnItems.push(scene.add.image(WAVE_BTN.x + WAVE_BTN.w / 2, wy, waveButtonTexture(scene, WAVE_BTN.w, WAVE_BTN.h, 20)).setDepth(D.item + 1));
    this.waveBtnLabel = this.text(WAVE_BTN.x + WAVE_BTN.w / 2, wy - 12, t('startWave'), 19, '#06220f');
    this.waveBtnLabel.setStroke('#000000', 0);
    this.waveBtnBonus = this.text(WAVE_BTN.x + WAVE_BTN.w / 2, wy + 16, '', 17, '#06220f');
    this.waveBtnBonus.setStroke('#000000', 0);
    this.waveBtnItems.push(this.waveBtnLabel, this.waveBtnBonus);
    this.waveBtnItems.push(
      scene.add
        .zone(WAVE_BTN.x + WAVE_BTN.w / 2, wy, WAVE_BTN.w, WAVE_BTN.h)
        .setDepth(D.item + 4)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.waveBtnVisible) callbacks.onWave();
        }),
    );
    this.setWaveButton(false, 0);
    scene.add.image(SPEED_BTN.x, CTRL_Y, roundButton(scene, SPEED_BTN.r)).setDepth(D.item + 1);
    this.speedText = this.text(SPEED_BTN.x, CTRL_Y, '×1', 28);
    scene.add.zone(SPEED_BTN.x, CTRL_Y, SPEED_BTN.r * 2, SPEED_BTN.r * 2).setDepth(D.item + 4).setInteractive({ useHandCursor: true }).on('pointerdown', callbacks.onSpeed);
    scene.add.image(PAUSE_BTN.x, CTRL_Y, roundButton(scene, PAUSE_BTN.r)).setDepth(D.item + 1);
    scene.add.rectangle(PAUSE_BTN.x - 9, CTRL_Y, 8, 30, 0xffffff).setDepth(D.item + 2);
    scene.add.rectangle(PAUSE_BTN.x + 9, CTRL_Y, 8, 30, 0xffffff).setDepth(D.item + 2);
    // Нажатие кнопки паузы до карты и до «тап по экрану продолжает игру» не доходит (решение владельца 20 октября 2026, сообщение 2, п. 1.3)
    scene.add
      .zone(PAUSE_BTN.x, CTRL_Y, PAUSE_BTN.r * 2, PAUSE_BTN.r * 2)
      .setDepth(D.item + 4)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        callbacks.onPause();
      });

    // ---- подсказка «◀ Организм» у левого края окна карты
    this.chipBg = scene.add.graphics();
    const chipText = scene.add
      .text(14, 17, `◀ ${t('organism')}`, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: TEXT_COLORS.main, resolution: 2 })
      .setOrigin(0, 0.5);
    this.chip = scene.add.container(0, VIEW.y + VIEW.h / 2 - 17, [this.chipBg, chipText]).setDepth(D.chip).setVisible(false);
    this.drawChip(false);

    // ---- всплывающее сообщение сверху окна карты и постоянная подсказка снизу (на тёмных плашках)
    this.toastPlate = scene.add.graphics().setDepth(D.toast - 1).setAlpha(0);
    this.toastText = this.text(VIEW.x + VIEW.w / 2, TOP_H + 30, '', 26, TEXT_COLORS.accent).setDepth(D.toast).setAlpha(0);
    this.hintPlate = scene.add.graphics().setDepth(D.toast - 1).setVisible(false);
    this.hintText = this.text(VIEW.x + VIEW.w / 2, this.hintY(), '', 24, TEXT_COLORS.main).setDepth(D.toast).setVisible(false);
  }

  // ---------------------------------------------------------------- что показывать

  /** `bossNext` — следующая волна с боссом: таймер волны красный (знак без текста). */
  setWave(n: number, total: number, progress: number, nextInSec: number | null, bossNext = false): void {
    this.waveText.setText(t('wave', { n, total }));
    this.nextWaveText.setText(nextInSec === null ? '' : t('nextWave', { n: Math.ceil(nextInSec) }));
    this.waveWarn = bossNext && nextInSec !== null;
    this.nextWaveText.setColor(this.waveWarn ? '#ff5a5a' : TEXT_COLORS.soft).setFontStyle(this.waveWarn ? 'bold' : 'normal');
    const bx = 200;
    const bw = 130;
    const by = TOP_H / 2 - 4;
    this.bar.clear();
    this.bar.fillStyle(0x0a1530, 1).fillRoundedRect(bx, by, bw, 8, 4);
    this.bar.lineStyle(1.5, 0x3a5f9c, 1).strokeRoundedRect(bx, by, bw, 8, 4);
    if (progress > 0) {
      const fw = Math.max(8, bw * Math.min(1, progress));
      this.bar.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(bx, by, fw, 8, 4);
    }
  }

  /** Число монет; цена башни красная, а карточка тусклая с полоской «сколько уже есть», если монет не хватает. */
  setCoins(n: number): void {
    this.coins = n;
    this.coinsText.setText(String(n));
    for (const c of this.cards) this.drawCard(c);
  }

  /** Красным мигает число монет, если на башню не хватило. */
  flashCoins(): void {
    this.coinsText.setColor(TEXT_COLORS.bad);
    this.scene.time.delayedCall(350, () => this.coinsText.setColor(TEXT_COLORS.accent));
  }

  /** Жизни числом («18 / 20») рядом с одним сердцем; дробные потери (рой отнимает по 0,25) показываются округлением вверх; когда осталась четверть и меньше — красным. */
  setLives(lives: number, max: number = this.maxLives): void {
    this.lives = lives;
    this.maxLives = max;
    const shown = Math.max(0, Math.ceil(lives - 1e-9));
    this.chipPlate(LIVES_X, LIVES_W, true);
    this.livesText.setText(`${shown} / ${max}`).setColor(lives <= max * 0.25 ? TEXT_COLORS.bad : TEXT_COLORS.main);
    this.hearts.clear();
    this.hearts.fillStyle(lives > 0 ? COLORS.heart : COLORS.heartLost, 1);
    this.hearts.fillPoints(heartPoints(LIVES_X + 26, TOP_H / 2 + 1, 0.62), true);
  }

  /** Какая карточка башни выбрана для постройки (золотая рамка, приподнята); null — никакая. */
  setSelected(id: TowerId | null): void {
    this.selected = id;
    for (const c of this.cards) this.drawCard(c);
    if (id) this.revealTower(id);
  }

  /** Показать карточку выбранной стоящей башни (или обновить её) над нижней панелью. */
  showCard(model: CardModel): void {
    this.card.show(model);
    this.refitHint();
  }

  hideCard(): void {
    this.card.hide();
    this.refitHint();
  }

  get cardVisible(): boolean {
    return this.card.visible;
  }

  /** Верхний край карточки башни на экране (когда она открыта): выше него камера держит выбранную башню. */
  cardTop(): number {
    return this.card.top;
  }

  /** Точка (x, y) экрана попала на кнопку карточки выбранной башни: касание принадлежит ей, а не карте (мимо кнопок касания проходят к карте под карточкой). */
  coversPoint(x: number, y: number): boolean {
    return this.card.coversButton(x, y);
  }

  /** Сдвинуть список башен так, чтобы карточка башни была видна целиком. */
  revealTower(id: TowerId): void {
    const i = this.order.indexOf(id);
    if (i < 0) return;
    const left = i * (CARD.w + CARD.gap);
    const right = left + CARD.w;
    if (left < this.scroll) this.setScroll(left);
    else if (right > this.scroll + LIST.w - 40) this.setScroll(right - (LIST.w - 40));
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
    this.waveBtnBonus.setVisible(showBonus).setText(showBonus ? t('waveBonus', { n: bonus }) : '');
    this.waveBtnLabel.setY(showBonus ? CTRL_Y - 12 : CTRL_Y);
  }

  /** Подсказка «◀ Организм»: показывать, когда организм за краем экрана; danger — бактерия близко (мигает). */
  setChip(visible: boolean, danger: boolean, timeSec: number): void {
    this.chip.setVisible(visible);
    if (!visible) return;
    if (danger !== this.chipDanger) this.drawChip(danger);
    this.chip.setAlpha(danger ? 0.65 + 0.35 * Math.sin(timeSec * 9) : 0.92);
  }

  /** Подсказка «◀ Организм» для проверок: видна ли, тревога ли, прозрачность сейчас и цвет заливки (проверка читает это, а не пиксели снимка экрана). */
  chipState(): { visible: boolean; danger: boolean; alpha: number; fill: number } {
    return { visible: this.chip.visible, danger: this.chipDanger === true, alpha: this.chip.alpha, fill: this.chipFill };
  }

  /** Кладёт текст в плашку и, если он не помещается в окно карты, уменьшает его (до 0,5): так длинные сообщения не уходят за край. */
  private fitPlate(text: Phaser.GameObjects.Text, plate: Phaser.GameObjects.Graphics, y: number): void {
    const scale = Math.min(1, (VIEW.w - 40) / (text.width + 48));
    text.setScale(scale);
    drawPlate(plate, VIEW.x + VIEW.w / 2, y, text.width * scale + 48, text.height * scale + 18);
  }

  /**
   * Ответ на нажатие (нехватка монет, нельзя строить, слияние, продажа): показывается сразу, очереди не ждёт. Показанную в этот момент новость он не стирает безвозвратно:
   * она встаёт в начало очереди и показывается заново после ответа.
   */
  toast(message: string, ms: number = CONFIG.ui.toastMs): void {
    if (this.toastCurrent?.news) this.newsQueue.unshift({ message: this.toastCurrent.message, ms: this.toastCurrent.ms });
    this.showToast({ message, ms, news: false });
  }

  /** Новость (новая башня, новая бактерия, подсказка): если на экране уже есть сообщение, ждёт в очереди конца его показа; одинаковая новость в очереди не повторяется. */
  news(message: string, ms: number = CONFIG.ui.toastMs): void {
    if (this.toastCurrent === null) {
      this.showToast({ message, ms, news: true });
      return;
    }
    if (this.newsQueue.some((item) => item.message === message) || (this.toastCurrent.news && this.toastCurrent.message === message)) return;
    this.newsQueue.push({ message, ms });
  }

  /** Убирает показанное уведомление и очередь новостей сразу (экран проигрыша закрывает собой всё). */
  clearToasts(): void {
    this.toastTween?.stop();
    this.toastTween = null;
    this.toastCurrent = null;
    this.newsQueue.length = 0;
    this.toastText.setAlpha(0);
    this.toastPlate.setAlpha(0);
  }

  /** Состояние уведомлений для проверок: текст на экране (null — ничего не показано), число новостей в очереди. */
  toastInfo(): { text: string | null; news: boolean; queued: string[] } {
    return { text: this.toastCurrent?.message ?? null, news: this.toastCurrent?.news ?? false, queued: this.newsQueue.map((item) => item.message) };
  }

  private showToast(item: { message: string; ms: number; news: boolean }): void {
    this.toastTween?.stop();
    this.toastCurrent = item;
    this.toastText.setText(item.message).setAlpha(1);
    this.fitPlate(this.toastText, this.toastPlate, TOP_H + 30);
    this.toastPlate.setAlpha(1);
    const tween = this.scene.tweens.add({
      targets: [this.toastText, this.toastPlate],
      alpha: 0,
      delay: item.ms,
      duration: 400,
      onComplete: () => {
        if (this.toastTween !== tween) return; // его уже заменил ответ на нажатие
        this.toastCurrent = null;
        const next = this.newsQueue.shift();
        if (next) this.showToast({ ...next, news: true });
      },
    });
    this.toastTween = tween;
  }

  /** Постоянная подсказка снизу окна карты (над карточкой башни, если она открыта); null — убрать. */
  setHint(message: string | null): void {
    this.hintMessage = message;
    this.hintText.setVisible(message !== null);
    this.hintPlate.setVisible(message !== null);
    if (message !== null) {
      this.hintText.setText(message);
      this.refitHint();
    }
  }

  /** Где кнопки на экране игры — для проверок: towerButton — первая башня (Таблетка), towerButtons — все по порядку таблицы (visible — центр карточки в окне списка). */
  geometry(): {
    towerButton: { x: number; y: number; w: number; h: number };
    towerButtons: { id: string; x: number; y: number; w: number; h: number; locked: boolean; visible: boolean }[];
    towerList: { x: number; y: number; w: number; h: number; scroll: number; maxScroll: number };
    pauseButton: { x: number; y: number };
    speedButton: { x: number; y: number };
    waveButton: { x: number; y: number; w: number; h: number; visible: boolean; bonus: number };
    card: CardGeometry;
    lives: number;
    /** Что написано в окошке жизней верхней полосы («18 / 20»). */
    livesText: string;
    /** Постоянная подсказка снизу окна карты (null — не показана). */
    hint: string | null;
    /** Таймер волны красный (следующая волна с боссом). */
    waveWarn: boolean;
  } {
    const towerButtons = TOWER_IDS.map((id) => {
      const x = this.cardX(this.order.indexOf(id)) + CARD.w / 2;
      return { id, x, y: CARD.top + CARD.h / 2, w: CARD.w, h: CARD.h, locked: !isTowerOpen(id), visible: x >= LIST.x + 10 && x <= LIST.x + LIST.w - 10 };
    });
    const first = towerButtons[0];
    return {
      towerButton: { x: first.x, y: first.y, w: first.w, h: first.h },
      towerButtons,
      towerList: { x: LIST.x, y: LIST.y, w: LIST.w, h: LIST.h, scroll: this.scroll, maxScroll: this.maxScroll() },
      pauseButton: { x: PAUSE_BTN.x, y: CTRL_Y },
      speedButton: { x: SPEED_BTN.x, y: CTRL_Y },
      waveButton: { x: WAVE_BTN.x + WAVE_BTN.w / 2, y: CTRL_Y, w: WAVE_BTN.w, h: WAVE_BTN.h, visible: this.waveBtnVisible, bonus: this.waveBtnBonusValue },
      card: this.card.geometry(),
      lives: this.lives,
      livesText: this.livesText.text,
      hint: this.hintMessage,
      waveWarn: this.waveWarn,
    };
  }

  // ---------------------------------------------------------------- список башен

  private cardX(index: number): number {
    return LIST.x + index * (CARD.w + CARD.gap) - this.scroll;
  }

  private maxScroll(): number {
    const content = this.order.length * CARD.w + (this.order.length - 1) * CARD.gap;
    return Math.max(0, content - LIST.w + 40);
  }

  private setScroll(value: number): void {
    const next = Math.max(0, Math.min(this.maxScroll(), value));
    if (next === this.scroll) return;
    this.scroll = next;
    this.layoutCards();
  }

  /** Раскладка карточек по текущему сдвигу, затухание у правого края, стрелки и ползунок. */
  private layoutCards(): void {
    this.cards.forEach((c, i) => c.box.setPosition(this.cardX(i), CARD.top));
    const max = this.maxScroll();
    this.listFade.clear();
    this.listCover.clear();
    // левый край окна списка (10 px от края экрана) закрыт подложкой, правый — подложкой правой части панели и полосой затухания
    this.listCover.fillStyle(BAR_FILL, 1).fillRect(0, BOTTOM_Y + 2, LIST.x, BOTTOM_H - 2);
    this.listCover.fillStyle(BAR_FILL, 1).fillRect(LIST.x + LIST.w, BOTTOM_Y + 2, W - LIST.x - LIST.w, BOTTOM_H - 2);
    if (max > 0) {
      const strips = 8;
      for (let k = 0; k < strips; k++) {
        const w = 56 / strips;
        this.listFade.fillStyle(BAR_FILL, (k + 1) / strips).fillRect(LIST.x + LIST.w - 56 + k * w, BOTTOM_Y + 2, w + 0.5, BOTTOM_H - 2);
      }
    }
    this.listArrows[0].setVisible(this.scroll < max - 1);
    this.listArrows[1].setVisible(this.scroll > 1);
    this.listTrack.clear();
    if (max > 0) {
      const trackW = LIST.w;
      const thumb = Math.max(40, (trackW * LIST.w) / (LIST.w + max));
      this.listTrack.fillStyle(0x1a2a48, 1).fillRoundedRect(LIST.x, H - 6, trackW, 4, 2);
      this.listTrack.fillStyle(0x4a76b8, 1).fillRoundedRect(LIST.x + ((trackW - thumb) * this.scroll) / max, H - 6, thumb, 4, 2);
    }
  }

  private buildCard(id: TowerId): ListCard {
    const scene = this.scene;
    const open = isTowerOpen(id);
    const box = scene.add.container(0, CARD.top).setDepth(D.item);
    const bg = scene.add.graphics();
    const need = scene.add.graphics();
    box.add(bg);
    // Название башни сверху (русское или английское, по языку игры), ниже значок, у открытой — цена
    const name = this.text(CARD.w / 2, 11, t(`tower${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey), 14, TEXT_COLORS.main).setDepth(0);
    if (name.width > CARD.w - 8) name.setScale((CARD.w - 8) / name.width);
    box.add(name);
    const icon = scene.add.container(CARD.w / 2, 39).setScale(0.44);
    createTowerArt(scene, icon, id);
    box.add(icon);
    let price: Phaser.GameObjects.Text | null = null;
    if (open) {
      price = this.text(CARD.w / 2, 73, String(towerPrice(id)), 22, TEXT_COLORS.accent).setDepth(0);
      box.add(price);
      box.add(need);
    } else {
      // Закрытая башня: серая «шторка», замок и «Ур. N»
      const veil = scene.add.graphics();
      veil.fillStyle(0x070d1c, 0.7).fillRoundedRect(0, 0, CARD.w, CARD.h, 12);
      box.add(veil);
      box.add(this.lockIcon(CARD.w / 2, 36));
      const lock = this.text(CARD.w / 2, 74, t('lockedTree'), 17, TEXT_COLORS.soft).setDepth(0);
      if (lock.width > CARD.w - 10) lock.setScale((CARD.w - 10) / lock.width);
      box.add(lock);
    }
    const c: ListCard = { id, open, box, bg, need, price, key: '' };
    this.drawCard(c);
    return c;
  }

  /** Перерисовать карточку башни по состоянию: выбрана (золотая рамка, приподнята), не хватает монет (тусклая, красная цена, полоска), закрыта. */
  private drawCard(c: ListCard): void {
    const armed = this.selected === c.id;
    const poor = c.open && this.coins < towerPrice(c.id);
    const share = poor ? Math.max(0, Math.min(1, this.coins / towerPrice(c.id))) : 1;
    const key = `${armed}|${poor}|${Math.round(share * 40)}`;
    if (key === c.key) return;
    c.key = key;
    c.bg.clear();
    if (c.open) {
      c.bg.fillStyle(armed ? 0x27497f : 0x1d3760, 1).fillRoundedRect(0, 0, CARD.w, CARD.h, 12);
      c.bg.lineStyle(armed ? 4 : 2, armed ? COLORS.gold : 0x33578f, 1).strokeRoundedRect(armed ? 2 : 1, armed ? 2 : 1, CARD.w - (armed ? 4 : 2), CARD.h - (armed ? 4 : 2), 12);
    } else {
      c.bg.fillStyle(0x17243f, 1).fillRoundedRect(0, 0, CARD.w, CARD.h, 12);
      c.bg.lineStyle(2, 0x2a3a5c, 1).strokeRoundedRect(1, 1, CARD.w - 2, CARD.h - 2, 12);
    }
    c.box.setY(CARD.top + (armed ? -8 : 0)).setAlpha(poor && !armed ? 0.62 : 1);
    c.price?.setColor(poor ? TEXT_COLORS.bad : TEXT_COLORS.accent);
    c.need.clear();
    if (poor) {
      c.need.fillStyle(0x26385e, 1).fillRoundedRect(10, CARD.h - 9, CARD.w - 20, 4, 2);
      c.need.fillStyle(0xff6b6b, 1).fillRoundedRect(10, CARD.h - 9, Math.max(4, (CARD.w - 20) * share), 4, 2);
    }
  }

  /** Касания списка: смахивание — прокрутка, короткое касание — нажатие на карточку башни; колесо мыши — прокрутка. */
  private bindList(): void {
    const scene = this.scene;
    scene.add
      .zone(LIST.x + LIST.w / 2, LIST.y + LIST.h / 2, LIST.w, LIST.h)
      .setDepth(D.item + 4)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.drag = { id: pointer.id, startX: pointer.x, startY: pointer.y, scroll0: this.scroll, moved: false };
      });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || d.id !== pointer.id) return;
      const dx = pointer.x - d.startX;
      if (!d.moved && Math.abs(dx) > DRAG_PX) d.moved = true;
      if (d.moved) this.setScroll(d.scroll0 - dx);
    });
    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || d.id !== pointer.id) return;
      this.drag = null;
      if (!d.moved && Math.hypot(pointer.x - d.startX, pointer.y - d.startY) <= DRAG_PX) this.tapList(pointer.x);
    });
    scene.input.on('pointerupoutside', () => {
      this.drag = null;
    });
    scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number) => {
      if (pointer.x < LIST.x || pointer.x > LIST.x + LIST.w || pointer.y < LIST.y) return;
      this.setScroll(this.scroll + (Math.abs(dx) > Math.abs(dy) ? dx : dy));
    });
  }

  /** Нажатие на карточку башни в списке по координате x. */
  private tapList(x: number): void {
    if (x < LIST.x || x > LIST.x + LIST.w) return;
    const slot = (x - LIST.x + this.scroll) / (CARD.w + CARD.gap);
    const index = Math.floor(slot);
    if (slot - index > CARD.w / (CARD.w + CARD.gap) || index < 0 || index >= this.order.length) return;
    this.callbacks.onTower(this.order[index]);
  }

  // ---------------------------------------------------------------- рисование

  private hintY(): number {
    return (this.card?.visible ? (this.card.isCompact ? CARD_AREA.y : this.card.top) : BOTTOM_Y) - 34;
  }

  private refitHint(): void {
    if (this.hintMessage === null) return;
    this.hintText.setY(this.hintY());
    this.fitPlate(this.hintText, this.hintPlate, this.hintY());
  }

  /** Тёмная скруглённая «таблетка» под выводом в верхней полосе (`redraw` — перерисовать только плашку жизней: она меняет ширину). */
  private chipPlate(x: number, w: number, redraw = false): void {
    if (redraw) this.topGfx.clear();
    this.topGfx.fillStyle(0x0d162b, 1).fillRoundedRect(x, 5, w, TOP_H - 10, (TOP_H - 10) / 2);
    this.topGfx.lineStyle(1, BAR_EDGE, 1).strokeRoundedRect(x, 5, w, TOP_H - 10, (TOP_H - 10) / 2);
    if (redraw) {
      this.chipPlate(12, 470);
      this.chipPlate(494, 130);
    }
  }

  private drawChip(danger: boolean): void {
    this.chipDanger = danger;
    this.chipFill = danger ? COLORS.loseLine : 0x5c2436;
    this.chipBg.clear();
    this.chipBg.fillStyle(this.chipFill, 0.95).fillRoundedRect(0, 0, 128, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
    this.chipBg.lineStyle(2, COLORS.loseLine, 1).strokeRoundedRect(0, 0, 128, 34, { tl: 0, bl: 0, tr: 17, br: 17 });
  }

  private text(x: number, y: number, str: string, size: number, color: string = TEXT_COLORS.main, ox = 0.5, oy = 0.5): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: TEXT_COLORS.stroke, strokeThickness: size > 20 ? 4 : 0, resolution: 2 })
      .setOrigin(ox, oy)
      .setDepth(D.item + 1);
  }

  private coin(x: number, y: number, r: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(D.item + 1);
    g.fillStyle(COLORS.gold, 1).fillCircle(x, y, r);
    g.lineStyle(2.5, COLORS.goldEdge, 1).strokeCircle(x, y, r);
    g.lineStyle(2, COLORS.goldEdge, 1).strokeCircle(x, y, r * 0.55);
    return g;
  }

  /** Замок закрытой башни: корпус и дужка (рисуется кодом). */
  private lockIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.lineStyle(3, 0xc9d6f2, 1);
    g.beginPath();
    g.arc(x, y - 3, 6, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0xc9d6f2, 1).fillRoundedRect(x - 9, y - 3, 18, 14, 3);
    g.fillStyle(0x14264b, 1).fillCircle(x, y + 4, 2.4);
    return g;
  }

  /** Первичная отрисовка (после создания всех объектов). */
  init(maxLives: number): void {
    this.setSelected(null);
    this.setLives(maxLives, maxLives);
    this.setSpeed(1);
  }
}
