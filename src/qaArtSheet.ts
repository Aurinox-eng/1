import Phaser from 'phaser';
import { CONFIG } from './config';
import { bacteriumSample, type BacteriumKind } from './objects/Bacterium';
import { createTowerArtSample, type TowerId } from './objects/Tower';
import { COLORS } from './theme';

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

    // кокк в размере роя (радиус 14): читается ли лицо в мелком размере; рядом тот же кокк крупнее ×3 для сравнения с прежним
    const swarmScale = 14 / CONFIG.types.coccus.radius;
    label(110, 462, 'размер роя (радиус 14)', 13);
    for (const [x, old] of [[110, false], [300, false], [760, true]] as const) {
      const sample = bacteriumSample(this, 'coccus', 2, 2, old);
      sample.setPosition(x, 500).setScale(x === 300 ? swarmScale * 3 : swarmScale);
    }
    label(300, 462, '×3 (для сравнения)', 13);
    label(760, 462, 'размер роя (радиус 14)', 13);

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
}
