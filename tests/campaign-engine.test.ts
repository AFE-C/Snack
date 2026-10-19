import { describe, expect, it, vi } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  CAMPAIGN_MODE,
  CLASSIC_LEVEL,
  CLASSIC_MODE,
} from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import type { LevelDefinition, ModeDefinition } from '../src/core/types';
import { runCampaign, seededRandom } from './helpers/campaign-run';

function line(patch: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    id: 'order-test',
    name: '订单测试',
    cols: 12,
    rows: 1,
    obstacles: [],
    initialSnake: [
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
    initialDirection: 'right',
    order: [{ fruitType: 'orange', required: 2 }],
    exit: { x: 11, y: 0 },
    ...patch,
  };
}
function start(level = line(), mode = CAMPAIGN_MODE) {
  const engine = new GameEngine({ level, mode, random: () => 0 });
  engine.dispatch({ type: 'start' });
  return engine;
}
function longSnake(length: number): LevelDefinition {
  return line({
    cols: 20,
    rows: 4,
    initialSnake: Array.from({ length }, (_, i) => ({ x: length - i - 1, y: 2 })),
    exit: { x: 19, y: 0 },
    order: [{ fruitType: 'grape', required: 100 }],
  });
}

describe('订单与补货', () => {
  it('任意顺序收集，已完成项再次吃到不会超过要求数量', () => {
    const engine = start(
      line({
        order: [
          { fruitType: 'grape', required: 1 },
          { fruitType: 'orange', required: 1 },
        ],
      }),
    );
    engine.step();
    engine.step();
    expect(engine.getSnapshot().orderProgress).toEqual([
      { fruitType: 'grape', required: 1, collected: 1 },
      { fruitType: 'orange', required: 1, collected: 0 },
    ]);
    // 调整合法水果配置，让订单中排第二的西瓜先被收集。
    const reverseMode = { ...CAMPAIGN_MODE, fruits: [...CAMPAIGN_MODE.fruits].reverse() };
    const reverse = start(
      line({
        order: [
          { fruitType: 'grape', required: 1 },
          { fruitType: 'watermelon', required: 1 },
        ],
      }),
      reverseMode,
    );
    reverse.step();
    expect(reverse.getSnapshot().orderProgress).toEqual([
      { fruitType: 'grape', required: 1, collected: 0 },
      { fruitType: 'watermelon', required: 1, collected: 1 },
    ]);
  });
  it('三颗水果互不重叠且避开蛇身、障碍与出口，至少一颗是目标', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const engine = new GameEngine({ level, mode: CAMPAIGN_MODE, random: () => 0 });
      const state = engine.getSnapshot();
      const keys = state.foods.map((food) => `${food.x},${food.y}`);
      const occupied = [
        ...level.obstacles,
        ...level.initialSnake,
        ...(level.exit ? [level.exit] : []),
      ].map((p) => `${p.x},${p.y}`);
      expect(keys).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
      expect(keys.some((key) => occupied.includes(key))).toBe(false);
      expect(
        state.foods.some((food) => level.order?.some((item) => item.fruitType === food.type)),
      ).toBe(true);
    }
  });

  it('非目标水果加分增长但不推进订单，沿用水果与连击计分', () => {
    const engine = start();
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({
      score: 1,
      combo: 1,
      orderProgress: [{ fruitType: 'orange', collected: 0, required: 2 }],
    });
    expect(engine.getSnapshot().snake).toHaveLength(4);
    engine.step();
    expect(engine.getSnapshot().score).toBe(2);
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({
      score: 6,
      combo: 3,
      exitActive: false,
      orderProgress: [{ collected: 1 }],
    });
    // 吃完唯一目标后，剩余非目标中必须替换出一颗橙子。
    expect(engine.getSnapshot().foods.some((food) => food.type === 'orange')).toBe(true);
    engine.step();
    engine.step();
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({
      score: 15,
      combo: 6,
      exitActive: true,
      foods: [],
      status: 'playing',
      orderProgress: [{ collected: 2 }],
    });
  });

  it('订单完成只激活出口并清空食物，进入出口才通关且只通知一次', () => {
    const engine = start(line({ order: [{ fruitType: 'grape', required: 1 }] }));
    const events = [...engine.step()];
    expect(events.filter((e) => e.type === 'exit-opened')).toHaveLength(1);
    expect(events.some((e) => e.type === 'level-completed')).toBe(false);
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', exitActive: true, foods: [] });
    for (let i = 0; i < 8; i += 1) events.push(...engine.step());
    expect(engine.getSnapshot().status).toBe('won');
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 11, y: 0 });
    expect(events.filter((e) => e.type === 'exit-opened')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'level-completed')).toEqual([
      { type: 'level-completed', levelId: 'order-test', score: 1 },
    ]);
    expect(events).toContainEqual({ type: 'game-ended', reason: 'order-completed', score: 1 });
    expect(engine.step()).toEqual([]);
  });

  it('未完成订单可以穿过灰色出口，不通关也不会在出口生成食物', () => {
    const engine = start(
      line({ exit: { x: 3, y: 0 }, order: [{ fruitType: 'grape', required: 100 }] }),
    );
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', exitActive: false });
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 3, y: 0 });
    expect(engine.getSnapshot().foods.some((f) => f.x === 3 && f.y === 0)).toBe(false);
  });

  it('空间不足只放现有空位，无空位不误判经典通关；断尾后补齐', () => {
    const engine = start(
      line({
        cols: 4,
        rows: 2,
        initialSnake: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 3, y: 1 },
        ],
        exit: { x: 3, y: 0 },
        order: [{ fruitType: 'grape', required: 10 }],
      }),
    );
    expect(engine.getSnapshot().foods).toHaveLength(1);
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({
      foods: [],
      status: 'playing',
      exitActive: false,
      orderProgress: [{ collected: 1 }],
    });
    engine.dispatch({ type: 'cut-tail' });
    expect(engine.getSnapshot().snake).toHaveLength(4);
    expect(engine.getSnapshot().foods).toHaveLength(3);
    expect(engine.getSnapshot().orderProgress[0]?.collected).toBe(1);
  });

  it('重试重置当前关订单、蛇身、分数与出口状态', () => {
    const engine = start(line({ order: [{ fruitType: 'grape', required: 1 }] }));
    engine.step();
    for (let i = 0; i < 8; i += 1) engine.step();
    engine.dispatch({ type: 'restart' });
    expect(engine.getSnapshot()).toMatchObject({
      level: { id: 'order-test' },
      sessionId: 2,
      status: 'playing',
      score: 0,
      combo: 0,
      exitActive: false,
      orderProgress: [{ collected: 0 }],
    });
    expect(engine.getSnapshot().snake).toEqual(line().initialSnake);
    expect(engine.getSnapshot().foods).toHaveLength(3);
  });

  it('食物、订单与出口配置均为冻结快照', () => {
    const state = start().getSnapshot();
    for (const value of [
      state.foods,
      state.foods[0],
      state.orderProgress,
      state.orderProgress[0],
      state.level.order,
      state.level.order?.[0],
      state.level.exit,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });
});

