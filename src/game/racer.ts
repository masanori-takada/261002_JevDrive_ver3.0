import type { Action } from '../lib/types';

export type Obstacle = { id: number; x: number; z: number };
export type GameState = {
  frame: number;
  playerX: number;
  speed: number;
  distance: number;
  lastSpawn: number;
  obstacles: Obstacle[];
  crashedUntil: number;
  crashes: number;
  nextId: number;
  seed: number;
};

export const DT = 1 / 60;
const ACCEL = 0.6;          // 1秒あたりの速度変化
const STEER_RATE = 1.2;     // 1秒あたりの横移動（速度1のとき）
export const Z_RATE = 0.5;         // 速度1のときの1秒あたりの z 減少
const SPAWN_GAP = 0.5;      // この走行距離ごとに障害物を1つ出す
const CRASH_FRAMES = 45;
const RECOVER_SPEED = 0.3;
const OFFROAD_SPEED = 0.3;
const HIT_Z = 0.1;
export const HIT_DX = 0.55;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** mulberry32。シード状態を返して決定的に乱数を出す */
function nextRandom(seed: number): { value: number; seed: number } {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: a };
}

export function createGame(seed = 1): GameState {
  return {
    frame: 0, playerX: 0, speed: 0.5, distance: 0, lastSpawn: 0,
    obstacles: [], crashedUntil: 0, crashes: 0, nextId: 1, seed,
  };
}

export function step(s: GameState, a: Action): GameState {
  const frame = s.frame + 1;
  const crashed = s.frame < s.crashedUntil;

  let speed = crashed ? 0 : clamp(s.speed + a.throttle * ACCEL * DT, 0, 1);
  if (crashed && frame >= s.crashedUntil) speed = RECOVER_SPEED;
  const playerX = crashed
    ? s.playerX
    : clamp(s.playerX + a.steer * STEER_RATE * DT * (0.4 + 0.6 * speed), -1.3, 1.3);
  if (Math.abs(playerX) > 1) speed = Math.min(speed, OFFROAD_SPEED);

  const distance = s.distance + speed * DT;
  let obstacles = s.obstacles
    .map((o) => ({ ...o, z: o.z - speed * Z_RATE * DT }))
    .filter((o) => o.z > -0.05);

  let { seed, nextId, lastSpawn } = s;
  if (distance - lastSpawn >= SPAWN_GAP) {
    const r = nextRandom(seed);
    seed = r.seed;
    obstacles.push({ id: nextId++, x: (r.value * 2 - 1) * 0.8, z: 1 });
    lastSpawn = distance;
  }

  let { crashes, crashedUntil } = s;
  if (!crashed) {
    const hit = obstacles.find(
      (o) => o.z <= HIT_Z && o.z > -0.02 && Math.abs(o.x - playerX) < HIT_DX,
    );
    if (hit) {
      crashes += 1;
      crashedUntil = frame + CRASH_FRAMES;
      speed = 0;
      obstacles = obstacles.filter((o) => o.id !== hit.id);
    }
  }

  return { ...s, frame, playerX, speed, distance, obstacles, seed, nextId, lastSpawn, crashes, crashedUntil };
}
