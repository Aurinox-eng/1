import Phaser from 'phaser';
import { CONFIG } from '../config';
import { QA_MODE } from '../debug';
import { t } from '../i18n';
import { clampVolume, setCalm, setVolume, settings } from '../settings';
import { sfx } from '../sound';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Что видно в окне «Настройки» — для проверок (`window.__pvbSettings.get()`, только `?qa`). */
export interface SettingsInfo {
  open: boolean;
  /** Громкость, процентов, и режим «Без вспышек и тряски» (как в сохранении). */
  volume: number;
  calm: boolean;
  /** Громкость общего усилителя звука сейчас (null — звук ещё не запущен), сколько звуков сыграно, выключен ли звук. */
  gain: number | null;
  played: number;
  muted: boolean;
  /** Кнопки окна (центр и размер на экране игры 1280×720); пусто, когда окно закрыто. track — полоса ползунка: x0/x1 — где 0 % и 100 %. */
  rects: { close?: Rect; minus?: Rect; plus?: Rect; track?: Rect & { x0: number; x1: number }; calm?: Rect };
  /** Надписи окна. */
  texts: string[];
}

declare global {
  interface Window {
    __pvbSettings?: { get: () => SettingsInfo };
  }
}

// Раскладка окна, пикселей экрана игры 1280×720 (на телефоне 844×390 всё в 0,54 раза меньше: кнопки не меньше 80 px игры ≈ 44 точки)
const PLATE = { x: W / 2, y: H / 2, w: 780, h: 580 };
const LEFT = PLATE.x - PLATE.w / 2 + 60;
const RIGHT = PLATE.x + PLATE.w / 2 - 60;
const ROW = { title: PLATE.y - 228, volume: PLATE.y - 130, slider: PLATE.y - 50, calm: PLATE.y + 50, keys: PLATE.y + 130, close: PLATE.y + 220 };
/** Кнопки «−» и «+» у ползунка: видимый радиус и зона касания. */
const STEP_R = 34;
const HIT = 84;
/** Полоса ползунка: от правого края «−» до левого края «+». */
const TRACK = { x0: LEFT + HIT + 24, x1: RIGHT - HIT - 24, h: 12, knob: 24 };
/** Переключатель «Без вспышек и тряски». */
const SWITCH = { w: 112, h: 56 };

let current: SettingsWindow | null = null;

if (QA_MODE) {
  window.__pvbSettings = {
    get: () =>
      current?.info() ?? { open: false, volume: settings.volume, calm: settings.calm, gain: sfx.gain, played: sfx.played, muted: sfx.muted, rects: {}, texts: [] },
  };
}

/**
 * Окно «Настройки» (этап 8, пп. 2–4; решение владельца 20 ноября 2026, сообщение 1, п. 6): громкость — ползунок 0–100 % шагом 10 % с кнопками «−» и «+», переключатель «Без вспышек и тряски»,
 * строка клавиш и «Закрыть». Открывается из главного меню и из паузы (вместо прежней кнопки «Звук»). Затемнение на весь экран глушит нажатия под окном и не пропускает их к сцене
 * (на паузе тап по свободному месту не продолжает игру, пока окно открыто). Вид — как у окна сброса прогресса и паузы.
 */
