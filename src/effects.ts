import Phaser from 'phaser';
import { CONFIG } from './config';
import { t } from './i18n';
import type { BacteriumKind } from './objects/Bacterium';
import { COLORS, FONT, TEXT_COLORS } from './theme';

/** Размер шрифта всплывающих очков: чем ценнее бактерия, тем крупнее надпись. */
const POPUP_FONT_SIZE: Record<BacteriumKind, number> = { coccus: 44, rod: 48, splitter: 50, armored: 58, spore: 54 };

/**
 * Отклик на события игры. Все числа (сколько частиц, как долго, как сильно трясёт) — в config.ts, раздел «feedback».
 *  • попадание — вспышка и всплывающее «+очки»;
 *  • уничтожение — разлёт частиц;
 *  • деление — лёгкая тряска экрана;
 *  • потеря жизни — красная вспышка на линии и более сильная тряска.
 */
export class Effects {
  /** Сколько раз сработало каждое — для проверок. */
  flashes = 0;
  bursts = 0;
  popups = 0;
  shakes = 0;
  lifeLosses = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Яркая круглая вспышка на месте попадания: быстро расширяется и гаснет. */
  flash(x: number, y: number, radius: number): void {
    this.flashes++;
    const flash = this.scene.add
      .circle(x, y, radius, COLORS.hit, 1)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD); // складывается со светом фона — вспышка получается яркой
    this.scene.tweens.add({
      targets: flash,
      scale: 1.6,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy(),
    });
  }

  /** Разлёт частиц (маленьких кружков в цвет бактерии) на месте уничтоженной бактерии. */
  burst(x: number, y: number, kind: BacteriumKind): void {
    this.bursts++;
    const { particlesPerKill, particleSpeed, particleLifeMs } = CONFIG.feedback;
    for (let i = 0; i < particlesPerKill; i++) {
      const angle = (Math.PI * 2 * i) / particlesPerKill + Math.random() * 0.5;
      const distance = ((particleSpeed * particleLifeMs) / 1000) * (0.35 + Math.random() * 0.65);
      const color = i % 3 === 0 ? COLORS.hit : COLORS.kinds[kind].body;
      const particle = this.scene.add.circle(x, y, 4 + Math.random() * 5, color).setDepth(8);
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

  /** Всплывающая надпись «+очки». */
  popup(x: number, y: number, points: number, kind: BacteriumKind): void {
    this.popups++;
    // Не выше 170 px от верха поля: иначе надпись наедет на подложку со счётом, сердцами и временем
    y = Math.max(y, 170);
    const text = this.scene.add
      .text(x, y, t('scorePopup', { n: points }), {
        fontFamily: FONT,
        fontSize: `${POPUP_FONT_SIZE[kind]}px`,
        fontStyle: 'bold',
        color: TEXT_COLORS.popup[kind],
        stroke: TEXT_COLORS.stroke,
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.scene.tweens.add({
      targets: text,
      y: y - 70,
      alpha: 0,
      duration: CONFIG.feedback.popupMs,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Лёгкая тряска экрана (при делении). */
  shake(): void {
    const { shakeMs, shakeIntensity } = CONFIG.feedback;
    if (shakeMs <= 0 || shakeIntensity <= 0) return;
    this.shakes++;
    this.scene.cameras.main.shake(shakeMs, shakeIntensity);
  }

  /** Бактерия дошла до линии: красная вспышка по всей ширине поля и сильная тряска. */
  lifeLost(lineY: number): void {
    this.lifeLosses++;
    const bar = this.scene.add
      .rectangle(CONFIG.screen.width / 2, lineY, CONFIG.screen.width, 90, COLORS.loseLine, 0.85)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: bar, alpha: 0, duration: 320, onComplete: () => bar.destroy() });
    const { lifeLostShakeMs, lifeLostShakeIntensity } = CONFIG.feedback;
    if (lifeLostShakeMs > 0 && lifeLostShakeIntensity > 0) {
      this.scene.cameras.main.shake(lifeLostShakeMs, lifeLostShakeIntensity);
    }
  }
}
