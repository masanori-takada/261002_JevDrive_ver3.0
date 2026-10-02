import { LANE_CENTERS } from './lane-geometry';
import { createGame, type GameState } from './racer';

/** 基準ゲート用の決定的なシーン。i が同じなら常に同じ配置になる */
export function makeScene(i: number): GameState {
  const count = 1 + (i % 3);
  const obstacles = Array.from({ length: count }, (_, k) => ({
    id: k + 1,
    // 横位置は 3 車線の中心のどれか（決定的）
    x: LANE_CENTERS[(i * 13 + k * 29) % LANE_CENTERS.length],
    // 揺らぎはシーン内で共通にして、隣り合う障害物の間隔を常に 0.25 に保つ
    z: 0.25 + k * 0.25 + (((i * 17) % 10) / 100),
  }));
  return {
    ...createGame(i + 1),
    playerX: LANE_CENTERS[(i * 37) % LANE_CENTERS.length],
    obstacles,
  };
}
