import { describe, expect, it } from 'vitest';
import { decodeYolo } from '../../src/vision/decode';

const OPTS = { inputSize: 320, confThreshold: 0.25, iouThreshold: 0.45 };

/** [1, 84, n] のテンソルを作り、i番目のボックスを設定する */
function tensor(n: number) {
  return new Float32Array(84 * n);
}
function setBox(t: Float32Array, n: number, i: number, b: { cx: number; cy: number; w: number; h: number; cls: number; score: number }) {
  t[0 * n + i] = b.cx;
  t[1 * n + i] = b.cy;
  t[2 * n + i] = b.w;
  t[3 * n + i] = b.h;
  t[(4 + b.cls) * n + i] = b.score;
}

describe('decodeYolo', () => {
  it('car（クラス2）を正規化した左上基準のボックスに変換する', () => {
    const n = 3, t = tensor(n);
    setBox(t, n, 0, { cx: 160, cy: 160, w: 64, h: 32, cls: 2, score: 0.9 });
    const d = decodeYolo(t, n, OPTS);
    expect(d).toHaveLength(1);
    expect(d[0].cls).toBe('car');
    expect(d[0].conf).toBeCloseTo(0.9, 5);
    expect(d[0].x).toBeCloseTo(0.4, 5);
    expect(d[0].y).toBeCloseTo(0.45, 5);
    expect(d[0].w).toBeCloseTo(0.2, 5);
    expect(d[0].h).toBeCloseTo(0.1, 5);
  });

  it('しきい値未満は捨てる', () => {
    const n = 3, t = tensor(n);
    setBox(t, n, 0, { cx: 160, cy: 160, w: 64, h: 32, cls: 2, score: 0.2 });
    expect(decodeYolo(t, n, OPTS)).toHaveLength(0);
  });

  it('車両以外（person=0）は無視する', () => {
    const n = 3, t = tensor(n);
    setBox(t, n, 0, { cx: 160, cy: 160, w: 64, h: 32, cls: 0, score: 0.95 });
    expect(decodeYolo(t, n, OPTS)).toHaveLength(0);
  });

  it('truck(7)/bus(5)/motorcycle(3) を対応づける', () => {
    const n = 3, t = tensor(n);
    setBox(t, n, 0, { cx: 50, cy: 50, w: 20, h: 20, cls: 7, score: 0.8 });
    setBox(t, n, 1, { cx: 150, cy: 150, w: 20, h: 20, cls: 5, score: 0.7 });
    setBox(t, n, 2, { cx: 250, cy: 250, w: 20, h: 20, cls: 3, score: 0.6 });
    const d = decodeYolo(t, n, OPTS).map((x) => x.cls).sort();
    expect(d).toEqual(['bus', 'motorcycle', 'truck']);
  });

  it('重なる低信頼度のボックスは NMS で除かれる', () => {
    const n = 3, t = tensor(n);
    setBox(t, n, 0, { cx: 160, cy: 160, w: 64, h: 64, cls: 2, score: 0.9 });
    setBox(t, n, 1, { cx: 164, cy: 162, w: 64, h: 64, cls: 2, score: 0.6 });
    const d = decodeYolo(t, n, OPTS);
    expect(d).toHaveLength(1);
    expect(d[0].conf).toBeCloseTo(0.9, 5);
  });
});
