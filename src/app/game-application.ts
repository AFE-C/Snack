import type { GameEngine } from '../core/engine';
import type { GameCommand, GameEvent, GameSnapshot } from '../core/types';
import type { AudioPort, FrameClock, GameView, InputAction, StorageAdapter } from './ports';

const MAX_FRAME_DELTA_MS = 250;
const MAX_STEPS_PER_FRAME = 5;
const END_OVERLAY_DELAY_MS = 800;

interface ApplicationOptions {
  readonly engine: GameEngine;
  readonly view: GameView;
  readonly audio: AudioPort;
  readonly storage: StorageAdapter;
  readonly clock: FrameClock;
}

/** 协调游戏与外设；一生只持有一个 RAF，重开只替换当前局的数据。 */
export class GameApplication {
  private readonly engine: GameEngine;
  private readonly view: GameView;
  private readonly audio: AudioPort;
  private readonly storage: StorageAdapter;
  private readonly clock: FrameClock;
  private highScore: number;
  private soundEnabled: boolean;
  private frameId: number | null = null;
  private lastTimestamp: number | null = null;
  private accumulatorMs = 0;
  private mounted = false;
  private disposed = false;
  private isNewRecord = false;
  private pendingEnd: { sessionId: number; elapsedMs: number } | null = null;

  constructor(options: ApplicationOptions) {
    this.engine = options.engine;
    this.view = options.view;
    this.audio = options.audio;
    this.storage = options.storage;
    this.clock = options.clock;
    const settings = this.storage.load();
    this.highScore = settings.highScore;
    this.soundEnabled = settings.soundEnabled;
    this.audio.setEnabled(this.soundEnabled);
  }

  mount(): void {
    if (this.mounted || this.disposed) return;
    this.mounted = true;
    const snapshot = this.engine.getSnapshot();
    this.view.reset(snapshot);
    this.updateHud();
    this.view.showOverlay(snapshot, false);
    this.view.draw(snapshot, 0);
    this.scheduleFrame();
  }

  getSnapshot(): GameSnapshot {
    return this.engine.getSnapshot();
  }

  handleAction(action: InputAction): void {
    if (this.disposed) return;
    switch (action.type) {
      case 'turn':
        this.dispatch({ type: 'turn', direction: action.direction });
        break;
      case 'pause':
        this.dispatch({ type: 'pause' });
        break;
      case 'toggle-pause':
        this.dispatch({ type: this.getSnapshot().status === 'paused' ? 'resume' : 'pause' });
        break;
      case 'primary': {
        const status = this.getSnapshot().status;
        if (status === 'start') this.dispatch({ type: 'start' });
        else if (status === 'paused') this.dispatch({ type: 'resume' });
        else if (status === 'gameover' || status === 'won') this.dispatch({ type: 'restart' });
        break;
      }
      case 'toggle-sound':
        this.soundEnabled = !this.soundEnabled;
        this.audio.setEnabled(this.soundEnabled);
        this.audio.unlock();
        this.storage.saveSoundEnabled(this.soundEnabled);
        this.updateHud();
        break;
    }
  }

  dispatch(command: GameCommand): void {
    if (this.disposed) return;
    if (command.type === 'start' || command.type === 'restart' || command.type === 'resume') {
      this.audio.unlock();
    }
    this.processEvents(this.engine.dispatch(command));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== null) this.clock.cancelFrame(this.frameId);
    this.frameId = null;
    this.pendingEnd = null;
    this.audio.dispose();
    this.view.dispose();
  }

  private readonly onFrame = (timestamp: number): void => {
    this.frameId = null;
    if (this.disposed) return;
    const deltaMs =
      this.lastTimestamp === null
        ? 0
        : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    if (this.pendingEnd) {
      this.pendingEnd.elapsedMs += deltaMs;
      if (
        this.pendingEnd.sessionId === this.getSnapshot().sessionId &&
        this.pendingEnd.elapsedMs >= END_OVERLAY_DELAY_MS
      ) {
        this.view.showOverlay(this.getSnapshot(), this.isNewRecord);
        this.pendingEnd = null;
      }
    }
    if (this.getSnapshot().status === 'playing') {
      this.accumulatorMs += deltaMs;
      let steps = 0;
      while (this.getSnapshot().status === 'playing' && steps < MAX_STEPS_PER_FRAME) {
        const stepMs = this.getSnapshot().stepMs;
        if (this.accumulatorMs < stepMs) break;
        this.accumulatorMs -= stepMs;
        this.processEvents(this.engine.step());
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulatorMs = 0;
    }
    const snapshot = this.getSnapshot();
    this.view.draw(snapshot, snapshot.status === 'paused' ? 0 : deltaMs);
    this.scheduleFrame();
  };

  private processEvents(events: readonly GameEvent[]): void {
    if (events.length === 0) return;
    const snapshot = this.getSnapshot();
    for (const event of events) {
      switch (event.type) {
        case 'session-started':
          this.pendingEnd = null;
          this.isNewRecord = false;
          this.resetClock();
          this.view.reset(snapshot);
          this.view.hideOverlay();
          this.audio.setPaused(false);
          break;
        case 'status-changed':
          if (event.status === 'paused') {
            this.resetClock();
            this.audio.setPaused(true);
            this.view.showOverlay(snapshot, false);
          } else if (event.status === 'playing') {
            this.resetClock();
            this.audio.setPaused(false);
            this.view.hideOverlay();
          }
          break;
        case 'game-ended':
          this.resetClock();
          this.isNewRecord = event.score > this.highScore;
          if (this.isNewRecord) {
            this.highScore = event.score;
            this.storage.saveHighScore(this.highScore);
          }
          this.pendingEnd = { sessionId: snapshot.sessionId, elapsedMs: 0 };
          break;
        case 'food-eaten':
        case 'combo-milestone':
          break;
      }
      this.audio.play(event);
    }
    this.view.handleEvents(events, snapshot);
    this.updateHud();
  }

  private resetClock(): void {
    this.lastTimestamp = null;
    this.accumulatorMs = 0;
  }

  private updateHud(): void {
    this.view.updateHud(this.getSnapshot(), {
      highScore: this.highScore,
      soundEnabled: this.soundEnabled,
    });
  }

  private scheduleFrame(): void {
    if (!this.disposed && this.frameId === null) {
      this.frameId = this.clock.requestFrame(this.onFrame);
    }
  }
}
