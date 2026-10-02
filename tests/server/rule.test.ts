import { describe, expect, it } from 'vitest';
import { ruleAction } from '../../src/server/rule';
import type { Observation } from '../../src/lib/types';

const base: Observation = {
  frame: 0, speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [],
};

describe('ruleAction', () => {
  it('何もなければ直進して加速', () => {
    expect(ruleAction(base)).toEqual({ steer: 0, throttle: 1 });
  });
  it('道路の右にずれていたら左へ戻す', () => {
    expect(ruleAction({ ...base, road: { ...base.road, centerOffset: 0.5 } }).steer).toBe(-1);
  });
  it('正面の近い障害物（左寄り）は右へよける', () => {
    const o = { cls: 'car' as const, conf: 0.9, x: 0.42, y: 0.5, w: 0.2, h: 0.2 }; // 中心 0.52、接地 0.7
    expect(ruleAction({ ...base, obstacles: [o] })).toEqual({ steer: -1, throttle: 0 });
  });
  it('遠い障害物は無視する', () => {
    const o = { cls: 'car' as const, conf: 0.9, x: 0.45, y: 0.4, w: 0.1, h: 0.1 }; // 接地 0.5
    expect(ruleAction({ ...base, obstacles: [o] }).throttle).toBe(1);
  });
});
