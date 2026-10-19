import '@fontsource/press-start-2p/latin-400.css';
import './styles.css';
import { GameApplication } from './app/game-application';
import { DEFAULT_SELECTION, LEVELS, MODES } from './content/catalog';
import { GameEngine } from './core/engine';
import { BrowserAudio } from './platform/browser-audio';
import { BrowserStorage } from './platform/browser-storage';
import { InputController } from './platform/input-controller';
import { BrowserGameView } from './ui/browser-game-view';

function bootstrap(): () => void {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('游戏页面缺少必要元素');
  const level = LEVELS[DEFAULT_SELECTION.levelId];
  const mode = MODES[DEFAULT_SELECTION.modeId];
  if (!level || !mode) throw new Error('启动配置中的地图或模式尚未注册');
  const application = new GameApplication({
    engine: new GameEngine({ level, mode }),
    view: new BrowserGameView(root, canvas),
    audio: new BrowserAudio(),
    storage: new BrowserStorage(() => window.localStorage),
    clock: {
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
    },
  });
  const input = new InputController({
    document,
    root,
    canvas,
    onAction: (action) => application.handleAction(action),
  });
  application.mount();
  return () => {
    input.dispose();
    application.dispose();
  };
}

try {
  const dispose = bootstrap();
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  else
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) dispose();
    });
} catch (error) {
  console.error(error);
  const message = document.createElement('p');
  message.className = 'fatal-error';
  message.setAttribute('role', 'alert');
  message.textContent =
    '游戏暂时无法启动。请使用新版浏览器重新打开；修改过地图配置时，请先运行类型检查与测试。';
  document.body.replaceChildren(message);
}
