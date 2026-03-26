# TRIBE v2 x TwinMe: Neuroscience-Grounded Twin Architecture

**Date**: 2026-03-26
**Paper**: "A foundation model of vision, audition, and language for in-silico neuroscience" — Meta FAIR (March 25, 2026)
**Authors**: d'Ascoli, Rapin, Benchetrit, Brookes, Begany, Raugel, Banville, King
**Code**: github.com/facebookresearch/tribev2 | HuggingFace: facebook/tribev2

---

## Why This Paper Validates TwinMe

TRIBE v2 proves that **you can build a computational model of a person from external signals**. Meta does it at the neural level (stimuli -> fMRI brain activity). TwinMe does it at the behavioral level (digital footprints -> personality -> predicted behavior). They are complementary approaches to the same fundamental question.

Key proof points:
- Log-linear scaling: more data = better predictions, no plateau (validates our "push all 10 integrations" strategy)
- Zero-shot + finetune: shared foundation across 720 subjects, per-individual adaptation with minimal data (validates our cold start + enrichment approach)
- Multimodal fusion: text+audio+video combined predicts 50% better than best unimodal in associative cortices (validates our multi-platform strategy)
- In-silico experimentation: trained model predicts responses to novel stimuli without real data (validates twin "acting for you" without asking)
- ICA decomposition: learned representations decompose into interpretable brain networks (validates our Soul Signature layers)

---

## Implementation Roadmap: 7 Techniques

### Phase A: Quick Wins (1-2 weeks)

#### 1. Enhanced Memory Retrieval — TiMem + TCM (3 days)
**What**: Add BM25 lexical scoring + Temporal Context Model to existing 3-factor retrieval.

**Why**: TiMem paper (arXiv 2601.02845) shows 8.6 percentage point improvement on long-horizon conversation benchmarks. Our retrieval ceiling is 0.530 — data quality is the bottleneck, but better retrieval can extract more from what we have.

**Current state**: `memoryStreamService.js` uses `score = w_recency * recency + w_importance * importance + w_relevance * relevance` where relevance is pure cosine similarity via pgvector.

**Change**: Add two new scoring dimensions:

```javascript
// In memoryStreamService.js retrieveMemories()

// Factor 4: BM25 lexical match (catches named entities, dates, exact phrases
// that semantic search misses)
const lexicalScore = bm25Score(memory.content, extractKeywords(query));

// Factor 5: Temporal Context Model (TCM) — memories retrieved together
// share context, creating associative chains
const contextualScore = cosineSim(memory.embedding, currentContextVector);
// currentContextVector = running weighted average of recently retrieved embeddings

// Combined relevance (TiMem weights: 0.9 semantic / 0.1 lexical)
const relevance = 0.9 * semanticScore + 0.1 * lexicalScore;
const totalScore = w_recency * recency + w_importance * importance
                 + w_relevance * relevance + w_context * contextualScore;
```

**Implementation**:
- Add BM25 scoring function (pure JS, no dependency — just TF-IDF with length normalization)
- Add `context_vector` parameter to `retrieveMemories()` — initialized from core memory blocks, updated after each retrieval
- Add STDP co-retrieval boost to importance: memories frequently retrieved alongside current context get importance multiplier
- New config params in `twin-config.js`: `BM25_WEIGHT`, `TCM_WEIGHT`, `TCM_DRIFT_RATE`
- Measure via existing eval harness: `twin-research/memory-eval.js`

**Files**: `api/services/memoryStreamService.js`, `twin-research/twin-config.js`, `twin-research/memory-config.js`

**Expected impact**: Break through 0.530 ceiling by 5-10% via lexical precision on entity queries.

---

#### 2. Scaling Law Measurement (2 days)
**What**: Instrument twin quality as a function of connected platforms and memory count. Measure our own scaling law.

