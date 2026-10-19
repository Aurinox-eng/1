import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Короткий хеш коммита сборки — первое поле строки итога попытки («ТПБ a1b2c3d»): по нему видно, на какой версии сыграна попытка. Нет git — «dev». */
function buildId(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildId()) },
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
