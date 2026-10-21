// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../src/platform/input-controller';
import { GamepadInput } from '../src/platform/gamepad';
import { ExpeditionRun } from '../src/app/expedition-run';
import { ExpeditionUi } from '../src/ui/expedition-ui';
import { BrowserStorage, VISUAL_SETTINGS_KEY } from '../src/platform/browser-storage';
import { DEFAULT_VISUAL_SETTINGS, parseVisualSettings } from '../src/app/visual-settings';
import { BrowserGameView } from '../src/ui/browser-game-view';
import { GameUi } from '../src/ui/game-ui';
import { recordingContext } from './helpers/canvas-context';
import { element } from '../src/ui/dom';

beforeEach(() => {
  document.body.innerHTML =
    readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
});
function setup() {
  const root = element(document, 'gameRoot'),
    canvas = element<HTMLCanvasElement>(root, 'gameCanvas');
  root.dataset.mode = 'expedition';
  root.dataset.screen = 'playScreen';
  element<HTMLButtonElement>(root, 'cutTailBtn').disabled = false;
  const onAction = vi.fn(),
    input = new InputController({ root, canvas, document, onAction });
  return { root, canvas, onAction, input };
}
function pointer(target: HTMLElement, type: string, x: number, y: number, id = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
  target.dispatchEvent(event);
}

describe('星蛇输入', () => {
  it('键盘按下和松开各发一次，重复键和迟到松开被忽略', () => {
    const s = setup();
    for (const repeat of [false, true])
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', repeat }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Q' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'q' }));
    expect(s.onAction.mock.calls.map(([a]) => a)).toEqual([
      { type: 'skill-press', source: 'keyboard' },
      { type: 'skill-release', source: 'keyboard' },
    ]);
    s.input.dispose();
  });
  it('技能按钮按住拖动选方向，其他手指和随后生成的 click 不重复施放', () => {
    const s = setup(),
      button = element(s.root, 'cutTailBtn');
    pointer(button, 'pointerdown', 100, 100);
    pointer(s.root, 'pointerup', 200, 100, 2);
    pointer(s.root, 'pointermove', 100, 50);
    pointer(s.root, 'pointerup', 100, 50);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const actions = s.onAction.mock.calls.map(([a]) => a);
    expect(actions.filter((a) => a.type === 'skill-press')).toHaveLength(1);
    expect(actions.filter((a) => a.type === 'skill-release')).toHaveLength(1);
    expect(actions).toContainEqual({ type: 'turn', direction: 'up' });
    expect(actions.some((a) => a.type === 'cut-tail')).toBe(false);
    s.input.dispose();
  });
  it('触控取消、失焦和模式切换清理手势；迟到的松开不施放', () => {
    const s = setup(),
      button = element(s.root, 'cutTailBtn');
    pointer(button, 'pointerdown', 100, 100);
    pointer(s.root, 'pointercancel', 100, 100);
    expect(s.onAction).toHaveBeenLastCalledWith({ type: 'skill-cancel', source: 'pointer' });
    window.dispatchEvent(new Event('blur'));
    expect(s.onAction).toHaveBeenLastCalledWith({ type: 'pause' });
    s.onAction.mockClear();
    pointer(s.root, 'pointerup', 100, 100);
    expect(s.onAction).not.toHaveBeenCalled();
    s.input.dispose();
  });
  it('手柄两个技能键共享一个按下沿；全部松开才结束，断开会取消', () => {
    const emit = vi.fn(),
      input = new GamepadInput(
        emit,
        () => false,
        () => true,
      );
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = { connected: true, axes: [0, 0], buttons } as unknown as Gamepad;
    buttons[2] = { pressed: true, touched: true, value: 1 };
    input.poll([pad]);
    buttons[5] = { pressed: true, touched: true, value: 1 };
    input.poll([pad]);
    buttons[2] = { pressed: false, touched: false, value: 0 };
    input.poll([pad]);
    expect(emit).toHaveBeenCalledTimes(1);
    input.poll([]);
    expect(emit).toHaveBeenLastCalledWith({ type: 'skill-cancel', source: 'gamepad' });
    input.dispose();
  });
});

