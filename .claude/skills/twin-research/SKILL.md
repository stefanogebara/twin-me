---
name: twin-research
description: Use when running the autonomous twin quality research loop — sets up a branch, runs the fixed eval harness, modifies twin-config.js, and loops forever keeping improvements. Invoke with /twin-research.
user-invocable: true
---

# Twin Research — Autonomous Quality Loop

Runs the karpathy/autoresearch-style experiment loop for TwinMe retrieval quality.
The agent tunes `twin-research/twin-config.js`, runs `twin-eval.js`, keeps improvements, discards regressions — forever.

## Files

| File | Role |
|------|------|
| `twin-research/twin-config.js` | **ONLY file you modify** |
| `twin-research/twin-eval.js` | Fixed eval harness — never touch |
| `twin-research/test-data/retrieval-gold.json` | Fixed test queries — never touch |
| `twin-research/results.tsv` | Experiment log — untracked by git |

## Metric

```
twin_quality_score = 0.50 * precision_at_5
                   + 0.30 * recall_at_10
                   + 0.20 * diversity_score
```

Range: 0.0 – 1.0. **Higher = better.** (Inverse of val_bpb.)

## Setup (run once per session)

```bash
# 1. Pick a tag — branch must not exist
git checkout -b twin-research/mar10

# 2. Initialize results log
printf "commit\ttwin_quality_score\tprecision_at_5\trecall_at_10\tdiversity\tstatus\tdescription\n" > twin-research/results.tsv

# 3. Read in-scope files for context:
#    twin-research/twin-config.js
#    api/services/memoryStreamService.js (lines 488-510, RETRIEVAL_WEIGHTS)
#    twin-research/twin-eval.js (lines 130-160, scoring formula)
```

## Running an Experiment

```bash
node --env-file=.env twin-research/twin-eval.js > eval.log 2>&1
grep "^twin_quality_score:" eval.log
```

Eval takes ~30-90 seconds. If it errors: `tail -n 20 eval.log`.

## The Loop (NEVER STOP)

```
LOOP FOREVER:
1. Read twin-config.js + git log
2. Form hypothesis → edit twin-config.js
3. git commit -m "experiment: <description>"
4. node --env-file=.env twin-research/twin-eval.js > eval.log 2>&1
5. grep "^twin_quality_score:" eval.log
6. Log to results.tsv
7. IMPROVED → keep. SAME/WORSE → git reset HEAD~1 --soft && git checkout twin-config.js
8. Go to 1
```

**NEVER ask the human to continue. Run until interrupted.**

## Logging to results.tsv (tab-separated, never commit)

```
a1b2c3d	0.734	0.723	0.850	0.614	keep	baseline
b2c3d4e	0.748	0.740	0.860	0.620	keep	identity recency 0.2->0.0
c3d4e5f	0.731	0.718	0.845	0.606	discard	MMR lambda 0.3 hurt precision
```

## What to Tune (highest impact first)

1. `identity` weights: try `recency: 0.0` — identity doesn't decay
2. `MMR_LAMBDA`: try 0.6–0.7 for precision-diversity balance
3. `reflection` weights: higher relevance for deep-pattern queries
4. `MEMORY_CONTEXT_BUDGETS`: more reflections (7), fewer conversations (2)
5. `ALPHA_CITATION_BASELINE`: try 0.90
6. `REFLECTION_CONFIG.importance_threshold`: 30 (frequent) or 50 (deep)
7. `NEUROPIL_WEIGHTS`: per-domain temporal tuning
8. `NEUROTRANSMITTER_CONFIG.min_keyword_matches`: try 3

## Score Interpretation

| Score | Meaning |
|-------|---------|
| < 0.50 | Retrieval broken |
| 0.50–0.65 | Below baseline |
| 0.65–0.75 | Baseline territory |
| 0.75–0.85 | Good improvement |
| > 0.85 | Excellent — production-ready |

## Simplicity Rule

All else equal, simpler config wins. Tiny gain with complex values? Discard. Tiny gain from deleting a parameter? Keep.

## Prerequisites

`.env` must have: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
Test user `167c27b5-a40b-49fb-8d00-deb1b1c57f4d` must have memories in DB.
Node 20.6+ required for `--env-file` flag.
