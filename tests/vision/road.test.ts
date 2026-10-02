import { describe, expect, it } from 'vitest';
import { readRoad } from '../../src/vision/road';

/** 幅100×高さ10。x が [from, to) の範囲だけ路面色、それ以外は芝生色 */
function frame(from: number, to: number) {
  const width = 100, height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const road = x >= from && x < to;
      const i = (y * width + x) * 4;
      data[i] = road ? 90 : 46;
      data[i + 1] = road ? 90 : 139;
      data[i + 2] = road ? 95 : 60;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('readRoad', () => {
  it('中央の路面は offset 0', () => {
    const r = readRoad(frame(20, 80));
    expect(r.left).toBeCloseTo(0.2, 5);
    expect(r.right).toBeCloseTo(0.8, 5);
    expect(r.centerOffset).toBeCloseTo(0, 5);
  });
  it('路面が右へずれている（自車が左寄り）と offset は負', () => {
    const r = readRoad(frame(30, 90));
    expect(r.centerOffset).toBeCloseTo(-1 / 3, 5);
  });
  it('白線も路面として扱う', () => {
    const f = frame(20, 80);
    const row = Math.floor(10 * 0.6);
    const i = (row * 100 + 20) * 4;
    f.data[i] = 242; f.data[i + 1] = 242; f.data[i + 2] = 242;
    expect(readRoad(f).left).toBeCloseTo(0.2, 5);
  });
  it('路面が見つからなければ中央・offset 0', () => {
    expect(readRoad(frame(0, 0))).toEqual({ left: 0.5, right: 0.5, centerOffset: 0 });
  });
});
