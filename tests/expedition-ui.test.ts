// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpeditionUi } from '../src/ui/expedition-ui';
import { ExpeditionRun } from '../src/app/expedition-run';
import { GameUi } from '../src/ui/game-ui';
import { InputController } from '../src/platform/input-controller';
import { GamepadInput, navigateMenu } from '../src/platform/gamepad';
import { MenuUi } from '../src/ui/menu-ui';
import { getSkill } from '../src/core/expedition';

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

describe('远征输入与界面', () => {
  it('配方与升级按钮保持强类型动作，暂停平台通知也会转为动作', () => {
    const { root, canvas } = elements();
    const action = vi.fn();
    const ui = new ExpeditionUi(root);
    const input = new InputController({ root, canvas, document, onAction: action });
    ui.showRecipes();
    root.querySelector<HTMLButtonElement>('[data-skill-id="crush"]')?.click();
    expect(action).toHaveBeenLastCalledWith({ type: 'select-skill', skillId: 'crush' });
    const state = ExpeditionRun.start('crush', 42).getSnapshot();
    ui.showRewards({ ...state, phase: 'reward' }, ['supply', 'frost', 'aroma']);
    root.querySelector<HTMLButtonElement>('[data-upgrade-id="frost"]')?.click();
    expect(action).toHaveBeenLastCalledWith({ type: 'choose-upgrade', upgradeId: 'frost' });
    document.dispatchEvent(new CustomEvent('candy:pause'));
    expect(action).toHaveBeenLastCalledWith({ type: 'pause' });
    input.dispose();
  });
  it('HUD显示身体、生命、技能强度和订单；结束动作对应当前远征阶段', () => {
    const { root } = elements();
    const run = ExpeditionRun.start('crush', 42);
    const engine = run.createEngine();
    const ui = new ExpeditionUi(root);
    const legacy = new GameUi(root);
    ui.show('playScreen');
    legacy.updateHud(engine.getSnapshot(), { highScore: 99, soundEnabled: true });
    ui.updateHud(engine.getSnapshot(), run.getSnapshot());
    expect(root.dataset.mode).toBe('expedition');
    expect(root.querySelector('#runHearts')?.getAttribute('aria-label')).toBe('剩余 3 颗心');
    expect(root.querySelector('#levelLabel')?.textContent).toContain('1 / 6');
    engine.dispatch({ type: 'start' });
    ui.updateHud(engine.getSnapshot(), run.getSnapshot());
    expect(root.querySelector<HTMLButtonElement>('#cutTailBtn')?.disabled).toBe(false);
    ui.showOverlay(
      { ...engine.getSnapshot(), status: 'gameover' },
      { ...run.getSnapshot(), hearts: 0, phase: 'lost' },
    );
    expect(root.querySelector('#primaryBtn')?.textContent).toBe('重新选择配方');
  });
  it('切换回经典隐藏远征信息，损坏存档不展示继续按钮', () => {
    const { root } = elements();
    const menu = new MenuUi(root);
    const run = ExpeditionRun.start('slow', 42);
    menu.updateContinue(JSON.stringify(run.getSnapshot()));
    expect(root.querySelector<HTMLElement>('#resumeExpedition')?.hidden).toBe(false);
    menu.updateContinue('corrupt');
    expect(root.querySelector<HTMLElement>('#resumeExpedition')?.hidden).toBe(true);
    new ExpeditionUi(root).showRecipes();
    menu.showGame();
    expect(root.querySelector<HTMLElement>('#expeditionHud')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#recipeScreen')?.hidden).toBe(true);
  });
  it('菜单用方向键选按钮，Enter交给原生按钮，Q长按不重复', () => {
    const { root, canvas } = elements();
    new ExpeditionUi(root).showRecipes();
    const actions = vi.fn();
    const input = new InputController({ root, canvas, document, onAction: actions });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(actions).toHaveBeenLastCalledWith({ type: 'navigate-menu', direction: 'right' });
    navigateMenu(root, { type: 'navigate-menu', direction: 'right' });
    expect((document.activeElement as HTMLElement).dataset.skillId).toBe('crush');
    navigateMenu(root, { type: 'navigate-menu', direction: 'right' });
    expect((document.activeElement as HTMLElement).dataset.skillId).toBe('slow');
    navigateMenu(root, { type: 'activate-menu' });
    expect(actions).toHaveBeenLastCalledWith({ type: 'select-skill', skillId: 'slow' });
    actions.mockClear();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', repeat: true }));
    expect(actions).toHaveBeenCalledTimes(1);
    input.dispose();
  });
  it('所有升级效果使用与核心相同的技能预览', () => {
    const status = getSkill(
      { skillId: 'magnet', upgrades: ['economy', 'aroma', 'brittle', 'frost'] },
      12,
      true,
    );
    expect(status).toMatchObject({
      power: 3,
      cost: 2,
      breakRange: 1,
      slowDuration: 4,
      magnetRange: 5,
      available: true,
    });
  });
  it('手柄有死区、按下沿和断开清理，菜单/游戏分别路由', () => {
    const emit = vi.fn();
    let menu = true;
    const input = new GamepadInput(emit, () => menu);
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = { connected: true, axes: [0.2, 0], buttons } as unknown as Gamepad;
    input.poll([pad]);
    expect(emit).not.toHaveBeenCalled();
    buttons[0] = { pressed: true, touched: true, value: 1 };
    input.poll([pad]);
    input.poll([pad]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith({ type: 'activate-menu' });
    input.poll([]);
    menu = false;
    input.poll([pad]);
    expect(emit).toHaveBeenLastCalledWith({ type: 'primary' });
    buttons[2] = { pressed: true, touched: true, value: 1 };
    input.poll([pad]);
    expect(emit).toHaveBeenLastCalledWith({ type: 'cut-tail' });
    input.dispose();
  });
});
