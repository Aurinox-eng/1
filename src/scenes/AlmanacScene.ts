import Phaser from 'phaser';
import { ALMANAC_BEATEN_BY, ALMANAC_TOWERS } from '../almanac';
import { CONFIG, type BossId, type HardWalls } from '../config';
import { t, type TextKey } from '../i18n';
import type { BacteriumKind } from '../objects/Bacterium';
import { styleIcon } from '../objects/styleArt';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { isLevelOpen, wasMet } from '../meta';
import { isTowerOpen, levelKinds } from '../progress';
import { addButton, setScreenInfo, textStyle, type Rect } from '../screens';
import { COLORS, TEXT_COLORS } from '../theme';

const { width: W, height: H } = CONFIG.screen;

/** Область списка: слева направо на всю ширину, сверху вниз от полосы вкладок до низа экрана, пикселей. */
const LIST = { x: 40, y: 138, w: W - 80, h: H - 138 - 16 };
const ROW_H = 92;
const ICON_X = 52;
const NAME_X = 120;
const LINE_X = 330;
const LINE_W = 470;
const MARKS_X = 830;
const MARK = 46;

type Tab = 'towers' | 'bacteria' | 'bosses';

const TOWERS = Object.keys(CONFIG.towers) as TowerId[];
const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];
const BOSSES = Object.keys(CONFIG.bosses) as BossId[];

const cap = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * Открыта ли запись (решение владельца 25 октября 2026, сообщение 5, п. 2.1): башня — куплена в древе (Таблетка — с начала); бактерия и босс — с первого выхода на поле
 * (`b:вид`, `boss:id` в сохранении). Закрытая запись — только «Ещё не встречалось» (п. 2.2).
 */
function isOpenEntry(tab: Tab, id: string): boolean {
  if (tab === 'towers') return isTowerOpen(id);
  return wasMet(tab === 'bosses' ? `boss:${id}` : `b:${id}`);
}

/** Жёсткое свойство вида (`plan.hardWalls`) и ключ его строки в Альманахе (свойство последней фазы босса — в записи босса, `bossInfo`). */
const WARD_LINES: [keyof HardWalls, BacteriumKind, TextKey][] = [
  ['runnerSlow', 'runner', 'almWardRunner'],
  ['armoredPierce', 'armored', 'almWardArmored'],
  ['slickBeam', 'slick', 'almWardSlick'],
];

/**
 * Башня, которую жёсткое свойство вида делает бесполезной против него (решение владельца 22 октября 2026, сообщение 4, п. 2.1): луч Шприца проходит слизня насквозь.
 * Пока на открытых уровнях этот вид выходит только со свойством, башни нет в «Бьют» у вида, а вид стоит у башни в «Слаба против»; открыт уровень, где вид выходит без свойства, — как в `almanac.ts`.
 */
const WARD_TOWERS: [keyof HardWalls, BacteriumKind, TowerId][] = [['slickBeam', 'slick', 'syringe']];

/** Выходит ли вид `kind` на открытых уровнях только с жёстким свойством `ward` (на открытых уровнях без вида — тоже да). */
function wardedOnOpenLevels(ward: keyof HardWalls, kind: BacteriumKind): boolean {
  for (let level = 1; level <= CONFIG.levels.count; level++) {
    if (!isLevelOpen(level) || !levelKinds(level).includes(kind)) continue;
    if (!CONFIG.levels.specs[level - 1]?.plan?.hardWalls?.[ward]) return false;
  }
  return true;
}

/** «Бьют» бактерию: таблица `almanac.ts` без башен, которые жёсткое свойство вида на открытых уровнях делает бесполезными. */
const beatenBy = (kind: BacteriumKind): TowerId[] =>
  ALMANAC_BEATEN_BY[kind].filter((tower) => isTowerOpen(tower) && !WARD_TOWERS.some(([ward, k, tw]) => k === kind && tw === tower && wardedOnOpenLevels(ward, kind)));

