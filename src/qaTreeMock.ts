import Phaser from 'phaser';
import { CONFIG } from './config';
import { t, type TextKey } from './i18n';
import { createTowerArt, type TowerId } from './objects/Tower';
import { COLORS } from './theme';

/**
 * Макеты древа улучшений (только режим проверки, `?qa&treemock=atom` или `?qa&treemock=poe`; в игровую сборку не попадают, как qaArtSheet.ts).
 * Общее (решения владельца 25 октября 2026, сообщение 5, п. 5, и 26 октября 2026, сообщение 1, п. 6): в центре «Сильное вещество»; кольца открываются победами на уровнях
 * (в макете открыты 1–2 — после победы на уровне 2), закрытые — серые; узлы силы стоят в кольцах по таблице п. 4 плана `docs/levels-plan-2026-10-25.md`, узлы башен — ромбами
 * вокруг центра, вне колец (только ценой); связи кончаются на внешнем кольце; подписи не налезают друг на друга и на узлы (подпись, которой негде встать, не выводится).
 * «Атом» — ядро, круговые орбиты-кольца, связи изогнуты по ходу орбит, три наклонные орбиты фоном. «PoE» — созвездие: кроме связей ветки узлы одного кольца связаны с соседями
 * по кольцу (путь можно вести в обход), ключевые узлы крупнее, с золотым ободом.
 * Мышью и пальцем: перетаскивание и масштаб (колесо, щипок); на телефоне начальный масштаб — центр и открытые кольца; `&zoom=0.5` — весь макет (подписи скрыты мельче 0,7).
 */
type Variant = 'atom' | 'poe';

/** Узел и его кольцо (1–5) по таблице п. 4 плана; ключевые узлы — «Key», «Лихорадка», «Автостарт». */
interface MockNode {
  id: string;
  ring: number;
}

const FIRST_FOUR: TowerId[] = ['pill', 'syrup', 'fizz', 'syringe'];
const RINGS_BY_GROUP: [TowerId[], Record<string, number>][] = [
  [FIRST_FOUR, { Power: 1, Rate: 2, Range: 3, Key: 3, Cheap: 5 }],
  [['ampule', 'lamp'], { Power: 2, Rate: 3, Range: 3, Key: 4, Cheap: 5 }],
  [['antibiotic', 'vitamin'], { Power: 3, Rate: 3, Range: 4, Key: 4, Cheap: 5 }],
  [['frost', 'patch'], { Power: 4, Rate: 4, Range: 4, Key: 5, Cheap: 5 }],
];
const ringOf = (tower: TowerId, suffix: string): number => RINGS_BY_GROUP.find(([list]) => list.includes(tower))![1][suffix];

const BRANCHES: { id: string; tower?: TowerId; nodes: MockNode[] }[] = [
  { id: 'body', nodes: [{ id: 'coins', ring: 1 }, { id: 'reward', ring: 1 }] },
  { id: 'defense', nodes: [{ id: 'lives', ring: 2 }, { id: 'shield', ring: 2 }, { id: 'recycle', ring: 3 }, { id: 'reinforce', ring: 3 }] },
  { id: 'skills', nodes: [{ id: 'fever', ring: 3 }, { id: 'autoWave', ring: 4 }] },
  ...(['pill', 'syrup', 'fizz', 'syringe', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'] as TowerId[]).map((tw) => ({
    id: tw,
    tower: tw,
    nodes: ['Power', 'Rate', 'Range', 'Key', 'Cheap']
      .filter((s) => `${tw}${s}` in CONFIG.meta.upgrades)
      .map((s) => ({ id: `${tw}${s}`, ring: ringOf(tw, s) })),
  })),
];
/** Открыто колец в макете (победа на уровне 2). */
const OPEN_RINGS = 2;
/** Куплено в макете. */
const BOUGHT = new Set(['damage', 'coins', 'towerSyrup', 'towerFizz', 'towerSyringe', 'pillPower', 'syrupPower', 'lives']);
const KEY_NODES = (id: string): boolean => id.endsWith('Key') || id === 'fever' || id === 'autoWave';

