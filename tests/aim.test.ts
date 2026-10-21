import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/core/engine';
import { makeExpeditionMode } from '../src/content/expedition';
import { createSeededRandom, SKILL_IDS } from '../src/core/expedition';
import type { SkillId } from '../src/core/expedition';
import type { LevelDefinition } from '../src/core/types';
import { GameApplication } from '../src/app/game-application';
import type { AudioPort, GameView, StorageAdapter } from '../src/app/ports';
import { ManualClock } from './helpers/manual-clock';

function fixture(skillId: SkillId = 'crush', fragile = false) {
  const random = vi.fn(createSeededRandom(42));
  const level: LevelDefinition = {
    id: 'aim-test',
    name: '瞄准测试',
    cols: 16,
    rows: 16,
    obstacles: [],
    fragileObstacles: fragile ? [{ x: 6, y: 7 }] : [],
    initialSnake: Array.from({ length: 6 }, (_, i) => ({ x: 6 - i, y: 8 })),
    initialDirection: 'right',
    order: [{ fruitType: 'grape', required: 9 }],
    exit: { x: 14, y: 1 },
  };
  const engine = new GameEngine({
    level,
    mode: makeExpeditionMode({ skillId, upgrades: [] }),
    random,
  });
  engine.dispatch({ type: 'start' });
  return { engine, random };
}

describe('瞄准核心', () => {
  it.each(SKILL_IDS)('%s 瞄准不移动、不扣身体、不改变随机状态', (id) => {
    const { engine, random } = fixture(id);
    engine.dispatch({ type: 'turn', direction: 'down' });
    const before = engine.getSnapshot(),
      calls = random.mock.calls.length;
    expect(engine.dispatch({ type: 'begin-aim' })).toEqual([{ type: 'aim-started' }]);
    for (let i = 0; i < 12; i += 1) {
      engine.dispatch({ type: 'aim', direction: i % 2 ? 'up' : 'down' });
      expect(engine.step()).toEqual([]);
    }
    expect(engine.getSnapshot()).toMatchObject({
      snake: before.snake,
      foods: before.foods,
      score: before.score,
      tick: before.tick,
      orderProgress: before.orderProgress,
      slowSteps: before.slowSteps,
    });
    expect(random.mock.calls.length).toBe(calls);
  });
  it('释放转向、清除旧指令；无法通过连续瞄准绕过反向限制', () => {
    const { engine } = fixture();
    engine.dispatch({ type: 'turn', direction: 'down' });
    engine.dispatch({ type: 'begin-aim' });
    engine.dispatch({ type: 'aim', direction: 'up' });
    engine.dispatch({ type: 'aim', direction: 'left' });
    expect(engine.getSnapshot().skillAction).toMatchObject({ direction: 'up' });
    engine.dispatch({ type: 'commit-aim' });
    expect(engine.getSnapshot()).toMatchObject({ direction: 'up', tick: 0 });
    expect(engine.getSnapshot().snake).toHaveLength(3);
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual({ x: 6, y: 7 });
    expect(engine.dispatch({ type: 'commit-aim' })).toEqual([]);
  });
  it('破岩预览与实际命中一致，预测的是施法之后的下一格', () => {
    const { engine } = fixture('crush', true);
    engine.dispatch({ type: 'begin-aim' });
    engine.dispatch({ type: 'aim', direction: 'up' });
    const aim = engine.getSnapshot().skillAction;
    if (aim?.kind !== 'aiming') throw new Error('Expected aim');
    expect(aim.preview.broken).toEqual([{ x: 6, y: 7 }]);
    expect(aim.preview.danger).toBeNull();
    const events = engine.dispatch({ type: 'commit-aim' });
    expect(events.find((e) => e.type === 'terrain-broken')).toMatchObject({
      positions: aim.preview.broken,
    });
    engine.step();
    expect(engine.getSnapshot().snake[0]).toEqual(aim.preview.next);
  });
  it('危险预览允许确认，下一逻辑步仍正常碰撞', () => {
    const { engine } = fixture('slow', true);
    engine.dispatch({ type: 'begin-aim' });
    engine.dispatch({ type: 'aim', direction: 'up' });
    expect(engine.getSnapshot().skillAction).toMatchObject({ preview: { danger: 'obstacle' } });
    engine.dispatch({ type: 'commit-aim' });
    expect(engine.getSnapshot().snake).toHaveLength(3);
    expect(engine.step()).toContainEqual(
      expect.objectContaining({ type: 'game-ended', reason: 'obstacle' }),
    );
  });
  it.each(['pause', 'restart', 'cancel-aim'] as const)(
    '%s 清理瞄准，迟到的释放不能消费身体',
    (type) => {
      const { engine } = fixture();
      engine.dispatch({ type: 'begin-aim' });
      engine.dispatch({ type });
      expect(engine.getSnapshot().skillAction?.kind).toBe('idle');
      expect(engine.dispatch({ type: 'commit-aim' })).toEqual([]);
      expect(engine.getSnapshot().snake).toHaveLength(6);
    },
  );
  it('不足、暂停和未开始均不可瞄准；长按期间不能走旧的立即施法入口', () => {
    const { engine } = fixture();
    engine.dispatch({ type: 'begin-aim' });
    expect(engine.dispatch({ type: 'begin-aim' })).toEqual([]);
    expect(engine.dispatch({ type: 'use-skill' })).toEqual([]);
    engine.dispatch({ type: 'commit-aim' });
    expect(engine.dispatch({ type: 'begin-aim' })).toEqual([]);
    engine.dispatch({ type: 'restart' });
    engine.dispatch({ type: 'pause' });
    expect(engine.dispatch({ type: 'begin-aim' })).toEqual([]);
  });
});

