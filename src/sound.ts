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

  /** Попадание, не добившее бактерию: короткий «тик». Тон зависит от типа (бронированная — глухой «клац»). */
  hit(kind: 'coccus' | 'rod' | 'splitter' | 'armored' | 'spore'): void {
    if (kind === 'armored') {
      this.tone({ from: 260, to: 170, ms: 90, type: 'square', gain: 0.5 });
      return;
    }
    const pitch = { coccus: 520, rod: 430, splitter: 480, spore: 720 }[kind];
    this.tone({ from: pitch, to: pitch * 0.6, ms: 70, type: 'triangle', gain: 0.8 });
  }

  /** Бактерия уничтожена: яркий «дзинь». */
  destroy(): void {
    this.tone({ from: 700, to: 1400, ms: 110, type: 'triangle' });
    this.tone({ from: 1400, to: 2100, ms: 90, gain: 0.6, delayMs: 60 });
  }

  /** Деление (делящаяся распалась на два кокка): «поп-поп». */
  split(): void {
    this.tone({ from: 330, to: 130, ms: 130, type: 'triangle' });
    this.tone({ from: 520, to: 220, ms: 90, gain: 0.7, delayMs: 45 });
  }

  /** Делящаяся поделилась сама: мягкое «блоп». */
  selfSplit(): void {
    this.tone({ from: 190, to: 110, ms: 170, gain: 0.6 });
  }

  /** Появился новый тип бактерии: два восходящих тона — «обрати внимание». */
  arrival(): void {
    this.tone({ from: 660, to: 700, ms: 110, gain: 0.7 });
    this.tone({ from: 880, to: 930, ms: 160, gain: 0.7, delayMs: 110 });
  }

  /** Бактерия дошла до линии, потеряна жизнь: низкий удар. */
  lifeLost(): void {
    this.tone({ from: 220, to: 55, ms: 260, type: 'sawtooth', gain: 0.7 });
  }

  /** Проигрыш (жизней не осталось): тон падает вниз. */
  lose(): void {
    this.tone({ from: 330, to: 70, ms: 450, type: 'sawtooth', gain: 0.6, delayMs: 200 });
  }
}

export const sfx = new Sfx();
