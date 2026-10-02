import { describe, expect, it } from 'vitest';
import { laneSteer } from '../../src/game/steer';

describe('laneSteer（低レベル制御）', () => {
  it('目標との差が 0.05 以下なら 0', () => {
    expect(laneSteer(0.02, 0)).toBe(0);
    expect(laneSteer(-0.4 + 0.04, -0.4)).toBe(0);
  });
  it('差の符号方向に切る', () => {
    expect(laneSteer(0, 0.4)).toBe(1);
    expect(laneSteer(0, -0.8)).toBe(-1);
  });
});