/** Радиус кольца k (1–5) и ромбов башен (k = 0), пикселей мира. */
const R = (k: number): number => (k === 0 ? 92 : 120 + 100 * k);
/** Расстояние между узлами одной ветки в одном кольце (по дуге), пикселей. */
const SPREAD_PX = 64;
/** Подписи видны при масштабе не мельче этого. */
const LABEL_MIN_ZOOM = 0.7;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface Placed {
  id: string;
  ring: number;
  x: number;
  y: number;
  r: number;
  angle: number;
  branch: number;
}

export class TreeMockScene extends Phaser.Scene {
  private labels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('TreeMock');
  }

  create(): void {
    const variant: Variant = new URLSearchParams(window.location.search).get('treemock') === 'poe' ? 'poe' : 'atom';
    this.cameras.main.setBackgroundColor(variant === 'atom' ? 0x0b1430 : 0x0d0f1c);
    const g = this.add.graphics();
    const n = BRANCHES.length;
    const branchAngle = (b: number): number => -Math.PI / 2 + (b * 2 * Math.PI) / n;
    // кольца: полосы между орбитами — открытые синие, закрытые серые
    for (let k = 5; k >= 1; k--) {
      const open = k <= OPEN_RINGS;
      g.fillStyle(open ? (variant === 'atom' ? 0x16306a : 0x1a2546) : 0x22252d, 1).fillCircle(0, 0, R(k) + 50);
      g.lineStyle(2, open ? 0x3f6fc4 : 0x3a3f4a, 1).strokeCircle(0, 0, R(k) + 50);
    }
    g.fillStyle(variant === 'atom' ? 0x0b1430 : 0x0d0f1c, 1).fillCircle(0, 0, R(1) - 50);
    // орбиты по центру колец
    for (let k = 1; k <= 5; k++) g.lineStyle(variant === 'atom' ? 2 : 1, k <= OPEN_RINGS ? 0x6f9cff : 0x4a505c, variant === 'atom' ? 0.55 : 0.35).strokeCircle(0, 0, R(k));
    if (variant === 'atom') {
      // три наклонные орбиты атома — фоном, за узлами
      for (const tilt of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * 2 * Math.PI;
          const ex = Math.cos(a) * (R(5) + 40);
          const ey = Math.sin(a) * (R(5) + 40) * 0.28;
          pts.push(new Phaser.Math.Vector2(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt)));
        }
        g.lineStyle(3, 0x9fd0ff, 0.12).strokePoints(pts, true);
      }
    }

    // расстановка узлов: ветка — сектор, узлы ветки в одном кольце расходятся по дуге
    const placed: Placed[] = [];
    BRANCHES.forEach((br, b) => {
      const base = branchAngle(b);
      for (let k = 1; k <= 5; k++) {
        const inRing = br.nodes.filter((node) => node.ring === k);
        inRing.forEach((node, j) => {
          const da = (SPREAD_PX / R(k)) * (j - (inRing.length - 1) / 2);
          const swirl = variant === 'atom' ? 0.06 * k : 0;
          const a = base + da + swirl;
          placed.push({ id: node.id, ring: k, x: Math.cos(a) * R(k), y: Math.sin(a) * R(k), r: KEY_NODES(node.id) ? 19 : 15, angle: a, branch: b });
        });
      }
    });
    const towerPos = (b: number): { x: number; y: number } => ({ x: Math.cos(branchAngle(b)) * R(0), y: Math.sin(branchAngle(b)) * R(0) });

    // связи ветки: от ромба башни (или от центра) к узлам по порядку колец
    const edge = (x1: number, y1: number, x2: number, y2: number, open: boolean, curved: boolean): void => {
      const color = open ? 0x7fb2ff : 0x4a505c;
      const alpha = open ? 0.9 : 0.6;
      if (!curved) {
        g.lineStyle(3, color, alpha).lineBetween(x1, y1, x2, y2);
        return;
      }
      // «Атом»: дуга, закрученная по ходу орбит (квадратичная кривая с опорой, сдвинутой по кругу)
      const a1 = Math.atan2(y1, x1);
      const a2 = Math.atan2(y2, x2);
      const r1 = Math.hypot(x1, y1);
      const r2 = Math.hypot(x2, y2);
      const am = a1 + Phaser.Math.Angle.Wrap(a2 - a1) / 2 + 0.12;
      const rm = (r1 + r2) / 2;
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x1, y1), new Phaser.Math.Vector2(Math.cos(am) * rm, Math.sin(am) * rm), new Phaser.Math.Vector2(x2, y2));
      g.lineStyle(3, color, alpha);
      curve.draw(g, 24);
    };
    BRANCHES.forEach((br, b) => {
      // узлы одного кольца растут от одного предка (развилка); следующее кольцо — от первого узла предыдущего
      let anchor = br.tower ? towerPos(b) : { x: 0, y: 0 };
      for (let k = 1; k <= 5; k++) {
        const group = placed.filter((p) => p.branch === b && p.ring === k);
        for (const p of group) edge(anchor.x, anchor.y, p.x, p.y, k <= OPEN_RINGS, variant === 'atom');
        if (group.length > 0) anchor = { x: group[0].x, y: group[0].y };
      }
    });
    if (variant === 'poe') {
      // «PoE»: соседние по кольцу узлы соседних веток связаны дугой по кольцу — путь можно вести в обход
      for (let k = 1; k <= 5; k++) {
        const ring = placed.filter((p) => p.ring === k).sort((p, q) => Phaser.Math.Angle.Wrap(p.angle) - Phaser.Math.Angle.Wrap(q.angle));
        ring.forEach((p, i) => {
          const q = ring[(i + 1) % ring.length];
          if (q.branch === p.branch) return;
          const a1 = Phaser.Math.Angle.Wrap(p.angle);
          const span = Phaser.Math.Angle.Wrap(q.angle - p.angle);
          if (span <= 0 || span > 1.2) return;
          const pts: Phaser.Math.Vector2[] = [];
          for (let s = 0; s <= 12; s++) pts.push(new Phaser.Math.Vector2(Math.cos(a1 + (span * s) / 12) * R(k), Math.sin(a1 + (span * s) / 12) * R(k)));
          g.lineStyle(2, k <= OPEN_RINGS ? 0xc9b37a : 0x4a505c, k <= OPEN_RINGS ? 0.55 : 0.45).strokePoints(pts, false);
        });
      }
    }

    // ромбы башен (вне колец) и узлы
    BRANCHES.forEach((br, b) => {
      if (!br.tower) return;
      const p = towerPos(b);
      const owned = br.tower === 'pill' || BOUGHT.has(`tower${cap(br.tower)}`);
      g.fillStyle(owned ? COLORS.gold : 0x1b2a4a, 1).fillPoints(this.diamond(p.x, p.y, 22), true);
      g.lineStyle(3, owned ? COLORS.goldEdge : 0x5a8fd8, 1).strokePoints(this.diamond(p.x, p.y, 22), true);
      const icon = this.add.container(p.x, p.y).setScale(0.26);
      createTowerArt(this, icon, br.tower);
    });
    for (const p of placed) {
      const open = p.ring <= OPEN_RINGS;
      const bought = BOUGHT.has(p.id);
      const key = KEY_NODES(p.id);
      g.fillStyle(bought ? COLORS.gold : open ? 0x2a5c9a : 0x3a3f48, 1).fillCircle(p.x, p.y, p.r);
      g.lineStyle(key ? 5 : 3, key && variant === 'poe' ? COLORS.gold : bought ? COLORS.goldEdge : open ? COLORS.merge : 0x555b66, 1).strokeCircle(p.x, p.y, p.r);
      if (variant === 'atom') g.fillStyle(0xffffff, open ? 0.35 : 0.12).fillCircle(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.3);
    }
    // ядро
    g.fillStyle(COLORS.gold, 1).fillCircle(0, 0, 46);
    g.lineStyle(5, COLORS.goldEdge, 1).strokeCircle(0, 0, 46);
    if (variant === 'atom') g.lineStyle(10, 0xffe9a8, 0.18).strokeCircle(0, 0, 58);
    this.add.text(0, 0, t('upgDamage'), { fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#3a2a00', align: 'center', wordWrap: { width: 80 } }).setOrigin(0.5);

    this.placeLabels(placed);
    const title = this.add
      .text(12, 10, variant === 'atom' ? 'МАКЕТ ДРЕВА «АТОМ»: ядро, орбиты-кольца (1–2 открыты), связи по ходу орбит' : 'МАКЕТ ДРЕВА «PoE»: созвездие — связи веток и соседей по кольцу, ключевые узлы крупнее', { fontFamily: 'Arial', fontSize: '15px', color: '#cfe0ff' })
      .setScrollFactor(0);
    // заголовок — на своей камере без масштаба, остальное — на главной
    const ui = this.cameras.add(0, 0, CONFIG.screen.width, CONFIG.screen.height);
    ui.ignore(this.children.list.filter((obj) => obj !== title));
    this.cameras.main.ignore(title);
    this.addCameraControls();
  }

  /**
   * Подписи без наложений: для каждого узла пробуются места снаружи кольца, внутри, справа и слева; место, которое задевает уже поставленную подпись или любой узел, пропускается;
   * если свободного места нет, подпись не ставится (в макете у таких узлов подписи нет — на настоящем экране она будет в карточке узла).
   */
  private placeLabels(placed: Placed[]): void {
    const boxes: Phaser.Geom.Rectangle[] = placed.map((p) => new Phaser.Geom.Rectangle(p.x - p.r - 2, p.y - p.r - 2, p.r * 2 + 4, p.r * 2 + 4));
    boxes.push(new Phaser.Geom.Rectangle(-50, -50, 100, 100));
    for (const p of placed) {
      const open = p.ring <= OPEN_RINGS;
      const text = this.add.text(0, 0, t(`upg${cap(p.id)}` as TextKey), { fontFamily: 'Arial', fontSize: '13px', color: open ? '#e8f0ff' : '#858d9c', align: 'center', wordWrap: { width: 96 } });
      const w = text.width;
      const h = text.height;
      const out = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
      const gap = p.r + 4;
      const candidates = [
        { x: p.x + out.x * (gap + w / 2) - w / 2, y: p.y + out.y * (gap + h / 2) - h / 2 },
        { x: p.x - w / 2, y: p.y + gap },
        { x: p.x - w / 2, y: p.y - gap - h },
        { x: p.x + gap, y: p.y - h / 2 },
        { x: p.x - gap - w, y: p.y - h / 2 },
        { x: p.x - out.x * (gap + w / 2) - w / 2, y: p.y - out.y * (gap + h / 2) - h / 2 },
      ];
      const spot = candidates.find((c) => {
        const r = new Phaser.Geom.Rectangle(c.x, c.y, w, h);
        return !boxes.some((b) => Phaser.Geom.Intersects.RectangleToRectangle(r, b));
      });
      if (!spot) {
        text.destroy();
        continue;
      }
      text.setPosition(spot.x, spot.y);
      boxes.push(new Phaser.Geom.Rectangle(spot.x, spot.y, w, h));
      this.labels.push(text);
    }
  }

  private diamond(x: number, y: number, s: number): Phaser.Math.Vector2[] {
    return [new Phaser.Math.Vector2(x, y - s), new Phaser.Math.Vector2(x + s, y), new Phaser.Math.Vector2(x, y + s), new Phaser.Math.Vector2(x - s, y)];
  }

  /**
   * Камера: центр мира в середине экрана; начальный масштаб — центр и открытые кольца (на компьютере ×0,85, на телефоне ×1,6 — подписи читаются), `&zoom=` — свой;
   * перетаскивание и масштаб колесом или щипком (0,45–2,5); подписи прячутся мельче LABEL_MIN_ZOOM.
   */
  private addCameraControls(): void {
    const cam = this.cameras.main;
    const phone = window.innerWidth < 1000;
    const zoom = Number(new URLSearchParams(window.location.search).get('zoom')) || (phone ? 1.6 : 0.85);
    const apply = (z: number): void => {
      cam.setZoom(Phaser.Math.Clamp(z, 0.45, 2.5));
      const show = cam.zoom >= LABEL_MIN_ZOOM;
      for (const l of this.labels) l.setVisible(show);
    };
    cam.centerOn(0, 0);
    apply(zoom);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const prev = Phaser.Math.Distance.Between(a.prevPosition.x, a.prevPosition.y, b.prevPosition.x, b.prevPosition.y);
        if (prev > 0) apply(cam.zoom * (dist / prev));
        return;
      }
      if (p.isDown) cam.setScroll(cam.scrollX - (p.x - p.prevPosition.x) / cam.zoom, cam.scrollY - (p.y - p.prevPosition.y) / cam.zoom);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => apply(cam.zoom * (dy > 0 ? 0.9 : 1.1)));
  }
}
