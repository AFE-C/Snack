import { CAMPAIGN_LEVELS } from '../content/catalog';
import type { CampaignProgress } from './ports';

export const EMPTY_PROGRESS: CampaignProgress = Object.freeze({
  completedLevelIds: Object.freeze([]),
});

/** 只接受从第一关开始连续完成的记录；未知版本或损坏记录不跳关。 */
export function parseCampaignProgress(raw: string | null): CampaignProgress {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('completedLevelIds' in value)
    )
      return EMPTY_PROGRESS;
    const ids: unknown = value.completedLevelIds;
    if (
      !Array.isArray(ids) ||
      ids.length > CAMPAIGN_LEVELS.length ||
      ids.some((id, index) => id !== CAMPAIGN_LEVELS[index]?.id)
    )
      return EMPTY_PROGRESS;
    return Object.freeze({ completedLevelIds: Object.freeze([...ids] as string[]) });
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function isLevelUnlocked(progress: CampaignProgress, levelId: string): boolean {
  const index = CAMPAIGN_LEVELS.findIndex((level) => level.id === levelId);
  return index >= 0 && index <= progress.completedLevelIds.length;
}

export function completeLevel(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!isLevelUnlocked(progress, levelId) || progress.completedLevelIds.includes(levelId))
    return progress;
  return Object.freeze({
    completedLevelIds: Object.freeze([...progress.completedLevelIds, levelId]),
  });
}
