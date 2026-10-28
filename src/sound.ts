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

const MUTE_KEY = 'pvb.sound';

/** Звук выключен игроком (кнопка «Звук» на паузе и в меню): хранится отдельным ключом, не в сохранении прогресса. */
function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '0';
  } catch {
    return false;
  }
}

class Sfx {
  private ctx: AudioContext | null = null;
  /** Общий усилитель и компрессор перед выходом: десятки одновременных тонов поздних волн не складываются в треск. */
  private master: AudioNode | null = null;
  /** Общая громкость перед компрессором: при выключении звука плавно 0 — и уже запланированные тоны замолкают (находка аудита MASTER-0097). */
  private out: GainNode | null = null;
  /** Тоны, запрошенные до разрешения звука (первое касание на iPhone): играются сразу после него, если не старше 300 мс (находка аудита MASTER-0099). */
  private pending: { at: number; opts: ToneOptions }[] = [];
  /** Сколько звуков сыграно (для проверок). */
  played = 0;
  /** Выключен ли звук игроком. */
  muted = loadMuted();
  /** Остановлен ли звук площадкой (`game_api_pause`, требование 1.3): `AudioContext` приостановлен, браузерные события ввода его не возобновляют. */
  private suspended = false;
  /** Когда (время аудио, секунды) последний раз играл звук каждого вида частых звуков. */
  private lastAt = new Map<string, number>();
  /** Когда (время аудио, секунды) заканчиваются тоны, которые звучат сейчас. */
  private ends: number[] = [];

  constructor() {
    // Именно эти события браузеры считают «действием игрока» (касание начинается, а разрешает звук — его окончание)
    for (const type of ['pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
      window.addEventListener(type, () => this.unlock(), { capture: true, passive: true });
    }
  }

  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** Включить или выключить звук (запоминается между запусками). */
  setMuted(on: boolean): void {
    this.muted = on;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.01);
    try {
      window.localStorage.setItem(MUTE_KEY, on ? '0' : '1');
    } catch {
      /* не страшно: просто не запомнится */
    }
  }

  /**
   * Пропуск частого звука: не чаще одного звука одного вида за `feedback.soundMinGapMs` и не больше `feedback.soundMaxVoices` тонов одновременно
   * (выстрелов, попаданий и гибелей на поздних волнах — сотни в секунду). Редкие звуки (постановка, слияние, волна, победа) через пропуск не идут.
   */
  private gate(key: string, voices = 1): boolean {
    const ctx = this.ctx;
    if (this.muted || !ctx || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    const last = this.lastAt.get(key);
    if (last !== undefined && now - last < CONFIG.feedback.soundMinGapMs / 1000) return false;
    this.ends = this.ends.filter((end) => end > now);
    // `voices` — сколько тонов у звука (двухтоновые занимают два голоса; находка аудита MASTER-0100)
    if (this.ends.length + voices > CONFIG.feedback.soundMaxVoices) return false;
    this.lastAt.set(key, now);
    return true;
  }

  /** Остановить или вернуть звук по событиям площадки `game_api_pause` и `game_api_resume`. */
  setSuspended(on: boolean): void {
    this.suspended = on;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (on) void ctx.suspend();
      else void ctx.resume();
    } catch {
      /* звук не критичен */
    }
  }

