import { iou } from '../lib/box';
import type { Detection, ObstacleClass } from '../lib/types';

// COCO のクラスID → 障害物クラス
const CLASS_IDS: Record<number, ObstacleClass> = { 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck' };

export type DecodeOptions = { inputSize: number; confThreshold: number; iouThreshold: number };

/**
 * YOLO11 の出力 [1, 84, n]（チャンネル優先）をデコードする。
 * 0..3 = cx, cy, w, h（入力ピクセル）、4..83 = COCO 80クラスのスコア。
 */
export function decodeYolo(out: Float32Array, n: number, o: DecodeOptions): Detection[] {
  const candidates: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let bestCls: ObstacleClass | null = null;
    let best = 0;
    for (const idStr of Object.keys(CLASS_IDS)) {
      const id = Number(idStr);
      const score = out[(4 + id) * n + i];
      if (score > best) {
        best = score;
        bestCls = CLASS_IDS[id];
      }
    }
    if (!bestCls || best < o.confThreshold) continue;
    const cx = out[i], cy = out[n + i], w = out[2 * n + i], h = out[3 * n + i];
    candidates.push({
      cls: bestCls,
      conf: best,
      x: (cx - w / 2) / o.inputSize,
      y: (cy - h / 2) / o.inputSize,
      w: w / o.inputSize,
      h: h / o.inputSize,
    });
  }
  candidates.sort((a, b) => b.conf - a.conf);
  const kept: Detection[] = [];
  for (const c of candidates) {
    if (kept.every((k) => iou(k, c) < o.iouThreshold)) kept.push(c);
  }
  return kept;
}
