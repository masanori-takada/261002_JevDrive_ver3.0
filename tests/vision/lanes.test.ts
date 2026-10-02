import { describe, expect, it } from 'vitest';
import { obstacleBox } from '../../src/game/projection';
import type { Detection, Observation } from '../../src/lib/types';
import { LANE_CENTERS, LANE_HALF } from '../../src/game/lane-geometry';
import { backProject, clearancesFor, LANES3 } from '../../src/vision/lanes';
import { buildObservation } from '../../src/vision/observation';

const det = (o: { x: number; z: number }, playerX: number): Detection => ({
  ...obstacleBox(o, playerX), cls: 'car', conf: 1,
});
const obsOf = (ds: Detection[], playerX = 0): Observation => ({
  frame: 0, speed: 0.5, road: { left: 0.2, right: 0.8, centerOffset: playerX }, obstacles: ds,
});

describe('backProject（逆投影）', () => {
  it('丸めなしなら obstacleBox の往復で (u, z) が元に戻る（誤差 1e-9）', () => {
    for (const playerX of [-0.5, 0, 0.7]) {
      for (const u of [-0.8, -0.3, 0, 0.45, 0.8]) {
        for (const z of [0.05, 0.3, 0.6, 0.95]) {
          const [p] = backProject(obsOf([det({ x: u, z }, playerX)], playerX));
          expect(p.u).toBeCloseTo(u, 9);
          expect(p.z).toBeCloseTo(z, 9);
        }
      }
    }
  });
  it('buildObservation の 3 桁丸めありでも、z は ±0.005、u は ±0.03 以内（z≤0.9）', () => {
    for (const playerX of [-0.5, 0, 0.7]) {
      for (const u of [-0.8, -0.3, 0, 0.45, 0.8]) {
        for (const z of [0.1, 0.3, 0.6, 0.9]) {
          const obs = buildObservation({
            frame: 0, speed: 0.5, road: { left: 0.2, right: 0.8, centerOffset: playerX },
            detections: [det({ x: u, z }, playerX)],
          });
          const [p] = backProject(obs);
          expect(Math.abs(p.z - z)).toBeLessThan(0.005);
          expect(Math.abs(p.u - u)).toBeLessThan(0.03);
        }
      }
    }
  });
  it('接地位置が地平線以下の異常なボックスは無視する', () => {
    const bad: Detection = { x: 0.4, y: 0.1, w: 0.05, h: 0.2, cls: 'car', conf: 1 }; // y+h=0.3 < HORIZON
    expect(backProject(obsOf([bad]))).toEqual([]);
  });
});

describe('clearancesFor', () => {
  it('障害物がなければ全レーン 1.0', () => {
    expect(clearancesFor(obsOf([]), LANES3)).toEqual([1, 1, 1]);
  });
  it('そのレーン上で最も近い障害物の z を返す', () => {
    const c = clearancesFor(obsOf([det({ x: -0.1, z: 0.5 }, 0), det({ x: 0.1, z: 0.3 }, 0)]), LANES3);
    expect(c[1]).toBeCloseTo(0.3, 9); // 両方とも中央レーン上、近いほう
    expect(c[0]).toBe(1);             // |-0.1-(-2/3)| = 0.567 > 1/3
    expect(c[2]).toBe(1);
  });
  it('centerOffset を自車位置として使う（同じ画面位置でも playerX で u が変わる）', () => {
    const d = det({ x: 0.6, z: 0.4 }, 0.5); // 自車 0.5 から見て u=0.6
    const c = clearancesFor(obsOf([d], 0.5), LANES3);
    expect(c[2]).toBeCloseTo(0.4, 9);
    expect(c[0]).toBe(1);
  });
  it('通過済み（z ≤ -0.02）は無視する', () => {
    expect(clearancesFor(obsOf([det({ x: 0, z: -0.04 }, 0)]), LANES3)).toEqual([1, 1, 1]);
  });
  it('advance 分だけ手前に進めて評価し、通過してしまうものは無視する', () => {
    const o = obsOf([det({ x: 0, z: 0.5 }, 0), det({ x: 0, z: 0.1 }, 0)]);
    expect(clearancesFor(o, LANES3, 0.2)[1]).toBeCloseTo(0.3, 9); // 0.5→0.3、0.1→-0.1（通過済みで無視）
  });
  it('3 車線の中心と半幅は lane-geometry と同じ', () => {
    expect(LANES3.centers).toEqual(LANE_CENTERS);
    expect(LANES3.halfWidth).toBe(LANE_HALF);
  });
  it('右車線上（u=0.7）の障害物は右レーンだけの余裕を小さくする', () => {
    const c = clearancesFor(obsOf([det({ x: 0.7, z: 0.4 }, 0)]), LANES3);
    expect(c[2]).toBeCloseTo(0.4, 9);
    expect(c[1]).toBe(1);
    expect(c[0]).toBe(1);
  });
  it('観測の丸め誤差（u に ±0.03）があっても、車線の中心にいる障害物は自分の車線だけを塞ぐ', () => {
    for (const x of LANE_CENTERS) {
      for (const err of [-0.03, 0.03]) {
        const c = clearancesFor(obsOf([det({ x: x + err, z: 0.4 }, 0)]), LANES3);
        expect(c.filter((v) => v < 1)).toHaveLength(1);
      }
    }
  });
});