function session() {
  const { engine } = fixture('slow');
  const view: GameView = {
    reset: vi.fn(),
    updateHud: vi.fn(),
    handleEvents: vi.fn(),
    draw: vi.fn(),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    dispose: vi.fn(),
  };
  const audio: AudioPort = {
    unlock: vi.fn(),
    setEnabled: vi.fn(),
    setPaused: vi.fn(),
    play: vi.fn(),
    dispose: vi.fn(),
  };
  const storage: StorageAdapter = {
    load: () => ({ highScore: 0, soundEnabled: true }),
    saveHighScore: vi.fn(),
    saveSoundEnabled: vi.fn(),
    loadCampaignProgress: () => ({ completedLevelIds: [] }),
    saveCampaignProgress: vi.fn(),
  };
  const clock = new ManualClock();
  const app = new GameApplication({ engine, view, audio, storage, clock });
  app.mount();
  clock.advance(0);
  return { app, clock, view, audio };
}

describe('瞄准时序与设备所有权', () => {
  it('1199ms 保持瞄准；1200ms 施放一次，持有者松开后才可重置', () => {
    const { app, clock, audio } = session();
    app.handleAction({ type: 'skill-press', source: 'keyboard' });
    clock.advance(1199);
    expect(app.getSnapshot().skillAction?.kind).toBe('aiming');
    expect(app.getSnapshot().tick).toBe(0);
    clock.advance(1);
    expect(app.getSnapshot().snake).toHaveLength(3);
    app.handleAction({ type: 'skill-press', source: 'keyboard' });
    app.handleAction({ type: 'skill-release', source: 'keyboard' });
    expect(vi.mocked(audio.play).mock.calls.filter(([e]) => e.type === 'skill-used')).toHaveLength(
      1,
    );
    app.dispose();
  });
  it('释放后 60ms 停顿，再走完整的 225ms 缓时步长；不积累旧时间', () => {
    const { app, clock } = session();
    clock.advance(140);
    app.handleAction({ type: 'skill-press', source: 'keyboard' });
    clock.advance(400);
    app.handleAction({ type: 'skill-release', source: 'keyboard' });
    clock.advance(60);
    clock.advance(224);
    expect(app.getSnapshot().tick).toBe(0);
    clock.advance(1);
    expect(app.getSnapshot().tick).toBe(1);
    app.dispose();
  });
  it('其他设备释放不结束瞄准；取消会暂停且不扣身体', () => {
    const { app, clock } = session();
    app.handleAction({ type: 'skill-press', source: 'pointer' });
    app.handleAction({ type: 'skill-release', source: 'keyboard' });
    expect(app.getSnapshot().skillAction?.kind).toBe('aiming');
    app.handleAction({ type: 'skill-cancel', source: 'pointer' });
    clock.advance(5000);
    expect(app.getSnapshot()).toMatchObject({ status: 'paused', tick: 0 });
    expect(app.getSnapshot().snake).toHaveLength(6);
    app.handleAction({ type: 'primary' });
    app.handleAction({ type: 'skill-release', source: 'pointer' });
    expect(app.getSnapshot().snake).toHaveLength(6);
    app.dispose();
  });
  it('暂停和释放后显示时钟与世界时钟分开；销毁取消唯一循环', () => {
    const { app, clock, view } = session();
    app.handleAction({ type: 'skill-press', source: 'keyboard' });
    clock.advance(16);
    expect(view.draw).toHaveBeenLastCalledWith(
      expect.anything(),
      16,
      expect.objectContaining({ worldDeltaMs: 0, aimRemainingMs: 1184 }),
    );
    app.handleAction({ type: 'pause' });
    clock.advance(3000);
    expect(view.draw).toHaveBeenLastCalledWith(
      expect.anything(),
      0,
      expect.objectContaining({ worldDeltaMs: 0 }),
    );
    expect(clock.callbacks.size).toBe(1);
    app.dispose();
    expect(clock.callbacks.size).toBe(0);
  });
});
