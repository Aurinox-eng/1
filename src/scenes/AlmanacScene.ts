import Phaser from 'phaser';
import { ALMANAC_BEATEN_BY, ALMANAC_TOWERS } from '../almanac';
import { CONFIG, type BossId, type BossPhase, type HardWalls, type KindId } from '../config';
import { num, t, type TextKey } from '../i18n';
import type { BacteriumKind } from '../objects/Bacterium';
import { styleIcon } from '../objects/styleArt';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { isLevelOpen } from '../meta';
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

/** Открыта ли запись: башня — куплена в древе (Таблетка — с начала); бактерия — встречается на открытом уровне. Закрытая запись показывается силуэтом (конфликт 2 документа дизайна, принят владельцем 19 октября 2026). */
function isOpenEntry(tab: Tab, id: string): boolean {
  if (tab === 'towers') return isTowerOpen(id);
  if (tab === 'bosses') return bossPlaces(id as BossId).some(({ level }) => isLevelOpen(level));
  for (let level = 1; level <= CONFIG.levels.count; level++) if (isLevelOpen(level) && levelKinds(level).includes(id as BacteriumKind)) return true;
  return false;
}

/** Цена узла башни в древе (очков ДНК). */
const towerNodePrice = (id: string): number => CONFIG.meta.upgrades[`tower${cap(id)}`]?.prices[0] ?? 0;

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
  ALMANAC_BEATEN_BY[kind].filter((tower) => !WARD_TOWERS.some(([ward, k, tw]) => k === kind && tw === tower && wardedOnOpenLevels(ward, kind)));

/** «Слаба против» башни: таблица `almanac.ts` и виды, которых она на открытых уровнях не ранит из-за жёсткого свойства. */
const weakAgainst = (tower: TowerId): BacteriumKind[] => {
  const extra = WARD_TOWERS.filter(([ward, kind, tw]) => tw === tower && wardedOnOpenLevels(ward, kind)).map(([, kind]) => kind);
  return [...ALMANAC_TOWERS[tower].weak, ...extra.filter((kind) => !ALMANAC_TOWERS[tower].weak.includes(kind))];
};

/** Номера уровней, на которых включено жёсткое свойство `ward`. */
const wardLevels = (ward: keyof HardWalls): number[] => CONFIG.levels.specs.flatMap((spec, i) => (spec.plan?.hardWalls?.[ward] ? [i + 1] : []));

/** Строка о жёстком свойстве вида с номерами уровней, где оно включено (решение владельца 19 октября 2026, сообщение 7, п. 3: одной строкой с числами); нет таких уровней — пусто. */
function wardNote(kind: BacteriumKind): string {
  return WARD_LINES.filter(([ward, wardKind]) => wardKind === kind && wardLevels(ward).length > 0)
    .map(([ward, , key]) => t(key, { levels: wardLevels(ward).join(', '), s: num(CONFIG.towers.syrup.slowSec) }))
    .join('\n');
}

/** Где выходит босс: уровни нового формата и номер волны (с 1), последняя ли это волна уровня. */
function bossPlaces(id: BossId): { level: number; wave: number; last: boolean }[] {
  return CONFIG.levels.specs.flatMap((spec, i) => {
    const waves = spec.plan?.waves ?? [];
    return waves.flatMap((w, j) => (w.boss === id ? [{ level: i + 1, wave: j + 1, last: j === waves.length - 1 }] : []));
  });
}

/** Название вида строчными (внутри строки: «выпускает: кокк ×6»). */
const kindName = (kind: KindId): string => t(`bacName${cap(kind)}` as TextKey).toLocaleLowerCase();

/**
 * Запись босса (решение владельца 20 октября 2026, сообщение 2, п. 3.2): строка — где выходит, прочность и что будет, если дойдёт; примечание — поведение и фазы с числами из `bosses` в config.ts.
 * У босса последней волны с жёстким свойством `bossArea` — кого ранит последняя фаза (решение владельца 22 октября 2026, сообщение 2, п. 3.2).
 */
