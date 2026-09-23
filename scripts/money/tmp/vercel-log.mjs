/* Where the 22 minutes go: the phases of the last production build. */
import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=20&target=production`);
const done = deployments.find((d) => d.ready && d.buildingAt && (d.ready - d.buildingAt) > 60000);
console.log(`build ${done.uid}, ${((done.ready - done.buildingAt) / 60000).toFixed(1)} min, ${done.meta?.githubCommitRef}`);
const events = await api(`/v2/deployments/${done.uid}/events?builds=1&limit=4000`);
const rows = (Array.isArray(events) ? events : events.events || []).filter((e) => e.text || e.payload?.text);
console.log(`${rows.length} log lines`);
const strip = (s) => String(s).split('').filter((c) => c.charCodeAt(0) >= 32 || c === '\t').join('');
const start = rows.length ? rows[0].created : 0;
let last = start;
for (const e of rows) {
  const text = strip(e.text || e.payload?.text || '').replace(/\[[0-9;]*m/g, '').trimEnd();
  const gap = (e.created - last) / 1000;
  last = e.created;
  const at = ((e.created - start) / 1000).toFixed(0);
  if (gap > 20 || /Installing|Running|Build Completed|built in|Cloning|Restored|cache|Collecting|Deploying|Uploading|packages in/i.test(text)) {
    console.log(`  +${at.padStart(4)}s  ${gap > 20 ? `gap ${gap.toFixed(0)}s` : '        '}  ${text.slice(0, 120)}`);
  }
}
process.exit(0);
