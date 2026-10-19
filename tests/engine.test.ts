import { describe, expect, it, vi } from 'vitest';
import { CLASSIC_LEVEL, CLASSIC_MODE, FRUITS, getComboMultiplier } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import type { LevelDefinition, ModeDefinition } from '../src/core/types';

function level(patch: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id: 'test',
    name: '测试地图',
    cols: 8,
    rows: 8,
    obstacles: [],
    initialSnake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ],
    initialDirection: 'right',
    ...patch,
  };
}

function game(map = level(), mode = CLASSIC_MODE): GameEngine {
  const engine = new GameEngine({ level: map, mode, random: () => 0 });
  engine.dispatch({ type: 'start' });
  return engine;
}

describe('经典玩法兼容', () => {
  it('保留默认棋盘、出生位置、速度和果实配置', () => {
    const engine = game(CLASSIC_LEVEL);
    expect(engine.getSnapshot()).toMatchObject({
      status: 'playing',
      direction: 'right',
      stepMs: 150,
      score: 0,
      combo: 0,
      snake: CLASSIC_LEVEL.initialSnake,
      level: { cols: 20, rows: 20, obstacles: [] },
    });
    expect(FRUITS.map(({ type, points, weight }) => [type, points, weight])).toEqual([
      ['grape', 1, 50],
      ['strawberry', 2, 30],
      ['orange', 3, 15],
      ['watermelon', 5, 5],
    ]);
  });

  it.each([
    [0, 1],
    [1, 1],
    [2, 1.5],
    [4, 1.5],
    [5, 2],
    [10, 2],
  ])('连击 %i 对应倍率 %s，得分向下取整', (combo, multiplier) => {
    expect(getComboMultiplier(combo)).toBe(multiplier);
    for (const fruit of FRUITS) {
      expect(CLASSIC_MODE.calculatePoints({ ...fruit, x: 0, y: 0 }, combo)).toBe(
        Math.floor(fruit.points * multiplier),
      );
    }
  });

  it('进食长一格，每十连击只发一次里程碑事件', () => {
    const engine = game(level({ cols: 20, rows: 1, initialSnake: [{ x: 0, y: 0 }] }));
    const events = Array.from({ length: 10 }, () => engine.step()).flat();
    expect(engine.getSnapshot()).toMatchObject({ score: 16, combo: 10, stepMs: 150 });
    expect(engine.getSnapshot().snake).toHaveLength(11);
    expect(events.filter((event) => event.type === 'food-eaten')).toHaveLength(10);
    expect(events.filter((event) => event.type === 'combo-milestone')).toEqual([
      expect.objectContaining({ combo: 10, level: 1 }),
    ]);
  });
});

describe('方向输入', () => {
  it('同一 tick 的上、左输入分别在后两步执行，不直接反向', () => {
    const engine = game();
    engine.dispatch({ type: 'turn', direction: 'left' });
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'turn', direction: 'left' });
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 3, y: 2 });
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 2, y: 2 });
  });

  it('队列以最后一个待执行方向判断反向，并忽略重复输入', () => {
    const engine = game();
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'turn', direction: 'down' });
    engine.dispatch({ type: 'turn', direction: 'left' });
    engine.step();
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 2, y: 2 });
  });

  it('最多缓存两条转向，超出的输入不会在以后突然执行', () => {
    const engine = game();
    for (const direction of ['up', 'left', 'down'] as const)
      engine.dispatch({ type: 'turn', direction });
    engine.step();
    engine.step();
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 1, y: 2 });
  });

  it('暂停不推进，恢复和重开清空队列', () => {
    const engine = game();
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'pause' });
    const paused = engine.getSnapshot();
    expect(engine.step()).toEqual([]);
    expect(engine.getSnapshot()).toBe(paused);
    engine.dispatch({ type: 'turn', direction: 'left' });
    engine.dispatch({ type: 'resume' });
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 4, y: 3 });
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'restart' });
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({ sessionId: 2, direction: 'right', combo: 0 });
  });
});

