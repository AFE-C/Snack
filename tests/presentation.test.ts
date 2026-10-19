import { describe, expect, it, vi } from 'vitest';
import { CLASSIC_LEVEL, CLASSIC_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import { BrowserAudio } from '../src/platform/browser-audio';
import { EffectSystem } from '../src/render/effects';

describe('表现层生命周期', () => {
  it('重开清除尚未生成的旧局碎裂粒子', () => {
    const engine = new GameEngine({ level: CLASSIC_LEVEL, mode: CLASSIC_MODE, random: () => 0 });
    const effects = new EffectSystem();
    const fillRect = vi.fn();
    const context = { fillRect } as unknown as CanvasRenderingContext2D;
    effects.handleEvents([{ type: 'game-ended', reason: 'wall', score: 0 }], engine.getSnapshot());
    effects.reset();
    effects.update(1000);
    effects.draw(context);
    expect(fillRect).not.toHaveBeenCalled();
  });

  it('音效设置不会在页面加载时创建音频上下文，只有用户解锁后创建', () => {
    const createContext = vi.fn(() => {
      throw new Error('Audio unavailable');
    });
    const audio = new BrowserAudio(createContext);
    audio.setEnabled(true);
    expect(createContext).not.toHaveBeenCalled();
    expect(() => audio.unlock()).not.toThrow();
    expect(createContext).toHaveBeenCalledTimes(1);
    audio.setEnabled(false);
    audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(() => audio.play({ type: 'session-started', sessionId: 1 })).not.toThrow();
  });

  it('暂停停止已排队音符，静音与销毁释放活动节点', () => {
    const oscillators: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
      [];
    const context = {
      state: 'running',
      currentTime: 0,
      destination: {},
      close: vi.fn(async () => undefined),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createOscillator: () => {
        const oscillator = {
          frequency: { value: 0 },
          type: 'square',
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        oscillators.push(oscillator);
        return oscillator;
      },
    };
    const audio = new BrowserAudio(() => context as unknown as AudioContext);
    audio.unlock();
    audio.play({ type: 'session-started', sessionId: 1 });
    expect(oscillators).toHaveLength(3);
    audio.setPaused(true);
    expect(
      oscillators.every(
        (voice) => voice.stop.mock.calls.length === 2 && voice.disconnect.mock.calls.length > 0,
      ),
    ).toBe(true);
    audio.play({ type: 'session-started', sessionId: 2 });
    expect(oscillators).toHaveLength(3);
    audio.setPaused(false);
    audio.play({ type: 'session-started', sessionId: 3 });
    expect(oscillators).toHaveLength(6);
    audio.play({ type: 'order-item-completed', fruitType: 'grape' });
    expect(oscillators).toHaveLength(8);
    audio.setEnabled(false);
    audio.play({ type: 'order-item-completed', fruitType: 'orange' });
    expect(oscillators).toHaveLength(8);
    expect(oscillators.every((voice) => voice.disconnect.mock.calls.length > 0)).toBe(true);
    audio.dispose();
    audio.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
