import type Phaser from 'phaser';

/**
 * «Камера» карты: сдвиг и приближение. Устроена просто — двигается и масштабируется контейнер с миром;
 * панель справа лежит поверх и никуда не двигается. Центр экрана карты (cx, cy) задаётся в пикселях мира.
 */
export class CameraRig {
  zoom = 1;
  cx = 0;
  cy = 0;

  /**
   * @param view окно, через которое видна карта (экран без правой панели), пикселей экрана
   * @param world размер мира, пикселей
   */
  constructor(
    private readonly target: Phaser.GameObjects.Container,
    private readonly view: { w: number; h: number },
    private readonly world: { w: number; h: number },
    private readonly limits: { min: number; max: number },
  ) {}

  set(zoom: number, cx: number, cy: number): void {
    this.zoom = Math.max(this.limits.min, Math.min(this.limits.max, zoom));
    this.cx = cx;
    this.cy = cy;
    this.clampCenter();
    this.apply();
  }

  /** Точка мира под точкой экрана. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.cx + (sx - this.view.w / 2) / this.zoom, y: this.cy + (sy - this.view.h / 2) / this.zoom };
  }

  /** Где на экране сейчас находится точка мира. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: this.view.w / 2 + (wx - this.cx) * this.zoom, y: this.view.h / 2 + (wy - this.cy) * this.zoom };
  }

  /** Сдвиг карты за пальцем: dsx, dsy — на сколько сместился палец на экране. */
  panBy(dsx: number, dsy: number): void {
    this.cx -= dsx / this.zoom;
    this.cy -= dsy / this.zoom;
    this.clampCenter();
    this.apply();
  }

  /** Приближение в factor раз так, чтобы точка мира под (sx, sy) осталась на месте. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const anchor = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.limits.min, Math.min(this.limits.max, this.zoom * factor));
    this.cx = anchor.x - (sx - this.view.w / 2) / this.zoom;
    this.cy = anchor.y - (sy - this.view.h / 2) / this.zoom;
    this.clampCenter();
    this.apply();
  }

  /** Карта не уезжает за край: экран всегда внутри мира (а если мир меньше экрана — по центру). */
  private clampCenter(): void {
    const hx = this.view.w / 2 / this.zoom;
    const hy = this.view.h / 2 / this.zoom;
    this.cx = hx * 2 >= this.world.w ? this.world.w / 2 : Math.max(hx, Math.min(this.world.w - hx, this.cx));
    this.cy = hy * 2 >= this.world.h ? this.world.h / 2 : Math.max(hy, Math.min(this.world.h - hy, this.cy));
  }

  private apply(): void {
    this.target.setScale(this.zoom);
    this.target.setPosition(this.view.w / 2 - this.cx * this.zoom, this.view.h / 2 - this.cy * this.zoom);
  }
}
