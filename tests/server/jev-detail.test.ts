import { describe, expect, it } from 'vitest';
import { buildJevDetail } from '../../src/server/jev-detail';

describe('buildJevDetail', () => {
  it('確率が無ければ選ばれたものを 1、他を 0 にする', () => {
    const d = buildJevDetail('center', 'accelerate');
    expect(d.lane.map((l) => l.prob)).toEqual([0, 1, 0]);
    expect(d.throttle.map((t) => t.prob)).toEqual([0, 0, 1]);
    expect(d.laneChoice).toBe('center');
    expect(d.throttleChoice).toBe('accelerate');
  });
  it('確率は 0〜1 に収め、小数3桁に丸める。欠けた選択肢は 0', () => {
    const d = buildJevDetail('left', 'hold', { left: 1.2, center: -0.5, right: 0.12345 }, { hold: 0.5555 });
    expect(d.lane.map((l) => l.prob)).toEqual([1, 0, 0.123]);
    expect(d.throttle.map((t) => t.prob)).toEqual([0, 0.556, 0]);
  });
  it('数値でない値（NaN など）は 0 にする', () => {
    const d = buildJevDetail('left', 'hold', { left: NaN, center: 0.4 }, undefined);
    expect(d.lane.map((l) => l.prob)).toEqual([0, 0.4, 0]);
  });
});
