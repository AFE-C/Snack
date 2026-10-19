import type { GameEvent, GameSnapshot, Position } from '../core/types';
import { CELL_SIZE, COLORS, RAINBOW } from './theme';

const MAX_PARTICLES = 1200;
const FRAME_MS = 1000 / 60;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  decay: number;
  gravity: number;
  glow: boolean;
  phase: number;
  isStar: boolean;
}
interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  rainbow: boolean;
  lineWidth: number;
}
interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}
interface ParticleOptions {
  speedMul?: number;
  sizeMul?: number;
  secondColor?: string;
  rainbow?: boolean;
}
interface ShockwaveOptions {
  sizeMul?: number;
  rainbow?: boolean;
  lineWidth?: number;
}
interface DeathPiece {
  position: Position;
  color: string;
  atMs: number;
}

/** 所有效果使用相对时间；reset 会一次清除旧局效果，不创建异步计时器。 */
export class EffectSystem {
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];
  private deathPieces: DeathPiece[] = [];
  private deathElapsedMs = 0;
  private shakeMs = 0;

  get isShaking(): boolean {
    return this.shakeMs > 0;
  }

  reset(): void {
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.deathPieces = [];
    this.deathElapsedMs = 0;
    this.shakeMs = 0;
  }

  handleEvents(events: readonly GameEvent[], snapshot: GameSnapshot): void {
    for (const event of events) {
      if (event.type === 'food-eaten') {
        const food = event.food;
        this.spawnParticles(food.x, food.y, food.color, 20, {
          speedMul: 1.3,
          sizeMul: 1.2,
          secondColor: '#ffd93d',
        });
        this.spawnShockwave(food.x, food.y, food.color);
        this.spawnFloatingText(food.x, food.y, '+' + event.points, food.color);
      } else if (event.type === 'combo-milestone') {
        const { food, level } = event;
        this.shakeMs = 300;
        this.spawnParticles(food.x, food.y, '#ff6b9d', 40 + level * 10, {
          speedMul: 1.5 + level * 0.2,
          sizeMul: 1.5,
          rainbow: true,
        });
        this.spawnShockwave(food.x, food.y, '#ff6b9d', {
          sizeMul: 2 + level * 0.5,
          rainbow: true,
          lineWidth: 4,
        });
      } else if (event.type === 'tail-cut') {
        for (const segment of event.segments)
          this.spawnParticles(segment.x, segment.y, COLORS.snakeBodyB, 12, {
            secondColor: '#fff',
            speedMul: 0.8,
          });
      } else if (event.type === 'exit-opened') {
        this.spawnParticles(event.exit.x, event.exit.y, '#58bda0', 35, { secondColor: '#ffe58a' });
        this.spawnShockwave(event.exit.x, event.exit.y, '#58bda0');
        this.spawnFloatingText(event.exit.x, event.exit.y, 'EXIT!', '#23815e');
      } else if (event.type === 'game-ended') {
        if (event.reason === 'completed' || event.reason === 'order-completed') {
          const head = snapshot.snake[0];
          if (head)
            this.spawnParticles(head.x, head.y, COLORS.snakeHead, 100, {
              rainbow: true,
              speedMul: 2,
            });
        } else {
          this.deathPieces = snapshot.snake.map((position, index) => ({
            position,
            atMs: index * 25,
            color:
              index === 0
                ? COLORS.snakeHead
                : index % 2 === 0
                  ? COLORS.snakeBodyA
                  : COLORS.snakeBodyB,
          }));
          this.deathElapsedMs = 0;
        }
      }
    }
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const factor = deltaMs / FRAME_MS;
    this.shakeMs = Math.max(0, this.shakeMs - deltaMs);
    this.deathElapsedMs += deltaMs;
    while (this.deathPieces[0] && this.deathPieces[0].atMs <= this.deathElapsedMs) {
      const piece = this.deathPieces.shift();
      if (piece) {
        this.spawnParticles(piece.position.x, piece.position.y, piece.color, 10, {
          speedMul: 1.5,
          sizeMul: 1.3,
          secondColor: '#ffd93d',
        });
        this.spawnShockwave(piece.position.x, piece.position.y, piece.color);
      }
    }
    for (const particle of this.particles) {
      particle.x += particle.vx * factor;
      particle.y += particle.vy * factor;
      particle.vy += particle.gravity * factor;
      particle.vx *= Math.pow(0.98, factor);
      particle.life -= particle.decay * factor;
      particle.phase += 0.2 * factor;
      const ratio = particle.life / particle.maxLife;
      particle.size =
        particle.baseSize *
        Math.min(1, ratio * 3) *
        Math.max(0, (ratio - 0.3) / 0.7) *
        (1 + 0.2 * Math.sin(particle.phase));
    }
    for (const wave of this.shockwaves) {
      wave.radius += (wave.maxRadius - wave.radius) * (1 - Math.pow(0.85, factor));
      wave.life -= 0.04 * factor;
    }
    for (const text of this.floatingTexts) {
      text.y += text.vy * factor;
      text.life -= 0.02 * factor;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.shockwaves = this.shockwaves.filter((wave) => wave.life > 0);
    this.floatingTexts = this.floatingTexts.filter((text) => text.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { particles, shockwaves, floatingTexts } = this;

    // 冲击环
    shockwaves.forEach((s) => {
      if (s.rainbow) {
        for (let r = 0; r < RAINBOW.length; r++) {
          ctx.globalAlpha = s.life * 0.5;
          ctx.strokeStyle = RAINBOW[r] ?? COLORS.snakeHead;
          ctx.lineWidth = s.lineWidth;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * (1 - r * 0.08), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = s.life * 0.6;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.lineWidth || 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = s.life * 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 发光层
    particles.forEach((p) => {
      if (p.glow && p.size > 1) {
        ctx.globalAlpha = Math.max(0, p.life) * 0.4;
        ctx.fillStyle = p.color;
        const gs = p.size * 2.5;
        ctx.fillRect(
          Math.floor(p.x - gs / 2),
          Math.floor(p.y - gs / 2),
          Math.floor(gs),
          Math.floor(gs),
        );
      }
    });

    // 正常粒子
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.floor(p.size));
      if (p.isStar) {
        // 画十字星
        ctx.fillRect(
          Math.floor(p.x - s / 2),
          Math.floor(p.y - s * 0.1),
          s,
          Math.max(1, Math.floor(s * 0.2)),
        );
        ctx.fillRect(
          Math.floor(p.x - s * 0.1),
          Math.floor(p.y - s / 2),
          Math.max(1, Math.floor(s * 0.2)),
          s,
        );
      } else {
        ctx.fillRect(Math.floor(p.x - s / 2), Math.floor(p.y - s / 2), s, s);
      }
    });

    // 飘字
    floatingTexts.forEach((t) => {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.color;
      ctx.font = 'bold 14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    });

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private spawnParticles(
    gridX: number,
    gridY: number,
    color: string,
    count: number,
    options: ParticleOptions = {},
  ): void {
    const GRID = CELL_SIZE;
    const { particles } = this;

    const cx = gridX * GRID + GRID / 2;
    const cy = gridY * GRID + GRID / 2;
    const opts = options || {};
    const speedMul = opts.speedMul || 1;
    const sizeMul = opts.sizeMul || 1;
    const secondColor = opts.secondColor || color;
    const rainbow = opts.rainbow || false;

    const availableCount = Math.min(count, MAX_PARTICLES - particles.length);
    for (let i = 0; i < availableCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 4.5) * speedMul;
      let pColor = color;
      if (rainbow) {
        pColor = RAINBOW[Math.floor(Math.random() * RAINBOW.length)] ?? color;
      } else if (Math.random() < 0.4) {
        pColor = secondColor;
      }
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseSize: (2 + Math.random() * 5) * sizeMul,
        size: 0,
        color: pColor,
        life: 1,
        maxLife: 0.8 + Math.random() * 0.6,
        decay: 0.012 + Math.random() * 0.015,
        gravity: 0.08 + Math.random() * 0.1,
        glow: Math.random() < 0.4,
        phase: Math.random() * Math.PI * 2,
        isStar: rainbow && Math.random() < 0.2,
      });
    }
  }

  private spawnShockwave(
    gridX: number,
    gridY: number,
    color: string,
    options: ShockwaveOptions = {},
  ): void {
    const GRID = CELL_SIZE;
    const { shockwaves } = this;
    if (shockwaves.length >= 128) shockwaves.shift();

    const cx = gridX * GRID + GRID / 2;
    const cy = gridY * GRID + GRID / 2;
    const opts = options || {};
    shockwaves.push({
      x: cx,
      y: cy,
      radius: 2,
      maxRadius: (opts.sizeMul || 1) * GRID * 2.5,
      color: color,
      life: 1,
      rainbow: opts.rainbow || false,
      lineWidth: opts.lineWidth || 3,
    });
  }

  private spawnFloatingText(gridX: number, gridY: number, text: string, color: string): void {
    const GRID = CELL_SIZE;
    const { floatingTexts } = this;
    if (floatingTexts.length >= 64) floatingTexts.shift();

    floatingTexts.push({
      x: gridX * GRID + GRID / 2,
      y: gridY * GRID + GRID / 2,
      text: text,
      color: color || '#ff6b9d',
      life: 1,
      vy: -1.5,
    });
  }
}
