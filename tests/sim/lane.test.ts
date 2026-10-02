import { describe, expect, it } from 'vitest';
import { laneThrottle, selectLane } from '../../src/sim/lane';

describe('selectLane', () => {
  it('障害物がなければ現在の目標レーンを維持する', () => {
    expect(selectLane([], 'right')).toBe('right');
    expect(selectLane([], 'center')).toBe('center');
  });
  it('正面に障害物があれば空いているレーンへ移る（左右同点なら左）', () => {
    expect(selectLane([{ x: 0, z: 0.5 }], 'center')).toBe('left');
  });
  it('左と中央が塞がれていれば右を選ぶ', () => {
    expect(selectLane([{ x: -0.5, z: 0.4 }], 'center')).toBe('right');
  });
  it('距離の差が 0.1 未満なら現在のレーンを維持する', () => {
    // 中央は 0.50、右は 0.55 の位置に障害物（差 0.05）
    const obs = [{ x: 0.1, z: 0.5 }, { x: 1.0, z: 0.55 }];
    // x=0.1 は中央・右の両方、x=1.0 は右のみ。左は空き → 左が最大になるため左へ
    expect(selectLane(obs, 'center')).toBe('left');
    const obs2 = [{ x: -0.1, z: 0.5 }, { x: 0.6, z: 0.55 }, { x: -0.9, z: 0.3 }];
    // 左: 0.3（x=-0.9 は左のみ）, 中央: 0.5, 右: 0.55 → 最大は右(0.55)、現在の中央(0.5)との差 0.05 → 維持
    expect(selectLane(obs2, 'center')).toBe('center');
  });
  it('差が 0.1 以上なら最大のレーンへ移る', () => {
    const obs = [{ x: 0, z: 0.3 }, { x: -2 / 3, z: 0.4 }, { x: 2 / 3, z: 0.9 }];
    expect(selectLane(obs, 'center')).toBe('right');
  });
  it('通過済み（z が負）の障害物は無視する', () => {
    expect(selectLane([{ x: 0, z: -0.04 }], 'center')).toBe('center');
  });
});

describe('laneThrottle', () => {
  it('目標レーンの脅威が非常に近いと 0（減速）', () => {
    expect(laneThrottle([{ x: 0, z: 0.2 }], 'center', 0.5)).toBe(0);
  });
  it('脅威が遠く speed < 0.8 なら加速', () => {
    expect(laneThrottle([{ x: 0, z: 0.9 }], 'center', 0.5)).toBe(1);
    expect(laneThrottle([], 'center', 0.9)).toBe(0);
  });
  it('他レーンの障害物は脅威として扱わない', () => {
    expect(laneThrottle([{ x: -0.8, z: 0.2 }], 'right', 0.5)).toBe(1);
  });
});
