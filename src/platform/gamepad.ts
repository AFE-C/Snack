import type { InputAction } from '../app/ports';
import type { Direction } from '../core/types';

/** 按下沿映射，摇杆死区 0.55；输入轮询不拥有游戏或渲染时钟。 */
export class GamepadInput {
  private previous = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly emit: (action: InputAction) => void,
    private readonly menu: () => boolean,
  ) {}

  mount(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (document.hidden) {
        this.previous.clear();
        return;
      }
      try {
        this.poll(navigator.getGamepads?.() ?? []);
      } catch {
        /* 设备访问受限时键盘继续可用。 */
      }
    }, 50);
  }
  poll(pads: ArrayLike<Gamepad | null>): void {
    const pad = Array.from(pads).find((item) => item?.connected);
    const pressed = new Set<string>();
    if (pad) {
      for (const [index, direction] of [
        [12, 'up'],
        [13, 'down'],
        [14, 'left'],
        [15, 'right'],
      ] as const)
        if (pad.buttons[index]?.pressed) pressed.add(direction);
      const x = pad.axes[0] ?? 0,
        y = pad.axes[1] ?? 0;
      if (Math.max(Math.abs(x), Math.abs(y)) > 0.55)
        pressed.add(Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up');
      for (const [index, key] of [
        [0, 'confirm'],
        [1, 'back'],
        [2, 'skill'],
        [5, 'skill'],
        [9, 'pause'],
      ] as const)
        if (pad.buttons[index]?.pressed) pressed.add(key);
    }
    for (const key of pressed) {
      if (this.previous.has(key)) continue;
      if (['up', 'down', 'left', 'right'].includes(key))
        this.emit({ type: this.menu() ? 'navigate-menu' : 'turn', direction: key as Direction });
      else if (key === 'confirm') this.emit({ type: this.menu() ? 'activate-menu' : 'primary' });
      else if (key === 'back') this.emit({ type: this.menu() ? 'back-menu' : 'toggle-pause' });
      else if (key === 'skill') this.emit({ type: 'cut-tail' });
      else this.emit({ type: 'toggle-pause' });
    }
    this.previous = pressed;
  }
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.previous.clear();
  }
}

export function navigateMenu(root: HTMLElement, action: InputAction): void {
  const overlay = root.querySelector<HTMLElement>('#overlay');
  const screen =
    overlay && !overlay.hidden
      ? overlay
      : root.querySelector<HTMLElement>('[data-screen]:not([hidden])');
  if (!screen) return;
  const buttons = [...screen.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(
    (item) => !item.closest('[hidden]'),
  );
  const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (action.type === 'activate-menu') (buttons[focused] ?? buttons[0])?.click();
  else if (action.type === 'navigate-menu') {
    const direction = action.direction === 'left' || action.direction === 'up' ? -1 : 1;
    buttons[focused < 0 ? 0 : (focused + direction + buttons.length) % buttons.length]?.focus();
  }
}
