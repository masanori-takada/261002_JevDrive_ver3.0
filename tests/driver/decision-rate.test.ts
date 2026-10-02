import { describe, expect, it } from 'vitest';
import { decisionRate } from '../../src/driver/decision-rate';

describe('decisionRate（直近の適用間隔の移動平均 → 回/秒）', () => {
  it('2 件未満は null', () => {
    expect(decisionRate([])).toBeNull();
    expect(decisionRate([1000])).toBeNull();
  });
  it('一定間隔 200ms なら 5 回/秒', () => {
    expect(decisionRate([0, 200, 400, 600])).toBeCloseTo(5, 9);
  });
  it('間隔が不揃いなら平均間隔から求める', () => {
    expect(decisionRate([0, 100, 400])).toBeCloseTo(2 / 0.4, 9);
  });
  it('直近 10 件だけを使う', () => {
    const old = [0, 5000, 10000]; // 古い遅い間隔は無視される
    const recent = Array.from({ length: 10 }, (_, i) => 100000 + i * 150);
    expect(decisionRate([...old, ...recent])).toBeCloseTo(1000 / 150, 9);
  });
  it('時間が進んでいない（同時刻のみ）なら null', () => {
    expect(decisionRate([500, 500])).toBeNull();
  });
});