**Why**: TRIBE v2 shows log-linear scaling with no plateau. If TwinMe follows the same pattern, it's the strongest possible argument for the "more integrations = better twin" thesis. If it doesn't, we need to know.

**Implementation**:

```javascript
// New endpoint: /api/twin/scaling-metrics
// Runs on-demand or weekly cron

async function measureScalingLaw(userId) {
  const user = await getUser(userId);
  const connectedPlatforms = await getConnectedPlatforms(userId);
  const memoryCount = await getMemoryCount(userId);
  const twinQualityScore = await runTwinEval(userId); // existing eval

  // Store data point
  await supabase.from('twin_scaling_metrics').insert({
    user_id: userId,
    platform_count: connectedPlatforms.length,
    memory_count: memoryCount,
    memory_types: getMemoryTypeBreakdown(userId),
    twin_quality_score: twinQualityScore,
    measured_at: new Date()
  });

  // Fit log-linear: quality = a * log10(memories) + b
  const history = await getScalingHistory(userId);
  const fit = fitLogLinear(history);
  return { ...fit, r_squared: fit.r2 };
}
```

**Files**: New `api/services/scalingMetricsService.js`, new DB table `twin_scaling_metrics`

**Expected insight**: Empirical validation (or refutation) of log-linear scaling for personality models.

---

#### 3. RSA/CKA Twin Fidelity Score (1 week)
**What**: Measure representational alignment between twin's personality model and user's actual behavior. Show users their twin's accuracy.

**Why**: TRIBE v2 measures encoding accuracy via Pearson correlation between predicted and actual brain responses. We need an equivalent metric for personality alignment.

**Two approaches**:

**A. Behavioral Probe Test** (simpler, more direct):
- Collect 20-50 held-out user behaviors (choices made, reactions, preferences expressed)
- Get twin's predicted response to same stimuli
- Measure Spearman rank correlation between predicted and actual

```javascript
// New: /api/twin/fidelity-test
async function measureTwinFidelity(userId) {
  // Get held-out behaviors (from conversation logs where user expressed preference)
  const probes = await getHeldOutBehaviors(userId, { limit: 50 });

  // Get twin's predictions
  const predictions = await Promise.all(
    probes.map(p => twinPredict(userId, p.stimulus))
  );

  // Pearson correlation between predicted and actual response embeddings
  const alignment = pearsonCorrelation(
    predictions.map(p => p.embedding),
    probes.map(p => p.actualEmbedding)
  );

  // Noise ceiling: inter-rater agreement (if same question asked to user's friends)
  return {
    fidelity_score: alignment,           // target: > 0.3
    confidence: probes.length / 50,      // how much data we have
    percentile: getPercentile(alignment) // vs. other users
  };
}
```

**B. CKA Alignment** (more rigorous, from representational alignment literature):
- Compute centered kernel alignment between twin's memory embeddings and user's behavioral embedding space
- Invariant to scaling and rotation — measures structural similarity

**Product integration**: Show fidelity score in Settings page as "Twin Accuracy: 73%" with explanation: "Your twin correctly predicted your reactions to 73% of held-out behavioral probes."

**Files**: New `api/services/twinFidelityService.js`, frontend `src/pages/Settings.tsx`

---

### Phase B: Interpretability Layer (2-3 weeks)

#### 4. ICA Personality Decomposition (1-2 weeks)
**What**: Run Independent Component Analysis on user's memory embeddings to extract interpretable personality axes. Replace or supplement our current 6-layer personality model with data-driven decomposition.

**Why**: TRIBE v2's ICA on final-layer weights reveals 5 interpretable brain networks (auditory, language, motion, default mode, visual). Applied to TwinMe's memory embeddings, ICA would extract personality axes that emerge from the user's actual behavioral footprint — more authentic than survey-based OCEAN scores.

**Architecture**:

