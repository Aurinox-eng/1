import Phaser from 'phaser';
import { CONFIG } from '../config';
import { t } from '../i18n';
import { metaDna } from '../meta';
import { addButton, setScreenInfo, textStyle } from '../screens';
import { COLORS, TEXT_COLORS } from '../theme';

const { width: W } = CONFIG.screen;

/** Главное меню (этап 5, docs/stage-5-plan.md): название, очки ДНК, кнопки «Играть» (выбор уровня) и «Улучшения». */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const title = this.add.text(W / 2, 170, t('gameTitle'), textStyle(72, TEXT_COLORS.accent)).setOrigin(0.5);
    const balance = this.add.text(W / 2, 270, t('dnaBalance', { n: metaDna() }), textStyle(34)).setOrigin(0.5);
    const play = addButton(this, { x: W / 2, y: 400, w: 460, h: 96, label: t('menuPlay'), fontSize: 44, onTap: () => this.scene.start('Levels') });
    const upgrades = addButton(this, {
      x: W / 2,
      y: 520,
      w: 460,
      h: 96,
      label: t('upgradesBtn'),
      fontSize: 40,
      fill: 0x2a5c9a,
      line: COLORS.gold,
      onTap: () => this.scene.start('Upgrades', { from: 'menu' }),
    });
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'menu', buttons: { play, upgrades }, texts: [title.text, balance.text] } : null));
  }
}
