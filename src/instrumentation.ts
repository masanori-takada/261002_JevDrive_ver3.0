// サーバー起動時に必須の環境変数を確認する（JEV_MOCK=1 のときは不要）
export function register() {
  if (process.env.JEV_MOCK === '1') return;
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY が未設定です（.env.local を確認してください）');
  }
  if (!process.env.JEV_MODEL) {
    throw new Error('JEV_MODEL が未設定です（.env.local を確認してください）');
  }
}