describe('断尾能力', () => {
  it('实际进食后断尾仍保留非零分数、连击和部分订单', () => {
    const engine = start();
    engine.step();
    engine.step();
    engine.step();
    const before = engine.getSnapshot();
    expect(before).toMatchObject({ score: 6, combo: 3, orderProgress: [{ collected: 1 }] });
    engine.dispatch({ type: 'cut-tail' });
    const after = engine.getSnapshot();
    expect(after.snake).toHaveLength(3);
    expect(after).toMatchObject({
      score: 6,
      combo: 3,
      direction: before.direction,
      tick: before.tick,
      orderProgress: before.orderProgress,
    });
    expect(after.snake[0]).toEqual(before.snake[0]);
  });
  it.each([
    [3, 3],
    [5, 5],
    [6, 3],
    [7, 4],
    [9, 6],
  ])('长度 %i 断尾后为 %i', (length, after) => {
    const engine = start(longSnake(length));
    const before = engine.getSnapshot();
    const events = engine.dispatch({ type: 'cut-tail' });
    expect(engine.getSnapshot().snake).toHaveLength(after);
    expect(events.filter((e) => e.type === 'tail-cut')).toHaveLength(length >= 6 ? 1 : 0);
    expect(engine.getSnapshot()).toMatchObject({
      direction: before.direction,
      score: before.score,
      combo: before.combo,
      tick: before.tick,
      orderProgress: before.orderProgress,
    });
    expect(engine.getSnapshot().snake[0]).toEqual(before.snake[0]);
  });

  it('可以连续使用，不设冷却；保留两条待执行转向和订单', () => {
    const engine = start(longSnake(9));
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.dispatch({ type: 'turn', direction: 'left' });
    engine.dispatch({ type: 'cut-tail' });
    engine.dispatch({ type: 'cut-tail' });
    expect(engine.getSnapshot().snake).toHaveLength(3);
    expect(engine.dispatch({ type: 'cut-tail' })).toEqual([]);
    engine.step();
    engine.step();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'playing',
      direction: 'left',
      orderProgress: [{ collected: 0 }],
    });
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 7, y: 1 });
  });

  it('暂停、未开始与结束时不执行；恢复后可用', () => {
    const engine = new GameEngine({ level: longSnake(6), mode: CAMPAIGN_MODE, random: () => 0 });
    expect(engine.dispatch({ type: 'cut-tail' })).toEqual([]);
    engine.dispatch({ type: 'start' });
    engine.dispatch({ type: 'pause' });
    const paused = engine.getSnapshot();
    expect(engine.dispatch({ type: 'cut-tail' })).toEqual([]);
    expect(engine.getSnapshot()).toBe(paused);
    engine.dispatch({ type: 'resume' });
    expect(engine.getSnapshot().canCutTail).toBe(true);
    for (let i = 0; i < 15; i += 1) engine.step();
    expect(engine.getSnapshot().status).toBe('gameover');
    expect(engine.dispatch({ type: 'cut-tail' })).toEqual([]);
  });

  it('经典模式即使蛇身足够长也不能断尾，保持单水果', () => {
    const engine = start(
      { ...CLASSIC_LEVEL, initialSnake: longSnake(9).initialSnake },
      CLASSIC_MODE,
    );
    expect(engine.getSnapshot().foods).toHaveLength(1);
    expect(engine.dispatch({ type: 'cut-tail' })).toEqual([]);
    expect(engine.getSnapshot().snake).toHaveLength(9);
  });
});

