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
    const title = this.add.text(W / 2, 150, t('gameTitle'), textStyle(72, TEXT_COLORS.accent)).setOrigin(0.5);
    const balance = this.add.text(W / 2, 260, t('dnaBalance', { n: metaDna() }), textStyle(34)).setOrigin(0.5);
    const play = addButton(this, { x: W / 2, y: 380, w: 460, h: 96, label: t('menuPlay'), fontSize: 44, onTap: () => this.scene.start('Levels') });
    const upgrades = addButton(this, {
      x: W / 2,
      y: 500,
      w: 460,
      h: 96,
      label: t('upgradesBtn'),
      fontSize: 40,
      fill: 0x2a5c9a,
      line: COLORS.gold,
      onTap: () => this.scene.start('Upgrades', { from: 'menu' }),
    });
    const almanac = addButton(this, {
      x: W / 2,
      y: 640,
      w: 460,
      h: 76,
      label: t('almanacBtn'),
      fontSize: 36,
      fill: 0x2a3550,
      line: 0x4a5c82,
      onTap: () => this.scene.start('Almanac', { from: 'menu' }),
    });
    setScreenInfo(() => (this.scene.isActive() ? { scene: 'menu', buttons: { play, upgrades, almanac }, texts: [title.text, balance.text] } : null));
  }
}