function bossInfo(id: BossId): { head: string; notes: string } {
  const b = CONFIG.bosses[id];
  const place = bossPlaces(id)[0];
  const pct = (share: number): number => Math.round(share * 100);
  const reach = b.lifeDamage < 0 ? t('almBossReachLose') : t('almBossReachLives', { n: b.lifeDamage });
  const head = t('almBossHead', { level: place?.level ?? 1, wave: place?.wave ?? 0, hp: b.hp, reach });
  const traits: string[] = [t('almBossSpeed', { n: num(b.speedFactor) })];
  if (b.armor > 0) traits.push(t('almBossArmor', { n: b.armor }));
  if (b.burstAt && b.burstKind && b.burstCount)
    traits.push(t(b.burstOnDeath ? 'almBossBurstDeath' : 'almBossBurst', { p: pct(b.burstAt), kind: kindName(b.burstKind), n: b.burstCount }));
  if (b.dashEverySec && b.dashFactor) traits.push(t('almBossDash', { m: num(b.dashFactor), d: num(b.dashSec ?? 0), s: num(b.dashEverySec) }));
  if (b.rallyRadius && b.rallyDashMul) traits.push(t('almBossRally', { r: b.rallyRadius, k: num(b.rallyDashMul) }));
  if (b.slowFloor) traits.push(t('almBossSlowFloor', { n: num(b.slowFloor) }));
  if (b.spawnKind && b.spawnEverySec && b.spawnCount) traits.push(t('almBossSpawn', { s: num(b.spawnEverySec), kind: kindName(b.spawnKind), n: b.spawnCount }));
  if (b.capsuleEverySec && b.capsuleSec) traits.push(t('almBossCapsule', { e: num(b.capsuleEverySec), s: num(b.capsuleSec) }));
  if (b.regenShare) traits.push(t('almBossRegen', { n: num(pct(b.regenShare)) }));
  const lines = [traits.join('; ')];
  const ward = place?.last ? wardLevels('bossArea').filter((level) => bossPlaces(id).some((p) => p.level === level && p.last)) : [];
  const phases: BossPhase[] = b.phases ?? [];
  phases.forEach((ph, i) => {
    const items: string[] = [];
    if (ph.armor !== undefined) items.push(t('almBossArmor', { n: ph.armor }));
    if (ph.speedMul) items.push(t('almBossSpeed', { n: num(ph.speedMul) }));
    if (ph.regenShare) items.push(t('almBossRegen', { n: num(pct(ph.regenShare)) }));
    if (ph.spawnCount === 0) items.push(t('almBossNoSpawn'));
    else if (ph.spawnKind && ph.spawnCount) items.push(t('almBossSpawn', { s: num(ph.spawnEverySec ?? b.spawnEverySec ?? 0), kind: kindName(ph.spawnKind), n: ph.spawnCount }));
    if (i === phases.length - 1 && ward.length > 0) items.push(t('almBossWard', { levels: ward.join(', ') }));
    lines.push(t('almBossPhase', { p: pct(ph.below), list: items.join(', ') }));
  });
  return { head, notes: lines.join('\n') };
}

