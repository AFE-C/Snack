import type { FruitDefinition, LevelDefinition, ModeDefinition } from '../core/types';

export const FRUITS: readonly FruitDefinition[] = Object.freeze([
  { type: 'grape', color: '#8b5cf6', points: 1, weight: 50 },
  { type: 'strawberry', color: '#ef4444', points: 2, weight: 30 },
  { type: 'orange', color: '#f97316', points: 3, weight: 15 },
  { type: 'watermelon', color: '#22c55e', points: 5, weight: 5 },
]);

export function getComboMultiplier(combo: number): number {
  if (combo >= 5) return 2;
  if (combo >= 2) return 1.5;
  return 1;
}

export const CLASSIC_LEVEL: LevelDefinition = {
  id: 'classic',
  name: '糖果花园',
  cols: 20,
  rows: 20,
  obstacles: [],
  initialSnake: [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ],
  initialDirection: 'right',
};

export const CLASSIC_MODE: ModeDefinition = {
  id: 'classic',
  name: '经典模式',
  fruits: FRUITS,
  resolveNextPosition: (next) => next,
  calculatePoints: (food, combo) => Math.floor(food.points * getComboMultiplier(combo)),
  getStepMs: () => 150,
};

/** 内容按 id 注册；在入口选择组合，游戏核心和表现层无需修改。 */
export const LEVELS: Readonly<Record<string, LevelDefinition>> = { classic: CLASSIC_LEVEL };
export const MODES: Readonly<Record<string, ModeDefinition>> = { classic: CLASSIC_MODE };

export const DEFAULT_SELECTION = Object.freeze({ levelId: 'classic', modeId: 'classic' });
