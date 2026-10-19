import { isGridPosition, isInside, prepareLevel } from './level';
import { DIRECTION_VECTORS, positionKey, samePosition } from './types';
import type {
  Direction,
  EndReason,
  Food,
  GameCommand,
  GameEvent,
  GameSnapshot,
  GameStatus,
  LevelDefinition,
  ModeDefinition,
  Position,
  RandomSource,
  RuleContext,
} from './types';

const MAX_QUEUED_TURNS = 2;
const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export interface GameOptions {
  readonly level: LevelDefinition;
  readonly mode: ModeDefinition;
  readonly random?: RandomSource;
}

/** 确定性的网格游戏核心。仅 dispatch/step 改变状态，没有浏览器副作用。 */
export class GameEngine {
  private readonly level: LevelDefinition;
  private readonly mode: ModeDefinition;
  private readonly random: RandomSource;
  private readonly obstacles: ReadonlySet<string>;
  private readonly turns: Direction[] = [];
  private state: GameSnapshot;

  constructor(options: GameOptions) {
    this.level = prepareLevel(options.level);
    this.mode = this.prepareMode(options.mode);
    this.random = options.random ?? Math.random;
    this.obstacles = new Set(this.level.obstacles.map(positionKey));
    this.state = this.freshState('start', 0);
  }

  getSnapshot(): GameSnapshot {
    return this.state;
  }

  dispatch(command: GameCommand): readonly GameEvent[] {
    switch (command.type) {
      case 'start':
        if (this.state.status !== 'start') return [];
        return this.beginSession();
      case 'restart':
        return this.beginSession();
      case 'pause':
        if (this.state.status !== 'playing') return [];
        return this.changeStatus('paused');
      case 'resume':
        if (this.state.status !== 'paused') return [];
        return this.changeStatus('playing');
      case 'turn':
        this.enqueueTurn(command.direction);
        return [];
    }
  }

  step(): readonly GameEvent[] {
    if (this.state.status !== 'playing') return [];
    const direction = this.turns.shift() ?? this.state.direction;
    const vector = DIRECTION_VECTORS[direction];
    const head = this.state.snake[0];
    if (!head) throw new Error('游戏状态缺少蛇头');
    const next = this.mode.resolveNextPosition(
      { x: head.x + vector.x, y: head.y + vector.y },
      this.level,
    );
    if (!isGridPosition(next)) throw new Error('模式必须返回整数网格坐标');
    if (!isInside(next, this.level)) return this.endGame('wall', direction);
    if (this.obstacles.has(positionKey(next))) return this.endGame('obstacle', direction);
    const food = this.state.food;
    const eating = food !== null && samePosition(food, next);
    // 未进食时尾巴会在同一步移走，目标格可以是当前尾格。
    const retainedBody = eating ? this.state.snake : this.state.snake.slice(0, -1);
    if (retainedBody.some((segment) => samePosition(segment, next))) {
      return this.endGame('body', direction);
    }
    const snake = [next, ...this.state.snake];
    if (!eating) snake.pop();
    let score = this.state.score;
    let combo = this.state.combo;
    let nextFood = food;
    const events: GameEvent[] = [];
    if (eating && food) {
      combo += 1;
      const points = this.mode.calculatePoints(food, combo);
      if (!Number.isSafeInteger(points) || points < 0 || !Number.isSafeInteger(score + points)) {
        throw new Error('模式计分必须返回非负安全整数，且总分不能溢出');
      }
      score += points;
      events.push({ type: 'food-eaten', food, points, combo });
      if (combo % 10 === 0) {
        events.push({ type: 'combo-milestone', food, combo, level: combo / 10 });
      }
      nextFood = this.spawnFood(snake);
    }
    const status = nextFood === null ? 'won' : 'playing';
    this.state = this.snapshot({
      ...this.state,
      snake,
      direction,
      food: nextFood,
      score,
      combo,
      status,
      tick: this.state.tick + 1,
    });
    if (status === 'won') {
      this.turns.length = 0;
      events.push(
        { type: 'status-changed', status },
        { type: 'game-ended', reason: 'completed', score },
      );
    }
    return events;
  }

