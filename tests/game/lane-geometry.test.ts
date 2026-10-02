import { describe, expect, it } from 'vitest';
import { LANE_CENTERS, LANE_HALF, laneOffset, PLAYER_X_MAX } from '../../src/game/lane-geometry';
import { HIT_DX } from '../../src/game/racer';

describe('車線の幾何', () => {
  it('3 車線の中心は -2/3, 0, 2/3、半幅は 1/3（区切り線は u=±1/3、縁は u=±1）', () => {
    expect(LANE_CENTERS).toEqual([-2 / 3, 0, 2 / 3]);
    expect(LANE_HALF).toBeCloseTo(1 / 3, 12);
    expect(LANE_CENTERS[1] + LANE_HALF).toBeCloseTo(1 / 3, 12);
    expect(LANE_CENTERS[2] + LANE_HALF).toBeCloseTo(1, 12);
    expect(PLAYER_X_MAX).toBeCloseTo(2 / 3, 12);
  });
  it('衝突判定 HIT_DX は、隣の車線の車（距離 2/3）とは衝突せず、同じ車線（距離 0）とだけ衝突する', () => {
    expect(HIT_DX).toBeLessThan(LANE_CENTERS[2] - LANE_CENTERS[1]);
    expect(HIT_DX).toBeGreaterThan(0);
  });
  it('laneOffset は最寄りの車線の中心との差（絶対値）', () => {
    expect(laneOffset(0)).toBe(0);
    expect(laneOffset(0.1)).toBeCloseTo(0.1, 12);
    expect(laneOffset(0.4)).toBeCloseTo(0.4 - 2 / 3 < 0 ? 2 / 3 - 0.4 : 0.4, 12);
    expect(laneOffset(-1.3)).toBeCloseTo(1.3 - 2 / 3, 12);
  });
});
