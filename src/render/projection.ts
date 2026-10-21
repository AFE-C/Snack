import type { Position } from '../core/types';

export const CAMERA_ELEVATION_DEGREES = 60;
const ELEVATION = (CAMERA_ELEVATION_DEGREES * Math.PI) / 180;
export const GROUND_DEPTH_SCALE = Math.sin(ELEVATION);
const HEIGHT_SCALE = Math.cos(ELEVATION);
const MARGIN = 0.9;
const VERTICAL_SPACE = 2.2;

/** World coordinates use one grid cell as a unit. Height is separate from ground depth. */
export class BoardProjection {
  readonly scale: number;
  readonly origin: Position;

  static aspectRatio(cols: number, rows: number): number {
    return (cols + MARGIN * 2) / (rows * GROUND_DEPTH_SCALE + VERTICAL_SPACE);
  }

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly width: number,
    readonly height: number,
  ) {
    if (![cols, rows, width, height].every((n) => Number.isFinite(n) && n > 0))
      throw new Error('Invalid projection bounds');
    this.scale = Math.min(
      width / (cols + MARGIN * 2),
      height / (rows * GROUND_DEPTH_SCALE + VERTICAL_SPACE),
    );
    this.origin = Object.freeze({
      x: (width - cols * this.scale) / 2,
      y: (height - rows * GROUND_DEPTH_SCALE * this.scale) / 2 - this.scale * 0.12,
    });
  }

  project(point: Position, height = 0): Position {
    return {
      x: this.origin.x + point.x * this.scale,
      y: this.origin.y + (point.y * GROUND_DEPTH_SCALE - height * HEIGHT_SCALE) * this.scale,
    };
  }

  unprojectGround(point: Position): Position {
    return {
      x: (point.x - this.origin.x) / this.scale,
      y: (point.y - this.origin.y) / (this.scale * GROUND_DEPTH_SCALE),
    };
  }

  center(point: Position, height = 0): Position {
    return this.project({ x: point.x + 0.5, y: point.y + 0.5 }, height);
  }
}
