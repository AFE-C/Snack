import {
  getRoom,
  getUpgradeChoices,
  makeExpeditionMode,
  makeRoomLevel,
} from '../content/expedition';
import { GameEngine } from '../core/engine';
import { createSeededRandom, SKILL_IDS, UPGRADE_IDS } from '../core/expedition';
import type { SkillId, UpgradeId } from '../core/expedition';
import type { GameSnapshot } from '../core/types';

export interface RunState {
  readonly version: 1;
  readonly seed: number;
  readonly skillId: SkillId;
  readonly upgrades: readonly UpgradeId[];
  readonly roomIndex: number;
  readonly hearts: number;
  readonly entryLength: number;
  readonly score: number;
  readonly roomFailures: number;
  readonly phase: 'room' | 'reward' | 'won' | 'lost';
}

export function parseRun(raw: string | null): RunState | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const r = value as Record<string, unknown>;
    const integer = (key: string, min: number, max: number) =>
      typeof r[key] === 'number' && Number.isSafeInteger(r[key]) && r[key] >= min && r[key] <= max;
    if (
      r.version !== 1 ||
      !integer('seed', 0, 0xffffffff) ||
      !SKILL_IDS.some((id) => id === r.skillId) ||
      !integer('roomIndex', 0, 5) ||
      !integer('hearts', 0, 3) ||
      !integer('entryLength', 3, 12) ||
      !integer('score', 0, Number.MAX_SAFE_INTEGER) ||
      !integer('roomFailures', 0, 3) ||
      !['room', 'reward', 'won', 'lost'].includes(String(r.phase)) ||
      !Array.isArray(r.upgrades) ||
      r.upgrades.some((id) => !UPGRADE_IDS.includes(id)) ||
      new Set(r.upgrades).size !== r.upgrades.length
    )
      return null;
    const run = r as unknown as RunState;
    if (run.phase === 'lost' ? run.hearts !== 0 : run.hearts < 1) return null;
    if (run.phase === 'reward' && run.roomIndex === 5) return null;
    if (run.phase === 'won' && run.roomIndex !== 5) return null;
    if (run.upgrades.length !== run.roomIndex) return null;
    return freezeRun(run);
  } catch {
    return null;
  }
}

function freezeRun(state: RunState): RunState {
  return Object.freeze({ ...state, upgrades: Object.freeze([...state.upgrades]) });
}

/** 只处理房间边界，不拥有时钟、音频或 DOM。入口状态就是重试检查点。 */
export class ExpeditionRun {
  private state: RunState;

  constructor(state: RunState) {
    this.state = freezeRun(state);
  }

  static start(skillId: SkillId, seed: number): ExpeditionRun {
    return new ExpeditionRun({
      version: 1,
      seed: seed >>> 0,
      skillId,
      upgrades: [],
      roomIndex: 0,
      hearts: 3,
      entryLength: 6,
      score: 0,
      roomFailures: 0,
      phase: 'room',
    });
  }

  getSnapshot(): RunState {
    return this.state;
  }

  createEngine(): GameEngine {
    const state = this.state;
    return new GameEngine({
      level: makeRoomLevel(getRoom(state.seed, state.roomIndex), state.entryLength),
      mode: makeExpeditionMode(state),
      random: createSeededRandom((state.seed + (state.roomIndex + 1) * 104729) >>> 0),
    });
  }

  fail(): void {
    if (this.state.phase !== 'room') return;
    const hearts = this.state.hearts - 1;
    this.state = freezeRun({
      ...this.state,
      hearts,
      roomFailures: this.state.roomFailures + 1,
      phase: hearts ? 'room' : 'lost',
    });
  }

  complete(snapshot: GameSnapshot): void {
    const r = this.state;
    if (
      r.phase !== 'room' ||
      snapshot.status !== 'won' ||
      snapshot.modeId !== 'expedition' ||
      snapshot.level.id !== getRoom(r.seed, r.roomIndex).level.id
    )
      return;
    this.state = freezeRun({
      ...r,
      score: r.score + snapshot.score,
      entryLength: snapshot.snake.length,
      hearts: Math.min(
        3,
        r.hearts + (r.upgrades.includes('perfect') && r.roomFailures === 0 ? 1 : 0),
      ),
      phase: r.roomIndex === 5 ? 'won' : 'reward',
    });
  }

  getChoices(): readonly UpgradeId[] {
    return this.state.phase === 'reward'
      ? getUpgradeChoices(this.state.seed, this.state.roomIndex, this.state.upgrades)
      : [];
  }

  choose(id: UpgradeId): boolean {
    if (!this.getChoices().includes(id)) return false;
    const upgrades = [...this.state.upgrades, id];
    this.state = freezeRun({
      ...this.state,
      upgrades,
      roomIndex: this.state.roomIndex + 1,
      entryLength: upgrades.includes('reserve')
        ? Math.max(6, this.state.entryLength)
        : this.state.entryLength,
      roomFailures: 0,
      phase: 'room',
    });
    return true;
  }
}
