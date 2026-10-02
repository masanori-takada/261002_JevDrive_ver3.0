import { describe, expect, it } from 'vitest';
import { manualAction } from '../../src/game/keys';

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
