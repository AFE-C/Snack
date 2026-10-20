import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/core/engine';
import { createSeededRandom, getSkill, SKILL_IDS, UPGRADE_IDS } from '../src/core/expedition';
import type { SkillId, UpgradeId } from '../src/core/expedition';
import { prepareLevel } from '../src/core/level';
import type { LevelDefinition, Position } from '../src/core/types';
import {
  ROOMS,
  getRoom,
  getUpgradeChoices,
  makeExpeditionMode,
  makeRoomLevel,
} from '../src/content/expedition';
import { runCampaign } from './helpers/campaign-run';

function fixture(
  skillId: SkillId,
  options: {
    length?: number;
    upgrades?: UpgradeId[];
    fragile?: Position[];
    walls?: Position[];
    food?: Position;
  } = {},
) {
  const length = options.length ?? 6;
  const level: LevelDefinition = {
    id: 'fixture',
    name: '技能试验台',
    cols: 18,
    rows: 16,
    initialSnake: Array.from({ length }, (_, i) => ({ x: 12 - i, y: 12 })),
    initialDirection: 'right',
    obstacles: options.walls ?? [],
    fragileObstacles: options.fragile ?? [],
    order: [{ fruitType: 'grape', required: 20 }],
    exit: { x: 16, y: 1 },
  };
  const free: Position[] = [];
  for (let y = 0; y < level.rows; y++)
    for (let x = 0; x < level.cols; x++) {
      const occupied = [
        ...level.initialSnake,
        ...level.obstacles,
        ...(level.fragileObstacles ?? []),
        level.exit,
      ];
      if (!occupied.some((p) => p?.x === x && p.y === y)) free.push({ x, y });
    }
  let calls = 0;
  const index = free.findIndex((p) => p.x === options.food?.x && p.y === options.food.y);
  const engine = new GameEngine({
    level,
    mode: { ...makeExpeditionMode({ skillId, upgrades: options.upgrades ?? [] }), foodCount: 1 },
    random: () => (calls++ % 2 === 0 && index >= 0 ? (index + 0.2) / free.length : 0),
  });
  engine.dispatch({ type: 'start' });
  return engine;
}

