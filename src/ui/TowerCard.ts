import Phaser from 'phaser';
import { t } from '../i18n';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

/** Что показывает карточка выбранной башни (тексты уже на нужном языке; считает сцена). */
export interface CardModel {
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

const BTN_H = 34;
const PICK_H = 64;
const PAD = 12;
/** Сторона кнопок поворота луча (Шприц), пикселей: они стоят справа от первых двух строк чисел и не должны их закрывать. */
const ROT = 36;

/**
 * Карточка выбранной башни: лежит на месте кнопок башен в правой панели. Название и уровень, числа, выбор мутации (две кнопки),
 * поворот луча (Шприц), «Слить» и «Продать». Кнопки-зоны созданы один раз и только переносятся (внутри нажатия ничего не уничтожается).
 */
export class TowerCard {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly btns: Phaser.GameObjects.Graphics;
  private readonly all: Phaser.GameObjects.GameObject[] = [];
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly statTexts: Phaser.GameObjects.Text[];
  private readonly headerText: Phaser.GameObjects.Text;
  private readonly pickNames: Phaser.GameObjects.Text[];
  private readonly pickDescs: Phaser.GameObjects.Text[];
  private readonly listText: Phaser.GameObjects.Text;
  private readonly mergeText: Phaser.GameObjects.Text;
  private readonly sellText: Phaser.GameObjects.Text;
  private readonly closeText: Phaser.GameObjects.Text;
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly zones: Record<'close' | 'merge' | 'sell' | 'pick0' | 'pick1' | 'rotL' | 'rotR', Phaser.GameObjects.Zone>;
  private readonly rects: Record<string, Rect> = {};
  private shown = false;
  private mergeEnabled = false;
  private pickVisible = [false, false];
  private rotVisible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private area: Rect,
    private readonly depth: number,
    private readonly callbacks: CardCallbacks,
  ) {
    const d = depth;
    this.bg = scene.add.graphics().setDepth(d);
    this.btns = scene.add.graphics().setDepth(d + 1);
    this.all.push(this.bg, this.btns);
    this.nameText = this.text(0, 0, '', 21, TEXT_COLORS.main, 0);
    this.levelText = this.text(0, 0, '', 16, TEXT_COLORS.accent, 0);
    this.statTexts = [0, 1, 2].map(() => this.text(0, 0, '', 14, TEXT_COLORS.soft, 0).setFontStyle('normal'));
    this.headerText = this.text(0, 0, '', 14, TEXT_COLORS.accent, 0);
    this.pickNames = [0, 1].map(() => this.text(0, 0, '', 17, TEXT_COLORS.main, 0));
    this.pickDescs = [0, 1].map(() => this.text(0, 0, '', 13, TEXT_COLORS.soft, 0).setFontStyle('normal').setWordWrapWidth(area.w - 2 * PAD - 12));
    this.listText = this.text(0, 0, '', 15, TEXT_COLORS.main, 0).setWordWrapWidth(area.w - 2 * PAD);
    this.mergeText = this.text(0, 0, '', 18, TEXT_COLORS.main);
    this.sellText = this.text(0, 0, '', 18, TEXT_COLORS.main);
    this.closeText = this.text(0, 0, '✕', 22, TEXT_COLORS.soft);
    // Подложка ловит нажатия мимо кнопок (иначе они дошли бы до кнопок башен под карточкой) и на всякий случай передаёт их карточке
    this.blocker = scene.add
      .zone(area.x + area.w / 2, area.y + area.h / 2, area.w, area.h)
      .setDepth(d + 1)
      .setInteractive()
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.pressAt(pointer.x, pointer.y));
    this.all.push(this.blocker);
    const zone = (w: number, h: number, handler: () => void): Phaser.GameObjects.Zone => {
      const z = scene.add.zone(0, 0, w, h).setDepth(d + 3).setInteractive({ useHandCursor: true }).on('pointerdown', handler);
      this.all.push(z);
      return z;
    };
    const bw = area.w - 2 * PAD;
    this.zones = {
      close: zone(44, 44, callbacks.onClose),
      merge: zone(bw, BTN_H, () => {
        if (this.mergeEnabled) callbacks.onMerge();
      }),
      sell: zone(bw, BTN_H, callbacks.onSell),
      pick0: zone(bw, PICK_H, () => callbacks.onPick(0)),
      pick1: zone(bw, PICK_H, () => callbacks.onPick(1)),
      rotL: zone(ROT, ROT, () => callbacks.onRotate(-1)),
      rotR: zone(ROT, ROT, () => callbacks.onRotate(1)),
    };
    this.setShown(false);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Перенести и растянуть карточку (над ней может появляться полоса кнопок башен); применяется при следующем `show`. */
  setArea(area: Rect): void {
    this.area = area;
    this.blocker.setPosition(area.x + area.w / 2, area.y + area.h / 2).setSize(area.w, area.h);
  }

