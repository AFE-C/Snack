import { describe, expect, it } from 'vitest';
import { ExpeditionRun } from '../src/app/expedition-run';
import { getSkill } from '../src/core/expedition';
import { resolveSkillEffects } from '../src/core/skill-effects';

describe('技能预览的边界', () => {
  const base = ExpeditionRun.start('magnet', 42).createEngine().getSnapshot();
  const identity = (p: { x: number; y: number }) => p;
  const head = base.snake[0];
  if (!head) throw new Error('Missing head');
  const wall = { x: head.x + 1, y: head.y },
    food = { x: head.x + 2, y: head.y, type: 'grape', color: '#fff', points: 1 };
  it('裂岩阻挡牵引时，范围不会越过裂岩', () => {
    const snapshot = { ...base, foods: [food], fragileObstacles: [wall] };
    const result = resolveSkillEffects(
      snapshot,
      getSkill({ skillId: 'magnet', upgrades: [] }, 6, true),
      'right',
      identity,
    );
    expect(result.captured).toBeNull();
    expect(result.range).toEqual([]);
    expect(result.danger).toBe('obstacle');
  });
  it('附带破岩先清理阻挡，再预测牵引；投影不改变状态', () => {
    const snapshot = { ...base, foods: [food], fragileObstacles: [wall] };
    const result = resolveSkillEffects(
      snapshot,
      getSkill({ skillId: 'magnet', upgrades: ['brittle'] }, 6, true),
      'right',
      identity,
    );
    expect(result.broken).toEqual([wall]);
    expect(result.captured).toEqual(food);
    expect(result.danger).toBeNull();
    expect(snapshot.fragileObstacles).toEqual([wall]);
    expect(Object.isFrozen(result.range)).toBe(true);
  });
  it.each([0, 1])('预测下一格时正确处理待生长 %i 与即将移走的尾格', (growthPending) => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
    ];
    const snapshot = { ...base, snake, foods: [], fragileObstacles: [], growthPending };
    const result = resolveSkillEffects(
      snapshot,
      getSkill({ skillId: 'slow', upgrades: [] }, 7, true),
      'up',
      identity,
    );
    expect(result.next).toEqual({ x: 5, y: 4 });
    expect(result.danger).toBe(growthPending ? 'body' : null);
  });
});
