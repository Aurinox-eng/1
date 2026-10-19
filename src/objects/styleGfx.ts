import Phaser from 'phaser';
import { bakeCanvasArt, type ArtBox } from '../art';

/**
 * Перенос стиля этапа 8 на рисунки башен (решение владельца 18 октября 2026): прежние функции рисования башен (Tower.ts) рисуют командами Graphics,
 * здесь те же команды выполняются стандартным Canvas 2D с объёмом и мягкими тенями по правилам docs/art-style.md: один источник света (сверху слева),
 * непрозрачные заливки получают переход цвета (светлее к верхнему левому углу, темнее к нижнему правому), крупные фигуры — мягкую тень вниз.
 * Обводки, цвета и геометрия — прежние (их задаёт вызывающий код): точки вылета снарядов, зоны попадания и размеры не меняются.
 */

const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (c: number, to: number, k: number): number => {
  const [r, g, b] = channels(c);
  const [r2, g2, b2] = channels(to);
  const f = (a: number, z: number): number => Math.round(a + (z - a) * k);
  return (f(r, r2) << 16) | (f(g, g2) << 8) | f(b, b2);
};
const css = (c: number, a = 1): string => {
  const [r, g, b] = channels(c);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

interface Corners {
  tl?: number;
  tr?: number;
  bl?: number;
  br?: number;
}

/** Командный интерфейс части Graphics, которой пользуются рисунки башен (art.ts: sh*, glow*; Tower.ts: drawBase и drawXxx). */
export class StyledGfx {
  private fillColor = 0xffffff;
  private fillAlpha = 1;
  private lineWidth = 1;
  private lineColor = 0x000000;
  private lineAlpha = 1;
  /** Отрезки пути, начатого beginPath (strokePath/fillPath выполняют его одной командой). */
  private pathOpen = false;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    /** Плотность текстуры: размеры теней в Canvas 2D задаются в пикселях текстуры. */
    private readonly density: number,
  ) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  fillStyle(color: number, alpha = 1): this {
    this.fillColor = color;
    this.fillAlpha = alpha;
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lineWidth = width;
    this.lineColor = color;
    this.lineAlpha = alpha;
    return this;
  }

  // ---------------------------------------------------------------- заливки

  /**
   * Заливка текущего пути: непрозрачная — с переходом цвета по ограничивающему прямоугольнику (круг — радиальный, остальное — линейный к нижнему правому углу)
   * и, у крупных фигур, мягкой тенью; полупрозрачная (свечения, блики) — сплошным цветом, как раньше.
   */
  private paint(x: number, y: number, w: number, h: number, round: boolean): void {
    const ctx = this.ctx;
    const c = this.fillColor;
    const small = Math.min(w, h) < 3.5;
    if (this.fillAlpha < 0.98 || small) {
      ctx.fillStyle = css(c, this.fillAlpha);
      ctx.fill();
      return;
    }
    if (Math.min(w, h) >= 9) {
      ctx.save();
      ctx.shadowColor = 'rgba(4,8,22,0.42)';
      ctx.shadowBlur = 3.2 * this.density;
      ctx.shadowOffsetX = 0.7 * this.density;
      ctx.shadowOffsetY = 1.8 * this.density;
      ctx.fillStyle = css(c);
      ctx.fill();
      ctx.restore();
    }
    let grad: CanvasGradient;
    if (round) {
      const r = Math.max(w, h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      grad = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.4, r * 0.06, cx, cy, r * 1.08);
      grad.addColorStop(0, css(mix(c, 0xffffff, 0.4)));
      grad.addColorStop(0.5, css(c));
      grad.addColorStop(1, css(mix(c, 0x000000, 0.34)));
    } else {
      grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, css(mix(c, 0xffffff, 0.3)));
      grad.addColorStop(0.45, css(c));
      grad.addColorStop(1, css(mix(c, 0x000000, 0.3)));
    }
    ctx.fillStyle = grad;
    ctx.fill();
  }

  private stroke(): void {
    if (this.lineWidth <= 0) return;
    const ctx = this.ctx;
    ctx.lineWidth = this.lineWidth;
    ctx.strokeStyle = css(this.lineColor, this.lineAlpha);
    ctx.stroke();
  }

  private rrPath(x: number, y: number, w: number, h: number, r: number | Corners): void {
    const ctx = this.ctx;
    const rr: Required<Corners> =
      typeof r === 'number' ? { tl: r, tr: r, bl: r, br: r } : { tl: r.tl ?? 0, tr: r.tr ?? 0, bl: r.bl ?? 0, br: r.br ?? 0 };
    const cap = Math.min(Math.abs(w), Math.abs(h)) / 2;
    const tl = Math.min(rr.tl, cap);
    const tr = Math.min(rr.tr, cap);
    const bl = Math.min(rr.bl, cap);
    const br = Math.min(rr.br, cap);
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
    else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - br);
    if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + bl, y + h);
    if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
    else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + tl);
    if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
    else ctx.lineTo(x, y);
    ctx.closePath();
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.paint(x, y, w, h, false);
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number): this {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.stroke();
    return this;
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r: number | Corners = 0): this {
    this.rrPath(x, y, w, h, r);
    this.paint(x, y, w, h, false);
    return this;
  }

  strokeRoundedRect(x: number, y: number, w: number, h: number, r: number | Corners = 0): this {
    this.rrPath(x, y, w, h, r);
    this.stroke();
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.paint(x - r, y - r, r * 2, r * 2, true);
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.stroke();
    return this;
  }

  /** Эллипс по центру и полным размерам (как у Graphics). */
  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    this.paint(x - w / 2, y - h / 2, w, h, true);
    return this;
  }

  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    this.stroke();
    return this;
  }

  private polyPath(pts: readonly { x: number; y: number }[], close: boolean): { x: number; y: number; w: number; h: number } {
    const ctx = this.ctx;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    });
    if (close) ctx.closePath();
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  fillPoints(pts: readonly { x: number; y: number }[], close = true): this {
    if (pts.length < 3) return this;
    const b = this.polyPath(pts, close);
    this.paint(b.x, b.y, b.w, b.h, false);
    return this;
  }

  strokePoints(pts: readonly { x: number; y: number }[], close = false): this {
    if (pts.length < 2) return this;
    this.polyPath(pts, close);
    this.stroke();
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    return this.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }], true);
  }

  lineBetween(x0: number, y0: number, x1: number, y1: number): this {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    this.stroke();
    return this;
  }

  // ---------------------------------------------------------------- путь одной командой (дуги)

  beginPath(): this {
    this.ctx.beginPath();
    this.pathOpen = true;
    return this;
  }

  moveTo(x: number, y: number): this {
    this.ctx.moveTo(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.ctx.lineTo(x, y);
    return this;
  }

  closePath(): this {
    this.ctx.closePath();
    return this;
  }

  arc(x: number, y: number, r: number, a0: number, a1: number, anticlockwise = false): this {
    this.ctx.arc(x, y, r, a0, a1, anticlockwise);
    return this;
  }

  strokePath(): this {
    if (this.pathOpen) this.stroke();
    this.pathOpen = false;
    return this;
  }

  fillPath(): this {
    if (this.pathOpen) {
      this.ctx.fillStyle = css(this.fillColor, this.fillAlpha);
      this.ctx.fill();
    }
    this.pathOpen = false;
    return this;
  }
}

/** Графическая картинка башни, нарисованная в новом стиле: прежние команды Graphics выполняет StyledGfx. Рисуется один раз (ключ — на вид, уровень и часть). */
export function bakeStyled(scene: Phaser.Scene, key: string, box: ArtBox, draw: (g: Phaser.GameObjects.Graphics) => void): string {
  return bakeCanvasArt(scene, key, box, (ctx, d) => draw(new StyledGfx(ctx, d) as unknown as Phaser.GameObjects.Graphics));
}
