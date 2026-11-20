/**
 * Настройки игрока (этап 8, пп. 3–4; решение владельца 20 ноября 2026, сообщение 1, п. 6): громкость 0–100 % и режим «Без вспышек и тряски».
 *
 * Хранятся в браузере своим ключом `pvb.settings`, а не в сохранении прогресса: сброс прогресса их не трогает (как прежнюю кнопку «Звук»). Прежняя запись `pvb.sound`
 * («0» — звук выключен кнопкой «Звук») читается: выключенный звук становится громкостью 0 %, включённый — громкостью по умолчанию. Запись `pvb.sound` по-прежнему
 * обновляется («0» при 0 %, иначе «1»): прежние сборки с того же адреса видят выключенный звук.
 * Модуль не зависит от звука и эффектов: они подписываются на изменения (`onSettingsChange`).
 */
import { CONFIG } from './config';

export interface Settings {
  /** Громкость, процентов: 0–100, кратно `settings.volumeStep`; 0 — звука нет. */
  volume: number;
  /** Режим «Без вспышек и тряски». */
  calm: boolean;
}

const KEY = 'pvb.settings';
const OLD_SOUND_KEY = 'pvb.sound';

/** Громкость в допустимом виде: 0–100 и кратно шагу ползунка. */
export function clampVolume(value: number): number {
  const step = CONFIG.settings.volumeStep;
  if (!Number.isFinite(value)) return CONFIG.settings.volumeDefault;
  return Math.max(0, Math.min(100, Math.round(value / step) * step));
}

function load(): Settings {
  const out: Settings = { volume: clampVolume(CONFIG.settings.volumeDefault), calm: false };
  try {
    const text = window.localStorage.getItem(KEY);
    if (text) {
      const raw = JSON.parse(text) as { volume?: unknown; calm?: unknown };
      if (typeof raw.volume === 'number') out.volume = clampVolume(raw.volume);
      if (typeof raw.calm === 'boolean') out.calm = raw.calm;
    } else if (window.localStorage.getItem(OLD_SOUND_KEY) === '0') {
      // прежняя кнопка «Звук: выкл»
      out.volume = 0;
    }
  } catch {
    /* хранилище недоступно или запись испорчена: настройки по умолчанию */
  }
  return out;
}

/** Текущие настройки (читать можно где угодно; менять — только через `setVolume` и `setCalm`). */
export const settings: Readonly<Settings> = load();

const listeners: (() => void)[] = [];

/** Подписка на изменение настроек (звук меняет громкость, эффекты — режим без вспышек). */
export function onSettingsChange(fn: () => void): void {
  listeners.push(fn);
}

function save(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
    window.localStorage.setItem(OLD_SOUND_KEY, settings.volume > 0 ? '1' : '0');
  } catch {
    /* не страшно: просто не запомнится */
  }
  for (const fn of listeners) fn();
}

/** Громкость, процентов (округляется до шага ползунка). */
export function setVolume(value: number): void {
  const next = clampVolume(value);
  if (next === settings.volume) return;
  (settings as Settings).volume = next;
  save();
}

/** Режим «Без вспышек и тряски». */
export function setCalm(on: boolean): void {
  if (on === settings.calm) return;
  (settings as Settings).calm = on;
  save();
}
