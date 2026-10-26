import Phaser from 'phaser';
import { CONFIG, type UpgradeEffect } from '../config';
import { QA_MODE } from '../debug';
import { exposeMetaDebug, buyNode, canBuy, isBranchOpen, isLevelBeaten, isLevelOpen, isNodeOpen, isRingOpen, metaDna, metaLevel, networkRefund, nextNodeOf, nextPrice, nodeAvailable, nodeBought, requirementMet, requirementOf, resetNetwork, towerNodeId, type MetaScreenInfo } from '../meta';
import { createTowerArt, type TowerId } from '../objects/Tower';
import { CORE, isKeyNode, layoutNet, NET, NET_LAYOUT, nodeKey, ringInner, type Placed } from '../treeNet';
import { num, t, type TextKey } from '../i18n';
import { maxLevel, UPGRADE_IDS, type UpgradeId } from '../save';
import { sfx } from '../sound';
import { currentLevel, favoriteBranch } from '../progress';
import { setScreenInfo } from '../screens';
import { COLORS, FONT, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Раскладка (экран игры 1280×720): сверху заголовок и очки ДНК; слева окно дерева (прокручивается пальцем и колесом), справа карточка выбранного узла; снизу «Играть» и «В меню». */
const VIEW = { x: 20, y: 124, w: 850, h: 476 };
const DETAIL = { x: 890, y: 124, w: 370, h: 476 };
const BUY = { w: 330, h: 56 };
const BUY_CENTER = { x: DETAIL.x + DETAIL.w / 2, y: DETAIL.y + DETAIL.h - 16 - BUY.h / 2 };
const PLAY = { x: W / 2 + 190, y: 650, w: 340, h: 76 };
const MENU = { x: W / 2 - 190, y: 650, w: 340, h: 76 };
/** Касание, сдвинувшееся не дальше этого, — тап (выбор узла), иначе — перетаскивание сети, пикселей экрана. */
const TAP_MAX_MOVE = 12;
/** Масштаб сети: пределы и подписи цепочек — не мельче этого (решение владельца 26 октября 2026, сообщение 1, п. 6.2–6.3). */
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.2;
const LABEL_MIN_ZOOM = 0.62;
/** Размер подписи цепочки, пикселей мира. */
const LABEL_PX = 20;
/** Кнопка сброса сети (бесплатный сброс между попытками; решение владельца 26 октября 2026, сообщение 3, п. 4.2; с надписью — сообщение 6, п. 3): в правом верхнем углу окна сети. */
const RESPEC = { x: VIEW.x + VIEW.w - 92, y: VIEW.y + 34, w: 168, h: 48 };
const LAYOUT = layoutNet();

/** Ключ названия улучшения: `upg` + id с заглавной буквы (`lives` → `upgLives`). */
const nameKey = (id: UpgradeId): TextKey => `upg${id[0].toUpperCase()}${id.slice(1)}` as TextKey;
/** Ключ описания по действию улучшения (`UpgradeEffect`): у 6а — `upgLivesDesc` и т. д., у остальных — `upgDesc` + действие с заглавной буквы. */
const DESC_KEY: Partial<Record<UpgradeEffect, TextKey>> = { lives: 'upgLivesDesc', coins: 'upgCoinsDesc', damage: 'upgDamageDesc', reward: 'upgRewardDesc' };
const descKey = (effect: UpgradeEffect): TextKey => DESC_KEY[effect] ?? (`upgDesc${effect[0].toUpperCase()}${effect.slice(1)}` as TextKey);

/** Узлы, которые не прибавляют число, а открывают башню или меняют поведение: у них в карточке — одна строка описания (`upgInfo…`). */
const INFO_EFFECTS: ReadonlySet<UpgradeEffect> = new Set(['tower', 'key', 'fever', 'autoWave']);

/** Строка описания узла-«включателя»: башня — «Открывает башню …», остальные — своя строка (`upgInfo` + id с заглавной буквы). */
function infoText(id: UpgradeId): string {
  const spec = CONFIG.meta.upgrades[id];
  if (spec.effect === 'tower') return t('upgInfoTower', { name: t(nameKey(id)) });
  return t(`upgInfo${id[0].toUpperCase()}${id.slice(1)}` as TextKey);
}

/** Что даёт улучшение на уровне level (суммарно): числом (жизни, монеты, щит, пиксели), процентами (урон, награда, цена, пауза, радиус, время лужи, возврат); у узлов-«включателей» — строка описания. */
function effectText(id: UpgradeId, level: number): string {
  const spec = CONFIG.meta.upgrades[id];
  if (INFO_EFFECTS.has(spec.effect)) return infoText(id);
  const total = spec.perLevel * level;
  let value: number;
  switch (spec.effect) {
    case 'sellRefund':
      value = Math.round((CONFIG.economy.sellRefund + total) * 100);
      break;
    case 'cooldown':
      // «стреляет чаще: в k раза» (таблица п. 3.3, принята владельцем 26 октября 2026): пауза ×(1 + total) — стрельба чаще в 1 / (1 + total) раза, с двумя знаками
      value = Math.round(100 / (1 + total)) / 100;
      break;
    case 'damage': case 'towerDamage': case 'reward': case 'price': case 'range': case 'puddleSec': case 'auraBoost': case 'freezeTime':
      value = Math.round(Math.abs(total) * 100);
      break;
    default:
      value = total;
  }
  return t(descKey(spec.effect), { n: num(value) });
}

/** Описание улучшения на уровне level, разобранное на подпись («урон всех башен») и значение («+80 %»): все описания записаны как «подпись: значение», делим по первому «: ». */
function effectParts(id: UpgradeId, level: number): { label: string; value: string } {
  const text = effectText(id, level);
  const i = text.indexOf(': ');
  return i < 0 ? { label: '', value: text } : { label: text.slice(0, i), value: text.slice(i + 2) };
}

/** Узел сети, которым на экране представлено улучшение (выбор и покупка по id в проверках): следующий, который можно взять, иначе первый не купленный, иначе последний уровень. */
function representative(id: UpgradeId): string {
  const next = nextNodeOf(id);
  if (next) return next;
  for (let L = 1; L <= maxLevel(id); L++) if (!nodeBought(nodeKey(id, L))) return nodeKey(id, L);
  return nodeKey(id, maxLevel(id));
}

/**
 * Узлы с меткой «★ рекомендуем» (решение владельца 15 октября 2026, docs/tester-feedback-plan-2026-10-15.md, пункт 8): «Сильное вещество», пока оно ниже 3-го уровня,
 * и «Сила» той башни, которую игрок больше всего ставил в последней партии, пока она не куплена до наибольшего уровня.
 */
function recommendedIds(): UpgradeId[] {
  const ids: UpgradeId[] = [];
  if (metaLevel('damage') < 3) ids.push('damage');
  const branch = favoriteBranch();
  const root = branch === null ? undefined : UPGRADE_IDS.find((id) => id === `${branch}Power`);
  if (root !== undefined && metaLevel(root) < maxLevel(root)) ids.push(root);
  return ids;
}

/**
 * Экран «Улучшения» — сеть древа в виде «Атом» (решения владельца 26 октября 2026, сообщения 2–4; макет `?qa&treemock=net` принят): ядро «Сильное вещество», кольца-орбиты
 * (открытые — синие, закрытые — серые, без текста), узлы башен — ромбы на границах колец. Узел можно взять, только если он соседний со взятым и его кольцо открыто
 * (зелёный обод); купленные — золотые. Тап по узлу выбирает его, справа — название, что даст, условие и кнопка покупки этого узла. Сеть двигается пальцем и мышью,
 * масштаб — колесом и щипком; на телефоне начальный масштаб крупнее (подписи читаются). Кнопка со стрелкой в углу — бесплатный сброс сети между попытками.
 */
export class UpgradesScene extends Phaser.Scene {
  private selected: UpgradeId = UPGRADE_IDS[0];
  /** Выбранный узел сети (`id#L`). */
  private selectedKey = '';
  private world!: Phaser.GameObjects.Container;
  private edges!: Phaser.GameObjects.Graphics;
  private dots!: Phaser.GameObjects.Graphics;
  private stars: Phaser.GameObjects.Text[] = [];
  private labels: { text: Phaser.GameObjects.Text; ring: number }[] = [];
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private balance!: Phaser.GameObjects.Text;
  private detailName!: Phaser.GameObjects.Text;
  private detailLevel!: Phaser.GameObjects.Text;
  private detailEffect!: Phaser.GameObjects.Text;
  private detailNeed!: Phaser.GameObjects.Text;
  /** «★ рекомендуем» над кнопкой покупки (у узла с меткой). */
  private detailHint!: Phaser.GameObjects.Text;
  private buyBg!: Phaser.GameObjects.Graphics;
  private buyLabel!: Phaser.GameObjects.Text;
  private respecGfx!: Phaser.GameObjects.Graphics;
  private respecLabel!: Phaser.GameObjects.Text;
  /** Откуда пришли: 'menu' — из главного меню («Играть» ведёт на выбор уровня); иначе с экрана конца уровня («Играть» начинает новую партию того же уровня). */
  private from: 'menu' | 'game' = 'game';
  private dragFrom: { x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null = null;
  private pinchFrom: { dist: number; zoom: number } | null = null;
  /** Уведомление «Открыта башня» (или null). */
  private toast: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Upgrades');
  }

  init(data?: { from?: 'menu' | 'game' }): void {
    this.from = data?.from === 'menu' ? 'menu' : 'game';
  }

  create(): void {
    this.toast = null;
    this.stars = [];
    this.labels = [];
    this.selected = 'damage';
    this.selectedKey = representative('damage');
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.add.text(W / 2, 40, t('upgradesTitle'), this.style(46, TEXT_COLORS.accent)).setOrigin(0.5);
    this.balance = this.add.text(W / 2, 88, '', this.style(30)).setOrigin(0.5);

    // Окно сети: рамка и сеть под маской
    const frame = this.add.graphics();
    frame.fillStyle(0x0b1430, 1).fillRoundedRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 16);
    this.world = this.add.container(0, 0);
    const mask = this.make.graphics({ x: 0, y: 0 }, false);
    mask.fillStyle(0xffffff, 1).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    this.world.setMask(mask.createGeometryMask());
    this.drawBackdrop();
    this.edges = this.add.graphics();
    this.dots = this.add.graphics();
    this.world.add([this.edges, this.dots]);
    this.addTowerIcons();
    this.addCore();
    this.placeLabels();
    const border = this.add.graphics();
    border.lineStyle(3, 0x3a5f9c, 1).strokeRoundedRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 16);

    // Касание: короткое — выбор узла, движение — перетаскивание; два пальца — масштаб; колесо — масштаб
    const area = this.add.zone(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2, VIEW.w, VIEW.h).setInteractive();
    area.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragFrom = { x: p.x, y: p.y, pan: { ...this.pan }, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (!this.pinchFrom) this.pinchFrom = { dist, zoom: this.zoom };
        else if (this.pinchFrom.dist > 0) this.setView(this.pinchFrom.zoom * (dist / this.pinchFrom.dist), this.pan);
        if (this.dragFrom) this.dragFrom.moved = true;
        return;
      }
      this.pinchFrom = null;
      const d = this.dragFrom;
      if (!d || !p.isDown) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_MAX_MOVE) d.moved = true;
      if (d.moved) this.setView(this.zoom, { x: d.pan.x + (p.x - d.x), y: d.pan.y + (p.y - d.y) });
    });
    const release = (p: Phaser.Input.Pointer): void => {
      const d = this.dragFrom;
      this.dragFrom = null;
      this.pinchFrom = null;
      if (d && !d.moved) this.tapAt(p.x, p.y);
    };
    area.on('pointerup', release);
    area.on('pointerupoutside', () => {
      this.dragFrom = null;
      this.pinchFrom = null;
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.setView(this.zoom * (dy > 0 ? 0.9 : 1.1), this.pan));

    this.respecGfx = this.add.graphics();
    this.respecLabel = this.add.text(RESPEC.x + 14, RESPEC.y, t('upgReset'), this.style(22)).setOrigin(0.5);
    this.add.zone(RESPEC.x, RESPEC.y, RESPEC.w, RESPEC.h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onRespec());

    this.buildDetail();
    this.addBottomButton(PLAY, t('upgPlay'), 0x2a8a4a, COLORS.merge, () => (this.from === 'menu' ? this.scene.start('Levels') : this.scene.start('Game', { level: this.nextLevelToPlay() })));
    this.addBottomButton(MENU, t('toMenu'), 0x2a3550, 0x4a5c82, () => this.scene.start('Menu'));
    this.setView(this.startZoom(), { x: 0, y: 0 });
    this.refresh();

    exposeMetaDebug(() => this.describe());
    if (QA_MODE) window.__pvbUpgrades = { focus: (id: string) => this.focus(id) };
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'upgrades', buttons: { play: PLAY, menu: MENU, respec: { ...RESPEC } }, texts: [this.balance.text, this.respecLabel.text] } : null));
  }

  /** Число открытых колец (подряд от первого). */
  private openRings(): number {
    let k = 0;
    while (k < LAYOUT.rings && isRingOpen(k + 1)) k++;
    return k;
  }

  /** Начальный масштаб: ядро и открытые кольца по высоте окна, не мельче, чем нужно для чтения подписей; на телефоне — крупнее (подписи читаются, сообщение 1 от 26 октября, п. 6.3). */
  private startZoom(): number {
    const fit = VIEW.h / (2 * (ringInner(this.openRings() + 1) + 10));
    const phone = window.innerWidth < 1000;
    return Phaser.Math.Clamp(fit, phone ? 1.0 : 0.72, phone ? 1.3 : 1.1);
  }

  /** Масштаб и сдвиг сети (центр сети — в середине окна плюс сдвиг); сдвиг ограничен так, чтобы сеть не уходила из окна целиком. */
  private setView(zoom: number, pan: { x: number; y: number }): void {
    this.zoom = Phaser.Math.Clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    const reach = (ringInner(LAYOUT.rings + 1) + 40) * this.zoom;
    this.pan = { x: Phaser.Math.Clamp(pan.x, -reach, reach), y: Phaser.Math.Clamp(pan.y, -reach, reach) };
    this.world.setScale(this.zoom).setPosition(VIEW.x + VIEW.w / 2 + this.pan.x, VIEW.y + VIEW.h / 2 + this.pan.y);
    const show = this.zoom >= LABEL_MIN_ZOOM;
    for (const l of this.labels) l.text.setVisible(show);
  }

  /** Сдвигает сеть так, чтобы узел улучшения оказался в середине окна (для проверок и выбора). */
  private focus(id: string): void {
    const placed = LAYOUT.nodes.get(representative(id));
    if (!placed) return;
    this.setView(this.zoom, { x: -placed.x * this.zoom, y: -placed.y * this.zoom });
  }

  /** Точка мира на экране. */
  private toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.world.x + x * this.zoom, y: this.world.y + y * this.zoom };
  }

  /** Фон «Атома»: полосы колец (открытые синие, закрытые серые), орбиты, три наклонные орбиты. */
  private drawBackdrop(): void {
    const g = this.add.graphics();
    for (let k = LAYOUT.rings; k >= 1; k--) {
      const open = isRingOpen(k);
      g.fillStyle(open ? 0x14295c : 0x1d2028, 1).fillCircle(0, 0, ringInner(k + 1));
      g.lineStyle(2, open ? 0x3f6fc4 : 0x3a3f4a, 1).strokeCircle(0, 0, ringInner(k + 1));
    }
    g.fillStyle(0x0b1430, 1).fillCircle(0, 0, ringInner(1));
    const outer = ringInner(LAYOUT.rings + 1) + 30;
    for (const tilt of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * 2 * Math.PI;
        const ex = Math.cos(a) * outer;
        const ey = Math.sin(a) * outer * 0.26;
        pts.push(new Phaser.Math.Vector2(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt)));
      }
      g.lineStyle(4, 0x9fd0ff, 0.1).strokePoints(pts, true);
    }
    this.world.add(g);
  }

  /** Рисунки башен в ромбах узлов башен; у Таблетки (открыта с начала) — свой ромб у входа в её сектор. */
  private addTowerIcons(): void {
    for (const [key, placed] of LAYOUT.nodes) {
      if (NET.nodes.get(key)?.ring !== 0) continue;
      const id = NET.nodes.get(key)!.upgrade.replace(/^tower/, '');
      const icon = this.add.container(placed.x, placed.y).setScale(0.2);
      createTowerArt(this, icon, (id.charAt(0).toLowerCase() + id.slice(1)) as TowerId);
      this.world.add(icon);
    }
  }

  private addCore(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.gold, 1).fillCircle(0, 0, NET_LAYOUT.coreR);
    g.lineStyle(6, COLORS.goldEdge, 1).strokeCircle(0, 0, NET_LAYOUT.coreR);
    g.lineStyle(12, 0xffe9a8, 0.18).strokeCircle(0, 0, NET_LAYOUT.coreR + 14);
    const text = this.add.text(0, 0, t('upgDamage'), { ...this.style(17, '#3a2a00', false), align: 'center', wordWrap: { width: NET_LAYOUT.coreR * 1.8 } }).setOrigin(0.5);
    this.world.add([g, text]);
  }

  /**
   * Подписи цепочек (название узла) — у первой цепочки каждого улучшения, снаружи её конца; место, которое задевает узел, ядро или уже поставленную подпись, пропускается,
   * пробуются другие (внутри, сбоку); подпись, которой негде встать, не выводится (сообщение 1 от 26 октября, п. 6.2). Мельче LABEL_MIN_ZOOM подписи скрыты.
   */
  private placeLabels(): void {
    const boxes: Phaser.Geom.Rectangle[] = [...LAYOUT.nodes.values()].map((n) => new Phaser.Geom.Rectangle(n.x - n.r - 2, n.y - n.r - 2, n.r * 2 + 4, n.r * 2 + 4));
    boxes.push(new Phaser.Geom.Rectangle(-NET_LAYOUT.coreR - 16, -NET_LAYOUT.coreR - 16, (NET_LAYOUT.coreR + 16) * 2, (NET_LAYOUT.coreR + 16) * 2));
    const seen = new Set<string>();
    for (const chain of NET.chains) {
      if (seen.has(chain.upgrade)) continue;
      seen.add(chain.upgrade);
      const first = LAYOUT.nodes.get(chain.keys[0])!;
      const last = LAYOUT.nodes.get(chain.keys[chain.keys.length - 1])!;
      const text = this.add.text(0, 0, t(nameKey(chain.upgrade)), { ...this.style(LABEL_PX, TEXT_COLORS.main, false), align: 'center', wordWrap: { width: 150 } }).setOrigin(0, 0);
      const w = text.width;
      const h = text.height;
      const out = { x: Math.cos(last.angle), y: Math.sin(last.angle) };
      const side = { x: -out.y, y: out.x };
      const spots = [
        { x: last.x + out.x * (16 + w / 2) - w / 2, y: last.y + out.y * (16 + h / 2) - h / 2 },
        { x: first.x - out.x * (16 + w / 2) - w / 2, y: first.y - out.y * (16 + h / 2) - h / 2 },
        { x: last.x + side.x * (18 + w / 2) - w / 2, y: last.y + side.y * (18 + h / 2) - h / 2 },
        { x: last.x - side.x * (18 + w / 2) - w / 2, y: last.y - side.y * (18 + h / 2) - h / 2 },
        { x: last.x + out.x * (40 + w / 2) - w / 2, y: last.y + out.y * (40 + h / 2) - h / 2 },
      ];
      const spot = spots.find((c) => !boxes.some((b) => Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(c.x, c.y, w, h), b)));
      if (!spot) {
        text.destroy();
        continue;
      }
      text.setPosition(spot.x, spot.y);
      boxes.push(new Phaser.Geom.Rectangle(spot.x, spot.y, w, h));
      this.world.add(text);
      this.labels.push({ text, ring: chain.ring });
    }
  }

  private buildDetail(): void {
    const g = this.add.graphics();
    g.fillStyle(0x14264b, 1).fillRoundedRect(DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h, 16);
    g.lineStyle(3, 0x3a5f9c, 1).strokeRoundedRect(DETAIL.x, DETAIL.y, DETAIL.w, DETAIL.h, 16);
    const x = DETAIL.x + 20;
    const ww = DETAIL.w - 40;
    this.detailName = this.add.text(x, DETAIL.y + 18, '', { ...this.style(30, TEXT_COLORS.accent), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.detailLevel = this.add.text(x, DETAIL.y + 100, '', this.style(22, TEXT_COLORS.soft, false)).setOrigin(0, 0);
    this.detailEffect = this.add.text(x, DETAIL.y + 136, '', { ...this.style(22, TEXT_COLORS.main, false), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.detailNeed = this.add.text(x, DETAIL.y + 240, '', { ...this.style(21, TEXT_COLORS.bad, false), wordWrap: { width: ww } }).setOrigin(0, 0);
    this.detailHint = this.add.text(x, BUY_CENTER.y - BUY.h / 2 - 34, '', this.style(22, TEXT_COLORS.accent, false)).setOrigin(0, 0);
    this.buyBg = this.add.graphics();
    this.buyLabel = this.add.text(BUY_CENTER.x, BUY_CENTER.y, '', this.style(26)).setOrigin(0.5);
    this.add.zone(BUY_CENTER.x, BUY_CENTER.y, BUY.w, BUY.h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onBuy());
  }

  private addBottomButton(r: { x: number; y: number; w: number; h: number }, label: string, fill: number, line: number, onTap: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    g.lineStyle(4, line, 1).strokeRoundedRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, 18);
    this.add.text(r.x, r.y, label, this.style(36)).setOrigin(0.5);
    this.add.zone(r.x, r.y, r.w, r.h).setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
  }

  /** Тап по окну сети: ближайший узел в пределах круга (с запасом под палец) становится выбранным. */
  private tapAt(sx: number, sy: number): void {
    const wx = (sx - this.world.x) / this.zoom;
    const wy = (sy - this.world.y) / this.zoom;
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const placed of LAYOUT.nodes.values()) {
      const d = Math.hypot(placed.x - wx, placed.y - wy);
      if (d < bestD && d <= placed.r + 14 / this.zoom) {
        bestD = d;
        best = placed;
      }
    }
    if (!best) return;
    const node = NET.nodes.get(best.key)!;
    if (best.key === this.selectedKey) return;
    this.selectedKey = best.key;
    this.selected = node.upgrade;
    sfx.select();
    this.refresh();
  }

  private onBuy(): void {
    const id = this.selected;
    // выбран купленный узел — покупается следующий узел того же улучшения, который можно взять
    const key = nodeBought(this.selectedKey) ? nextNodeOf(id) : this.selectedKey;
    if (key && buyNode(key)) {
      sfx.place();
      this.selectedKey = representative(id);
      this.refresh();
      // Узел башни: уведомление «Открыта башня» (конфликт 3 документа дизайна, принят владельцем 19 октября 2026)
      if (CONFIG.meta.upgrades[id].effect === 'tower') this.showToast(t('upgTowerBought', { name: t(nameKey(id)) }));
      return;
    }
    // не хватает очков, узел закрыт или куплен наибольший уровень: красная вспышка числа очков
    sfx.denied();
    this.balance.setColor(TEXT_COLORS.bad);
    this.time.delayedCall(350, () => this.balance.setColor(TEXT_COLORS.main));
  }

  /** Сброс сети: все малые и ключевые узлы возвращают ДНК (узлы башен остаются). */
  private onRespec(): void {
    if (resetNetwork() > 0) {
      sfx.select();
      this.selectedKey = representative(this.selected);
      this.refresh();
      return;
    }
    sfx.denied();
  }

  /** Связи сети: купленные с обеих сторон — золотые, от купленного к узлу, который можно взять, — зелёные, в открытых кольцах — синие, в закрытых — серые. */
  private drawEdges(): void {
    const g = this.edges;
    g.clear();
    const pos = (key: string): Placed | { x: number; y: number; r: number; angle: number } => (key === CORE ? { x: 0, y: 0, r: NET_LAYOUT.coreR, angle: 0 } : LAYOUT.nodes.get(key)!);
    const ringOf = (key: string): number => (key === CORE ? 0 : NET.nodes.get(key)?.ring ?? 0);
    const drawn = new Set<string>();
    for (const [a, set] of NET.adj) {
      for (const b of set) {
        const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (drawn.has(pair)) continue;
        drawn.add(pair);
        const pa = pos(a);
        const pb = pos(b);
        if (!pa || !pb) continue;
        const gold = nodeBought(a) && nodeBought(b);
        const lit = (nodeBought(a) && nodeAvailable(b)) || (nodeBought(b) && nodeAvailable(a));
        const open = isRingOpen(Math.max(ringOf(a), ringOf(b)));
        g.lineStyle(gold || lit ? 4 : 3, gold ? COLORS.gold : lit ? COLORS.merge : open ? 0x5a86cc : 0x464c58, gold || lit ? 0.95 : open ? 0.75 : 0.55);
        // по ходу орбиты: угол и радиус меняются плавно
        const a1 = Math.atan2(pa.y, pa.x);
        const r1 = Math.hypot(pa.x, pa.y);
        const r2 = Math.hypot(pb.x, pb.y);
        const span = Phaser.Math.Angle.Wrap(Math.atan2(pb.y, pb.x) - a1);
        if (r1 < 1) {
          g.lineBetween(pa.x, pa.y, pb.x, pb.y);
          continue;
        }
        const steps = Math.max(2, Math.ceil(Math.abs(span) * 20));
        const pts: Phaser.Math.Vector2[] = [];
        for (let s = 0; s <= steps; s++) {
          const f = s / steps;
          const r = r1 + (r2 - r1) * f;
          pts.push(new Phaser.Math.Vector2(Math.cos(a1 + span * f) * r, Math.sin(a1 + span * f) * r));
        }
        g.strokePoints(pts, false);
      }
    }
  }

  /** Узлы: купленные — золото, можно взять — синие с зелёным ободом, открыто, но путь не подведён — синие, закрытое кольцо — серые; выбранный — белый обод. Узлы башен — ромбы. */
  private drawDots(): void {
    const g = this.dots;
    g.clear();
    for (const [key, placed] of LAYOUT.nodes) {
      const node = NET.nodes.get(key)!;
      const bought = nodeBought(key);
      const avail = nodeAvailable(key);
      const open = isRingOpen(node.ring) && isBranchOpen(CONFIG.meta.upgrades[node.upgrade].branch);
      const selected = key === this.selectedKey;
      const fill = bought ? COLORS.gold : avail ? 0x2f7fd8 : open ? 0x24406e : 0x353a44;
      const rim = selected ? 0xffffff : bought ? COLORS.goldEdge : avail ? COLORS.merge : isKeyNode(node.upgrade) ? (open ? 0xc9b37a : 0x6a6450) : open ? 0x5a8fd8 : 0x555b66;
      if (node.ring === 0) {
        const pts = [new Phaser.Math.Vector2(placed.x, placed.y - placed.r), new Phaser.Math.Vector2(placed.x + placed.r, placed.y), new Phaser.Math.Vector2(placed.x, placed.y + placed.r), new Phaser.Math.Vector2(placed.x - placed.r, placed.y)];
        g.fillStyle(bought ? COLORS.gold : 0x1b2a4a, 1).fillPoints(pts, true);
        g.lineStyle(selected ? 5 : 3, selected ? 0xffffff : bought ? COLORS.goldEdge : avail ? COLORS.merge : 0x5a8fd8, 1).strokePoints(pts, true);
        continue;
      }
      g.fillStyle(fill, 1).fillCircle(placed.x, placed.y, placed.r);
      g.lineStyle(selected ? 5 : isKeyNode(node.upgrade) ? 4 : 2, rim, 1).strokeCircle(placed.x, placed.y, placed.r);
    }
  }

  /** Короткое уведомление над окном дерева (гаснет само). */
  private showToast(message: string): void {
    this.toast?.destroy();
    const text = this.add.text(VIEW.x + VIEW.w / 2, VIEW.y + 30, message, this.style(28, TEXT_COLORS.accent)).setOrigin(0.5).setDepth(10);
    this.toast = text;
    this.tweens.add({ targets: text, alpha: 0, delay: 1800, duration: 500, onComplete: () => text.destroy() });
  }

  /** Перерисовывает очки, связи, узлы, подписи, кнопку сброса и карточку выбранного узла. */
  private refresh(): void {
    this.balance.setText(t('dnaBalance', { n: metaDna() }));
    this.drawEdges();
    this.drawDots();
    for (const l of this.labels) l.text.setColor(isRingOpen(l.ring) ? TEXT_COLORS.main : TEXT_COLORS.dim);
    // «★ рекомендуем» — над узлом, которым представлено улучшение
    for (const s of this.stars) s.destroy();
    this.stars = recommendedIds().map((id) => {
      const placed = LAYOUT.nodes.get(representative(id))!;
      const star = this.add.text(placed.x, placed.y - placed.r - 2, '★', this.style(26, TEXT_COLORS.accent)).setOrigin(0.5, 1);
      this.world.add(star);
      return star;
    });
    const refund = networkRefund();
    this.respecGfx.clear();
    const on = refund > 0;
    this.respecGfx.fillStyle(on ? 0x2a3f6e : 0x1e2638, 1).fillRoundedRect(RESPEC.x - RESPEC.w / 2, RESPEC.y - RESPEC.h / 2, RESPEC.w, RESPEC.h, 12);
    this.respecGfx.lineStyle(3, on ? 0x8fb8ff : 0x3a4560, 1).strokeRoundedRect(RESPEC.x - RESPEC.w / 2, RESPEC.y - RESPEC.h / 2, RESPEC.w, RESPEC.h, 12);
    // стрелка-кольцо «вернуть» слева от надписи
    const ax = RESPEC.x - RESPEC.w / 2 + 24;
    const ar = 10;
    this.respecGfx.lineStyle(4, on ? 0xe8f0ff : 0x5a6680, 1).beginPath().arc(ax, RESPEC.y, ar, -0.3, Math.PI * 1.45).strokePath();
    const tx = ax + Math.cos(-0.3) * ar;
    const ty = RESPEC.y + Math.sin(-0.3) * ar;
    this.respecGfx.fillStyle(on ? 0xe8f0ff : 0x5a6680, 1).fillTriangle(tx - 6, ty - 3, tx + 6, ty - 3, tx, ty + 6);
    this.respecLabel.setColor(on ? TEXT_COLORS.main : TEXT_COLORS.dim);
    // надпись не шире кнопки
    this.respecLabel.setScale(Math.min(1, (RESPEC.w - 56) / Math.max(1, this.respecLabel.width)));
    this.refreshDetail();
  }

  private refreshDetail(): void {
    const id = this.selected;
    const spec = CONFIG.meta.upgrades[id];
    const level = metaLevel(id);
    const node = NET.nodes.get(this.selectedKey);
    const buyKey = node && !nodeBought(this.selectedKey) ? this.selectedKey : nextNodeOf(id);
    const price = buyKey ? NET.nodes.get(buyKey)!.price : nextPrice(id);
    this.detailName.setText(t(nameKey(id)));
    this.detailLevel.setText(t('upgLevel', { n: level, max: maxLevel(id) }));
    this.detailHint.setText(recommendedIds().includes(id) ? t('upgRecommended') : '');
    // Не максимум: подпись и строка «Сейчас +80 % → станет +90 %»; максимум — итог одной строкой
    const now = effectParts(id, level);
    const next = effectParts(id, level + 1);
    const info = INFO_EFFECTS.has(spec.effect);
    const maxed = level >= maxLevel(id);
    this.detailEffect.setText(maxed || info ? effectText(id, level) : `${now.label ? `${now.label}\n` : ''}${t('upgNowNext', { now: now.value, next: next.value })}`);
    // условие: ветка башни — купленным узлом башни; путь по сети — родителем (кольцо закрыто — без текста, как и само кольцо)
    const lines: string[] = [];
    const towerNode = towerNodeId(spec.branch);
    const ringClosed = buyKey === null && node !== undefined && !nodeBought(this.selectedKey) && !isRingOpen(node.ring);
    if (!isBranchOpen(spec.branch) && requirementOf(id)?.id !== towerNode) lines.push(t('upgLockedTower', { name: t(nameKey(towerNode)) }));
    const req = requirementOf(id);
    if (!ringClosed && req && !requirementMet(id)) lines.push(t('upgRequires', { name: t(nameKey(req.id)), n: req.level }));
    this.detailNeed.setText(lines.join('\n'));
    const can = buyKey !== null && nodeAvailable(buyKey) && isBranchOpen(spec.branch) && metaDna() >= (price ?? Infinity);
    const open = buyKey !== null && nodeAvailable(buyKey) && isBranchOpen(spec.branch);
    this.buyBg.clear();
    this.buyBg.fillStyle(can ? 0x2a8a4a : 0x2a3550, 1).fillRoundedRect(BUY_CENTER.x - BUY.w / 2, BUY_CENTER.y - BUY.h / 2, BUY.w, BUY.h, 14);
    this.buyBg.lineStyle(3, can ? COLORS.merge : 0x4a5c82, 1).strokeRoundedRect(BUY_CENTER.x - BUY.w / 2, BUY_CENTER.y - BUY.h / 2, BUY.w, BUY.h, 14);
    const label = maxed ? t('upgMax') : ringClosed ? '' : !open ? t('upgClosed') : t('upgBuy', { n: price ?? 0 });
    this.buyLabel.setText(label).setColor(can ? TEXT_COLORS.main : TEXT_COLORS.dim);
    let size = 26;
    this.buyLabel.setFontSize(size);
    while (this.buyLabel.width > BUY.w - 24 && size > 14) this.buyLabel.setFontSize((size -= 2));
  }

  /** Описание экрана для проверок (`window.__pvbMeta`): улучшения с узлом, которым каждое представлено на экране, выбранное улучшение и его карточка. */
  private describe(): MetaScreenInfo {
    const id = this.selected;
    return {
      visible: this.scene.isActive(),
      balance: this.balance.text,
      selected: id,
      scroll: Math.round(this.pan.x * 1000 + this.pan.y),
      view: { ...VIEW },
      zoom: this.zoom,
      selectedKey: this.selectedKey,
      labels: this.labels.filter((l) => l.text.visible).map((l) => {
        const c = this.toScreen(l.text.x + l.text.width / 2, l.text.y + l.text.height / 2);
        return { x: c.x, y: c.y, w: l.text.width * this.zoom, h: l.text.height * this.zoom };
      }),
      respec: { ...RESPEC },
      refund: networkRefund(),
      nodes: UPGRADE_IDS.map((nid) => {
        const placed = LAYOUT.nodes.get(representative(nid))!;
        const c = this.toScreen(placed.x, placed.y);
        const r = placed.r * this.zoom;
        return {
          id: nid,
          level: metaLevel(nid),
          max: maxLevel(nid),
          price: nextPrice(nid),
          canBuy: canBuy(nid),
          open: isNodeOpen(nid),
          onScreen: c.x - r >= VIEW.x && c.x + r <= VIEW.x + VIEW.w && c.y - r >= VIEW.y && c.y + r <= VIEW.y + VIEW.h,
          rect: { x: c.x, y: c.y, w: r * 2, h: r * 2 },
          label: { x: c.x, y: c.y, w: 0, h: 0 },
          recommended: recommendedIds().includes(nid),
        };
      }),
      detail: {
        texts: [this.detailName.text, this.detailLevel.text, this.detailEffect.text, this.detailNeed.text, this.buyLabel.text],
        hint: this.detailHint.text,
        buy: { x: BUY_CENTER.x, y: BUY_CENTER.y, w: BUY.w, h: BUY.h },
        fits: this.detailFits(),
      },
      play: { x: PLAY.x, y: PLAY.y, w: PLAY.w, h: PLAY.h },
    };
  }

  /** Тексты карточки помещаются: название — не выше уровня, описание и условие — выше кнопки покупки, надпись кнопки — по её ширине. */
  private detailFits(): boolean {
    const buyTop = BUY_CENTER.y - BUY.h / 2;
    return (
      this.detailName.y + this.detailName.height <= this.detailLevel.y &&
      this.detailEffect.y + this.detailEffect.height <= this.detailNeed.y &&
      this.detailNeed.y + this.detailNeed.height <= buyTop - 2 &&
      this.buyLabel.width <= BUY.w - 12
    );
  }

  private style(size: number, color: string = TEXT_COLORS.main, stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: TEXT_COLORS.stroke,
      strokeThickness: stroke && size > 20 ? 4 : 0,
      resolution: 2,
    };
  }

  /** Куда ведёт «Играть» с экрана конца уровня: пройденный уровень — на следующий открытый (повтор пройденного даёт лишь 10 % очков), иначе — тот же уровень заново. */
  private nextLevelToPlay(): number {
    const level = currentLevel();
    return isLevelBeaten(level) && level < CONFIG.levels.count && isLevelOpen(level + 1) ? level + 1 : level;
  }
}

declare global {
  interface Window {
    /** Только режим проверки: сдвинуть сеть к узлу улучшения (проверки выбирают узлы касанием). */
    __pvbUpgrades?: { focus: (id: string) => void };
  }
}
