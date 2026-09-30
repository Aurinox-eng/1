import Phaser from 'phaser';
import { CONFIG } from './config';
import { t } from './i18n';
import { getLang } from './lang';
import { LEVEL, PATH_TILES, ROUTES, WORLD, cellKey } from './level';
import { tileCenter } from './pathing';
import { FONT, MAP_COLORS } from './theme';

/** Во сколько раз текстура плотнее мира: при самом сильном приближении карта остаётся чёткой. */
const DENSITY = CONFIG.camera.zoomMax;
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

/** Стрелки направления вдоль прямых участков дорожки: одинаковые участки разных маршрутов рисуем один раз. */
function chevronSegments(): { x0: number; y0: number; x1: number; y1: number; startPad: number; endPad: number }[] {
  const { tile } = CONFIG.map;
  const cornerPad = LEVEL.curve * tile + 8;
  const seen = new Set<string>();
  const out: { x0: number; y0: number; x1: number; y1: number; startPad: number; endPad: number }[] = [];
  for (const route of LEVEL.routes) {
    for (let i = 0; i < route.length - 1; i++) {
      const [a, b] = [route[i], route[i + 1]];
      const key = `${a}>${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p0 = tileCenter(a[0], a[1]);
      const p1 = tileCenter(b[0], b[1]);
      out.push({
        x0: p0.x,
        y0: p0.y,
        x1: p1.x,
        y1: p1.y,
        startPad: a[0] > LEVEL.cols ? 40 : cornerPad,
        endPad: b[0] < 0 ? 40 : cornerPad,
      });
    }
  }
  return out;
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

  ctx.fillStyle = MAP_COLORS.background;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // Клетки для башен — все, кроме дорожки
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = MAP_COLORS.tissue;
  ctx.strokeStyle = MAP_COLORS.tissueLine;
  ctx.lineWidth = 1.5;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (PATH_TILES.has(cellKey(c, r))) continue;
      roundRectPath(ctx, orgW + c * tile + 3, r * tile + 3, tile - 6, tile - 6, 10);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Дорожки: сначала контуры всех маршрутов, потом их внутренность — общие участки сливаются без швов
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP_COLORS.laneOuter;
  ctx.lineWidth = pathWidth + 12;
  for (const route of ROUTES) {
    path(route.pts);
    ctx.stroke();
  }
  ctx.strokeStyle = MAP_COLORS.lane;
  ctx.lineWidth = pathWidth;
  for (const route of ROUTES) {
    path(route.pts);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  for (const route of ROUTES) {
    path(route.pts);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Стрелки: куда идут бактерии
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 4;
  for (const seg of chevronSegments()) {
    const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
    const angle = Math.atan2(seg.y1 - seg.y0, seg.x1 - seg.x0);
    for (let s = seg.startPad; s <= len - seg.endPad; s += 66) {
      ctx.save();
      ctx.translate(seg.x0 + ((seg.x1 - seg.x0) * s) / len, seg.y0 + ((seg.y1 - seg.y0) * s) / len);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-5, -11);
      ctx.lineTo(6, 0);
      ctx.lineTo(-5, 11);
      ctx.stroke();
      ctx.restore();
    }
  }

  // «+» в свободных клетках: здесь можно ставить башню
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = `30px ${FONT}`;
  ctx.textAlign = 'center';
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (PATH_TILES.has(cellKey(c, r))) continue;
      const p = tileCenter(c, r);
      ctx.fillText('+', p.x, p.y + 10);
    }
  }

  // Организм: тёмно-красная зона слева и красная линия на её краю
  const grad = ctx.createLinearGradient(0, 0, orgW, 0);
  grad.addColorStop(0, MAP_COLORS.organismFrom);
  grad.addColorStop(1, MAP_COLORS.organismTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, orgW, WORLD.h);
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
