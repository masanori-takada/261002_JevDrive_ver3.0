import { describe, expect, it } from 'vitest';
import { allow } from '../../src/server/rate-limit';

describe('allow（固定ウィンドウのレート制限）', () => {
  it('limit 内は true、超過で false', () => {
    for (let i = 0; i < 3; i++) expect(allow('a', 1000, 3, 1000)).toBe(true);
    expect(allow('a', 1000, 3, 1000)).toBe(false);
  });
  it('キーごとに独立して数える', () => {
    expect(allow('x', 0, 1, 1000)).toBe(true);
    expect(allow('y', 0, 1, 1000)).toBe(true);
    expect(allow('x', 0, 1, 1000)).toBe(false);
  });
  it('ウィンドウ経過後は再び true', () => {
    expect(allow('b', 0, 1, 1000)).toBe(true);
    expect(allow('b', 500, 1, 1000)).toBe(false);
    expect(allow('b', 1000, 1, 1000)).toBe(true);
  });
});