describe('内容与规则校验', () => {
  it.each(CAMPAIGN_LEVELS.map((level) => [level.id, level] as const))(
    '%s 使用固定随机源完整通关',
    (id, level) => {
      const engine = new GameEngine({ level, mode: CAMPAIGN_MODE, random: seededRandom(42) });
      const result = runCampaign(engine, id === 'alleys');
      expect(result.snapshot.status).toBe('won');
      expect(result.snapshot.snake[0]).toEqual(level.exit);
      expect(result.snapshot.orderProgress.every((item) => item.collected === item.required)).toBe(
        true,
      );
      if (id === 'alleys') expect(result.cuts).toBeGreaterThan(0);
    },
  );

  it('三关尺寸、障碍和出生坐标与方案一致', () => {
    expect(
      CAMPAIGN_LEVELS.map((l) => [l.cols, l.rows, l.obstacles.length, l.initialSnake[0], l.exit]),
    ).toEqual([
      [16, 16, 0, { x: 4, y: 8 }, { x: 14, y: 1 }],
      [16, 16, 14, { x: 3, y: 13 }, { x: 14, y: 1 }],
      [12, 12, 23, { x: 3, y: 11 }, { x: 10, y: 1 }],
    ]);
    for (const level of CAMPAIGN_LEVELS) expect(start(level).getSnapshot().stepMs).toBe(150);
  });

  it.each([
    { order: [] },
    { exit: { x: 12, y: 0 } },
    { exit: { x: 1, y: 0 } },
    { order: [{ fruitType: 'orange', required: 0 }] },
    {
      order: [
        { fruitType: 'orange', required: 1 },
        { fruitType: 'orange', required: 2 },
      ],
    },
    { order: [{ fruitType: 'missing', required: 1 }] },
    {
      cols: 5,
      rows: 2,
      exit: { x: 4, y: 0 },
      obstacles: [
        { x: 3, y: 0 },
        { x: 3, y: 1 },
      ],
    },
  ])('拒绝损坏订单、出口或封闭区域 %j', (patch) => {
    expect(() => start(line(patch))).toThrow();
  });

  it.each([
    { foodCount: 0 },
    { foodCount: 1.5 },
    { tailCut: { segments: 0, minimumLength: 3 } },
    { tailCut: { segments: 3, minimumLength: -1 } },
  ])('拒绝无效能力配置 %j', (patch: Partial<ModeDefinition>) => {
    expect(() => start(line(), { ...CAMPAIGN_MODE, ...patch })).toThrow();
  });

  it('闯关规则要求订单地图，不能意外与经典地图混用', () => {
    expect(() => start(CLASSIC_LEVEL)).toThrow('订单与出口');
  });

  it('订单已完成且没有水果时移动和断尾都不再消耗随机数', () => {
    const random = vi.fn(() => 0);
    const engine = new GameEngine({
      level: line({ order: [{ fruitType: 'grape', required: 3 }] }),
      mode: CAMPAIGN_MODE,
      random,
    });
    engine.dispatch({ type: 'start' });
    engine.step();
    engine.step();
    engine.step();
    random.mockClear();
    engine.dispatch({ type: 'cut-tail' });
    engine.step();
    expect(random).not.toHaveBeenCalled();
    expect(engine.getSnapshot().exitActive).toBe(true);
  });
});
