/**
 * Общие функции для проверок: запуск браузера и локального сервера.
 * Используются скриптами smoke.mjs (проверка + скриншоты) и bot.mjs (замер баланса).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Экраны, на которых проверяем игру. */
export const VIEWPORTS = {
  phone: {
    label: 'телефон 390×844',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    label: 'компьютер 1280×720',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

/** Ищет Chromium, установленный в системе (в облачной среде он лежит в PLAYWRIGHT_BROWSERS_PATH). */
function findSystemChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base).filter((d) => d.startsWith('chromium-'))) {
      const exe = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

export async function launchBrowser() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (firstError) {
    const executablePath = findSystemChromium();
    if (!executablePath) {
      throw new Error(
        'Не удалось запустить Chromium. Выполните один раз: npx playwright install chromium\n' +
          String(firstError),
      );
    }
    return chromium.launch({ headless: true, executablePath, args });
  }
}

/** Запускает сервер с готовой сборкой (папка dist). Возвращает адрес и функцию остановки. */
export async function startServer() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    throw new Error('Нет папки dist. Сначала выполните: npm run build');
  }
  const server = await preview({
    root: ROOT,
    logLevel: 'error',
    preview: { port: 0, strictPort: false, open: false, host: '127.0.0.1' },
  });
  const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.preview.port}/`;
  return { url, close: () => server.close() };
}

export function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Переводит координаты игрового поля в координаты на странице (учитывает масштаб экрана). */
export async function gameToPage(page, gx, gy) {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      const state = window.__pvb.getState();
      return {
        x: rect.left + (x / state.width) * rect.width,
        y: rect.top + (y / state.height) * rect.height,
      };
    },
    [gx, gy],
  );
}

/** Нажатие в точке: касание на телефоне, клик мышью на компьютере. */
export async function tap(page, x, y, isTouch) {
  if (isTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
