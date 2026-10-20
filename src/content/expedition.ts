import { CAMPAIGN_MODE } from './catalog';
import type { LevelDefinition, ModeDefinition, Position } from '../core/types';
import { createSeededRandom } from '../core/expedition';
import type { ExpeditionRules, SkillId, UpgradeId } from '../core/expedition';

export interface ActiveSkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly detail: string;
}
export const SKILLS: readonly ActiveSkillDefinition[] = [
  {
    id: 'crush',
    name: '脆糖冲击',
    icon: '✦',
    description: '断尾，打开一条新路。',
    detail: '破坏前方 1 / 2 / 3 格内的脆巧克力墙。裂纹表示可破坏，实心墙会阻挡技能。',
  },
  {
    id: 'slow',
    name: '冰糖缓流',
    icon: '❄',
    description: '放慢脚步，留出思考时间。',
    detail: '移动暂时变为 225ms / 步，持续 8 / 12 / 16 步。暂停时效果冻结。',
  },
  {
    id: 'magnet',
    name: '果香牵引',
    icon: '◎',
    description: '隔着空格，把水果带回来。',
    detail: '吸取正前方 2 / 3 / 4 格内第一颗水果。墙会挡住果香，身体不会。',
  },
];
export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
}
export const UPGRADES: readonly UpgradeDefinition[] = [
  {
    id: 'supply',
    name: '糖衣补给',
    icon: '✚',
    description: '每吃 3 颗水果，额外长 1 节。最多 12 节，每房间重新计数。',
  },
  {
    id: 'economy',
    name: '节省配方',
    icon: 'Ⅱ',
    description: 'Q 只消耗 2 节身体，仍至少保留 3 节。',
  },
  {
    id: 'reserve',
    name: '备用糖衣',
    icon: '▰',
    description: '进入下一房间时，身体至少恢复到 6 节。',
  },
  {
    id: 'shelf',
    name: '加大货架',
    icon: '▦',
    description: '棋盘最多同时出现 4 颗水果，增加路线选择。',
  },
  {
    id: 'gift',
    name: '订单赠品',
    icon: '◇',
    description: '每房间首颗目标水果，额外完成 1 份同类需求。',
  },
  {
    id: 'perfect',
    name: '完美配送',
    icon: '♡',
    description: '房间首次尝试就通关，恢复 1 颗心。最多 3 颗。',
  },
  {
    id: 'brittle',
    name: '脆化涂层',
    icon: '✦',
    description: 'Q 附带前方 1 格破墙；脆糖冲击的距离额外 +1。',
  },
  {
    id: 'frost',
    name: '冰糖余韵',
    icon: '❄',
    description: 'Q 附带 4 步减速；冰糖缓流的持续时间额外 +4 步。',
  },
  {
    id: 'aroma',
    name: '果香余波',
    icon: '◎',
    description: 'Q 附带前方 1 格吸果；果香牵引的距离额外 +1。',
  },
];

export interface RoomDefinition {
  readonly level: LevelDefinition;
  readonly chapter: string;
  readonly lesson: string;
}

const BIRTH_PATH: readonly Position[] = [
  { x: 5, y: 13 },
  { x: 4, y: 13 },
  { x: 3, y: 13 },
  { x: 2, y: 13 },
  { x: 1, y: 13 },
  { x: 1, y: 14 },
  { x: 2, y: 14 },
  { x: 3, y: 14 },
  { x: 4, y: 14 },
  { x: 5, y: 14 },
  { x: 6, y: 14 },
  { x: 7, y: 14 },
];
const wall = (x: number, from: number, to: number, gap: number): Position[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x, y: from + i })).filter((p) => p.y !== gap);
const row = (y: number, from: number, to: number): Position[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, y }));
const order = (grape: number, strawberry: number, orange: number, watermelon = 0) =>
  Object.entries({ grape, strawberry, orange, watermelon })
    .filter(([, n]) => n > 0)
    .map(([fruitType, required]) => ({ fruitType, required }));
function room(
  id: string,
  name: string,
  lesson: string,
  obstacles: Position[],
  fragile: Position[],
  demands: ReturnType<typeof order>,
  size = 16,
): RoomDefinition {
  return {
    chapter: '巧克力工坊',
    lesson,
    level: {
      id,
      name,
      cols: size,
      rows: size,
      obstacles,
      fragileObstacles: fragile,
      initialSnake: BIRTH_PATH.slice(0, 6),
      initialDirection: 'right',
      order: demands,
      exit: { x: size - 2, y: 1 },
    },
  };
}