/** Строка потолков над списком башен (решение владельца 20 октября 2026, сообщение 2, п. 3.2): числа — `mutationCaps`, `meta.minAuraMul`, `mutationStack.copyShares`. */
function capsLine(): string {
  const c = CONFIG.mutationCaps;
  return t('almCaps', {
    d: num(c.dpsMul),
    a: num(CONFIG.meta.minAuraMul),
    f: num(c.freezeShareOfCooldown),
    c: CONFIG.mutationStack.copyShares.map((x) => Math.round(x * 100)).join(' / '),
  });
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
    if (tab === 'towers') {
      // Над башнями — строка потолков мутаций и улучшений (не ряд записи: в `rowTexts` её нет)
      const caps = this.add.text(12, 6, capsLine(), { ...textStyle(18, TEXT_COLORS.soft, false), fontStyle: 'normal', wordWrap: { width: LIST.w - 24 } });
      this.list.add(caps);
      y = Math.ceil(caps.height) + 6;
      // …и строка о выходе в меню с паузы (решение владельца 25 октября 2026, сообщение 1, п. 7): «В меню» засчитывает попытку, «Заново» — нет
      const exit = this.add.text(12, y, t('almExitRule'), { ...textStyle(18, TEXT_COLORS.soft, false), fontStyle: 'normal', wordWrap: { width: LIST.w - 24 } });
      this.list.add(exit);
      y += Math.ceil(exit.height) + 12;
    }
    const ids: string[] = tab === 'towers' ? TOWERS : tab === 'bacteria' ? KINDS : BOSSES;
    for (const id of ids) y += this.addRow(tab, id, y);
    this.maxScroll = Math.max(0, y - LIST.h);
  }

  private scrollBy(dy: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, this.maxScroll);
    this.list.y = LIST.y - this.scrollY;
  }

  /** Ряд записи: рисунок, название, строка и примечание под ней; высота ряда — по тексту, не меньше ROW_H. Возвращает высоту ряда. */
  private addRow(tab: Tab, id: string, y: number): number {
    const key = cap(id);
    const open = isOpenEntry(tab, id);
    const g = this.add.graphics();
    this.list.add(g);
    let name: string;
    let line: string;
    let note = '';
    let lineW = LINE_W;
    if (tab === 'towers') {
      // Закрытая башня: название, строка роли и цена узла в древе под ней, рисунок — силуэтом (решение владельца 20 октября 2026, сообщение 2, п. 3.2)
      name = t(`tower${key}` as TextKey);
      line = t(`almTower${key}` as TextKey);
      const limit = open ? CONFIG.towers[id as TowerId].blastFullTargets : 0;
      if (!open) note = t('almTowerClosed', { n: towerNodePrice(id) });
      else if (limit > 0) note = t('blastLimitNote', { n: limit, m: num(CONFIG.towers[id as TowerId].blastRestMul) });
    } else if (tab === 'bacteria') {
      name = open ? t(`bacName${key}` as TextKey) : t('almUnknown');
      line = open ? t(`almBac${key}` as TextKey) : t('almBacClosed');
      if (open) note = wardNote(id as BacteriumKind);
    } else {
      // Босс: справа значков нет — строка и примечание на всю ширину ряда
      const info = bossInfo(id as BossId);
      name = open ? t(`boss${key}` as TextKey) : t('almUnknown');
      line = open ? info.head : t('almBacClosed');
      if (open) note = info.notes;
      lineW = LIST.w - LINE_X - 24;
    }
    this.rowTexts.push(`${name}: ${line}`);
    // Строка из i18n.ts и проверка её текста не меняются; примечание мелко под ней, вместе — по центру ряда
    const lineText = this.add.text(LINE_X, 0, line, { ...textStyle(22, TEXT_COLORS.main, false), fontStyle: 'normal', wordWrap: { width: lineW } });
    this.list.add(lineText);
    const noteText = note ? this.add.text(LINE_X, 0, note, { ...textStyle(17, TEXT_COLORS.soft, false), fontStyle: 'normal', wordWrap: { width: lineW } }) : null;
    if (noteText) this.list.add(noteText);
    const content = lineText.height + (noteText ? 4 + noteText.height : 0);
    const rowH = Math.max(ROW_H, Math.ceil(content) + 24);
    const cy = y + rowH / 2;
    const top = cy - content / 2;
    lineText.setY(top);
    noteText?.setY(top + lineText.height + 4);
    g.fillStyle(0x14264b, 1).fillRoundedRect(0, y + 4, LIST.w, rowH - 8, 14);
    g.lineStyle(2, 0x3a5f9c, 1).strokeRoundedRect(0, y + 4, LIST.w, rowH - 8, 14);
    // Длинное название («Бронированная», «Гигантская колония») сжимается по ширине, чтобы не заходить на описание (оно начинается с LINE_X)
    const nameText = this.add.text(NAME_X, cy, name, textStyle(28)).setOrigin(0, 0.5);
    if (nameText.width > LINE_X - NAME_X - 12) nameText.setScale((LINE_X - NAME_X - 12) / nameText.width);
    this.list.add(nameText);

    if (tab === 'bosses') {
      // Значок босса — вид-основа в кольце своего цвета
      const boss = CONFIG.bosses[id as BossId];
      const icon = this.bacteriumIcon(boss.base as BacteriumKind, ICON_X, cy, 30);
      if (open) g.lineStyle(4, boss.color, 1).strokeCircle(ICON_X, cy, 36);
      else this.silhouette(icon);
      this.list.add(icon);
      return rowH;
    }
    if (!open) {
      // Закрытая запись: силуэт (тёмный рисунок) без значков «сильна / слаба / бьют»
      const icon = tab === 'towers' ? this.towerIcon(ICON_X, cy, id as TowerId, 0.78) : this.bacteriumIcon(id as BacteriumKind, ICON_X, cy, 30);
      this.silhouette(icon);
      this.list.add(icon);
      return rowH;
    }
    if (tab === 'towers') {
      this.list.add(this.towerIcon(ICON_X, cy, id as TowerId, 0.78));
      const entry = ALMANAC_TOWERS[id as TowerId];
      this.addMarks(MARKS_X, cy - 20, t('almStrong'), entry.strong.map((k) => this.bacteriumIcon(k)), COLORS.merge);
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

  /** Силуэт: весь рисунок значка тёмный и полупрозрачный. */
  private silhouette(icon: Phaser.GameObjects.Container): void {
    icon.setAlpha(0.3);
    const tint = (obj: Phaser.GameObjects.GameObject): void => {
      if (obj instanceof Phaser.GameObjects.Container) obj.list.forEach(tint);
      else if ('setTint' in obj && typeof (obj as Phaser.GameObjects.Image).setTint === 'function') (obj as Phaser.GameObjects.Image).setTint(0x0b1020);
      else if (obj instanceof Phaser.GameObjects.Graphics) obj.setAlpha(0.25);
    };
    icon.list.forEach(tint);
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
