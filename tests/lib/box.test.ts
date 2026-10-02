import { describe, expect, it } from 'vitest';
import { iou } from '../../src/lib/box';

describe('iou', () => {
  it('同じボックスは1', () => {
    expect(iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })).toBe(1);
  });
  it('重ならなければ0', () => {
    expect(iou({ x: 0, y: 0, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })).toBe(0);
  });
  it('半分重なると 1/3', () => {
    expect(iou({ x: 0, y: 0, w: 2, h: 1 }, { x: 1, y: 0, w: 2, h: 1 })).toBeCloseTo(1 / 3, 5);
  });
});