describe('星空 HUD 和设置', () => {
  it('目标显示与世界统一，施法尾部标亮，重试和重开清理反馈', () => {
    const { root, input } = setup();
    const run = ExpeditionRun.start('crush', 42),
      engine = run.createEngine(),
      ui = new ExpeditionUi(root);
    engine.dispatch({ type: 'start' });
    ui.updateHud(engine.getSnapshot(), run.getSnapshot());
    expect(element(root, 'orderProgress').textContent).toContain('✦ ×2');
    engine.dispatch({ type: 'begin-aim' });
    ui.updateHud(engine.getSnapshot(), run.getSnapshot());
    expect(root.querySelectorAll('.body-segments .is-cost')).toHaveLength(3);
    ui.handleEvents([{ type: 'order-item-completed', fruitType: 'grape' }]);
    expect(element(root, 'campaignFeedback').textContent).toBe('星星收齐');
    ui.update(0);
    expect(element(root, 'campaignFeedback').hidden).toBe(false);
    ui.update(899);
    expect(element(root, 'campaignFeedback').hidden).toBe(false);
    ui.update(1);
    expect(element(root, 'campaignFeedback').hidden).toBe(true);
    ui.handleEvents([{ type: 'order-item-completed', fruitType: 'grape' }]);
    ui.reset();
    expect(element(root, 'campaignFeedback').hidden).toBe(true);
    input.dispose();
  });
  it('星空视图不调用旧 GameUi，不覆盖经典最高分', () => {
    const { root, canvas, input } = setup(),
      run = ExpeditionRun.start('slow', 42),
      engine = run.createEngine();
    vi.spyOn(canvas, 'getContext').mockReturnValue(recordingContext().context);
    const legacy = vi.spyOn(GameUi.prototype, 'updateHud'),
      view = new BrowserGameView(root, canvas, () => run.getSnapshot());
    view.updateHud(engine.getSnapshot(), { highScore: 999, soundEnabled: false });
    expect(legacy).not.toHaveBeenCalled();
    expect(element(root, 'highScore').textContent).toBe('6');
    expect(root.dataset.theme).toBe('star');
    expect(element(root, 'soundBtn').getAttribute('aria-pressed')).toBe('false');
    view.dispose();
    legacy.mockRestore();
    input.dispose();
  });
  it.each([
    null,
    'broken',
    '{}',
    '{"version":2,"effects":"reduced","shake":false}',
    '{"version":1,"effects":"ultra","shake":false}',
    '{"version":1,"effects":"standard","shake":"false"}',
  ])('异常画面存档 %s 恢复默认', (raw) => {
    expect(parseVisualSettings(raw)).toEqual(DEFAULT_VISUAL_SETTINGS);
  });
  it('独立保存画面设置，保留旧最高分与进度；写入不可用仍可读取默认', () => {
    const data = new Map([
      ['candySnakeHighScore', '123'],
      ['candySnakeExpedition', 'old-save'],
    ]);
    const storage = new BrowserStorage(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    }));
    storage.saveVisualSettings({ effects: 'reduced', shake: false });
    expect(storage.loadVisualSettings()).toEqual({ effects: 'reduced', shake: false });
    expect(data.get('candySnakeHighScore')).toBe('123');
    expect(data.get('candySnakeExpedition')).toBe('old-save');
    expect(data.has(VISUAL_SETTINGS_KEY)).toBe(true);
    const denied = new BrowserStorage(() => {
      throw new Error('denied');
    });
    expect(() => denied.saveVisualSettings({ effects: 'standard', shake: true })).not.toThrow();
    expect(denied.loadVisualSettings()).toEqual(DEFAULT_VISUAL_SETTINGS);
  });
});
