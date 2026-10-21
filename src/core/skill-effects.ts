import { isInside } from './level';
import { DIRECTION_VECTORS, samePosition } from './types';
import type { Direction, GameSnapshot, ModeDefinition, Position, SkillPreview } from './types';
import type { SkillSnapshot } from './expedition';

export const OPPOSITE: Readonly<Record<Direction, Direction>> = Object.freeze({
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
});

/** Pure effect projection. Both preview and commit consume this result; no RNG is sampled. */
export function resolveSkillEffects(
  state: GameSnapshot,
  skill: SkillSnapshot,
  direction: Direction,
  mapNext: ModeDefinition['resolveNextPosition'],
): SkillPreview {
  const head = state.snake[0];
  if (!head) throw new Error('Skill requires a head');
  const vector = DIRECTION_VECTORS[direction];
  const at = (distance: number): Position => ({
    x: head.x + vector.x * distance,
    y: head.y + vector.y * distance,
  });
  const solid = (p: Position) => state.level.obstacles.some((wall) => samePosition(wall, p));
  const fragile = state.fragileObstacles ?? [];
  const range: Position[] = [];
  const broken: Position[] = [];
  for (let d = 1; d <= skill.breakRange; d += 1) {
    const point = at(d);
    if (!isInside(point, state.level) || solid(point)) break;
    range.push(point);
    if (fragile.some((wall) => samePosition(wall, point))) broken.push(point);
  }
  const remaining = fragile.filter((wall) => !broken.some((point) => samePosition(point, wall)));
  const blocked = (p: Position) => solid(p) || remaining.some((wall) => samePosition(wall, p));
  let captured = null;
  for (let d = 1; d <= skill.magnetRange; d += 1) {
    const point = at(d);
    if (!isInside(point, state.level) || blocked(point)) break;
    if (!range.some((p) => samePosition(p, point))) range.push(point);
    const food = state.foods.find((item) => samePosition(item, point));
    if (food) {
      captured = food;
      break;
    }
  }
  const next = mapNext(at(1), state.level);
  const body = state.snake.slice(0, -skill.cost);
  const grows =
    !!captured ||
    (state.growthPending ?? 0) > 0 ||
    state.foods.some((food) => samePosition(food, next));
  const retained = grows ? body : body.slice(0, -1);
  const danger = !isInside(next, state.level)
    ? 'wall'
    : blocked(next)
      ? 'obstacle'
      : retained.some((p) => samePosition(p, next))
        ? 'body'
        : null;
  const freezePoints = (points: readonly Position[]) =>
    Object.freeze(points.map((p) => Object.freeze({ ...p })));
  return Object.freeze({
    direction,
    range: freezePoints(range),
    broken: freezePoints(broken),
    captured,
    next: Object.freeze({ ...next }),
    danger,
  });
}
