export const SKILL_IDS = ['crush', 'slow', 'magnet'] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export const UPGRADE_IDS = [
  'supply',
  'economy',
  'reserve',
  'shelf',
  'gift',
  'perfect',
  'brittle',
  'frost',
  'aroma',
] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface ExpeditionRules {
  readonly skillId: SkillId;
  readonly upgrades: readonly UpgradeId[];
}

export interface SkillSnapshot {
  readonly id: SkillId;
  readonly power: number;
  readonly cost: number;
  readonly available: boolean;
  readonly breakRange: number;
  readonly slowDuration: number;
  readonly magnetRange: number;
}

/** 所有配方效果先在规则层求值，HUD 和实际施法使用同一个结果。 */
export function getSkill(rules: ExpeditionRules, length: number, playing: boolean): SkillSnapshot {
  const has = (id: UpgradeId) => rules.upgrades.includes(id);
  const power = length >= 12 ? 3 : length >= 9 ? 2 : 1;
  const cost = has('economy') ? 2 : 3;
  return Object.freeze({
    id: rules.skillId,
    power,
    cost,
    available: playing && length >= cost + 3,
    breakRange: (rules.skillId === 'crush' ? power : 0) + (has('brittle') ? 1 : 0),
    slowDuration: (rules.skillId === 'slow' ? 4 + power * 4 : 0) + (has('frost') ? 4 : 0),
    magnetRange: (rules.skillId === 'magnet' ? power + 1 : 0) + (has('aroma') ? 1 : 0),
  });
}

/** 与浏览器和视觉随机源隔离；相同入口种子可以完整重放房间。 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
