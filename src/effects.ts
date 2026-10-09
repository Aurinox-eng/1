import Phaser from 'phaser';
import { ART_DENSITY, bakeArt, ringImage, squareBox } from './art';
import { CONFIG } from './config';
import type { BacteriumKind } from './objects/Bacterium';
import { num } from './i18n';
import { COLORS, FONT, TEXT_COLORS } from './theme';

/**
 * Отклик на события игры. Все числа (сколько частиц, как долго, как сильно трясёт) — в config.ts, раздел «feedback».
 *  • попадание — вспышка;
 *  • уничтожение — разлёт частиц и всплывающее «+монеты»;
 *  • башня поставлена — расходящееся кольцо;
 *  • потеря жизни — красная вспышка по всему экрану и тряска (организм может быть за краем экрана, поэтому вспышка на всём экране).
 * Вспышки, частицы и надписи лежат в контейнере мира — они двигаются и масштабируются вместе с картой.
 *
 * Частые эффекты сделаны без создания объектов на каждое событие (это и тормозило конец партии):
 *  • частицы — один эмиттер частиц Phaser на всю сцену; при множестве уничтожений в секунду частиц на каждое меньше;
 *  • «+монеты» — готовый запас надписей (не больше `feedback.popupMax` на экране, лишние не показываются);
 *  • вспышки попадания — готовый запас картинок-кружков (не больше `feedback.flashMax` на экране).
 * Надписи и вспышки двигаются вручную в обработчике кадра (как прежние анимации: в реальном времени, и на паузе тоже).
 */

/** Кружок для частиц и вспышек (белый, цвет задаётся оттенком), радиус в пикселях мира. */
const DOT_R = 16;
const DISC_R = 32;
/** Сколько длится вспышка попадания и во сколько раз она расширяется. */
const FLASH_MS = 180;
const FLASH_GROW = 0.6;
/** За какое окно считается частота уничтожений (для числа частиц), мс. */
const KILL_WINDOW_MS = 1000;

/** «Cubic.easeOut» — как у прежних анимаций: быстро в начале, плавно к концу. */
const cubicOut = (p: number): number => 1 - (1 - p) ** 3;

/** Частица разлёта: откуда, куда летит, начальный размер. */
type BurstParticle = Phaser.GameObjects.Particles.Particle & { sx: number; sy: number; ex: number; ey: number; s0: number };

/** Двигает частицы разлёта по «Cubic.easeOut» от места гибели к своей точке, уменьшает и гасит (как прежняя анимация каждой частицы). */
class BurstMotion extends Phaser.GameObjects.Particles.ParticleProcessor {
  update(particle: Phaser.GameObjects.Particles.Particle, _delta: number, _step: number, t: number): void {
    const p = particle as BurstParticle;
    const e = cubicOut(t);
    p.x = p.sx + (p.ex - p.sx) * e;
    p.y = p.sy + (p.ey - p.sy) * e;
    p.scaleX = p.s0 * (1 - 0.8 * e);
    p.alpha = 1 - e;
  }
}

interface PopupAnim {
  label: Phaser.GameObjects.Text;
  fromY: number;
  toY: number;
  ms: number;
  busy: boolean;
}

/** Число урона над бактерией: чья, сколько набрано, доля прочности, цвет, когда начато (мс с последнего удара) и на какой высоте стартует. */
interface DamageAnim {
  label: Phaser.GameObjects.Text;
  key: string;
  target: number;
  value: number;
  share: number;
  fromY: number;
  ms: number;
  scale: number;
  busy: boolean;
}

interface FlashAnim {
  disc: Phaser.GameObjects.Image;
  scale: number;
  ms: number;
  busy: boolean;
}

export class Effects {
  /** Сколько раз сработало каждое — для проверок. */
  flashes = 0;
  bursts = 0;
  popups = 0;
  placements = 0;
  lifeLosses = 0;
  zaps = 0;
  blasts = 0;
  beams = 0;
  splats = 0;
  frosts = 0;
  damageNumbers = 0;

