import { readFileSync } from 'node:fs';

// 値は絶対に表示しない。設定の有無だけ出す。
const required = ['AI_GATEWAY_API_KEY', 'JEV_MODEL'];
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
let ok = true;
for (const key of required) {
  const set = (env[key] ?? '').length > 0;
  console.log(`${key}: ${set ? '設定あり' : '未設定'}`);
  if (!set) ok = false;
}
process.exit(ok ? 0 : 1);
