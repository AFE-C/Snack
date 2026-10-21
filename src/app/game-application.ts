import type { GameEngine } from '../core/engine';
import type { GameCommand, GameEvent, GameSnapshot } from '../core/types';
import type { AudioPort, FrameClock, GameView, InputAction, StorageAdapter } from './ports';
import { selectAudioEvents } from './audio-feedback';
import { isSessionAction } from './ports';
import type { InputSource } from './ports';
import { AIM_DURATION_MS, RELEASE_HOLD_MS } from './action-timing';

const MAX_FRAME_DELTA_MS = 250;
const MAX_STEPS_PER_FRAME = 5;
const END_OVERLAY_DELAY_MS = 800;

interface ApplicationOptions {
  readonly engine: GameEngine;
  readonly view: GameView;
  readonly audio: AudioPort;
  readonly storage: StorageAdapter;
  readonly clock: FrameClock;
  readonly onLevelCompleted?: (levelId: string) => void;
  readonly onGameEnded?: (snapshot: GameSnapshot) => void;
}

/** 协调游戏与外设；一生只持有一个 RAF，重开只替换当前局的数据。 */
export class GameApplication {
  private readonly engine: GameEngine;
  private readonly view: GameView;
  private readonly audio: AudioPort;
  private readonly storage: StorageAdapter;
  private readonly clock: FrameClock;
  private readonly onLevelCompleted: ((levelId: string) => void) | undefined;
  private readonly onGameEnded: ((snapshot: GameSnapshot) => void) | undefined;
  private highScore: number;
  private soundEnabled: boolean;
  private frameId: number | null = null;
  private lastTimestamp: number | null = null;
  private accumulatorMs = 0;
  private mounted = false;
  private disposed = false;
  private isNewRecord = false;
  private pendingEnd: { sessionId: number; elapsedMs: number } | null = null;
  private aimOwner: InputSource | null = null;
  private aimRemainingMs = 0;
  private releaseRemainingMs = 0;

  constructor(options: ApplicationOptions) {
    this.engine = options.engine;
    this.view = options.view;
    this.audio = options.audio;
    this.storage = options.storage;
    this.clock = options.clock;
    this.onLevelCompleted = options.onLevelCompleted;
    this.onGameEnded = options.onGameEnded;
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
    if (this.disposed || !isSessionAction(action)) return;
    switch (action.type) {
      case 'skill-press':
        if (this.aimOwner !== null) break;
        this.audio.unlock();
        this.dispatch({ type: 'begin-aim' });
        if (this.getSnapshot().skillAction?.kind === 'aiming') this.aimOwner = action.source;
        break;
      case 'skill-release':
        if (this.aimOwner !== action.source) break;
        this.aimOwner = null;
        this.dispatch({ type: 'commit-aim' });
        break;
      case 'skill-cancel':
        if (this.aimOwner === action.source) this.dispatch({ type: 'pause' });
        break;
      case 'turn':
        this.dispatch({ type: 'turn', direction: action.direction });
        break;
      case 'pause':
        this.dispatch({ type: 'pause' });
        break;
      case 'cut-tail':
        this.audio.unlock();
        this.dispatch({ type: 'cut-tail' });
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
    this.clearActionTiming();
    this.audio.dispose();
    this.view.dispose();
  }

  private readonly onFrame = (timestamp: number): void => {
    this.frameId = null;
    if (this.disposed) return;
    const elapsedMs = this.lastTimestamp === null ? 0 : Math.max(0, timestamp - this.lastTimestamp);
    const deltaMs = Math.min(MAX_FRAME_DELTA_MS, elapsedMs);
    this.lastTimestamp = timestamp;
    const aiming = this.getSnapshot().skillAction?.kind === 'aiming';
    const releasing = this.releaseRemainingMs > 0;
    if (this.getSnapshot().status === 'playing') {
      if (aiming) {
        this.aimRemainingMs = Math.max(0, this.aimRemainingMs - elapsedMs);
        if (this.aimRemainingMs === 0) this.dispatch({ type: 'commit-aim' });
      } else if (releasing)
        this.releaseRemainingMs = Math.max(0, this.releaseRemainingMs - elapsedMs);
    }
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
    if (this.getSnapshot().status === 'playing' && !aiming && !releasing) {
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
    const presentationDelta = snapshot.status === 'paused' ? 0 : deltaMs;
    this.view.draw(snapshot, presentationDelta, {
      worldDeltaMs: snapshot.status === 'playing' && !aiming && !releasing ? deltaMs : 0,
      aimRemainingMs: this.aimRemainingMs,
      releaseRemainingMs: this.releaseRemainingMs,
    });
    this.audio.update?.(snapshot.status === 'paused' ? 0 : deltaMs, snapshot);
    this.scheduleFrame();
  };

  private processEvents(events: readonly GameEvent[]): void {
    if (events.length === 0) return;
    const snapshot = this.getSnapshot();
    for (const event of events) {
      switch (event.type) {
        case 'session-started':
          this.clearActionTiming();
          this.pendingEnd = null;
          this.isNewRecord = false;
          this.resetClock();
          this.view.reset(snapshot);
          this.view.hideOverlay();
          this.audio.setPaused(false);
          break;
        case 'status-changed':
          if (event.status === 'paused') {
            this.clearActionTiming();
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
          this.clearActionTiming();
          this.resetClock();
          this.isNewRecord = snapshot.modeId === 'classic' && event.score > this.highScore;
          if (this.isNewRecord) {
            this.highScore = event.score;
            this.storage.saveHighScore(this.highScore);
          }
          this.pendingEnd = { sessionId: snapshot.sessionId, elapsedMs: 0 };
          this.onGameEnded?.(snapshot);
          break;
        case 'level-completed':
          this.onLevelCompleted?.(event.levelId);
          break;
        case 'aim-started':
          this.audio.setFocused?.(true);
          this.aimRemainingMs = AIM_DURATION_MS;
          this.accumulatorMs = 0;
          break;
        case 'aim-cancelled':
          this.clearActionTiming();
          this.accumulatorMs = 0;
          break;
        case 'aim-changed':
          break;
        case 'skill-used':
          this.audio.setFocused?.(false);
          this.aimRemainingMs = 0;
          this.releaseRemainingMs = RELEASE_HOLD_MS;
          this.accumulatorMs = 0;
          break;
        case 'terrain-broken':
          break;
        case 'tail-cut':
        case 'exit-opened':
        case 'order-item-completed':
        case 'food-eaten':
        case 'combo-milestone':
          break;
      }
    }
    for (const event of selectAudioEvents(events, snapshot.victoryCondition === 'orders-and-exit'))
      this.audio.play(event);
    this.view.handleEvents(events, snapshot);
    this.updateHud();
  }

  private resetClock(): void {
    this.lastTimestamp = null;
    this.accumulatorMs = 0;
  }

  private clearActionTiming(): void {
    this.audio.setFocused?.(false);
    this.aimOwner = null;
    this.aimRemainingMs = 0;
    this.releaseRemainingMs = 0;
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
