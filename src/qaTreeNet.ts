import Phaser from 'phaser';
import { CONFIG } from './config';
import { t, type TextKey } from './i18n';
import { createTowerArt, type TowerId } from './objects/Tower';
import { COLORS } from './theme';

/**
 * Макет сети древа «Атом» на настоящих узлах (только режим проверки, `?qa&treemock=net`; в игровую сборку не попадает, как qaTreeMock.ts).
 * Решения владельца 26 октября 2026, сообщение 3, п. 4: вид «Атом», устройство как пассивное древо PoE — узел можно взять, только если он соседний со взятым; каждый уровень
 * нынешних узлов — отдельный малый узел с теми же числами (п. 4.4); древо ≈ 37 000 ДНК (п. 2.2) — к нынешним узлам добавлены продолжение веток башен и перемычки на орбитах.
 * Кольца, их открытие и состав — `docs/levels30-enemies-plan-2026-10-26.md`, пп. 2–3 (6 колец; в макете открыты 1–2 — после победы на уровне 2). Узлы башен — ромбы на границе
 * кольца входа своего сектора, вне колец (только ценой). Цвета: куплено — золото; можно взять (соседний с купленным, кольцо открыто) — зелёный обод; открыто, но не соседний —
 * синий; закрытое кольцо — серый; точка в узле — новый узел (продолжение ветки или перемычка).
 * `&zoom=` — начальный масштаб; перетаскивание и масштаб колесом или щипком; подписи цепочек прячутся мельче LABEL_MIN_ZOOM. Итог расчёта — `window.__treeNet` (для smoke).
 */

type Sector = 'body' | 'defense' | TowerId;
const SECTORS: Sector[] = ['body', 'defense', 'pill', 'syrup', 'fizz', 'syringe', 'ampule', 'lamp', 'antibiotic', 'vitamin', 'frost', 'patch'];
const TOWERS: TowerId[] = ['pill', 'syrup', 'fizz', 'syringe', 'ampule', 'lamp', 'antibiotic', 'vitamin', 'frost', 'patch'];
/** Кольцо входа сектора башни (план, п. 3). */
const ENTRY: Record<TowerId, number> = { pill: 1, syrup: 1, fizz: 1, syringe: 1, ampule: 2, lamp: 2, antibiotic: 3, vitamin: 3, frost: 4, patch: 4 };
const RINGS = 6;
/** Открыто колец в макете (победа на уровне 2). */
const OPEN_RINGS = 2;
/** Перемычки: кольцо → сумма их цен, ДНК (план, пп. 2–3: 5 в кольце 1, 7 в кольце 5, 9 в кольце 6). */
const BRIDGES: Record<number, { count: number; dna: number }> = { 1: { count: 5, dna: 500 }, 5: { count: 7, dna: 1200 }, 6: { count: 9, dna: 1820 } };
/** Продолжение веток башен: уровней Силы и Скорострельности, рост цены к прежнему уровню, предел цены (план, пп. 2 и 4). */
const EXT = { power: 3, rate: 2, growth: 1.25, maxPrice: 430 };

/** Радиус внутренней границы кольца k (1–6) и шаг узлов цепочки, пикселей мира. */
const RIN = (k: number): number => 110 + 130 * (k - 1);
const STEP = 20;
const LABEL_MIN_ZOOM = 0.8;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Цепочка — подряд идущие уровни одного узла в одном кольце; узлы цепочки идут от центра наружу. */
interface Chain {
  key: string;
  label: string;
  sector: Sector;
  ring: number;
  nodes: string[];
  prices: number[];
  /** Узел-родитель первого узла цепочки: id узла, 'core' или 'tower:<id>'. */
  parent: string;
  isNew: boolean;
  isKey: boolean;
}

interface NetNode {
  id: string;
  ring: number;
  x: number;
  y: number;
  r: number;
  angle: number;
  isNew: boolean;
  isKey: boolean;
  price: number;
}

