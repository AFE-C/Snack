import type { InputAction } from '../app/ports';
import type { Direction } from '../core/types';
import { SKILL_IDS, UPGRADE_IDS } from '../core/expedition';

const SWIPE_THRESHOLD_PX = 30;
const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

interface InputOptions {
  readonly document: Document;
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly onAction: (action: InputAction) => void;
}

/** 浏览器事件转换为游戏动作，手柄等后续输入也可复用同一动作入口。 */
export class InputController {
  private readonly options: InputOptions;
  private touch: { id: number; x: number; y: number } | null = null;
  private disposed = false;

  constructor(options: InputOptions) {
    this.options = options;
    options.document.addEventListener('keydown', this.onKeyDown);
    options.document.addEventListener('visibilitychange', this.onVisibilityChange);
    options.document.addEventListener('candy:pause', this.onPlatformPause);
    options.root.addEventListener('click', this.onClick);
    options.canvas.addEventListener('pointerdown', this.onPointerDown);
    options.canvas.addEventListener('pointerup', this.onPointerUp);
    options.canvas.addEventListener('pointercancel', this.onPointerCancel);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const { document, root, canvas } = this.options;
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('candy:pause', this.onPlatformPause);
    root.removeEventListener('click', this.onClick);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.clearGesture();
  }

  clearGesture(): void {
    if (this.touch && this.options.canvas.hasPointerCapture?.(this.touch.id))
      this.options.canvas.releasePointerCapture(this.touch.id);
    this.touch = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]'))
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    // 聚焦的按钮由浏览器处理 Enter/Space，菜单也可完整用键盘操作。
    if ((key === 'enter' || key === ' ') && target instanceof Element && target.closest('button'))
      return;
    const direction = KEY_DIRECTIONS[key];
    if (direction) {
      event.preventDefault();
      const menu =
        this.options.root.dataset.screen && this.options.root.dataset.screen !== 'playScreen';
      if (!event.repeat)
        this.options.onAction({ type: menu ? 'navigate-menu' : 'turn', direction });
    } else if (key === ' ' || key === 'enter') {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'primary' });
    } else if (key === 'p' || key === 'escape') {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'toggle-pause' });
    } else if (key === 'q') {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'cut-tail' });
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('[data-action]');
    if (!control || !this.options.root.contains(control)) return;
    if (control instanceof HTMLButtonElement && control.disabled) return;
    switch (control.dataset.action) {
      case 'primary':
        this.options.onAction({ type: 'primary' });
        break;
      case 'toggle-pause':
        this.options.onAction({ type: 'toggle-pause' });
        break;
      case 'toggle-sound':
        this.options.onAction({ type: 'toggle-sound' });
        break;
      case 'cut-tail':
      case 'home':
      case 'open-campaign':
      case 'open-classic':
      case 'level-select':
      case 'next-level':
      case 'open-expedition':
      case 'resume-expedition':
      case 'toggle-fullscreen':
        this.options.onAction({ type: control.dataset.action });
        break;
      case 'select-skill': {
        const skillId = SKILL_IDS.find((id) => id === control.dataset.skillId);
        if (skillId) this.options.onAction({ type: 'select-skill', skillId });
        break;
      }
      case 'choose-upgrade': {
        const upgradeId = UPGRADE_IDS.find((id) => id === control.dataset.upgradeId);
        if (upgradeId) this.options.onAction({ type: 'choose-upgrade', upgradeId });
        break;
      }
      case 'select-level':
        if (control.dataset.levelId)
          this.options.onAction({ type: 'select-level', levelId: control.dataset.levelId });
        break;
      case 'turn': {
        const direction = control.dataset.direction;
        if (
          direction === 'up' ||
          direction === 'down' ||
          direction === 'left' ||
          direction === 'right'
        )
          this.options.onAction({ type: 'turn', direction });
        break;
      }
    }
    control.blur();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || this.touch) return;
    this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.options.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.touch || event.pointerId !== this.touch.id) return;
    const dx = event.clientX - this.touch.x;
    const dy = event.clientY - this.touch.y;
    this.touch = null;
    if (this.options.canvas.hasPointerCapture?.(event.pointerId)) {
      this.options.canvas.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) {
      this.options.onAction({ type: 'primary' });
    } else {
      const direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.options.onAction({ type: 'turn', direction });
    }
    event.preventDefault();
  };

  private readonly onPointerCancel = (): void => {
    this.touch = null;
  };

  private readonly onVisibilityChange = (): void => {
    if (this.options.document.hidden) {
      this.touch = null;
      this.options.onAction({ type: 'pause' });
    }
  };
  private readonly onPlatformPause = (): void => {
    this.clearGesture();
    this.options.onAction({ type: 'pause' });
  };
}
