import { CAMPAIGN_LEVELS, CAMPAIGN_MODE, CLASSIC_LEVEL, CLASSIC_MODE } from '../content/catalog';
import type { GameSnapshot, LevelDefinition, ModeDefinition } from '../core/types';
import { completeLevel, isLevelUnlocked } from './campaign-progress';
import type { CampaignProgress, InputAction, PlayerSettings, StorageAdapter } from './ports';

export interface GameSession {
  mount(): void;
  dispose(): void;
  handleAction(action: InputAction): void;
  getSnapshot(): GameSnapshot;
}

export interface NavigationView {
  showHome(progress: CampaignProgress, settings: PlayerSettings): void;
  showLevels(progress: CampaignProgress): void;
  showGame(): void;
}

export type SessionFactory = (
  level: LevelDefinition,
  mode: ModeDefinition,
  onComplete: (levelId: string) => void,
) => GameSession;

/** 导航只拥有一个活动局。输入适配器保持一个实例，动作始终路由到当前局。 */
export class GameCoordinator {
  private session: GameSession | null = null;
  private progress: CampaignProgress;
  private disposed = false;
  private sessionToken = 0;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly view: NavigationView,
    private readonly createSession: SessionFactory,
  ) {
    this.progress = storage.loadCampaignProgress();
  }

  mount(): void {
    if (!this.disposed && !this.session) this.view.showHome(this.progress, this.storage.load());
  }

  handleAction(action: InputAction): void {
    if (this.disposed) return;
    switch (action.type) {
      case 'home':
        this.closeSession();
        this.view.showHome(this.progress, this.storage.load());
        break;
      case 'open-campaign':
      case 'level-select':
        this.closeSession();
        this.view.showLevels(this.progress);
        break;
      case 'open-classic':
        this.openSession(CLASSIC_LEVEL, CLASSIC_MODE);
        break;
      case 'select-level': {
        const level = CAMPAIGN_LEVELS.find((item) => item.id === action.levelId);
        if (level && isLevelUnlocked(this.progress, level.id))
          this.openSession(level, CAMPAIGN_MODE);
        break;
      }
      case 'primary':
      case 'next-level': {
        const snapshot = this.session?.getSnapshot();
        if (snapshot?.modeId === CAMPAIGN_MODE.id && snapshot.status === 'won') {
          const index = CAMPAIGN_LEVELS.findIndex((item) => item.id === snapshot.level.id);
          const next = CAMPAIGN_LEVELS[index + 1];
          if (next && isLevelUnlocked(this.progress, next.id))
            this.openSession(next, CAMPAIGN_MODE);
          else {
            this.closeSession();
            this.view.showLevels(this.progress);
          }
        } else if (action.type === 'primary') this.session?.handleAction(action);
        break;
      }
      default:
        this.session?.handleAction(action);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeSession();
  }

  private openSession(level: LevelDefinition, mode: ModeDefinition): void {
    this.closeSession();
    this.view.showGame();
    const token = this.sessionToken;
    this.session = this.createSession(level, mode, (levelId) => {
      if (
        this.disposed ||
        token !== this.sessionToken ||
        levelId !== level.id ||
        mode.id !== CAMPAIGN_MODE.id
      )
        return;
      this.progress = completeLevel(this.progress, levelId);
      this.storage.saveCampaignProgress(this.progress);
    });
    this.session.mount();
  }

  private closeSession(): void {
    this.sessionToken += 1;
    this.session?.dispose();
    this.session = null;
  }
}
