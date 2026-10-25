/**
 * Жёсткие свойства уровня (`plan.hardWalls`): общая проверка «не ранит ли этот удар эту бактерию» (`Ward`, src/objects/Bacterium.ts).
 * Её читают бой (`GameScene.damageBacterium`) и выбор цели башен «по радиусу», «снайпер» и «по площади» (`Tower.canAffect`): цель, которую удар не ранит,
 * не выбирается вовсе, даже если других целей в зоне нет: выстрела по неуязвимой цели нет, кольцо свойства на бактерии остаётся
 * (решение владельца 24 октября 2026, сообщение 2, п. 2.3; принято «как в коде» 25 октября 2026, сообщение 1, п. 3).
 */
import type { Bacterium } from './objects/Bacterium';
import type { TowerStats } from './towerStats';

export function wardBlocks(bacterium: Bacterium, st: TowerStats): boolean {
  switch (bacterium.ward) {
    case 'slow': return !bacterium.slowed;
    case 'pierce': return !st.armorPierce && bacterium.armor > 0;
    case 'beam': return st.targeting === 'beam';
    case 'memory': return bacterium.memory === st.towerId;
    case 'area': return bacterium.inFinalPhase && st.targeting !== 'area' && st.targeting !== 'beam';
    default: return false;
  }
}
