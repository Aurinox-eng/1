import Phaser from 'phaser';
import { CONFIG } from './config';
import { t } from './i18n';
import { getLang, setLang } from './lang';
import { GameScene } from './scenes/GameScene';
import { COLORS } from './theme';

// Язык страницы (для тега <html lang> и заголовка вкладки)
setLang(getLang());
document.title = t('gameTitle');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.screen.width,
  height: CONFIG.screen.height,
  backgroundColor: COLORS.background,
  scale: {
    // FIT: игровое поле целиком помещается на любом экране, пропорции 9:16 сохраняются
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Несколько одновременных касаний — чтобы можно было стрелять двумя пальцами
  input: { activePointers: 3 },
  // Пока в игре нет звуков (этап 3), звуковую систему не запускаем: иначе браузер пишет в консоль
  // предупреждение «AudioContext was not allowed to start». На этапе 3 эту строку уберём.
  audio: { noAudio: true },
  render: { antialias: true, powerPreference: 'high-performance' },
  banner: false,
  scene: [GameScene],
});

// Поворот телефона и смена размера окна. Phaser иногда уже знает новый размер страницы, но не
// перестраивает поле (так было при повороте телефона в эмуляции), поэтому перестраиваем сами:
// несколько раз с небольшими паузами, потому что браузер обновляет размеры не мгновенно.
let refitTimers: number[] = [];
const refit = (): void => {
  game.scale.getParentBounds();
  game.scale.refresh();
};
const refitSoon = (): void => {
  refitTimers.forEach((id) => window.clearTimeout(id));
  refitTimers = [0, 150, 500].map((ms) => window.setTimeout(refit, ms));
};
window.addEventListener('resize', refitSoon);
window.addEventListener('orientationchange', refitSoon);
window.visualViewport?.addEventListener('resize', refitSoon);
