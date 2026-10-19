import type { CampaignProgress, PlayerSettings, StorageAdapter } from '../app/ports';
import { parseCampaignProgress } from '../app/campaign-progress';

export const HIGH_SCORE_KEY = 'candySnakeHighScore';
export const SOUND_ENABLED_KEY = 'candySnakeSoundEnabled';
export const CAMPAIGN_PROGRESS_KEY = 'candySnakeCampaignProgress';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 访问器也可能抛错，例如禁用存储的 file 页面或隐私模式。 */
export class BrowserStorage implements StorageAdapter {
  constructor(private readonly getStorage: () => KeyValueStorage) {}

  load(): PlayerSettings {
    const rawScore = this.read(HIGH_SCORE_KEY);
    const score = rawScore === null || rawScore.trim() === '' ? 0 : Number(rawScore);
    return {
      highScore: Number.isSafeInteger(score) && score >= 0 ? score : 0,
      soundEnabled: this.read(SOUND_ENABLED_KEY) !== 'false',
    };
  }

  saveHighScore(score: number): void {
    if (Number.isSafeInteger(score) && score >= 0) this.write(HIGH_SCORE_KEY, String(score));
  }

  saveSoundEnabled(enabled: boolean): void {
    this.write(SOUND_ENABLED_KEY, String(enabled));
  }

  loadCampaignProgress(): CampaignProgress {
    return parseCampaignProgress(this.read(CAMPAIGN_PROGRESS_KEY));
  }

  saveCampaignProgress(progress: CampaignProgress): void {
    const raw = JSON.stringify({ version: 1, completedLevelIds: progress.completedLevelIds });
    const validated = parseCampaignProgress(raw);
    this.write(
      CAMPAIGN_PROGRESS_KEY,
      JSON.stringify({ version: 1, completedLevelIds: validated.completedLevelIds }),
    );
  }

  private read(key: string): string | null {
    try {
      return this.getStorage().getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.getStorage().setItem(key, value);
    } catch {
      // 存档是可选能力，失败时当前游戏仍可继续。
    }
  }
}
