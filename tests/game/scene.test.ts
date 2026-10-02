import { describe, expect, it } from 'vitest';
import { makeScene } from '../../src/game/scene';

describe('makeScene', () => {
  it('決定的で、障害物は1〜3個、z は 0.25〜0.95、x は -0.8〜0.8', () => {
    for (let i = 0; i < 100; i++) {
      const s = makeScene(i);
      expect(JSON.stringify(s)).toBe(JSON.stringify(makeScene(i)));
      expect(s.obstacles.length).toBeGreaterThanOrEqual(1);
      expect(s.obstacles.length).toBeLessThanOrEqual(3);
      for (const o of s.obstacles) {
        expect(o.z).toBeGreaterThanOrEqual(0.25);
        expect(o.z).toBeLessThanOrEqual(0.95);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(0.8);
      }
      expect(Math.abs(s.playerX)).toBeLessThanOrEqual(0.8);
    }
  });
  it('障害物同士の z は 0.2 以上離れている', () => {
    for (let i = 0; i < 100; i++) {
      const zs = makeScene(i).obstacles.map((o) => o.z).sort((a, b) => a - b);
      for (let k = 1; k < zs.length; k++) expect(zs[k] - zs[k - 1]).toBeGreaterThanOrEqual(0.2);
    }
  });
});
