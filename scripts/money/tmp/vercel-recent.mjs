import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=25`);
const mins = (d) => (d.ready && d.buildingAt ? ((d.ready - d.buildingAt) / 60000).toFixed(1) : '--');
console.log('the last 25 deployments, newest first:');
for (const d of deployments) {
  console.log(`  ${new Date(d.created).toISOString().slice(5, 16)}  ${String(d.target || 'preview').padEnd(10)} ${String(d.state).padEnd(9)} ${mins(d).padStart(5)} min  ${(d.meta?.githubCommitRef || '?').slice(0, 30)}`);
}
process.exit(0);
