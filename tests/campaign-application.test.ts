import { describe, expect, it, vi } from 'vitest';
import { GameApplication } from '../src/app/game-application';
import { GameCoordinator } from '../src/app/game-coordinator';
import type { NavigationView } from '../src/app/game-coordinator';
import type { AudioPort, GameView } from '../src/app/ports';
import { GameEngine } from '../src/core/engine';
import { BrowserStorage, HIGH_SCORE_KEY } from '../src/platform/browser-storage';
import { ManualClock } from './helpers/manual-clock';
import { runCampaign, seededRandom } from './helpers/campaign-run';

function setup(unavailable = false) {
  const data = new Map([[HIGH_SCORE_KEY, '1']]);
  const storage = new BrowserStorage(() => {
    if (unavailable) throw new Error('Storage disabled');
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
  });
  const navigation: NavigationView = { showHome: vi.fn(), showLevels: vi.fn(), showGame: vi.fn() };
  const clock = new ManualClock();
  const sessions: {
    app: GameApplication;
    view: GameView;
    audio: AudioPort;
    complete: (id: string) => void;
  }[] = [];
  const coordinator = new GameCoordinator(storage, navigation, (level, mode, complete) => {
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
    const app = new GameApplication({
      engine: new GameEngine({ level, mode, random: seededRandom(42) }),
      view,
      audio,
      storage,
      clock,
      onLevelCompleted: complete,
    });
    sessions.push({ app, view, audio, complete });
    return app;
  });
  coordinator.mount();
  const current = () => {
    const session = sessions.at(-1);
    if (!session) throw new Error('测试中没有活动局');
    return session;
  };
  const win = (cut = false) => {
    const { app } = current();
    return runCampaign(
      {
        getSnapshot: () => app.getSnapshot(),
        dispatch: (command) => {
          app.dispatch(command);
          if (command.type === 'start') clock.advance(0);
        },
        step: () => clock.advance(150),
      },
      cut,
    );
  };
  return { coordinator, navigation, clock, storage, data, sessions, current, win };
}

describe('闯关导航与应用集成', () => {
  it('首次只可进入第一关，未知或锁定关卡不创建应用', () => {
    const { coordinator, sessions, navigation } = setup();
    coordinator.handleAction({ type: 'open-campaign' });
    expect(navigation.showLevels).toHaveBeenLastCalledWith({ completedLevelIds: [] });
    coordinator.handleAction({ type: 'select-level', levelId: 'courtyard' });
    coordinator.handleAction({ type: 'select-level', levelId: 'missing' });
    expect(sessions).toHaveLength(0);
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    expect(sessions).toHaveLength(1);
    coordinator.dispose();
  });

  it('真实应用逐关通关、解锁、保存；下一关释放旧局；闯关分数不写经典最高分', () => {
    const { coordinator, clock, storage, data, current, win, sessions, navigation } = setup();
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    const first = current();
    win();
    expect(storage.loadCampaignProgress()).toEqual({ completedLevelIds: ['garden'] });
    expect(data.get(HIGH_SCORE_KEY)).toBe('1');
    coordinator.handleAction({ type: 'primary' });
    expect(current().app.getSnapshot()).toMatchObject({
      status: 'start',
      level: { id: 'courtyard' },
    });
    expect(first.view.dispose).toHaveBeenCalledTimes(1);
    expect(first.audio.dispose).toHaveBeenCalledTimes(1);
    expect(clock.callbacks.size).toBe(1);
    win();
    coordinator.handleAction({ type: 'next-level' });
    expect(current().app.getSnapshot().level.id).toBe('alleys');
    expect(win(true).cuts).toBeGreaterThan(0);
    clock.advance(0);
    for (let i = 0; i < 4; i += 1) clock.advance(200);
    expect(current().view.showOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'won', level: expect.objectContaining({ id: 'alleys' }) }),
      false,
    );
    expect(storage.loadCampaignProgress()).toEqual({
      completedLevelIds: ['garden', 'courtyard', 'alleys'],
    });
    expect(data.get(HIGH_SCORE_KEY)).toBe('1');
    coordinator.handleAction({ type: 'primary' });
    expect(clock.callbacks.size).toBe(0);
    expect(navigation.showLevels).toHaveBeenLastCalledWith({
      completedLevelIds: ['garden', 'courtyard', 'alleys'],
    });
    expect(sessions).toHaveLength(3);
    // 新协调器从同一个存档恢复第三关的解锁。
    const createRestored = vi.fn(() => current().app);
    const restored = new GameCoordinator(storage, navigation, createRestored);
    restored.handleAction({ type: 'select-level', levelId: 'alleys' });
    expect(createRestored).toHaveBeenCalledTimes(1);
    restored.dispose();
    coordinator.dispose();
  });

  it('失败主操作只重试当前关；快速退回菜单后旧结算和完成回调不会干扰新局', () => {
    const { coordinator, clock, current, storage } = setup();
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    const old = current();
    coordinator.handleAction({ type: 'primary' });
    clock.advance(0);
    for (let i = 0; i < 12; i += 1) clock.advance(150);
    expect(old.app.getSnapshot().status).toBe('gameover');
    coordinator.handleAction({ type: 'primary' });
    expect(old.app.getSnapshot()).toMatchObject({
      status: 'playing',
      sessionId: 2,
      level: { id: 'garden' },
      score: 0,
      orderProgress: [{ collected: 0 }, { collected: 0 }],
    });
    coordinator.handleAction({ type: 'level-select' });
    coordinator.handleAction({ type: 'open-classic' });
    old.complete('garden');
    clock.advance(0);
    for (let i = 0; i < 8; i += 1) clock.advance(200);
    expect(storage.loadCampaignProgress()).toEqual({ completedLevelIds: [] });
    expect(old.view.showOverlay).toHaveBeenCalledTimes(1);
    expect(current().view.showOverlay).toHaveBeenCalledTimes(1);
    expect(current().app.getSnapshot().modeId).toBe('classic');
    expect(clock.callbacks.size).toBe(1);
    coordinator.dispose();
  });

  it('反复切换不会增加循环；菜单没有活动循环，销毁幂等', () => {
    const { coordinator, clock, sessions } = setup();
    for (let i = 0; i < 20; i += 1) {
      coordinator.handleAction({ type: 'open-classic' });
      coordinator.mount();
      expect(clock.callbacks.size).toBe(1);
      coordinator.handleAction({ type: 'open-campaign' });
      expect(clock.callbacks.size).toBe(0);
    }
    coordinator.dispose();
    coordinator.dispose();
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    expect(sessions).toHaveLength(20);
    expect(
      sessions.every(
        ({ audio, view }) =>
          vi.mocked(audio.dispose).mock.calls.length === 1 &&
          vi.mocked(view.dispose).mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it('未通关时 next-level 无效，不会跳过订单', () => {
    const { coordinator, current, sessions } = setup();
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    coordinator.handleAction({ type: 'next-level' });
    expect(sessions).toHaveLength(1);
    expect(current().app.getSnapshot().level.id).toBe('garden');
    coordinator.dispose();
  });

  it('存储不可用时，本次会话仍能通关并进入下一关', () => {
    const { coordinator, current, win } = setup(true);
    coordinator.handleAction({ type: 'select-level', levelId: 'garden' });
    win();
    coordinator.handleAction({ type: 'primary' });
    expect(current().app.getSnapshot().level.id).toBe('courtyard');
    coordinator.dispose();
  });
});
