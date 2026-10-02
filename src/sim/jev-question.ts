// 実 Jev の目標レーン選択の不一致の分類（scripts/jev-accuracy.ts 用）

export type LaneMismatch = '一致' | '維持すべきなのに移動' | '移動すべきなのに維持' | '移動先が違う';

/** 引数は (正解のレーン, Jev の選択, 現在のレーン) */
export function classifyLane(correct: number, jev: number, current: number): LaneMismatch {
  if (correct === jev) return '一致';
  if (correct === current) return '維持すべきなのに移動';
  if (jev === current) return '移動すべきなのに維持';
  return '移動先が違う';
}
