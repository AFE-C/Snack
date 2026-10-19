import { describe, expect, it, vi } from 'vitest';
import { GameApplication } from '../src/app/game-application';
import type {
  AudioPort,
  FrameClock,
  GameView,
  PlayerSettings,
  StorageAdapter,
} from '../src/app/ports';
import { CLASSIC_LEVEL, CLASSIC_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import type { LevelDefinition, ModeDefinition } from '../src/core/types';

class TestClock implements FrameClock {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  readonly cancelFrame = vi.fn((id: number) => {
    this.callbacks.delete(id);
  });
  private nextId = 0;
  private timestamp = 0;
  requestFrame(callback: (timestamp: number) => void): number {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  }
  advance(deltaMs: number): void {
    this.timestamp += deltaMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(this.timestamp));
  }
}

function setup(
  level: LevelDefinition = CLASSIC_LEVEL,
  settings: PlayerSettings = { highScore: 0, soundEnabled: true },
  mode: ModeDefinition = CLASSIC_MODE,
) {
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
    load: () => settings,
    saveHighScore: vi.fn(),
    saveSoundEnabled: vi.fn(),
  };
  const clock = new TestClock();
  const app = new GameApplication({
    engine: new GameEngine({ level, mode, random: () => 0 }),
    view,
    audio,
    storage,
    clock,
  });
  app.mount();
  return { app, clock, view, audio, storage };
}

const eatingLevel: LevelDefinition = {
  ...CLASSIC_LEVEL,
  cols: 8,
  rows: 1,
  initialSnake: [{ x: 0, y: 0 }],
  obstacles: [],
};
const endingLevel: LevelDefinition = {
  ...CLASSIC_LEVEL,
  initialSnake: [
    { x: 19, y: 10 },
    { x: 18, y: 10 },
  ],
};
const winningLevel: LevelDefinition = {
  ...CLASSIC_LEVEL,
  cols: 3,
  rows: 1,
  initialSnake: [
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ],
};

function start(app: GameApplication, clock: TestClock): void {
  app.handleAction({ type: 'primary' });
  clock.advance(0);
}

describe('应用生命周期', () => {
  it('重复挂载、开始与重开都只保留一个动画循环', () => {
    const { app, clock } = setup();
    app.mount();
    start(app, clock);
    app.dispatch({ type: 'start' });
    for (let index = 0; index < 10; index += 1) {
      app.dispatch({ type: 'restart' });
      clock.advance(16);
    }
    expect(clock.callbacks.size).toBe(1);
    expect(app.getSnapshot().sessionId).toBe(11);
  });

  it('暂停主按钮恢复当前局，恢复后不补算暂停时间', () => {
    const { app, clock, audio } = setup(eatingLevel);
    start(app, clock);
    clock.advance(150);
    expect(app.getSnapshot().score).toBe(1);
    app.handleAction({ type: 'toggle-pause' });
    const paused = app.getSnapshot();
    clock.advance(60000);
    expect(app.getSnapshot()).toBe(paused);
    expect(audio.setPaused).toHaveBeenLastCalledWith(true);
    app.handleAction({ type: 'primary' });
    expect(app.getSnapshot()).toMatchObject({
      status: 'playing',
      score: 1,
      combo: 1,
      sessionId: 1,
    });
    clock.advance(0);
    clock.advance(149);
    expect(app.getSnapshot().tick).toBe(1);
    clock.advance(1);
    expect(app.getSnapshot().score).toBe(2);
    expect(audio.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('长帧限制为 250ms，快速模式每帧最多补算五步', () => {
    const regular = setup();
    start(regular.app, regular.clock);
    regular.clock.advance(60000);
    expect(regular.app.getSnapshot().tick).toBe(1);
    const fast = setup(CLASSIC_LEVEL, undefined, { ...CLASSIC_MODE, getStepMs: () => 1 });
    start(fast.app, fast.clock);
    fast.clock.advance(60000);
    expect(fast.app.getSnapshot().tick).toBe(5);
    fast.clock.advance(1);
    expect(fast.app.getSnapshot().tick).toBe(6);
  });

  it('快速重开取消旧局的延迟结算，不会弹出旧遮罩', () => {
    const { app, clock, view } = setup(endingLevel);
    start(app, clock);
    clock.advance(150);
    expect(app.getSnapshot().status).toBe('gameover');
    app.handleAction({ type: 'primary' });
    app.handleAction({ type: 'turn', direction: 'up' });
    for (let index = 0; index < 65; index += 1) clock.advance(16);
    expect(app.getSnapshot()).toMatchObject({ status: 'playing', sessionId: 2 });
    expect(view.showOverlay).toHaveBeenCalledTimes(1);
  });

  it('结算等候 800ms，并只把严格超出的分数标记为新纪录', () => {
    const { app, clock, view, storage } = setup(winningLevel);
    start(app, clock);
    clock.advance(150);
    expect(storage.saveHighScore).toHaveBeenCalledWith(1);
    clock.advance(0);
    clock.advance(200);
    clock.advance(200);
    clock.advance(200);
    clock.advance(199);
    expect(view.showOverlay).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(view.showOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'won', score: 1 }),
      true,
    );
    const tie = setup(winningLevel, { highScore: 1, soundEnabled: true });
    start(tie.app, tie.clock);
    tie.clock.advance(150);
    tie.clock.advance(0);
    for (let index = 0; index < 4; index += 1) tie.clock.advance(200);
    expect(tie.storage.saveHighScore).not.toHaveBeenCalled();
    expect(tie.view.showOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'won' }),
      false,
    );
  });

  it('恢复存档音效设置，切换后保存并刷新界面', () => {
    const { app, audio, view, storage } = setup(CLASSIC_LEVEL, {
      highScore: 42,
      soundEnabled: false,
    });
    expect(audio.setEnabled).toHaveBeenCalledWith(false);
    app.handleAction({ type: 'toggle-sound' });
    expect(storage.saveSoundEnabled).toHaveBeenCalledWith(true);
    expect(view.updateHud).toHaveBeenLastCalledWith(expect.anything(), {
      highScore: 42,
      soundEnabled: true,
    });
  });

  it('销毁取消动画循环和外设，再次销毁或输入没有副作用', () => {
    const { app, clock, view, audio } = setup();
    app.dispose();
    app.dispose();
    app.handleAction({ type: 'primary' });
    app.dispatch({ type: 'restart' });
    app.mount();
    clock.advance(1000);
    expect(clock.callbacks.size).toBe(0);
    expect(clock.cancelFrame).toHaveBeenCalledTimes(1);
    expect(view.dispose).toHaveBeenCalledTimes(1);
    expect(audio.dispose).toHaveBeenCalledTimes(1);
    expect(app.getSnapshot().status).toBe('start');
  });
});
