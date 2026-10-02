// 目標レーンへ向かう低レベル制御（毎フレーム動く）
import type { Steer } from '../lib/types';

const STEER_DEADBAND = 0.05; // 目標との差がこれ以下なら舵を切らない

/** 車の横位置と目標の差が 0.05 を超えたら、差の符号方向へ切る */
export function laneSteer(playerX: number, targetX: number): Steer {
  const diff = targetX - playerX;
  if (diff > STEER_DEADBAND) return 1;
  if (diff < -STEER_DEADBAND) return -1;
  return 0;
}
