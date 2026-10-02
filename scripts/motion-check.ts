// 見た目の確認用: 路面の破線と障害物が同じ速さで流れるかを、0.2 秒間隔の 3 枚の静止画で確かめる（npm run motion-check）
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, DT, step } from '../src/game/racer';
import { renderGame } from '../src/game/render';

const W = 640;
const H = 360;
const OUT = 'docs/demo/motion-check.png';
const FRAMES = 3;
const GAP_FRAMES = Math.round(0.2 / DT); // 0.2 秒

// speed=1 で一定に走る。奥と中ほどに障害物を置く（V_CAR があるので、障害物は (1 − V_CAR) の速さで近づく）
let s = { ...createGame(1), speed: 1, obstacles: [{ id: 1, x: -0.4, z: 0.9 }, { id: 2, x: 0.4, z: 0.6 }] };

const out = createCanvas(W * FRAMES, H);
const octx = out.getContext('2d');
const tile = createCanvas(W, H);
const tctx = tile.getContext('2d');
for (let i = 0; i < FRAMES; i++) {
  renderGame(tctx as unknown as CanvasRenderingContext2D, s, { width: W, height: H, player: true });
  octx.drawImage(tile, i * W, 0);
  octx.fillStyle = '#000';
  octx.fillRect(i * W, 0, 150, 22);
  octx.fillStyle = '#fff';
  octx.font = '16px sans-serif';
  octx.fillText(`t = ${(i * 0.2).toFixed(1)} s`, i * W + 6, 16);
  for (let k = 0; k < GAP_FRAMES; k++) {
    // 速度 1 を保つ（この間に衝突は起きない位置に置いている）
    s = step({ ...s, speed: 1, crashedUntil: 0 }, { steer: 0, throttle: 0 });
  }
}
mkdirSync('docs/demo', { recursive: true });
writeFileSync(OUT, out.toBuffer('image/png'));
console.log(`書き出しました: ${OUT}（z の変化: ${s.obstacles.map((o) => `#${o.id}=${o.z.toFixed(3)}`).join(', ')}）`);
