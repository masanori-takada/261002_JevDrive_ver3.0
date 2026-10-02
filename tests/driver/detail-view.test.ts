import { describe, expect, it } from 'vitest';
import { detailToRows, EMPTY_ROWS } from '../../src/driver/detail-view';
import { buildJevDetail } from '../../src/server/jev-detail';

describe('detailToRows', () => {
  it('棒の幅（%）・強調フラグ・パーセント表記を作る', () => {
    const d = buildJevDetail('right', 'accelerate', { left: 0.1, center: 0.0204, right: 0.8666 }, { hold: 0.25, accelerate: 0.75 });
    const r = detailToRows(d);
    expect(r.lane.map((x) => x.label)).toEqual(['左', '中央', '右']);
    expect(r.lane.map((x) => x.percentText)).toEqual(['10%', '2%', '87%']);
    expect(r.lane[2].widthPct).toBeCloseTo(86.7, 5);
    expect(r.lane.map((x) => x.highlight)).toEqual([false, false, true]);
    expect(r.throttle.map((x) => x.label)).toEqual(['減速', '維持', '加速']);
    expect(r.throttle.map((x) => x.widthPct)).toEqual([0, 25, 75]);
    expect(r.throttle.map((x) => x.highlight)).toEqual([false, false, true]);
  });
  it('確率が無い（選ばれたものが 1、他が 0）ときは 100% の 1 本だけ強調される', () => {
    const r = detailToRows(buildJevDetail('left', 'hold'));
    expect(r.lane.map((x) => x.percentText)).toEqual(['100%', '0%', '0%']);
    expect(r.lane.map((x) => x.highlight)).toEqual([true, false, false]);
  });
  it('合計が 1 でなくても正規化せず、そのまま表示する。範囲外・NaN は 0〜100 に収める', () => {
    const d = buildJevDetail('center', 'hold');
    d.lane[0].prob = 0.6;
    d.lane[1].prob = 1.5;
    d.lane[2].prob = NaN;
    const r = detailToRows(d);
    expect(r.lane.map((x) => x.widthPct)).toEqual([60, 100, 0]);
  });
  it('強調は選ばれた選択肢のみ（確率が最大でなくても選択を優先）。選択が行に無ければ強調なし', () => {
    const d = buildJevDetail('left', 'hold', { left: 0.3, center: 0.7 });
    expect(detailToRows(d).lane.map((x) => x.highlight)).toEqual([true, false, false]);
    expect(detailToRows({ ...d, laneChoice: 'unknown' }).lane.some((x) => x.highlight)).toBe(false);
  });
  it('detail が無い（待機中）ときは全ての棒が 0% で強調なし', () => {
    const r = detailToRows(null);
    expect(r).toEqual(EMPTY_ROWS);
    expect(r.lane).toHaveLength(3);
    expect(r.throttle).toHaveLength(3);
    for (const x of [...r.lane, ...r.throttle]) expect(x).toMatchObject({ widthPct: 0, percentText: '0%', highlight: false });
  });
});