/** «Слаба против» башни: таблица `almanac.ts` и виды, которых она на открытых уровнях не ранит из-за жёсткого свойства. */
const weakAgainst = (tower: TowerId): BacteriumKind[] => {
  const extra = WARD_TOWERS.filter(([ward, kind, tw]) => tw === tower && wardedOnOpenLevels(ward, kind)).map(([, kind]) => kind);
  return [...ALMANAC_TOWERS[tower].weak, ...extra.filter((kind) => !ALMANAC_TOWERS[tower].weak.includes(kind))].filter(met);
};

/** Значки «Бьют», «Сильна против», «Слаба против» — только купленные башни и встреченные бактерии (решение владельца 25 октября 2026, сообщение 5, п. 2.3). */
const met = (kind: BacteriumKind): boolean => wasMet(`b:${kind}`);

/** Включено ли жёсткое свойство `ward` хотя бы на одном уровне. */
const wardUsed = (ward: keyof HardWalls): boolean => CONFIG.levels.specs.some((spec) => Boolean(spec.plan?.hardWalls?.[ward]));

/** Строка о жёстком свойстве вида — одна, без чисел (решение владельца 25 октября 2026, сообщение 5, п. 2.6); свойства нет ни на одном уровне — пусто. */
function wardNote(kind: BacteriumKind): string {
  return WARD_LINES.filter(([ward, wardKind]) => wardKind === kind && wardUsed(ward))
    .map(([, , key]) => t(key))
    .join('\n');
}

/**
 * «Альманах» (решение владельца 8 октября 2026, docs/expert-plan.md, раздел 3): вместо плашек с автопаузой — один экран со списком башен и бактерий.
 * Запись: рисунок, название, одна короткая строка и значки (против кого башня сильна и слаба; какие башни бьют бактерию). Без заголовков и подписей-абзацев.
 * Открывается из главного меню и с паузы партии (тогда партия стоит под экраном и после «Назад» продолжается с паузы).
 */
export class AlmanacScene extends Phaser.Scene {
  private from: 'menu' | 'game' = 'menu';
  private tab: Tab = 'towers';
  private list!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private tabGraphics!: Phaser.GameObjects.Graphics;
  private tabRects: Record<Tab, Rect> = { towers: { x: 0, y: 0, w: 0, h: 0 }, bacteria: { x: 0, y: 0, w: 0, h: 0 }, bosses: { x: 0, y: 0, w: 0, h: 0 } };
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowTexts: string[] = [];

  constructor() {
    super('Almanac');
  }

  init(data?: { from?: 'menu' | 'game' }): void {
    this.from = data?.from === 'game' ? 'game' : 'menu';
    this.tab = 'towers';
    this.scrollY = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    // Сплошной фон: под экраном может стоять приостановленная партия
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.background, 1).setDepth(-1);
    this.add.text(W / 2, 40, t('almanacTitle'), textStyle(46, TEXT_COLORS.accent)).setOrigin(0.5);
    this.backRect = addButton(this, { x: 130, y: 44, w: 190, h: 64, label: t('almBack'), fontSize: 32, fill: 0x2a3550, line: 0x4a5c82, onTap: () => this.leave() });

    this.tabGraphics = this.add.graphics();
    const count = (tab: Tab, ids: string[]): { n: number; m: number } => ({ n: ids.filter((id) => isOpenEntry(tab, id)).length, m: ids.length });
    this.tabRects.towers = this.addTab(W / 2 - 280, 100, 'towers', t('almTabTowers', count('towers', TOWERS)));
    this.tabRects.bacteria = this.addTab(W / 2, 100, 'bacteria', t('almTabBacteria', count('bacteria', KINDS)));
    this.tabRects.bosses = this.addTab(W / 2 + 280, 100, 'bosses', t('almTabBosses', count('bosses', BOSSES)));

