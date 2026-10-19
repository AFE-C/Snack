export interface Position {
  readonly x: number;
  readonly y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameStatus = 'start' | 'playing' | 'paused' | 'gameover' | 'won';
export type EndReason = 'wall' | 'body' | 'obstacle' | 'completed' | 'order-completed';
export type VictoryCondition = 'fill-board' | 'orders-and-exit';
export type RandomSource = () => number;

export const DIRECTION_VECTORS: Readonly<Record<Direction, Position>> = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});

export interface FruitDefinition {
  readonly type: string;
  readonly color: string;
  readonly points: number;
  readonly weight: number;
}

export interface Food extends Position {
  readonly type: string;
  readonly color: string;
  readonly points: number;
}

export interface OrderRequirement {
  readonly fruitType: string;
  readonly required: number;
}

export interface OrderProgress extends OrderRequirement {
  readonly collected: number;
}

export interface TailCutRule {
  readonly segments: number;
  readonly minimumLength: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  readonly obstacles: readonly Position[];
  /** 从头到尾排列，方向不能指向颈部。 */
  readonly initialSnake: readonly Position[];
  readonly initialDirection: Direction;
  readonly order?: readonly OrderRequirement[];
  readonly exit?: Position;
}

export interface RuleContext {
  readonly level: LevelDefinition;
  readonly snake: readonly Position[];
  readonly direction: Direction;
  readonly score: number;
  readonly combo: number;
  readonly tick: number;
}

export interface ModeDefinition {
  readonly id: string;
  readonly name: string;
  readonly fruits: readonly FruitDefinition[];
  readonly foodCount: number;
  readonly victoryCondition: VictoryCondition;
  readonly tailCut: TailCutRule | null;
  /** 将下一格映射为实际目标格，例如以后实现穿墙模式。 */
  readonly resolveNextPosition: (next: Position, level: LevelDefinition) => Position;
  readonly calculatePoints: (food: Food, combo: number) => number;
  readonly getStepMs: (context: RuleContext) => number;
}

export interface GameSnapshot extends RuleContext {
  readonly sessionId: number;
  readonly modeId: string;
  readonly status: GameStatus;
  readonly foods: readonly Food[];
  readonly orderProgress: readonly OrderProgress[];
  readonly exitActive: boolean;
  readonly canCutTail: boolean;
  readonly victoryCondition: VictoryCondition;
  readonly stepMs: number;
}

export type GameCommand =
  | { readonly type: 'start' | 'restart' | 'pause' | 'resume' | 'cut-tail' }
  | { readonly type: 'turn'; readonly direction: Direction };

export type GameEvent =
  | { readonly type: 'session-started'; readonly sessionId: number }
  | { readonly type: 'status-changed'; readonly status: GameStatus }
  | { readonly type: 'tail-cut'; readonly segments: readonly Position[] }
  | { readonly type: 'exit-opened'; readonly exit: Position }
  | { readonly type: 'level-completed'; readonly levelId: string; readonly score: number }
  | {
      readonly type: 'food-eaten';
      readonly food: Food;
      readonly points: number;
      readonly combo: number;
    }
  | {
      readonly type: 'combo-milestone';
      readonly food: Food;
      readonly combo: number;
      readonly level: number;
    }
  | { readonly type: 'game-ended'; readonly reason: EndReason; readonly score: number };

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}
