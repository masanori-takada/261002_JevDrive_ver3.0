import { describe, expect, it } from 'vitest';
import { buildJevQuestion, LANE_NAMES } from '../../src/server/jev-question';

describe('buildJevQuestion', () => {
  const q = buildJevQuestion([1, 0.4, 0.2, 1, 1], 2, 0.5, 0.05, 0.15);
  it('5 レーンの名前と余裕を状態に含める', () => {
    expect(LANE_NAMES).toEqual(['far_left', 'left', 'center', 'right', 'far_right']);
    const st = q.state as { 各レーンの余裕: Record<string, number>; 現在のレーン: string };
    expect(st.各レーンの余裕.left).toBe(0.4);
    expect(st.現在のレーン).toBe('center');
  });
  it('選択肢はレーン 5 つと throttle 3 つ', () => {
    expect(Object.keys(q.lane.criteria)).toEqual(LANE_NAMES);
    expect(Object.keys(q.throttle.criteria)).toEqual(['brake', 'hold', 'accelerate']);
  });
  it('指示文に閾値を含める', () => {
    expect(q.lane.instructions).toContain('0.05');
    expect(q.throttle.instructions).toContain('0.15');
  });
});
