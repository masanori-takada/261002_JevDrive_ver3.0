import { describe, expect, it } from 'vitest';
import { experimental_evaluate } from 'ai';

describe('ai の API 形状', () => {
  it('experimental_evaluate が関数としてエクスポートされている', () => {
    expect(typeof experimental_evaluate).toBe('function');
  });
});
