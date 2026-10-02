// 模擬実験の最良構成（3 レーン + 遅延補償）。閾値・遅延は製品の既定値（src/vision/lane-plan.ts）と同じ
import { LANES3 } from '../vision/lanes';
import { LATENCY_S, MARGIN, THROTTLE_NEAR } from '../vision/lane-plan';
import type { LaneConfig } from './lane-obs';

export const SIM_LATENCY = LATENCY_S;

export const BEST_CONFIG: LaneConfig = {
  spec: LANES3,
  margin: MARGIN,
  throttleNear: THROTTLE_NEAR,
  compensateL: SIM_LATENCY,
  round: true,
};
