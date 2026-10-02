import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../src/instrumentation';

describe('instrumentation.register', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('キー未設定なら throw', () => {
    vi.stubEnv('JEV_MOCK', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('JEV_MODEL', 'm');
    expect(() => register()).toThrow('AI_GATEWAY_API_KEY');
  });
  it('JEV_MODEL 未設定なら throw', () => {
    vi.stubEnv('JEV_MOCK', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'k');
    vi.stubEnv('JEV_MODEL', '');
    expect(() => register()).toThrow('JEV_MODEL');
  });
  it('JEV_MOCK=1 なら未設定でも throw しない', () => {
    vi.stubEnv('JEV_MOCK', '1');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('JEV_MODEL', '');
    expect(() => register()).not.toThrow();
  });
  it('両方設定済みなら throw しない', () => {
    vi.stubEnv('JEV_MOCK', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'k');
    vi.stubEnv('JEV_MODEL', 'm');
    expect(() => register()).not.toThrow();
  });
});
