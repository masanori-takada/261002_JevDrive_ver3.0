/** モデル事前読み込みの状態 */
export type ModelLoadState =
  | { status: 'loading'; elapsedSec: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type ModelLoadEvent =
  | { type: 'tick'; elapsedSec: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'retry' };

export const INITIAL_MODEL_LOAD: ModelLoadState = { status: 'loading', elapsedSec: 0 };

/** 読み込み中以外の tick / 完了通知（遅れて届いたもの）は無視し、retry は error からのみ受け付ける */
export function modelLoadReducer(s: ModelLoadState, e: ModelLoadEvent): ModelLoadState {
  switch (e.type) {
    case 'tick':
      return s.status === 'loading' ? { status: 'loading', elapsedSec: e.elapsedSec } : s;
    case 'ready':
      return s.status === 'loading' ? { status: 'ready' } : s;
    case 'failed':
      return s.status === 'loading' ? { status: 'error', message: e.message } : s;
    case 'retry':
      return s.status === 'error' ? INITIAL_MODEL_LOAD : s;
  }
}

export function modelLoadLabel(s: ModelLoadState): string {
  switch (s.status) {
    case 'loading':
      return `モデル準備中… ${s.elapsedSec}秒`;
    case 'ready':
      return 'モデル準備完了';
    case 'error':
      return `モデルの読み込みに失敗しました（${s.message}）`;
  }
}
