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
    name: '破岩',
    icon: '✦',
    description: '击碎前方裂岩。',
    detail: '破坏所选方向 1 / 2 / 3 格内的裂岩。完整陨石会挡住光束。',
  },
  {
    id: 'slow',
    name: '缓时',
    icon: '❄',
    description: '释放后，暂时放慢移动。',
    detail: '移动变为 225ms / 步，持续 8 / 12 / 16 步。',
  },
  {
    id: 'magnet',
    name: '牵引',
    icon: '◎',
    description: '吸取前方第一颗星核。',
    detail: '吸取所选方向 2 / 3 / 4 格内第一颗星核。陨石会阻挡牵引，身体不会。',
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
    name: '额外生长',
    icon: '✚',
    description: '每收集 3 颗星核，多长 1 节。上限 12 节，每区重新计数。',
  },
  {
    id: 'economy',
    name: '节能',
    icon: 'Ⅱ',
    description: 'Q 只消耗 2 节身体，仍至少保留 3 节。',
  },
  {
    id: 'reserve',
    name: '备用能量',
    icon: '▰',
    description: '进入下一房间时，身体至少恢复到 6 节。',
  },
  {
    id: 'shelf',
    name: '更多星核',
    icon: '▦',
    description: '星盘上同时出现的星核从 3 颗增加到 4 颗。',
  },
  {
    id: 'gift',
    name: '双份收集',
    icon: '◇',
    description: '每区收集的首颗目标星核，按 2 颗计算。',
  },
  {
    id: 'perfect',
    name: '无伤补给',
    icon: '♡',
    description: '首次尝试就通过本区，恢复 1 颗心。上限 3 颗。',
  },
  {
    id: 'brittle',
    name: '附带破岩',
    icon: '✦',
    description: 'Q 附带前方 1 格破岩；破岩的距离额外 +1。',
  },
  {
    id: 'frost',
    name: '附带缓时',
    icon: '❄',
    description: 'Q 附带 4 步减速；缓时的持续时间额外 +4 步。',
  },
  {
    id: 'aroma',
    name: '附带牵引',
    icon: '◎',
    description: 'Q 附带前方 1 格牵引；牵引的距离额外 +1。',
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
    chapter: '第一星区',
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
    '出发地',
    '收集带角标的星核。收齐后进入星门。',
    [],
    row(7, 7, 9),
    order(2, 2, 1),
  ),
  room(
    'shelves-a',
    '碎石带',
    '从缺口绕过陨石，先收集带角标的星核。',
    [...wall(5, 2, 10, 6), ...wall(10, 3, 11, 8)],
    row(6, 7, 9),
    order(2, 3, 2),
  ),
  room(
    'shelves-b',
    '双环之间',
    '缺口相互错开，星门在右上方。',
    [...wall(6, 2, 10, 4), ...wall(11, 3, 11, 8)],
    row(8, 8, 10),
    order(2, 3, 2),
  ),
  room(
    'shortcut-a',
    '裂岩捷径',
    '裂岩可以击碎，也可以从缺口绕行。',
    [...wall(5, 2, 11, 8), ...wall(10, 2, 11, 4)],
    row(6, 6, 9),
    order(2, 3, 3, 1),
  ),
  room(
    'shortcut-b',
    '岔路',
    '施法需要身体，先想好下一次转向。',
    [...wall(4, 2, 11, 5), ...wall(11, 2, 11, 9)],
    row(7, 5, 10),
    order(2, 3, 3, 1),
  ),
  room(
    'ribbons-a',
    '狭长航道',
    '身体越长，技能越强，转弯也更难。',
    [...wall(4, 1, 10, 6), ...wall(8, 3, 11, 7), ...wall(12, 1, 10, 4)],
    row(5, 9, 11),
    order(3, 3, 3, 1),
  ),
  room(
    'ribbons-b',
    '回转航道',
    '绕过尾巴，留一条返回星门的路。',
    [...wall(4, 2, 11, 8), ...wall(8, 1, 10, 4), ...wall(12, 2, 11, 7)],
    row(6, 5, 7),
    order(3, 3, 3, 1),
  ),
  room(
    'mix-a',
    '交汇处',
    '附带效果会与主动技能一起释放。',
    [...wall(5, 1, 11, 5), ...wall(10, 2, 11, 8)],
    row(7, 6, 9),
    order(3, 4, 3, 2),
  ),
  room(
    'mix-b',
    '星环之间',
    '观察裂岩和缺口，选择适合当前技能的路。',
    [...wall(6, 1, 11, 7), ...wall(11, 2, 11, 4)],
    row(5, 7, 10),
    order(3, 4, 3, 2),
  ),
  room(
    'dispatch',
    '最后一站',
    '收齐最后一批星核，穿过星门。',
    [...wall(5, 2, 11, 7), ...wall(10, 2, 12, 5), ...wall(14, 3, 13, 9)],
    row(8, 6, 9).concat(row(6, 11, 13)),
    order(4, 5, 4, 2),
    18,
  ),
];

export function getRoom(seed: number, roomIndex: number): RoomDefinition {
  if (!Number.isInteger(roomIndex) || roomIndex < 0 || roomIndex > 5)
    throw new Error('Invalid room index');
  const variant = Math.floor(createSeededRandom((seed + roomIndex * 7919) >>> 0)() * 2);
  const index = roomIndex === 0 ? 0 : roomIndex === 5 ? 9 : 1 + (roomIndex - 1) * 2 + variant;
  const result = ROOMS[index];
  if (!result) throw new Error('Missing room definition');
  return result;
}
export function makeRoomLevel(room: RoomDefinition, length: number): LevelDefinition {
  return { ...room.level, initialSnake: BIRTH_PATH.slice(0, Math.max(3, Math.min(12, length))) };
}
export function makeExpeditionMode(rules: ExpeditionRules): ModeDefinition {
  return {
    ...CAMPAIGN_MODE,
    id: 'expedition',
    name: '星蛇远征',
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
