import type { GameEvent, GameSnapshot, Position } from '../core/types';
import type { PresentationFrame } from '../app/ports';
import { DIRECTION_VECTORS } from '../core/types';
import { getRemainingOrder } from '../core/order';
import { starKind } from '../content/star-theme';
import { AIM_DURATION_MS } from '../app/action-timing';
import { BoardProjection } from './projection';
import { drawStar, ellipse, glow, starPath } from './star-art';
import { StarEffects } from './star-effects';

type Entity =
  | { kind: 'rock'; point: Position; fragile: boolean }
  | { kind: 'food'; point: GameSnapshot['foods'][number] }
  | { kind: 'snake'; point: Position; index: number }
  | { kind: 'exit'; point: Position };

export function sceneEntities(snapshot: GameSnapshot): readonly Entity[] {
  const entities: Entity[] = [
    ...snapshot.level.obstacles.map((point): Entity => ({ kind: 'rock', point, fragile: false })),
    ...(snapshot.fragileObstacles ?? []).map((point): Entity => ({
      kind: 'rock',
      point,
      fragile: true,
    })),
    ...snapshot.foods.map((point): Entity => ({ kind: 'food', point })),
    ...snapshot.snake.map((point, index): Entity => ({ kind: 'snake', point, index })),
    ...(snapshot.level.exit ? [{ kind: 'exit' as const, point: snapshot.level.exit }] : []),
  ];
  return entities.sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
}

/** The rock's collision footprint stays visible even when its foreground body fades. */
export function rockOpacity(rock: Position, protectedPoints: readonly Position[]): number {
  return protectedPoints.some(
    (p) => Math.abs(p.x - rock.x) < 0.8 && rock.y > p.y && rock.y - p.y <= 1,
  )
    ? 0.35
    : 1;
}