  hide(): void {
    this.setShown(false);
  }

  /** Показывает карточку и раскладывает всё по модели. */
  show(m: CardModel): void {
    const { x, y, w, h } = this.area;
    this.setShown(true);
    this.bg.clear();
    this.bg.fillStyle(0x14264b, 1).fillRoundedRect(x, y, w, h, 14);
    this.bg.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(x, y, w, h, 14);
    this.btns.clear();

    const left = x + PAD;
    let cy = y + 12;
    this.nameText.setText(m.name).setPosition(left, cy);
    this.closeText.setPosition(x + w - 22, cy + 11);
    this.zones.close.setPosition(x + w - 22, cy + 11);
    this.rects.close = { x: x + w - 22, y: cy + 11, w: 44, h: 44 };
    cy += 28;
    this.levelText.setText(t('cardLevel', { n: m.level, max: m.maxLevel })).setPosition(left, cy);
    cy += 24;
    this.statTexts.forEach((text, i) => {
      text.setVisible(i < m.stats.length).setText(m.stats[i] ?? '').setPosition(left, cy + i * 18);
    });
    cy += 3 * 18 + 6;

    const bw = w - 2 * PAD;
    // Поворот луча (Шприц): две кнопки справа от строк чисел
    this.rotVisible = m.beam;
    if (m.beam) {
      const ry = y + 12 + 28 + 24 + 14;
      const half = ROT / 2;
      const xr = x + w - 12 - half;
      const xl = xr - ROT - 6;
      for (const [dir, zone, cx] of [[-1, this.zones.rotL, xl], [1, this.zones.rotR, xr]] as const) {
        zone.setPosition(cx, ry);
        this.btns.fillStyle(0x1d366a, 1).fillRoundedRect(cx - half, ry - half, ROT, ROT, 10);
        this.btns.lineStyle(2, COLORS.needle, 1).strokeRoundedRect(cx - half, ry - half, ROT, ROT, 10);
        this.btns.fillStyle(COLORS.needle, 1).fillTriangle(cx + dir * 9, ry, cx - dir * 6, ry - 9, cx - dir * 6, ry + 9);
      }
      this.rects.rotL = { x: xl, y: ry, w: ROT, h: ROT };
      this.rects.rotR = { x: xr, y: ry, w: ROT, h: ROT };
    }

    // Мутации: выбор (две кнопки) или список выбранных
    this.pickVisible = [false, false];
    this.listText.setVisible(false);
    this.headerText.setVisible(false);
    for (let i = 0; i < 2; i++) {
      this.pickNames[i].setVisible(false);
      this.pickDescs[i].setVisible(false);
    }
    if (m.pending) {
      this.headerText.setVisible(true).setText(t('cardPick')).setPosition(left, cy);
      cy += 20;
      m.pending.slice(0, 2).forEach((opt, i) => {
        const by = cy + i * (PICK_H + 4);
        this.btns.fillStyle(0x2a4d8e, 1).fillRoundedRect(left, by, bw, PICK_H, 12);
        this.btns.lineStyle(3, COLORS.gold, 1).strokeRoundedRect(left, by, bw, PICK_H, 12);
        this.pickNames[i].setVisible(true).setText(opt.name).setPosition(left + 8, by + 8);
        this.pickDescs[i].setVisible(true).setText(opt.desc).setPosition(left + 8, by + 32);
        const zone = i === 0 ? this.zones.pick0 : this.zones.pick1;
        zone.setPosition(left + bw / 2, by + PICK_H / 2);
        this.pickVisible[i] = true;
        this.rects[`pick${i}`] = { x: left + bw / 2, y: by + PICK_H / 2, w: bw, h: PICK_H };
      });
    } else if (m.picked.length > 0) {
      this.headerText.setVisible(true).setText(t('cardMutations')).setPosition(left, cy);
      cy += 20;
      this.listText.setVisible(true).setText(m.picked.map((p) => `• ${p.name} — ${p.desc}`).join('\n')).setPosition(left, cy);
    }
    this.applyEnabled();

    // Нижние кнопки: «Слить» и «Продать»
    const sellY = y + h - PAD - BTN_H;
    const mergeY = sellY - 6 - BTN_H;
    this.mergeEnabled = m.merge === 'ready' || m.merge === 'active';
    const mergeColor = m.merge === 'active' ? 0x9a5a1c : this.mergeEnabled ? 0x2a8a4a : 0x2a3552;
    const mergeEdge = m.merge === 'active' ? 0xffb347 : this.mergeEnabled ? COLORS.merge : 0x4a5c82;
    this.btns.fillStyle(mergeColor, 1).fillRoundedRect(left, mergeY, bw, BTN_H, 12);
    this.btns.lineStyle(3, mergeEdge, 1).strokeRoundedRect(left, mergeY, bw, BTN_H, 12);
    const mergeLabel = { ready: t('cardMerge'), active: t('cardMergeCancel'), none: t('cardNoPair'), max: t('cardMaxLevel') }[m.merge];
    this.mergeText.setText(mergeLabel).setColor(this.mergeEnabled ? TEXT_COLORS.main : TEXT_COLORS.dim).setPosition(left + bw / 2, mergeY + BTN_H / 2);
    this.zones.merge.setPosition(left + bw / 2, mergeY + BTN_H / 2);
    this.rects.merge = { x: left + bw / 2, y: mergeY + BTN_H / 2, w: bw, h: BTN_H };
    this.btns.fillStyle(0x7a2a3a, 1).fillRoundedRect(left, sellY, bw, BTN_H, 12);
    this.btns.lineStyle(3, 0xff6b7a, 1).strokeRoundedRect(left, sellY, bw, BTN_H, 12);
    this.sellText.setText(t('cardSell', { n: m.sell })).setPosition(left + bw / 2, sellY + BTN_H / 2);
    this.zones.sell.setPosition(left + bw / 2, sellY + BTN_H / 2);
    this.rects.sell = { x: left + bw / 2, y: sellY + BTN_H / 2, w: bw, h: BTN_H };
  }

  /**
   * Нажатие в точке (x, y) экрана игры: если там кнопка карточки — выполняет её. Нужно, потому что нажатие, которое Phaser отдал не кнопке карточки,
   * а лежащей под ней кнопке башни (только что показанная карточка иногда не успевает стать «верхней»), иначе пропало бы.
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
    } else if (hit('sell')) this.callbacks.onSell();
    else return false;
    return true;
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
    for (const text of [this.nameText, this.levelText, ...this.statTexts, this.headerText, ...this.pickNames, ...this.pickDescs, this.listText, this.mergeText, this.sellText, this.closeText]) {
      text.setVisible(on);
    }
    this.blocker.input!.enabled = on;
    this.applyEnabled();
  }

  /** Включает только нужные зоны-кнопки (скрытые не должны ловить нажатия). */
  private applyEnabled(): void {
    const on = this.shown;
    this.setZone(this.zones.close, on);
    this.setZone(this.zones.merge, on);
    this.setZone(this.zones.sell, on);
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
