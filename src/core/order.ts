import type { OrderProgress } from './types';

export interface RemainingOrderItem {
  readonly fruitType: string;
  readonly remaining: number;
}

/** HUD 与棋盘使用同一份派生规则，不在表现层各自计算目标。 */
export function getRemainingOrder(
  progress: readonly OrderProgress[],
): readonly RemainingOrderItem[] {
  return progress
    .filter((item) => item.collected < item.required)
    .map((item) => ({ fruitType: item.fruitType, remaining: item.required - item.collected }));
}
