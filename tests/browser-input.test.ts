// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASSIC_LEVEL, CLASSIC_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import { InputController } from '../src/platform/input-controller';
import { GameUi } from '../src/ui/game-ui';

const html = readFileSync('index.html', 'utf8');

function setup() {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('Missing test fixture');
  const onAction = vi.fn();
  const input = new InputController({ document, root, canvas, onAction });
  return { input, root, canvas, onAction };
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, id = 1): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
  canvas.dispatchEvent(event);
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
});

describe('浏览器输入适配', () => {
  it('映射键盘操作，长按暂停键不会来回切换', () => {
    const { input, onAction } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'turn', direction: 'up' },
      { type: 'toggle-pause' },
      { type: 'primary' },
    ]);
    input.dispose();
  });

  it('编辑控件和快捷键修饰键不会控制蛇', () => {
    const { input, onAction, root } = setup();
    const editor = document.createElement('textarea');
    root.append(editor);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true }));
    expect(onAction).not.toHaveBeenCalled();
    input.dispose();
  });

  it('触屏按主轴转向，短距离点击触发主操作', () => {
    const { input, onAction, canvas } = setup();
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointerup', 105, 40);
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointerup', 160, 105);
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointerup', 105, 105);
    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'turn', direction: 'up' },
      { type: 'turn', direction: 'right' },
      { type: 'primary' },
    ]);
    input.dispose();
  });

  it('多指和取消手势不会误触发方向', () => {
    const { input, onAction, canvas } = setup();
    pointer(canvas, 'pointerdown', 100, 100, 1);
    pointer(canvas, 'pointerdown', 200, 100, 2);
    pointer(canvas, 'pointerup', 200, 20, 2);
    pointer(canvas, 'pointercancel', 100, 100, 1);
    pointer(canvas, 'pointerup', 100, 20, 1);
    expect(onAction).not.toHaveBeenCalled();
    input.dispose();
  });

  it('切后台发出暂停动作，销毁后所有监听器失效', () => {
    const { input, onAction, root, canvas } = setup();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onAction).toHaveBeenCalledWith({ type: 'pause' });
    input.dispose();
    input.dispose();
    onAction.mockClear();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new Event('visibilitychange'));
    root.querySelector<HTMLButtonElement>('#primaryBtn')?.click();
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointerup', 100, 20);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('遮罩与按钮', () => {
  it('暂停时主按钮明确表示继续，切换状态保持同一个 DOM 节点', () => {
    const { input, root, onAction } = setup();
    const ui = new GameUi(root);
    const engine = new GameEngine({ level: CLASSIC_LEVEL, mode: CLASSIC_MODE, random: () => 0 });
    const primary = root.querySelector<HTMLButtonElement>('#primaryBtn');
    ui.updateHud(engine.getSnapshot(), { highScore: 25, soundEnabled: false });
    ui.showOverlay(engine.getSnapshot(), false);
    expect(root.querySelector('#overlayScore')?.textContent).toBe('最高分: 25');
    engine.dispatch({ type: 'start' });
    engine.dispatch({ type: 'pause' });
    ui.updateHud(engine.getSnapshot(), { highScore: 25, soundEnabled: false });
    ui.showOverlay(engine.getSnapshot(), false);
    expect(primary?.textContent).toBe('继续游戏');
    expect(root.querySelector('#primaryBtn')).toBe(primary);
    primary?.click();
    expect(onAction).toHaveBeenLastCalledWith({ type: 'primary' });
    expect(root.querySelector('#soundBtn')?.getAttribute('aria-label')).toBe('开启音效');
    input.dispose();
  });
});
