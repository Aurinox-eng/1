/**
 * Звуки игры — не файлы, а короткие тоны, которые «рисуются» кодом (WebAudio).
 * Громкость — в config.ts (feedback.soundVolume, 0 = звука нет).
 *
 * Браузеры разрешают звук только после касания или клика, поэтому звуковая система создаётся
 * при первом таком действии игрока. Так в консоли нет предупреждений, а звук работает и на iPhone.
 */
import { CONFIG } from './config';

type ToneOptions = {
  from: number;
  to: number;
  ms: number;
  type?: OscillatorType;
  /** Во сколько раз тише общей громкости. */
  gain?: number;
  /** Через сколько миллисекунд начать. */
  delayMs?: number;
};

class Sfx {
  private ctx: AudioContext | null = null;
  /** Сколько звуков сыграно (для проверок). */
  played = 0;

  constructor() {
    // Именно эти события браузеры считают «действием игрока» (касание начинается, а разрешает звук — его окончание)
    for (const type of ['pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
      window.addEventListener(type, () => this.unlock(), { capture: true, passive: true });
    }
  }

  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  private unlock(): void {
    if (CONFIG.feedback.soundVolume <= 0) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* звук не критичен: если браузер не дал, играем без него */
    }
  }

  private tone({ from, to, ms, type = 'sine', gain = 1, delayMs = 0 }: ToneOptions): void {
    const ctx = this.ctx;
    const volume = CONFIG.feedback.soundVolume * gain;
    if (!ctx || ctx.state !== 'running' || volume <= 0) return;

    const start = ctx.currentTime + delayMs / 1000;
    const end = start + ms / 1000;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), end);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    this.played++;
  }

  /** Попадание, после которого бактерия делится: «поп-поп», выше тон — мельче бактерия. */
  split(size: 'large' | 'medium'): void {
    const base = size === 'large' ? 170 : 260;
    this.tone({ from: base * 1.6, to: base * 0.6, ms: 130, type: 'triangle' });
    this.tone({ from: base * 2.4, to: base, ms: 90, gain: 0.7, delayMs: 45 });
  }

  /** Малая бактерия уничтожена: яркий «дзинь». */
  kill(): void {
    this.tone({ from: 700, to: 1400, ms: 110, type: 'triangle' });
    this.tone({ from: 1400, to: 2100, ms: 90, gain: 0.6, delayMs: 60 });
  }

  /** Бактерия поделилась сама: мягкое «блоп». */
  selfSplit(): void {
    this.tone({ from: 190, to: 110, ms: 170, gain: 0.6 });
  }

  /** Проигрыш: тон падает вниз. */
  lose(): void {
    this.tone({ from: 330, to: 70, ms: 450, type: 'sawtooth', gain: 0.6 });
  }
}

export const sfx = new Sfx();
