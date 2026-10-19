import { DIRECTION_VECTORS } from '../core/types';
import type { GameSnapshot } from '../core/types';
import { CELL_SIZE, COLORS } from './theme';
import { drawFood } from './draw-food';
import type { EffectSystem } from './effects';

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}
interface Cloud {
  x: number;
  y: number;
  size: number;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: Star[] = [];
  private clouds: Cloud[] = [];
  private timeMs = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建 Canvas 画布');
    this.ctx = context;
  }

  reset(snapshot: GameSnapshot): void {
    const width = snapshot.level.cols * CELL_SIZE;
    const height = snapshot.level.rows * CELL_SIZE;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.aspectRatio = String(width / height);
    this.stars.length = 0;
    this.timeMs = 0;
    for (let index = 0; index < 15; index += 1) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03,
      });
    }
    this.clouds = [
      { x: width * 0.1, y: height * 0.075, size: 1 },
      { x: width * 0.8, y: height * 0.15, size: 0.8 },
      { x: width * 0.375, y: height * 0.875, size: 1.2 },
      { x: width * 0.75, y: height * 0.85, size: 0.9 },
    ];
  }

  draw(snapshot: GameSnapshot, deltaMs: number, effects: EffectSystem): void {
    this.timeMs += deltaMs;
    this.drawBackground(snapshot);
    this.drawObstacles(snapshot);
    drawFood(this.ctx, snapshot.food, CELL_SIZE, this.timeMs);
    this.drawSnake(snapshot);
    effects.draw(this.ctx);
  }

  private drawObstacles(snapshot: GameSnapshot): void {
    for (const obstacle of snapshot.level.obstacles) {
      const x = obstacle.x * CELL_SIZE;
      const y = obstacle.y * CELL_SIZE;
      this.ctx.fillStyle = '#a78bca';
      this.ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      this.ctx.fillStyle = '#d8b4fe';
      this.ctx.fillRect(x + 3, y + 3, CELL_SIZE - 6, 3);
      this.ctx.strokeStyle = '#7e5299';
      this.ctx.strokeRect(x + 1.5, y + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
    }
  }

  private drawBackground(snapshot: GameSnapshot): void {
    const { ctx, canvas, stars, clouds } = this;
    const GRID = CELL_SIZE;
    const COLS = snapshot.level.cols;
    const ROWS = snapshot.level.rows;
    const time = this.timeMs;

    // 渐变底色
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 云朵（像素对齐，避免抖动）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    clouds.forEach((c) => {
      const cx = Math.floor(c.x + Math.sin(time * 0.008 + c.x * 0.1) * 4);
      const cy = Math.floor(c.y);
      const s = c.size;
      ctx.fillRect(cx, cy, Math.floor(24 * s), Math.floor(8 * s));
      ctx.fillRect(
        cx + Math.floor(4 * s),
        cy - Math.floor(4 * s),
        Math.floor(16 * s),
        Math.floor(4 * s),
      );
      ctx.fillRect(
        cx + Math.floor(8 * s),
        cy - Math.floor(6 * s),
        Math.floor(8 * s),
        Math.floor(2 * s),
      );
    });

    // 星星闪烁
    stars.forEach((st) => {
      const twinkle = 0.5 + 0.5 * Math.sin(time * st.speed + st.phase);
      ctx.globalAlpha = twinkle * 0.8;
      ctx.fillStyle = '#fff';
      const s = st.size;
      ctx.fillRect(Math.floor(st.x - s / 2), Math.floor(st.y), s, 1);
      ctx.fillRect(Math.floor(st.x), Math.floor(st.y - s / 2), 1, s);
      ctx.globalAlpha = 1;
    });

    // 网格
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * GRID + 0.5, 0);
      ctx.lineTo(i * GRID + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * GRID + 0.5);
      ctx.lineTo(canvas.width, i * GRID + 0.5);
      ctx.stroke();
    }
  }

  private drawSnake(snapshot: GameSnapshot): void {
    const { ctx } = this;
    const snake = snapshot.snake;
    const direction = DIRECTION_VECTORS[snapshot.direction];
    const GRID = CELL_SIZE;

    snake.forEach((seg, i) => {
      const x = seg.x * GRID;
      const y = seg.y * GRID;

      // 身体交替粉紫
      const bodyColor = i % 2 === 0 ? COLORS.snakeBodyA : COLORS.snakeBodyB;
      ctx.fillStyle = i === 0 ? COLORS.snakeHead : bodyColor;

      // 圆角像素身体
      ctx.fillRect(x + 2, y + 1, GRID - 4, GRID - 2);
      ctx.fillRect(x + 1, y + 2, GRID - 2, GRID - 4);

      // 糖衣高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x + 3, y + 3, 3, 2);

      if (i === 0) {
        // 腮红
        ctx.fillStyle = COLORS.snakeCheek;
        if (direction.x === 1) {
          ctx.fillRect(x + 13, y + 12, 4, 3);
        } else if (direction.x === -1) {
          ctx.fillRect(x + 3, y + 12, 4, 3);
        } else if (direction.y === -1) {
          ctx.fillRect(x + 3, y + 13, 4, 3);
          ctx.fillRect(x + 13, y + 13, 4, 3);
        } else {
          ctx.fillRect(x + 3, y + 11, 4, 3);
          ctx.fillRect(x + 13, y + 11, 4, 3);
        }

        // 眼睛（白色大眼）
        ctx.fillStyle = COLORS.snakeEye;
        const eyeW = 5,
          eyeH = 5;
        let ex1, ey1, ex2, ey2;
        if (direction.x === 1) {
          ex1 = x + 11;
          ey1 = y + 4;
          ex2 = x + 11;
          ey2 = y + 11;
        } else if (direction.x === -1) {
          ex1 = x + 4;
          ey1 = y + 4;
          ex2 = x + 4;
          ey2 = y + 11;
        } else if (direction.y === -1) {
          ex1 = x + 4;
          ey1 = y + 3;
          ex2 = x + 11;
          ey2 = y + 3;
        } else {
          ex1 = x + 4;
          ey1 = y + 12;
          ex2 = x + 11;
          ey2 = y + 12;
        }
        ctx.fillRect(ex1, ey1, eyeW, eyeH);
        ctx.fillRect(ex2, ey2, eyeW, eyeH);

        // 瞳孔
        ctx.fillStyle = COLORS.snakePupil;
        const pw = 2,
          ph = 2;
        if (direction.x === 1) {
          ctx.fillRect(ex1 + 2, ey1 + 2, pw, ph);
          ctx.fillRect(ex2 + 2, ey2 + 2, pw, ph);
        } else if (direction.x === -1) {
          ctx.fillRect(ex1 + 1, ey1 + 2, pw, ph);
          ctx.fillRect(ex2 + 1, ey2 + 2, pw, ph);
        } else if (direction.y === -1) {
          ctx.fillRect(ex1 + 2, ey1 + 1, pw, ph);
          ctx.fillRect(ex2 + 2, ey2 + 1, pw, ph);
        } else {
          ctx.fillRect(ex1 + 2, ey1 + 2, pw, ph);
          ctx.fillRect(ex2 + 2, ey2 + 2, pw, ph);
        }

        // 小嘴巴
        ctx.fillStyle = COLORS.snakeMouth;
        if (direction.x === 1) {
          ctx.fillRect(x + 16, y + 8, 2, 3);
        } else if (direction.x === -1) {
          ctx.fillRect(x + 2, y + 8, 2, 3);
        } else if (direction.y === -1) {
          ctx.fillRect(x + 8, y + 2, 3, 2);
        } else {
          ctx.fillRect(x + 8, y + 16, 3, 2);
        }
      }
    });
  }
}
