import type { Action, Steer } from '../lib/types';

export function manualAction(keys: Set<string>): Action {
  const steer = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const throttle = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  return { steer: steer as Steer, throttle: throttle as Steer };
}

/** 車線の番号（0..2）を direction（-1=左, 1=右）へ 1 つ動かす。端では動かない */
export function moveLane(index: number, direction: -1 | 0 | 1): number {
  return Math.min(2, Math.max(0, index + direction));
}

/** キー押下から車線変更の方向を決める。押しっぱなしの自動リピート（repeat）は無視する */
export function laneKeyDirection(key: string, repeat: boolean): -1 | 0 | 1 {
  if (repeat) return 0;
  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowRight') return 1;
  return 0;
}
