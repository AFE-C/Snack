import { describe, expect, it, vi } from 'vitest';
import { ExpeditionRun, parseRun } from '../src/app/expedition-run';
import { ExpeditionController } from '../src/app/expedition-controller';
import { GameApplication } from '../src/app/game-application';
import { BrowserStorage, EXPEDITION_KEY } from '../src/platform/browser-storage';
import type { AudioPort, GameView } from '../src/app/ports';
import { SKILL_IDS } from '../src/core/expedition';
import { ManualClock } from './helpers/manual-clock';
import { runCampaign } from './helpers/campaign-run';

function setup() {
  const data = new Map<string, string>();
  const storage = new BrowserStorage(() => ({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  }));
  const clock = new ManualClock();
  const navigation = { show: vi.fn(), showRecipes: vi.fn(), showRewards: vi.fn() };
  const sessions: { app: GameApplication; view: GameView; audio: AudioPort }[] = [];
  const ended: (() => void)[] = [];
  const controller = new ExpeditionController(storage, navigation, (engine, _run, onGameEnded) => {
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
    const app = new GameApplication({ engine, view, audio, clock, storage, onGameEnded });
    ended.push(() => onGameEnded(engine.getSnapshot()));
    sessions.push({ app, view, audio });
    return app;
  });
  const current = () => {
    const session = sessions.at(-1);
    if (!session) throw new Error('Missing session');
    return session;
  };
  const win = () =>
    runCampaign(
      {
        getSnapshot: () => current().app.getSnapshot(),
        dispatch: (command) => {
          current().app.dispatch(command);
          if (command.type === 'start') clock.advance(0);
        },
        step: () => clock.advance(current().app.getSnapshot().stepMs),
      },
      true,
    );
  return { controller, data, storage, clock, navigation, sessions, current, win, ended };
}

describe('远征状态、存档与生命周期', () => {
  it.each(SKILL_IDS)('%s 带着升级完整通关并保存最终结算', (skillId) => {
    const s = setup();
    s.controller.start(skillId, 42);
    for (let room = 0; room < 6; room++) {
      expect(s.clock.callbacks.size).toBe(1);
      s.win();
      expect(s.controller.getRun()?.roomIndex).toBe(room);
      expect(s.controller.getRun()?.phase).toBe(room === 5 ? 'won' : 'reward');
      if (room < 5) {
        s.controller.handleAction({ type: 'primary' });
        expect(s.clock.callbacks.size).toBe(0);
        const state = s.controller.getRun();
        if (!state) throw new Error('Missing run');
        const choices = new ExpeditionRun(state).getChoices();
        const upgradeId = choices.find((id) => id !== 'supply') ?? choices[0];
        if (!upgradeId) throw new Error('Missing choice');
        s.controller.handleAction({ type: 'choose-upgrade', upgradeId });
        expect(s.controller.getRun()?.upgrades).toHaveLength(room + 1);
      }
    }
    expect(parseRun(s.data.get(EXPEDITION_KEY) ?? null)?.phase).toBe('won');
    s.controller.dispose();
    expect(s.clock.callbacks.size).toBe(0);
  });
  it('三次撞击扣心，重试恢复相同入口与随机食品，失去全部生命后不能重开旧局', () => {
    const s = setup();
    s.controller.start('crush', 42);
    const entry = s.controller.getSnapshot();
    for (let loss = 1; loss <= 3; loss++) {
      s.controller.handleAction({ type: 'primary' });
      s.clock.advance(0);
      for (let i = 0; i < 20 && s.current().app.getSnapshot().status === 'playing'; i++)
        s.clock.advance(150);
      expect(s.controller.getRun()?.hearts).toBe(3 - loss);
      expect(s.controller.getRun()?.roomFailures).toBe(loss);
      s.controller.handleAction({ type: 'primary' });
      if (loss < 3) {
        expect(s.controller.getSnapshot()?.foods).toEqual(entry?.foods);
        expect(s.controller.getSnapshot()?.snake).toEqual(entry?.snake);
      }
    }
    expect(s.controller.getRun()?.phase).toBe('lost');
    expect(s.controller.getSnapshot()).toBeNull();
    expect(s.navigation.showRecipes).toHaveBeenCalled();
  });
  it('房间入口续玩与奖励页续玩，暂停不修改入口，旧局结束回调被拒绝', () => {
    const s = setup();
    s.controller.start('slow', 42);
    const checkpoint = s.data.get(EXPEDITION_KEY);
    s.controller.handleAction({ type: 'primary' });
    s.clock.advance(0);
    s.clock.advance(225);
    s.controller.handleAction({ type: 'pause' });
    expect(s.data.get(EXPEDITION_KEY)).toBe(checkpoint);
    s.controller.open(true);
    expect(s.controller.getSnapshot()?.status).toBe('start');
    const hearts = s.controller.getRun()?.hearts;
    s.ended[0]?.();
    expect(s.controller.getRun()?.hearts).toBe(hearts);
    s.win();
    s.controller.open(true);
    expect(s.navigation.showRewards).toHaveBeenCalled();
    s.controller.dispose();
    expect(s.clock.callbacks.size).toBe(0);
  });
  it('通关和快速点击不会重复加分或发奖；随机升级不可伪造', () => {
    const run = ExpeditionRun.start('crush', 42);
    const engine = run.createEngine();
    const result = runCampaign(engine, true);
    run.complete(result.snapshot);
    const score = run.getSnapshot().score;
    run.complete(result.snapshot);
    expect(run.getSnapshot().score).toBe(score);
    const chosen = run.getChoices()[0];
    if (!chosen) throw new Error('Missing upgrade');
    expect(run.choose(chosen)).toBe(true);
    expect(run.choose(chosen)).toBe(false);
    expect(run.getSnapshot().upgrades).toHaveLength(1);
  });
  it('完美配送只对零失败房间恢复生命，备用糖衣在下一入口生效', () => {
    const original = ExpeditionRun.start('crush', 42).getSnapshot();
    const run = new ExpeditionRun({
      ...original,
      roomIndex: 2,
      upgrades: ['perfect', 'reserve'],
      hearts: 2,
    });
    const engine = run.createEngine();
    const result = runCampaign(engine, true);
    run.complete(result.snapshot);
    expect(run.getSnapshot().hearts).toBe(3);
    const choice = run.getChoices()[0];
    if (!choice) throw new Error('Missing upgrade');
    run.choose(choice);
    expect(run.getSnapshot().entryLength).toBeGreaterThanOrEqual(6);
    const failed = new ExpeditionRun({
      ...original,
      roomIndex: 1,
      upgrades: ['perfect'],
      hearts: 2,
      roomFailures: 1,
    });
    failed.complete(runCampaign(failed.createEngine(), true).snapshot);
    expect(failed.getSnapshot().hearts).toBe(2);
  });
  it.each([null, '', '{}', '[]', 'broken', '{"version":2}'])('损坏存档 %s 安全恢复', (raw) => {
    expect(parseRun(raw)).toBeNull();
  });
  it('拒绝无效配方、重复升级、非法生命、跨房间进度与超长身体', () => {
    const state = ExpeditionRun.start('crush', 42).getSnapshot();
    for (const changes of [
      { skillId: 'unknown' },
      { upgrades: ['supply', 'supply'] },
      { hearts: 4 },
      { roomIndex: 3 },
      { entryLength: 13 },
      { phase: 'reward', roomIndex: 5 },
    ])
      expect(parseRun(JSON.stringify({ ...state, ...changes }))).toBeNull();
    expect(parseRun(JSON.stringify(state))).toEqual(state);
  });
});
