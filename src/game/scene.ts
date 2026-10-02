import { createGame, type GameState } from './racer';

/** 基準ゲート用の決定的なシーン。i が同じなら常に同じ配置になる */
export function makeScene(i: number): GameState {
  const count = 1 + (i % 3);
  const obstacles = Array.from({ length: count }, (_, k) => ({
    id: k + 1,
    x: (((i * 13 + k * 29) % 100) / 100) * 1.6 - 0.8,
    // 揺らぎはシーン内で共通にして、隣り合う障害物の間隔を常に 0.25 に保つ
    z: 0.25 + k * 0.25 + (((i * 17) % 10) / 100),
  }));
  return {
    ...createGame(i + 1),
    playerX: (((i * 37) % 100) / 100) * 1.6 - 0.8,
    obstacles,
  };
}
