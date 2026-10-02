import { describe, expect, it } from 'vitest';
import { BEST_CONFIG } from '../../src/sim/config';
import { makeLanePolicy } from '../../src/sim/lane-obs';
import { runEpisode } from '../../src/sim/run';

describe('製品方式（lane-target-obs、3 車線）の車線キープ', () => {
  it('120 秒走らせて、車線の中心から 0.1 より離れている（線をまたいでいる）時間の割合が 40% 未満', () => {
    // 車線変更の遷移中は避けられないので、一定の上限で確認する
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runEpisode(makeLanePolicy(BEST_CONFIG), seed, 120, 0.55, undefined, 0.15);
      expect(r.straddleRatio).toBeLessThan(0.4);
    }
  });
  it('製品の目標レーンは 3 車線の中心のどれか', () => {
    expect(BEST_CONFIG.spec.centers).toHaveLength(3);
  });
});
