import Phaser from 'phaser';
import { CONFIG } from '../config';
import { t } from '../i18n';
import { attemptLog, dnaAtCap, hasProgress, metaDna, resetProgress } from '../meta';
import { copyText } from '../attempt';
import { setCurrentLevel } from '../progress';
import { sfx } from '../sound';
import { addButton, setScreenInfo, textStyle, type Rect } from '../screens';
import { COLORS, TEXT_COLORS, fs } from '../theme';

const { width: W, height: H } = CONFIG.screen;

/** Главное меню (этап 5, docs/stage-5-plan.md): название, очки ДНК, кнопки «Играть» (выбор уровня), «Улучшения», «Альманах», «Звук» и «Сбросить прогресс» (с подтверждением). */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const title = this.add.text(W / 2, 150, t('gameTitle'), textStyle(72, TEXT_COLORS.accent)).setOrigin(0.5);
    // на пределе счёта ДНК — серый, без текста (сообщение 2 от 28 октября 2026, п. 3)
    const balance = this.add.text(W / 2, 260, t('dnaBalance', { n: metaDna() }), textStyle(34, dnaAtCap() ? TEXT_COLORS.dim : TEXT_COLORS.main)).setOrigin(0.5);
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
    // Звук: маленькая кнопка в правом верхнем углу (по тапу — выключить или включить, надпись обновляется перезапуском сцены)
    const sound = addButton(this, {
      x: W - 130,
      y: 52,
      w: 220,
      h: 60,
      label: t(sfx.muted ? 'soundOff' : 'soundOn'),
      fontSize: 28,
      fill: 0x2a3550,
      line: 0x4a5c82,
      // звук нажатия — только после включения: выключение не звучит, включение подтверждается (находка аудита MASTER-0098)
      silent: true,
      onTap: () => {
        sfx.setMuted(!sfx.muted);
        if (!sfx.muted) sfx.place();
        this.scene.restart();
      },
    });
    // «Сбросить прогресс»: маленькая кнопка в левом верхнем углу, цвета кнопки «Альманах»; показывается, только когда есть что сбрасывать (очки ДНК, узлы или звёзды);
    // по тапу — окно подтверждения поверх меню (нижние кнопки под ним не нажимаются)
    let dialog: { yes: Rect; no: Rect; plate: Rect; texts: string[] } | null = null;
    const reset = hasProgress()
      ? addButton(this, {
          x: 190,
          y: 52,
          w: 340,
          h: 60,
          label: t('resetBtn'),
          fontSize: 26,
          fill: 0x2a3550,
          line: 0x4a5c82,
          onTap: () => {
            if (!dialog) dialog = this.openResetDialog();
          },
        })
      : null;

    // «Скопировать все попытки» (строки итога последних попыток, по строке на попытку): маленькая кнопка в левом нижнем углу, левее «Альманаха»; показывается, когда в журнале есть строки
    const log = attemptLog();
    let copyAll: Rect | null = null;
    if (log.length > 0) {
      // под кнопкой — получилось ли скопировать (сама кнопка надпись не меняет)
      const status = this.add.text(190, 700, '', textStyle(fs(20, 22), TEXT_COLORS.soft, false)).setOrigin(0.5);
      copyAll = addButton(this, {
        x: 190,
        y: 650,
        w: 340,
        h: 56,
        label: t('copyAllAttempts'),
        fontSize: 24,
        fill: 0x2a3550,
        line: 0x4a5c82,
        onTap: () => {
          void copyText(log.join('\n')).then((ok) => status.setText(t(ok ? 'copyAttemptDone' : 'copyAttemptFail')));
        },
      });
    }

    // Знак авторского права внизу по центру: ниже кнопки «Альманах» (низ — y 678), над краем экрана остаётся запас
    const copyright = this.add.text(W / 2, H - 18, t('copyright'), textStyle(20, TEXT_COLORS.soft, false)).setOrigin(0.5);
    setScreenInfo(() =>
      this.scene.isActive()
        ? { scene: 'menu', buttons: { play, upgrades, almanac, sound, ...(reset ? { reset } : {}), ...(copyAll ? { copyAll } : {}), ...(dialog ? { resetYes: dialog.yes, resetNo: dialog.no } : {}) }, texts: [title.text, balance.text, ...(dialog ? dialog.texts : [])], labels: { copyright: { x: copyright.x, y: copyright.y, w: copyright.width, h: copyright.height }, ...(dialog ? { resetPlate: dialog.plate } : {}) } }
        : null,
    );
  }

  /**
   * Окно подтверждения сброса: затемнение на весь экран поверх меню (глушит нажатия под ним), непрозрачная подложка под заголовком, текстом и кнопками (кнопки меню сквозь неё не просвечивают),
   * вопрос, пояснение, «Да, сбросить» и «Отмена». Все части создаются после кнопок меню, поэтому лежат над ними.
   */
  private openResetDialog(): { yes: Rect; no: Rect; plate: Rect; texts: string[] } {
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82);
    this.add.zone(W / 2, H / 2, W, H).setInteractive();
    const plate: Rect = { x: W / 2, y: H / 2 + 15, w: W - 140, h: 370 };
    this.add.rectangle(plate.x, plate.y, plate.w, plate.h, COLORS.panel, 1).setStrokeStyle(4, COLORS.panelLine, 1);
    const title = this.add.text(W / 2, H / 2 - 120, t('resetTitle'), textStyle(52, TEXT_COLORS.accent)).setOrigin(0.5);
    const text = this.add.text(W / 2, H / 2 - 30, t('resetText'), { ...textStyle(30), align: 'center', wordWrap: { width: W - 200 } }).setOrigin(0.5);
    const close = (): void => {
      this.scene.restart();
    };
    const yes = addButton(this, {
      x: W / 2 - 180,
      y: H / 2 + 120,
      w: 320,
      h: 84,
      label: t('resetYes'),
      fontSize: 34,
      fill: 0x8a2a2a,
      line: 0xd86a6a,
      onTap: () => {
        resetProgress();
        setCurrentLevel(1);
        close();
      },
    });
    const no = addButton(this, { x: W / 2 + 180, y: H / 2 + 120, w: 320, h: 84, label: t('resetNo'), fontSize: 34, fill: 0x2a3550, line: 0x4a5c82, onTap: close });
    return { yes, no, plate, texts: [title.text, text.text] };
  }
}
