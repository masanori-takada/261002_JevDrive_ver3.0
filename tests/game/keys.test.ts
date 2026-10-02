import { describe, expect, it } from 'vitest';
import { laneKeyDirection, manualAction, moveLane } from '../../src/game/keys';

describe('manualAction', () => {
  it('キーなしは停止操作', () => {
    expect(manualAction(new Set())).toEqual({ steer: 0, throttle: 0 });
  });
  it('矢印キーを Action に変換する', () => {
    expect(manualAction(new Set(['ArrowRight', 'ArrowUp']))).toEqual({ steer: 1, throttle: 1 });
    expect(manualAction(new Set(['ArrowLeft', 'ArrowDown']))).toEqual({ steer: -1, throttle: -1 });
  });
  it('左右同時押しは相殺する', () => {
    expect(manualAction(new Set(['ArrowLeft', 'ArrowRight'])).steer).toBe(0);
  });
});

describe('moveLane（1 車線ぶん隣へ。端では動かない）', () => {
  it('左右に 1 つ動かす', () => {
    expect(moveLane(1, -1)).toBe(0);
    expect(moveLane(1, 1)).toBe(2);
  });
  it('端では動かない', () => {
    expect(moveLane(0, -1)).toBe(0);
    expect(moveLane(2, 1)).toBe(2);
  });
  it('方向 0 は動かない', () => {
    expect(moveLane(1, 0)).toBe(1);
  });
});

describe('laneKeyDirection（キーイベントから車線変更の方向）', () => {
  it('← は -1、→ は +1', () => {
    expect(laneKeyDirection('ArrowLeft', false)).toBe(-1);
    expect(laneKeyDirection('ArrowRight', false)).toBe(1);
  });
  it('押しっぱなしの自動リピートは無視する', () => {
    expect(laneKeyDirection('ArrowLeft', true)).toBe(0);
    expect(laneKeyDirection('ArrowRight', true)).toBe(0);
  });
  it('他のキーは 0', () => {
    expect(laneKeyDirection('ArrowUp', false)).toBe(0);
    expect(laneKeyDirection('a', false)).toBe(0);
  });
});
