import { describe, expect, it } from 'vitest';
import { INITIAL_MODEL_LOAD, modelLoadLabel, modelLoadReducer, type ModelLoadState } from '../../src/driver/model-load';

describe('modelLoadReducer', () => {
  it('初期状態は読み込み中 0 秒', () => {
    expect(INITIAL_MODEL_LOAD).toEqual({ status: 'loading', elapsedSec: 0 });
  });
  it('読み込み中の tick で経過秒が更新される', () => {
    expect(modelLoadReducer(INITIAL_MODEL_LOAD, { type: 'tick', elapsedSec: 12 })).toEqual({ status: 'loading', elapsedSec: 12 });
  });
  it('読み込み中に ready / failed で遷移する', () => {
    expect(modelLoadReducer(INITIAL_MODEL_LOAD, { type: 'ready' })).toEqual({ status: 'ready' });
    expect(modelLoadReducer(INITIAL_MODEL_LOAD, { type: 'failed', message: 'x' })).toEqual({ status: 'error', message: 'x' });
  });
  it('ready / error 後の tick や遅れた完了は無視する', () => {
    const ready: ModelLoadState = { status: 'ready' };
    const err: ModelLoadState = { status: 'error', message: 'x' };
    expect(modelLoadReducer(ready, { type: 'tick', elapsedSec: 5 })).toBe(ready);
    expect(modelLoadReducer(ready, { type: 'failed', message: 'y' })).toBe(ready);
    expect(modelLoadReducer(err, { type: 'ready' })).toBe(err);
    expect(modelLoadReducer(err, { type: 'tick', elapsedSec: 5 })).toBe(err);
  });
  it('retry は error からのみ読み込み中 0 秒に戻る', () => {
    expect(modelLoadReducer({ status: 'error', message: 'x' }, { type: 'retry' })).toEqual({ status: 'loading', elapsedSec: 0 });
    const ready: ModelLoadState = { status: 'ready' };
    expect(modelLoadReducer(ready, { type: 'retry' })).toBe(ready);
    expect(modelLoadReducer(INITIAL_MODEL_LOAD, { type: 'retry' })).toBe(INITIAL_MODEL_LOAD);
  });
});

describe('modelLoadLabel', () => {
  it('状態ごとの表示文言', () => {
    expect(modelLoadLabel({ status: 'loading', elapsedSec: 12 })).toBe('モデル準備中… 12秒');
    expect(modelLoadLabel({ status: 'ready' })).toBe('モデル準備完了');
    expect(modelLoadLabel({ status: 'error', message: 'network' })).toBe('モデルの読み込みに失敗しました（network）');
  });
});
