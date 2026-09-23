/** A durable dirty revision makes corrections retryable. At most one bounded rebuild per
 * evidence revision/settling boundary; ordinary page reads reuse the persisted scores. */
import { z } from 'zod';
import { supabaseAdmin } from '../database.js';
import { scoreOne, scoringCutoff } from './figureScoring.js';
import { spendingRule } from './spending.js';
import { dayIn } from './zone.js';
import { ours } from './currency.js';

export async function currentFigureScores(userId, { now = new Date() } = {}) {
  z.string().uuid().parse(userId);
  const cutoff = scoringCutoff(now);
  for (let attempt=0; attempt<3; attempt++) {
    const { data: snapshot, error } = await supabaseAdmin.rpc('prepare_money_scoring', {
      p_user_id:userId,p_today:dayIn(now),p_cutoff:cutoff,
    });
    if (error) throw new Error(`Could not read scoring evidence: ${error.message}`);
    if (!snapshot || !Array.isArray(snapshot.figures)) throw new Error('Incomplete scoring snapshot');
    if (!snapshot.dirty) return { figures:snapshot.figures,changed:0,revision:snapshot.revision };
    const counts = spendingRule(snapshot.facts);
    // A failed/partial bank read cannot make a day mature. Statement coverage is not
    // recorded yet, so statement-only and mixed-source histories remain unscored.
    // This proves a completed read after settling, not arbitrary historical coverage (B1).
    const sourceCutoffs = snapshot.accounts.map(a => a.provider === 'enablebanking'
      && ours(a.currency) && !a.sync_checkpoint && Number.isFinite(Date.parse(a.last_pulled_at))
      && Date.parse(a.last_pulled_at) <= now.getTime() ? scoringCutoff(new Date(a.last_pulled_at)) : null);
    const covered = p => sourceCutoffs.length > 0 && sourceCutoffs.every(c => c && c >= p.predicted_for);
    const changes=[];
    const figures=snapshot.figures.map(p=>{
      const score=covered(p) ? scoreOne(p,snapshot.transactions,counts,now) : null;
      // A previously premature score must stop training the band, not merely be skipped.
      const next=score ? {...score,scored_at:now.toISOString()} : {actual:null,error:null,hit:null,scored_at:null};
      const equal=(a,b)=>a==null?b==null:b!=null&&Number(a)===Number(b);
      if (equal(p.actual,next.actual)&&equal(p.error,next.error)&&p.hit===next.hit&&Boolean(p.scored_at)===Boolean(next.scored_at)) return p;
      changes.push({id:p.id,...next});
      return {...p,...next,score_revision:snapshot.revision};
    });
    const {data:commit,error:commitError}=await supabaseAdmin.rpc('commit_money_scoring', {
      p_user_id:userId,p_revision:snapshot.revision,p_cutoff:cutoff,p_changes:changes,p_now:now.toISOString(),
    });
    if (commitError?.code==='40001' || commit?.cached) continue;
    if (commitError) throw new Error(`Could not reconcile forecast outcomes: ${commitError.message}`);
    return {figures,changed:changes.length,revision:snapshot.revision};
  }
  throw new Error('Financial evidence changed during scoring. Please retry.');
}
