import { CONFIG } from './config';
import { t } from './i18n';
import { LEVEL_WAVES, QA_CONDITION } from './debug';

/**
 * Особое условие уровня (план docs/content-plan-2026-10-26.md, раздел 5; числа — `CONFIG.conditions`): «Сладкое» — бактерии быстрее, награда больше; «Без продажи» — башни нельзя продать.
 * Условие берётся по таблице `conditions.byLevel` (в режиме проверки — только с `&levelwaves`, как карта и волны уровня); `?qa&cond=…` ставит условие на любом уровне.
 */
export type ConditionId = 'sweet' | 'nosell';

const QA_PICK: ConditionId | null = QA_CONDITION === 'sweet' || QA_CONDITION === 'nosell' ? QA_CONDITION : null;

/** Условие уровня `level` (нет — null). */
export function levelCondition(level: number): ConditionId | null {
  if (QA_PICK) return QA_PICK;
  return LEVEL_WAVES ? (CONFIG.conditions.byLevel[level] ?? null) : null;
}

/** Условие идущей партии: сцена ставит его при старте партии. */
let active: ConditionId | null = null;

export function setActiveCondition(id: ConditionId | null): void {
  active = id;
}

export function activeCondition(): ConditionId | null {
  return active;
}

/** Множитель скорости бактерий от условия партии. */
export function conditionSpeedMul(): number {
  return active === 'sweet' ? CONFIG.conditions.sweet.speedMul : 1;
}

/** Множитель награды за бактерию от условия партии. */
export function conditionRewardMul(): number {
  return active === 'sweet' ? CONFIG.conditions.sweet.rewardMul : 1;
}

/** Можно ли продавать башни в этой партии. */
export function canSell(): boolean {
  return active !== 'nosell';
}

/** Строка условия для экрана выбора уровня (числа — из `CONFIG.conditions`). */
export function conditionLine(id: ConditionId): string {
  if (id === 'sweet') {
    const { speedMul, rewardMul } = CONFIG.conditions.sweet;
    return t('condSweet', { speed: Math.round((speedMul - 1) * 100), reward: Math.round((rewardMul - 1) * 100) });
  }
  return t('condNoSell');
}
