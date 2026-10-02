import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, type GameState } from '../src/game/racer';
import { obstacleBox } from '../src/game/projection';
import { renderGame } from '../src/game/render';

const SRC_W = 640;
const SRC_H = 360;
const OUT = 320;       // 推論と同じ 320×320（引き伸ばし）
const TRAIN = 800;
const VAL = 200;
const CAR_CLASS = 2;   // COCO の car

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 学習用のランダムなシーン（基準ゲート用の makeScene とは別物） */
function randomScene(seed: number): GameState {
  const r = rng(seed * 7919 + 13);
  const count = 1 + Math.floor(r() * 4);
  const band = 0.85 / count;
  const obstacles = Array.from({ length: count }, (_, k) => ({
    id: Math.floor(r() * 1000),
    x: (r() * 2 - 1) * 0.8,
    z: 0.1 + k * band + r() * band,
  }));
  return { ...createGame(seed + 1), playerX: (r() * 2 - 1) * 1.1, distance: r() * 50, obstacles };
}

const src = createCanvas(SRC_W, SRC_H);
const out = createCanvas(OUT, OUT);
const srcCtx = src.getContext('2d');
const outCtx = out.getContext('2d');

let totalBoxes = 0;

function writeSplit(split: 'train' | 'val', count: number, seedBase: number): void {
  mkdirSync(`dataset/images/${split}`, { recursive: true });
  mkdirSync(`dataset/labels/${split}`, { recursive: true });
  for (let i = 0; i < count; i++) {
    const s = randomScene(seedBase + i);
    renderGame(srcCtx as unknown as CanvasRenderingContext2D, s, { width: SRC_W, height: SRC_H, player: false });
    outCtx.drawImage(src, 0, 0, OUT, OUT);
    const name = String(i).padStart(5, '0');
    writeFileSync(`dataset/images/${split}/${name}.png`, out.toBuffer('image/png'));

    const lines: string[] = [];
    for (const o of s.obstacles) {
      const b = obstacleBox(o, s.playerX);
      const x1 = Math.max(0, b.x), y1 = Math.max(0, b.y);
      const x2 = Math.min(1, b.x + b.w), y2 = Math.min(1, b.y + b.h);
      if ((x2 - x1) * OUT < 6 || (y2 - y1) * OUT < 6) continue; // 小さすぎるものは除く
      lines.push(`${CAR_CLASS} ${((x1 + x2) / 2).toFixed(6)} ${((y1 + y2) / 2).toFixed(6)} ${(x2 - x1).toFixed(6)} ${(y2 - y1).toFixed(6)}`);
    }
    totalBoxes += lines.length;
    writeFileSync(`dataset/labels/${split}/${name}.txt`, lines.join('\n') + (lines.length ? '\n' : ''));
  }
}

writeSplit('train', TRAIN, 1000);
writeSplit('val', VAL, 900000);
console.log(`train ${TRAIN} 枚 / val ${VAL} 枚、ラベル合計 ${totalBoxes} 件`);
