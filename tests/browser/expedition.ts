import '@fontsource/press-start-2p/latin-400.css';
import '../../src/styles.css';
import markup from '../../index.html?raw';
import { ExpeditionController } from '../../src/app/expedition-controller';
import { GameApplication } from '../../src/app/game-application';
import { BrowserGameView } from '../../src/ui/browser-game-view';
import { ExpeditionUi } from '../../src/ui/expedition-ui';
import { BrowserAudio } from '../../src/platform/browser-audio';
import { BrowserStorage } from '../../src/platform/browser-storage';
import { InputController } from '../../src/platform/input-controller';
import { SKILL_IDS } from '../../src/core/expedition';
import type { SkillId } from '../../src/core/expedition';
import { ManualClock } from '../helpers/manual-clock';
import { nextRoute, runCampaign } from '../helpers/campaign-run';
import { recordTrailer } from './record-trailer';

const source = new DOMParser().parseFromString(markup, 'text/html').querySelector('#gameRoot');
if (!source) throw new Error('Missing fixture');
const root = document.importNode(source, true) as HTMLElement;
document.body.replaceChildren(root);
const canvas = root.querySelector<HTMLCanvasElement>('#gameCanvas');
if (!canvas) throw new Error('Missing canvas');
const clock = new ManualClock();
const storage = new BrowserStorage(() => ({
  getItem: (key) => localStorage.getItem(`candySnakeQa:expedition:${key}`),
  setItem: (key, value) => localStorage.setItem(`candySnakeQa:expedition:${key}`, value),
}));
let active: GameApplication;
function createController(): ExpeditionController {
  return new ExpeditionController(storage, new ExpeditionUi(root), (engine, run, onGameEnded) => {
    active = new GameApplication({
      engine,
      storage,
      clock,
      onGameEnded,
      view: new BrowserGameView(root, canvas as HTMLCanvasElement, run),
      audio: new BrowserAudio(undefined, true),
    });
    return active;
  });
}
let controller = createController();
const panel = document.createElement('aside');
panel.id = 'expeditionQaPanel';
panel.style.cssText =
  'padding:18px;background:#fff9ec;border:2px dashed #af8d73;max-width:1220px;margin:24px auto;font:13px/1.8 system-ui;';
