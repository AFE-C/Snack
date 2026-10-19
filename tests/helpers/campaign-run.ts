import { DIRECTION_VECTORS, positionKey } from '../../src/core/types';
import type { Direction, GameCommand, GameSnapshot, Position } from '../../src/core/types';

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export interface CampaignDriver {
  getSnapshot(): GameSnapshot;
  dispatch(command: GameCommand): unknown;
  step(): unknown;
}

/** 根据公开快照规划，所有动作走正式指令入口，不改动引擎内部状态。 */
export function nextRoute(snapshot: GameSnapshot): Direction[] | null {
  const head = snapshot.snake[0];
  if (!head) return null;
  const needed = new Set(
    snapshot.orderProgress
      .filter((item) => item.collected < item.required)
      .map((item) => item.fruitType),
  );
  const targets =
    snapshot.exitActive && snapshot.level.exit
      ? [snapshot.level.exit]
      : snapshot.foods.filter((food) => needed.has(food.type));
  const goals = new Set(targets.map(positionKey));
  const occupied = new Set(
    [...snapshot.level.obstacles, ...snapshot.snake.slice(0, -1)].map(positionKey),
  );
  // 避免沿路误吃非目标水果，让测试路线只验证有意的收集。
  for (const food of snapshot.foods)
    if (!goals.has(positionKey(food))) occupied.add(positionKey(food));
  const pending: { point: Position; route: Direction[] }[] = [{ point: head, route: [] }];
  const visited = new Set([positionKey(head)]);
  for (let index = 0; index < pending.length; index += 1) {
    const node = pending[index];
    if (!node) continue;
    if (goals.has(positionKey(node.point)) && node.route.length > 0) return node.route;
    for (const [direction, vector] of Object.entries(DIRECTION_VECTORS) as [
      Direction,
      Position,
    ][]) {
      const current = DIRECTION_VECTORS[snapshot.direction];
      if (node.route.length === 0 && vector.x === -current.x && vector.y === -current.y) continue;
      const next = { x: node.point.x + vector.x, y: node.point.y + vector.y };
      const key = positionKey(next);
      if (
        next.x < 0 ||
        next.x >= snapshot.level.cols ||
        next.y < 0 ||
        next.y >= snapshot.level.rows ||
        occupied.has(key) ||
        visited.has(key)
      )
        continue;
      visited.add(key);
      pending.push({ point: next, route: [...node.route, direction] });
    }
  }
  return routeWithMovingBody(snapshot, goals);
}

/** 静态路线被自身挡住时，验证绕行等待尾部移走的真实移动序列。 */
function routeWithMovingBody(
  snapshot: GameSnapshot,
  goals: ReadonlySet<string>,
): Direction[] | null {
  const walls = new Set(snapshot.level.obstacles.map(positionKey));
  for (const food of snapshot.foods)
    if (!goals.has(positionKey(food))) walls.add(positionKey(food));
  const queue = [
    { snake: snapshot.snake, direction: snapshot.direction, route: [] as Direction[] },
  ];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length && index < 50000; index += 1) {
    const node = queue[index];
    const head = node?.snake[0];
    if (!node || !head) continue;
    if (node.route.length > 0 && goals.has(positionKey(head))) return node.route;
    for (const [direction, offset] of Object.entries(DIRECTION_VECTORS) as [
      Direction,
      Position,
    ][]) {
      const previous = DIRECTION_VECTORS[node.direction];
      if (offset.x === -previous.x && offset.y === -previous.y) continue;
      const next = { x: head.x + offset.x, y: head.y + offset.y };
      const key = positionKey(next);
      const eating = snapshot.foods.some((food) => positionKey(food) === key);
      const body = eating ? node.snake : node.snake.slice(0, -1);
      if (
        next.x < 0 ||
        next.x >= snapshot.level.cols ||
        next.y < 0 ||
        next.y >= snapshot.level.rows ||
        walls.has(key) ||
        body.some((point) => positionKey(point) === key)
      )
        continue;
      const snake = [next, ...body];
      const stateKey = `${direction}:${snake.map(positionKey).join(';')}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      queue.push({ snake, direction, route: [...node.route, direction] });
    }
  }
  return null;
}

export function runCampaign(driver: CampaignDriver, cutWhenAvailable = false) {
  const commands: GameCommand[] = [];
  let cuts = 0;
  const send = (command: GameCommand) => {
    commands.push(command);
    driver.dispatch(command);
  };
  send({ type: 'start' });
  for (let steps = 0; steps < 10000 && driver.getSnapshot().status === 'playing'; steps += 1) {
    if (cutWhenAvailable && driver.getSnapshot().canCutTail) {
      send({ type: 'cut-tail' });
      cuts += 1;
    }
    let route = nextRoute(driver.getSnapshot());
    if (!route && driver.getSnapshot().canCutTail) {
      send({ type: 'cut-tail' });
      cuts += 1;
      route = nextRoute(driver.getSnapshot());
    }
    const direction = route?.[0];
    if (!direction) throw new Error(`测试路线不可达：${JSON.stringify(driver.getSnapshot())}`);
    send({ type: 'turn', direction });
    driver.step();
  }
  if (driver.getSnapshot().status !== 'won')
    throw new Error(`未通关：${driver.getSnapshot().status}`);
  return { commands, cuts, snapshot: driver.getSnapshot() };
}
