import { describe, expect, it } from 'vitest';
import { obstacleBox } from '../../src/game/projection';
import { rulePlan } from '../../src/server/rule';
import type { Observation } from '../../src/lib/types';

const base: Observation = {
  frame: 0, speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [],
};

describe('rulePlan（JEV_MOCK 用。5 レーンの余裕から Plan を返す）', () => {
  it('何もなければ現在のレーンを維持して加速', () => {
    expect(rulePlan(base)).toEqual({ targetX: 0, throttle: 1 });
  });
  it('正面の障害物は空いている far_left へよける', () => {
    const o = { ...obstacleBox({ x: 0.05, z: 0.5 }, 0), cls: 'car' as const, conf: 1 };
    expect(rulePlan({ ...base, obstacles: [o] })).toEqual({ targetX: -0.8, throttle: 1 });
  });
  it('targetX を現在のレーンとして維持する', () => {
    expect(rulePlan({ ...base, targetX: -0.8 }).targetX).toBe(-0.8);
  });
});