  private unlock(): void {
    if (CONFIG.feedback.soundVolume <= 0 || this.suspended) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.connect(this.ctx.destination);
        this.out = this.ctx.createGain();
        this.out.gain.value = this.muted ? 0 : 1;
        this.out.connect(compressor);
        this.master = this.out;
      }
      const flush = (): void => {
        const now = performance.now();
        const queued = this.pending.filter((p) => now - p.at <= 300);
        this.pending = [];
        for (const p of queued) this.tone(p.opts);
      };
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(flush, () => undefined);
      else flush();
    } catch {
      /* звук не критичен: если браузер не дал, играем без него */
    }
  }

  private tone({ from, to, ms, type = 'sine', gain = 1, delayMs = 0 }: ToneOptions): void {
    const ctx = this.ctx;
    const volume = CONFIG.feedback.soundVolume * gain;
    if (!this.muted && volume > 0 && !this.suspended && (!ctx || ctx.state !== 'running')) {
      if (this.pending.length < 4) this.pending.push({ at: performance.now(), opts: { from, to, ms, type, gain, delayMs } });
      return;
    }
    if (this.muted || !ctx || ctx.state !== 'running' || volume <= 0) return;

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
    osc.connect(amp).connect(this.master ?? ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    // отметки прошедших тонов чистятся и между пропусками (находка аудита MASTER-0077)
    if (this.ends.length >= 32) this.ends = this.ends.filter((e) => e > ctx.currentTime);
    this.ends.push(end + 0.02);
    this.played++;
  }

  /** Выстрел башни: короткий тихий «пуф» (выстрелов много, поэтому тише остальных звуков). У каждой башни свой тон. */
  shoot(tower: 'pill' | 'syrup' | 'fizz' | 'syringe' | 'ampule' | 'antibiotic' | 'lamp' | 'vitamin' | 'frost' | 'patch' = 'pill'): void {
    if (!this.gate(`shoot:${tower}`)) return;
    if (tower === 'syrup') this.tone({ from: 220, to: 330, ms: 90, type: 'sine', gain: 0.45 });
    else if (tower === 'fizz') this.tone({ from: 160, to: 90, ms: 110, type: 'triangle', gain: 0.5 });
    else if (tower === 'ampule') this.tone({ from: 2200, to: 500, ms: 160, type: 'sine', gain: 0.4 });
    else if (tower === 'antibiotic') this.tone({ from: 420, to: 640, ms: 80, type: 'sine', gain: 0.4 });
    else if (tower === 'lamp') this.tone({ from: 520, to: 780, ms: 140, type: 'sine', gain: 0.3 });
    else if (tower === 'frost') this.tone({ from: 1800, to: 1100, ms: 240, type: 'sine', gain: 0.35 });
    else if (tower === 'patch') this.tone({ from: 240, to: 150, ms: 120, type: 'triangle', gain: 0.45 });
    else if (tower === 'syringe') this.tone({ from: 1500, to: 900, ms: 70, type: 'sawtooth', gain: 0.18 });
    else this.tone({ from: 300, to: 180, ms: 60, type: 'triangle', gain: 0.35 });
  }

  /** Лужа сиропа шлёпнулась на дорожку: короткое «плюх». */
  splash(): void {
    if (!this.gate('splash', 2)) return;
    this.tone({ from: 260, to: 120, ms: 140, type: 'sine', gain: 0.5 });
    this.tone({ from: 480, to: 200, ms: 90, type: 'triangle', gain: 0.25, delayMs: 30 });
  }

  /** Башню с лучом повернули на 45°: короткий «щёлк». */
  rotate(): void {
    this.tone({ from: 900, to: 1200, ms: 50, type: 'square', gain: 0.25 });
  }

  /** Башню выбрали на карте: короткий тихий «тик». */
  select(): void {
    this.tone({ from: 600, to: 760, ms: 45, type: 'triangle', gain: 0.3 });
  }

  /** Слияние: два тона вверх и «блеск». */
  merge(): void {
    this.tone({ from: 440, to: 880, ms: 140, type: 'triangle', gain: 0.8 });
    this.tone({ from: 880, to: 1320, ms: 160, type: 'triangle', gain: 0.6, delayMs: 90 });
    this.tone({ from: 1760, to: 2200, ms: 120, type: 'sine', gain: 0.35, delayMs: 180 });
  }

  /** Выбрана мутация: восходящая трель. */
  mutation(): void {
    this.tone({ from: 600, to: 900, ms: 90, type: 'square', gain: 0.3 });
    this.tone({ from: 900, to: 1400, ms: 130, type: 'square', gain: 0.3, delayMs: 90 });
  }

  /** Башня продана: «звяк» монет. */
  sell(): void {
    this.tone({ from: 1200, to: 1500, ms: 70, type: 'triangle', gain: 0.6 });
    this.tone({ from: 1600, to: 1900, ms: 90, type: 'triangle', gain: 0.5, delayMs: 70 });
  }

  /** Удар луча шприца: быстрый высокий «вжик» (на каждый удар очереди). */
  zap(): void {
    if (!this.gate('zap')) return;
    this.tone({ from: 2200, to: 700, ms: 110, type: 'sawtooth', gain: 0.22 });
  }

  /** Взрыв шипучки: низкий «бум» с шипением. */
  blast(): void {
    if (!this.gate('blast', 2)) return;
    this.tone({ from: 140, to: 50, ms: 220, type: 'sawtooth', gain: 0.6 });
    this.tone({ from: 900, to: 300, ms: 150, type: 'square', gain: 0.15, delayMs: 20 });
  }

  /** Попадание, не добившее бактерию: короткий «тик». Тон зависит от типа (бронированная — глухой «клац»). */
  hit(kind: string): void {
    if (kind === 'armored' || kind === 'giant') {
      if (!this.gate('hit:armor')) return;
      this.tone({ from: 260, to: 170, ms: 90, type: 'square', gain: 0.5 });
      return;
    }
    if (!this.gate('hit')) return;
    const pitch = ({ coccus: 520, rod: 430, splitter: 480, spore: 720, swarm: 880, runner: 640, healer: 360, slick: 400, regen: 340, commander: 560, brood: 300, leaper: 760, phago: 330, stealth: 400, toxin: 280, mutant: 450, parasite: 620 } as Record<string, number>)[kind] ?? 500;
    this.tone({ from: pitch, to: pitch * 0.6, ms: 70, type: 'triangle', gain: 0.8 });
  }

  /** Бактерия уничтожена: яркий «дзинь». */
  destroy(): void {
    if (!this.gate('destroy', 2)) return;
    this.tone({ from: 700, to: 1400, ms: 110, type: 'triangle' });
    this.tone({ from: 1400, to: 2100, ms: 90, gain: 0.6, delayMs: 60 });
  }

  /** Башня поставлена: восходящий «клик». */
  place(): void {
    this.tone({ from: 400, to: 700, ms: 90, type: 'triangle', gain: 0.8 });
    this.tone({ from: 700, to: 1000, ms: 80, gain: 0.5, delayMs: 60 });
  }

  /** Нельзя (не хватает монет, клетка занята): глухой короткий звук. */
  denied(): void {
    this.tone({ from: 180, to: 130, ms: 120, type: 'square', gain: 0.4 });
  }

  /** Началась новая волна: два восходящих тона — «обрати внимание». */
  wave(): void {
    this.tone({ from: 660, to: 700, ms: 110, gain: 0.7 });
    this.tone({ from: 880, to: 930, ms: 160, gain: 0.7, delayMs: 110 });
  }

  /** Делящаяся распалась на кокков: «поп-поп». */
  split(): void {
    if (!this.gate('split', 2)) return;
    this.tone({ from: 330, to: 130, ms: 130, type: 'triangle' });
    this.tone({ from: 520, to: 220, ms: 90, gain: 0.7, delayMs: 45 });
  }

  /** Появилась новая бактерия, которой ещё не было: три быстрых восходящих тона — «обрати внимание». */
  newType(): void {
    this.tone({ from: 500, to: 560, ms: 90, type: 'square', gain: 0.35 });
    this.tone({ from: 700, to: 780, ms: 90, type: 'square', gain: 0.35, delayMs: 100 });
    this.tone({ from: 1000, to: 1100, ms: 180, type: 'square', gain: 0.4, delayMs: 200 });
  }

  /** Следующая волна — с боссом: два низких тревожных удара (знак без текста, п. 3.1 сообщения владельца 1 от 26 октября 2026). */
  bossWarn(): void {
    this.tone({ from: 180, to: 150, ms: 260, type: 'sawtooth', gain: 0.55 });
    this.tone({ from: 180, to: 120, ms: 380, type: 'sawtooth', gain: 0.6, delayMs: 320 });
  }

  /** Спора заглушила башню: низкий «бззз». */
  disabled(): void {
    if (!this.gate('disabled')) return;
    this.tone({ from: 140, to: 90, ms: 220, type: 'sawtooth', gain: 0.45 });
  }

  /** Победа: три восходящих тона. */
  win(): void {
    this.tone({ from: 520, to: 560, ms: 140, type: 'triangle' });
    this.tone({ from: 660, to: 700, ms: 140, type: 'triangle', delayMs: 140 });
    this.tone({ from: 880, to: 940, ms: 260, type: 'triangle', delayMs: 280 });
  }

  /** Бактерия дошла до организма, потеряна жизнь: низкий удар. */
  lifeLost(): void {
    this.tone({ from: 220, to: 55, ms: 260, type: 'sawtooth', gain: 0.7 });
  }

  /** Проигрыш (жизней не осталось): тон падает вниз. */
  lose(): void {
    this.tone({ from: 330, to: 70, ms: 450, type: 'sawtooth', gain: 0.6, delayMs: 200 });
  }
}

export const sfx = new Sfx();
