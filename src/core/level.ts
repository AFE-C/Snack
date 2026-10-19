import { DIRECTION_VECTORS, positionKey, samePosition } from './types';
import type { LevelDefinition, Position } from './types';

export function isInside(position: Position, level: LevelDefinition): boolean {
  return position.x >= 0 && position.x < level.cols && position.y >= 0 && position.y < level.rows;
}

export function isGridPosition(position: Position): boolean {
  return Number.isSafeInteger(position.x) && Number.isSafeInteger(position.y);
}

/** 在启动时拒绝错误地图，让内容配置错误不会变成运行中的死循环。 */
export function prepareLevel(source: LevelDefinition): LevelDefinition {
  const fail = (message: string): never => {
    throw new Error(`地图「${source.id}」无效：${message}`);
  };
  if (!source.id.trim()) fail('id 不能为空');
  if (
    !Number.isSafeInteger(source.cols) ||
    !Number.isSafeInteger(source.rows) ||
    source.cols <= 0 ||
    source.rows <= 0
  ) {
    fail('棋盘宽高必须为正整数');
  }
  if (source.initialSnake.length === 0) fail('至少需要一节蛇身');
  const occupied = new Set<string>();
  for (const position of [...source.obstacles, ...source.initialSnake]) {
    if (!isGridPosition(position) || !isInside(position, source)) fail('障碍或蛇身超出棋盘');
    const key = positionKey(position);
    if (occupied.has(key)) fail('障碍或蛇身发生重叠');
    occupied.add(key);
  }
  for (let index = 1; index < source.initialSnake.length; index += 1) {
    const current = source.initialSnake[index];
    const previous = source.initialSnake[index - 1];
    if (
      current &&
      previous &&
      Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y) !== 1
    ) {
      fail('蛇身必须按相邻网格从头到尾排列');
    }
  }
  const head = source.initialSnake[0];
  const neck = source.initialSnake[1];
  const vector = DIRECTION_VECTORS[source.initialDirection];
  if (head && neck && samePosition({ x: head.x + vector.x, y: head.y + vector.y }, neck)) {
    fail('初始方向不能朝向颈部');
  }
  return Object.freeze({
    ...source,
    obstacles: Object.freeze(source.obstacles.map((point) => Object.freeze({ ...point }))),
    initialSnake: Object.freeze(source.initialSnake.map((point) => Object.freeze({ ...point }))),
  });
}