export class SettingsWindow {
  private readonly box: Phaser.GameObjects.Container;
  private readonly sliderGfx: Phaser.GameObjects.Graphics;
  private readonly switchGfx: Phaser.GameObjects.Graphics;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly rects: SettingsInfo['rects'] = {};
  /** Указатель, который тянет ползунок (null — никто). */
  private dragId: number | null = null;
  private closed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    private readonly onClose: () => void,
  ) {
    current?.close();
    current = this;
    const stop = (event: Phaser.Types.Input.EventData): void => event.stopPropagation();
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82));
    items.push(
      scene.add
        .zone(W / 2, H / 2, W, H)
        .setInteractive()
        .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => stop(e)),
    );
    items.push(scene.add.rectangle(PLATE.x, PLATE.y, PLATE.w, PLATE.h, COLORS.panel, 1).setStrokeStyle(4, COLORS.panelLine, 1));
    items.push(this.label(PLATE.x, ROW.title, t('settingsTitle'), 52, TEXT_COLORS.accent, 0.5));

    // Громкость: подпись слева, значение справа; ниже «−», ползунок, «+»
    items.push(this.label(LEFT, ROW.volume, t('settingsVolume'), 34, TEXT_COLORS.main, 0));
    this.valueText = this.label(RIGHT, ROW.volume, '', 34, TEXT_COLORS.accent, 1);
    items.push(this.valueText);
    this.sliderGfx = scene.add.graphics();
    items.push(this.sliderGfx);
    const step = CONFIG.settings.volumeStep;
    items.push(...this.roundButton(LEFT + HIT / 2, ROW.slider, '−', 'minus', () => this.changeVolume(settings.volume - step)));
    items.push(...this.roundButton(RIGHT - HIT / 2, ROW.slider, '+', 'plus', () => this.changeVolume(settings.volume + step)));
    const trackW = TRACK.x1 - TRACK.x0;
    const trackZone = scene.add
      .zone((TRACK.x0 + TRACK.x1) / 2, ROW.slider, trackW + TRACK.knob * 2, HIT)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        stop(e);
        this.dragId = pointer.id;
        this.changeVolume(this.volumeAt(pointer.x));
      });
    items.push(trackZone);
    this.rects.track = { x: (TRACK.x0 + TRACK.x1) / 2, y: ROW.slider, w: trackW + TRACK.knob * 2, h: HIT, x0: TRACK.x0, x1: TRACK.x1 };
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);

    // «Без вспышек и тряски»: подпись и переключатель; нажимается вся строка
    items.push(this.label(LEFT, ROW.calm, t('settingsCalm'), 34, TEXT_COLORS.main, 0));
    this.switchGfx = scene.add.graphics();
    items.push(this.switchGfx);
    const calmRect: Rect = { x: PLATE.x, y: ROW.calm, w: RIGHT - LEFT, h: HIT };
    items.push(
      scene.add
        .zone(calmRect.x, calmRect.y, calmRect.w, calmRect.h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          stop(e);
          setCalm(!settings.calm);
          sfx.select();
          this.redraw();
        }),
    );
    this.rects.calm = calmRect;

    // Клавиши (п. 2): в бою подсказок нет, поэтому список — здесь
    const keys = this.label(PLATE.x, ROW.keys, t('settingsKeys'), 24, TEXT_COLORS.soft, 0.5).setWordWrapWidth(PLATE.w - 50).setAlign('center');
    items.push(keys);

    // «Закрыть»
    const close: Rect = { x: PLATE.x, y: ROW.close, w: 320, h: 80 };
    const g = scene.add.graphics();
    g.fillStyle(0x2a3550, 1).fillRoundedRect(close.x - close.w / 2, close.y - close.h / 2, close.w, close.h, 18);
    g.lineStyle(4, 0x4a5c82, 1).strokeRoundedRect(close.x - close.w / 2, close.y - close.h / 2, close.w, close.h, 18);
    items.push(g, this.label(close.x, close.y, t('settingsClose'), 34, TEXT_COLORS.main, 0.5));
    items.push(
      scene.add
        .zone(close.x, close.y, close.w, close.h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          stop(e);
          sfx.place();
          this.close();
        }),
    );
    this.rects.close = close;

    this.box = scene.add.container(0, 0, items).setDepth(depth);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.close(false));
    this.redraw();
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** Закрыть окно (`notify` — сообщить сцене: false, когда сцена сама закрывается). */
  close(notify = true): void {
    if (this.closed) return;
    this.closed = true;
    if (current === this) current = null;
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.box.destroy();
    if (notify) this.onClose();
  }

  info(): SettingsInfo {
    return {
      open: !this.closed,
      volume: settings.volume,
      calm: settings.calm,
      gain: sfx.gain,
      played: sfx.played,
      muted: sfx.muted,
      rects: this.closed ? {} : { ...this.rects },
      texts: this.closed ? [] : this.texts.map((x) => x.text),
    };
  }

  /** Кнопки окна для описания экрана меню (`window.__pvbUi`). */
  buttons(): Record<string, Rect> {
    const r = this.rects;
    const out: Record<string, Rect> = {};
    if (r.close) out.settingsClose = r.close;
    if (r.minus) out.volumeMinus = r.minus;
    if (r.plus) out.volumePlus = r.plus;
    if (r.track) out.volumeTrack = { x: r.track.x, y: r.track.y, w: r.track.w, h: r.track.h };
    if (r.calm) out.calmToggle = r.calm;
    return out;
  }

  private volumeAt(x: number): number {
    return clampVolume(((x - TRACK.x0) / (TRACK.x1 - TRACK.x0)) * 100);
  }

  private changeVolume(value: number): void {
    const before = settings.volume;
    setVolume(value);
    if (settings.volume !== before) {
      this.redraw();
      // короткий «тик» новой громкостью: слышно, как громко стало (на 0 % — тишина)
      sfx.select();
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragId === null || pointer.id !== this.dragId || !pointer.isDown) return;
    this.changeVolume(this.volumeAt(pointer.x));
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.dragId) this.dragId = null;
  }

  /** Ползунок, значение и переключатель по текущим настройкам. */
  private redraw(): void {
    const v = settings.volume;
    this.valueText.setText(t('settingsVolumeValue', { n: v }));
    const g = this.sliderGfx.clear();
    const { x0, x1, h, knob } = TRACK;
    const kx = x0 + ((x1 - x0) * v) / 100;
    g.fillStyle(0x0a1530, 1).fillRoundedRect(x0, ROW.slider - h / 2, x1 - x0, h, h / 2);
    g.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(x0, ROW.slider - h / 2, x1 - x0, h, h / 2);
    if (v > 0) g.fillStyle(COLORS.pillBlue, 1).fillRoundedRect(x0, ROW.slider - h / 2, Math.max(h, kx - x0), h, h / 2);
    // отметки шагов 0, 10, …, 100 %
    const steps = 100 / CONFIG.settings.volumeStep;
    for (let i = 0; i <= steps; i++) g.fillStyle(0x4a5c82, 1).fillCircle(x0 + ((x1 - x0) * i) / steps, ROW.slider + h / 2 + 10, 3);
    g.fillStyle(0xffffff, 1).fillCircle(kx, ROW.slider, knob);
    g.lineStyle(4, COLORS.gold, 1).strokeCircle(kx, ROW.slider, knob);
    const s = this.switchGfx.clear();
    const on = settings.calm;
    const sx = RIGHT - SWITCH.w;
    const sy = ROW.calm - SWITCH.h / 2;
    s.fillStyle(on ? 0x2a8a4a : 0x2a3550, 1).fillRoundedRect(sx, sy, SWITCH.w, SWITCH.h, SWITCH.h / 2);
    s.lineStyle(4, on ? COLORS.merge : 0x4a5c82, 1).strokeRoundedRect(sx, sy, SWITCH.w, SWITCH.h, SWITCH.h / 2);
    const r = SWITCH.h / 2 - 8;
    s.fillStyle(on ? 0xffffff : 0x9fb3d9, 1).fillCircle(on ? sx + SWITCH.w - SWITCH.h / 2 : sx + SWITCH.h / 2, ROW.calm, r);
  }

  /** Круглая кнопка «−» или «+»: видимый круг радиуса STEP_R, зона касания HIT × HIT. */
  private roundButton(x: number, y: number, sign: string, key: 'minus' | 'plus', onTap: () => void): Phaser.GameObjects.GameObject[] {
    const g = this.scene.add.graphics();
    g.fillStyle(0x1d3760, 1).fillCircle(x, y, STEP_R);
    g.lineStyle(4, 0x4a76b8, 1).strokeCircle(x, y, STEP_R);
    const zone = this.scene.add
      .zone(x, y, HIT, HIT)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        onTap();
      });
    this.rects[key] = { x, y, w: HIT, h: HIT };
    return [g, this.label(x, y - 2, sign, 44, TEXT_COLORS.main, 0.5), zone];
  }

  private label(x: number, y: number, text: string, size: number, color: string, ox: number): Phaser.GameObjects.Text {
    const label = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: TEXT_COLORS.stroke, strokeThickness: 4, resolution: 2 })
      .setOrigin(ox, 0.5);
    this.texts.push(label);
    return label;
  }
}
