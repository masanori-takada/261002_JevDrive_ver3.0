import { describe, expect, it } from 'vitest';
import { computePrecision, computeRecall } from '../../src/vision/recall';

const b = (x: number) => ({ x, y: 0.5, w: 0.1, h: 0.1 });

describe('computeRecall', () => {
  it('全部検出できていれば matched = total', () => {
    expect(computeRecall([b(0.1), b(0.6)], [b(0.1), b(0.6)])).toEqual({ matched: 2, total: 2 });
  });
  it('1つ見逃すと matched が減る', () => {
    expect(computeRecall([b(0.1), b(0.6)], [b(0.1)])).toEqual({ matched: 1, total: 2 });
  });
  it('同じ検出を2つの正解に使い回さない', () => {
    expect(computeRecall([b(0.1), b(0.11)], [b(0.1)])).toEqual({ matched: 1, total: 2 });
  });
  it('IoU がしきい値未満なら一致としない', () => {
    expect(computeRecall([b(0.1)], [b(0.18)], 0.5)).toEqual({ matched: 0, total: 1 });
  });
});

describe('computePrecision', () => {
  it('全検出が正解に一致すれば適合率 1', () => {
    expect(computePrecision([b(0.1), b(0.6)], [b(0.1), b(0.6)])).toEqual({ matched: 2, detected: 2 });
  });
  it('正解に一致しない検出は誤検出として数える', () => {
    expect(computePrecision([b(0.1)], [b(0.1), b(0.7)])).toEqual({ matched: 1, detected: 2 });
  });
  it('1つの正解に対する重複検出は一致1件のみ', () => {
    expect(computePrecision([b(0.1)], [b(0.1), b(0.11)])).toEqual({ matched: 1, detected: 2 });
  });
  it('検出が 0 件なら detected = 0', () => {
    expect(computePrecision([b(0.1)], [])).toEqual({ matched: 0, detected: 0 });
  });
});