```
user_memories (N memories x 1536-dim embeddings)
    |
    v
FastICA (n_components=20)
    |
    v
20 independent personality axes
    |
    v
Label each axis by finding top-K activating memories
    |
    v
"Axis 7: Competitive Drive" (activates on: gym PRs, work deadlines, gaming stats)
"Axis 12: Creative Exploration" (activates on: music discovery, recipe experiments, new hobbies)
"Axis 3: Social Anxiety" (activates on: canceled plans, late-night overthinking, relationship worries)
```

**Implementation**:

```python
# New: scripts/personality_ica.py (runs as batch job)
import numpy as np
from sklearn.decomposition import FastICA

def extract_personality_axes(user_id, n_components=20):
    # 1. Fetch all memory embeddings for user
    embeddings = fetch_memory_embeddings(user_id)  # (N, 1536)

    # 2. Run ICA
    ica = FastICA(n_components=n_components, max_iter=1000, random_state=42)
    components = ica.fit_transform(embeddings)  # (N, 20)

    # 3. Label each axis by finding top-activating memories
    axes = []
    for i in range(n_components):
        top_memories = np.argsort(np.abs(components[:, i]))[-10:]
        axis_label = label_axis_with_llm(
            [memories[j].content for j in top_memories]
        )
        axes.append({
            'axis_id': i,
            'label': axis_label,           # e.g., "Competitive Drive"
            'top_memories': top_memories,
            'variance_explained': np.var(components[:, i]),
            'mixing_vector': ica.components_[i]  # for projection
        })

    return axes
```

**Product integration**:
- Soul Signature page shows decomposed personality axes as a visual radar chart
- Each axis is clickable — shows the memories that define it
- Privacy Spectrum lets users toggle visibility per axis
- Twin system prompt includes top 5 axes with brief descriptions

**Relationship to existing layers**: ICA axes would supplement (not replace) our current layers:
- OCEAN scores = survey-derived, static
- ICA axes = data-derived, evolving, more granular
- Neurotransmitter modes = situational modulation
- Oracle = behavioral prediction

**Files**: New `scripts/personality_ica.py`, new `api/services/icaPersonalityService.js`, `src/components/SoulSignature/PersonalityAxes.tsx`

---

#### 5. In-Silico User Experimentation (2 weeks)
**What**: Use the trained twin model to predict user responses to novel stimuli without asking the user. Powers proactive insights, content recommendations, and "superstimuli" discovery.

**Why**: TRIBE v2 can predict how a brain would respond to novel images/sounds without scanning. Our twin should predict how the user would react to novel content/situations without asking.

**Use cases**:
1. **Proactive insight generation**: "Based on your personality axes, you'd probably love this podcast episode"
2. **Nudge optimization**: predict which framing of a health nudge would resonate most
3. **Conversation steering**: predict which topics the user would find most engaging right now

**Architecture**:

```javascript
// In-silico experimentation engine
async function predictUserEngagement(userId, stimuli) {
  // 1. Get user's personality representation (ICA axes + core memory centroid)
  const personalityVector = await getPersonalityVector(userId);

  // 2. Embed each stimulus
  const stimuliEmbeddings = await Promise.all(
    stimuli.map(s => embed(s.text))
  );

  // 3. Score each stimulus against personality axes
  const scores = stimuliEmbeddings.map(emb => ({
    relevance: cosineSim(emb, personalityVector.centroid),
    axisActivations: personalityVector.axes.map(axis =>
      dotProduct(emb, axis.mixing_vector)
    ),
    predictedEngagement: predictEngagementFromAxes(emb, personalityVector)
  }));

  // 4. Return ranked "superstimuli" — content predicted to maximally engage
  return scores.sort((a, b) => b.predictedEngagement - a.predictedEngagement);
}

// Validation: actually send top-5 as nudges, measure click-through
// This closes the feedback loop and validates the twin's fidelity
async function validateInSilicoExperiment(userId, experimentId) {
  const experiment = await getExperiment(experimentId);
  const actualEngagement = await measureActualEngagement(userId, experiment.stimuli);

  // Spearman rank correlation between predicted and actual engagement
  const validation = spearmanCorrelation(
    experiment.predictedRanking,
    actualEngagement.actualRanking
  );

  return { rho: validation.rho, p: validation.p };
}
```