/** 每个常规房间有两个手工变体；外围主路始终保留给三种配方。 */
export const ROOMS: readonly RoomDefinition[] = [
  room(
    'workshop-entry',
    '第一份配方',
    '收集带角标的水果；Q 消耗身体施法。',
    [],
    row(7, 7, 9),
    order(2, 2, 1),
  ),
  room(
    'shelves-a',
    '绕过货架',
    '试着先决定路线，再决定要吃的水果。',
    [...wall(5, 2, 10, 6), ...wall(10, 3, 11, 8)],
    row(6, 7, 9),
    order(2, 3, 2),
  ),
  room(
    'shelves-b',
    '糖纸回廊',
    '缺口相互错开，出口在右上方。',
    [...wall(6, 2, 10, 4), ...wall(11, 3, 11, 8)],
    row(8, 8, 10),
    order(2, 3, 2),
  ),
  room(
    'shortcut-a',
    '巧克力捷径',
    '裂纹墙可以被破坏；绕行也能送达。',
    [...wall(5, 2, 11, 8), ...wall(10, 2, 11, 4)],
    row(6, 6, 9),
    order(2, 3, 3, 1),
  ),
  room(
    'shortcut-b',
    '脆糖夹层',
    '用技能缩短路线，记得为后面留下身体。',
    [...wall(4, 2, 11, 5), ...wall(11, 2, 11, 9)],
    row(7, 5, 10),
    order(2, 3, 3, 1),
  ),
  room(
    'ribbons-a',
    '长长的糖衣',
    '身体既能挡住回路，也能储备多次施法。',
    [...wall(4, 1, 10, 6), ...wall(8, 3, 11, 7), ...wall(12, 1, 10, 4)],
    row(5, 9, 11),
    order(3, 3, 3, 1),
  ),
  room(
    'ribbons-b',
    '糖带交错',
    '绕过尾巴，保留一条返回出口的路。',
    [...wall(4, 2, 11, 8), ...wall(8, 1, 10, 4), ...wall(12, 2, 11, 7)],
    row(6, 5, 7),
    order(3, 3, 3, 1),
  ),
  room(
    'mix-a',
    '配方试验台',
    '试着组合升级，让一次 Q 完成多件事。',
    [...wall(5, 1, 11, 5), ...wall(10, 2, 11, 8)],
    row(7, 6, 9),
    order(3, 4, 3, 2),
  ),
  room(
    'mix-b',
    '混合糖坊',
    '选择适合当前构筑的通路。',
    [...wall(6, 1, 11, 7), ...wall(11, 2, 11, 4)],
    row(5, 7, 10),
    order(3, 4, 3, 2),
  ),
  room(
    'dispatch',
    '最后一箱糖',
    '完成大订单，把这一整套配方送出工坊。',
    [...wall(5, 2, 11, 7), ...wall(10, 2, 12, 5), ...wall(14, 3, 13, 9)],
    row(8, 6, 9).concat(row(6, 11, 13)),
    order(4, 5, 4, 2),
    18,
  ),
];

export function getRoom(seed: number, roomIndex: number): RoomDefinition {
  if (roomIndex === 0) return ROOMS[0] as RoomDefinition;
  if (roomIndex === 5) return ROOMS[9] as RoomDefinition;
  const variant = Math.floor(createSeededRandom((seed + roomIndex * 7919) >>> 0)() * 2);
  return ROOMS[1 + (roomIndex - 1) * 2 + variant] as RoomDefinition;
}
export function makeRoomLevel(room: RoomDefinition, length: number): LevelDefinition {
  return { ...room.level, initialSnake: BIRTH_PATH.slice(0, Math.max(3, Math.min(12, length))) };
}
export function makeExpeditionMode(rules: ExpeditionRules): ModeDefinition {
  return {
    ...CAMPAIGN_MODE,
    id: 'expedition',
    name: '糖果远征',
    foodCount: rules.upgrades.includes('shelf') ? 4 : 3,
    expedition: rules,
  };
}
export function getUpgradeChoices(
  seed: number,
  roomIndex: number,
  owned: readonly UpgradeId[],
): readonly UpgradeId[] {
  const random = createSeededRandom((seed ^ ((roomIndex + 1) * 2654435761)) >>> 0);
  const pool = UPGRADES.filter((item) => !owned.includes(item.id)).map((item) => item.id);
  const choices: UpgradeId[] = [];
  while (choices.length < 3 && pool.length) {
    const item = pool.splice(Math.floor(random() * pool.length), 1)[0];
    if (item) choices.push(item);
  }
  return choices;
}
