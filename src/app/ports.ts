import type { GameEvent, GameSnapshot } from '../core/types';

export interface PlayerSettings {
  readonly highScore: number;
  readonly soundEnabled: boolean;
}

export interface StorageAdapter {
  load(): PlayerSettings;
  saveHighScore(score: number): void;
  saveSoundEnabled(enabled: boolean): void;
}

export interface AudioPort {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  setPaused(paused: boolean): void;
  play(event: GameEvent): void;
  dispose(): void;
}

export interface FrameClock {
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(id: number): void;
}

export interface GameView {
  reset(snapshot: GameSnapshot): void;
  updateHud(snapshot: GameSnapshot, settings: PlayerSettings): void;
  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void;
  draw(snapshot: GameSnapshot, deltaMs: number): void;
  showOverlay(snapshot: GameSnapshot, isNewRecord: boolean): void;
  hideOverlay(): void;
  dispose(): void;
}

export type InputAction =
  | { readonly type: 'primary' | 'toggle-pause' | 'pause' | 'toggle-sound' }
  | { readonly type: 'turn'; readonly direction: GameSnapshot['direction'] };
