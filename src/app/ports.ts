import type { GameEvent, GameSnapshot } from '../core/types';
import type { SkillId, UpgradeId } from '../core/expedition';

export interface PlayerSettings {
  readonly highScore: number;
  readonly soundEnabled: boolean;
}

export interface CampaignProgress {
  readonly completedLevelIds: readonly string[];
}

export interface StorageAdapter {
  load(): PlayerSettings;
  saveHighScore(score: number): void;
  saveSoundEnabled(enabled: boolean): void;
  loadCampaignProgress(): CampaignProgress;
  saveCampaignProgress(progress: CampaignProgress): void;
  loadExpedition?(): string | null;
  saveExpedition?(raw: string): void;
}

export interface AudioPort {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  setPaused(paused: boolean): void;
  play(event: GameEvent): void;
  update?(deltaMs: number, snapshot: GameSnapshot): void;
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
  draw(snapshot: GameSnapshot, deltaMs: number, frame?: PresentationFrame): void;
  showOverlay(snapshot: GameSnapshot, isNewRecord: boolean): void;
  hideOverlay(): void;
  dispose(): void;
}

export interface PresentationFrame {
  readonly worldDeltaMs: number;
  readonly aimRemainingMs: number;
  readonly releaseRemainingMs: number;
}

export type InputSource = 'keyboard' | 'gamepad' | 'pointer' | 'button';

export type SessionAction =
  | { readonly type: 'primary' | 'toggle-pause' | 'pause' | 'toggle-sound' | 'cut-tail' }
  | { readonly type: 'turn'; readonly direction: GameSnapshot['direction'] }
  | {
      readonly type: 'skill-press' | 'skill-release' | 'skill-cancel';
      readonly source: InputSource;
    };

export function isSessionAction(action: InputAction): action is SessionAction {
  return (
    action.type === 'primary' ||
    action.type === 'toggle-pause' ||
    action.type === 'pause' ||
    action.type === 'toggle-sound' ||
    action.type === 'cut-tail' ||
    action.type === 'turn' ||
    action.type === 'skill-press' ||
    action.type === 'skill-release' ||
    action.type === 'skill-cancel'
  );
}

export type InputAction =
  | SessionAction
  | {
      readonly type:
        | 'primary'
        | 'toggle-pause'
        | 'pause'
        | 'toggle-sound'
        | 'cut-tail'
        | 'open-campaign'
        | 'open-classic'
        | 'home'
        | 'level-select'
        | 'next-level';
    }
  | { readonly type: 'open-expedition' | 'resume-expedition' | 'toggle-fullscreen' }
  | { readonly type: 'select-skill'; readonly skillId: SkillId }
  | { readonly type: 'choose-upgrade'; readonly upgradeId: UpgradeId }
  | { readonly type: 'navigate-menu'; readonly direction: GameSnapshot['direction'] }
  | { readonly type: 'activate-menu' | 'back-menu' }
  | { readonly type: 'select-level'; readonly levelId: string }
  | { readonly type: 'turn'; readonly direction: GameSnapshot['direction'] };
