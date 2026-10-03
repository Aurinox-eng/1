import Phaser from 'phaser';
import { t } from './i18n';
import { FONT, TEXT_COLORS } from './theme';

/**
 * Счётчик кадров (`?fps` в адресе; работает и в игровой сборке: он только показывает число и ничего в игре не меняет)
 * и замер для проверок (`qa/perf.mjs`).
 *  • кадров в секунду — сколько кадров нарисовано за последние полсекунды; «мин» — самый медленный кадр за это время, пересчитанный в кадры в секунду;
 *  • работа кадра — сколько миллисекунд игра считала и рисовала один кадр (без ожидания следующего кадра экрана).
 */
export const FPS_ENABLED: boolean = new URLSearchParams(window.location.search).has('fps');

/** Сколько последних кадров хранится для замера (≈ 1 минута при 60 кадрах в секунду). */
const MAX_SAMPLES = 4000;
/** Как часто обновляется число на экране, мс. */
const SHOW_EVERY_MS = 500;

/** Промежутки между кадрами и работа кадра, мс (общие для всей страницы: сцена при перезапуске создаётся заново, а замер идёт дальше). */
const intervals: number[] = [];
const works: number[] = [];
/** Из работы кадра: расчёт (движение, стрельба, эффекты) и рисование, мс. */
const updates: number[] = [];
const renders: number[] = [];
let installed = false;
let lastTime = 0;
let stepStart = 0;
let renderStart = 0;

/** Подключает замер к игре (один раз на страницу). */
export function installFrameStats(game: Phaser.Game): void {
  if (installed) return;
  installed = true;
  game.events.on(Phaser.Core.Events.PRE_STEP, (time: number) => {
    stepStart = performance.now();
    if (lastTime > 0) push(intervals, time - lastTime);
    lastTime = time;
  });
  game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
    renderStart = performance.now();
    if (stepStart > 0) push(updates, renderStart - stepStart);
  });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const now = performance.now();
    if (stepStart > 0) push(works, now - stepStart);
    if (renderStart > 0) push(renders, now - renderStart);
  });
}

function push(list: number[], value: number): void {
  list.push(value);
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
}

/** Значение, ниже которого лежит доля share всех значений (0.95 — 95-й процентиль). */
function percentile(list: number[], share: number): number {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PerfReport {
  /** Сколько кадров в замере и сколько секунд он шёл. */
  frames: number;
  seconds: number;
  /** Кадров в секунду в среднем; «1 % худших» — кадры в секунду по 99-му процентилю промежутка между кадрами. */
  fps: number;
  fpsLow1: number;
  /** Промежуток между кадрами: средний, 95-й и 99-й процентили, мс. */
  frameMs: number;
  frameP95: number;
  frameP99: number;
  /** Работа кадра (расчёт + рисование): средняя и 95-й процентиль, мс. */
  workMs: number;
  workP95: number;
  /** Из работы кадра: расчёт и рисование в среднем, мс. */
  updateMs: number;
  renderMs: number;
}

/** Итог замера с последнего сброса; reset — начать замер заново. */
export function frameReport(reset = false): PerfReport {
  const sum = intervals.reduce((a, b) => a + b, 0);
  const workSum = works.reduce((a, b) => a + b, 0);
  const report: PerfReport = {
    frames: intervals.length,
    seconds: round1(sum / 1000),
    fps: intervals.length ? round1((intervals.length * 1000) / sum) : 0,
    fpsLow1: intervals.length ? round1(1000 / percentile(intervals, 0.99)) : 0,
    frameMs: intervals.length ? round1(sum / intervals.length) : 0,
    frameP95: round1(percentile(intervals, 0.95)),
    frameP99: round1(percentile(intervals, 0.99)),
    workMs: works.length ? round1(workSum / works.length) : 0,
    workP95: round1(percentile(works, 0.95)),
    updateMs: updates.length ? round1(updates.reduce((a, b) => a + b, 0) / updates.length) : 0,
    renderMs: renders.length ? round1(renders.reduce((a, b) => a + b, 0) / renders.length) : 0,
  };
  if (reset) {
    intervals.length = 0;
    works.length = 0;
    updates.length = 0;
    renders.length = 0;
  }
  return report;
}

/** Число на экране: левый верхний угол поля, поверх всего. Обновляется дважды в секунду. */
export class FpsMeter {
  private readonly label: Phaser.GameObjects.Text;
  private shownAt = 0;
  private frames = 0;
  private worst = 0;
  private last = 0;

  constructor(scene: Phaser.Scene) {
    this.label = scene.add
      .text(8, 6, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: TEXT_COLORS.accent, stroke: TEXT_COLORS.stroke, strokeThickness: 4 })
      .setDepth(1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  private tick(): void {
    const now = performance.now();
    if (this.last > 0) {
      this.frames++;
      this.worst = Math.max(this.worst, now - this.last);
    }
    this.last = now;
    if (this.shownAt === 0) this.shownAt = now;
    const span = now - this.shownAt;
    if (span < SHOW_EVERY_MS || this.frames === 0) return;
    const fps = Math.round((this.frames * 1000) / span);
    const low = Math.round(1000 / Math.max(1, this.worst));
    this.label.setText(t('fpsMeter', { fps, low: Math.min(fps, low) }));
    this.shownAt = now;
    this.frames = 0;
    this.worst = 0;
  }
}
