/* Every line of the last production build, with the seconds each one sat at. */
import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=20&target=production`);
const done = deployments.find((d) => d.ready && d.buildingAt && (d.ready - d.buildingAt) > 60000);
const events = await api(`/v2/deployments/${done.uid}/events?builds=1&limit=5000`);
const rows = (Array.isArray(events) ? events : events.events || []).filter((e) => e.text || e.payload?.text);
const strip = (s) => String(s).split('').filter((c) => c.charCodeAt(0) >= 32 || c === '\t').join('');
const start = rows.length ? rows[0].created : 0;
for (const e of rows) {
  const at = ((e.created - start) / 1000).toFixed(0);
  console.log(`+${at.padStart(5)}s  ${strip(e.text || e.payload?.text || '').replace(/\[[0-9;]*m/g, '').trimEnd().slice(0, 150)}`);
}
process.exit(0);
