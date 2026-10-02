import type { JevDetail, JevDetailRow } from '../lib/types';
import { LANE_LABELS, LANE_NAMES, THROTTLE_LABELS, THROTTLE_NAMES } from './jev-question';

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function rows(
  names: readonly string[], labels: readonly string[], choice: string, probs?: Record<string, number>,
): JevDetailRow[] {
  return names.map((name, i) => {
    // 確率が無いときは、選ばれたものを 1、他を 0 にする
    const raw = probs ? probs[name] : name === choice ? 1 : 0;
    const prob = typeof raw === 'number' && Number.isFinite(raw) ? round3(Math.min(1, Math.max(0, raw))) : 0;
    return { name, label: labels[i], prob };
  });
}

/** 選ばれた選択肢と（あれば）選択肢ごとの確率から、画面表示用の detail を作る */
export function buildJevDetail(
  laneChoice: string,
  throttleChoice: string,
  laneProbs?: Record<string, number>,
  throttleProbs?: Record<string, number>,
): JevDetail {
  return {
    lane: rows(LANE_NAMES, LANE_LABELS, laneChoice, laneProbs),
    throttle: rows(THROTTLE_NAMES, THROTTLE_LABELS, throttleChoice, throttleProbs),
    laneChoice,
    throttleChoice,
  };
}
