import type { JevDetail, JevDetailRow } from '../lib/types';

/** 棒グラフ 1 行ぶんの表示データ */
export type DetailRowView = { label: string; widthPct: number; percentText: string; highlight: boolean };
export type DetailRowsView = { lane: DetailRowView[]; throttle: DetailRowView[] };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function toRows(rows: JevDetailRow[], choice: string): DetailRowView[] {
  return rows.map((r) => {
    const p = clamp01(r.prob);
    // 合計が 1 でなくても正規化せず、そのまま表示する。強調は選ばれた選択肢のみ
    return { label: r.label, widthPct: p * 100, percentText: `${Math.round(p * 100)}%`, highlight: r.name === choice };
  });
}

const zero = (labels: string[]): DetailRowView[] =>
  labels.map((label) => ({ label, widthPct: 0, percentText: '0%', highlight: false }));

/** 運転していない間（detail なし）の表示。全て 0% */
export const EMPTY_ROWS: DetailRowsView = {
  lane: zero(['最左', '左', '中央', '右', '最右']),
  throttle: zero(['減速', '維持', '加速']),
};

/** Jev の detail を、棒グラフ用の行データ（幅 %、パーセント表記、強調フラグ）にする */
export function detailToRows(detail: JevDetail | null): DetailRowsView {
  if (!detail) return EMPTY_ROWS;
  return { lane: toRows(detail.lane, detail.laneChoice), throttle: toRows(detail.throttle, detail.throttleChoice) };
}
