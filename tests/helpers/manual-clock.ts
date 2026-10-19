import type { FrameClock } from '../../src/app/ports';

export class ManualClock implements FrameClock {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  private nextId = 0;
  private time = 0;
  requestFrame(callback: (timestamp: number) => void): number {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  }
  cancelFrame(id: number): void {
    this.callbacks.delete(id);
  }
  advance(delta: number): void {
    this.time += delta;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(this.time));
  }
}
