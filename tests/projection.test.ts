import { describe, expect, it } from 'vitest';
import { BoardProjection, GROUND_DEPTH_SCALE } from '../src/render/projection';
import { rockOpacity, sceneEntities } from '../src/render/star-renderer';
import { ExpeditionRun } from '../src/app/expedition-run';

describe('60°斜俯视投影', () => {
  it.each([
    [12, 12, 320, 310],
    [16, 16, 580, 550],
    [18, 18, 900, 850],
    [10, 6, 390, 280],
  ])('%j 棋盘完整适配且地面坐标可逆', (cols, rows, width, height) => {
    const p = new BoardProjection(cols, rows, width, height);
    for (const point of [
      { x: 0, y: 0 },
      { x: cols, y: rows },
      { x: 3.4, y: 1.8 },
    ]) {
      const screen = p.project(point),
        restored = p.unprojectGround(screen);
      expect(restored.x).toBeCloseTo(point.x);
      expect(restored.y).toBeCloseTo(point.y);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(height);
    }
    expect(p.project({ x: 0, y: 0 }, 1).y).toBeGreaterThan(0);
  });
  it('水平和纵向不互相偏移，远近尺寸相同，高度仅改变显示位置', () => {
    const p = new BoardProjection(16, 16, 600, 600);
    const a = p.project({ x: 1, y: 1 }),
      right = p.project({ x: 2, y: 1 }),
      down = p.project({ x: 1, y: 2 });
    expect(right.y).toBe(a.y);
    expect(down.x).toBe(a.x);
    expect((down.y - a.y) / (right.x - a.x)).toBeCloseTo(GROUND_DEPTH_SCALE);
    expect(p.project({ x: 1, y: 14 }).x).toBe(a.x);
    expect(p.project({ x: 1, y: 1 }, 1).y).toBeLessThan(a.y);
  });
  it('前景陨石遮挡关键目标时降透明度，实体以落点排序', () => {
    expect(rockOpacity({ x: 2, y: 3 }, [{ x: 2, y: 2 }])).toBe(0.35);
    expect(rockOpacity({ x: 2, y: 3 }, [{ x: 2, y: 4 }])).toBe(1);
    const snapshot = ExpeditionRun.start('crush', 42).createEngine().getSnapshot();
    const entities = sceneEntities(snapshot);
    expect(entities.map((e) => e.point.y)).toEqual(
      entities.map((e) => e.point.y).sort((a, b) => a - b),
    );
  });
});
