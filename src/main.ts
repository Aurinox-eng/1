import Phaser from 'phaser';
import { CONFIG } from './config';
import { QA_MODE } from './debug';
import { t } from './i18n';
import { getLang, setLang } from './lang';
import { START_IN_MENU } from './progress';
import { AlmanacScene } from './scenes/AlmanacScene';
import { GameScene } from './scenes/GameScene';
import { LevelsScene } from './scenes/LevelsScene';
import { MenuScene } from './scenes/MenuScene';
import { UpgradesScene } from './scenes/UpgradesScene';
import { COLORS } from './theme';

// Язык страницы (для тега <html lang> и заголовка вкладки)
setLang(getLang());
document.title = t('gameTitle');
const rotateText = document.getElementById('rotate-text');
if (rotateText) rotateText.textContent = t('rotatePhone');

// Режим проверки (?qa&canvas, только в тестовой сборке и dev): рисовать через canvas вместо WebGL — на слабом контейнере без видеокарты
// это втрое быстрее, бот баланса замеряет партии быстрее. В игровой сборке параметр не работает.
const useCanvas = QA_MODE && new URLSearchParams(window.location.search).has('canvas');

const game = new Phaser.Game({
  type: useCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: CONFIG.screen.width,
  height: CONFIG.screen.height,
  backgroundColor: COLORS.background,
  scale: {
    // FIT: игровой экран целиком помещается на любом устройстве, пропорции 16:9 сохраняются
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Несколько одновременных касаний — нужны два пальца для приближения карты (щипок)
  input: { activePointers: 3 },
  // Пока в игре нет звуков (этап 3), звуковую систему не запускаем: иначе браузер пишет в консоль
  // предупреждение «AudioContext was not allowed to start». На этапе 3 эту строку уберём.
  audio: { noAudio: true },
  render: { antialias: true, powerPreference: 'high-performance' },
  banner: false,
  // Первая сцена в списке запускается сама: меню или, при адресе с `?level=N` (и в режиме проверки без `&menu`), сразу партия
  scene: START_IN_MENU ? [MenuScene, LevelsScene, GameScene, UpgradesScene, AlmanacScene] : [GameScene, MenuScene, LevelsScene, UpgradesScene, AlmanacScene],
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
