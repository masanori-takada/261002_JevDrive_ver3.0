import { describe, expect, it } from 'vitest';
import { selectBackend, wasmFallback } from '../../src/vision/backend';

describe('selectBackend', () => {
  it('WebGPU が使えるなら WebGPU を優先し、WASM をフォールバックにする', () => {
    const b = selectBackend({ hasWebGpu: true, crossOriginIsolated: true, hardwareConcurrency: 4 });
    expect(b.script).toBe('/ort/ort.webgpu.min.js');
    expect(b.executionProviders).toEqual(['webgpu', 'wasm']);
  });

  it('WebGPU が無ければ WASM 専用のスクリプトを使う', () => {
    const b = selectBackend({ hasWebGpu: false, crossOriginIsolated: true, hardwareConcurrency: 4 });
    expect(b.script).toBe('/ort/ort.wasm.min.js');
    expect(b.executionProviders).toEqual(['wasm']);
  });

  it('クロスオリジン分離されていなければスレッド 1', () => {
    const b = selectBackend({ hasWebGpu: false, crossOriginIsolated: false, hardwareConcurrency: 8 });
    expect(b.numThreads).toBe(1);
  });

  it('分離されていれば 論理コア数 - 1（1〜4）のスレッド数にする', () => {
    const t = (n: number) =>
      selectBackend({ hasWebGpu: false, crossOriginIsolated: true, hardwareConcurrency: n }).numThreads;
    expect(t(4)).toBe(3);
    expect(t(16)).toBe(4);
    expect(t(2)).toBe(1);
    expect(t(1)).toBe(1);
    expect(t(0)).toBe(1);
  });
});

describe('wasmFallback（WebGPU が失敗したときの再試行先）', () => {
  it('WebGPU のバックエンドには、WASM 専用スクリプト・wasm のみ・同じスレッド数を返す', () => {
    const b = selectBackend({ hasWebGpu: true, crossOriginIsolated: true, hardwareConcurrency: 8 });
    expect(wasmFallback(b)).toEqual({ script: '/ort/ort.wasm.min.js', executionProviders: ['wasm'], numThreads: 4 });
  });
  it('すでに WASM 専用なら再試行先はない（null）', () => {
    const b = selectBackend({ hasWebGpu: false, crossOriginIsolated: true, hardwareConcurrency: 4 });
    expect(wasmFallback(b)).toBeNull();
  });
});
