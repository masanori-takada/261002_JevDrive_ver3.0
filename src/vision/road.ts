import type { Road } from '../lib/types';

export type FrameLike = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

/** 彩度が低く（灰色〜白）、一定以上の明るさなら路面・白線とみなす */
export function isRoadPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 25 && max >= 50;
}

/**
 * 画面の rowFrac（既定 0.6）の行を走査して路面の左右端を求める。
 * centerOffset = 自車（画面中央）が道路中央からどれだけ右にずれているか（-1..1）。
 * 路面が見つからなければ中央・offset 0 を返す。
 */
export function readRoad(f: FrameLike, rowFrac = 0.6): Road {
  const y = Math.min(f.height - 1, Math.floor(f.height * rowFrac));
  let minX = -1;
  let maxX = -1;
  for (let x = 0; x < f.width; x++) {
    const i = (y * f.width + x) * 4;
    if (isRoadPixel(f.data[i], f.data[i + 1], f.data[i + 2])) {
      if (minX < 0) minX = x;
      maxX = x;
    }
  }
  if (minX < 0) return { left: 0.5, right: 0.5, centerOffset: 0 };
  const left = minX / f.width;
  const right = (maxX + 1) / f.width;
  const half = (right - left) / 2;
  const centerOffset = half > 0 ? (0.5 - (left + right) / 2) / half : 0;
  return { left, right, centerOffset };
}
