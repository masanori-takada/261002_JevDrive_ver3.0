import { describe, expect, it } from 'vitest';
import { obstacleBox } from '../../src/game/projection';
import type { Detection, Observation } from '../../src/lib/types';
import { HIT_DX } from '../../src/game/racer';
import { backProject, clearancesFor, LANES3, LANES5 } from '../../src/vision/lanes';
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
    expect(c[0]).toBeCloseTo(0.5, 9); // x=-0.1 は左レーン(-0.55)から 0.45 < 0.55
    expect(c[2]).toBeCloseTo(0.3, 9); // x=0.1 は右レーン(0.55)から 0.45 < 0.55
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
  it('レーン幅はゲームの衝突判定幅 HIT_DX と同じ', () => {
    expect(LANES3.halfWidth).toBe(HIT_DX);
    expect(LANES5.halfWidth).toBe(HIT_DX);
  });
  it('5 レーン（中心 -0.8..0.8）。u=0.5 の障害物は center・right・far_right で余裕が小さくなる', () => {
    expect(LANES5.centers).toEqual([-0.8, -0.4, 0, 0.4, 0.8]);
    const c = clearancesFor(obsOf([det({ x: 0.5, z: 0.4 }, 0)]), LANES5);
    // |0.5-0|=0.5, |0.5-0.4|=0.1, |0.5-0.8|=0.3 はいずれも 0.55 未満。|0.5-(-0.4)|=0.9 は範囲外
    expect(c[2]).toBeCloseTo(0.4, 9);
    expect(c[3]).toBeCloseTo(0.4, 9);
    expect(c[4]).toBeCloseTo(0.4, 9);
    expect(c[1]).toBe(1);
  });
  it('レーン端 u=0.45 の障害物は、center と right（0.4）の両方で余裕が小さくなる', () => {
    const c = clearancesFor(obsOf([det({ x: 0.45, z: 0.4 }, 0)]), LANES5);
    expect(c[2]).toBeCloseTo(0.4, 9); // |0.45-0|=0.45 < 0.55
    expect(c[3]).toBeCloseTo(0.4, 9); // |0.45-0.4|=0.05
    expect(c[1]).toBe(1);             // |0.45-(-0.4)|=0.85
  });
});
