import { iou } from '../lib/box';
import type { Box } from '../lib/types';

/** 正解ボックスごとに、未使用で IoU が最大の検出を貪欲に割り当てる */
export function computeRecall(
  expected: Box[],
  detected: Box[],
  iouThreshold = 0.3,
): { matched: number; total: number } {
  const used = new Set<number>();
  let matched = 0;
  for (const e of expected) {
    let bestIdx = -1;
    let best = iouThreshold;
    detected.forEach((d, idx) => {
      if (used.has(idx)) return;
      const v = iou(e, d);
      if (v >= best) {
        best = v;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      matched += 1;
    }
  }
  return { matched, total: expected.length };
}

/** 適合率の元データ。正解のどれにも一致しなかった検出を誤検出とみなし、一致した検出数と全検出数を返す */
export function computePrecision(
  expected: Box[],
  detected: Box[],
  iouThreshold = 0.3,
): { matched: number; detected: number } {
  // 一致した検出の数は、再現率の貪欲割り当てで使われた検出の数と同じ
  return { matched: computeRecall(expected, detected, iouThreshold).matched, detected: detected.length };
}
