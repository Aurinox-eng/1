import Phaser from 'phaser';
import { CONFIG } from './config';
import { t, type TextKey } from './i18n';
import { createTowerArt, type TowerId } from './objects/Tower';
import { COLORS } from './theme';

/**
 * Макет радиального древа улучшений (п. 5 сообщения владельца 5 от 25 октября 2026; только режим проверки, `?qa&treemock`; в игровую сборку не попадает, как qaArtSheet.ts).
 * В центре — «Сильное вещество», от него лучами ветки: «Организм», «Защита», «Умения» и десять башен; на луче башни первым стоит узел башни (открывается только ценой),
 * дальше узлы силы по кольцам 1–5. Кольца открываются победами на уровнях (внутреннее — сразу); в макете открыты кольца 1–2 (победа на уровне 2), закрытые — серые.
 * Узлы, цены и числа — прежние (`meta.upgrades`). Мышью и пальцем: перетаскивание и масштаб (колесо, щипок); `&zoom=1.8` — начальный масштаб (снимок телефона).
 */
const RAYS: { id: string; tower?: TowerId; nodes: string[] }[] = [
  { id: 'body', nodes: ['coins', 'reward'] },
  { id: 'defense', nodes: ['lives', 'shield', 'recycle', 'reinforce'] },
  { id: 'skills', nodes: ['autoWave', 'fever'] },
  ...(['pill', 'syrup', 'fizz', 'syringe', 'ampule', 'antibiotic', 'lamp', 'vitamin', 'frost', 'patch'] as TowerId[]).map((tw) => ({
    id: tw,
    tower: tw,
    nodes: ['Power', 'Rate', 'Range', 'Cheap', 'Key'].map((s) => `${tw}${s}`).filter((id) => id in CONFIG.meta.upgrades),
  })),
];
/** Открыто колец в макете (победа на уровне 2). */
const OPEN_RINGS = 2;
/** Куплено в макете: узлы башен первых четырёх и первые уровни колец 1–2. */
const BOUGHT = new Set(['damage', 'coins', 'towerSyrup', 'towerFizz', 'towerSyringe', 'pillPower', 'syrupPower', 'lives']);

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export class TreeMockScene extends Phaser.Scene {
  constructor() {
    super('TreeMock');
  }

  create(): void {
    const W = CONFIG.screen.width;
    const H = CONFIG.screen.height;
    const cx = W / 2;
    const cy = H / 2 + 8;
    /** Эллипс: экран шире, чем выше — по горизонтали кольца растянуты. */
    const EX = 1.62;
    /** Расстояние узла глубины d от центра по вертикали, px: ромбы башен (d = 0) — на 88, кольца 1–5 — через 44; по вертикали сжато ×0,95, чтобы кольцо 5 с подписями поместилось. */
    const radius = (d: number): number => 88 + 44 * d;
    const KY = 0.95;
    const at = (d: number, a: number): { x: number; y: number } => ({ x: cx + Math.cos(a) * radius(d) * EX, y: cy + Math.sin(a) * radius(d) * KY });
    this.cameras.main.setBackgroundColor(COLORS.background);
    const g = this.add.graphics();
    // кольца: открытые — синие, закрытые — серые полосы
    for (let d = 5; d >= 1; d--) {
      const open = d <= OPEN_RINGS;
      const rx = (radius(d) + 22) * EX;
      const ry = (radius(d) + 22) * KY;
      g.fillStyle(open ? 0x1b3566 : 0x252a33, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
      g.lineStyle(2, open ? 0x3a5f9c : 0x3c424d, 1).strokeEllipse(cx, cy, rx * 2, ry * 2);
    }
    g.fillStyle(COLORS.background, 1).fillEllipse(cx, cy, (radius(0) + 22) * EX * 2, (radius(0) + 22) * KY * 2);
    const n = RAYS.length;
    const label = (x: number, y: number, text: string, color: string, size = 12): void => {
      this.add.text(x, y, text, { fontFamily: 'Arial', fontSize: `${size}px`, color, align: 'center', wordWrap: { width: 92 } }).setOrigin(0.5, 0);
    };
    RAYS.forEach((ray, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const tip = at(5, a);
      g.lineStyle(3, 0x4a5c82, 0.9).lineBetween(cx, cy, tip.x, tip.y);
      // узел башни — ромб у центра (только ценой); у Таблетки — стартовая, без цены
      if (ray.tower) {
        const p = at(0, a);
        const nodeId = `tower${cap(ray.tower)}`;
        const owned = ray.tower === 'pill' || BOUGHT.has(nodeId);
        g.fillStyle(owned ? COLORS.gold : 0x1b2a4a, 1).fillPoints(this.diamond(p.x, p.y, 20), true);
        g.lineStyle(3, owned ? COLORS.goldEdge : 0x5a8fd8, 1).strokePoints(this.diamond(p.x, p.y, 20), true);
        const icon = this.add.container(p.x, p.y).setScale(0.24);
        createTowerArt(this, icon, ray.tower);
      }
      ray.nodes.forEach((id, k) => {
        const d = k + 1;
        const p = at(d, a);
        const open = d <= OPEN_RINGS;
        const bought = BOUGHT.has(id);
        const r = 13 + d * 1.2;
        g.fillStyle(bought ? COLORS.gold : open ? 0x2a5c9a : 0x3a3f48, 1).fillCircle(p.x, p.y, r);
        g.lineStyle(3, bought ? COLORS.goldEdge : open ? COLORS.merge : 0x555b66, 1).strokeCircle(p.x, p.y, r);
        label(p.x, p.y + r + 2, t(`upg${cap(id)}` as TextKey), open ? '#e8f0ff' : '#7c8494', 11);
      });
    });
    // центр
    g.fillStyle(COLORS.gold, 1).fillCircle(cx, cy, 40);
    g.lineStyle(4, COLORS.goldEdge, 1).strokeCircle(cx, cy, 40);
    this.add.text(cx, cy, t('upgDamage'), { fontFamily: 'Arial', fontSize: '12px', fontStyle: 'bold', color: '#3a2a00', align: 'center', wordWrap: { width: 70 } }).setOrigin(0.5);
    this.add.text(16, 12, 'МАКЕТ ДРЕВА: центр «Сильное вещество», кольца 1–2 открыты (победа на уровне 2), 3–5 закрыты; ромб — узел башни (только ценой, вне колец)', { fontFamily: 'Arial', fontSize: '15px', color: '#cfe0ff' }).setScrollFactor(0);
    this.addCameraControls(Number(new URLSearchParams(window.location.search).get('zoom')) || 1);
  }

  private diamond(x: number, y: number, s: number): Phaser.Math.Vector2[] {
    return [new Phaser.Math.Vector2(x, y - s), new Phaser.Math.Vector2(x + s, y), new Phaser.Math.Vector2(x, y + s), new Phaser.Math.Vector2(x - s, y)];
  }

  /** Перетаскивание и масштаб: колесо мыши или щипок двумя пальцами (0,8–3). */
  private addCameraControls(zoom: number): void {
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const prev = Phaser.Math.Distance.Between(a.prevPosition.x, a.prevPosition.y, b.prevPosition.x, b.prevPosition.y);
        if (prev > 0) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dist / prev), 0.8, 3));
        return;
      }
      if (p.isDown) cam.setScroll(cam.scrollX - (p.x - p.prevPosition.x) / cam.zoom, cam.scrollY - (p.y - p.prevPosition.y) / cam.zoom);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.8, 3)));
  }
}
