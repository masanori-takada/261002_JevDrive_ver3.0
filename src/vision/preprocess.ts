/** RGBA のピクセル列を、モデル入力の Float32 NCHW（R 面→G 面→B 面、/255）に変換する。アルファは無視する */
export function toTensorData(rgba: Uint8ClampedArray | Uint8Array, size: number): Float32Array {
  const plane = size * size;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = rgba[i * 4] / 255;
    input[plane + i] = rgba[i * 4 + 1] / 255;
    input[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }
  return input;
}
