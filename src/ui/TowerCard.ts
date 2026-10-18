import Phaser from 'phaser';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { t } from '../i18n';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

/** Что показывает карточка выбранной башни (тексты уже на нужном языке; считает сцена). */
export interface CardModel {
  /** Какая башня (для значка). */
  id: TowerId;
  name: string;
  level: number;
  maxLevel: number;
  /** До трёх строк чисел башни. */
  stats: string[];
  /** Два варианта мутации на выбор (если выбор ждёт) или null. */
  pending: { name: string; desc: string }[] | null;
  /** Уже выбранные мутации. */
  picked: { name: string; desc: string }[];
  /** Башня с лучом: показываются кнопки поворота на 45° влево и вправо. */
  beam: boolean;
  /** Слияние: можно («ready»), нет пары («none»), высший уровень («max»), идёт выбор пары («active» — кнопка «Отмена»). */
  merge: 'ready' | 'none' | 'max' | 'active';
  sell: number;
  /** Подсказка режима слияния (рисуется в узкой полосе вместо полной карточки); null — не режим слияния. */
  mergeHint: string | null;
}

export interface CardCallbacks {
  onMerge: () => void;
  onSell: () => void;
  onPick: (index: number) => void;
  onRotate: (dir: 1 | -1) => void;
  onClose: () => void;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardGeometry {
  visible: boolean;
  merge: Rect & { enabled: boolean };
  sell: Rect;
  picks: (Rect & { visible: boolean })[];
  rotateLeft: Rect & { visible: boolean };
  rotateRight: Rect & { visible: boolean };
  close: Rect;
}

/** Высота кнопок «Слить», «Продать» и выбора мутации; ширина «Слить» и «Продать». Между «Слить» и «Продать» — зазор SELL_GAP (решение владельца 8 и 13 октября 2026: без подтверждений, зазор больше). */
const BTN_H = 84;
const BTN_W = 180;
const SELL_GAP = 40;
const PICK_W = 240;
const PAD = 12;
/** Сторона кнопок поворота луча (Шприц), пикселей. */
const ROT = 40;
const CLOSE = 44;
/** Высота узкой полосы карточки в режиме слияния, пикселей: полная карточка (104 px) и подсказка над ней закрывали бы кандидатов в нижней части карты. */
export const CARD_COMPACT_H = 60;
const COMPACT_BTN_H = 46;

/**
 * Карточка выбранной стоящей башни: полоса над нижней панелью, на карте. Слева «✕», значок, название и уровень; дальше числа башни (или две кнопки выбора мутации);
 * справа поворот луча (Шприц), «Слить» и «Продать» (между ними зазор). Кнопки-зоны созданы один раз и только переносятся (внутри нажатия ничего не уничтожается).
 */
export class TowerCard {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly btns: Phaser.GameObjects.Graphics;
  private readonly all: Phaser.GameObjects.GameObject[] = [];
  private readonly icon: Phaser.GameObjects.Container;
  private iconId: TowerId | null = null;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly statTexts: Phaser.GameObjects.Text[];
  private readonly pickNames: Phaser.GameObjects.Text[];
  private readonly pickDescs: Phaser.GameObjects.Text[];
  private readonly listText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly mergeText: Phaser.GameObjects.Text;
  private readonly mergeSub: Phaser.GameObjects.Text;
  private readonly sellText: Phaser.GameObjects.Text;
  private readonly sellSub: Phaser.GameObjects.Text;
  private readonly closeText: Phaser.GameObjects.Text;
  private readonly zones: Record<'close' | 'merge' | 'sell' | 'pick0' | 'pick1' | 'rotL' | 'rotR', Phaser.GameObjects.Zone>;
  private readonly rects: Record<string, Rect> = {};
  private shown = false;
  private mergeEnabled = false;
  private sellVisible = true;
  private pickVisible = [false, false];
  /** Когда (performance.now) нажали кнопку карточки: нажатие, после которого карточка перерисовалась или закрылась, всё равно принадлежит карточке, а не карте под ней. */
  private pressedAt = -1e9;
  private rotVisible = false;
  private compact = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly area: Rect,
    private readonly depth: number,
    private readonly callbacks: CardCallbacks,
  ) {
    const d = depth;
    this.bg = scene.add.graphics().setDepth(d);
    this.btns = scene.add.graphics().setDepth(d + 1);
    this.icon = scene.add.container(0, 0).setDepth(d + 2).setScale(0.6);
    this.all.push(this.bg, this.btns, this.icon);
    this.nameText = this.text(0, 0, '', 22, TEXT_COLORS.main, 0);
    this.levelText = this.text(0, 0, '', 17, TEXT_COLORS.accent, 0);
    this.statTexts = [0, 1, 2].map(() => this.text(0, 0, '', 15, TEXT_COLORS.soft, 0).setFontStyle('normal'));
    this.pickNames = [0, 1].map(() => this.text(0, 0, '', 17, TEXT_COLORS.main, 0));
    this.pickDescs = [0, 1].map(() => this.text(0, 0, '', 13, TEXT_COLORS.soft, 0).setFontStyle('normal').setWordWrapWidth(PICK_W - 20));
    this.listText = this.text(0, 0, '', 13, TEXT_COLORS.main, 0).setFontStyle('normal').setWordWrapWidth(330);
    this.hintText = this.text(0, 0, '', 18, TEXT_COLORS.accent, 0).setFontStyle('normal').setVisible(false);
    this.mergeText = this.text(0, 0, '', 24, TEXT_COLORS.main);
    this.mergeSub = this.text(0, 0, '', 14, TEXT_COLORS.main).setFontStyle('normal');
    this.sellText = this.text(0, 0, '', 24, TEXT_COLORS.main);
    this.sellSub = this.text(0, 0, '', 14, TEXT_COLORS.main).setFontStyle('normal');
    this.closeText = this.text(0, 0, '✕', 22, TEXT_COLORS.soft);
    // Карточка лежит на карте: нажатия мимо её кнопок проходят к карте под ней (иначе клетки в нижней полосе окна нельзя было бы тапнуть, например при выборе пары для слияния)
    const zone = (w: number, h: number, handler: () => void): Phaser.GameObjects.Zone => {
      const press = (): void => {
        this.pressedAt = performance.now();
        handler();
      };
      const z = scene.add.zone(0, 0, w, h).setDepth(d + 3).setInteractive({ useHandCursor: true }).on('pointerdown', press);
      this.all.push(z);
      return z;
    };
    this.zones = {
      close: zone(CLOSE, CLOSE, callbacks.onClose),
      merge: zone(BTN_W, BTN_H, () => {
        if (this.mergeEnabled) callbacks.onMerge();
      }),
      sell: zone(BTN_W, BTN_H, callbacks.onSell),
      pick0: zone(PICK_W, BTN_H, () => callbacks.onPick(0)),
      pick1: zone(PICK_W, BTN_H, () => callbacks.onPick(1)),
      rotL: zone(ROT, ROT, () => callbacks.onRotate(-1)),
      rotR: zone(ROT, ROT, () => callbacks.onRotate(1)),
    };
    this.setShown(false);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Карточка сейчас узкая полоса режима слияния (а не полная). */
  get isCompact(): boolean {
    return this.shown && this.compact;
  }

  hide(): void {
    this.setShown(false);
  }

  /** Показывает карточку и раскладывает всё по модели. */
  show(m: CardModel): void {
    this.compact = m.merge === 'active';
    if (this.compact) {
      this.showCompact(m);
      return;
    }
    const { x, y, w, h } = this.area;
    this.setShown(true);
    this.zones.merge.setSize(BTN_W, BTN_H);
    this.bg.clear();
    this.bg.fillStyle(0x0e1a32, 0.9).fillRoundedRect(x, y, w, h, 14);
    this.bg.lineStyle(2, 0x33578f, 1).strokeRoundedRect(x, y, w, h, 14);
    this.btns.clear();
    const cy = y + h / 2;

    // Слева: «✕», значок, название и уровень слияния
    const closeX = x + PAD + CLOSE / 2;
    this.closeText.setPosition(closeX, cy);
    this.zones.close.setPosition(closeX, cy);
    this.btns.fillStyle(0x1d3760, 1).fillCircle(closeX, cy, CLOSE / 2);
    this.btns.lineStyle(2, 0x33578f, 1).strokeCircle(closeX, cy, CLOSE / 2);
    this.rects.close = { x: closeX, y: cy, w: CLOSE, h: CLOSE };
    if (this.iconId !== m.id) {
      this.icon.removeAll(true);
      createTowerArt(this.scene, this.icon, m.id);
      this.iconId = m.id;
    }
    const iconX = closeX + CLOSE / 2 + 12 + 30;
    this.icon.setPosition(iconX, cy);
    const nameX = iconX + 40;
    this.nameText.setText(m.name).setPosition(nameX, cy - 26);
    this.levelText.setText(t('cardLevel', { n: m.level, max: m.maxLevel })).setPosition(nameX, cy + 2);

    // Справа: «Продать» и левее неё «Слить» с зазором; левее — поворот луча (Шприц)
    const sellX = x + w - PAD - BTN_W / 2;
    const mergeX = sellX - BTN_W - SELL_GAP;
    const rightEdge = mergeX - BTN_W / 2 - 14;
    this.rotVisible = m.beam;
    let midRight = rightEdge; // правее этой черты в середине карточки места нет
    if (m.beam) {
      const half = ROT / 2;
      const xr = rightEdge - half;
      const xl = xr - ROT - 6;
      for (const [dir, zone, cx] of [[-1, this.zones.rotL, xl], [1, this.zones.rotR, xr]] as const) {
        zone.setPosition(cx, cy);
        this.btns.fillStyle(0x1d366a, 1).fillRoundedRect(cx - half, cy - half, ROT, ROT, 10);
        this.btns.lineStyle(2, COLORS.needle, 1).strokeRoundedRect(cx - half, cy - half, ROT, ROT, 10);
        this.btns.fillStyle(COLORS.needle, 1).fillTriangle(cx + dir * 10, cy, cx - dir * 7, cy - 10, cx - dir * 7, cy + 10);
      }
      this.rects.rotL = { x: xl, y: cy, w: ROT, h: ROT };
      this.rects.rotR = { x: xr, y: cy, w: ROT, h: ROT };
      midRight = xl - half - 10;
    }

    // Середина: выбор мутации (две кнопки) или числа башни и выбранные мутации
    const midX = nameX + 190;
    this.pickVisible = [false, false];
    this.listText.setVisible(false);
    for (let i = 0; i < 2; i++) {
      this.pickNames[i].setVisible(false);
      this.pickDescs[i].setVisible(false);
    }
    this.statTexts.forEach((text) => text.setVisible(false));
    if (m.pending) {
      // у башни с лучом справа от вариантов стоят кнопки поворота: варианты уже, чтобы не налезать на них
      const pickW = Math.min(PICK_W, Math.floor((midRight - midX - 8) / 2));
      m.pending.slice(0, 2).forEach((opt, i) => {
        const bx = midX + i * (pickW + 8);
        this.btns.fillStyle(0x2a4d8e, 1).fillRoundedRect(bx, cy - BTN_H / 2, pickW, BTN_H, 12);
        this.btns.lineStyle(3, COLORS.gold, 1).strokeRoundedRect(bx, cy - BTN_H / 2, pickW, BTN_H, 12);
        this.pickDescs[i].setWordWrapWidth(pickW - 20);
        this.pickNames[i].setVisible(true).setText(opt.name).setPosition(bx + 10, cy - BTN_H / 2 + 8);
        this.pickDescs[i].setVisible(true).setText(opt.desc).setPosition(bx + 10, cy - BTN_H / 2 + 31);
        const zone = i === 0 ? this.zones.pick0 : this.zones.pick1;
        zone.setSize(pickW, BTN_H).setPosition(bx + pickW / 2, cy);
        this.pickVisible[i] = true;
        this.rects[`pick${i}`] = { x: bx + pickW / 2, y: cy, w: pickW, h: BTN_H };
      });
    } else {
      this.statTexts.forEach((text, i) => {
        text.setVisible(i < m.stats.length).setText(m.stats[i] ?? '').setPosition(midX, y + 9 + i * 18);
      });
      const ty = y + 9 + Math.max(1, m.stats.length) * 18 + 2;
      if (m.picked.length > 0) this.listText.setVisible(true).setText(`${t('cardMutations')} ${m.picked.map((p) => p.name).join(', ')}`).setPosition(midX, ty);
    }
    this.applyEnabled();

    // «Слить» и «Продать»
    this.sellVisible = m.merge !== 'active'; // в режиме слияния «Продать» скрыта: выбор пары по карте не должен заканчиваться случайной продажей
    this.mergeEnabled = m.merge === 'ready' || m.merge === 'active';
    const mergeColor = m.merge === 'active' ? 0x9a5a1c : this.mergeEnabled ? 0x1f7a46 : 0x25324d;
    const mergeEdge = m.merge === 'active' ? 0xffb347 : this.mergeEnabled ? COLORS.merge : 0x3a4a6b;
    this.btns.fillStyle(mergeColor, 1).fillRoundedRect(mergeX - BTN_W / 2, cy - BTN_H / 2, BTN_W, BTN_H, 14);
    this.btns.lineStyle(3, mergeEdge, 1).strokeRoundedRect(mergeX - BTN_W / 2, cy - BTN_H / 2, BTN_W, BTN_H, 14);
    const mergeLabel = { ready: t('cardMerge'), active: t('cardMergeCancel'), none: t('cardNoPair'), max: t('cardMaxLevel') }[m.merge];
    this.mergeText.setText(mergeLabel).setColor(this.mergeEnabled ? TEXT_COLORS.main : TEXT_COLORS.dim);
    const longLabel = this.mergeText.width > BTN_W - 16;
    if (longLabel) this.mergeText.setScale((BTN_W - 16) / this.mergeText.width);
    else this.mergeText.setScale(1);
    this.mergeText.setPosition(mergeX, cy);
    this.mergeSub.setVisible(false);
    this.zones.merge.setPosition(mergeX, cy);
    this.rects.merge = { x: mergeX, y: cy, w: BTN_W, h: BTN_H };
    if (this.sellVisible) {
      this.btns.fillStyle(0x8a2f45, 1).fillRoundedRect(sellX - BTN_W / 2, cy - BTN_H / 2, BTN_W, BTN_H, 14);
      this.btns.lineStyle(3, 0xff8aa0, 1).strokeRoundedRect(sellX - BTN_W / 2, cy - BTN_H / 2, BTN_W, BTN_H, 14);
      this.sellText.setText(t('cardSell', { n: m.sell })).setPosition(sellX, cy);
      if (this.sellText.width > BTN_W - 16) this.sellText.setScale((BTN_W - 16) / this.sellText.width);
      else this.sellText.setScale(1);
      this.zones.sell.setPosition(sellX, cy);
      this.rects.sell = { x: sellX, y: cy, w: BTN_W, h: BTN_H };
    } else {
      this.rects.sell = { x: 0, y: 0, w: 0, h: 0 };
    }
    this.sellText.setVisible(this.sellVisible);
    this.sellSub.setVisible(false);
    this.applyEnabled();
  }

  /**
   * Режим слияния: вместо полной карточки узкая полоса у нижнего края области карточки — «✕», название и уровень, подсказка и «Отмена». «Продать», мутации, числа и поворот скрыты:
   * выбор пары по карте не должен заканчиваться случайной продажей, а полоса закрывает всего CARD_COMPACT_H px карты, а не 104 + подсказку над ней.
   */
  private showCompact(m: CardModel): void {
    const { x, y, w, h } = this.area;
    const sh = CARD_COMPACT_H;
    const sy = y + h - sh;
    const cy = sy + sh / 2;
    this.setShown(true);
    this.bg.clear();
    this.bg.fillStyle(0x0e1a32, 0.92).fillRoundedRect(x, sy, w, sh, 14);
    this.bg.lineStyle(2, 0xffb347, 1).strokeRoundedRect(x, sy, w, sh, 14);
    this.btns.clear();
    const closeX = x + PAD + CLOSE / 2;
    this.closeText.setPosition(closeX, cy);
    this.zones.close.setPosition(closeX, cy);
    this.btns.fillStyle(0x1d3760, 1).fillCircle(closeX, cy, CLOSE / 2);
    this.btns.lineStyle(2, 0x33578f, 1).strokeCircle(closeX, cy, CLOSE / 2);
    this.rects.close = { x: closeX, y: cy, w: CLOSE, h: CLOSE };
    this.icon.setVisible(false);
    const nameX = closeX + CLOSE / 2 + 14;
    this.nameText.setText(m.name).setPosition(nameX, cy - 14);
    this.levelText.setText(t('cardLevel', { n: m.level, max: m.maxLevel })).setPosition(nameX, cy + 13);
    // Справа «Отмена»; между названием и ней — подсказка
    const cancelX = x + w - PAD - BTN_W / 2;
    this.btns.fillStyle(0x9a5a1c, 1).fillRoundedRect(cancelX - BTN_W / 2, cy - COMPACT_BTN_H / 2, BTN_W, COMPACT_BTN_H, 14);
    this.btns.lineStyle(3, 0xffb347, 1).strokeRoundedRect(cancelX - BTN_W / 2, cy - COMPACT_BTN_H / 2, BTN_W, COMPACT_BTN_H, 14);
    this.mergeText.setText(t('cardMergeCancel')).setColor(TEXT_COLORS.main).setPosition(cancelX, cy);
    if (this.mergeText.width > BTN_W - 16) this.mergeText.setScale((BTN_W - 16) / this.mergeText.width);
    else this.mergeText.setScale(1);
    this.mergeSub.setVisible(false);
    this.zones.merge.setSize(BTN_W, COMPACT_BTN_H).setPosition(cancelX, cy);
    this.rects.merge = { x: cancelX, y: cy, w: BTN_W, h: COMPACT_BTN_H };
    this.mergeEnabled = true;
    this.sellVisible = false;
    this.pickVisible = [false, false];
    this.rotVisible = false;
    this.rects.sell = { x: 0, y: 0, w: 0, h: 0 };
    for (const text of [...this.statTexts, ...this.pickNames, ...this.pickDescs, this.listText, this.sellText, this.sellSub]) text.setVisible(false);
    const hintX = nameX + 180;
    const hintW = cancelX - BTN_W / 2 - 14 - hintX;
    this.hintText.setWordWrapWidth(hintW).setText(m.mergeHint ?? '').setPosition(hintX, cy - this.hintText.height / 2).setVisible(true);
    this.hintText.setY(cy - this.hintText.height / 2);
    this.applyEnabled();
  }

  /**
   * Нажатие в точке (x, y) экрана игры: если там кнопка карточки — выполняет её. Нужно, потому что нажатие, которое Phaser отдал не кнопке карточки,
   * а подложке (только что показанная карточка иногда не успевает стать «верхней»), иначе пропало бы.
   */
  pressAt(x: number, y: number): boolean {
    if (!this.shown) return false;
    const hit = (key: string): boolean => {
      const r = this.rects[key];
      return Boolean(r) && Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;
    };
    if (hit('close')) this.callbacks.onClose();
    else if (this.pickVisible[0] && hit('pick0')) this.callbacks.onPick(0);
    else if (this.pickVisible[1] && hit('pick1')) this.callbacks.onPick(1);
    else if (this.rotVisible && hit('rotL')) this.callbacks.onRotate(-1);
    else if (this.rotVisible && hit('rotR')) this.callbacks.onRotate(1);
    else if (hit('merge')) {
      if (this.mergeEnabled) this.callbacks.onMerge();
    } else if (this.sellVisible && hit('sell')) this.callbacks.onSell();
    else return false;
    return true;
  }

  /** Точка (x, y) экрана игры попадает на кнопку карточки (с запасом 4 px): такое нажатие принадлежит карточке, а не карте. */
  coversButton(x: number, y: number): boolean {
    // кнопка карточки сработала только что (то же нажатие): после выбора мутации, «✕» или «Продать» кнопки уже другие или карточки нет, а нажатие карте не принадлежит
    if (performance.now() - this.pressedAt < 30) return true;
    if (!this.shown) return false;
    const keys = ['close', 'merge'];
    if (this.sellVisible) keys.push('sell');
    if (this.pickVisible[0]) keys.push('pick0');
    if (this.pickVisible[1]) keys.push('pick1');
    if (this.rotVisible) keys.push('rotL', 'rotR');
    return keys.some((key) => {
      const r = this.rects[key];
      return Boolean(r) && Math.abs(x - r.x) <= r.w / 2 + 4 && Math.abs(y - r.y) <= r.h / 2 + 4;
    });
  }

  /** Где кнопки карточки на экране игры (для проверок и бота); когда карточка скрыта, visible = false. */
  geometry(): CardGeometry {
    const r = (key: string): Rect => this.rects[key] ?? { x: 0, y: 0, w: 0, h: 0 };
    return {
      visible: this.shown,
      merge: { ...r('merge'), enabled: this.shown && this.mergeEnabled },
      sell: r('sell'),
      picks: [0, 1].map((i) => ({ ...r(`pick${i}`), visible: this.shown && this.pickVisible[i] })),
      rotateLeft: { ...r('rotL'), visible: this.shown && this.rotVisible },
      rotateRight: { ...r('rotR'), visible: this.shown && this.rotVisible },
      close: r('close'),
    };
  }

  private setShown(on: boolean): void {
    this.shown = on;
    for (const item of this.all) (item as unknown as { setVisible(v: boolean): unknown }).setVisible(on);
    for (const text of [this.nameText, this.levelText, ...this.statTexts, ...this.pickNames, ...this.pickDescs, this.listText, this.mergeText, this.mergeSub, this.sellText, this.sellSub, this.closeText]) {
      text.setVisible(on);
    }
    this.hintText.setVisible(on && this.compact);
    this.applyEnabled();
  }

  /** Включает только нужные зоны-кнопки (скрытые не должны ловить нажатия). */
  private applyEnabled(): void {
    const on = this.shown;
    this.setZone(this.zones.close, on);
    this.setZone(this.zones.merge, on);
    this.setZone(this.zones.sell, on && this.sellVisible);
    this.setZone(this.zones.pick0, on && this.pickVisible[0]);
    this.setZone(this.zones.pick1, on && this.pickVisible[1]);
    this.setZone(this.zones.rotL, on && this.rotVisible);
    this.setZone(this.zones.rotR, on && this.rotVisible);
  }

  private setZone(zone: Phaser.GameObjects.Zone, on: boolean): void {
    if (zone.input) zone.input.enabled = on;
  }

  private text(x: number, y: number, str: string, size: number, color: string, ox = 0.5): Phaser.GameObjects.Text {
    const text = this.scene.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: TEXT_COLORS.stroke, strokeThickness: size > 20 ? 4 : 0, resolution: 2 })
      .setOrigin(ox, ox === 0 ? 0 : 0.5)
      .setDepth(this.depth + 2);
    return text;
  }
}
