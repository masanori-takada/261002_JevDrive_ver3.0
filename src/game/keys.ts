import type { Action, Steer } from '../lib/types';

export function manualAction(keys: Set<string>): Action {
  const steer = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const throttle = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  return { steer: steer as Steer, throttle: throttle as Steer };
}