describe('远征技能和升级规则', () => {
  it.each([3, 5, 6, 8, 9, 11, 12])('长度 %i 的强度、消耗和可用性', (length) => {
    const skill = getSkill({ skillId: 'crush', upgrades: [] }, length, true);
    expect(skill.power).toBe(length >= 12 ? 3 : length >= 9 ? 2 : 1);
    expect(skill.available).toBe(length >= 6);
    expect(getSkill({ skillId: 'crush', upgrades: ['economy'] }, length, true).available).toBe(
      length >= 5,
    );
    expect(getSkill({ skillId: 'crush', upgrades: [] }, length, false).available).toBe(false);
  });
  it('空施法仍断尾，保留头、方向、分数、订单、tick和转向队列', () => {
    const engine = fixture('crush');
    const before = engine.getSnapshot();
    engine.dispatch({ type: 'turn', direction: 'up' });
    const events = engine.dispatch({ type: 'use-skill' });
    expect(events.map((e) => e.type)).toEqual(['tail-cut', 'skill-used']);
    const after = engine.getSnapshot();
    expect(after.snake).toEqual(before.snake.slice(0, 3));
    expect(after.orderProgress).toEqual(before.orderProgress);
    expect([after.score, after.combo, after.tick, after.direction]).toEqual([0, 0, 0, 'right']);
    engine.step();
    expect(engine.getSnapshot().direction).toBe('up');
  });
  it('暂停、结束和长度不足均不能施法，节省配方保留3节', () => {
    const engine = fixture('slow', { length: 5, upgrades: ['economy'] });
    engine.dispatch({ type: 'pause' });
    expect(engine.dispatch({ type: 'use-skill' })).toEqual([]);
    engine.dispatch({ type: 'resume' });
    engine.dispatch({ type: 'use-skill' });
    expect(engine.getSnapshot().snake).toHaveLength(3);
    expect(engine.dispatch({ type: 'use-skill' })).toEqual([]);
  });
  it('破墙按强度扩展，实心墙阻断射线，重开恢复全部地形', () => {
    const engine = fixture('crush', {
      length: 12,
      fragile: [
        { x: 13, y: 12 },
        { x: 15, y: 12 },
      ],
      walls: [{ x: 14, y: 12 }],
    });
    const events = engine.dispatch({ type: 'use-skill' });
    expect(events.find((e) => e.type === 'terrain-broken')).toMatchObject({
      positions: [{ x: 13, y: 12 }],
    });
    expect(engine.getSnapshot().fragileObstacles).toEqual([{ x: 15, y: 12 }]);
    engine.dispatch({ type: 'restart' });
    expect(engine.getSnapshot().fragileObstacles).toHaveLength(2);
  });
  it('脆墙参与碰撞，食品不会生成在脆墙上', () => {
    const engine = fixture('slow', { fragile: [{ x: 13, y: 12 }] });
    expect(engine.getSnapshot().foods.every((f) => f.x !== 13 || f.y !== 12)).toBe(true);
    engine.step();
    expect(engine.getSnapshot().status).toBe('gameover');
  });
  it.each([6, 9, 12])('减速长度 %i 按逻辑步倒计时，暂停冻结，重开清理', (length) => {
    const engine = fixture('slow', { length });
    engine.dispatch({ type: 'use-skill' });
    const duration = engine.getSnapshot().slowSteps ?? 0;
    expect(duration).toBe(length === 6 ? 8 : length === 9 ? 12 : 16);
    expect(engine.getSnapshot().stepMs).toBe(225);
    engine.dispatch({ type: 'pause' });
    engine.step();
    expect(engine.getSnapshot().slowSteps).toBe(duration);
    engine.dispatch({ type: 'resume' });
    engine.dispatch({ type: 'turn', direction: 'up' });
    engine.step();
    expect(engine.getSnapshot().slowSteps).toBe(duration - 1);
    engine.dispatch({ type: 'restart' });
    expect(engine.getSnapshot().stepMs).toBe(150);
  });
  it('连续减速取最大剩余时长，不累加', () => {
    const engine = fixture('slow', { length: 12 });
    engine.dispatch({ type: 'use-skill' });
    engine.dispatch({ type: 'use-skill' });
    expect(engine.getSnapshot().slowSteps).toBe(16);
    expect(engine.getSnapshot().snake).toHaveLength(6);
  });
  it('吸果正常计分和推进订单，下一次移动安全生长', () => {
    const engine = fixture('magnet', { food: { x: 14, y: 12 } });
    const events = engine.dispatch({ type: 'use-skill' });
    expect(events.some((e) => e.type === 'food-eaten')).toBe(true);
    expect(engine.getSnapshot().orderProgress[0]?.collected).toBe(1);
    expect(engine.getSnapshot().growthPending).toBe(1);
    engine.step();
    expect(engine.getSnapshot().snake).toHaveLength(4);
    expect(new Set(engine.getSnapshot().snake.map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });
  it('墙阻止吸果，射程外也不会收集', () => {
    for (const options of [
      { food: { x: 15, y: 12 } },
      { food: { x: 14, y: 12 }, walls: [{ x: 13, y: 12 }] },
    ]) {
      const engine = fixture('magnet', options);
      engine.dispatch({ type: 'use-skill' });
      expect(engine.getSnapshot().score).toBe(0);
      expect(engine.getSnapshot().snake).toHaveLength(3);
    }
  });
  it('组合先破墙再吸果，赠品额外计数只使用一次', () => {
    const engine = fixture('crush', {
      upgrades: ['aroma', 'brittle', 'frost', 'gift'],
      food: { x: 13, y: 12 },
    });
    const events = engine.dispatch({ type: 'use-skill' });
    expect(events.map((e) => e.type)).toContain('food-eaten');
    expect(engine.getSnapshot().orderProgress[0]?.collected).toBe(2);
    expect(engine.getSnapshot().slowSteps).toBe(4);
  });
  it.each(ROOMS.map((room) => [room.level.id, room] as const))(
    '%s 出生和所有可走格连通',
    (_id, room) => {
      for (const length of [3, 6, 12])
        expect(() => prepareLevel(makeRoomLevel(room, length))).not.toThrow();
    },
  );
  it.each(SKILL_IDS)('%s 在固定种子下完整通关六房间', (skillId) => {
    for (let index = 0; index < 6; index++) {
      const engine = new GameEngine({
        level: makeRoomLevel(getRoom(42, index), 6),
        mode: makeExpeditionMode({ skillId, upgrades: [] }),
        random: createSeededRandom(42 + index),
      });
      expect(runCampaign(engine, true).snapshot.status).toBe('won');
    }
  });
  it.each(
    ROOMS.flatMap((room) =>
      SKILL_IDS.map((skillId) => [`${room.level.id}/${skillId}`, room, skillId] as const),
    ),
  )('%s 独立通关验证', (_name, room, skillId) => {
    const engine = new GameEngine({
      level: makeRoomLevel(room, 6),
      mode: makeExpeditionMode({ skillId, upgrades: [] }),
      random: createSeededRandom(73),
    });
    expect(runCampaign(engine, true).snapshot.status).toBe('won');
  });
  it('九项升级组合仍可通关，身体上限12、货架4颗，计数不重复', () => {
    const engine = new GameEngine({
      level: makeRoomLevel(getRoom(42, 5), 12),
      mode: makeExpeditionMode({ skillId: 'magnet', upgrades: UPGRADE_IDS }),
      random: createSeededRandom(42),
    });
    expect(engine.getSnapshot().foods).toHaveLength(4);
    const result = runCampaign(engine, true);
    expect(result.snapshot.snake.length).toBeLessThanOrEqual(12);
    expect(result.snapshot.orderProgress.every((item) => item.collected === item.required)).toBe(
      true,
    );
  });
  it('种子与升级选择可重放，排除已持有项且不重复', () => {
    expect(getUpgradeChoices(42, 2, ['economy'])).toEqual(getUpgradeChoices(42, 2, ['economy']));
    for (let roomIndex = 0; roomIndex < 5; roomIndex++) {
      const choices = getUpgradeChoices(42, roomIndex, UPGRADE_IDS.slice(0, roomIndex));
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      expect(choices.every((id) => !UPGRADE_IDS.slice(0, roomIndex).includes(id))).toBe(true);
    }
    expect(ROOMS).toHaveLength(10);
  });
});
