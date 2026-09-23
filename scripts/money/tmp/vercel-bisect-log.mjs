import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0,200)}`); return JSON.parse(t); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=25`);
const d = deployments.find((x) => x.meta?.githubCommitRef === 'bisect/no-public' && x.state === 'READY');
if (!d) { console.log('no READY bisect deployment yet'); process.exit(0); }
console.log(`bisect build: ${((d.ready - d.buildingAt) / 60000).toFixed(1)} min  (main was 19.3 min)`);
const events = await api(`/v2/deployments/${d.uid}/events?builds=1&limit=4000`);
const rows = (Array.isArray(events) ? events : events.events || []).filter((e) => e.text || e.payload?.text);
const strip = (s) => String(s).split('').filter((c) => c.charCodeAt(0) >= 32 || c === '\t').join('');
const start = rows.length ? rows[0].created : 0; let last = start;
for (const e of rows) {
  const text = strip(e.text || e.payload?.text || '').replace(/\[[0-9;]*m/g, '').trimEnd();
  const gap = (e.created - last) / 1000; last = e.created;
  const at = ((e.created - start) / 1000).toFixed(0);
  if (gap > 20 || /Installing|Build Completed|built in|Cloning|Restored|Deploying|Uploading|Created build cache/i.test(text)) {
    console.log(`  +${at.padStart(5)}s  ${gap > 20 ? `gap ${gap.toFixed(0)}s` : '        '}  ${text.slice(0, 110)}`);
  }
}
process.exit(0);
