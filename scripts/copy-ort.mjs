import { cpSync, mkdirSync, readdirSync } from 'node:fs';

const src = 'node_modules/onnxruntime-web/dist';
const dst = 'public/ort';
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (f === 'ort.wasm.min.js' || f === 'ort.webgpu.min.js' || f.endsWith('.wasm') || f.endsWith('.mjs')) {
    cpSync(`${src}/${f}`, `${dst}/${f}`);
    n += 1;
  }
}
console.log(`${n} ファイルを ${dst} にコピーしました`);
