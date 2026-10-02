import { describe, expect, it } from 'vitest';
import { toTensorData } from '../../src/vision/preprocess';

describe('toTensorData', () => {
  // 2x2 の RGBA。ピクセル順: (0,0) (1,0) (0,1) (1,1)
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255, //   赤
    0, 255, 0, 255, //   緑
    0, 0, 255, 255, //   青
    51, 102, 153, 0, //  アルファは無視される
  ]);

  it('NCHW の並び（R 面 → G 面 → B 面）になる', () => {
    const out = toTensorData(rgba, 2);
    expect(out.length).toBe(12);
    expect(Array.from(out.slice(0, 4))).toEqual([1, 0, 0, 51 / 255].map((v) => Math.fround(v)));
    expect(Array.from(out.slice(4, 8))).toEqual([0, 1, 0, 102 / 255].map((v) => Math.fround(v)));
    expect(Array.from(out.slice(8, 12))).toEqual([0, 0, 1, 153 / 255].map((v) => Math.fround(v)));
  });
  it('Uint8Array でも同じ結果になる', () => {
    const a = toTensorData(rgba, 2);
    const b = toTensorData(new Uint8Array(rgba), 2);
    expect(Array.from(b)).toEqual(Array.from(a));
  });
  it('Float32Array を返し、/255 で 0..1 に正規化する', () => {
    const out = toTensorData(new Uint8Array([128, 0, 255, 255]), 1);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out[0]).toBeCloseTo(128 / 255, 6);
    expect(out[2]).toBe(1);
  });
});
