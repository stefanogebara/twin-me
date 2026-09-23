import fs from 'node:fs'; import os from 'node:os';
const token = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const api = async (p) => { const r = await fetch(`https://api.vercel.com${p}`, { headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0,300)}`); return JSON.parse(t); };
const { projects } = await api('/v9/projects?limit=20');
const id = projects.find((p) => p.name === 'twin-ai-learn').id;
const { deployments } = await api(`/v6/deployments?projectId=${id}&limit=10`);
for (const d of deployments.filter((x) => x.state === 'ERROR').slice(0, 2)) {
  const full = await api(`/v13/deployments/${d.uid}`);
  console.log(`--- ${d.uid} ${d.target} ${d.meta?.githubCommitRef}`);
  console.log('   errorCode:', full.errorCode, '| errorMessage:', full.errorMessage);
  console.log('   errorStep:', full.errorStep, '| readyState:', full.readyState, '| readySubstate:', full.readySubstate);
}
process.exit(0);