  private beginSession(): readonly GameEvent[] {
    this.turns.length = 0;
    this.state = this.freshState('playing', this.state.sessionId + 1);
    const events: GameEvent[] = [
      { type: 'session-started', sessionId: this.state.sessionId },
      { type: 'status-changed', status: 'playing' },
    ];
    if (this.state.food === null) {
      this.state = this.snapshot({ ...this.state, status: 'won' });
      events.push(
        { type: 'status-changed', status: 'won' },
        { type: 'game-ended', reason: 'completed', score: 0 },
      );
    }
    return events;
  }

  private changeStatus(status: GameStatus): readonly GameEvent[] {
    this.turns.length = 0;
    this.state = this.snapshot({ ...this.state, status });
    return [{ type: 'status-changed', status }];
  }

  private enqueueTurn(direction: Direction): void {
    if (this.state.status !== 'playing' || this.turns.length >= MAX_QUEUED_TURNS) return;
    const previous = this.turns.at(-1) ?? this.state.direction;
    if (direction === previous || direction === OPPOSITE[previous]) return;
    this.turns.push(direction);
  }

  private endGame(reason: EndReason, direction: Direction): readonly GameEvent[] {
    this.turns.length = 0;
    this.state = this.snapshot({
      ...this.state,
      status: 'gameover',
      direction,
      tick: this.state.tick + 1,
    });
    return [
      { type: 'status-changed', status: 'gameover' },
      { type: 'game-ended', reason, score: this.state.score },
    ];
  }

  private freshState(status: GameStatus, sessionId: number): GameSnapshot {
    const snake = this.level.initialSnake;
    return this.snapshot({
      level: this.level,
      modeId: this.mode.id,
      sessionId,
      status,
      snake,
      direction: this.level.initialDirection,
      food: this.spawnFood(snake),
      score: 0,
      combo: 0,
      tick: 0,
    });
  }

  private snapshot(source: Omit<GameSnapshot, 'stepMs'>): GameSnapshot {
    const stepMs = this.mode.getStepMs(source);
    if (!Number.isFinite(stepMs) || stepMs <= 0) throw new Error('模式步进间隔必须大于 0');
    return Object.freeze({
      ...source,
      snake: Object.freeze(source.snake.map((point) => Object.freeze({ ...point }))),
      food: source.food ? Object.freeze({ ...source.food }) : null,
      stepMs,
    });
  }

  private spawnFood(snake: readonly Position[]): Food | null {
    const occupied = new Set([...this.obstacles, ...snake.map(positionKey)]);
    const free: Position[] = [];
    for (let y = 0; y < this.level.rows; y += 1) {
      for (let x = 0; x < this.level.cols; x += 1) {
        if (!occupied.has(positionKey({ x, y }))) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    const position = free[Math.floor(this.randomUnit() * free.length)];
    if (!position) throw new Error('未能选择食物位置');
    const totalWeight = this.mode.fruits.reduce((sum, fruit) => sum + fruit.weight, 0);
    let selected = this.randomUnit() * totalWeight;
    for (const fruit of this.mode.fruits) {
      if (selected < fruit.weight) {
        return Object.freeze({
          ...position,
          type: fruit.type,
          color: fruit.color,
          points: fruit.points,
        });
      }
      selected -= fruit.weight;
    }
    throw new Error('未能按权重选择果实');
  }

  private randomUnit(): number {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('随机源必须返回 [0, 1) 范围的数值');
    }
    return value;
  }

  private prepareMode(source: ModeDefinition): ModeDefinition {
    const types = new Set<string>();
    let totalWeight = 0;
    for (const fruit of source.fruits) {
      if (
        !fruit.type.trim() ||
        types.has(fruit.type) ||
        !Number.isSafeInteger(fruit.points) ||
        fruit.points < 0 ||
        !Number.isFinite(fruit.weight) ||
        fruit.weight < 0
      ) {
        throw new Error(`模式「${source.id}」的果实配置无效`);
      }
      types.add(fruit.type);
      totalWeight += fruit.weight;
    }
    if (!source.id.trim() || !Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error(`模式「${source.id}」需要有效 id 和正数总权重`);
    }
    return Object.freeze({
      ...source,
      fruits: Object.freeze(source.fruits.map((fruit) => Object.freeze({ ...fruit }))),
    });
  }
}

/** 模式规则可使用此类型，避免依赖具体的引擎实现。 */
export type { RuleContext };
