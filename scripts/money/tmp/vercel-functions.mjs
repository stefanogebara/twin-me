/* How many serverless functions the last production deploy actually built. */
import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`); return JSON.parse(t); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=10&target=production`);
const done = deployments.find((d) => d.state === 'READY');
console.log(`deployment ${done.uid} (${((done.ready - done.buildingAt) / 60000).toFixed(1)} min)`);
const full = await api(`/v13/deployments/${done.uid}`);
const lambdas = (full.routes || []).filter((r) => r.dest && /\.func|lambda/.test(JSON.stringify(r)));
console.log('build outputs:');
const out = full.output || full.builds || [];
const funcs = new Set();
for (const b of out) if (b.path || b.entrypoint) funcs.add(b.entrypoint || b.path);
if (funcs.size) { console.log(`  ${funcs.size} build outputs:`); for (const f of [...funcs].slice(0, 30)) console.log('   ', f); }
else console.log('  (none listed on the deployment; asking the builds endpoint)');
try {
  const builds = await api(`/v11/deployments/${done.uid}/builds`);
  const list = (builds.builds || []).map((b) => `${b.entrypoint} -> ${b.use || b.config?.zeroConfig ? 'zero-config node' : ''} ${b.readyState}`);
  console.log(`  ${list.length} builds:`); for (const l of list.slice(0, 40)) console.log('   ', l);
} catch (e) { console.log('  builds endpoint:', e.message.slice(0, 120)); }
console.log(`routes mentioning a lambda: ${lambdas.length}`);
process.exit(0);
