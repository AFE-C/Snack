import { vi } from 'vitest';

export function recordingContext() {
  type Fill = string | CanvasGradient | CanvasPattern;
  let fill: Fill = '#000';
  const stack: Fill[] = [];
  const rectangles: { x: number; y: number; width: number; height: number; color: Fill }[] = [];
  const methods = {
    get fillStyle(): Fill {
      return fill;
    },
    set fillStyle(value: Fill) {
      fill = value;
    },
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      rectangles.push({ x, y, width, height, color: fill });
    }),
    save: vi.fn(() => {
      stack.push(fill);
    }),
    restore: vi.fn(() => {
      fill = stack.pop() ?? '#000';
    }),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
  };
  return { context: methods as unknown as CanvasRenderingContext2D, rectangles, methods };
}
