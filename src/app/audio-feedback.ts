import type { GameEvent } from '../core/types';

const CUE_PRIORITY = [
  'exit-opened',
  'order-item-completed',
  'combo-milestone',
  'food-eaten',
] as const;
const CUE_TYPES = new Set<GameEvent['type']>(CUE_PRIORITY);

/** 同一批规则事件只选一个主提示音，生命周期和技能音效仍正常分发。 */
export function selectAudioEvents(
  events: readonly GameEvent[],
  campaign: boolean,
): readonly GameEvent[] {
  if (!campaign) return events;
  const dominant = CUE_PRIORITY.map((type) => events.find((event) => event.type === type)).find(
    (event) => event !== undefined,
  );
  return events.filter(
    (event) =>
      (event.type !== 'tail-cut' || !events.some((item) => item.type === 'skill-used')) &&
      (!CUE_TYPES.has(event.type) || event === dominant),
  );
}
