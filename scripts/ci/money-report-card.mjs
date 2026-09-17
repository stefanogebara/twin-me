/** Shadow grades only: a test streak never grants permission to mutate financial data. */
import fs from 'node:fs';
const repo=process.env.GITHUB_REPOSITORY;
if (!repo || !process.env.GH_TOKEN) throw new Error('GitHub repository and read token required');
const api=async (path) => {
  const response=await fetch(`https://api.github.com/repos/${repo}/${path}`,{
    headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Cannot read report-card history (${response.status})`);
  return response.json();
};
const {workflow_runs:runs}=await api('actions/workflows/goals-nightly.yml/runs?branch=main&status=completed&per_page=20');
const histories=await Promise.all(runs.map(async (run) => ({sha:run.head_sha,url:run.html_url,...await api(`actions/runs/${run.id}/jobs?per_page=100`)})));
const grades=['Money safety canaries'].map((name)=>{
  const observations=histories.flatMap((run)=>run.jobs.filter((j)=>j.name===name&&['success','failure','timed_out'].includes(j.conclusion))
    .map((j)=>({passed:j.conclusion==='success',sha:run.sha,url:run.url})));
  const rate=observations.length ? observations.filter((r)=>r.passed).length/observations.length : null;
  return {task_type:name,runs:observations.length,pass_rate:rate,review_eligible:observations.length>=20&&rate>=.95,
    needs_attention:rate!==null&&rate<.9,autonomous_writes:false,observations};
});
const report={generated_at:new Date().toISOString(),mode:'shadow',grades};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/money-report-card.json',JSON.stringify(report,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  grades.map(g=>`${g.task_type}: ${g.runs} completed runs; ${g.pass_rate===null?'unrated':`${Math.round(g.pass_rate*100)}% passed`}. Automatic financial writes remain disabled.\n`).join(''));
