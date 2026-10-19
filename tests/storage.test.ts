import { describe, expect, it } from 'vitest';
import {
  BrowserStorage,
  HIGH_SCORE_KEY,
  SOUND_ENABLED_KEY,
  CAMPAIGN_PROGRESS_KEY,
} from '../src/platform/browser-storage';
import { completeLevel, EMPTY_PROGRESS, isLevelUnlocked } from '../src/app/campaign-progress';

function store(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const adapter = new BrowserStorage(() => ({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  }));
  return { adapter, data };
}

describe('浏览器存档', () => {
  it('兼容旧最高分键并保存音效设置', () => {
    const { adapter, data } = store({ [HIGH_SCORE_KEY]: '123', [SOUND_ENABLED_KEY]: 'false' });
    expect(adapter.load()).toEqual({ highScore: 123, soundEnabled: false });
    adapter.saveHighScore(456);
    adapter.saveSoundEnabled(true);
    expect(data.get('candySnakeHighScore')).toBe('456');
    expect(adapter.load()).toEqual({ highScore: 456, soundEnabled: true });
  });

  it.each(['broken-data', '12abc', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', ''])(
    '损坏最高分 %s 恢复为 0',
    (raw) => {
      expect(store({ [HIGH_SCORE_KEY]: raw }).adapter.load().highScore).toBe(0);
    },
  );

  it('不存在或错误的音效设置使用默认值', () => {
    expect(store().adapter.load()).toEqual({ highScore: 0, soundEnabled: true });
    expect(store({ [SOUND_ENABLED_KEY]: 'broken' }).adapter.load().soundEnabled).toBe(true);
  });

  it('存储访问和读写失败都不会阻止游戏', () => {
    const unavailable = new BrowserStorage(() => {
      throw new Error('SecurityError');
    });
    expect(unavailable.load()).toEqual({ highScore: 0, soundEnabled: true });
    expect(() => unavailable.saveHighScore(5)).not.toThrow();
    const broken = new BrowserStorage(() => ({
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    }));
    expect(broken.load().highScore).toBe(0);
    expect(() => broken.saveSoundEnabled(false)).not.toThrow();
  });
});

describe('闯关进度存档', () => {
  it('只按顺序解锁，重玩不重复记录；刷新恢复，不影响经典最高分', () => {
    const { adapter, data } = store({ [HIGH_SCORE_KEY]: '42' });
    expect(adapter.loadCampaignProgress()).toEqual(EMPTY_PROGRESS);
    expect(isLevelUnlocked(EMPTY_PROGRESS, 'garden')).toBe(true);
    expect(isLevelUnlocked(EMPTY_PROGRESS, 'courtyard')).toBe(false);
    expect(completeLevel(EMPTY_PROGRESS, 'alleys')).toBe(EMPTY_PROGRESS);
    let progress = completeLevel(EMPTY_PROGRESS, 'garden');
    expect(completeLevel(progress, 'garden')).toBe(progress);
    progress = completeLevel(progress, 'courtyard');
    adapter.saveCampaignProgress(progress);
    expect(data.get(CAMPAIGN_PROGRESS_KEY)).toBe(
      '{"version":1,"completedLevelIds":["garden","courtyard"]}',
    );
    expect(adapter.loadCampaignProgress()).toEqual(progress);
    expect(isLevelUnlocked(adapter.loadCampaignProgress(), 'alleys')).toBe(true);
    expect(adapter.load().highScore).toBe(42);
  });

  it.each([
    'broken',
    'null',
    '[]',
    '{}',
    '{"version":2,"completedLevelIds":[]}',
    '{"version":1,"completedLevelIds":["alleys"]}',
    '{"version":1,"completedLevelIds":["garden","garden"]}',
    '{"version":1,"completedLevelIds":"garden"}',
    '{"version":1,"completedLevelIds":["garden","unknown"]}',
  ])('损坏记录 %s 只恢复第一关', (raw) => {
    const progress = store({ [CAMPAIGN_PROGRESS_KEY]: raw }).adapter.loadCampaignProgress();
    expect(progress.completedLevelIds).toEqual([]);
    expect(isLevelUnlocked(progress, 'garden')).toBe(true);
    expect(isLevelUnlocked(progress, 'courtyard')).toBe(false);
  });

  it('存储不可用仍保留当前会话进度，读写不抛错', () => {
    const adapter = new BrowserStorage(() => {
      throw new Error('disabled');
    });
    expect(adapter.loadCampaignProgress()).toEqual(EMPTY_PROGRESS);
    expect(() =>
      adapter.saveCampaignProgress(completeLevel(EMPTY_PROGRESS, 'garden')),
    ).not.toThrow();
  });
});
