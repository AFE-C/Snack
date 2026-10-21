import type { Position } from '../core/types';
import type { StarKind } from '../content/star-theme';

export function ellipse(
  ctx: CanvasRenderingContext2D,
  p: Position,
  rx: number,
  ry: number,
  fill: string | CanvasGradient | CanvasPattern,
): void {
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function glow(
  ctx: CanvasRenderingContext2D,
  p: Position,
  radius: number,
  color: string,
  alpha = 0.25,
): void {
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, `${color}00`);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  ctx.restore();
}

export function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  points = 4,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(angle) * radius,
      py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  p: Position,
  r: number,
  kind: StarKind,
  lit = true,
): void {
  ctx.save();
  ctx.fillStyle = kind.color;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  if (kind.shape === 'star') {
    starPath(ctx, p.x, p.y, r);
    ctx.fill();
    ctx.stroke();
  } else if (kind.shape === 'moon') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.83, 0.35, Math.PI * 1.9);
    ctx.bezierCurveTo(
      p.x - r * 0.3,
      p.y - r * 0.6,
      p.x - r * 0.4,
      p.y + r * 0.4,
      p.x + r * 0.78,
      p.y + r * 0.28,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind.shape === 'crystal') {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r * 0.7, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r * 0.7, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x - r * 0.16, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.stroke();
  } else {
    ctx.lineWidth = r * 0.28;
    ctx.strokeStyle = kind.color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.64, -0.5, 0, Math.PI * 2);
    ctx.stroke();
    ellipse(ctx, p, r * 0.34, r * 0.34, '#FFD35A');
  }
  if (lit) ellipse(ctx, { x: p.x - r * 0.2, y: p.y - r * 0.3 }, r * 0.12, r * 0.12, '#FFFFFF');
  ctx.restore();
}
