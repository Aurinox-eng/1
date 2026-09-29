import Phaser from 'phaser';
import { CONFIG } from './config';
import { t } from './i18n';
import type { BacteriumSize } from './objects/Bacterium';
import { COLORS, FONT, TEXT_COLORS } from './theme';

/** Размер шрифта всплывающих очков: чем мельче бактерия (и дороже очки), тем крупнее надпись. */
const POPUP_FONT_SIZE: Record<BacteriumSize, number> = { large: 44, medium: 52, small: 62 };

/**
 * Отклик на попадание: вспышка, частицы, всплывающее «+очки», тряска экрана.
 * Все числа (сколько частиц, как долго, как сильно трясёт) — в config.ts, раздел «feedback».
 */
export class Effects {
  /** Сколько раз сработало каждое — для проверок. */
  bursts = 0;
  popups = 0;
  shakes = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Вспышка и разлёт частиц на месте бактерии. */
  burst(x: number, y: number, radius: number, size: BacteriumSize): void {
    this.bursts++;
    const { particlesPerHit, particleSpeed, particleLifeMs } = CONFIG.feedback;

    // Круглая вспышка: быстро расширяется и гаснет
    const flash = this.scene.add
      .circle(x, y, radius, COLORS.hit, 1)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD); // складывается со светом фона — вспышка получается яркой
    this.scene.tweens.add({
      targets: flash,
      scale: 1.7,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy(),
    });

    // Частицы: маленькие кружки в цвет бактерии разлетаются во все стороны и гаснут
    for (let i = 0; i < particlesPerHit; i++) {
      const angle = (Math.PI * 2 * i) / particlesPerHit + Math.random() * 0.5;
      const distance = ((particleSpeed * particleLifeMs) / 1000) * (0.35 + Math.random() * 0.65);
      const color = i % 3 === 0 ? COLORS.hit : COLORS.bacteria[size];
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
  popup(x: number, y: number, points: number, size: BacteriumSize): void {
    this.popups++;
    const text = this.scene.add
      .text(x, y, t('scorePopup', { n: points }), {
        fontFamily: FONT,
        fontSize: `${POPUP_FONT_SIZE[size]}px`,
        fontStyle: 'bold',
        color: TEXT_COLORS.popup[size],
        stroke: TEXT_COLORS.stroke,
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.scene.tweens.add({
      targets: text,
      y: y - 90,
      alpha: 0,
      duration: CONFIG.feedback.popupMs,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Лёгкая тряска экрана (при делении от попадания). */
  shake(): void {
    const { shakeMs, shakeIntensity } = CONFIG.feedback;
    if (shakeMs <= 0 || shakeIntensity <= 0) return;
    this.shakes++;
    this.scene.cameras.main.shake(shakeMs, shakeIntensity);
  }
}
