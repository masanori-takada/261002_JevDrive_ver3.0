import { describe, expect, it } from 'vitest';
import { classifyLane } from '../../src/sim/jev-question';

describe('classifyLane', () => {
  it('一致・維持すべきなのに移動・移動すべきなのに維持・別レーン、に分類する', () => {
    // 引数は (正解, Jev の選択, 現在のレーン)
    expect(classifyLane(2, 2, 2)).toBe('一致');
    expect(classifyLane(1, 1, 2)).toBe('一致');
    expect(classifyLane(2, 1, 2)).toBe('維持すべきなのに移動');
    expect(classifyLane(1, 2, 2)).toBe('移動すべきなのに維持');
    expect(classifyLane(0, 1, 2)).toBe('移動先が違う');
  });
});
