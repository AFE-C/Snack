// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameApplication } from '../src/app/game-application';
import { CAMPAIGN_MODE, CLASSIC_LEVEL, CLASSIC_MODE } from '../src/content/catalog';
import { GameEngine } from '../src/core/engine';
import type { GameEvent, LevelDefinition } from '../src/core/types';
import { BrowserAudio } from '../src/platform/browser-audio';
import { BrowserStorage } from '../src/platform/browser-storage';
import { BrowserGameView } from '../src/ui/browser-game-view';
import { GameUi } from '../src/ui/game-ui';
import { MenuUi } from '../src/ui/menu-ui';
import { recordingContext } from './helpers/canvas-context';
import { ManualClock } from './helpers/manual-clock';

const map: LevelDefinition = {
  id: 'feedback-test',
  name: '反馈测试',
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
const completed: GameEvent = { type: 'order-item-completed', fruitType: 'grape' };
const food: GameEvent = {
  type: 'food-eaten',
  food: { type: 'grape', points: 1, color: '#8b5cf6', x: 3, y: 0 },
  points: 2,
  combo: 10,
};
const milestone: GameEvent = { type: 'combo-milestone', food: food.food, combo: 10, level: 1 };

beforeEach(() => {
  document.body.innerHTML =
    readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
});
function setup() {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('Missing UI');
  new MenuUi(root).showGame();
  const engine = new GameEngine({ level: map, mode: CAMPAIGN_MODE, random: () => 0 });
  const ui = new GameUi(root);
  const update = () => ui.updateHud(engine.getSnapshot(), { highScore: 0, soundEnabled: true });
  update();
  return { root, canvas, engine, ui, update };
}

describe('剩余需求与棋盘外反馈', () => {
  it('直接显示剩余量和完整可访问名称；收齐项隐藏，重试恢复', () => {
    const { root, engine, update } = setup();
    expect(root.querySelector('#orderProgress')?.textContent).toContain('🍇 ×1');
    expect(root.querySelector('[aria-label="还缺橙子 1 个"]')).not.toBeNull();
    const slots = root.querySelector('.order-slots');
    const row = root.querySelector('#orderRow');
    engine.dispatch({ type: 'start' });
    engine.step();
    update();
    expect(root.querySelector<HTMLSpanElement>('[aria-label="还缺葡萄 0 个"]')?.hidden).toBe(true);
    expect(root.querySelector('#orderProgress')?.textContent).toBe('🍊 ×1');
    engine.dispatch({ type: 'restart' });
    update();
    expect(root.querySelector('#orderProgress')?.textContent).toContain('🍇 ×1');
    expect(root.querySelector('.order-slots')).toBe(slots);
    expect(root.querySelector('#orderRow')).toBe(row);
  });

  it('全部完成在同一保留区域显示出口，反馈结束仍持续显示', () => {
    const { root, engine, ui, update } = setup();
    engine.dispatch({ type: 'start' });
    for (let i = 0; i < 4; i += 1) ui.showCampaignFeedback(engine.step());
    update();
    expect(root.querySelector<HTMLElement>('#orderRow')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#orderReady')?.hidden).toBe(false);
    expect(root.querySelector('#campaignFeedback')?.textContent).toBe('订单收齐 ✓');
    ui.update(900, false);
    expect(root.querySelector<HTMLElement>('#campaignFeedback')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('#orderReady')?.hidden).toBe(false);
    expect(root.querySelector('#exitHint')?.textContent).toContain('出口已点亮');
  });

  it('收齐反馈覆盖同一步连击加分，在 900ms 内不会被普通进食覆盖', () => {
    const { root, ui } = setup();
    ui.showCampaignFeedback([food, milestone, completed]);
    const feedback = root.querySelector<HTMLElement>('#campaignFeedback');
    expect(feedback?.textContent).toBe('葡萄收齐 ✓');
    expect(feedback?.closest('#canvasWrap')).toBeNull();
    ui.update(450, false);
    ui.showCampaignFeedback([food]);
    expect(feedback?.textContent).toBe('葡萄收齐 ✓');
    ui.update(449, false);
    expect(feedback?.hidden).toBe(false);
    ui.update(1, false);
    expect(feedback?.hidden).toBe(true);
    ui.showCampaignFeedback([food]);
    expect(feedback?.textContent).toBe('+2 分 · 连击 ×10');
  });

  it('暂停的真实应用冻结反馈时长，恢复后才继续计时，重开清除旧提示', () => {
    const { root, canvas, engine } = setup();
    const { context } = recordingContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    const clock = new ManualClock();
    const app = new GameApplication({
      engine,
      view: new BrowserGameView(root, canvas),
      clock,
      audio: new BrowserAudio(() => {
        throw new Error('No audio');
      }),
      storage: new BrowserStorage(() => {
        throw new Error('No storage');
      }),
    });
    app.mount();
    app.dispatch({ type: 'start' });
    clock.advance(0);
    clock.advance(150);
    expect(root.querySelector('#campaignFeedback')?.textContent).toBe('葡萄收齐 ✓');
    app.dispatch({ type: 'pause' });
    clock.advance(60000);
    expect(root.querySelector<HTMLElement>('#campaignFeedback')?.hidden).toBe(false);
    app.dispatch({ type: 'resume' });
    clock.advance(0);
    clock.advance(200);
    expect(root.querySelector<HTMLElement>('#campaignFeedback')?.hidden).toBe(false);
    app.dispatch({ type: 'restart' });
    expect(root.querySelector<HTMLElement>('#campaignFeedback')?.hidden).toBe(true);
    expect(root.querySelector('#campaignFeedback')?.textContent).toBe('');
    expect(root.querySelector('#orderProgress')?.textContent).toContain('🍇 ×1');
    app.dispose();
  });

  it('闯关连击仅显示棋盘外文字；经典模式仍使用原连击弹字', () => {
    const { root, canvas, engine } = setup();
    vi.spyOn(canvas, 'getContext').mockReturnValue(recordingContext().context);
    const view = new BrowserGameView(root, canvas);
    view.updateHud(engine.getSnapshot(), { highScore: 0, soundEnabled: true });
    view.handleEvents([food, milestone], engine.getSnapshot());
    expect(root.querySelector('#campaignFeedback')?.textContent).toBe('连击 ×10');
    expect(root.querySelector('#comboDisplay')?.classList.contains('show')).toBe(false);
    view.dispose();
    expect(root.querySelector('#campaignFeedback')?.textContent).toBe('');
    const classic = new GameEngine({ level: CLASSIC_LEVEL, mode: CLASSIC_MODE, random: () => 0 });
    const classicView = new BrowserGameView(root, canvas);
    classicView.updateHud(classic.getSnapshot(), { highScore: 0, soundEnabled: true });
    classicView.handleEvents([food, milestone], classic.getSnapshot());
    expect(root.querySelector('#comboDisplay')?.classList.contains('show')).toBe(true);
    expect(root.querySelector('#comboDisplay')?.textContent).toContain('x10 COMBO');
    expect(root.querySelector<HTMLElement>('#campaignHud')?.hidden).toBe(true);
    classicView.dispose();
  });
});
