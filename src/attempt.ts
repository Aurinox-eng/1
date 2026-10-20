/**
 * Строка итога попытки (решение владельца 18 октября 2026, ответ 7; формат — docs/balance-rework-plan-2026-10-18.md, раздел 6): игрок копирует её кнопкой
 * «Скопировать итог» на экране конца уровня и присылает; бот пишет ту же строку. Поля разделены « | ». Личных данных в строке нет.
 */
import { t, type TextKey } from './i18n';
import type { TowerId } from './objects/Tower';

export interface AttemptRecord {
  level: number;
  attempt: number;
  won: boolean;
  /** Выход в меню с паузы после хотя бы одной пройденной волны (решение владельца 20 октября 2026, сообщение 2, п. 1.2): вместо «гибель N/30» — «выход в меню N/30». */
  exit?: boolean;
  /** Волна гибели или выхода (при победе не читается). */
  wave: number;
  waveTotal: number;
  stars: number;
  livesLeft: number;
  livesMax: number;
  /** Игровые секунды, проведённые на каждой скорости (ключ — множитель скорости 1, 2, 3, 5). */
  speedSec: Record<number, number>;
  /** Игровое время партии, с. */
  elapsedSec: number;
  /** Башни на поле в конце партии. */
  towers: { id: TowerId; level: number }[];
  merges: number;
  mutations: number;
  builds: number;
  sells: number;
  /** Монеты на старте волн 10, 20, 30, … (null — до волны не дошли). */
  coinsAtWave: [number, number | null][];
  dna: number;
  /** Ненулевые уровни улучшений на старте партии. */
  entry: [string, number][];
  /** Покупки с прошлой попытки: id → уровней. */
  bought: [string, number][];
}

const SEP = ' | ';
const cap = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/** Версия сборки: короткий хеш коммита (vite.config.ts, `define`); вне сборки — «dev». */
export function buildVersion(): string {
  const v = import.meta.env.VITE_BUILD as string | undefined;
  return v && v.length > 0 ? v : 'dev';
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function attemptLine(r: AttemptRecord): string {
  const fields: string[] = [t('attemptBuild', { v: buildVersion() }), t('attemptLevel', { n: r.level }), t('attemptNo', { n: r.attempt })];
  fields.push(r.won ? t('attemptWon', { stars: '★'.repeat(r.stars) || '—' }) : t(r.exit ? 'attemptExit' : 'attemptLost', { w: r.wave, total: r.waveTotal }));
  fields.push(t('attemptLives', { left: Math.max(0, Math.round(r.livesLeft)), max: r.livesMax }));
  const totalSec = Object.values(r.speedSec).reduce((a, b) => a + b, 0);
  const parts = Object.entries(r.speedSec)
    .filter(([, sec]) => sec > 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([speed, sec]) => `×${speed} ${Math.round((sec / Math.max(1e-9, totalSec)) * 100)} %`);
  fields.push(t('attemptSpeed', { parts: parts.join(' ') || '—' }));
  fields.push(clock(r.elapsedSec));
  // башни: вид, число, сколько каждого уровня — «Таблетка 9 (ур. 1×3, 2×4, 3×2)»
  const byKind = new Map<TowerId, number[]>();
  for (const tower of r.towers) {
    const levels = byKind.get(tower.id) ?? [0, 0, 0, 0];
    levels[tower.level - 1]++;
    byKind.set(tower.id, levels);
  }
  const towers = [...byKind].map(([id, levels]) => {
    const n = levels.reduce((a, b) => a + b, 0);
    const lv = levels.map((k, i) => (k > 0 ? `${i + 1}×${k}` : '')).filter(Boolean).join(', ');
    return `${t(`tower${cap(id)}` as TextKey)} ${n} (${t('attemptTowerLevels', { list: lv })})`;
  });
  fields.push(t('attemptTowers', { list: towers.join(' ') || '—' }));
  fields.push(t('attemptActions', { m: r.merges, u: r.mutations, b: r.builds, s: r.sells }));
  if (r.coinsAtWave.length > 0) {
    fields.push(t('attemptCoins', { waves: r.coinsAtWave.map(([w]) => w).join('/'), values: r.coinsAtWave.map(([, c]) => (c === null ? '—' : String(Math.floor(c)))).join('/') }));
  }
  fields.push(t('attemptDna', { n: r.dna }));
  fields.push(t('attemptEntry', { list: r.entry.map(([id, n]) => `${id} ${n}`).join(', ') || '—' }));
  fields.push(t('attemptBought', { list: r.bought.map(([id, n]) => `${id} +${n}`).join(', ') || '—' }));
  return fields.join(SEP);
}

/** Копирует текст в буфер обмена (вызывать из обработчика нажатия: браузеры разрешают запись только по жесту). Без Clipboard API — через скрытое поле и `execCommand`. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // запрет площадки или браузера — пробуем старый способ
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
