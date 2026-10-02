import { describe, expect, it } from 'vitest';
import { baseY, HORIZON, obstacleBox, roadHalf, screenX } from '../../src/game/projection';

describe('projection', () => {
  it('手前（z=0）で正面の障害物は画面中央・幅0.3', () => {
    const b = obstacleBox({ x: 0, z: 0 }, 0);
    expect(b.x + b.w / 2).toBeCloseTo(0.5, 5);
    expect(b.w).toBeCloseTo(0.3, 5);
  });
  it('奥ほど小さく、地平線に近い', () => {
    const far = obstacleBox({ x: 0, z: 0.9 }, 0);
    const near = obstacleBox({ x: 0, z: 0.1 }, 0);
    expect(far.w).toBeLessThan(near.w);
    expect(far.y + far.h).toBeLessThan(near.y + near.h);
    expect(far.y + far.h).toBeGreaterThan(HORIZON);
  });
  it('自車が右に動くと、同じ障害物は画面左へ寄る', () => {
    const a = obstacleBox({ x: 0, z: 0.5 }, 0);
    const b = obstacleBox({ x: 0, z: 0.5 }, 0.5);
    expect(b.x).toBeLessThan(a.x);
  });
  it('道幅と接地位置は手前ほど大きい', () => {
    expect(roadHalf(1)).toBeGreaterThan(roadHalf(0));
    expect(baseY(1)).toBeGreaterThan(baseY(0));
    expect(screenX(0, 0, 0.5)).toBeCloseTo(0.5, 5);
  });
});
