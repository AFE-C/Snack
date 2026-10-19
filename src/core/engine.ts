import { isGridPosition, isInside, prepareLevel } from './level';
import { DIRECTION_VECTORS, positionKey, samePosition } from './types';
import type {
  Direction,
  EndReason,
  Food,
  FruitDefinition,
  GameCommand,
  GameEvent,
  GameSnapshot,
  GameStatus,
  LevelDefinition,
  ModeDefinition,
  OrderProgress,
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
        return this.state.status === 'start' ? this.beginSession() : [];
      case 'restart':
        return this.beginSession();
      case 'pause':
        return this.state.status === 'playing' ? this.changeStatus('paused') : [];
      case 'resume':
        return this.state.status === 'paused' ? this.changeStatus('playing') : [];
      case 'turn':
        this.enqueueTurn(command.direction);
        return [];
      case 'cut-tail':
        return this.cutTail();
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
    const food = this.state.foods.find((item) => samePosition(item, next));
    // 未进食时尾巴会在同一步移走，目标格可以是当前尾格。
    const retainedBody = food ? this.state.snake : this.state.snake.slice(0, -1);
    if (retainedBody.some((segment) => samePosition(segment, next)))
      return this.endGame('body', direction);
    const snake = [next, ...this.state.snake];
    if (!food) snake.pop();
    let score = this.state.score;
    let combo = this.state.combo;
    let orderProgress = this.state.orderProgress;
    const events: GameEvent[] = [];
    if (food) {
      combo += 1;
      const points = this.mode.calculatePoints(food, combo);
      if (!Number.isSafeInteger(points) || points < 0 || !Number.isSafeInteger(score + points)) {
        throw new Error('模式计分必须返回非负安全整数，且总分不能溢出');
      }
      score += points;
      events.push({ type: 'food-eaten', food, points, combo });
      if (combo % 10 === 0)
        events.push({ type: 'combo-milestone', food, combo, level: combo / 10 });
      orderProgress = orderProgress.map((item) => {
        if (item.fruitType !== food.type || item.collected >= item.required) return item;
        const collected = item.collected + 1;
        if (collected === item.required)
          events.push({ type: 'order-item-completed', fruitType: item.fruitType });
        return { ...item, collected };
      });
    }
    const exitActive = this.isOrderComplete(orderProgress);
    if (exitActive && !this.state.exitActive && this.level.exit) {
      events.push({ type: 'exit-opened', exit: this.level.exit });
    }
    const foods = this.replenish(
      snake,
      this.state.foods.filter((item) => item !== food),
      orderProgress,
    );
    const won =
      this.mode.victoryCondition === 'fill-board'
        ? foods.length === 0
        : exitActive && !!this.level.exit && samePosition(next, this.level.exit);
    this.state = this.snapshot({
      ...this.state,
      snake,
      direction,
      foods,
      orderProgress,
      exitActive,
      score,
      combo,
      status: won ? 'won' : 'playing',
      tick: this.state.tick + 1,
    });
    if (won) events.push(...this.winEvents());
    return events;
  }

  private beginSession(): readonly GameEvent[] {
    this.turns.length = 0;
    this.state = this.freshState('playing', this.state.sessionId + 1);
    const events: GameEvent[] = [
      { type: 'session-started', sessionId: this.state.sessionId },
      { type: 'status-changed', status: 'playing' },
    ];
    if (this.mode.victoryCondition === 'fill-board' && this.state.foods.length === 0) {
      this.state = this.snapshot({ ...this.state, status: 'won' });
      events.push(...this.winEvents());
    }
    return events;
  }

  private winEvents(): readonly GameEvent[] {
    this.turns.length = 0;
    const campaign = this.mode.victoryCondition === 'orders-and-exit';
    return [
      { type: 'status-changed', status: 'won' },
      ...(campaign
        ? [{ type: 'level-completed' as const, levelId: this.level.id, score: this.state.score }]
        : []),
      {
        type: 'game-ended',
        reason: campaign ? 'order-completed' : 'completed',
        score: this.state.score,
      },
    ];
  }

  private cutTail(): readonly GameEvent[] {
    const rule = this.mode.tailCut;
    if (!this.state.canCutTail || !rule) return [];
    const segments = this.state.snake.slice(-rule.segments);
    const snake = this.state.snake.slice(0, -rule.segments);
    this.state = this.snapshot({
      ...this.state,
      snake,
      foods: this.replenish(snake, this.state.foods, this.state.orderProgress),
    });
    // 不消费转向、不推进 tick，也不影响分数、连击或订单。
    return [{ type: 'tail-cut', segments }];
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
    const orderProgress =
      this.mode.victoryCondition === 'orders-and-exit'
        ? (this.level.order ?? []).map((item) => ({ ...item, collected: 0 }))
        : [];
    return this.snapshot({
      level: this.level,
      modeId: this.mode.id,
      victoryCondition: this.mode.victoryCondition,
      sessionId,
      status,
      snake,
      direction: this.level.initialDirection,
      foods: this.replenish(snake, [], orderProgress),
      orderProgress,
      exitActive: false,
      score: 0,
      combo: 0,
      tick: 0,
    });
  }

  private snapshot(source: Omit<GameSnapshot, 'stepMs' | 'canCutTail'>): GameSnapshot {
    const stepMs = this.mode.getStepMs(source);
    if (!Number.isFinite(stepMs) || stepMs <= 0) throw new Error('模式步进间隔必须大于 0');
    const rule = this.mode.tailCut;
    return Object.freeze({
      ...source,
      snake: Object.freeze(source.snake.map((point) => Object.freeze({ ...point }))),
      foods: Object.freeze(source.foods.map((food) => Object.freeze({ ...food }))),
      orderProgress: Object.freeze(source.orderProgress.map((item) => Object.freeze({ ...item }))),
      canCutTail:
        source.status === 'playing' &&
        rule !== null &&
        source.snake.length >= rule.minimumLength + rule.segments,
      stepMs,
    });
  }

  private isOrderComplete(progress: readonly OrderProgress[]): boolean {
    return (
      this.mode.victoryCondition === 'orders-and-exit' &&
      progress.length > 0 &&
      progress.every((item) => item.collected >= item.required)
    );
  }

  /** 枚举有限空格，不重试采样；退出格始终保留给玩家。 */
  private replenish(
    snake: readonly Position[],
    existing: readonly Food[],
    progress: readonly OrderProgress[],
  ): readonly Food[] {
    if (this.isOrderComplete(progress)) return [];
    const foods = [...existing];
    const occupied = new Set([
      ...this.obstacles,
      ...snake.map(positionKey),
      ...foods.map(positionKey),
    ]);
    if (this.mode.victoryCondition === 'orders-and-exit' && this.level.exit)
      occupied.add(positionKey(this.level.exit));
    const free: Position[] = [];
    for (let y = 0; y < this.level.rows; y += 1) {
      for (let x = 0; x < this.level.cols; x += 1) {
        if (!occupied.has(positionKey({ x, y }))) free.push({ x, y });
      }
    }
    while (foods.length < this.mode.foodCount && free.length > 0) {
      const index = Math.floor(this.randomUnit() * free.length);
      const position = free.splice(index, 1)[0];
      if (!position) throw new Error('未能选择食物位置');
      foods.push(this.makeFood(position, this.mode.fruits));
    }
    const needed = new Set(
      progress.filter((item) => item.collected < item.required).map((item) => item.fruitType),
    );
    if (foods.length > 0 && needed.size > 0 && !foods.some((item) => needed.has(item.type))) {
      const index = foods.length - 1;
      const position = foods[index];
      if (position)
        foods[index] = this.makeFood(
          position,
          this.mode.fruits.filter((fruit) => needed.has(fruit.type)),
        );
    }
    return foods;
  }

  private makeFood(position: Position, fruits: readonly FruitDefinition[]): Food {
    const totalWeight = fruits.reduce((sum, fruit) => sum + fruit.weight, 0);
    let selected = this.randomUnit() * totalWeight;
    for (const fruit of fruits) {
      if (selected < fruit.weight)
        return {
          x: position.x,
          y: position.y,
          type: fruit.type,
          color: fruit.color,
          points: fruit.points,
        };
      selected -= fruit.weight;
    }
    throw new Error('未能按权重选择果实');
  }

  private randomUnit(): number {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('随机源必须返回 [0, 1) 范围的数值');
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
      )
        throw new Error(`模式「${source.id}」的果实配置无效`);
      types.add(fruit.type);
      totalWeight += fruit.weight;
    }
    if (!source.id.trim() || !Number.isFinite(totalWeight) || totalWeight <= 0)
      throw new Error(`模式「${source.id}」需要有效 id 和正数总权重`);
    if (!Number.isSafeInteger(source.foodCount) || source.foodCount <= 0)
      throw new Error('模式的食物数量必须为正整数');
    if (source.victoryCondition !== 'fill-board' && source.victoryCondition !== 'orders-and-exit')
      throw new Error('未知胜利条件');
    if (
      source.tailCut &&
      (!Number.isSafeInteger(source.tailCut.segments) ||
        source.tailCut.segments <= 0 ||
        !Number.isSafeInteger(source.tailCut.minimumLength) ||
        source.tailCut.minimumLength <= 0)
    )
      throw new Error('断尾规则必须使用正整数');
    if (source.victoryCondition === 'orders-and-exit') {
      if (!this.level.exit || !this.level.order?.length) throw new Error('闯关模式需要订单与出口');
      if (
        this.level.order.some(
          (item) =>
            !source.fruits.some((fruit) => fruit.type === item.fruitType && fruit.weight > 0),
        )
      )
        throw new Error('订单中的水果必须能够生成');
    }
    return Object.freeze({
      ...source,
      fruits: Object.freeze(source.fruits.map((fruit) => Object.freeze({ ...fruit }))),
      tailCut: source.tailCut ? Object.freeze({ ...source.tailCut }) : null,
    });
  }
}

export type { RuleContext };
