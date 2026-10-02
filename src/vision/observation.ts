import type { Detection, Observation, Road } from '../lib/types';

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function buildObservation(i: {
  frame: number;
  speed: number;
  road: Road;
  detections: Detection[];
}): Observation {
  const obstacles = [...i.detections]
    .sort((a, b) => b.y + b.h - (a.y + a.h))
    .slice(0, 6)
    .map((d) => ({
      cls: d.cls,
      conf: round3(d.conf),
      x: round3(d.x),
      y: round3(d.y),
      w: round3(d.w),
      h: round3(d.h),
    }));
  return {
    frame: i.frame,
    speed: round3(i.speed),
    road: {
      left: round3(i.road.left),
      right: round3(i.road.right),
      centerOffset: round3(i.road.centerOffset),
    },
    obstacles,
  };
}
