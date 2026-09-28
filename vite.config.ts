import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути — обязательно, иначе игра не запустится из zip в консоли Яндекса.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // Phaser весит больше 500 КБ — это нормально, предупреждение не нужно.
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173 },
});