const heading = document.createElement('h2');
heading.textContent = '远征验收 · 种子42 · 手动时钟';
panel.append(heading);
const output = document.createElement('pre');
output.id = 'expeditionQaState';
output.style.cssText = 'white-space:pre-wrap;font:12px/1.8 monospace;';
const result = document.createElement('p');
result.id = 'expeditionQaResult';
result.setAttribute('role', 'status');
function refresh() {
  output.textContent = JSON.stringify(
    { run: controller.getRun(), snapshot: controller.getSnapshot(), loops: clock.callbacks.size },
    null,
    2,
  );
}
function advance() {
  clock.advance(active.getSnapshot().stepMs);
  refresh();
}
function start(skill: SkillId) {
  controller.start(skill, 42);
  refresh();
}
function begin() {
  controller.handleAction({ type: 'primary' });
  clock.advance(0);
}
function driver() {
  return {
    getSnapshot: () => active.getSnapshot(),
    dispatch: (command: Parameters<GameApplication['dispatch']>[0]) => {
      active.dispatch(command);
      if (command.type === 'start') clock.advance(0);
    },
    step: () => advance(),
  };
}
function win() {
  const state = runCampaign(driver(), true);
  clock.advance(0);
  for (let i = 0; i < 4; i++) clock.advance(200);
  result.textContent = `已通关 ${state.snapshot.level.name} · ${state.snapshot.tick} 步 · ${state.cuts} 次技能`;
  refresh();
}
function button(label: string, action: () => void | Promise<void>) {
  const node = document.createElement('button');
  node.textContent = label;
  node.type = 'button';
  node.style.cssText = 'padding:10px;margin:6px;';
  node.addEventListener('click', () => {
    void Promise.resolve()
      .then(action)
      .then(() => {
        refresh();
        window.scrollTo(0, 0);
      })
      .catch((error) => {
        result.textContent = String(error);
      });
    node.blur();
  });
  panel.append(node);
}
for (const skill of SKILL_IDS) button(`验收配方 ${skill}`, () => start(skill));
button('性能采样120帧', async () => {
  start('crush');
  begin();
  const costs: number[] = [],
    timestamps: number[] = [];
  for (let i = 0; i < 120; i++) {
    const direction = nextRoute(active.getSnapshot())?.[0];
    if (direction) active.dispatch({ type: 'turn', direction });
    await new Promise<void>((resolve) =>
      requestAnimationFrame((timestamp) => {
        timestamps.push(timestamp);
        const before = performance.now();
        clock.advance(16);
        costs.push(performance.now() - before);
        resolve();
      }),
    );
  }
  const sorted = [...costs].sort((a, b) => a - b);
  result.textContent = JSON.stringify({
    frames: costs.length,
    updateAndDrawP95Ms: sorted[Math.floor(sorted.length * 0.95)],
    averageFps:
      ((timestamps.length - 1) * 1000) / ((timestamps.at(-1) ?? 1) - (timestamps[0] ?? 0)),
  });
});
button('开始或继续', () => begin());
button('前进一逻辑步', () => advance());
button('瞄准上方', () => {
  if (active.getSnapshot().status === 'start') begin();
  active.handleAction({ type: 'skill-press', source: 'keyboard' });
  active.handleAction({ type: 'turn', direction: 'up' });
  clock.advance(300);
});
button('释放技能', () => {
  active.handleAction({ type: 'skill-release', source: 'keyboard' });
  clock.advance(0);
});
button('时停超时', () => {
  clock.advance(1200);
});
button('停止旧循环', () => {
  controller.dispose();
});
button('收集一颗水果', () => {
  if (active.getSnapshot().status === 'start') begin();
  const combo = active.getSnapshot().combo;
  for (
    let i = 0;
    i < 2000 && active.getSnapshot().status === 'playing' && active.getSnapshot().combo === combo;
    i++
  ) {
    const direction = nextRoute(active.getSnapshot())?.[0];
    if (!direction) throw new Error('无法规划路线');
    active.dispatch({ type: 'turn', direction });
    advance();
  }
});
button('回放本房间', () => win());
button('显示升级选择', () => controller.handleAction({ type: 'primary' }));
button('模拟一次撞击', () => {
  if (active.getSnapshot().status === 'start') begin();
  for (let i = 0; i < 40 && active.getSnapshot().status === 'playing'; i++) advance();
  for (let i = 0; i < 4; i++) clock.advance(200);
});
button('从检查点恢复', () => {
  controller.dispose();
  controller = createController();
  controller.open(true);
});
button('回放完整远征', () => {
  start(controller.getRun()?.skillId ?? 'crush');
  for (let index = 0; index < 6; index++) {
    win();
    if (index < 5) {
      controller.handleAction({ type: 'primary' });
      const state = controller.getRun();
      if (!state) throw new Error('Missing run');
      const choice = root.querySelector<HTMLButtonElement>('[data-upgrade-id]');
      if (!choice) throw new Error('Missing upgrade');
      choice.click();
    }
  }
  result.textContent = '六个房间已完成；只有一个游戏循环。';
});
button('录制23秒实机预告', async () => {
  result.textContent = '正在录制正式核心与绘制模块，请保持页面打开。';
  await recordTrailer(canvas as HTMLCanvasElement, {
    start: (skill) => {
      start(skill);
      begin();
    },
    snapshot: () => active.getSnapshot(),
    run: () => controller.getRun(),
    step: () => advance(),
    command: (command) => active.dispatch(command),
    status: (text) => {
      result.textContent = text;
    },
  });
});
panel.append(result, output);
document.body.append(panel);
const input = new InputController({
  document,
  root,
  canvas,
  onAction: (action) => {
    controller.handleAction(action);
    clock.advance(0);
    refresh();
  },
});
controller.open();
refresh();
import.meta.hot?.dispose(() => {
  input.dispose();
  controller.dispose();
});
