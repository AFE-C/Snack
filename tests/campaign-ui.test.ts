// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_LEVELS, CAMPAIGN_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import { InputController } from '../src/platform/input-controller';
import { GameUi } from '../src/ui/game-ui';
import { MenuUi } from '../src/ui/menu-ui';
import { runCampaign, seededRandom } from './helpers/campaign-run';

beforeEach(() => {
  document.body.innerHTML =
    readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
});
function elements() {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('Missing fixture');
  return { root, canvas };
}

describe('闯关输入与界面', () => {
  it('长按 Q 不重复触发，按钮和键盘映射同一断尾动作，销毁后不再响应', () => {
    const { root, canvas } = elements();
    const onAction = vi.fn();
    const input = new InputController({ root, canvas, document, onAction });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Q' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', repeat: true }));
    const cut = root.querySelector<HTMLButtonElement>('#cutTailBtn');
    cut?.click();
    expect(onAction).toHaveBeenCalledTimes(1);
    if (cut) cut.disabled = false;
    cut?.click();
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'cut-tail' },
      { type: 'cut-tail' },
    ]);
    input.dispose();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    cut?.click();
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('方向按钮转向，选关动作保留关卡 id，聚焦按钮的 Enter 交给原生点击', () => {
    const { root, canvas } = elements();
    const onAction = vi.fn();
    const input = new InputController({ root, canvas, document, onAction });
    new MenuUi(root).showLevels({ completedLevelIds: [] });
    root.querySelector<HTMLButtonElement>('[data-level-id="garden"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-direction="left"]')?.click();
    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'select-level', levelId: 'garden' },
      { type: 'turn', direction: 'left' },
    ]);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    root.querySelector<HTMLButtonElement>('[data-action="home"]')?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    input.dispose();
  });

  it('菜单显示顺序解锁和完成状态，只显示一个屏幕', () => {
    const { root } = elements();
    const menu = new MenuUi(root);
    menu.showHome({ completedLevelIds: ['garden'] }, { highScore: 42, soundEnabled: true });
    expect(root.querySelector('#homeProgress')?.textContent).toContain('1 / 3');
    menu.showLevels({ completedLevelIds: ['garden'] });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-action="select-level"]')];
    expect(buttons.map((button) => button.disabled)).toEqual([false, false, true]);
    expect(buttons[0]?.textContent).toContain('已完成');
    menu.showGame();
    expect(
      ['homeScreen', 'levelScreen', 'playScreen'].map(
        (id) => root.querySelector<HTMLElement>(`#${id}`)?.hidden,
      ),
    ).toEqual([true, true, false]);
  });

  it('订单 HUD、断尾可用状态与最终结算来自核心快照', () => {
    const { root } = elements();
    const level = CAMPAIGN_LEVELS[2];
    if (!level) throw new Error('Missing level');
    const engine = new GameEngine({ level, mode: CAMPAIGN_MODE, random: seededRandom(42) });
    const ui = new GameUi(root);
    const settings = { highScore: 99, soundEnabled: true };
    ui.updateHud(engine.getSnapshot(), settings);
    expect(root.querySelector('#recordLabel')?.textContent).toBe('长度');
    expect(root.querySelector('[aria-label="还缺草莓 3 个"]')?.textContent).toContain('×3');
    expect(root.querySelector<HTMLButtonElement>('#cutTailBtn')?.disabled).toBe(true);
    ui.showOverlay(engine.getSnapshot(), false);
    expect(root.querySelector('#primaryBtn')?.textContent).toBe('开始本关');
    const result = runCampaign(engine, true);
    ui.updateHud(result.snapshot, settings);
    ui.showOverlay(result.snapshot, false);
    expect(root.querySelector('#overlayTitle')?.textContent).toBe('三关完成！');
    expect(root.querySelector('#primaryBtn')?.textContent).toBe('返回选关');
    expect(root.querySelector('#exitHint')?.textContent).toContain('出口已点亮');
    expect(root.querySelector('#orderReady')?.textContent).toContain('前往绿色出口');
    expect(root.querySelectorAll('.order-chip:not([hidden])')).toHaveLength(0);
    expect(root.querySelector('#highScore')?.textContent).toBe(
      String(result.snapshot.snake.length),
    );
  });
});
