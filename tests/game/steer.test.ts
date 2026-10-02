import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../src/game/racer';
import { laneSteer } from '../../src/game/steer';
import { LANE_CENTERS } from '../../src/game/lane-geometry';

describe('laneSteer（低レベル制御）', () => {
  it('目標との差が 0.05 以下なら 0', () => {
    expect(laneSteer(0.02, 0)).toBe(0);
    expect(laneSteer(-0.4 + 0.04, -0.4)).toBe(0);
  });
  it('差の符号方向に切る', () => {
    expect(laneSteer(0, 0.4)).toBe(1);
    expect(laneSteer(0, -0.8)).toBe(-1);
  });
});

describe('車線変更の到達（speed=1 で 90 フレーム以内に目標の車線の中心 ±0.05 に入る）', () => {
  it('隣の車線へも、2 つ先の車線へも到達する', () => {
    for (const [from, to] of [[1, 2], [1, 0], [0, 2], [2, 0], [0, 1], [2, 1]]) {
      let s = { ...createGame(1), playerX: LANE_CENTERS[from], speed: 1 };
      for (let f = 0; f < 90; f++) s = step({ ...s, speed: 1 }, { steer: laneSteer(s.playerX, LANE_CENTERS[to]), throttle: 0 });
      expect(Math.abs(s.playerX - LANE_CENTERS[to])).toBeLessThanOrEqual(0.05);
    }
  });
  it('speed=0.5 でも、1 車線ぶんは 90 フレーム以内に到達する', () => {
    let s = { ...createGame(1), playerX: 0, speed: 0.5 };
    for (let f = 0; f < 90; f++) s = step({ ...s, speed: 0.5 }, { steer: laneSteer(s.playerX, LANE_CENTERS[2]), throttle: 0 });
    expect(Math.abs(s.playerX - LANE_CENTERS[2])).toBeLessThanOrEqual(0.05);
  });
});
