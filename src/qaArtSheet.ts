import Phaser from 'phaser';
import { CONFIG } from './config';
import { ART_SHEET_PAGE } from './debug';
import { t, type TextKey } from './i18n';
import { bacteriumSample, extentOf, type BacteriumKind } from './objects/Bacterium';
import { ringImage } from './art';
import { BOSS_TINT, drawBossDecor } from './objects/bossDecor';
import { rankMarkKey, RANK_BOX } from './objects/highTowerArt';
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
    if (ART_SHEET_PAGE === 'f1') {
      this.facesKindsPage();
      return;
    }
    if (ART_SHEET_PAGE === 'f2') {
      this.facesBossesPage();
      return;
    }
    if (ART_SHEET_PAGE === 'f3') {
      this.bossTwinsPage();
      return;
    }
    if (ART_SHEET_PAGE === 'l') {
      this.levelsPage();
      return;
    }
    if (ART_SHEET_PAGE === 'l2') {
      this.levelsPage2();
      return;
    }
    if (['l3', 'l4', 'l5', 'l6'].includes(ART_SHEET_PAGE)) {
      // l6 — Шипучка и Пластырь после поправок (сообщение 4 от 28 октября 2026, п. 2)
      this.ownBarrelPage(ART_SHEET_PAGE === 'l3' ? ['fizz', 'ampule', 'antibiotic'] : ART_SHEET_PAGE === 'l4' ? ['lamp', 'vitamin'] : ART_SHEET_PAGE === 'l5' ? ['frost', 'patch'] : ['fizz', 'patch']);
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

  /** Заголовок страницы «было / стало». */
  private facesHeader(text: string): void {
    this.add.text(CONFIG.screen.width / 2, 16, text, { fontFamily: 'Arial', fontSize: '17px', color: '#cfe0ff' }).setOrigin(0.5, 0.5);
  }

  /**
   * Страница `f1` (решение владельца 26 октября 2026, сообщение 4, п. 2.3): 19 видов «было / стало» — слева нынешний рисунок (рот, румянец, брови, зубы), справа без черт лица,
   * только знаки вида. Пять видов в ряд, четыре ряда; крупные виды уменьшены, чтобы влезли в клетку (одинаково слева и справа).
   */
  private facesKindsPage(): void {
    this.facesHeader('БЕЗ ЛИЦ: 19 видов — слева было, справа стало');
    const W = CONFIG.screen.width;
    const cellW = W / 5;
    const cellH = 172;
    KINDS.forEach((kind, i) => {
      const cx = (i % 5) * cellW + cellW / 2;
      const cy = 44 + Math.floor(i / 5) * cellH + cellH / 2;
      this.add.rectangle(cx, cy, cellW - 8, cellH - 8, 0x1d3a6a, 0.45);
      this.add.text(cx, cy - cellH / 2 + 14, t(`bacName${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as TextKey), { fontFamily: 'Arial', fontSize: '14px', color: '#cfe0ff' }).setOrigin(0.5, 0.5);
      const scale = Math.min(1, 54 / extentOf(kind));
      const maxHp = CONFIG.types[kind].hp;
      (['open', 'signs'] as const).forEach((face, j) => {
        bacteriumSample(this, kind, maxHp, maxHp, false, false, face).setPosition(cx + (j === 0 ? -60 : 60), cy + 10).setScale(scale);
      });
    });
  }

  /**
   * Страница `f2`: 10 боссов «было / стало» — тело вида-основы ×`bossRules.scale` с кольцом цвета босса, как в бою; уменьшено, чтобы влезло в клетку (подпись — имя босса).
   */
  private facesBossesPage(): void {
    this.facesHeader('БЕЗ ЛИЦ: 10 боссов — слева было, справа стало');
    const W = CONFIG.screen.width;
    const cellW = W / 5;
    const cellH = 336;
    const ids = Object.keys(CONFIG.bosses) as (keyof typeof CONFIG.bosses)[];
    ids.forEach((id, i) => {
      const boss = CONFIG.bosses[id];
      const kind = boss.base as BacteriumKind;
      const cx = (i % 5) * cellW + cellW / 2;
      const cy = 44 + Math.floor(i / 5) * cellH + cellH / 2;
      this.add.rectangle(cx, cy, cellW - 8, cellH - 8, 0x1d3a6a, 0.45);
      this.add.text(cx, cy - cellH / 2 + 16, t(`boss${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey), { fontFamily: 'Arial', fontSize: '14px', color: '#cfe0ff' }).setOrigin(0.5, 0.5);
      const scale = CONFIG.bossRules.scale;
      const r = CONFIG.types[kind].radius;
      const fit = Math.min(1, 64 / (Math.max(r, extentOf(kind)) * scale + 10));
      (['open', 'signs'] as const).forEach((face, j) => {
        const holder = this.add.container(cx, cy + (j === 0 ? -60 : 88));
        holder.add(bacteriumSample(this, kind, CONFIG.types[kind].hp, CONFIG.types[kind].hp, false, false, face).setScale(scale));
        holder.add(ringImage(this, 0, 0, r * scale + 10, 6, boss.color, 0.95));
        holder.setScale(fit);
        this.add.text(cx - cellW / 2 + 10, cy + (j === 0 ? -60 : 88), j === 0 ? 'было' : 'стало', { fontFamily: 'Arial', fontSize: '12px', color: '#9fb4d8' }).setOrigin(0, 0.5);
      });
    });
  }

  /**
   * Страница `f3` (решение владельца 26 октября 2026, сообщение 6, п. 4): боссы-двойники — Матка роя и Мать спор (тело Матки), Споровик и Глушитель (тело споры).
   * Сверху — как сейчас (одно тело, отличается только цвет кольца), снизу — свой цвет тела и свой отличительный элемент (`src/objects/bossDecor.ts`). Пары стоят рядом.
   */
  private bossTwinsPage(): void {
    this.facesHeader('БОССЫ-ДВОЙНИКИ: сверху как сейчас, снизу — свой цвет и свой знак');
    const W = CONFIG.screen.width;
    const ids = ['swarmQueen', 'sporeMother', 'sporeling', 'silencer'] as const;
    const cellW = W / 4;
    ids.forEach((id, i) => {
      const boss = CONFIG.bosses[id];
      const kind = boss.base as BacteriumKind;
      const cx = i * cellW + cellW / 2;
      this.add.rectangle(cx, 380, cellW - 10, 660, i < 2 ? 0x1d3a6a : 0x24305a, 0.45);
      this.add.text(cx, 64, t(`boss${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey), { fontFamily: 'Arial', fontSize: '18px', color: '#cfe0ff' }).setOrigin(0.5, 0.5);
      const scale = CONFIG.bossRules.scale;
      const r = CONFIG.types[kind].radius;
      const fit = Math.min(1, 118 / (Math.max(r, extentOf(kind)) * scale * 1.35 + 10));
      ([false, true] as const).forEach((after, j) => {
        const y = j === 0 ? 220 : 530;
        const holder = this.add.container(cx, y);
        const body = bacteriumSample(this, kind, CONFIG.types[kind].hp, CONFIG.types[kind].hp, false, false, 'signs').setScale(scale);
        if (after && BOSS_TINT[id] !== undefined) for (const part of body.list as Phaser.GameObjects.Image[]) part.setTint(BOSS_TINT[id]!);
        holder.add(body);
        if (after) {
          const g = this.add.graphics();
          drawBossDecor(g, id, r);
          g.setScale(scale);
          holder.add(g);
        }
        holder.add(ringImage(this, 0, 0, r * scale + 10, 6, boss.color, 0.95));
        holder.setScale(fit);
        this.add.text(cx, y + 150, after ? 'стало' : 'было', { fontFamily: 'Arial', fontSize: '14px', color: '#9fb4d8' }).setOrigin(0.5, 0.5);
      });
    });
  }

  /**
   * Лист V–VIII в нынешнем стиле (`?qa&artsheet=l`; решение владельца 28 октября 2026, сообщение 1, п. 6): Таблетка, Сироп и Шприц, уровни I–VIII в ряд, без лиц, со светлой заклёпкой в центре;
   * ниже — тёмная втулка «было» и светлая заклёпка «стало» у остальных башен (уровень III) и знаки рангов ★1–★8. Размер телефона — снимок листа на экране 844×390.
   */
  private levelsPage(): void {
    const W = CONFIG.screen.width;
    const label = (x: number, y: number, text: string, size = 14, align = 0.5): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color: '#cfe0ff' }).setOrigin(align, 0.5);
    };
    label(W / 2, 14, 'Уровни I–VIII без лиц, светлая заклёпка вместо тёмной втулки, знаки рангов', 16);
    const x0 = 190;
    const dx = 136;
    const rows: { id: TowerId; y: number; name: string }[] = [
      { id: 'pill', y: 100, name: 'Таблетка' },
      { id: 'syrup', y: 212, name: 'Сироп' },
      { id: 'syringe', y: 324, name: 'Шприц' },
    ];
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    ROMAN.forEach((r, i) => label(x0 + i * dx, 38, r, 15));
    for (const row of rows) {
      label(16, row.y, row.name, 15, 0);
      for (let lv = 1; lv <= 8; lv++) createTowerArtSample(this, this.add.container(x0 + (lv - 1) * dx, row.y), row.id, lv, false, false, true);
    }
    // втулка «было» → заклёпка «стало» у башен не в стиле пилота, уровень III: два ряда пар
    label(16, 404, 'Центр башни, уровень III: было → стало', 13, 0);
    const others = TOWERS.filter((id) => id !== 'pill');
    const perRow = 5;
    const pairW = (W - 40) / perRow;
    others.forEach((id, i) => {
      const cx = 20 + pairW * ((i % perRow) + 0.5) + (i >= perRow ? pairW / 2 : 0);
      const cy = i < perRow ? 462 : 566;
      ([false, true] as const).forEach((rivet, j) => {
        const holder = this.add.container(cx + (j === 0 ? -42 : 42), cy).setScale(0.82);
        createTowerArtSample(this, holder, id, 3, false, false, rivet);
      });
      label(cx, cy + 46, `${id}: было → стало`, 11);
    });
    // знаки рангов ★1–★8: крупно и в размере на башне
    label(16, 664, 'Знаки рангов', 13, 0);
    for (let r = 1; r <= 8; r++) {
      this.add.image(x0 + (r - 1) * dx - 22, 664, rankMarkKey(this, r)).setDisplaySize(RANK_BOX.w * 1.6, RANK_BOX.h * 1.6);
      this.add.image(x0 + (r - 1) * dx + 24, 664, rankMarkKey(this, r)).setDisplaySize(RANK_BOX.w * 0.75, RANK_BOX.h * 0.75);
    }
  }

  /**
   * Лист V–VIII остальных семи башен (`?qa&artsheet=l2`; решение владельца 28 октября 2026, сообщение 2, п. 2): уровни IV–VIII в ряд — основание, верх и ореол по общей схеме,
   * ствол IV со свечением цвета уровня, эмблема VIII — своя у башни.
   */
  private levelsPage2(): void {
    const W = CONFIG.screen.width;
    const label = (x: number, y: number, text: string, size = 14, align = 0.5): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color: '#cfe0ff' }).setOrigin(align, 0.5);
    };
    label(W / 2, 14, 'Уровни IV–VIII остальных башен: знаки уровня, свечение ствола, эмблема VIII', 16);
    const ids: TowerId[] = ['fizz', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'];
    const x0 = 270;
    const dx = 190;
    ['IV', 'V', 'VI', 'VII', 'VIII'].forEach((r, i) => label(x0 + i * dx, 36, r, 15));
    ids.forEach((id, row) => {
      const y = 98 + row * 94;
      label(20, y, t(`tower${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey), 15, 0);
      for (let lv = 4; lv <= 8; lv++) createTowerArtSample(this, this.add.container(x0 + (lv - 4) * dx, y).setScale(0.8), id, lv, false, false, true);
    });
  }

  /**
   * Свои стволы V–VIII (`?qa&artsheet=l3` — Шипучка, Ампула, Антибиотик; `l4` — Лампа, Витамин; `l5` — Холод, Пластырь; вариант Б, решение владельца 28 октября 2026, сообщение 3, п. 3):
   * уровни IV–VIII в ряд, крупно; ниже каждого ряда — тот же ствол в размере на поле.
   */
  private ownBarrelPage(ids: TowerId[]): void {
    const W = CONFIG.screen.width;
    const label = (x: number, y: number, text: string, size = 14, align = 0.5): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color: '#cfe0ff' }).setOrigin(align, 0.5);
    };
    label(W / 2, 14, 'Свой ствол на каждом уровне V–VIII (IV — для сравнения)', 16);
    const x0 = 290;
    const dx = 220;
    ['IV', 'V', 'VI', 'VII', 'VIII'].forEach((r, i) => label(x0 + i * dx, 38, r, 15));
    const rowH = ids.length === 3 ? 226 : 320;
    ids.forEach((id, row) => {
      const y = 70 + rowH / 2 + row * rowH - (ids.length === 3 ? 30 : 40);
      label(20, y, t(`tower${id.charAt(0).toUpperCase()}${id.slice(1)}` as TextKey), 16, 0);
      for (let lv = 4; lv <= 8; lv++) {
        createTowerArtSample(this, this.add.container(x0 + (lv - 4) * dx, y).setScale(ids.length === 3 ? 1.2 : 1.45), id, lv, false, false, true);
        createTowerArtSample(this, this.add.container(x0 + (lv - 4) * dx + (ids.length === 3 ? 0 : 0), y + (ids.length === 3 ? 84 : 118)).setScale(0.45), id, lv, false, false, true);
      }
    });
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
