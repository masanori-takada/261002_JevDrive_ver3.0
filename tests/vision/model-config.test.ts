import { describe, expect, it } from 'vitest';
import { MODEL, MODEL_256, pickModel } from '../../src/vision/model-config';

describe('model-config', () => {
  it('既定は 320 のモデル', () => {
    expect(MODEL.size).toBe(320);
    expect(MODEL.url).toBe('/models/yolo11n-jev.onnx');
  });
  it('pickModel は未指定・不明な値なら既定を返す', () => {
    expect(pickModel(null)).toBe(MODEL);
    expect(pickModel(undefined)).toBe(MODEL);
    expect(pickModel('999')).toBe(MODEL);
  });
  it('pickModel("256") は 256 のモデルを返す', () => {
    expect(pickModel('256')).toBe(MODEL_256);
    expect(MODEL_256.size).toBe(256);
    expect(MODEL_256.url).toBe('/models/yolo11n-jev-256.onnx');
  });
});
