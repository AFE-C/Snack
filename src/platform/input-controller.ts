import type { InputAction } from '../app/ports';
import type { Direction } from '../core/types';

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
    root.removeEventListener('click', this.onClick);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
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
    const direction = KEY_DIRECTIONS[key];
    if (direction) {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'turn', direction });
    } else if (key === ' ' || key === 'enter') {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'primary' });
    } else if (key === 'p' || key === 'escape') {
      event.preventDefault();
      if (!event.repeat) this.options.onAction({ type: 'toggle-pause' });
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
}
