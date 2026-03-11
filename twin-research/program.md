# Twin Research — Autonomous Quality Loop

An autonomous experiment loop for improving TwinMe's memory retrieval quality.
Inspired by karpathy/autoresearch: the agent modifies one config file,
runs a fixed evaluation, and loops forever keeping improvements.

---

## The Core Idea

TwinMe's twin quality is directly proportional to memory retrieval quality.
If the right memories surface during a conversation, the LLM (Claude Sonnet) uses them well.
The bottleneck is retrieval, not generation.

**Your job**: Tune `twin-config.js` to maximize `twin_quality_score`.

The metric captures three things:
- **Precision@5** (50%) — do the right types of memories appear in the top 5?
- **Recall@10** (30%) — do they appear somewhere in the top 10?
- **Diversity** (20%) — is the retrieved context type-diverse (reflections + facts + platform_data)?

Higher `twin_quality_score` → better twin conversations.

---

## Setup

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `mar10`). Branch `twin-research/<tag>` must not exist.
2. **Create the branch**: `git checkout -b twin-research/<tag>` from current main.
3. **Read the in-scope files** (full context required):
   - `twin-research/twin-config.js` — the ONLY file you modify
   - `twin-research/twin-eval.js` — the fixed evaluation harness (DO NOT MODIFY)
   - `twin-research/test-data/retrieval-gold.json` — the fixed test queries (DO NOT MODIFY)
   - `api/services/memoryStreamService.js` — understand how RETRIEVAL_WEIGHTS and MMR_LAMBDA are used
4. **Initialize results.tsv**: Create it with just the header row.
5. **Confirm and go**: Confirm setup, then kick off the loop.

---

## Experimentation

**What you CAN do:**
- Modify `twin-config.js` — this is the ONLY file you edit.
- Change any exported constant: retrieval weights, MMR lambda, alpha baseline,
  memory budgets, reflection thresholds, neuropil weights, neurotransmitter config.

**What you CANNOT do:**
- Modify `twin-eval.js` — it is the fixed ground truth metric.
- Modify `test-data/retrieval-gold.json` — fixed test set.
- Modify any service in `api/services/` — production code is off-limits.

**The goal**: maximize `twin_quality_score` (HIGHER = better, unlike val_bpb).

**Simplicity criterion**: All else equal, simpler config is better.

---

## Running an Experiment

```bash
# From twin-ai-learn root
node --env-file=.env twin-research/twin-eval.js > eval.log 2>&1
grep "^twin_quality_score:" eval.log
```

Eval takes ~30-90 seconds (20 embedding calls + 20 DB queries).

---

## The Experiment Loop

LOOP FOREVER:

1. Read current `twin-config.js` + git log to understand what's been tried.
2. Form a hypothesis about what to change and why.
3. Edit `twin-config.js`.
4. `git commit -m "experiment: <description>"`
5. Run eval → `grep "^twin_quality_score:" eval.log`
6. Log to `results.tsv`.
7. If improved → **keep**. If equal/worse → `git reset HEAD~1 --soft && git checkout twin-config.js` → log as `discard`.
8. Go to step 2.

**NEVER STOP**: Run until manually interrupted. If you run out of ideas, think harder.
~12 experiments/hour. The human wakes up to optimized retrieval.

---

## Results TSV Format

```
commit\ttwin_quality_score\tprecision_at_5\trecall_at_10\tdiversity\tstatus\tdescription
a1b2c3d\t0.734000\t0.723\t0.850\t0.614\tkeep\tbaseline
```

Do NOT commit `results.tsv`.

---

## Ideas to Try (Ordered by Expected Impact)

1. Identity weights: try `recency: 0.0` — who you are doesn't decay
2. MMR lambda: try 0.6–0.7 for better precision-diversity balance
3. Reflection mode: try higher relevance weight (reflections are type-rich)
4. Per-type budgets: more reflections (7), fewer conversations (2)
5. Alpha citation baseline: try 0.90 to surface more first-retrieval memories
6. Reflection threshold: try 30 (more frequent, shallower) or 50 (less frequent, deeper)
7. Neuropil weights: lifestyle is time-sensitive, personality is not
8. Neurotransmitter thresholds: require 3 keyword matches instead of 2