  /** Один эмиттер на все разлёты частиц. */
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Запас надписей «+монеты» и вспышек (создаются по мере надобности, не больше предела) — и какие из них сейчас на экране. */
  private readonly popupPool: PopupAnim[] = [];
  private readonly flashPool: FlashAnim[] = [];
  private readonly damagePool: DamageAnim[] = [];
  /** Когда были последние уничтожения (реальные часы, мс): по ним считается, сколько частиц давать на каждое. */
  private readonly killTimes: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
  ) {
    const dot = bakeArt(scene, 'fx-dot', squareBox(DOT_R), (g) => g.fillStyle(0xffffff, 1).fillCircle(0, 0, DOT_R));
    bakeArt(scene, 'fx-disc', squareBox(DISC_R), (g) => g.fillStyle(0xffffff, 1).fillCircle(0, 0, DISC_R));
    this.emitter = scene.add.particles(0, 0, dot, { emitting: false, speed: 0, lifespan: CONFIG.feedback.particleLifeMs });
    this.emitter.addParticleProcessor(new BurstMotion());
    layer.add(this.emitter);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  /** Каждый кадр (реальное время, и на паузе тоже — как прежние анимации): двигает надписи и вспышки, гасит закончившиеся. */
  private tick(_time: number, deltaMs: number): void {
    const popupMs = CONFIG.feedback.popupMs;
    for (const a of this.popupPool) {
      if (!a.busy) continue;
      a.ms += deltaMs;
      const p = Math.min(1, a.ms / popupMs);
      const e = cubicOut(p);
      a.label.setY(a.fromY + (a.toY - a.fromY) * e).setAlpha(1 - e);
      if (p >= 1) {
        a.busy = false;
        a.label.setVisible(false);
      }
    }
    const damageMs = CONFIG.feedback.damageNumMs;
    for (const a of this.damagePool) {
      if (!a.busy) continue;
      a.ms += deltaMs;
      const p = Math.min(1, a.ms / damageMs);
      const pop = 1 + 0.45 * Math.max(0, 1 - a.ms / 130);
      a.label.setY(a.fromY - 46 * cubicOut(p)).setScale(a.scale * pop).setAlpha(p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45);
      if (p >= 1) {
        a.busy = false;
        a.label.setVisible(false);
      }
    }
    for (const a of this.flashPool) {
      if (!a.busy) continue;
      a.ms += deltaMs;
      const p = Math.min(1, a.ms / FLASH_MS);
      a.disc.setScale(a.scale * (1 + FLASH_GROW * p)).setAlpha(1 - p);
      if (p >= 1) {
        a.busy = false;
        a.disc.setVisible(false);
      }
    }
  }

  /** Яркая круглая вспышка на месте попадания: быстро расширяется и гаснет (color — цвет вспышки; у сиропа оранжевая). */
  flash(x: number, y: number, radius: number, color: number = COLORS.hit): void {
    this.flashes++;
    let a = this.flashPool.find((f) => !f.busy);
    if (!a) {
      // Все вспышки заняты: новая — только пока не достигнут предел, иначе эту не показываем
      if (this.flashPool.length >= CONFIG.feedback.flashMax) return;
      const disc = this.scene.add.image(0, 0, 'fx-disc').setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(disc);
      a = { disc, scale: 1, ms: 0, busy: false };
      this.flashPool.push(a);
    }
    a.busy = true;
    a.ms = 0;
    a.scale = radius / DISC_R / ART_DENSITY;
    a.disc.setPosition(x, y).setTint(color).setScale(a.scale).setAlpha(1).setVisible(true);
    // поверх остальных эффектов, как прежняя только что созданная вспышка
    this.layer.bringToTop(a.disc);
  }

  /** Разлёт частиц (маленьких кружков в цвет бактерии) на месте уничтоженной бактерии. При частых уничтожениях частиц на каждое меньше. */
  burst(x: number, y: number, kind: BacteriumKind): void {
    this.bursts++;
    const { particlesPerKill, particleSpeed, particleLifeMs, particleFullRate, particleMinPerKill } = CONFIG.feedback;
    const now = performance.now();
    this.killTimes.push(now);
    while (this.killTimes.length > 0 && this.killTimes[0] < now - KILL_WINDOW_MS) this.killTimes.shift();
    const rate = this.killTimes.length;
    const count = rate <= particleFullRate ? particlesPerKill : Math.min(particlesPerKill, Math.max(particleMinPerKill, Math.round((particlesPerKill * particleFullRate) / rate)));
    for (let i = 0; i < count; i++) {
      const p = this.emitter.emitParticle(1, x, y) as BurstParticle | undefined;
      if (!p) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = ((particleSpeed * particleLifeMs) / 1000) * (0.35 + Math.random() * 0.65);
      p.sx = x;
      p.sy = y;
      p.ex = x + Math.cos(angle) * distance;
      p.ey = y + Math.sin(angle) * distance;
      p.s0 = (4 + Math.random() * 5) / DOT_R / ART_DENSITY;
      p.scaleX = p.s0;
      p.scaleY = p.s0;
      p.tint = i % 3 === 0 ? COLORS.hit : COLORS.kinds[kind].body;
      p.life = particleLifeMs * (0.7 + Math.random() * 0.3);
      p.lifeCurrent = p.life;
    }
  }

  /** Всплывающая надпись «+монеты» над местом, где погибла бактерия. Надписи берутся из готового запаса; если все заняты — не показывается. */
  popup(x: number, y: number, text: string): void {
    this.popups++;
    // свободная надпись с тем же текстом (не нужно перерисовывать буквы), иначе любая свободная, иначе новая — пока не достигнут предел
    let a = this.popupPool.find((p) => !p.busy && p.label.text === text) ?? this.popupPool.find((p) => !p.busy);
    if (!a) {
      if (this.popupPool.length >= CONFIG.feedback.popupMax) return;
      const label = this.scene.add
        .text(0, 0, text, {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: TEXT_COLORS.accent,
          stroke: TEXT_COLORS.stroke,
          strokeThickness: 6,
          resolution: 2,
        })
        .setOrigin(0.5);
      this.layer.add(label);
      a = { label, fromY: 0, toY: 0, ms: 0, busy: false };
      this.popupPool.push(a);
    }
    if (a.label.text !== text) a.label.setText(text);
    a.busy = true;
    a.ms = 0;
    a.fromY = y - 20 - Math.random() * 26;
    a.toY = y - 90 - Math.random() * 14;
    a.label.setPosition(x + (Math.random() - 0.5) * 56, a.fromY).setAlpha(1).setVisible(true);
    this.layer.bringToTop(a.label);
  }

  /**
   * Число урона над бактерией `target` (номер бактерии): value — сколько HP снял удар, share — доля её полной прочности, color — цвет башни.
   * Удары по той же бактерии в пределах `damageNumMergeMs` складываются в одно число (очередь Шприца, взрыв и снаряд подряд). Числа берутся из запаса;
   * если все заняты, вытесняется самое мелкое (по доле прочности), если новое крупнее, иначе новое не показывается.
   */
  damageNumber(target: number, x: number, y: number, value: number, share: number, color: number): void {
    if (value <= 0) return;
    this.damageNumbers++;
    const { damageNumMergeMs, damageNumMax, damageNumSteps, damageNumSizes } = CONFIG.feedback;
    let a = this.damagePool.find((p) => p.busy && p.target === target && p.ms < damageNumMergeMs);
    if (a) {
      a.value += value;
      a.share += share;
      a.fromY = a.label.y;
    } else {
      a = this.damagePool.find((p) => !p.busy);
      if (!a) {
        if (this.damagePool.length < damageNumMax) {
          const label = this.scene.add
            .text(0, 0, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: TEXT_COLORS.stroke, strokeThickness: 5, resolution: 2 })
            .setOrigin(0.5);
          this.layer.add(label);
          a = { label, key: '', target, value: 0, share: 0, fromY: y, ms: 0, scale: 1, busy: false };
          this.damagePool.push(a);
        } else {
          let weakest: DamageAnim | null = null;
          for (const p of this.damagePool) if (!weakest || p.share < weakest.share) weakest = p;
          if (!weakest || weakest.share >= share) return;
          a = weakest;
        }
      }
      a.target = target;
      a.value = value;
      a.share = share;
      a.fromY = y + (Math.random() - 0.5) * 10;
      a.label.setX(x + (Math.random() - 0.5) * 30);
    }
    a.ms = 0;
    a.busy = true;
    const big = a.share >= damageNumSteps[damageNumSteps.length - 1] * 1.6;
    const shown = a.value < 10 ? num(Math.round(a.value * 10) / 10) : String(Math.round(a.value));
    const hex = big ? '#ffd84d' : '#' + color.toString(16).padStart(6, '0');
    const key = `${shown}|${hex}`;
    if (key !== a.key) {
      a.key = key;
      a.label.setText(shown).setColor(hex);
    }
    let level = 0;
    while (level < damageNumSteps.length && a.share >= damageNumSteps[level]) level++;
    a.scale = damageNumSizes[Math.min(level, damageNumSizes.length - 1)];
    a.label.setPosition(a.label.x, a.fromY).setScale(a.scale).setAlpha(1).setVisible(true);
    this.layer.bringToTop(a.label);
  }

  /** Башня поставлена: кольцо расходится от клетки. */
  placed(x: number, y: number): void {
    this.placements++;
    this.ring(x, y, 40, 5, COLORS.ghostEdge, 2.4, 380);
  }

  /** Слияние или выбор мутации: золотое кольцо и искры расходятся от башни. */
  merged(x: number, y: number): void {
    this.placements++;
    this.ring(x, y, 44, 6, COLORS.gold, 2.8, 460);
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const spark = this.scene.add.circle(x, y, 5, i % 2 === 0 ? COLORS.gold : COLORS.merge);
      this.layer.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 90,
        y: y + Math.sin(angle) * 90,
        alpha: 0,
        scale: 0.3,
        duration: 480,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** Взрыв шипучки: розовый круг радиуса взрыва вспыхивает и гаснет, по его краю расходится кольцо. */
  blast(x: number, y: number, radius: number): void {
    this.blasts++;
    const base = radius / DISC_R / ART_DENSITY;
    const disc = this.scene.add.image(x, y, 'fx-disc').setScale(base).setTint(COLORS.fizz).setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(disc);
    this.scene.tweens.add({ targets: disc, scale: base * 1.12, alpha: 0, duration: 320, onComplete: () => disc.destroy() });
    this.ring(x, y, radius, 5, COLORS.fizz, 1.25, 380);
  }

  /** Удар луча шприца: яркая бирюзовая линия от башни на длину луча быстро гаснет. */
  beam(x: number, y: number, angle: number, length: number): void {
    this.beams++;
    const line = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    line.lineStyle(14, COLORS.needle, 0.35).lineBetween(0, 0, length, 0);
    line.lineStyle(5, 0xffffff, 0.95).lineBetween(0, 0, length, 0);
    line.setPosition(x, y).setRotation(angle);
    this.layer.add(line);
    this.scene.tweens.add({ targets: line, alpha: 0, duration: 200, onComplete: () => line.destroy() });
  }

  /** Холод заморозил бактерий: бело-голубой круг радиуса башни вспыхивает и медленно гаснет, по его краю расходится кольцо, внутри разлетаются ледяные искры. */
  frost(x: number, y: number, radius: number): void {
    this.frosts++;
    const base = radius / DISC_R / ART_DENSITY;
    const disc = this.scene.add.image(x, y, 'fx-disc').setScale(base * 0.4).setTint(COLORS.frost).setAlpha(0.42).setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(disc);
    this.scene.tweens.add({ targets: disc, scale: base, alpha: 0, duration: 560, ease: 'Cubic.easeOut', onComplete: () => disc.destroy() });
    this.ring(x, y, radius * 0.9, 6, COLORS.frostLight, 1.12, 520);
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * (0.2 + Math.random() * 0.7);
      const spark = this.scene.add.circle(x + Math.cos(angle) * dist * 0.5, y + Math.sin(angle) * dist * 0.5, 3 + Math.random() * 3, 0xffffff).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(spark);
      this.scene.tweens.add({ targets: spark, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, scale: 0.3, duration: 520, ease: 'Cubic.easeOut', onComplete: () => spark.destroy() });
    }
  }

  /** Лужа сиропа шлёпнулась на дорожку: оранжевое кольцо расходится от места падения. */
  splat(x: number, y: number, radius: number): void {
    this.splats++;
    this.ring(x, y, radius * 0.6, 5, COLORS.puddle, 1.7, 340);
  }

  /** Спора заглушила башню: красное кольцо расходится от башни. */
  zap(x: number, y: number): void {
    this.zaps++;
    this.ring(x, y, 36, 6, COLORS.loseLine, 3, 450);
  }

  /** Расходящееся кольцо (картинка): радиус и толщина в начале, цвет; за ms миллисекунд увеличивается в grow раз и гаснет. */
  private ring(x: number, y: number, radius: number, width: number, color: number, grow: number, ms: number): void {
    const ring = ringImage(this.scene, x, y, radius, width, color);
    this.layer.add(ring);
    this.scene.tweens.add({ targets: ring, scale: ring.scale * grow, alpha: 0, duration: ms, onComplete: () => ring.destroy() });
  }

  /** Бактерия дошла до организма: красная вспышка на всём экране и тряска. */
  lifeLost(): void {
    this.lifeLosses++;
    const { width, height } = CONFIG.screen;
    const flash = this.scene.add
      .rectangle(width / 2, height / 2, width, height, COLORS.loseLine, 0.45)
      .setDepth(90)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    const { lifeLostShakeMs, lifeLostShakeIntensity } = CONFIG.feedback;
    if (lifeLostShakeMs > 0 && lifeLostShakeIntensity > 0) {
      this.scene.cameras.main.shake(lifeLostShakeMs, lifeLostShakeIntensity);
    }
  }
}
