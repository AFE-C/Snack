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
    if (
      !('version' in value) ||
      !('seed' in value) ||
      !('skillId' in value) ||
      !('roomIndex' in value) ||
      !('hearts' in value) ||
      !('entryLength' in value) ||
      !('score' in value) ||
      !('roomFailures' in value) ||
      !('phase' in value) ||
      !('upgrades' in value)
    )
      return null;
    const integer = (item: unknown, min: number, max: number): item is number =>
      typeof item === 'number' && Number.isSafeInteger(item) && item >= min && item <= max;
    const isSkill = (item: unknown): item is SkillId => SKILL_IDS.some((id) => id === item);
    const isUpgrade = (item: unknown): item is UpgradeId => UPGRADE_IDS.some((id) => id === item);
    if (
      value.version !== 1 ||
      !integer(value.seed, 0, 0xffffffff) ||
      !isSkill(value.skillId) ||
      !integer(value.roomIndex, 0, 5) ||
      !integer(value.hearts, 0, 3) ||
      !integer(value.entryLength, 3, 12) ||
      !integer(value.score, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(value.roomFailures, 0, 3) ||
      (value.phase !== 'room' &&
        value.phase !== 'reward' &&
        value.phase !== 'won' &&
        value.phase !== 'lost') ||
      !Array.isArray(value.upgrades) ||
      !value.upgrades.every(isUpgrade) ||
      new Set(value.upgrades).size !== value.upgrades.length
    )
      return null;
    const run: RunState = {
      version: 1,
      seed: value.seed,
      skillId: value.skillId,
      roomIndex: value.roomIndex,
      hearts: value.hearts,
      entryLength: value.entryLength,
      score: value.score,
      roomFailures: value.roomFailures,
      phase: value.phase,
      upgrades: value.upgrades,
    };
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
