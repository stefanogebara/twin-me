/* What Vercel has to bundle: every file api/index.js reaches, and how many bytes. */
import { nodeFileTrace } from '@vercel/nft';
import fs from 'node:fs';
const { fileList } = await nodeFileTrace(['api/index.js'], { base: process.cwd() });
let bytes = 0; const byPackage = new Map();
for (const f of fileList) {
  let size = 0; try { size = fs.statSync(f).size; } catch { continue; }
  bytes += size;
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(f);
  const key = m ? m[1] : '(app)';
  const cur = byPackage.get(key) || { files: 0, bytes: 0 };
  cur.files += 1; cur.bytes += size; byPackage.set(key, cur);
}
console.log(`${fileList.size ?? fileList.length} files, ${(bytes / 1048576).toFixed(1)} MB traced`);
console.log('\nheaviest packages:');
for (const [name, v] of [...byPackage.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 14)) {
  console.log(`  ${name.padEnd(28)} ${String(v.files).padStart(6)} files  ${(v.bytes / 1048576).toFixed(1).padStart(7)} MB`);
}
