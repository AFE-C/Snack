import type { GameEvent, GameSnapshot, Position } from '../core/types';
import { starKind } from '../content/star-theme';
import { DIRECTION_VECTORS } from '../core/types';
import type { BoardProjection } from './projection';
import { ellipse, glow, starPath } from './star-art';

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
}
interface Beam {
  from: Position;
  to: Position;
  life: number;
  color: string;
}
interface Pull {
  from: Position;
  to: Position;
  life: number;
  type: string;
}

/** All particles carry world positions. UI animations never enter this system. */
export class StarEffects {
  private sparks: Spark[] = [];
  private beams: Beam[] = [];
  private pulls: Pull[] = [];
  private impactMs = 0;
  private timeMs = 0;
  private limited = false;
  setLimited(limited: boolean): void {
    this.limited = limited;
  }
  get shake(): Position {
    return this.impactMs > 0
      ? { x: Math.sin(this.timeMs * 0.11) * 3, y: Math.cos(this.timeMs * 0.13) * 2 }
      : { x: 0, y: 0 };
  }
  reset(): void {
    this.sparks = [];
    this.beams = [];
    this.pulls = [];
    this.impactMs = 0;
    this.timeMs = 0;
  }

  handle(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    const head = snapshot.snake[0];
    if (!head) return;
    const center = (p: Position) => ({ x: p.x + 0.5, y: p.y + 0.5 });
    for (const event of events) {
      if (event.type === 'food-eaten') {
        this.burst(event.food, starKind(event.food.type).color, 10);
        if (event.food.x !== head.x || event.food.y !== head.y)
          this.pulls.push({
            from: center(event.food),
            to: center(head),
            type: event.food.type,
            life: 1,
          });
      } else if (event.type === 'tail-cut') {
        for (const p of event.segments) {
          this.burst(p, '#64E4E8', 5);
          this.beams.push({ from: center(p), to: center(head), color: '#64E4E8', life: 0.65 });
        }
      } else if (event.type === 'skill-used') {
        const v = DIRECTION_VECTORS[snapshot.direction];
        const range = Math.max(event.skill.breakRange, event.skill.magnetRange, 1);
        this.beams.push({
          from: center(head),
          to: { x: head.x + 0.5 + v.x * range, y: head.y + 0.5 + v.y * range },
          life: 1,
          color:
            event.skill.id === 'crush'
              ? '#FFD35A'
              : event.skill.id === 'slow'
                ? '#64E4E8'
                : '#FF819D',
        });
        this.burst(head, '#F4F4E8', 16);
      } else if (event.type === 'terrain-broken') {
        event.positions.forEach((p) => this.burst(p, '#FFD35A', 18));
        this.impactMs = 130;
      } else if (event.type === 'exit-opened' || event.type === 'game-ended') {
        this.burst(event.type === 'exit-opened' ? event.exit : head, '#FFD35A', 24);
      }
    }
    this.beams = this.beams.slice(-16);
    this.pulls = this.pulls.slice(-8);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.timeMs += deltaMs;
    this.impactMs = Math.max(0, this.impactMs - deltaMs);
    for (const p of this.sparks) {
      p.life -= dt * 1.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= dt * 5;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    for (const b of this.beams) b.life -= dt * 3.5;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const pull of this.pulls) pull.life -= dt * 3.2;
    this.pulls = this.pulls.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, projection: BoardProjection): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const beam of this.beams) {
      const a = projection.project(beam.from, 0.45),
        b = projection.project(beam.to, 0.45);
      ctx.globalAlpha = beam.life * 0.55;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = projection.scale * 0.25 * beam.life;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, projection.scale * 0.04);
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      const at = projection.project(p, Math.max(0, p.z));
      starPath(ctx, at.x, at.y, projection.scale * 0.09 * p.life);
      ctx.fill();
    }
    for (const p of this.pulls) {
      const t = 1 - p.life,
        a = projection.project(p.from, 0.5),
        b = projection.project(p.to, 0.5);
      const at = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * projection.scale,
      };
      const color = starKind(p.type).color;
      ctx.globalAlpha = p.life;
      if (!this.limited) glow(ctx, at, projection.scale * 0.4, color);
      ellipse(ctx, at, projection.scale * 0.12, projection.scale * 0.12, color);
    }
    ctx.restore();
  }

  private burst(p: Position, color: string, count: number): void {
    const cap = this.limited ? 64 : 192;
    const total = Math.min(this.limited ? Math.ceil(count / 3) : count, cap - this.sparks.length);
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2,
        speed = 0.5 + Math.random() * 2;
      this.sparks.push({
        x: p.x + 0.5,
        y: p.y + 0.5,
        z: 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 1 + Math.random() * 2,
        life: 0.65 + Math.random() * 0.35,
        color,
      });
    }
  }
}
