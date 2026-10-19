import { describe, expect, it, vi } from 'vitest';
import { selectAudioEvents } from '../src/app/audio-feedback';
import { GameApplication } from '../src/app/game-application';
import type { AudioPort, GameView } from '../src/app/ports';
import { CAMPAIGN_MODE, CLASSIC_LEVEL, CLASSIC_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import { getRemainingOrder } from '../src/core/order';
import type { GameEvent, LevelDefinition } from '../src/core/types';
import { BrowserAudio } from '../src/platform/browser-audio';
import { BrowserStorage } from '../src/platform/browser-storage';
import { CanvasRenderer } from '../src/render/canvas-renderer';
import { drawTargetMarker } from '../src/render/draw-target';
import { EffectSystem } from '../src/render/effects';
import { recordingContext } from './helpers/canvas-context';
import { ManualClock } from './helpers/manual-clock';

function orderLine(): LevelDefinition {
  return {
    id: 'order-cues',
    name: '提示测试',
    cols: 12,
    rows: 1,
    obstacles: [],
    initialSnake: [
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
    initialDirection: 'right',
    order: [
      { fruitType: 'grape', required: 1 },
      { fruitType: 'orange', required: 1 },
    ],
    exit: { x: 11, y: 0 },
  };
}
const food: GameEvent = {
  type: 'food-eaten',
  food: { x: 3, y: 0, type: 'grape', color: '#8b5cf6', points: 1 },
  points: 2,
  combo: 10,
};
const milestone: GameEvent = { type: 'combo-milestone', food: food.food, combo: 10, level: 1 };
const complete: GameEvent = { type: 'order-item-completed', fruitType: 'grape' };
const exit: GameEvent = { type: 'exit-opened', exit: { x: 11, y: 0 } };

describe('订单派生与收齐事件', () => {
  it('显示剩余量，过滤已收齐项，不修改原始只读进度', () => {
    const progress = Object.freeze([
      Object.freeze({ fruitType: 'grape', required: 2, collected: 2 }),
      Object.freeze({ fruitType: 'strawberry', required: 3, collected: 1 }),
      Object.freeze({ fruitType: 'orange', required: 1, collected: 0 }),
    ]);
    expect(getRemainingOrder(progress)).toEqual([
      { fruitType: 'strawberry', remaining: 2 },
      { fruitType: 'orange', remaining: 1 },
    ]);
    expect(progress[1]?.collected).toBe(1);
    expect(getRemainingOrder([])).toEqual([]);
  });

  it('单类首次达到要求发事件，重复吃已收齐类型不再通知，重开可重新触发', () => {
    const engine = new GameEngine({ level: orderLine(), mode: CAMPAIGN_MODE, random: () => 0 });
    engine.dispatch({ type: 'start' });
    expect(engine.step()).toContainEqual(complete);
    const repeated = [...engine.step(), ...engine.step()];
    expect(repeated.some((event) => event.type === 'order-item-completed')).toBe(false);
    const last = engine.step();
    expect(last).toContainEqual({ type: 'order-item-completed', fruitType: 'orange' });
    expect(last).toContainEqual(exit);
    expect(getRemainingOrder(engine.getSnapshot().orderProgress)).toEqual([]);
    engine.dispatch({ type: 'restart' });
    expect(engine.step()).toContainEqual(complete);
  });

  it('未达数量和非目标进食不发收齐通知，经典模式也不发', () => {
    const engine = new GameEngine({
      level: { ...orderLine(), order: [{ fruitType: 'orange', required: 2 }] },
      mode: CAMPAIGN_MODE,
      random: () => 0,
    });
    engine.dispatch({ type: 'start' });
    for (let i = 0; i < 3; i += 1)
      expect(engine.step().some((event) => event.type === 'order-item-completed')).toBe(false);
    expect(getRemainingOrder(engine.getSnapshot().orderProgress)).toEqual([
      { fruitType: 'orange', remaining: 1 },
    ]);
    const classic = new GameEngine({
      level: { ...CLASSIC_LEVEL, cols: 12, rows: 1, initialSnake: [{ x: 0, y: 0 }] },
      mode: CLASSIC_MODE,
      random: () => 0,
    });
    classic.dispatch({ type: 'start' });
    expect(classic.step().some((event) => event.type === 'order-item-completed')).toBe(false);
  });
});

describe('静态水果标记与特效', () => {
  it('四角和底衬都限制在目标格内，恢复绘图状态', () => {
    const { context, rectangles } = recordingContext();
    context.fillStyle = '#123';
    drawTargetMarker(context, { x: 2, y: 3 }, 20);
    expect(rectangles.filter((rect) => rect.color === '#713c7c')).toHaveLength(8);
    expect(
      rectangles.every(
        (r) => r.x >= 40 && r.y >= 60 && r.x + r.width <= 60 && r.y + r.height <= 80,
      ),
    ).toBe(true);
    expect(context.fillStyle).toBe('#123');
  });

  it('同一类型所有目标都标记；收齐后只标记补货出的未完成水果，角标不随时间闪动', () => {
    const engine = new GameEngine({ level: orderLine(), mode: CAMPAIGN_MODE, random: () => 0 });
    const { context, rectangles } = recordingContext();
    const canvas = { getContext: () => context, style: {} } as unknown as HTMLCanvasElement;
    const renderer = new CanvasRenderer(canvas);
    const effects = new EffectSystem();
    renderer.reset(engine.getSnapshot());
    renderer.draw(engine.getSnapshot(), 0, effects);
    expect(rectangles.filter((rect) => rect.color === '#fff0ad')).toHaveLength(3);
    engine.dispatch({ type: 'start' });
    engine.step();
    rectangles.length = 0;
    renderer.draw(engine.getSnapshot(), 0, effects);
    const marked = rectangles.filter((rect) => rect.color === '#fff0ad');
    expect(marked).toEqual([{ x: 121, y: 1, width: 18, height: 18, color: '#fff0ad' }]);
    rectangles.length = 0;
    renderer.draw(engine.getSnapshot(), 1000, effects);
    expect(rectangles.filter((rect) => rect.color === '#fff0ad')).toEqual(marked);
  });

  it('空间不足、断尾补货和重试后，角标随当前水果刷新', () => {
    const map = {
      ...orderLine(),
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
      order: [{ fruitType: 'grape', required: 10 }],
      exit: { x: 3, y: 0 },
    };
    const engine = new GameEngine({ level: map, mode: CAMPAIGN_MODE, random: () => 0 });
    const { context, rectangles } = recordingContext();
    const renderer = new CanvasRenderer({
      getContext: () => context,
      style: {},
    } as unknown as HTMLCanvasElement);
    renderer.reset(engine.getSnapshot());
    const count = () => {
      rectangles.length = 0;
      renderer.draw(engine.getSnapshot(), 0, new EffectSystem());
      return rectangles.filter((r) => r.color === '#fff0ad').length;
    };
    engine.dispatch({ type: 'start' });
    expect(count()).toBe(1);
    engine.step();
    expect(count()).toBe(0);
    engine.dispatch({ type: 'cut-tail' });
    expect(count()).toBe(3);
    engine.dispatch({ type: 'restart' });
    expect(count()).toBe(1);
  });

  it('闯关没有棋盘内飘字和连击震动，经典效果保留', () => {
    const snapshot = new GameEngine({
      level: orderLine(),
      mode: CAMPAIGN_MODE,
      random: () => 0,
    }).getSnapshot();
    const effects = new EffectSystem();
    const { context, methods } = recordingContext();
    effects.handleEvents([food, milestone, exit], snapshot);
    effects.draw(context);
    expect(methods.fillText).not.toHaveBeenCalled();
    expect(effects.isShaking).toBe(false);
    effects.reset();
    effects.handleEvents([food, milestone], { ...snapshot, victoryCondition: 'fill-board' });
    effects.draw(context);
    expect(methods.fillText).toHaveBeenCalledWith('+2', expect.any(Number), expect.any(Number));
    expect(effects.isShaking).toBe(true);
  });

  it('经典水果不增加目标标记', () => {
    const snapshot = new GameEngine({
      level: CLASSIC_LEVEL,
      mode: CLASSIC_MODE,
      random: () => 0,
    }).getSnapshot();
    const { context, rectangles } = recordingContext();
    const renderer = new CanvasRenderer({
      getContext: () => context,
      style: {},
    } as unknown as HTMLCanvasElement);
    renderer.reset(snapshot);
    renderer.draw(snapshot, 0, new EffectSystem());
    expect(rectangles.some((r) => r.color === '#fff0ad')).toBe(false);
  });
});

describe('闯关音效优先级', () => {
  it.each([
    [[food], food],
    [[food, milestone], milestone],
    [[milestone, complete, food], complete],
    [[food, complete, exit, milestone], exit],
  ] as const)('只播放本步最高优先级提示 %j', (events, expected) => {
    expect(selectAudioEvents(events, true)).toEqual([expected]);
  });

  it('技能和生命周期事件保留；经典模式不筛选原有音效', () => {
    const lifecycle: GameEvent = { type: 'session-started', sessionId: 1 };
    const cut: GameEvent = { type: 'tail-cut', segments: [] };
    const events = [lifecycle, food, cut, complete];
    expect(selectAudioEvents(events, true)).toEqual([lifecycle, cut, complete]);
    expect(selectAudioEvents(events, false)).toBe(events);
  });

  it('真实应用将出口提示送入音频适配器，屏蔽同一步进食和单类收齐音', () => {
    const clock = new ManualClock();
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
      engine: new GameEngine({
        level: { ...orderLine(), order: [{ fruitType: 'grape', required: 1 }] },
        mode: CAMPAIGN_MODE,
        random: () => 0,
      }),
      view,
      audio,
      clock,
      storage: new BrowserStorage(() => {
        throw new Error('no storage');
      }),
    });
    app.mount();
    app.dispatch({ type: 'start' });
    clock.advance(0);
    vi.mocked(audio.play).mockClear();
    clock.advance(150);
    expect(audio.play).toHaveBeenCalledExactlyOnceWith(exit);
    expect(view.handleEvents).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'food-eaten' }), complete, exit]),
      expect.anything(),
    );
    app.dispose();
  });

  it('静音、暂停、销毁时新收齐音效也不创建音符', () => {
    const createContext = vi.fn(() => {
      throw new Error('Audio disabled');
    });
    const audio = new BrowserAudio(createContext);
    audio.setEnabled(false);
    audio.play(complete);
    audio.setEnabled(true);
    audio.setPaused(true);
    audio.play(complete);
    audio.dispose();
    audio.play(complete);
    expect(createContext).not.toHaveBeenCalled();
  });
});
