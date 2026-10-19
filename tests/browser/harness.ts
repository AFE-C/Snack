import '@fontsource/press-start-2p/latin-400.css';
import '../../src/styles.css';
import markup from '../../index.html?raw';
import { GameApplication } from '../../src/app/game-application';
import { GameCoordinator } from '../../src/app/game-coordinator';
import { GameEngine } from '../../src/core/engine';
import { BrowserAudio } from '../../src/platform/browser-audio';
import { BrowserStorage } from '../../src/platform/browser-storage';
import { InputController } from '../../src/platform/input-controller';
import { BrowserGameView } from '../../src/ui/browser-game-view';
import { MenuUi } from '../../src/ui/menu-ui';
import { nextRoute, runCampaign, seededRandom } from '../helpers/campaign-run';
import { ManualClock } from '../helpers/manual-clock';

// 仅开发服务上的测试页使用固定随机源与手动时钟；正式入口和发布构建不引用它。
const parsed = new DOMParser().parseFromString(markup, 'text/html');
const sourceRoot = parsed.querySelector<HTMLElement>('#gameRoot');
if (!sourceRoot) throw new Error('Missing fixture root');
const root = document.importNode(sourceRoot, true);
document.body.replaceChildren(root);
const canvas = root.querySelector<HTMLCanvasElement>('#gameCanvas');
if (!canvas) throw new Error('Missing fixture canvas');
const panel = document.createElement('aside');
panel.style.cssText =
  'max-width:464px;width:100%;margin-top:24px;padding:16px;background:white;font:13px/1.8 system-ui;color:#563b52;border:2px dashed #b78db0;';
const title = document.createElement('h2');
title.textContent = '浏览器验收 · 固定种子 42';
title.style.fontSize = '16px';
const note = document.createElement('p');
note.textContent =
  '使用正式核心、应用、输入和绘制模块；手动时钟每次走 150ms。测试存档使用 QA 独立前缀，不影响正式游戏。';
const output = document.createElement('pre');
output.id = 'qaState';
output.style.cssText = 'font:12px/1.8 monospace;white-space:pre-wrap;margin-top:12px;';
output.setAttribute('role', 'status');
const result = document.createElement('p');
result.id = 'qaResult';
result.setAttribute('role', 'status');
panel.append(title, note);
document.body.append(panel);
const clock = new ManualClock();
const storage = new BrowserStorage(() => ({
  getItem: (key) => localStorage.getItem(`candySnakeQa:${key}`),
  setItem: (key, value) => localStorage.setItem(`candySnakeQa:${key}`, value),
}));
let active: GameApplication | null = null;
const coordinator = new GameCoordinator(storage, new MenuUi(root), (level, mode, complete) => {
  active = new GameApplication({
    engine: new GameEngine({ level, mode, random: seededRandom(42) }),
    view: new BrowserGameView(root, canvas),
    audio: new BrowserAudio(),
    storage,
    clock,
    onLevelCompleted: complete,
  });
  return active;
});
const input = new InputController({
  document,
  root,
  canvas,
  onAction: (action) => {
    input.clearGesture();
    coordinator.handleAction(action);
    clock.advance(0);
    refresh();
  },
});

function getActive(): GameApplication {
  if (!active || root.querySelector<HTMLElement>('#playScreen')?.hidden)
    throw new Error('请先进入一个关卡');
  return active;
}
function driver() {
  const application = getActive();
  return {
    getSnapshot: () => application.getSnapshot(),
    dispatch: (command: Parameters<GameApplication['dispatch']>[0]) => {
      application.dispatch(command);
      if (command.type === 'start') clock.advance(0);
    },
    step: () => clock.advance(150),
  };
}
function refresh(): void {
  const state = active?.getSnapshot();
  output.textContent = state
    ? `${state.level.id} | ${state.status} | tick ${state.tick}\n分数 ${state.score} · 连击 ${state.combo} · 长度 ${state.snake.length}\n出口 ${state.exitActive ? '开启' : '未开启'} · 可断尾 ${state.canCutTail}\n${state.orderProgress.map((item) => `${item.fruitType} ${item.collected}/${item.required}`).join(' · ')}\n动画循环 ${clock.callbacks.size}`
    : '请选择模式和关卡';
}
function button(label: string, action: () => void): void {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.style.cssText = 'padding:8px;margin:8px 8px 0 0;cursor:pointer;';
  element.addEventListener('click', () => {
    try {
      action();
    } catch (error) {
      result.textContent = String(error);
    }
    element.blur();
    refresh();
  });
  panel.append(element);
}
button('回放当前关至通关', () => {
  const replay = runCampaign(driver(), getActive().getSnapshot().level.id === 'alleys');
  clock.advance(0);
  for (let index = 0; index < 4; index += 1) clock.advance(200);
  result.textContent = `${replay.snapshot.level.name}已通关 · ${replay.snapshot.tick} 步 · ${replay.cuts} 次断尾 · ${replay.snapshot.score} 分`;
});
function collectTo(length: number): void {
  const runtime = driver();
  runtime.dispatch({ type: 'start' });
  for (
    let step = 0;
    step < 1000 &&
    runtime.getSnapshot().status === 'playing' &&
    runtime.getSnapshot().snake.length < length;
    step += 1
  ) {
    const direction = nextRoute(runtime.getSnapshot())?.[0];
    if (!direction) throw new Error('测试路线不可达');
    runtime.dispatch({ type: 'turn', direction });
    runtime.step();
  }
  result.textContent = `收集结束：长度 ${runtime.getSnapshot().snake.length}`;
}
button('收集到 6 节', () => collectTo(6));
button('收集到 9 节', () => collectTo(9));
button('前进一步 150ms', () => {
  getActive();
  clock.advance(150);
});
panel.append(output, result);
coordinator.mount();
refresh();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    input.dispose();
    coordinator.dispose();
  });