describe('碰撞与胜利', () => {
  it('允许进入本步会移走的尾格', () => {
    const engine = game(
      level({
        initialSnake: [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 0, y: 2 },
          { x: 0, y: 1 },
        ],
        initialDirection: 'left',
      }),
    );
    engine.step();
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 0, y: 1 });
    expect(engine.getSnapshot().snake).toHaveLength(4);
  });

  it('撞到非尾部的身体会结束，结束后不再推进', () => {
    const engine = game(
      level({
        initialSnake: [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 2, y: 1 },
          { x: 3, y: 1 },
        ],
      }),
    );
    expect(engine.step()).toContainEqual({ type: 'game-ended', reason: 'body', score: 0 });
    const ended = engine.getSnapshot();
    expect(engine.step()).toEqual([]);
    expect(engine.getSnapshot()).toBe(ended);
  });

  it('区分墙体与障碍碰撞', () => {
    const wall = game(level({ cols: 4 }));
    expect(wall.step()).toContainEqual({ type: 'game-ended', reason: 'wall', score: 0 });
    const obstacle = game(level({ obstacles: [{ x: 4, y: 3 }] }));
    expect(obstacle.step()).toContainEqual({ type: 'game-ended', reason: 'obstacle', score: 0 });
  });

  it('吃掉最后一个空格后通关，不再抽取食物或随机数', () => {
    const random = vi.fn(() => 0);
    const engine = new GameEngine({
      level: level({
        cols: 3,
        rows: 1,
        initialSnake: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
      mode: CLASSIC_MODE,
      random,
    });
    engine.dispatch({ type: 'start' });
    random.mockClear();
    expect(engine.step()).toContainEqual({ type: 'game-ended', reason: 'completed', score: 1 });
    expect(engine.getSnapshot()).toMatchObject({ status: 'won', food: null, score: 1, combo: 1 });
    expect(random).not.toHaveBeenCalled();
  });

  it('障碍占用的格子不计入通关空格', () => {
    const engine = game(
      level({
        cols: 3,
        rows: 2,
        obstacles: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        initialSnake: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
    );
    engine.step();
    expect(engine.getSnapshot().status).toBe('won');
  });

  it('初始棋盘已经占满时也能直接结算', () => {
    const random = vi.fn(() => 0);
    const engine = new GameEngine({
      level: level({
        cols: 2,
        rows: 1,
        initialSnake: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
      mode: CLASSIC_MODE,
      random,
    });
    engine.dispatch({ type: 'start' });
    expect(engine.getSnapshot().status).toBe('won');
    expect(random).not.toHaveBeenCalled();
  });
});

describe('食物和配置边界', () => {
  it.each([
    [0, 'grape'],
    [0.4999, 'grape'],
    [0.5, 'strawberry'],
    [0.7999, 'strawberry'],
    [0.8, 'orange'],
    [0.9499, 'orange'],
    [0.95, 'watermelon'],
    [0.9999, 'watermelon'],
  ])('随机权重 %s 选出 %s', (weightRandom, fruitType) => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(weightRandom);
    const engine = new GameEngine({ level: level(), mode: CLASSIC_MODE, random });
    expect(engine.getSnapshot().food?.type).toBe(fruitType);
  });

  it('在任意空格采样时避开障碍与蛇身', () => {
    const map = level({
      obstacles: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    const occupied = [...map.obstacles, ...map.initialSnake];
    for (const sample of [0, 0.25, 0.5, 0.99]) {
      const engine = new GameEngine({ level: map, mode: CLASSIC_MODE, random: () => sample });
      const food = engine.getSnapshot().food;
      expect(food).not.toBeNull();
      expect(occupied.some((point) => point.x === food?.x && point.y === food.y)).toBe(false);
    }
  });

  it('零权重水果永远不会被选中', () => {
    const mode = {
      ...CLASSIC_MODE,
      fruits: [
        { type: 'disabled', points: 0, color: '#fff', weight: 0 },
        { type: 'enabled', points: 1, color: '#000', weight: 1 },
      ],
    };
    expect(game(level(), mode).getSnapshot().food?.type).toBe('enabled');
  });

  it.each([
    { cols: 0 },
    { rows: 1.5 },
    { initialSnake: [] },
    { initialSnake: [{ x: -1, y: 0 }] },
    {
      initialSnake: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
      ],
    },
    {
      initialSnake: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    },
    { obstacles: [{ x: 3, y: 3 }] },
    {
      obstacles: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    },
  ])('拒绝无效地图 %j', (patch) => {
    expect(() => game(level(patch))).toThrow('地图');
  });

  it('快照及其嵌套数据只读，外部地图变更不会修改当前局', () => {
    const segments = [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ];
    const engine = game(level({ initialSnake: segments }));
    const snapshot = engine.getSnapshot();
    if (segments[0]) segments[0].x = 99;
    expect(snapshot.snake[0]?.x).toBe(3);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.snake[0])).toBe(true);
    expect(Object.isFrozen(snapshot.level.obstacles)).toBe(true);
  });

  it.each([1, -0.01, NaN])('拒绝非法随机值 %s', (value) => {
    expect(
      () => new GameEngine({ level: level(), mode: CLASSIC_MODE, random: () => value }),
    ).toThrow('随机源');
  });

  it('拒绝无效权重、步进间隔和计分结果', () => {
    expect(() => game(level(), { ...CLASSIC_MODE, fruits: [] })).toThrow('总权重');
    expect(() => game(level(), { ...CLASSIC_MODE, getStepMs: () => 0 })).toThrow('步进间隔');
    const engine = game(
      level({
        cols: 3,
        rows: 1,
        initialSnake: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
      { ...CLASSIC_MODE, calculatePoints: () => NaN },
    );
    expect(() => engine.step()).toThrow('计分');
  });
});

describe('关卡与模式扩展', () => {
  it('矩形地图和穿墙规则复用同一个核心', () => {
    const mode: ModeDefinition = {
      ...CLASSIC_MODE,
      id: 'wrap-test',
      resolveNextPosition: (next, map) => ({
        x: (next.x + map.cols) % map.cols,
        y: (next.y + map.rows) % map.rows,
      }),
    };
    const engine = game(
      level({
        cols: 4,
        rows: 3,
        initialSnake: [
          { x: 3, y: 1 },
          { x: 2, y: 1 },
        ],
      }),
      mode,
    );
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', modeId: 'wrap-test' });
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 0, y: 1 });
  });

  it('模式可替换分数和速度策略，无需修改引擎', () => {
    const mode: ModeDefinition = {
      ...CLASSIC_MODE,
      id: 'policy-test',
      calculatePoints: (food) => food.points * 7,
      getStepMs: (context) => 150 - context.combo * 5,
    };
    const engine = game(level({ cols: 5, rows: 1, initialSnake: [{ x: 0, y: 0 }] }), mode);
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({ score: 7, combo: 1, stepMs: 145 });
  });
});
