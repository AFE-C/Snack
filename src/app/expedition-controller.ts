import { ExpeditionRun, parseRun } from './expedition-run';
import type { RunState } from './expedition-run';
import type { InputAction, StorageAdapter } from './ports';
import type { GameSession } from './game-coordinator';
import type { GameEngine } from '../core/engine';
import type { GameSnapshot } from '../core/types';
import type { SkillId, UpgradeId } from '../core/expedition';

export interface ExpeditionNavigation {
  show(screen: string): void;
  showRecipes(): void;
  showRewards(run: RunState, choices: readonly UpgradeId[]): void;
}
export type ExpeditionSessionFactory = (
  engine: GameEngine,
  run: () => RunState,
  ended: (snapshot: GameSnapshot) => void,
) => GameSession;

/** 一个远征也只拥有一个当前局；切换奖励页时销毁该局和它的外设。 */
export class ExpeditionController {
  private run: ExpeditionRun | null = null;
  private session: GameSession | null = null;
  private token = 0;
  private disposed = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly view: ExpeditionNavigation,
    private readonly createSession: ExpeditionSessionFactory,
  ) {}

  open(resume = false): void {
    if (this.disposed) return;
    this.closeRoom();
    const checkpoint = resume ? parseRun(this.storage.loadExpedition?.() ?? null) : null;
    if (checkpoint && (checkpoint.phase === 'room' || checkpoint.phase === 'reward')) {
      this.run = new ExpeditionRun(checkpoint);
      if (checkpoint.phase === 'reward') this.view.showRewards(checkpoint, this.run.getChoices());
      else this.openRoom();
    } else {
      this.run = null;
      this.view.showRecipes();
    }
  }

  getRun(): RunState | null {
    return this.run?.getSnapshot() ?? null;
  }
  getSnapshot(): GameSnapshot | null {
    return this.session?.getSnapshot() ?? null;
  }

  handleAction(action: InputAction): void {
    if (this.disposed) return;
    if (action.type === 'select-skill') this.start(action.skillId);
    else if (action.type === 'choose-upgrade') {
      if (this.run?.choose(action.upgradeId)) {
        this.save();
        this.openRoom();
      }
    } else if (action.type === 'primary') {
      const status = this.session?.getSnapshot().status;
      if (status === 'won') {
        this.closeRoom();
        if (this.run?.getSnapshot().phase === 'reward')
          this.view.showRewards(this.run.getSnapshot(), this.run.getChoices());
        else this.view.showRecipes();
      } else if (status === 'gameover') {
        if (this.run?.getSnapshot().phase === 'lost') {
          this.closeRoom();
          this.view.showRecipes();
        } else this.openRoom();
      } else this.session?.handleAction(action);
    } else this.session?.handleAction(action);
  }

  start(skillId: SkillId, seed = Math.floor(Math.random() * 0x100000000)): void {
    this.run = ExpeditionRun.start(skillId, seed);
    this.save();
    this.openRoom();
  }

  dispose(): void {
    this.disposed = true;
    this.closeRoom();
  }

  private openRoom(): void {
    this.closeRoom();
    const run = this.run;
    if (!run || this.disposed) return;
    this.view.show('playScreen');
    const token = this.token;
    let settled = false;
    this.session = this.createSession(
      run.createEngine(),
      () => run.getSnapshot(),
      (snapshot) => {
        if (this.disposed || token !== this.token || settled) return;
        settled = true;
        if (snapshot.status === 'won') run.complete(snapshot);
        else run.fail();
        this.save();
      },
    );
    this.session.mount();
  }

  private closeRoom(): void {
    this.token += 1;
    this.session?.dispose();
    this.session = null;
  }
  private save(): void {
    if (this.run) this.storage.saveExpedition?.(JSON.stringify(this.run.getSnapshot()));
  }
}
