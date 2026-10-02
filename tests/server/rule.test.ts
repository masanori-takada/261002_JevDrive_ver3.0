import { describe, expect, it } from 'vitest';
import { obstacleBox } from '../../src/game/projection';
import { rulePlan, ruleDecision } from '../../src/server/rule';
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

describe('ruleDecision（JEV_MOCK 用。Plan と同じ内容の detail を付ける）', () => {
  it('Plan の目標レーンと throttle が 1、他が 0 の detail を返す', () => {
    const r = ruleDecision({ ...base, targetX: -0.8 });
    expect(r.plan).toEqual(rulePlan({ ...base, targetX: -0.8 }));
    expect(r.detail.laneChoice).toBe('far_left');
    expect(r.detail.throttleChoice).toBe('accelerate');
    expect(r.detail.lane.map((l) => l.prob)).toEqual([1, 0, 0, 0, 0]);
    expect(r.detail.throttle.map((t) => t.prob)).toEqual([0, 0, 1]);
  });
});