export class StarRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects = new StarEffects();
  private timeMs = 0;
  private projection: BoardProjection | null = null;
  private limited = false;
  private shakeEnabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建游戏画布');
    this.ctx = ctx;
  }

  configure(limited: boolean, shake: boolean): void {
    this.limited = limited;
    this.shakeEnabled = shake;
    this.effects.setLimited(limited);
  }

  reset(snapshot: GameSnapshot): void {
    this.effects.reset();
    this.timeMs = 0;
    this.projection = null;
    this.canvas.style.aspectRatio = String(
      BoardProjection.aspectRatio(snapshot.level.cols, snapshot.level.rows),
    );
  }

  handle(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    this.effects.handle(events, snapshot);
  }

  draw(snapshot: GameSnapshot, deltaMs: number, frame?: PresentationFrame): void {
    const worldDelta = frame?.worldDeltaMs ?? deltaMs;
    this.timeMs += worldDelta;
    this.effects.update(worldDelta);
    const p = this.resize(snapshot),
      ctx = this.ctx;
    ctx.clearRect(0, 0, p.width, p.height);
    this.background(p);
    ctx.save();
    if (this.shakeEnabled && deltaMs > 0) {
      const shake = this.effects.shake;
      ctx.translate(shake.x, shake.y);
    }
    this.floor(snapshot, p);
    const needed = new Set(getRemainingOrder(snapshot.orderProgress).map((item) => item.fruitType));
    for (const food of snapshot.foods)
      if (needed.has(food.type)) this.marker(food, p, starKind(food.type).color);
    this.links(snapshot, p);
    const head = snapshot.snake[0];
    const protectedPoints = [
      ...snapshot.foods.filter((f) => needed.has(f.type)),
      ...(head ? [head] : []),
    ];
    for (const entity of sceneEntities(snapshot)) {
      switch (entity.kind) {
        case 'rock':
          this.rock(entity.point, entity.fragile, p, rockOpacity(entity.point, protectedPoints));
          break;
        case 'food':
          this.food(entity.point, p);
          break;
        case 'snake':
          this.segment(entity.point, entity.index, snapshot, p);
          break;
        case 'exit':
          this.exit(entity.point, snapshot.exitActive, p);
          break;
      }
    }
    this.effects.draw(ctx, p);
    if (snapshot.skillAction?.kind === 'aiming')
      this.aim(snapshot, p, frame?.aimRemainingMs ?? AIM_DURATION_MS);
    ctx.restore();
  }

  private resize(snapshot: GameSnapshot): BoardProjection {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 600);
    const height = width / BoardProjection.aspectRatio(snapshot.level.cols, snapshot.level.rows);
    const dpr = Math.min(2, this.canvas.ownerDocument.defaultView?.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr),
      pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.projection || this.projection.width !== width || this.projection.height !== height)
      this.projection = new BoardProjection(
        snapshot.level.cols,
        snapshot.level.rows,
        width,
        height,
      );
    return this.projection;
  }

  private background(p: BoardProjection): void {
    const ctx = this.ctx;
    if (!this.limited) {
      glow(ctx, { x: p.width * 0.25, y: p.height * 0.55 }, p.width * 0.5, '#53428C', 0.17);
      glow(ctx, { x: p.width * 0.8, y: p.height * 0.7 }, p.width * 0.35, '#28798D', 0.16);
    }
    for (let i = 0; i < (this.limited ? 18 : 52); i += 1) {
      const x = ((i * 0.6180339) % 1) * p.width,
        y = ((i * 0.4142135) % 1) * p.height;
      const alpha = 0.14 + Math.sin(i + this.timeMs / 1900) * 0.06;
      ctx.fillStyle = `rgba(244,244,232,${alpha})`;
      ellipse(ctx, { x, y }, i % 5 === 0 ? 1.6 : 0.8, i % 5 === 0 ? 1.6 : 0.8, ctx.fillStyle);
    }
  }

  private floor(snapshot: GameSnapshot, p: BoardProjection): void {
    const ctx = this.ctx,
      a = p.project({ x: 0, y: 0 }),
      b = p.project({ x: snapshot.level.cols, y: snapshot.level.rows });
    const w = b.x - a.x,
      h = b.y - a.y,
      s = p.scale;
    const front = ctx.createLinearGradient(0, b.y, 0, b.y + s * 0.4);
    front.addColorStop(0, '#42527D');
    front.addColorStop(1, '#141C38');
    ctx.fillStyle = front;
    ctx.beginPath();
    ctx.roundRect(a.x, a.y + s * 0.3, w, h, s * 0.18);
    ctx.fill();
    const surface = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    surface.addColorStop(0, '#223453');
    surface.addColorStop(0.5, '#202B49');
    surface.addColorStop(1, '#29365A');
    ctx.fillStyle = surface;
    ctx.strokeStyle = '#8191B9';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, w, h, s * 0.15);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#667BA326';
    ctx.lineWidth = 0.7;
    for (let x = 1; x < snapshot.level.cols; x += 1) {
      const from = p.project({ x, y: 0 }),
        to = p.project({ x, y: snapshot.level.rows });
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    for (let y = 1; y < snapshot.level.rows; y += 1) {
      const from = p.project({ x: 0, y }),
        to = p.project({ x: snapshot.level.cols, y });
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#64E4E862';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x + s * 0.2, b.y + s * 0.27);
    ctx.lineTo(b.x - s * 0.2, b.y + s * 0.27);
    ctx.stroke();
  }

  private marker(point: Position, p: BoardProjection, color: string): void {
    const ctx = this.ctx,
      a = p.project({ x: point.x + 0.1, y: point.y + 0.1 }),
      b = p.project({ x: point.x + 0.9, y: point.y + 0.9 });
    ctx.fillStyle = `${color}12`;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, p.scale * 0.035);
    const length = p.scale * 0.17;
    for (const x of [a.x, b.x])
      for (const y of [a.y, b.y]) {
        ctx.beginPath();
        ctx.moveTo(x, y + (y === a.y ? length : -length));
        ctx.lineTo(x, y);
        ctx.lineTo(x + (x === a.x ? length : -length), y);
        ctx.stroke();
      }
  }

  private links(snapshot: GameSnapshot, p: BoardProjection): void {
    const ctx = this.ctx;
    ctx.lineWidth = p.scale * 0.39;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#82CDD7';
    snapshot.snake.forEach((point, i) => {
      const previous = snapshot.snake[i - 1];
      if (!previous) return;
      const a = p.center(previous, 0.3),
        b = p.center(point, 0.3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  private segment(
    point: Position,
    index: number,
    snapshot: GameSnapshot,
    p: BoardProjection,
  ): void {
    const ctx = this.ctx,
      s = p.scale,
      base = p.center(point),
      at = p.center(point, index === 0 ? 0.44 : 0.32);
    const aiming = snapshot.skillAction?.kind === 'aiming';
    const consumed = aiming && index >= snapshot.snake.length - (snapshot.skill?.cost ?? 3);
    ellipse(ctx, { x: base.x, y: base.y + s * 0.11 }, s * 0.35, s * 0.13, '#080F2855');
    if (!this.limited && (index === 0 || consumed))
      glow(ctx, at, s * 0.8, consumed ? '#FFD35A' : '#64E4E8', consumed ? 0.28 : 0.17);
    const radius = s * (index === 0 ? 0.43 : 0.34);
    const g = ctx.createRadialGradient(
      at.x - radius * 0.35,
      at.y - radius * 0.4,
      radius * 0.05,
      at.x,
      at.y,
      radius * 1.2,
    );
    g.addColorStop(0, consumed ? '#FFF8D2' : '#D1FAF4');
    g.addColorStop(0.5, consumed ? '#FFD35A' : index === 0 ? '#83E1DD' : '#8BB8E0');
    g.addColorStop(1, consumed ? '#D08040' : '#526999');
    ellipse(ctx, at, radius, radius, g);
    ctx.strokeStyle = consumed ? '#FFF2AD' : '#CAE6F7';
    ctx.lineWidth = Math.max(0.8, s * 0.025);
    ctx.stroke();
    if (index !== 0) {
      starPath(ctx, at.x, at.y, s * 0.09);
      ctx.fillStyle = '#F4F4E880';
      ctx.fill();
      return;
    }
    const dir =
      DIRECTION_VECTORS[
        snapshot.skillAction?.kind === 'aiming'
          ? snapshot.skillAction.direction
          : snapshot.direction
      ];
    const ex = at.x + dir.x * radius * 0.23,
      ey = at.y + dir.y * radius * 0.18;
    for (const offset of [-1, 1]) {
      const eye = { x: ex + offset * radius * 0.35, y: ey - radius * 0.05 };
      ellipse(ctx, eye, radius * 0.22, radius * 0.29, '#F7FFFA');
      ellipse(
        ctx,
        { x: eye.x + dir.x * radius * 0.07, y: eye.y + dir.y * radius * 0.09 },
        radius * 0.1,
        radius * 0.16,
        '#172445',
      );
    }
    ctx.beginPath();
    ctx.strokeStyle = '#264366';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.arc(ex, ey + radius * 0.27, radius * 0.18, 0.2, Math.PI - 0.2);
    ctx.stroke();
    starPath(ctx, at.x - radius * 0.52, at.y - radius * 0.91, radius * 0.31);
    ctx.fillStyle = '#FFD35A';
    ctx.fill();
  }

  private food(food: GameSnapshot['foods'][number], p: BoardProjection): void {
    const ctx = this.ctx,
      kind = starKind(food.type),
      base = p.center(food);
    const bob = this.limited ? 0 : Math.sin(this.timeMs / 550 + food.x + food.y) * 0.06;
    const at = p.center(food, 0.55 + bob);
    ellipse(ctx, base, p.scale * 0.2, p.scale * 0.08, '#090F2860');
    if (!this.limited) glow(ctx, at, p.scale * 0.75, kind.color, 0.2);
    drawStar(ctx, at, p.scale * 0.3, kind);
  }

  private rock(point: Position, fragile: boolean, p: BoardProjection, opacity: number): void {
    const ctx = this.ctx,
      s = p.scale,
      base = p.center(point),
      top = p.center(point, 0.62);
    ellipse(ctx, { x: base.x, y: base.y + s * 0.15 }, s * 0.45, s * 0.2, '#0A102F88');
    ctx.strokeStyle = fragile ? '#C5A86A' : '#7182A3';
    ctx.lineWidth = 1;
    ctx.strokeRect(base.x - s * 0.43, base.y - s * 0.33, s * 0.86, s * 0.7);
    ctx.save();
    ctx.globalAlpha = opacity;
    const g = ctx.createLinearGradient(top.x, top.y - s * 0.3, base.x, base.y + s * 0.3);
    g.addColorStop(0, fragile ? '#9F8C9E' : '#8393B1');
    g.addColorStop(0.45, fragile ? '#6E6684' : '#596885');
    g.addColorStop(1, '#303D60');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(top.x - s * 0.41, top.y - s * 0.03);
    ctx.lineTo(top.x - s * 0.2, top.y - s * 0.28);
    ctx.lineTo(top.x + s * 0.24, top.y - s * 0.27);
    ctx.lineTo(top.x + s * 0.44, top.y + s * 0.03);
    ctx.lineTo(base.x + s * 0.4, base.y + s * 0.3);
    ctx.lineTo(base.x - s * 0.37, base.y + s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#C4CEE566';
    ctx.beginPath();
    ctx.moveTo(top.x - s * 0.25, top.y - s * 0.16);
    ctx.lineTo(top.x + s * 0.15, top.y - s * 0.17);
    ctx.stroke();
    if (fragile) {
      ctx.strokeStyle = '#FFD35A';
      ctx.lineWidth = Math.max(1.3, s * 0.045);
      ctx.beginPath();
      ctx.moveTo(top.x + s * 0.1, top.y - s * 0.25);
      ctx.lineTo(top.x - s * 0.07, top.y + s * 0.05);
      ctx.lineTo(top.x + s * 0.09, top.y + s * 0.13);
      ctx.lineTo(base.x - s * 0.06, base.y + s * 0.26);
      ctx.stroke();
    }
    ctx.restore();
  }

  private exit(point: Position, active: boolean, p: BoardProjection): void {
    const ctx = this.ctx,
      base = p.center(point),
      at = p.center(point, 0.65),
      s = p.scale;
    ellipse(ctx, base, s * 0.48, s * 0.17, '#080F2870');
    if (active && !this.limited) glow(ctx, at, s * 1.3, '#FFD35A', 0.3);
    ellipse(ctx, at, s * 0.33, s * 0.47, active ? '#64E4E844' : '#101B35');
    ctx.lineWidth = s * 0.09;
    ctx.strokeStyle = active ? '#FFD35A' : '#73819E';
    ctx.stroke();
    starPath(ctx, at.x, at.y, s * 0.15);
    ctx.fillStyle = active ? '#F4F4E8' : '#8291AC';
    ctx.fill();
  }

  private aim(snapshot: GameSnapshot, p: BoardProjection, remaining: number): void {
    const action = snapshot.skillAction,
      head = snapshot.snake[0];
    if (action?.kind !== 'aiming' || !head) return;
    const ctx = this.ctx,
      s = p.scale;
    ctx.fillStyle = '#090D241F';
    ctx.fillRect(0, 0, p.width, p.height);
    for (const point of action.preview.range) this.marker(point, p, '#64E4E8');
    for (const point of action.preview.broken) this.marker(point, p, '#FFD35A');
    this.marker(action.preview.next, p, action.preview.danger ? '#FF819D' : '#F4F4E8');
    const at = p.center(head, 0.5),
      target = p.center(action.preview.next, 0.5);
    ctx.strokeStyle = action.preview.danger ? '#FF819D' : '#F4F4E8';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const v = DIRECTION_VECTORS[action.direction];
    ctx.beginPath();
    ctx.moveTo(
      target.x - v.x * s * 0.16 - v.y * s * 0.12,
      target.y - v.y * s * 0.16 + v.x * s * 0.12,
    );
    ctx.lineTo(target.x, target.y);
    ctx.lineTo(
      target.x - v.x * s * 0.16 + v.y * s * 0.12,
      target.y - v.y * s * 0.16 - v.x * s * 0.12,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      at.x,
      at.y,
      s * 0.65,
      -Math.PI / 2,
      -Math.PI / 2 + (Math.PI * 2 * remaining) / AIM_DURATION_MS,
    );
    ctx.strokeStyle = '#FFD35A';
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
    if (action.preview.captured) this.marker(action.preview.captured, p, '#FF819D');
  }
}
