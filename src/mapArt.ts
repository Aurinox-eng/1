import Phaser from 'phaser';
import { CONFIG } from './config';
import { t } from './i18n';
import { getLang } from './lang';
import { BLOCKED_TILES, EDGES, LEVEL, PATH_TILES, WORLD, cellKey } from './level';
import { FONT, MAP_COLORS } from './theme';

/** Во сколько раз текстура плотнее мира: при самом сильном приближении карта остаётся чёткой. */
const DENSITY = CONFIG.camera.zoomMax;
/** Стрелки направления не рисуются ближе этого расстояния к концам ребра: на развилках и слияниях они слипались бы в «скобку», пикселей. */
const ARROW_PAD = 120;
/** Соседние куски карты чуть перекрываются, чтобы между ними не мелькали тонкие щели. */
const OVERLAP = 2;

/** Прямоугольник со скруглёнными углами (свой, без ctx.roundRect — он есть не во всех браузерах). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Рисует всю карту обычным canvas; ctx уже сдвинут и увеличен так, что рисуем в координатах мира. */
function paintMap(ctx: CanvasRenderingContext2D): void {
  const { orgW, tile, pathWidth } = CONFIG.map;
  const { cols, rows } = LEVEL;
  const path = (pts: { x: number; y: number }[]): void => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };

  // Фон: тёмно-синий с мягким светлым пятном в середине и россыпью «клеточек» (одинаковая для всех кусков: зерно фиксировано)
  const bg = ctx.createRadialGradient(WORLD.w * 0.55, WORLD.h * 0.5, 80, WORLD.w * 0.55, WORLD.h * 0.5, WORLD.w * 0.75);
  bg.addColorStop(0, '#1a2d52');
  bg.addColorStop(1, '#0e1a33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  let seed = 12345;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(120,170,255,${0.02 + rnd() * 0.035})`;
    ctx.beginPath();
    ctx.arc(orgW + rnd() * (WORLD.w - orgW), rnd() * WORLD.h, 4 + rnd() * 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Клетки: свободные (ткань с объёмом и «+») и закрытые (тёмные, со штриховкой: башня там ничего бы не достала)
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const key = cellKey(c, r);
      if (PATH_TILES.has(key)) continue;
      const x = orgW + c * tile + 3;
      const y = r * tile + 3;
      const size = tile - 6;
      if (BLOCKED_TILES.has(key)) {
        roundRectPath(ctx, x, y, size, size, 12);
        ctx.fillStyle = '#0d1830';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(70,105,165,0.22)';
        ctx.lineWidth = 3;
        for (let k = -size; k < size * 2; k += 16) {
          ctx.beginPath();
          ctx.moveTo(x + k, y);
          ctx.lineTo(x + k - size, y + size);
          ctx.stroke();
        }
        ctx.restore();
        roundRectPath(ctx, x, y, size, size, 12);
        ctx.strokeStyle = 'rgba(40,70,125,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        continue;
      }
      roundRectPath(ctx, x, y, size, size, 12);
      const g = ctx.createLinearGradient(0, y, 0, y + size);
      g.addColorStop(0, '#2a4c85');
      g.addColorStop(1, '#1d3a6a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = MAP_COLORS.tissueLine;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // светлая кромка сверху и «+» в центре
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 2.5);
      ctx.lineTo(x + size - 12, y + 2.5);
      ctx.strokeStyle = 'rgba(190,220,255,0.16)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = `28px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('+', x + size / 2, y + size / 2 + 10);
    }
  }

  // Дорожки: сначала контуры со свечением, потом их внутренность — на стыках и слияниях не остаётся швов
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.shadowColor = 'rgba(110,170,255,0.35)';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = MAP_COLORS.laneOuter;
  ctx.lineWidth = pathWidth + 12;
  for (const edge of EDGES) {
    path(edge.pts);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = MAP_COLORS.lane;
  ctx.lineWidth = pathWidth;
  for (const edge of EDGES) {
    path(edge.pts);
    ctx.stroke();
  }
  // мягкий светлый «ручей» по центру дорожки и пунктир
  ctx.strokeStyle = 'rgba(80,130,210,0.10)';
  ctx.lineWidth = pathWidth * 0.5;
  for (const edge of EDGES) {
    path(edge.pts);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  for (const edge of EDGES) {
    path(edge.pts);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Стрелки: куда идут бактерии (через каждые ~66 px вдоль ребра, по касательной)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 4;
  for (const edge of EDGES) {
    let walked = 0;
    let next = ARROW_PAD;
    for (let i = 1; i < edge.pts.length; i++) {
      const a = edge.pts[i - 1];
      const b = edge.pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (walked + seg >= next && next <= edge.length - ARROW_PAD) {
        const u = (next - walked) / seg;
        ctx.save();
        ctx.translate(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        ctx.beginPath();
        ctx.moveTo(-5, -11);
        ctx.lineTo(6, 0);
        ctx.lineTo(-5, 11);
        ctx.stroke();
        ctx.restore();
        next += 66;
      }
      walked += seg;
    }
  }

  // Организм: тёмно-красная зона слева с «сосудами» и красная линия на её краю
  const grad = ctx.createLinearGradient(0, 0, orgW, 0);
  grad.addColorStop(0, MAP_COLORS.organismFrom);
  grad.addColorStop(1, MAP_COLORS.organismTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, orgW, WORLD.h);
  ctx.strokeStyle = 'rgba(255,120,140,0.14)';
  ctx.lineWidth = 5;
  for (let k = 0; k < 7; k++) {
    ctx.beginPath();
    for (let y = 0; y <= WORLD.h; y += 20) {
      const x = 22 + (k % 3) * 38 + Math.sin(y / 70 + k * 1.7) * 14;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = MAP_COLORS.loseLine;
  ctx.shadowBlur = 18 * DENSITY;
  ctx.fillStyle = MAP_COLORS.loseLine;
  ctx.fillRect(orgW - 3, 0, 6, WORLD.h);
  ctx.restore();
  ctx.fillStyle = MAP_COLORS.loseLine;
  ctx.fillRect(orgW - 3, 0, 6, WORLD.h);
  ctx.save();
  ctx.translate(orgW / 2 - 4, WORLD.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = MAP_COLORS.organismText;
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(t('organism').toUpperCase(), 0, 0);
  ctx.restore();

  // Лёгкая виньетка по краям карты: взгляд идёт к середине
  const vg = ctx.createRadialGradient(WORLD.w * 0.55, WORLD.h * 0.5, WORLD.h * 0.45, WORLD.w * 0.55, WORLD.h * 0.5, WORLD.w * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,8,20,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(orgW, 0, WORLD.w - orgW, WORLD.h);
}

/**
 * Рисует карту один раз (в четыре куска — так текстуры не превышают 2048 px, это безопасно для старых телефонов)
 * и добавляет её в контейнер мира. При перезапуске уровня готовые текстуры используются повторно.
 */
export function addMap(scene: Phaser.Scene, parent: Phaser.GameObjects.Container): void {
  const halfW = Math.ceil(WORLD.w / 2);
  const halfH = Math.ceil(WORLD.h / 2);
  for (let qx = 0; qx < 2; qx++) {
    for (let qy = 0; qy < 2; qy++) {
      const x0 = qx * halfW;
      const y0 = qy * halfH;
      const w = Math.min(halfW + OVERLAP, WORLD.w - x0);
      const h = Math.min(halfH + OVERLAP, WORLD.h - y0);
      const key = `map-${getLang()}-${qx}${qy}`;
      if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, Math.ceil(w * DENSITY), Math.ceil(h * DENSITY));
        if (!texture) continue;
        const ctx = texture.getContext();
        ctx.setTransform(DENSITY, 0, 0, DENSITY, -x0 * DENSITY, -y0 * DENSITY);
        paintMap(ctx);
        texture.refresh();
      }
      parent.add(scene.add.image(x0, y0, key).setOrigin(0, 0).setScale(1 / DENSITY));
    }
  }
}
