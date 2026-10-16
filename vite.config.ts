import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // Игра не использует физику Phaser (`this.physics` в коде нет): подключается сборка с одной аркадной физикой без физического движка Matter (меньше примерно на 110 КБ; типы остаются из пакета phaser).
    alias: [{ find: /^phaser$/, replacement: fileURLToPath(new URL('./node_modules/phaser/dist/phaser-arcade-physics.js', import.meta.url)) }],
  },
  // Относительные пути — обязательно, иначе игра не запустится из zip в консоли Яндекса.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // Phaser весит больше 500 КБ — это нормально, предупреждение не нужно.
    chunkSizeWarningLimit: 2000,
    // Лицензии пакетов, попавших в сборку (Phaser — MIT, требует сохранять текст лицензии), кладутся в dist/licenses.md.
    license: { fileName: 'licenses.md' },
  },
  server: { port: 5173 },
});