**Product integration**: Powers the "morning briefing" and "pattern alert" agentic skills with evidence-based content selection instead of random picks.

**Files**: New `api/services/inSilicoEngine.js`, modify `api/inngest/functions/morningBriefing.js`

---

### Phase C: Multimodal Fusion (4-6 weeks)

#### 6. Multimodal Personality Encoder (4-6 weeks)
**What**: Fuse non-text signals (Spotify audio features, WHOOP biometrics, Google Calendar patterns) into a unified personality representation, following TRIBE v2's fusion architecture.

**Why**: TRIBE v2 shows unimodal models systematically under-predict activity in prefrontal and parietal cortices (the "personality" regions). Multimodal fusion yields up to 50% improvement in associative areas. The analog for TwinMe: text-only twins miss personality dimensions that emerge from music choices, health patterns, and daily rhythms.

**Current state**: TwinMe injects platform data as natural language text into the system prompt. This is "late fusion" at the prompt level — the LLM does all the integration work.

**Proposed change**: Extract structured embeddings per modality, project to shared space, fuse via lightweight transformer, then inject the fused representation.

**Architecture (inspired by TRIBE v2)**:

```
Modality Extractors (frozen, pretrained):
├─ Text:     OpenAI text-embedding-3-small → 1536-dim per memory
├─ Music:    Spotify audio features API → 13-dim per track (danceability, energy, valence, etc.)
│            OR MuSE embeddings → 512-dim per track
├─ Health:   WHOOP → 8-dim per day (HRV, resting HR, recovery, strain, sleep score, etc.)
├─ Calendar: Event density → 24-dim hourly histogram + 7-dim weekday pattern
└─ Video:    YouTube → CLIP ViT-L/14 thumbnails → 768-dim per video

Projection to shared space (learned):
├─ Text:     Linear(1536 → 512)
├─ Music:    Linear(13 → 512)  OR  Linear(512 → 512) if MuSE
├─ Health:   Linear(8 → 512) + temporal encoding
├─ Calendar: Linear(31 → 512) + temporal encoding
└─ Video:    Linear(768 → 512)

Fusion (learned, lightweight transformer):
├─ Concatenate: [text_512 | music_512 | health_512 | calendar_512 | video_512]
├─ 4-layer transformer with modality-type embeddings
├─ Modality dropout during training (random mask entire modalities)
└─ Output: 512-dim fused personality representation

Downstream:
├─ Inject as structured embedding in system prompt context
├─ Use for ICA decomposition (Phase B.4)
├─ Use for in-silico experimentation (Phase B.5)
└─ Use for twin fidelity measurement (Phase A.3)
```

**TRIBE v2's key insight we must adopt: Modality Dropout**
During training, randomly mask entire modalities (30% chance each). This forces the model to learn cross-modal associations and prevents over-reliance on any single signal. Critical for graceful degradation when a user disconnects a platform.

**Implementation approach**:
1. Start with Spotify audio features (13-dim, free API, already integrated) + text
2. Add WHOOP (8-dim, already integrated)
3. Add Calendar (event density patterns, already integrated)
4. Add YouTube (CLIP embeddings of watch history thumbnails)
5. Train fusion transformer on existing user data via contrastive learning

**Training signal**: The fusion model learns to predict which memories are important (importance > 7) from multimodal context. This is our equivalent of TRIBE v2's fMRI prediction objective.

**Files**: New `api/services/multimodalFusionService.js`, new `scripts/train_fusion.py`

---

### Phase D: Advanced Personalization (6-8 weeks)

#### 7. Per-User Hypernetwork LoRA (6-8 weeks)
**What**: Generate user-specific LoRA adapter weights from the user's personality representation, replacing the current generic SFT/DPO model.

