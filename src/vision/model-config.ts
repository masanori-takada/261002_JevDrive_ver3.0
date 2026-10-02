// 検出モデルの URL と入力サイズを 1 か所で決める（detector・gate・データ生成が参照する）
export type ModelConfig = { readonly url: string; readonly size: number };

/** 製品の既定モデル */
export const MODEL: ModelConfig = { url: '/models/yolo11n-jev.onnx', size: 320 };

/** 入力 256×256 の比較用モデル */
export const MODEL_256: ModelConfig = { url: '/models/yolo11n-jev-256.onnx', size: 256 };

/** /debug の ?model= の値からモデルを選ぶ。未指定・不明なら既定 */
export function pickModel(key: string | null | undefined): ModelConfig {
  return key === '256' ? MODEL_256 : MODEL;
}
