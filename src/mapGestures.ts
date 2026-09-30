import Phaser from 'phaser';
import { CONFIG } from './config';
import type { CameraRig } from './cameraRig';

interface Finger {
  /** Где палец опустился. */
  startX: number;
  startY: number;
  /** Где был в прошлый раз. */
  x: number;
  y: number;
  downAt: number;
  /** Сдвинулся ли дальше, чем допускает тап (тогда это сдвиг карты, а не тап). */
  moved: boolean;
}

export interface GestureHandlers {
  /** Можно ли сейчас двигать карту и тапать по ней (нет паузы, конца уровня). */
  isActive: () => boolean;
  /** Короткое касание без сдвига; координаты — на экране игры. */
  onTap: (sx: number, sy: number) => void;
  /** Мышь движется над картой (для «призрака» башни). */
  onHover: (sx: number, sy: number) => void;
  /** Мышь ушла с игры или началось другое действие — «призрак» убрать. */
  onHoverEnd: () => void;
}

/**
 * Управление картой: один палец (или мышь) — сдвиг, два пальца — приближение и сдвиг, колесо мыши — приближение,
 * короткое касание без сдвига — тап. Касания правой панели сюда не попадают (её кнопки обрабатывает сама панель).
 */
export class MapGestures {
  private readonly fingers = new Map<number, Finger>();
  /** Хоть раз было два пальца сразу: тогда касания этого жеста тапами не считаются. */
  private multi = false;
  private prevMid = { x: 0, y: 0 };
  private prevDist = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly rig: CameraRig,
    private readonly viewW: number,
    private readonly handlers: GestureHandlers,
  ) {
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUpOutside, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('gameout', this.onOut, this);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.handlers.isActive() || pointer.x >= this.viewW) return;
    if (!pointer.wasTouch && pointer.button !== 0) return; // только левая кнопка мыши или касание
    this.handlers.onHoverEnd();
    this.fingers.set(pointer.id, { startX: pointer.x, startY: pointer.y, x: pointer.x, y: pointer.y, downAt: performance.now(), moved: false });
    if (this.fingers.size >= 2) {
      this.multi = true;
      for (const finger of this.fingers.values()) finger.moved = true;
      this.startPinch();
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const finger = this.fingers.get(pointer.id);
    if (!finger) {
      if (!pointer.wasTouch && this.fingers.size === 0 && this.handlers.isActive()) {
        if (pointer.x < this.viewW) this.handlers.onHover(pointer.x, pointer.y);
        else this.handlers.onHoverEnd();
      }
      return;
    }
    if (!this.handlers.isActive()) return;

    if (this.fingers.size >= 2) {
      finger.x = pointer.x;
      finger.y = pointer.y;
      const [a, b] = [...this.fingers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.rig.panBy(mid.x - this.prevMid.x, mid.y - this.prevMid.y);
      if (this.prevDist > 8 && dist > 8) this.rig.zoomAt(dist / this.prevDist, mid.x, mid.y);
      this.prevMid = mid;
      this.prevDist = dist;
      return;
    }

    if (!finger.moved && Math.hypot(pointer.x - finger.startX, pointer.y - finger.startY) > CONFIG.camera.tapMaxMovePx) {
      // Это уже сдвиг, а не тап: карта сразу догоняет палец на всё пройденное с момента касания
      finger.moved = true;
      finger.x = finger.startX;
      finger.y = finger.startY;
    }
    if (finger.moved) this.rig.panBy(pointer.x - finger.x, pointer.y - finger.y);
    finger.x = pointer.x;
    finger.y = pointer.y;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    const finger = this.fingers.get(pointer.id);
    if (!finger) return;
    this.fingers.delete(pointer.id);
    // Не тап: касание отменила система (жест ОС, звонок) или палец ушёл на правую панель (там кнопки, карта под ней не нужна)
    const isTap =
      !finger.moved &&
      !this.multi &&
      !pointer.wasCanceled &&
      pointer.x < this.viewW &&
      performance.now() - finger.downAt <= CONFIG.camera.tapMaxMs;
    if (this.fingers.size === 0) this.multi = false;
    else if (this.fingers.size === 1) {
      // Один палец остался после щипка: дальше он просто двигает карту
      const rest = [...this.fingers.values()][0];
      rest.moved = true;
    }
    if (isTap && this.handlers.isActive()) this.handlers.onTap(pointer.x, pointer.y);
  }

  /** Палец или мышь отпущены за пределами игры: жест просто заканчивается, тапа нет. */
  private onUpOutside(pointer: Phaser.Input.Pointer): void {
    this.fingers.delete(pointer.id);
    if (this.fingers.size === 0) this.multi = false;
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!this.handlers.isActive() || pointer.x >= this.viewW) return;
    // Chrome шлёт пиксели (один щелчок ≈ 100). Firefox и некоторые мыши — строки (≈ 3 за щелчок) или страницы: приводим к пикселям.
    // Phaser отдаёт в событии только числа, само событие колеса лежит в pointer.event.
    const mode = (pointer.event as WheelEvent | undefined)?.deltaMode;
    const unit = mode === 1 ? 33 : mode === 2 ? 300 : 1;
    this.rig.zoomAt(Math.exp(-dy * unit * CONFIG.camera.wheelSpeed), pointer.x, pointer.y);
  }

  private onOut(): void {
    this.handlers.onHoverEnd();
  }

  private startPinch(): void {
    const [a, b] = [...this.fingers.values()];
    this.prevMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.prevDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
}