**Why**: TRIBE v2 uses subject-conditional heads — each subject gets a unique linear projection layer while sharing all upstream representations. Our current oracle uses a single finetuned model for all users. A hypernetwork would generate per-user adapters from the memory centroid.

**Architecture (inspired by Profile-to-PEFT, arXiv 2510.16282)**:

```
Memory Centroid (512-dim from Phase C fusion)
    |
    v
Hypernetwork f_θ (small MLP: 512 → LoRA_params)
    |
    v
LoRA A,B matrices for each layer of base model
    |
    v
Base Llama 3.1 8B + user-specific LoRA = personalized twin
```

**Key insight**: The hypernetwork generates LoRA weights in a single forward pass — no per-user finetuning needed. A new user gets personalized weights immediately from their memory centroid. This is the "zero-shot personalization" analog of TRIBE v2's zero-shot subject generalization.

**Training**:
- Collect preference pairs from all users (our DPO pipeline)
- Train hypernetwork to generate LoRA weights that minimize DPO loss per user
- Validate by measuring twin fidelity (Phase A.3) before and after

**This is the highest-effort, highest-impact technique.** It replaces our current personality stack (OCEAN + neurotransmitter + oracle + DPO) with a single unified per-user adapter. But it requires Phases A-C to be in place first.

**Files**: New `scripts/train_hypernetwork.py`, modify `api/services/finetuning/personalityOracle.js`

---

## Priority Matrix

| # | Technique | Effort | Impact | Dependencies | Phase |
|---|-----------|--------|--------|-------------|-------|
| 1 | TiMem + TCM Retrieval | 3 days | Medium | None | A |
| 2 | Scaling Law Measurement | 2 days | Low (insight) | None | A |
| 3 | RSA/CKA Fidelity Score | 1 week | Medium | None | A |
| 4 | ICA Personality Decomposition | 1-2 weeks | High | None | B |
| 5 | In-Silico Experimentation | 2 weeks | High | #4 | B |
| 6 | Multimodal Fusion | 4-6 weeks | Very High | #4 | C |
| 7 | Per-User Hypernetwork LoRA | 6-8 weeks | Transformative | #3, #4, #6 | D |

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7

---

## Philosophical Advantage: TwinMe > TRIBE v2

TRIBE v2 treats the brain as a **passive observer** (their own stated limitation, p.10). TwinMe already goes further:

1. **Active agency**: Our twin acts (proactive insights, morning briefings, task routing)
2. **Bidirectional learning**: The twin updates its model from every conversation (session reflection)
3. **Prospective memory**: The twin remembers to do things in the future
4. **Self-improvement**: The twin's fidelity improves over time via DPO training loop

TRIBE v2 is a read-only model of the brain. TwinMe is a read-write model of the soul.

---

## Key References

- TRIBE v2: arXiv (March 2026), github.com/facebookresearch/tribev2
- TiMem: arXiv 2601.02845 — temporal-hierarchical memory retrieval
- Profile-to-PEFT: arXiv 2510.16282 — hypernetwork for user-specific LoRA
- ZEBRA: arXiv 2510.27128 — zero-shot cross-subject generalization
- Probabilistic Digital Twins: arXiv 2512.18056 — VAE framework for user modeling
- Generative Agents: Park et al. UIST 2023 — three-factor retrieval baseline
- RSA: Kriegeskorte et al. 2008, PMC2605405 — representational similarity analysis
- CKA: Kornblith et al. 2019, github.com/yuanli2333/CKA-Centered-Kernel-Alignment
- ICA on embeddings: arXiv 2212.09580 — interpretable word embedding decomposition
- Scaling laws in brain encoding: Antonello et al. NeurIPS 2023, arXiv 2305.11863
- BERG: github.com/gifale95/BERG — brain encoding response generator
- In-silico mapping: arXiv 2510.21142 — visual categorical selectivity
