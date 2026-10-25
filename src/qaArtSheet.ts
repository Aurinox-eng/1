import Phaser from 'phaser';
import { CONFIG } from './config';
import { ART_SHEET_PAGE } from './debug';
import { bacteriumSample, type BacteriumKind } from './objects/Bacterium';
import { artImage, type ArtBox } from './art';
import { pillTop4NoEyesKey, rankMarkKey, RANK_BOX } from './objects/highTowerArt';
import { createTowerArtSample, type TowerId } from './objects/Tower';
import { COLORS } from './theme';

const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];
const TOWERS: TowerId[] = ['pill', 'syrup', 'fizz', 'syringe', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'];

/**
 * Лист образцов пилота этапа 8 (только режим проверки, `?qa&artsheet`; в игровую сборку не попадает, как qaTools.ts): новый и прежний рисунок рядом.
 * Слева — новое: кокк, бронированная и Гигант при полной прочности, половине и 1 HP; кокк в размере роя (радиус 14); Таблетка 1 и 4 уровня с глазами и без, Сироп 1 уровня.
 * Справа — прежние рисунки тех же видов (функции рисования остаются до утверждения стиля). Снимок листа — qa/art-shots.mjs, сцена s.
 */
export class ArtSheetScene extends Phaser.Scene {
  constructor() {
    super('ArtSheet');
  }

  create(): void {
    const W = CONFIG.screen.width;
    const H = CONFIG.screen.height;
    this.add.rectangle(W / 2, H / 2, W, H, 0x14264a);
    if (ART_SHEET_PAGE === 'b1' || ART_SHEET_PAGE === 'b2') {
      this.bacteriaPage(ART_SHEET_PAGE === 'b1' ? KINDS.slice(0, 10) : KINDS.slice(10));
      return;
    }
    if (ART_SHEET_PAGE === 'l') {
      this.levelsPage();
      return;
    }
    if (ART_SHEET_PAGE === 't1' || ART_SHEET_PAGE === 't2') {
      this.towersPage(ART_SHEET_PAGE === 't1' ? TOWERS.slice(0, 5) : TOWERS.slice(5));
      return;
    }
    // два фона-«панели» с карты: новое и прежнее
    this.add.rectangle(W * 0.28, H / 2, W * 0.5, H - 20, 0x1d3a6a, 0.55);
    this.add.rectangle(W * 0.78, H / 2, W * 0.42, H - 20, 0x1d3a6a, 0.35);
    const label = (x: number, y: number, text: string, size = 15): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color: '#cfe0ff' }).setOrigin(0.5, 0.5);
    };
    label(W * 0.28, 18, 'НОВЫЙ РИСУНОК (пилот этапа 8)', 17);
    label(W * 0.78, 18, 'ПРЕЖНИЙ РИСУНОК', 17);

    const cols = [{ x: 110, old: false }, { x: 300, old: false }, { x: 490, old: false }, { x: 760, old: true }, { x: 930, old: true }, { x: 1100, old: true }];
    const states = ['полное HP', 'половина', '1 HP'];
    cols.forEach((c, i) => label(c.x, 40, states[i % 3], 14));
    const rows: { kind: BacteriumKind; y: number }[] = [
      { kind: 'coccus', y: 108 },
      { kind: 'armored', y: 222 },
      { kind: 'giant', y: 368 },
    ];
    for (const row of rows) {
      const maxHp = CONFIG.types[row.kind].hp;
      const hps = row.kind === 'coccus' ? [maxHp, 1.5, 1] : [maxHp, Math.max(1, maxHp / 2), 1];
      label(34, row.y - 62 > 56 ? row.y - 62 : 62, row.kind, 12);
      cols.forEach((c, i) => {
        const sample = bacteriumSample(this, row.kind, hps[i % 3], maxHp, c.old);
        sample.setPosition(c.x, row.y);
      });
    }

    // кокк в размере роя (радиус 14): читается ли лицо в мелком размере; рядом упрощённое лицо для мелкого размера (глаза крупнее, зрачки и обводка толще, без румянца, рот — одна дуга);
    // справа от каждого — тот же рисунок крупнее ×3 для рассмотрения; прежний рисунок — справа
    const swarmScale = 14 / CONFIG.types.coccus.radius;
    label(70, 464, 'кокк, радиус 14', 12);
    label(195, 464, 'упрощённое лицо, радиус 14', 12);
    label(345, 464, 'кокк, крупнее', 12);
    label(500, 464, 'упрощённое лицо, крупнее', 12);
    for (const [x, old, small, zoom] of [[70, false, false, 1], [195, false, true, 1], [345, false, false, 2.6], [500, false, true, 2.6], [760, true, false, 1]] as const) {
      const sample = bacteriumSample(this, 'coccus', 2, 2, old, small);
      sample.setPosition(x, zoom > 1 ? 510 : 500).setScale(swarmScale * zoom);
    }
    label(760, 464, 'прежний рисунок, радиус 14', 12);

    // башни: новые с глазами и без, Сироп; справа прежние
    label(W * 0.28, 556, 'Таблетка 1 ур. (глаза / без), Таблетка 4 ур. (глаза / без), Сироп 1 ур.', 14);
    label(W * 0.78, 556, 'Таблетка 1 ур., Таблетка 4 ур., Сироп 1 ур.', 14);
    const towers: { x: number; id: TowerId; level: number; legacy: boolean; eyes: boolean }[] = [
      { x: 75, id: 'pill', level: 1, legacy: false, eyes: true },
      { x: 200, id: 'pill', level: 1, legacy: false, eyes: false },
      { x: 345, id: 'pill', level: 4, legacy: false, eyes: true },
      { x: 480, id: 'pill', level: 4, legacy: false, eyes: false },
      { x: 600, id: 'syrup', level: 1, legacy: false, eyes: false },
      { x: 760, id: 'pill', level: 1, legacy: true, eyes: false },
      { x: 930, id: 'pill', level: 4, legacy: true, eyes: false },
      { x: 1100, id: 'syrup', level: 1, legacy: true, eyes: false },
    ];
    for (const t of towers) {
      const holder = this.add.container(t.x, 640);
      createTowerArtSample(this, holder, t.id, t.level, t.legacy, t.eyes);
    }
    // цвет фона панели как у карты — для оценки контраста; подпись версии
    this.add.text(W - 8, H - 8, COLORS.background.toString(16), { fontFamily: 'Arial', fontSize: '1px', color: '#14264a' }).setOrigin(1, 1);
  }

  /** Страница бактерий: по виду — полное HP и 1 HP (трещины); пять видов в ряд, два ряда; Гигант и бронированная уменьшены до 0,7 (подписано). */
  private bacteriaPage(kinds: BacteriumKind[]): void {
    const W = CONFIG.screen.width;
    const cellW = W / 5;
    kinds.forEach((kind, i) => {
      const cx = (i % 5) * cellW + cellW / 2;
      const cy = i < 5 ? 190 : 530;
      const maxHp = CONFIG.types[kind].hp;
      const big = CONFIG.types[kind].radius > 40;
      const scale = big ? 0.7 : 1;
      const label = this.add.text(cx, cy - 150, kind + (big ? ' (×0,7)' : ''), { fontFamily: 'Arial', fontSize: '15px', color: '#cfe0ff' });
      label.setOrigin(0.5, 0.5);
      [maxHp, 1].forEach((hp, j) => {
        const sample = bacteriumSample(this, kind, hp, maxHp);
        sample.setPosition(cx + (j === 0 ? -62 : 62), cy).setScale(scale);
      });
    });
  }

  /**
   * Страница уровней (`?qa&artsheet=l`, решение владельца 25 октября 2026, сообщение 2, п. 3.6): Таблетка, Сироп и Шприц, уровни I–VIII в ряд (без глаз); внизу — те же башни в размере телефона
   * (основание ≈ 36 px) и знаки рангов ★1–★8. В последнем столбце ряда Таблетки — IV без глаз с капсулой-меткой на куполе (предложение).
   */
  private levelsPage(): void {
    const W = CONFIG.screen.width;
    const label = (x: number, y: number, text: string, size = 14, align = 0.5): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color: '#cfe0ff' }).setOrigin(align, 0.5);
    };
    label(W / 2, 14, 'Уровни I–VIII: Таблетка, Сироп, Шприц (без глаз), размер телефона и знаки рангов', 16);
    const x0 = 84;
    const dx = 128;
    const rows: { id: TowerId; y: number; name: string }[] = [
      { id: 'pill', y: 112, name: 'Таблетка' },
      { id: 'syrup', y: 232, name: 'Сироп' },
      { id: 'syringe', y: 352, name: 'Шприц' },
    ];
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    ROMAN.forEach((r, i) => label(x0 + i * dx, 40, r, 14));
    for (const row of rows) {
      label(6, row.y - 44, row.name, 13, 0);
      for (let lv = 1; lv <= 8; lv++) {
        const holder = this.add.container(x0 + (lv - 1) * dx, row.y);
        createTowerArtSample(this, holder, row.id, lv, false, false);
      }
    }
    // предложение: Таблетка IV без глаз — купол с капсулой-меткой
    const prop = this.add.container(x0 + 8 * dx, rows[0].y);
    createTowerArtSample(this, prop, 'pill', 4, false, false);
    const topBox: ArtBox = { x: -54, y: -54, w: 108, h: 118 };
    prop.add(artImage(this, pillTop4NoEyesKey(this, topBox), topBox));
    label(x0 + 8 * dx, rows[0].y - 66, 'IV без глаз (предложение)', 11);
    // размер телефона: основание ≈ 36 px (72 px рисунка × 0,5), три башни рядом на уровень
    label(6, 440, 'Размер телефона (основание ≈ 36 px)', 13, 0);
    for (let lv = 1; lv <= 8; lv++) {
      rows.forEach((row, k) => {
        const holder = this.add.container(x0 + (lv - 1) * dx + (k - 1) * 42 - 4, 490);
        holder.setScale(0.5);
        createTowerArtSample(this, holder, row.id, lv, false, false);
      });
      label(x0 + (lv - 1) * dx, 530, ROMAN[lv - 1], 12);
    }
    // знаки рангов ★1–★8: крупно и в размере на башне
    label(6, 568, 'Знаки рангов ★1–★8', 13, 0);
    for (let r = 1; r <= 8; r++) {
      const big = this.add.image(x0 + (r - 1) * dx - 20, 620, rankMarkKey(this, r));
      big.setDisplaySize(RANK_BOX.w * 1.9, RANK_BOX.h * 1.9);
      const small = this.add.image(x0 + (r - 1) * dx + 28, 620, rankMarkKey(this, r));
      small.setDisplaySize(RANK_BOX.w * 0.75, RANK_BOX.h * 0.75);
    }
  }

  /** Страница башен: пять видов, уровни 1–4 в ряд. */
  private towersPage(ids: TowerId[]): void {
    ids.forEach((id, i) => {
      const cy = 80 + i * 138;
      this.add.text(30, cy, id, { fontFamily: 'Arial', fontSize: '15px', color: '#cfe0ff' }).setOrigin(0, 0.5);
      for (let lv = 1; lv <= 4; lv++) {
        const holder = this.add.container(260 + (lv - 1) * 240, cy);
        createTowerArtSample(this, holder, id, lv, false, true);
      }
    });
  }
}
