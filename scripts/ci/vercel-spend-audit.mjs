#!/usr/bin/env node
/**
 * What the Vercel team is spending on, per project, and whether the spend rules hold.
 * =====================================================================================
 * Read-only. Uses the Vercel CLI's own login (~/Library/Application Support/com.vercel.cli/
 * auth.json) or VERCEL_TOKEN. Prints, for the last 30 days (or --days N): builds and build
 * minutes per project, production against preview, and for every project whether preview
 * builds are off, which build machine it is on, and how many functions its last production
 * build compiled. Members and pending invites are listed too: each one past the owner is a
 * paid seat.
 *
 *   node scripts/ci/vercel-spend-audit.mjs [--team team_...] [--days 30]
 *
 * The rules it checks are the ones in ~/.claude/CLAUDE.md ("Vercel spend rules"), written after
 * the September 2026 invoice: $191 of build minutes, 69% of it this repository compiling 674
 * functions per build.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const token = process.env.VERCEL_TOKEN || (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8')).token; } catch { return null; } })();
if (!token) { console.error('No Vercel token: run `vercel login` or set VERCEL_TOKEN.'); process.exit(2); }
const H = { Authorization: `Bearer ${token}` };
const get = async (u) => { const r = await fetch(`https://api.vercel.com${u}`, { headers: H }); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); };

const teams = (await get('/v2/teams')).teams || [];
const team = arg('--team', teams[0]?.id);
const days = Number(arg('--days', 30));
const since = Date.now() - days * 86400000;
const { projects } = await get(`/v9/projects?teamId=${team}&limit=100`);
const { members } = await get(`/v2/teams/${team}/members?limit=100`);

/* every deployment of the window */
const all = [];
let url = `/v6/deployments?teamId=${team}&limit=100&since=${since}`;
for (let i = 0; i < 60 && url; i++) {
  const j = await get(url); all.push(...(j.deployments || []));
  url = j.pagination?.next ? `/v6/deployments?teamId=${team}&limit=100&since=${since}&until=${j.pagination.next}` : null;
}
const by = {};
const twoDays = Date.now() - 2 * 86400000;
for (const d of all) {
  const k = d.name; by[k] ||= { prodN: 0, prodMin: 0, prevN: 0, prevMin: 0, prevRecent: 0 };
  if (d.target !== 'production' && d.createdAt > twoDays && d.state !== 'CANCELED') by[k].prevRecent++;
  const min = d.ready && (d.buildingAt || d.createdAt) ? (d.ready - (d.buildingAt || d.createdAt)) / 60000 : 0;
  if (d.target === 'production') { by[k].prodN++; by[k].prodMin += min; } else { by[k].prevN++; by[k].prevMin += min; }
}
const totalMin = Object.values(by).reduce((s, v) => s + v.prodMin + v.prevMin, 0);

console.log(`Vercel team ${team}, last ${days} days: ${all.length} deployments, ${Math.round(totalMin)} build minutes (wall clock; CPU minutes are this times the machine's vCPUs)`);
console.log('');
console.log('project'.padEnd(34), 'prod'.padStart(5), 'min'.padStart(6), 'prev'.padStart(5), 'min'.padStart(6), 'share'.padStart(6), ' previews', ' machine', ' functions in last prod build');
for (const p of [...projects].sort((a, b) => ((by[b.name]?.prodMin || 0) + (by[b.name]?.prevMin || 0)) - ((by[a.name]?.prodMin || 0) + (by[a.name]?.prevMin || 0)))) {
  const v = by[p.name] || { prodN: 0, prodMin: 0, prevN: 0, prevMin: 0 };
  const share = totalMin ? (100 * (v.prodMin + v.prevMin) / totalMin) : 0;
  const previewsOff = /VERCEL_ENV.*production/.test(p.commandForIgnoringBuildStep || '') || /not main/.test(p.commandForIgnoringBuildStep || '');
  const machine = `${p.resourceConfig?.buildMachineType || 'default'}/${p.resourceConfig?.buildMachineSelection || 'elastic'}`;
  let functions = '';
  if (v.prodN) {
    try {
      const last = (await get(`/v6/deployments?teamId=${team}&projectId=${p.id}&limit=1&target=production&state=READY`)).deployments?.[0];
      if (last) { const dep = await get(`/v13/deployments/${last.uid}?teamId=${team}`); const n = (dep.functions && Object.keys(dep.functions).length) || (dep.lambdas?.length) || null; functions = n == null ? '?' : String(n); }
    } catch { functions = '?'; }
  }
  console.log(p.name.padEnd(34), String(v.prodN).padStart(5), String(Math.round(v.prodMin)).padStart(6), String(v.prevN).padStart(5), String(Math.round(v.prevMin)).padStart(6), (share.toFixed(1) + '%').padStart(6), (previewsOff ? ' off' : ' ON ').padEnd(9), machine.padEnd(14), functions);
}
console.log('');
const extra = members.filter((m) => m.role !== 'OWNER' || !m.confirmed);
console.log(`members: ${members.length} (${members.filter((m) => m.confirmed).length} confirmed); paid seats beyond the owner: ${extra.length}${extra.length ? ' -> ' + extra.map((m) => `${m.email || m.username} (${m.role}${m.confirmed ? '' : ', pending'})`).join(', ') : ''}`);
const rules = [];
for (const p of projects) {
  const off = /VERCEL_ENV.*production/.test(p.commandForIgnoringBuildStep || '') || /not main/.test(p.commandForIgnoringBuildStep || '');
  /* A preview the ignore step cancels costs seconds; one that builds is the rule broken. Only the last two days count, so a rule set yesterday reads as holding. */
  if ((by[p.name]?.prevRecent || 0) > 0) rules.push(`${p.name}: ${by[p.name].prevRecent} preview build(s) ran in the last two days (previews ${off ? 'are off in the project setting; check vercel.json' : 'are ON'})`);
  if ((p.resourceConfig?.buildMachineType || 'default') !== 'basic') rules.push(`${p.name}: build machine ${p.resourceConfig?.buildMachineType || 'default'}, rule is basic/fixed`);
  const v = by[p.name]; if (v && v.prodN && v.prodMin / v.prodN > 5) rules.push(`${p.name}: production builds average ${(v.prodMin / v.prodN).toFixed(1)} min; the rule is under 5 (look for one function per file under api/)`);
}
if (extra.length) rules.push(`${extra.length} paid seat(s) beyond the owner`);
console.log(rules.length ? 'RULES BROKEN:\n- ' + rules.join('\n- ') : 'every spend rule holds');
process.exit(rules.length ? 1 : 0);
