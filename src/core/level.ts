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
  if (source.order !== undefined || source.exit !== undefined) {
    if (!source.order?.length || !source.exit) fail('订单与出口必须同时配置');
    const exit = source.exit;
    if (
      !exit ||
      !isGridPosition(exit) ||
      !isInside(exit, source) ||
      occupied.has(positionKey(exit))
    ) {
      fail('出口必须位于未被占用的有效格子');
    }
    const fruitTypes = new Set<string>();
    for (const item of source.order ?? []) {
      if (
        !item.fruitType.trim() ||
        fruitTypes.has(item.fruitType) ||
        !Number.isSafeInteger(item.required) ||
        item.required <= 0
      ) {
        fail('订单需要不重复的水果类型和正整数数量');
      }
      fruitTypes.add(item.fruitType);
    }
    // 所有可走格都应从出生点可达，避免水果刷在封闭区域。
    const walls = new Set(source.obstacles.map(positionKey));
    const reached = new Set<string>();
    const pending: Position[] = head ? [head] : [];
    for (let index = 0; index < pending.length; index += 1) {
      const point = pending[index];
      if (!point) continue;
      const key = positionKey(point);
      if (reached.has(key)) continue;
      reached.add(key);
      for (const offset of Object.values(DIRECTION_VECTORS)) {
        const next = { x: point.x + offset.x, y: point.y + offset.y };
        if (
          isInside(next, source) &&
          !walls.has(positionKey(next)) &&
          !reached.has(positionKey(next))
        )
          pending.push(next);
      }
    }
    if (reached.size !== source.cols * source.rows - walls.size) fail('订单地图存在不可达区域');
  }
  return Object.freeze({
    ...source,
    obstacles: Object.freeze(source.obstacles.map((point) => Object.freeze({ ...point }))),
    initialSnake: Object.freeze(source.initialSnake.map((point) => Object.freeze({ ...point }))),
    ...(source.order
      ? { order: Object.freeze(source.order.map((item) => Object.freeze({ ...item }))) }
      : {}),
    ...(source.exit ? { exit: Object.freeze({ ...source.exit }) } : {}),
  });
}