    this.list = this.add.container(LIST.x, LIST.y);
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff, 1).fillRect(LIST.x, LIST.y, LIST.w, LIST.h);
    this.list.setMask(maskShape.createGeometryMask());

    // Прокрутка: пальцем (тянуть список) и колесом мыши
    const area = this.add.zone(LIST.x + LIST.w / 2, LIST.y + LIST.h / 2, LIST.w, LIST.h).setInteractive();
    area.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.scrollBy(pointer.y - pointer.prevPosition.y);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollBy(-dy));

    this.showTab('towers');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setScreenInfo(null));
    setScreenInfo(() =>
      this.scene.isActive()
        ? { scene: 'almanac', buttons: { back: this.backRect, towers: this.tabRects.towers, bacteria: this.tabRects.bacteria, bosses: this.tabRects.bosses }, texts: this.rowTexts }
        : null,
    );
  }

  private addTab(x: number, y: number, tab: Tab, label: string): Rect {
    const w = 260;
    const h = 56;
    const text = this.add.text(x, y, label, textStyle(30)).setOrigin(0.5);
    if (text.width > w - 16) text.setScale((w - 16) / text.width);
    this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showTab(tab));
    return { x, y, w, h };
  }

  private drawTabs(): void {
    const g = this.tabGraphics;
    g.clear();
    for (const tab of ['towers', 'bacteria', 'bosses'] as Tab[]) {
      const r = this.tabRects[tab];
      const on = tab === this.tab;
      g.fillStyle(on ? 0x2a5c9a : 0x1b2a4a, 1).fillRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 14);
      g.lineStyle(3, on ? COLORS.gold : 0x3a5f9c, 1).strokeRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 14);
    }
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    this.scrollY = 0;
    this.drawTabs();
    this.list.removeAll(true);
    this.list.y = LIST.y;
    this.rowTexts = [];
    let y = 0;
    const ids: string[] = tab === 'towers' ? TOWERS : tab === 'bacteria' ? KINDS : BOSSES;
    for (const id of ids) y += this.addRow(tab, id, y);
    this.maxScroll = Math.max(0, y - LIST.h);
  }

  private scrollBy(dy: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, this.maxScroll);
    this.list.y = LIST.y - this.scrollY;
  }

  /**
   * Ряд записи: рисунок, название, строка и примечание под ней; высота ряда — по тексту, не меньше ROW_H. Возвращает высоту ряда.
   * Закрытая запись — только «Ещё не встречалось», без имени, рисунка, роли и цены; босс — рисунок и имя, без чисел и свойств (решение владельца 25 октября 2026, сообщение 5, пп. 2.2, 2.5).
   */
  private addRow(tab: Tab, id: string, y: number): number {
    const key = cap(id);
    const open = isOpenEntry(tab, id);
    const g = this.add.graphics();
    this.list.add(g);
    g.fillStyle(0x14264b, 1).fillRoundedRect(0, y + 4, LIST.w, ROW_H - 8, 14);
    g.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(0, y + 4, LIST.w, ROW_H - 8, 14);
    if (!open) {
      const closed = t('almBacClosed');
      this.rowTexts.push(closed);
      this.list.add(this.add.text(NAME_X, y + ROW_H / 2, closed, { ...textStyle(24, TEXT_COLORS.soft, false), fontStyle: 'normal' }).setOrigin(0, 0.5));
      return ROW_H;
    }
    let name: string;
    let line = '';
    let note = '';
    if (tab === 'towers') {
      name = t(`tower${key}` as TextKey);
      line = t(`almTower${key}` as TextKey);
    } else if (tab === 'bacteria') {
      name = t(`bacName${key}` as TextKey);
      line = t(`almBac${key}` as TextKey);
      note = wardNote(id as BacteriumKind);
    } else {
      name = t(`boss${key}` as TextKey);
    }
    this.rowTexts.push(line ? `${name}: ${line}` : name);
    // Строка и примечание мелко под ней, вместе — по центру ряда
    const lineText = line ? this.add.text(LINE_X, 0, line, { ...textStyle(22, TEXT_COLORS.main, false), fontStyle: 'normal', wordWrap: { width: LINE_W } }) : null;
    if (lineText) this.list.add(lineText);
    const noteText = note ? this.add.text(LINE_X, 0, note, { ...textStyle(17, TEXT_COLORS.soft, false), fontStyle: 'normal', wordWrap: { width: LINE_W } }) : null;
    if (noteText) this.list.add(noteText);
    const content = (lineText?.height ?? 0) + (noteText ? 4 + noteText.height : 0);
    const rowH = Math.max(ROW_H, Math.ceil(content) + 24);
    if (rowH > ROW_H) {
      g.clear();
      g.fillStyle(0x14264b, 1).fillRoundedRect(0, y + 4, LIST.w, rowH - 8, 14);
      g.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(0, y + 4, LIST.w, rowH - 8, 14);
    }
    const cy = y + rowH / 2;
    const top = cy - content / 2;
    lineText?.setY(top);
    noteText?.setY(top + (lineText?.height ?? 0) + 4);
    // Длинное название («Бронированная», «Гигантская колония») сжимается по ширине, чтобы не заходить на описание (оно начинается с LINE_X)
    const nameText = this.add.text(NAME_X, cy, name, textStyle(28)).setOrigin(0, 0.5);
    if (nameText.width > LINE_X - NAME_X - 12) nameText.setScale((LINE_X - NAME_X - 12) / nameText.width);
    this.list.add(nameText);

    if (tab === 'bosses') {
      // Значок босса — вид-основа в кольце своего цвета
      const boss = CONFIG.bosses[id as BossId];
      this.list.add(this.bacteriumIcon(boss.base as BacteriumKind, ICON_X, cy, 30));
      g.lineStyle(4, boss.color, 1).strokeCircle(ICON_X, cy, 36);
      return rowH;
    }
    if (tab === 'towers') {
      this.list.add(this.towerIcon(ICON_X, cy, id as TowerId, 0.78));
      const entry = ALMANAC_TOWERS[id as TowerId];
      this.addMarks(MARKS_X, cy - 20, t('almStrong'), entry.strong.filter(met).map((k) => this.bacteriumIcon(k)), COLORS.merge);
      this.addMarks(MARKS_X, cy + 20, t('almWeak'), weakAgainst(id as TowerId).map((k) => this.bacteriumIcon(k)), COLORS.loseLine);
    } else {
      this.list.add(this.bacteriumIcon(id as BacteriumKind, ICON_X, cy, 30));
      this.addMarks(MARKS_X, cy, t('almBeatenBy'), beatenBy(id as BacteriumKind).map((tower) => this.towerIcon(0, 0, tower, 0.6)), COLORS.merge);
    }
    return rowH;
  }

  /** Подпись и ряд значков справа в строке; значки создаются без позиции и расставляются здесь. */
  private addMarks(x: number, cy: number, label: string, icons: Phaser.GameObjects.Container[], color: number): void {
    // Пустой список (у Витамина) — без подписи
    if (icons.length === 0) return;
    const text = this.add.text(x, cy, label, { ...textStyle(18, '#' + color.toString(16).padStart(6, '0'), false) }).setOrigin(0, 0.5);
    this.list.add(text);
    let ix = x + text.width + 14 + MARK / 2;
    for (const icon of icons) {
      icon.setPosition(ix, cy);
      this.list.add(icon);
      ix += MARK + 6;
    }
  }

  private towerIcon(x: number, y: number, id: TowerId, scale: number): Phaser.GameObjects.Container {
    const holder = this.add.container(x, y).setScale(scale);
    createTowerArt(this, holder, id);
    return holder;
  }

  /** Значок бактерии: тело нужного вида, вписанное в круг радиуса `radius` (по умолчанию — значок для ряда справа). */
  private bacteriumIcon(kind: BacteriumKind, x = 0, y = 0, radius = MARK / 2 - 2): Phaser.GameObjects.Container {
    // Значок — картинка нового рисунка (первый кадр: полное HP, глаза открыты)
    return this.add.container(x, y, [styleIcon(this, kind, radius)]);
  }

  private leave(): void {
    if (this.from === 'game') {
      this.scene.stop();
      this.scene.resume('Game');
    } else {
      this.scene.start('Menu');
    }
  }
}
