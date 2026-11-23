/**
 * Перечень надписей на экране для проверки размера шрифта (этап 8, п. 1; только режим проверки `?qa`): `window.__pvbTexts()` — все видимые надписи всех показанных сцен
 * с размером шрифта, масштабом (свой масштаб надписи × масштабы контейнеров × приближение камеры) и действующим размером в пикселях экрана игры 1280×720.
 * Действующий размер не должен быть меньше `MIN_FONT` (21 px игры ≈ 11 pt на телефоне 844×390, где экран игры уменьшен в 390 / 720 = 0,54 раза).
 */
import Phaser from 'phaser';
import { QA_MODE } from './debug';

export interface QaTextInfo {
  /** Ключ сцены и сама надпись. */
  scene: string;
  text: string;
  /** Размер шрифта, пикселей, и общий масштаб надписи на экране игры. */
  size: number;
  scale: number;
  /** Действующий размер: size × scale, пикселей экрана игры. */
  effective: number;
  /** Прямоугольник надписи на экране игры (левый верхний угол и размер). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Надпись лежит в мире карты (масштабируется вместе с камерой карты). */
  world: boolean;
}

declare global {
  interface Window {
    __pvbTexts?: () => QaTextInfo[];
  }
}

/** Видна ли надпись: она сама и все контейнеры над ней видимы и не прозрачны. */
function shown(obj: Phaser.GameObjects.GameObject): boolean {
  let node: Phaser.GameObjects.GameObject | null = obj;
  while (node) {
    const v = node as unknown as { visible?: boolean; alpha?: number };
    if (v.visible === false || (v.alpha !== undefined && v.alpha <= 0.01)) return false;
    node = node.parentContainer;
  }
  return true;
}

function collect(game: Phaser.Game): QaTextInfo[] {
  const out: QaTextInfo[] = [];
  for (const scene of game.scene.getScenes(false)) {
    const sys = scene.sys;
    if (!sys.settings.visible || (!sys.isActive() && !sys.isPaused())) continue;
    const zoom = scene.cameras?.main?.zoom ?? 1;
    type Clip = { x: number; y: number; w: number; h: number };
    const walk = (list: Phaser.GameObjects.GameObject[], world: boolean, clip: Clip): void => {
      for (const obj of list) {
        if (obj instanceof Phaser.GameObjects.Container) {
          // контейнер мира карты (его двигает и масштабирует камера карты; имя «world» — в GameScene); `clip` — окно маски контейнера (сеть «Улучшений»)
          walk(obj.list, world || obj.name === 'world', (obj.getData('clip') as Clip | undefined) ?? clip);
          continue;
        }
        if (!(obj instanceof Phaser.GameObjects.Text) || !obj.text.trim() || !shown(obj)) continue;
        const m = obj.getWorldTransformMatrix();
        const scale = Math.min(Math.abs(m.scaleX), Math.abs(m.scaleY)) * zoom;
        const raw = obj.style.fontSize;
        const size = typeof raw === 'number' ? raw : parseFloat(raw);
        const b = obj.getBounds();
        // надписи за краем экрана игры или окна маски (например, карточки башен, уехавшие за край списка) не видны
        if (b.right < clip.x || b.x > clip.x + clip.w || b.bottom < clip.y || b.y > clip.y + clip.h) continue;
        out.push({ scene: sys.settings.key, text: obj.text, size, scale, effective: size * scale, x: b.x, y: b.y, w: b.width, h: b.height, world });
      }
    };
    walk(sys.displayList.list, false, { x: 0, y: 0, w: 1280, h: 720 });
  }
  return out;
}

/** Подключает `window.__pvbTexts` (только в режиме проверки). */
export function installFontAudit(game: Phaser.Game): void {
  if (QA_MODE) window.__pvbTexts = () => collect(game);
}
