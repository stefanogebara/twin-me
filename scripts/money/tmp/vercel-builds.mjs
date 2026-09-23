/* Read-only: how many deployments, of what kind, and how long each one built. */
import fs from 'node:fs';
import os from 'node:os';
const auth = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8'));
const token = auth.token;
const api = async (path) => {
  const r = await fetch(`https://api.vercel.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const { projects } = await api('/v9/projects?limit=20');
const project = projects.find((p) => p.name === 'twin-ai-learn');
console.log(`project ${project.name} (${project.id})`);
console.log(`  framework ${project.framework}, node ${project.nodeVersion}`);
console.log(`  build command: ${project.buildCommand ?? '(from vercel.json)'}  install: ${project.installCommand ?? '(default)'}`);
console.log(`  ignore command: ${project.commandForIgnoringBuildStep ?? '(none)'}`);
console.log(`  auto-assign custom domains: ${project.autoAssignCustomDomains}`);
console.log(`  git fork protection: ${project.gitForkProtection}; deploy hooks: ${(project.link?.deployHooks || []).length}`);
let all = []; let until = Date.now();
for (let page = 0; page < 6; page += 1) {
  const { deployments } = await api(`/v6/deployments?projectId=${project.id}&limit=100&until=${until}`);
  if (!deployments.length) break;
  all = all.concat(deployments);
  until = deployments[deployments.length - 1].created - 1;
}
const DAY = 86400000;
const now = Date.now();
const win = (d) => (now - d.created) / DAY;
const mins = (d) => (d.ready && d.buildingAt ? (d.ready - d.buildingAt) / 60000 : null);
for (const days of [1, 7, 30]) {
  const rows = all.filter((d) => win(d) <= days && mins(d) !== null);
  if (!rows.length) continue;
  const prod = rows.filter((d) => d.target === 'production');
  const prev = rows.filter((d) => d.target !== 'production');
  const total = rows.reduce((s, d) => s + mins(d), 0);
  const sum = (xs) => xs.reduce((s, d) => s + mins(d), 0);
  console.log(`\nlast ${days} day(s): ${rows.length} builds, ${total.toFixed(0)} build minutes`);
  console.log(`  production ${prod.length} builds, ${sum(prod).toFixed(0)} min (avg ${(sum(prod) / (prod.length || 1)).toFixed(1)})`);
  console.log(`  preview    ${prev.length} builds, ${sum(prev).toFixed(0)} min (avg ${(sum(prev) / (prev.length || 1)).toFixed(1)})`);
}
const recent = all.filter((d) => win(d) <= 2 && mins(d) !== null).slice(0, 12);
console.log('\nmost recent builds:');
for (const d of recent) console.log(`  ${new Date(d.created).toISOString().slice(5, 16)}  ${String(d.target || 'preview').padEnd(10)} ${mins(d).toFixed(1).padStart(5)} min  ${(d.meta?.githubCommitRef || '?').slice(0, 34)}`);
process.exit(0);
