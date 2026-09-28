import Phaser from 'phaser';
import { CONFIG } from './config';
import { getLang, setLang } from './lang';
import { GameScene } from './scenes/GameScene';

// Язык страницы (для тега <html lang> и заголовка вкладки)
setLang(getLang());
document.title = getLang() === 'ru' ? 'Таблетки против бактерий' : 'Pills vs Bacteria';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.screen.width,
  height: CONFIG.screen.height,
  backgroundColor: '#12203a',
  scale: {
    // FIT: игровое поле целиком помещается на любом экране, пропорции 9:16 сохраняются
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Несколько одновременных касаний — чтобы можно было стрелять двумя пальцами
  input: { activePointers: 3 },
  render: { antialias: true, powerPreference: 'high-performance' },
  banner: false,
  scene: [GameScene],
});
