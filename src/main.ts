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
import { ExpeditionController } from './app/expedition-controller';
import { ExpeditionUi } from './ui/expedition-ui';
import { GamepadInput, navigateMenu } from './platform/gamepad';
import type { InputAction } from './app/ports';
import { ShellUi } from './ui/shell-ui';

function bootstrap(): () => void {
  const root = document.querySelector<HTMLElement>('#gameRoot');
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!root || !canvas) throw new Error('游戏页面缺少必要元素');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const storage = new BrowserStorage(() => window.candyDesktop ?? window.localStorage, {
    effects: reducedMotion ? 'reduced' : 'standard',
    shake: !reducedMotion,
  });
  const shell = new ShellUi(root, storage);
  const menu = new MenuUi(root);
  const clock = {
    requestFrame: (callback: (timestamp: number) => void) => requestAnimationFrame(callback),
    cancelFrame: (id: number) => cancelAnimationFrame(id),
  };
  let expedition: ExpeditionController | null = null;
  const coordinator = new GameCoordinator(
    storage,
    menu,
    (level, mode, onLevelCompleted) =>
      new GameApplication({
        engine: new GameEngine({ level, mode }),
        view: new BrowserGameView(root, canvas),
        audio: new BrowserAudio(),
        storage,
        onLevelCompleted,
        clock,
      }),
  );
  const isMenu = () =>
    shell.settingsOpen ||
    root.dataset.screen !== 'playScreen' ||
    !root.querySelector<HTMLElement>('#overlay')?.hidden;
  const handleAction = (action: InputAction) => {
    if (action.type === 'open-settings') {
      if (expedition) expedition.handleAction({ type: 'pause' });
      else coordinator.handleAction({ type: 'pause' });
      input.clearGesture();
      shell.openSettings();
      return;
    }
    if (
      action.type === 'close-settings' ||
      (shell.settingsOpen && (action.type === 'toggle-pause' || action.type === 'back-menu'))
    ) {
      shell.closeSettings();
      return;
    }
    if (action.type === 'toggle-effects') {
      shell.toggleEffects();
      return;
    }
    if (action.type === 'toggle-shake') {
      shell.toggleShake();
      return;
    }
    if (action.type === 'open-extras') {
      input.clearGesture();
      expedition?.dispose();
      expedition = null;
      coordinator.handleAction({ type: 'home' });
      menu.showExtras();
      return;
    }
    if (action.type === 'toggle-sound' && root.dataset.screen !== 'playScreen') {
      storage.saveSoundEnabled(!storage.load().soundEnabled);
      shell.sync();
      return;
    }
    if (action.type === 'primary' && (shell.settingsOpen || root.dataset.screen !== 'playScreen')) {
      navigateMenu(root, { type: 'activate-menu' });
      return;
    }
    if (action.type === 'toggle-pause' && root.dataset.screen !== 'playScreen') {
      handleAction({ type: 'home' });
      return;
    }
    if (action.type === 'navigate-menu' || action.type === 'activate-menu') {
      navigateMenu(root, action);
      return;
    }
    if (action.type === 'back-menu') {
      if (
        root.dataset.screen === 'playScreen' &&
        !root.querySelector<HTMLButtonElement>('#pauseBtn')?.disabled
      )
        handleAction({ type: 'toggle-pause' });
      else handleAction({ type: 'home' });
      return;
    }
    if (action.type === 'toggle-fullscreen') {
      if (window.candyDesktop) window.candyDesktop.toggleFullscreen();
      else
        void (
          document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.()
        )?.catch(() => {
          const button = root.querySelector<HTMLElement>('.fullscreen-button');
          if (button) button.textContent = '请用浏览器 F11 全屏';
        });
      return;
    }
    const navigation = [
      'home',
      'open-classic',
      'open-campaign',
      'level-select',
      'select-level',
      'open-expedition',
      'resume-expedition',
    ].includes(action.type);
    if (navigation) input.clearGesture();
    if (action.type === 'open-expedition' || action.type === 'resume-expedition') {
      expedition?.dispose();
      coordinator.handleAction({ type: 'home' });
      expedition = new ExpeditionController(
        storage,
        new ExpeditionUi(root),
        (engine, run, onGameEnded) =>
          new GameApplication({
            engine,
            storage,
            clock,
            onGameEnded,
            view: new BrowserGameView(root, canvas, run, () => shell.settings),
            audio: new BrowserAudio(undefined, true),
          }),
      );
      expedition.open(action.type === 'resume-expedition');
    } else if (navigation) {
      expedition?.dispose();
      expedition = null;
      coordinator.handleAction(action);
      menu.updateContinue(storage.loadExpedition());
    } else if (expedition) expedition.handleAction(action);
    else coordinator.handleAction(action);
    if (action.type === 'toggle-sound') shell.sync();
  };
  const input = new InputController({
    document,
    root,
    canvas,
    onAction: handleAction,
  });
  const gamepad = new GamepadInput(handleAction, isMenu, () => root.dataset.mode === 'expedition');
  gamepad.mount();
  coordinator.mount();
  menu.updateContinue(storage.loadExpedition());
  return () => {
    gamepad.dispose();
    expedition?.dispose();
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