/** Кольцо уровня L нынешнего узла (план, п. 3). */
function ringOf(id: string, branch: string, level: number): number {
  switch (id) {
    case 'damage':
      return level <= 5 ? 1 : level <= 7 ? 2 : level === 8 ? 3 : level === 9 ? 4 : 5;
    case 'coins':
      return 1;
    case 'reward':
      return level <= 2 ? 1 : level <= 4 ? 2 : 3;
    case 'lives':
    case 'autoWave':
      return 2;
    case 'shield':
    case 'recycle':
      return level <= 2 ? 2 : 3;
    case 'reinforce':
      return level <= 3 ? 3 : level <= 6 ? 4 : 5;
    case 'fever':
      return 3;
  }
  const s = ENTRY[branch as TowerId];
  const suffix = id.slice(branch.length);
  if (suffix === 'Rate') return level <= 3 ? s : s + 1;
  if (suffix === 'Cheap' || suffix === 'Key') return s + 1;
  return s;
}

/** Родитель первого уровня нынешнего узла в сети: связи повторяют `requires`, узлы башен — вход сектора, умения — в секторе «Защита». */
function parentOf(id: string, branch: string): string {
  const parents: Record<string, string> = { damage: 'core', coins: 'damage#1', reward: 'damage#2', lives: 'coins#3', shield: 'lives#1', recycle: 'coins#5', reinforce: 'reward#3', fever: 'shield#2', autoWave: 'lives#1' };
  if (parents[id]) return parents[id];
  const suffix = id.slice(branch.length);
  if (suffix === 'Power') return `tower:${branch}`;
  if (branch === 'vitamin' && suffix === 'Cheap') return 'vitaminRange#2';
  if (suffix === 'Cheap') return `${branch}Rate#2`;
  if (suffix === 'Key') return `${branch}Power#3`;
  return `${branch}Power#2`;
}

function buildChains(): Chain[] {
  const chains: Chain[] = [];
  const ups = CONFIG.meta.upgrades as Record<string, { branch: string; effect: string; prices: number[] }>;
  for (const [id, u] of Object.entries(ups)) {
    if (u.branch === 'towers') continue;
    const sector: Sector = u.branch === 'body' ? 'body' : u.branch === 'defense' || u.branch === 'skills' ? 'defense' : (u.branch as TowerId);
    let parent = parentOf(id, u.branch);
    let current: Chain | null = null;
    u.prices.forEach((price, i) => {
      const ring = ringOf(id, u.branch, i + 1);
      if (!current || current.ring !== ring) {
        if (current) parent = current.nodes[current.nodes.length - 1];
        current = { key: `${id}@${ring}`, label: t(`upg${cap(id)}` as TextKey), sector, ring, nodes: [], prices: [], parent, isNew: false, isKey: u.effect === 'key' || id === 'fever' || id === 'autoWave' };
        chains.push(current);
      }
      current.nodes.push(`${id}#${i + 1}`);
      current.prices.push(price);
    });
  }
  // продолжение веток башен: через два кольца от входа, не дальше последнего
  for (const tw of TOWERS) {
    for (const [suffix, count] of [['Power', EXT.power], ['Rate', EXT.rate]] as [string, number][]) {
      const base = ups[`${tw}${suffix}`];
      if (!base) continue;
      const prices: number[] = [];
      let p = base.prices[base.prices.length - 1];
      for (let i = 0; i < count; i++) {
        p = Math.round(p * EXT.growth);
        prices.push(Math.min(p, EXT.maxPrice));
      }
      chains.push({
        key: `${tw}${suffix}X`,
        label: `${t(`upg${cap(tw)}${suffix}` as TextKey)} +`,
        sector: tw,
        ring: Math.min(ENTRY[tw] + 3, RINGS),
        nodes: prices.map((_, i) => `${tw}${suffix}X#${i + 1}`),
        prices,
        parent: `${tw}${suffix}#${base.prices.length}`,
        isNew: true,
        isKey: false,
      });
    }
  }
  return chains;
}

