import { describe, expect, it } from 'vitest';
import { isRunning, isStartKey, nextStarted } from '../../src/game/run-state';

describe('isRunning', () => {
  it('待機中（未開始かつ Jev 非運転）は動かない', () => {
    expect(isRunning(false, false)).toBe(false);
  });
  it('開始済み、または Jev 運転中なら動く', () => {
    expect(isRunning(true, false)).toBe(true);
    expect(isRunning(false, true)).toBe(true);
    expect(isRunning(true, true)).toBe(true);
  });
});

describe('isStartKey', () => {
  it('矢印 4 方向だけが開始キー', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) expect(isStartKey(k)).toBe(true);
    for (const k of ['a', ' ', 'Enter', 'Shift']) expect(isStartKey(k)).toBe(false);
  });
});

describe('nextStarted', () => {
  it('矢印キーで開始し、その後は戻らない', () => {
    expect(nextStarted(false, 'ArrowLeft')).toBe(true);
    expect(nextStarted(true, 'a')).toBe(true);
  });
  it('矢印以外のキーでは開始しない', () => {
    expect(nextStarted(false, 'a')).toBe(false);
  });
});
