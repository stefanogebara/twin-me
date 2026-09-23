import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0,200)}`); return r.json(); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=10`);
const bad = deployments.find((d) => d.state === 'ERROR');
console.log(`ERROR deployment ${bad.uid} target=${bad.target} ref=${bad.meta?.githubCommitRef} at ${new Date(bad.created).toISOString()}`);
const events = await api(`/v2/deployments/${bad.uid}/events?builds=1&limit=200`);
const rows = (Array.isArray(events) ? events : events.events || []);
const strip = (s) => String(s).split('').filter((c) => c.charCodeAt(0) >= 32 || c === '\t').join('');
for (const e of rows) {
  const t = strip(e.text || e.payload?.text || '').replace(/\[[0-9;]*m/g, '').trimEnd();
  if (t) console.log('  ' + t.slice(0, 180));
}
process.exit(0);
