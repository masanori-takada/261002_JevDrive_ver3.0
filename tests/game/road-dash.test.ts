import { describe, expect, it } from 'vitest';
import { DASH_N, dashStarts, DASH_LEN } from '../../src/game/road-dash';
import { Z_RATE } from '../../src/game/racer';

describe('dashStarts（路面の破線の奥行き z）', () => {
  it('破線の長さは z 方向に 0.5 / N', () => {
    expect(DASH_LEN).toBeCloseTo(0.5 / DASH_N, 9);
  });
  it('間隔は 1 / N で、走行距離 0 では z = i / N', () => {
    const z = dashStarts(0);
    expect(z.length).toBeGreaterThanOrEqual(DASH_N);
    for (let k = 1; k < z.length; k++) expect(z[k] - z[k - 1]).toBeCloseTo(1 / DASH_N, 9);
    expect(z.some((v) => Math.abs(v) < 1e-9)).toBe(true);
  });
  it('走行距離が d 進むと、破線は Z_RATE * d だけ手前（z が減る方向）へ流れる', () => {
    const d = 0.03;
    const before = dashStarts(0);
    const after = dashStarts(d);
    // 格子は 1/N 周期なので、ずれを 1/N で割った余りで比べる
    const g = 1 / DASH_N;
    const shift = (((before[0] - after[0]) % g) + g) % g;
    expect(shift).toBeCloseTo((Z_RATE * d) % g, 9);
  });
  it('画面の下端（z が負）から地平線（z=1）までを覆う', () => {
    const z = dashStarts(0.123);
    expect(Math.min(...z)).toBeLessThanOrEqual(-0.15);
    expect(Math.max(...z)).toBeGreaterThanOrEqual(1 - 1 / DASH_N);
  });
  it('停止物（V_CAR=0）の接近量と一致する: 同じ距離を走ると、障害物と同じだけ z が減る', () => {
    const d = 0.05; // 速度 s で時間 t 走ると d = s*t、障害物の z 減少は s*Z_RATE*t = Z_RATE*d
    const g = 1 / DASH_N;
    const moved = (((dashStarts(0)[0] - dashStarts(d)[0]) % g) + g) % g;
    expect(moved).toBeCloseTo((Z_RATE * d) % g, 9);
  });
});
