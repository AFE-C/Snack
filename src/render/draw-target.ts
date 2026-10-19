import type { Position } from '../core/types';

/** 标记限制在水果所在格内，固定四角形状，避免依赖闪烁或颜色区分。 */
export function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  position: Position,
  cellSize: number,
): void {
  const x = position.x * cellSize;
  const y = position.y * cellSize;
  ctx.save();
  ctx.fillStyle = '#fff0ad';
  ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
  ctx.fillStyle = '#713c7c';
  for (const cornerX of [x, x + cellSize - 1]) {
    for (const cornerY of [y, y + cellSize - 1]) {
      ctx.fillRect(cornerX === x ? x : x + cellSize - 5, cornerY, 5, 1);
      ctx.fillRect(cornerX, cornerY === y ? y : y + cellSize - 5, 1, 5);
    }
  }
  ctx.restore();
}
