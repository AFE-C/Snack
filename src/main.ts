import '@fontsource/press-start-2p/latin-400.css';
import './styles.css';
import { GameApplication } from './app/game-application';
import { GameCoordinator } from './app/game-coordinator';
import { GameEngine } from './core/engine';
import { BrowserAudio } from './platform/browser-audio';
import { BrowserStorage } from './platform/browser-storage';
import { InputController } from './platform/input-controller';
import { BrowserGameView } from './ui/browser-game-view';
import { MenuUi } from './ui/menu-ui';

function bootstrap(): () => void {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('游戏页面缺少必要元素');
  const storage = new BrowserStorage(() => window.localStorage);
  const coordinator = new GameCoordinator(
    storage,
    new MenuUi(root),
    (level, mode, onLevelCompleted) =>
      new GameApplication({
        engine: new GameEngine({ level, mode }),
        view: new BrowserGameView(root, canvas),
        audio: new BrowserAudio(),
        storage,
        onLevelCompleted,
        clock: {
          requestFrame: (callback) => requestAnimationFrame(callback),
          cancelFrame: (id) => cancelAnimationFrame(id),
        },
      }),
  );
  const input = new InputController({
    document,
    root,
    canvas,
    onAction: (action) => {
      if (
        action.type === 'primary' ||
        action.type === 'home' ||
        action.type === 'open-classic' ||
        action.type === 'open-campaign' ||
        action.type === 'level-select' ||
        action.type === 'select-level' ||
        action.type === 'next-level'
      )
        input.clearGesture();
      coordinator.handleAction(action);
    },
  });
  coordinator.mount();
  return () => {
    input.dispose();
    coordinator.dispose();
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
  message.textContent = '游戏暂时无法启动。请刷新页面，或使用新版浏览器重新打开。';
  document.body.replaceChildren(message);
}
