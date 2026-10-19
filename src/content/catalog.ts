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
  foodCount: 1,
  victoryCondition: 'fill-board',
  tailCut: null,
  resolveNextPosition: (next) => next,
  calculatePoints: (food, combo) => Math.floor(food.points * getComboMultiplier(combo)),
  getStepMs: () => 150,
};

/** 内容按 id 注册；在入口选择组合，游戏核心和表现层无需修改。 */
export const CAMPAIGN_MODE: ModeDefinition = {
  ...CLASSIC_MODE,
  id: 'campaign',
  name: '糖果闯关',
  foodCount: 3,
  victoryCondition: 'orders-and-exit',
  tailCut: { segments: 3, minimumLength: 3 },
};

function verticalWall(x: number, first: number, last: number, gap: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => ({ x, y: first + index })).filter(
    (point) => point.y !== gap,
  );
}

function initialSnake(x: number, y: number) {
  return [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
  ];
}

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = [
  {
    id: 'garden',
    name: '糖果草地',
    cols: 16,
    rows: 16,
    obstacles: [],
    initialSnake: initialSnake(4, 8),
    initialDirection: 'right',
    order: [
      { fruitType: 'strawberry', required: 2 },
      { fruitType: 'orange', required: 1 },
    ],
    exit: { x: 14, y: 1 },
  },
  {
    id: 'courtyard',
    name: '巧克力庭院',
    cols: 16,
    rows: 16,
    obstacles: [...verticalWall(5, 3, 10, 7), ...verticalWall(10, 5, 12, 9)],
    initialSnake: initialSnake(3, 13),
    initialDirection: 'right',
    order: [
      { fruitType: 'grape', required: 2 },
      { fruitType: 'strawberry', required: 2 },
      { fruitType: 'orange', required: 2 },
    ],
    exit: { x: 14, y: 1 },
  },
  {
    id: 'alleys',
    name: '糖果小巷',
    cols: 12,
    rows: 12,
    obstacles: [
      ...verticalWall(3, 0, 8, 6),
      ...verticalWall(9, 0, 8, 6),
      ...verticalWall(6, 3, 10, 5),
    ],
    initialSnake: initialSnake(3, 11),
    initialDirection: 'right',
    order: [
      { fruitType: 'grape', required: 2 },
      { fruitType: 'strawberry', required: 3 },
      { fruitType: 'orange', required: 2 },
      { fruitType: 'watermelon', required: 1 },
    ],
    exit: { x: 10, y: 1 },
  },
];

export const LEVELS: Readonly<Record<string, LevelDefinition>> = Object.fromEntries(
  [CLASSIC_LEVEL, ...CAMPAIGN_LEVELS].map((level) => [level.id, level]),
);
export const MODES: Readonly<Record<string, ModeDefinition>> = {
  classic: CLASSIC_MODE,
  campaign: CAMPAIGN_MODE,
};

export const FRUIT_LABELS: Readonly<Record<string, string>> = {
  grape: '葡萄',
  strawberry: '草莓',
  orange: '橙子',
  watermelon: '西瓜',
};
export const FRUIT_ICONS: Readonly<Record<string, string>> = {
  grape: '🍇',
  strawberry: '🍓',
  orange: '🍊',
  watermelon: '🍉',
};

export const DEFAULT_SELECTION = Object.freeze({ levelId: 'classic', modeId: 'classic' });
