// 模擬実験用: ゲーム状態から「検出が完全な」観測を作る
import { obstacleBox } from '../game/projection';
import type { GameState } from '../game/racer';
import type { Detection, Observation } from '../lib/types';
import { buildObservation } from '../vision/observation';

/** round:true（既定）は buildObservation の 3 桁丸めあり、false は丸めなし（上位 6 件・並び順は同じ） */
export function buildSimObservation(s: GameState, opts: { round?: boolean } = {}): Observation {
  const detections: Detection[] = [];
  for (const o of s.obstacles) {
    const b = obstacleBox(o, s.playerX);
    // 画面内（縦は 0..1、横は少しでも重なる）のものだけ
    if (b.y >= 1 || b.y + b.h <= 0 || b.x >= 1 || b.x + b.w <= 0) continue;
    detections.push({ ...b, cls: 'car', conf: 1 });
  }
  if (opts.round === false) {
    return {
      frame: s.frame,
      speed: s.speed,
      road: { left: 0.2, right: 0.8, centerOffset: s.playerX },
      obstacles: detections.sort((a, b) => b.y + b.h - (a.y + a.h)).slice(0, 6),
    };
  }
  return buildObservation({
    frame: s.frame,
    speed: s.speed,
    road: { left: 0.2, right: 0.8, centerOffset: s.playerX },
    detections,
  });
}
