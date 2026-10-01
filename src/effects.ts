import Phaser from 'phaser';
import { CONFIG } from './config';
import type { BacteriumKind } from './objects/Bacterium';
import { COLORS, FONT, TEXT_COLORS } from './theme';

/**
 * Отклик на события игры. Все числа (сколько частиц, как долго, как сильно трясёт) — в config.ts, раздел «feedback».
 *  • попадание — вспышка;
 *  • уничтожение — разлёт частиц и всплывающее «+монеты»;
 *  • башня поставлена — расходящееся кольцо;
 *  • потеря жизни — красная вспышка по всему экрану и тряска (организм может быть за краем экрана, поэтому вспышка на всём экране).
 * Вспышки, частицы и надписи лежат в контейнере мира — они двигаются и масштабируются вместе с картой.
 */
export class Effects {
  /** Сколько раз сработало каждое — для проверок. */
  flashes = 0;
  bursts = 0;
  popups = 0;
  placements = 0;
  lifeLosses = 0;
  zaps = 0;
  blasts = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
  ) {}

  /** Яркая круглая вспышка на месте попадания: быстро расширяется и гаснет (color — цвет вспышки; у сиропа оранжевая). */
  flash(x: number, y: number, radius: number, color: number = COLORS.hit): void {
    this.flashes++;
    const flash = this.scene.add.circle(x, y, radius, color, 1).setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add(flash);
    this.scene.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
  }

  /** Разлёт частиц (маленьких кружков в цвет бактерии) на месте уничтоженной бактерии. */
  burst(x: number, y: number, kind: BacteriumKind): void {
    this.bursts++;
    const { particlesPerKill, particleSpeed, particleLifeMs } = CONFIG.feedback;
    for (let i = 0; i < particlesPerKill; i++) {
      const angle = (Math.PI * 2 * i) / particlesPerKill + Math.random() * 0.5;
      const distance = ((particleSpeed * particleLifeMs) / 1000) * (0.35 + Math.random() * 0.65);
      const color = i % 3 === 0 ? COLORS.hit : COLORS.kinds[kind].body;
      const particle = this.scene.add.circle(x, y, 4 + Math.random() * 5, color);
      this.layer.add(particle);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scale: 0.2,
        alpha: 0,
        duration: particleLifeMs * (0.7 + Math.random() * 0.3),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  /** Всплывающая надпись «+монеты» над местом, где погибла бактерия. */
  popup(x: number, y: number, text: string): void {
    this.popups++;
    const label = this.scene.add
      .text(x + (Math.random() - 0.5) * 56, y - 20 - Math.random() * 26, text, {
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
    this.scene.tweens.add({
      targets: label,
      y: y - 90 - Math.random() * 14,
      alpha: 0,
      duration: CONFIG.feedback.popupMs,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Башня поставлена: кольцо расходится от клетки. */
  placed(x: number, y: number): void {
    this.placements++;
    const ring = this.scene.add.circle(x, y, 40).setStrokeStyle(5, COLORS.ghostEdge, 1).setFillStyle();
    this.layer.add(ring);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
  }

  /** Взрыв шипучки: розовый круг радиуса взрыва вспыхивает и гаснет, по его краю расходится кольцо. */
  blast(x: number, y: number, radius: number): void {
    this.blasts++;
    const disc = this.scene.add.circle(x, y, radius, COLORS.fizz, 0.28).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.scene.add.circle(x, y, radius).setStrokeStyle(5, COLORS.fizz, 1).setFillStyle();
    this.layer.add([disc, ring]);
    this.scene.tweens.add({ targets: disc, scale: 1.12, alpha: 0, duration: 320, onComplete: () => disc.destroy() });
    this.scene.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
  }

  /** Спора заглушила башню: красное кольцо расходится от башни. */
  zap(x: number, y: number): void {
    this.zaps++;
    const ring = this.scene.add.circle(x, y, 36).setStrokeStyle(6, COLORS.loseLine, 1).setFillStyle();
    this.layer.add(ring);
    this.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
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