/** Делит сумму на n целых цен, отличающихся не больше чем на 1. */
function splitPrices(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

/** Куплено в макете (после победы на уровне 2, ≈ 2 340 ДНК из 2 785): путь через Шприц и Сироп, одна перемычка, первые узлы кольца 2. */
const BOUGHT_TOWERS = new Set<TowerId>(['pill', 'syrup', 'fizz', 'syringe', 'ampule']);
const BOUGHT_PREFIX: [string, number][] = [
  ['damage', 6], ['coins', 4], ['reward', 2], ['lives', 1],
  ['syringePower', 5], ['syringeRange', 2], ['syringeRate', 3], ['syringeKey', 1], ['syrupPower', 3], ['fizzPower', 2],
];

export class TreeNetScene extends Phaser.Scene {
  private labels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('TreeNet');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1430);
    const g = this.add.graphics();
    const chains = buildChains();
    const sectorAngle = (s: Sector): number => -Math.PI / 2 + (SECTORS.indexOf(s) * 2 * Math.PI) / SECTORS.length;
    const sectorWidth = (2 * Math.PI) / SECTORS.length;
    const swirl = (r: number): number => 0.00032 * r;

    // расстановка: цепочки сектора в кольце — рядом по дуге, узлы цепочки — от внутренней границы кольца наружу (с закруткой по ходу орбит)
    const nodes = new Map<string, NetNode>();
    const ends = new Map<string, { first: NetNode; last: NetNode }[]>(); // `${sector}@${ring}` → концы цепочек слева направо
    for (const sector of SECTORS) {
      for (let k = 1; k <= RINGS; k++) {
        const list = chains.filter((c) => c.sector === sector && c.ring === k);
        if (list.length === 0) continue;
        const rMid = RIN(k) + 65;
        const da = Math.min(24 / rMid, (sectorWidth * 0.86) / list.length);
        const row: { first: NetNode; last: NetNode }[] = [];
        list.forEach((c, j) => {
          const a0 = sectorAngle(sector) + da * (j - (list.length - 1) / 2);
          let first: NetNode | null = null;
          let last: NetNode | null = null;
          c.nodes.forEach((id, i) => {
            const r = RIN(k) + 20 + STEP * i;
            const a = a0 + swirl(r);
            const n: NetNode = { id, ring: k, x: Math.cos(a) * r, y: Math.sin(a) * r, r: c.isKey ? 11 : 7, angle: a, isNew: c.isNew, isKey: c.isKey, price: c.prices[i] };
            nodes.set(id, n);
            first ??= n;
            last = n;
          });
          row.push({ first: first!, last: last! });
        });
        ends.set(`${sector}@${k}`, row);
      }
    }
    // ромбы башен — на внутренней границе кольца входа
    const towerNode = new Map<TowerId, NetNode>();
    for (const tw of TOWERS) {
      const r = RIN(ENTRY[tw]) - 2;
      const a = sectorAngle(tw) + swirl(r);
      towerNode.set(tw, { id: `tower:${tw}`, ring: 0, x: Math.cos(a) * r, y: Math.sin(a) * r, r: 13, angle: a, isNew: false, isKey: false, price: tw === 'pill' ? 0 : CONFIG.meta.upgrades[`tower${cap(tw)}`].prices[0] });
    }
    const core: NetNode = { id: 'core', ring: 0, x: 0, y: 0, r: 46, angle: 0, isNew: false, isKey: false, price: 0 };
    const nodeOf = (id: string): NetNode => (id === 'core' ? core : id.startsWith('tower:') ? towerNode.get(id.slice(6) as TowerId)! : nodes.get(id)!);

    // связи: внутри цепочки, от родителя к первому узлу цепочки, по орбите между соседними секторами (с перемычками в кольцах 1, 5, 6)
    const edges: [string, string, 'chain' | 'parent' | 'orbit'][] = [];
    for (const c of chains) {
      edges.push([c.parent, c.nodes[0], 'parent']);
      for (let i = 1; i < c.nodes.length; i++) edges.push([c.nodes[i - 1], c.nodes[i], 'chain']);
    }
    const orbitPath = new Map<string, { a1: number; r1: number; span: number; r2: number }>();
    for (let k = 1; k <= RINGS; k++) {
      const filled = SECTORS.filter((s) => ends.has(`${s}@${k}`));
      if (filled.length < 2) continue;
      const pairs = filled.map((s, i) => [s, filled[(i + 1) % filled.length]] as [Sector, Sector]);
      const bridge = BRIDGES[k];
      const perPair = pairs.map((_, i) => (bridge ? Math.floor(bridge.count / pairs.length) + (i < bridge.count % pairs.length ? 1 : 0) : 0));
      const prices = bridge ? splitPrices(bridge.dna, bridge.count) : [];
      let bi = 0;
      pairs.forEach(([sa, sb], pi) => {
        const rowA = ends.get(`${sa}@${k}`)!;
        const a = rowA[rowA.length - 1].last;
        const b = ends.get(`${sb}@${k}`)![0].last;
        const span = Phaser.Math.Angle.Wrap(b.angle - a.angle) <= 0 ? Phaser.Math.Angle.Wrap(b.angle - a.angle) + 2 * Math.PI : Phaser.Math.Angle.Wrap(b.angle - a.angle);
        const rOrbit = RIN(k) + 118;
        const chain = [a.id];
        for (let i = 1; i <= perPair[pi]; i++) {
          const ang = a.angle + (span * i) / (perPair[pi] + 1);
          const id = `bridge${k}_${bi + 1}`;
          nodes.set(id, { id, ring: k, x: Math.cos(ang) * rOrbit, y: Math.sin(ang) * rOrbit, r: 7, angle: ang, isNew: true, isKey: false, price: prices[bi] });
          bi++;
          chain.push(id);
        }
        chain.push(b.id);
        for (let i = 1; i < chain.length; i++) {
          edges.push([chain[i - 1], chain[i], 'orbit']);
          orbitPath.set(`${chain[i - 1]}>${chain[i]}`, { a1: 0, r1: 0, span: 0, r2: rOrbit });
        }
      });
    }

    // купленное и «можно взять»: узел можно взять, если кольцо открыто и он соседний с купленным (или с ядром, или с купленной башней)
    const bought = new Set<string>(['core', ...[...BOUGHT_TOWERS].map((tw) => `tower:${tw}`)]);
    for (const [id, n] of BOUGHT_PREFIX) for (let i = 1; i <= n; i++) bought.add(`${id}#${i}`);
    bought.add('bridge1_4'); // перемычка между Шипучкой и Шприцем: соседняя с купленной Силой Шприца
    const neighbours = new Map<string, Set<string>>();
    for (const [p, q] of edges) {
      (neighbours.get(p) ?? neighbours.set(p, new Set()).get(p)!).add(q);
      (neighbours.get(q) ?? neighbours.set(q, new Set()).get(q)!).add(p);
    }
    // проверка макета: каждый купленный узел связан путём по купленным с ядром или купленной башней
    const reached = new Set<string>(['core', ...[...BOUGHT_TOWERS].map((tw) => `tower:${tw}`)]);
    for (let grow = true; grow; ) {
      grow = false;
      for (const id of bought) {
        if (reached.has(id) || ![...(neighbours.get(id) ?? [])].some((q) => reached.has(q))) continue;
        reached.add(id);
        grow = true;
      }
    }
    const available = (id: string): boolean => !bought.has(id) && nodes.get(id)!.ring <= OPEN_RINGS && [...(neighbours.get(id) ?? [])].some((q) => bought.has(q));

    // фон «Атома»: полосы колец, орбиты, три наклонные орбиты
    for (let k = RINGS; k >= 1; k--) {
      const open = k <= OPEN_RINGS;
      g.fillStyle(open ? 0x14295c : 0x1d2028, 1).fillCircle(0, 0, RIN(k) + 130);
      g.lineStyle(2, open ? 0x3f6fc4 : 0x3a3f4a, 1).strokeCircle(0, 0, RIN(k) + 130);
    }
    g.fillStyle(0x0b1430, 1).fillCircle(0, 0, RIN(1));
    for (const tilt of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * 2 * Math.PI;
        const ex = Math.cos(a) * (RIN(RINGS) + 175);
        const ey = Math.sin(a) * (RIN(RINGS) + 175) * 0.26;
        pts.push(new Phaser.Math.Vector2(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt)));
      }
      g.lineStyle(3, 0x9fd0ff, 0.1).strokePoints(pts, true);
    }

    // связи
    for (const [p, q, kind] of edges) {
      const a = nodeOf(p);
      const b = nodeOf(q);
      const ring = Math.max(a.ring, b.ring);
      const open = ring <= OPEN_RINGS;
      const gold = bought.has(p) && bought.has(q);
      const lit = (bought.has(p) && available(q)) || (bought.has(q) && available(p));
      const color = gold ? COLORS.gold : lit ? COLORS.merge : open ? 0x5a86cc : 0x464c58;
      g.lineStyle(kind === 'chain' ? 3 : 2, color, gold || lit ? 0.95 : open ? 0.75 : 0.55);
      if (kind === 'chain') {
        g.lineBetween(a.x, a.y, b.x, b.y);
        continue;
      }
      // по ходу орбиты: угол и радиус меняются плавно (связь к родителю — короткая дуга, по орбите — дуга по кругу)
      const a1 = Math.atan2(a.y, a.x);
      const r1 = Math.hypot(a.x, a.y);
      const r2 = Math.hypot(b.x, b.y);
      let span = Phaser.Math.Angle.Wrap(Math.atan2(b.y, b.x) - a1);
      if (kind === 'orbit' && span < 0) span += 2 * Math.PI;
      const pts: Phaser.Math.Vector2[] = [];
      const steps = Math.max(6, Math.ceil(Math.abs(span) * 24));
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const r = kind === 'orbit' ? r1 + (r2 - r1) * f + Math.sin(Math.PI * f) * Math.max(0, orbitPath.get(`${p}>${q}`)!.r2 - Math.max(r1, r2)) : r1 + (r2 - r1) * f;
        pts.push(new Phaser.Math.Vector2(Math.cos(a1 + span * f) * r, Math.sin(a1 + span * f) * r));
      }
      g.strokePoints(pts, false);
    }

    // ромбы башен
    for (const [tw, n] of towerNode) {
      const owned = BOUGHT_TOWERS.has(tw);
      g.fillStyle(owned ? COLORS.gold : 0x1b2a4a, 1).fillPoints(this.diamond(n.x, n.y, n.r), true);
      g.lineStyle(3, owned ? COLORS.goldEdge : 0x5a8fd8, 1).strokePoints(this.diamond(n.x, n.y, n.r), true);
      const icon = this.add.container(n.x, n.y).setScale(0.16);
      createTowerArt(this, icon, tw);
    }
    // узлы
    for (const n of nodes.values()) {
      const open = n.ring <= OPEN_RINGS;
      const isBought = bought.has(n.id);
      const canTake = available(n.id);
      g.fillStyle(isBought ? COLORS.gold : canTake ? 0x2f7fd8 : open ? 0x24406e : 0x353a44, 1).fillCircle(n.x, n.y, n.r);
      g.lineStyle(n.isKey ? 4 : 2, isBought ? COLORS.goldEdge : canTake ? COLORS.merge : n.isKey ? (open ? 0xc9b37a : 0x6a6450) : open ? 0x5a8fd8 : 0x555b66, 1).strokeCircle(n.x, n.y, n.r);
      if (n.isNew) g.fillStyle(0xffffff, open ? 0.85 : 0.4).fillCircle(n.x, n.y, 2.2);
      else g.fillStyle(0xffffff, open ? 0.3 : 0.1).fillCircle(n.x - n.r * 0.35, n.y - n.r * 0.35, n.r * 0.3);
    }
    // ядро
    g.fillStyle(COLORS.gold, 1).fillCircle(0, 0, core.r);
    g.lineStyle(5, COLORS.goldEdge, 1).strokeCircle(0, 0, core.r);
    g.lineStyle(10, 0xffe9a8, 0.18).strokeCircle(0, 0, core.r + 12);
    this.add.text(0, 0, t('upgDamage'), { fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#3a2a00', align: 'center', wordWrap: { width: 80 } }).setOrigin(0.5);

    this.placeLabels(chains, nodes, [...towerNode.values()]);

    // итог: число узлов (вместе с узлами башен) и ДНК древа — для заголовка и smoke
    const treeDna = [...nodes.values()].reduce((s, n) => s + n.price, 0) + [...towerNode.values()].reduce((s, n) => s + n.price, 0);
    const ringDna = Array.from({ length: RINGS }, (_, i) => [...nodes.values()].filter((n) => n.ring === i + 1).reduce((s, n) => s + n.price, 0));
    const boughtDna = [...bought].filter((id) => id !== 'core').reduce((s, id) => s + nodeOf(id).price, 0);
    const gameDna = 28741;
    const count = nodes.size + TOWERS.length - 1;
    (window as unknown as { __treeNet: unknown }).__treeNet = {
      nodes: count,
      treeDna,
      ringDna,
      boughtDna,
      boughtConnected: [...bought].every((id) => reached.has(id)),
      available: [...nodes.keys()].filter(available).length,
      newNodes: [...nodes.values()].filter((n) => n.isNew).length,
      bridges: [...nodes.keys()].filter((id) => id.startsWith('bridge')).length,
    };
    const title = this.add.text(10, 8, `МАКЕТ СЕТИ «АТОМ» (п. 4.5): ${count} узлов, ${treeDna.toLocaleString('ru')} ДНК; за 30 уровней ${gameDna.toLocaleString('ru')} (${Math.round((100 * (gameDna - 3650)) / (treeDna - 3650))} % без узлов башен); открыты кольца 1–${OPEN_RINGS}, куплено ${boughtDna} ДНК`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#cfe0ff',
      wordWrap: { width: CONFIG.screen.width - 20 },
    });
    const legend = this.add.graphics();
    const lx = 14;
    const ly = CONFIG.screen.height - 92;
    // плашки под заголовком и легендой: сеть под ними не просвечивает
    legend.fillStyle(0x0b1430, 0.88).fillRect(0, 0, CONFIG.screen.width, title.height + 14);
    legend.fillStyle(0x0b1430, 0.88).fillRoundedRect(4, ly - 26, 370, 116, 8);
    const rows: [number, number, string][] = [
      [COLORS.gold, COLORS.goldEdge, 'куплено'],
      [0x2f7fd8, COLORS.merge, 'можно взять: соседний с купленным'],
      [0x24406e, 0x5a8fd8, 'открыто, путь ещё не подведён'],
      [0x353a44, 0x555b66, 'закрытое кольцо'],
    ];
    const legendTexts = rows.map(([fill, rim, text], i) => {
      legend.fillStyle(fill, 1).fillCircle(lx + 7, ly + 9 + i * 19, 7);
      legend.lineStyle(2, rim, 1).strokeCircle(lx + 7, ly + 9 + i * 19, 7);
      return this.add.text(lx + 20, ly + i * 19, text, { fontFamily: 'Arial', fontSize: '13px', color: '#cfe0ff' });
    });
    legend.fillStyle(0x24406e, 1).fillCircle(lx + 7, ly - 10, 7);
    legend.fillStyle(0xffffff, 0.85).fillCircle(lx + 7, ly - 10, 2.2);
    legendTexts.push(this.add.text(lx + 20, ly - 19, 'точка — новый узел (продолжение ветки, перемычка)', { fontFamily: 'Arial', fontSize: '13px', color: '#cfe0ff' }));
    title.setDepth(1);
    for (const text of legendTexts) text.setDepth(1);
    const uiObjects: Phaser.GameObjects.GameObject[] = [title, legend, ...legendTexts];
    const ui = this.cameras.add(0, 0, CONFIG.screen.width, CONFIG.screen.height);
    ui.ignore(this.children.list.filter((obj) => !uiObjects.includes(obj)));
    this.cameras.main.ignore(uiObjects);
    this.addCameraControls();
  }

  /** Подписи цепочек (имя узла; у продолжения — «+»): снаружи конца цепочки, без наложений на узлы и друг на друга; подпись, которой негде встать, не выводится. */
  private placeLabels(chains: Chain[], nodes: Map<string, NetNode>, towers: NetNode[]): void {
    const boxes: Phaser.Geom.Rectangle[] = [...nodes.values(), ...towers].map((n) => new Phaser.Geom.Rectangle(n.x - n.r - 1, n.y - n.r - 1, n.r * 2 + 2, n.r * 2 + 2));
    boxes.push(new Phaser.Geom.Rectangle(-60, -60, 120, 120));
    const seen = new Set<string>();
    for (const c of chains) {
      const name = c.key.split('@')[0];
      if (seen.has(name)) continue; // одна подпись на узел: у первой его цепочки
      seen.add(name);
      const last = nodes.get(c.nodes[c.nodes.length - 1])!;
      const first = nodes.get(c.nodes[0])!;
      const open = c.ring <= OPEN_RINGS;
      const text = this.add.text(0, 0, c.label, { fontFamily: 'Arial', fontSize: '13px', color: open ? '#e8f0ff' : '#8a92a0', align: 'center', wordWrap: { width: 110 } });
      const w = text.width;
      const h = text.height;
      const out = { x: Math.cos(last.angle), y: Math.sin(last.angle) };
      const side = { x: -out.y, y: out.x };
      const candidates = [
        { x: last.x + out.x * (12 + w / 2) - w / 2, y: last.y + out.y * (12 + h / 2) - h / 2 },
        { x: first.x - out.x * (12 + w / 2) - w / 2, y: first.y - out.y * (12 + h / 2) - h / 2 },
        { x: last.x + side.x * (12 + w / 2) - w / 2, y: last.y + side.y * (12 + h / 2) - h / 2 },
        { x: last.x - side.x * (12 + w / 2) - w / 2, y: last.y - side.y * (12 + h / 2) - h / 2 },
        { x: last.x + out.x * (30 + w / 2) - w / 2, y: last.y + out.y * (30 + h / 2) - h / 2 },
      ];
      const spot = candidates.find((s) => {
        const r = new Phaser.Geom.Rectangle(s.x, s.y, w, h);
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

  /** Камера: ядро в середине экрана; начальный масштаб — ядро и открытые кольца (на компьютере ×0,9 — кольца 1–2 целиком, на телефоне ×0,85 — кольца 1–2 по ширине), `&zoom=` — свой. */
  private addCameraControls(): void {
    const cam = this.cameras.main;
    const phone = window.innerWidth < 1000;
    const zoom = Number(new URLSearchParams(window.location.search).get('zoom')) || (phone ? 0.85 : 0.9);
    const apply = (z: number): void => {
      cam.setZoom(Phaser.Math.Clamp(z, 0.3, 3));
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
