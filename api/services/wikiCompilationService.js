/**
 * Wiki Compilation Service
 * ========================
 * Implements the LLM Wiki pattern (Karpathy): incrementally builds and maintains
 * structured, cross-referenced knowledge pages per domain.
 *
 * 5 domain pages per user, one per neuropil/expert:
 *   personality, lifestyle, cultural, social, motivation
 *
 * Triggered after reflections complete (chained from observationIngestion).
 * Uses TIER_ANALYSIS (DeepSeek) for cost-efficient compilation.
 *
 * Key exports:
 *   compileWikiPages(userId)       - Compile all stale domains
 *   getWikiPages(userId)           - Read all 5 pages
 *   getWikiPage(userId, domain)    - Read one page
 *   getRelevantWikiPages(userId, queryEmbedding, limit) - Vector search
 */

import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS, TIER_EXTRACTION } from './llmGateway.js';
import { generateEmbedding } from './embeddingService.js';
import { getFeatureFlags } from './featureFlagsService.js';
import { classifyNeuropil } from './neuropilRouter.js';
import { createLogger } from './logger.js';

const log = createLogger('WikiCompilation');

// ====================================================================
// Domain Configuration
// ====================================================================

const WIKI_DOMAINS = {
  personality: {
    title: 'Personality Profile',
    expertIds: ['personality_psychologist'],
    retrievalQuery: 'emotional patterns, personality traits, stress responses, coping strategies, attachment style, mood shifts',
  },
  lifestyle: {
    title: 'Lifestyle Patterns',
    expertIds: ['lifestyle_analyst'],
    retrievalQuery: 'daily routines, sleep patterns, exercise habits, health metrics, energy levels, recovery data',
  },
  cultural: {
    title: 'Cultural Identity',
    expertIds: ['cultural_identity'],
    retrievalQuery: 'music taste, content preferences, aesthetic choices, creative interests, media consumption',
  },
  social: {
    title: 'Social Dynamics',
    expertIds: ['social_dynamics'],
    retrievalQuery: 'communication style, relationship patterns, social energy, community engagement, collaboration',
  },
  motivation: {
    title: 'Motivation & Drive',
    expertIds: ['motivation_analyst'],
    retrievalQuery: 'work patterns, goals, ambitions, decision-making style, productivity cycles, career trajectory',
  },
};

const ALL_DOMAIN_IDS = Object.keys(WIKI_DOMAINS);

// Concurrency: max 2 domains compiled in parallel per user
const MAX_CONCURRENT_COMPILATIONS = 2;

// Minimum reflections needed before first wiki compilation
const MIN_REFLECTIONS_FOR_FIRST_COMPILE = 3;

// ====================================================================
// Compilation Prompt
// ====================================================================

function buildCompilationPrompt(domainTitle, currentContent, newReflections, domainMemories) {
  const allDomains = ALL_DOMAIN_IDS.filter(d => WIKI_DOMAINS[d].title !== domainTitle);
  const crossRefExamples = allDomains
    .map(d => `  - [[domain:${d}]] for ${WIKI_DOMAINS[d].title.toLowerCase()} connections`)
    .join('\n');

  const isFirstCompile = !currentContent || currentContent.trim().length < 20;

  return `You are updating a wiki page about a person's ${domainTitle}. This page is a living document that compounds over time.

${isFirstCompile ? 'This is the FIRST compilation. Create the initial page.' : `CURRENT PAGE:\n${currentContent}`}

NEW EVIDENCE (reflections from expert analysis):
${newReflections.map((r, i) => `${i + 1}. ${r.content}`).join('\n')}

SUPPORTING MEMORIES:
${domainMemories.map((m, i) => `${i + 1}. [${m.memory_type}] ${m.content}`).join('\n')}

INSTRUCTIONS:
1. ${isFirstCompile ? 'CREATE' : 'UPDATE'} the page ${isFirstCompile ? 'with these sections' : 'incrementally -- do NOT rewrite from scratch'}
2. ADD new information that the evidence supports
3. If new evidence CONTRADICTS existing content, note it:
   "**[Updated]**: Previously noted X, but recent evidence suggests Y"
4. CROSS-REFERENCE other domains using [[domain:NAME]] syntax where relevant:
${crossRefExamples}
5. Use second person ("You...", "Your...")
6. Structure with markdown headers (## for sections)
7. Keep total length under 800 words -- compress and consolidate older details
8. Cite specific patterns with evidence ("Your Spotify shifts to ambient after 10pm, matching your wind-down routine")
9. No emojis. Plain text only.

${isFirstCompile ? `Structure the page with these sections:
## Overview
A 2-3 sentence synthesis of the key patterns.
## Key Patterns
The most important, well-evidenced patterns.
## Notable Details
Specific observations worth tracking.
## Cross-Domain Connections
How this domain connects to other areas of their life.` : ''}

Return ONLY the updated markdown page content. No preamble, no code fences.`;
}

// ====================================================================
// Core Compilation
// ====================================================================

/**
 * Compile a single domain's wiki page.
 *
 * @param {string} userId
 * @param {string} domainId - One of: personality, lifestyle, cultural, social, motivation
 * @returns {{ updated: boolean, version: number, domain: string } | null}
 */
export async function compileWikiDomain(userId, domainId) {
  const domain = WIKI_DOMAINS[domainId];
  if (!domain) throw new Error(`Unknown wiki domain: ${domainId}`);

  const compilationStart = Date.now();

  // 1. Read current wiki page (may be null for first compilation)
  const { data: existingPage } = await supabaseAdmin
    .from('user_wiki_pages')
    .select('id, content_md, version, compiled_at')
    .eq('user_id', userId)
    .eq('domain', domainId)
    .maybeSingle();

  const lastCompiled = existingPage?.compiled_at || new Date(0).toISOString();

  // 2. Fetch new reflections since last compilation, filtered by domain expert
  // PostgREST supports ->> for JSONB text extraction: metadata->>'expert' matches expert ID
  const expertIds = domain.expertIds;
  const { data: reflections, error: reflErr } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, created_at, importance_score, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'reflection')
    .in('metadata->>expert', expertIds)
    .gt('created_at', lastCompiled)
    .order('created_at', { ascending: false })
    .limit(20);

  if (reflErr) {
    // Fallback: fetch all reflections if expert filter fails (metadata may vary)
    log.warn('Expert-filtered reflection query failed, falling back to all', {
      userId, domainId, error: reflErr.message,
    });
  }

  // If expert filter failed, fall back to all reflections for this domain
  let domainReflections = reflections || [];
  if (reflErr) {
    const { data: allReflections } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, created_at, importance_score')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .gt('created_at', lastCompiled)
      .order('created_at', { ascending: false })
      .limit(15);
    domainReflections = allReflections || [];
  }

  // 3. Fetch recent domain-specific memories for evidence
  const { data: domainMemories } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, memory_type, importance_score, created_at')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'fact', 'observation'])
    .gt('created_at', lastCompiled)
    .order('importance_score', { ascending: false })
    .limit(15);

  // 4. Skip if no new data
  const totalNew = domainReflections.length + (domainMemories?.length || 0);
  if (totalNew === 0) {
    log.info('Wiki domain skip (no new data)', { userId, domainId });
    return null;
  }

  // First compilation needs minimum reflections
  if (!existingPage && domainReflections.length < MIN_REFLECTIONS_FOR_FIRST_COMPILE) {
    log.info('Wiki domain skip (insufficient reflections for first compile)', {
      userId, domainId, reflections: domainReflections.length,
    });
    return null;
  }

  // 5. LLM compilation call
  const prompt = buildCompilationPrompt(
    domain.title,
    existingPage?.content_md || '',
    domainReflections,
    domainMemories || [],
  );

  let compiledContent;
  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 1500,
      userId,
      purpose: `wiki_compile_${domainId}`,
    });
    compiledContent = result.content?.trim();
  } catch (err) {
    log.warn('Wiki compilation LLM failed', { userId, domainId, error: err.message });
    return null;
  }

  if (!compiledContent || compiledContent.length < 50) {
    log.warn('Wiki compilation produced empty/short content', { userId, domainId, len: compiledContent?.length });
    return null;
  }

  // 6. Generate embedding for the compiled page
  let embedding = null;
  try {
    embedding = await generateEmbedding(compiledContent.slice(0, 6000));
  } catch (err) {
    log.warn('Wiki embedding failed (non-fatal)', { userId, domainId, error: err.message });
  }

  // 7. Upsert wiki page
  const newVersion = (existingPage?.version || 0) + 1;
  const now = new Date().toISOString();

  const { error: upsertErr } = await supabaseAdmin
    .from('user_wiki_pages')
    .upsert({
      user_id: userId,
      domain: domainId,
      title: domain.title,
      content_md: compiledContent,
      embedding: embedding ? `[${embedding.join(',')}]` : null,
      version: newVersion,
      compiled_at: now,
      updated_at: now,
    }, {
      onConflict: 'user_id,domain',
    });

  if (upsertErr) {
    log.error('Wiki page upsert failed', { userId, domainId, error: upsertErr.message });
    return null;
  }

  // 8. Insert compilation log (simple template -- no LLM call needed)
  const changeSummary = `v${newVersion}: compiled from ${domainReflections.length} reflections + ${domainMemories?.length || 0} memories`;

  await supabaseAdmin
    .from('user_wiki_logs')
    .insert({
      user_id: userId,
      domain: domainId,
      version: newVersion,
      change_summary: changeSummary,
      reflections_used: domainReflections.length,
      memories_used: domainMemories?.length || 0,
    })
    .then(({ error }) => {
      if (error) log.warn('Wiki log insert failed (non-fatal)', { error: error.message });
    });

  const elapsed = Date.now() - compilationStart;
  log.info('Wiki domain compiled', {
    userId, domainId, version: newVersion,
    reflections: domainReflections.length,
    memories: domainMemories?.length || 0,
    contentLen: compiledContent.length,
    elapsedMs: elapsed,
  });

  return { updated: true, version: newVersion, domain: domainId };
}

/**
 * Compile all wiki domains for a user.
 * Runs max 2 domains concurrently to avoid LLM rate limits.
 *
 * @param {string} userId
 * @returns {{ compiled: string[], skipped: string[], errors: string[] }}
 */
export async function compileWikiPages(userId) {
  if (!userId) throw new Error('userId required');

  // Check feature flag — wiki requires EXPLICIT opt-in (unlike other flags that default to true)
  try {
    const flags = await getFeatureFlags(userId);
    if (flags.llm_wiki !== true) {
      log.info('Wiki compilation skipped (feature flag not enabled)', { userId });
      return { compiled: [], skipped: ALL_DOMAIN_IDS, errors: [] };
    }
  } catch {
    // If flag check fails, skip compilation (safe default for new feature)
    return { compiled: [], skipped: ALL_DOMAIN_IDS, errors: [] };
  }

  const results = { compiled: [], skipped: [], errors: [] };
  const startTime = Date.now();

  // Process domains with concurrency limit
  const queue = [...ALL_DOMAIN_IDS];
  const running = [];

  while (queue.length > 0 || running.length > 0) {
    // Fill up to MAX_CONCURRENT_COMPILATIONS
    while (queue.length > 0 && running.length < MAX_CONCURRENT_COMPILATIONS) {
      const domainId = queue.shift();
      const promise = compileWikiDomain(userId, domainId)
        .then(result => {
          if (result?.updated) {
            results.compiled.push(domainId);
          } else {
            results.skipped.push(domainId);
          }
        })
        .catch(err => {
          log.warn('Wiki domain compilation error', { userId, domainId, error: err.message });
          results.errors.push(domainId);
        })
        .finally(() => {
          running.splice(running.indexOf(promise), 1);
        });
      running.push(promise);
    }

    // Wait for at least one to complete
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  log.info('Wiki compilation complete', {
    userId,
    compiled: results.compiled,
    skipped: results.skipped,
    errors: results.errors,
    elapsedMs: Date.now() - startTime,
  });

  // After compilation, extract entities then run lint (fire-and-forget chain)
  if (results.compiled.length > 0) {
    extractWikiEntities(userId)
      .then(() => detectWikiLints(userId))
      .catch(err =>
        log.warn('Entity extraction or lint failed (non-fatal)', { userId, error: err.message })
      );
  }

  return results;
}

// ====================================================================
// Entity Extraction (Phase 2 -- knowledge graph enrichment)
// ====================================================================

const ENTITY_EXTRACTION_PROMPT = `Analyze these wiki domain pages about a person and extract key entities mentioned.

DOMAINS:
{domains}

Extract 20-40 distinct entities. For each entity, provide:
- name: short label (2-4 words max)
- category: one of: person, artist, habit, concept, activity, place, value
- domains: array of which domains mention this entity (e.g. ["cultural", "lifestyle"])

Rules:
- Extract real names (artists, people), specific habits, recurring concepts, activities, places
- Do NOT extract generic terms like "music" or "sleep" -- be specific ("late-night jazz", "morning routine")
- Prefer entities that appear across multiple domains (cross-domain connections)
- Include emotional patterns and coping mechanisms as "concept" category
- No duplicates, no emojis

Return ONLY a JSON array, no markdown, no explanation:
[{"name":"...","category":"...","domains":["..."]},...]`;

/**
 * Extract key entities from compiled wiki pages using LLM.
 * @param {string} userId
 * @returns {{ extracted: number }}
 */
export async function extractWikiEntities(userId) {
  if (!userId) return { extracted: 0 };

  const pages = await getWikiPages(userId);
  if (pages.length === 0) return { extracted: 0 };

  const domainSummaries = pages.map(p =>
    `### ${p.title} (${p.domain})\n${p.content_md.slice(0, 600)}`
  ).join('\n\n');

  const prompt = ENTITY_EXTRACTION_PROMPT.replace('{domains}', domainSummaries);

  let entities;
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2000,
      userId,
      purpose: 'wiki_entity_extraction',
    });

    let jsonStr = result.content?.trim() || '[]';
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    entities = JSON.parse(jsonStr);
  } catch (err) {
    log.warn('Entity extraction LLM failed', { userId, error: err.message });
    return { extracted: 0 };
  }

  if (!Array.isArray(entities) || entities.length === 0) return { extracted: 0 };

  const validCategories = new Set(['person', 'artist', 'habit', 'concept', 'activity', 'place', 'value']);
  const validEntities = entities
    .filter(e => e.name && e.category && validCategories.has(e.category) && Array.isArray(e.domains))
    .map(e => ({
      user_id: userId,
      name: String(e.name).slice(0, 100),
      category: e.category,
      domains: e.domains.filter(d => ALL_DOMAIN_IDS.includes(d)),
      mention_count: e.domains?.length || 1,
      confidence: 0.8,
      updated_at: new Date().toISOString(),
    }))
    .slice(0, 50);

  if (validEntities.length === 0) return { extracted: 0 };

  const { error: upsertErr } = await supabaseAdmin
    .from('wiki_entity_extractions')
    .upsert(validEntities, { onConflict: 'user_id,name' });

  if (upsertErr) {
    log.warn('Entity upsert failed', { userId, error: upsertErr.message });
    return { extracted: 0 };
  }

  log.info('Wiki entities extracted', { userId, count: validEntities.length });
  return { extracted: validEntities.length };
}

/**
 * Get extracted entities for a user.
 */
export async function getWikiEntities(userId) {
  if (!userId) return [];
  const { data, error } = await supabaseAdmin
    .from('wiki_entity_extractions')
    .select('name, category, domains, mention_count, confidence')
    .eq('user_id', userId)
    .order('mention_count', { ascending: false });
  if (error) { log.warn('Failed to fetch entities', { error: error.message }); return []; }
  return data || [];
}

// ====================================================================
// Wiki Lint (Phase 4 -- knowledge health detection)
// ====================================================================

const LINT_CONTRADICTION_PROMPT = `Compare these 5 domain wiki pages about a person. Find contradictions or inconsistencies BETWEEN domains (not within a single domain).

DOMAINS:
{domains}

Look for:
- Conflicting personality descriptions (e.g., one domain says introvert, another says social butterfly)
- Inconsistent habits (e.g., one says early riser, another says stays up late)
- Contradictory energy/mood patterns across domains
- Claims that don't align with each other

Return ONLY a JSON array of findings. If no contradictions, return [].
Each finding: {"domains":["domain1","domain2"],"claim1":"what domain1 says","claim2":"what domain2 says","suggestion":"how to reconcile"}
No markdown, no explanation.`;

/**
 * Detect wiki lint issues: contradictions, stale pages, gaps, orphans.
 * Findings are stored as proactive insights (category: wiki_lint).
 *
 * @param {string} userId
 * @returns {{ findings: number }}
 */
export async function detectWikiLints(userId) {
  if (!userId) return { findings: 0 };

  const [pages, entities] = await Promise.all([
    getWikiPages(userId),
    getWikiEntities(userId),
  ]);

  if (pages.length === 0) return { findings: 0 };

  const lintFindings = [];

  // ── Step 1: Cross-domain contradiction check (LLM) ──────────────────
  try {
    const domainSummaries = pages.map(p =>
      `### ${p.title} (${p.domain})\n${p.content_md.slice(0, 300)}`
    ).join('\n\n');

    const prompt = LINT_CONTRADICTION_PROMPT.replace('{domains}', domainSummaries);
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 800,
      userId,
      purpose: 'wiki_lint_contradictions',
    });

    let jsonStr = result.content?.trim() || '[]';
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    // Extract JSON array even if surrounded by text
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
    let contradictions;
    try {
      contradictions = JSON.parse(jsonStr);
    } catch {
      // LLM may produce broken JSON -- try to salvage individual objects
      const objMatches = [...jsonStr.matchAll(/\{[^{}]+\}/g)];
      contradictions = objMatches.map(m => { try { return JSON.parse(m[0]); } catch { return null; } }).filter(Boolean);
    }

    if (Array.isArray(contradictions)) {
      for (const c of contradictions.slice(0, 3)) {
        lintFindings.push({
          type: 'contradiction',
          severity: 'high',
          insight: `Your ${c.domains?.[0] || 'one'} page and ${c.domains?.[1] || 'another'} page seem to disagree: "${c.claim1}" vs "${c.claim2}". ${c.suggestion || ''}`.trim(),
          nudge_action: `Review ${c.domains?.join(' and ') || 'domain'} pages for consistency`,
        });
      }
    }
  } catch (err) {
    log.warn('Wiki lint contradiction check failed', { userId, error: err.message });
  }

  // ── Step 2: Staleness check (pure computation) ──────────────────────
  for (const page of pages) {
    const compiledAt = new Date(page.compiled_at).getTime();
    const ageMs = Date.now() - compiledAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > 7) {
      // Check if there are new reflections since last compilation
      const { count } = await supabaseAdmin
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .gt('created_at', page.compiled_at);

      if ((count || 0) >= 5) {
        lintFindings.push({
          type: 'stale_page',
          severity: 'medium',
          insight: `Your ${page.title} page hasn't been updated in ${Math.floor(ageDays)} days, but ${count} new reflections are available. A recompilation would capture recent changes.`,
          nudge_action: `Recompile ${page.domain} wiki page`,
        });
      }
    }
  }

  // ── Step 3: Cross-reference gap check (pure computation) ────────────
  if (entities.length > 0) {
    const bridgeEntities = entities.filter(e => e.domains?.length >= 2);
    for (const entity of bridgeEntities.slice(0, 10)) {
      // Check if the domains that share this entity cross-reference each other
      for (let i = 0; i < entity.domains.length; i++) {
        for (let j = i + 1; j < entity.domains.length; j++) {
          const domA = entity.domains[i];
          const domB = entity.domains[j];
          const pageA = pages.find(p => p.domain === domA);
          const pageB = pages.find(p => p.domain === domB);

          if (pageA && pageB) {
            const hasRefAtoB = pageA.content_md.includes(`[[domain:${domB}]]`);
            const hasRefBtoA = pageB.content_md.includes(`[[domain:${domA}]]`);

            if (!hasRefAtoB && !hasRefBtoA) {
              lintFindings.push({
                type: 'missing_crossref',
                severity: 'low',
                insight: `"${entity.name}" appears in both ${WIKI_DOMAINS[domA]?.title} and ${WIKI_DOMAINS[domB]?.title}, but these pages don't cross-reference each other.`,
                nudge_action: `Add cross-references between ${domA} and ${domB}`,
              });
              break; // One finding per entity pair is enough
            }
          }
        }
        if (lintFindings.filter(f => f.type === 'missing_crossref').length >= 3) break;
      }
    }
  }

  // ── Step 4: Domain balance check (pure computation) ─────────────────
  const lengths = pages.map(p => p.content_md?.length || 0);
  const avgLength = lengths.reduce((s, l) => s + l, 0) / lengths.length;

  for (const page of pages) {
    const pageLen = page.content_md?.length || 0;
    if (pageLen < avgLength * 0.4 && avgLength > 500) {
      lintFindings.push({
        type: 'thin_domain',
        severity: 'low',
        insight: `Your ${page.title} page is significantly shorter (${pageLen} chars) compared to the average (${Math.round(avgLength)} chars). It may need more data from connected platforms.`,
        nudge_action: `Connect more platforms or chat about ${page.domain} topics`,
      });
    }
  }

  // ── Step 5: Entity health check (pure computation) ──────────────────
  if (entities.length > 0) {
    const orphans = entities.filter(e => e.domains?.length === 1);
    if (orphans.length > entities.length * 0.6) {
      lintFindings.push({
        type: 'orphan_entity',
        severity: 'low',
        insight: `${orphans.length} of ${entities.length} entities only appear in one domain. Cross-domain connections make the knowledge graph more insightful.`,
        nudge_action: 'Chat with your twin about how different areas of your life connect',
      });
    }
  }

  // ── Store findings as proactive insights ─────────────────────────────
  let stored = 0;
  for (const finding of lintFindings.slice(0, 5)) {
    try {
      // Dedup: check if similar insight exists recently
      const { count: existing } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'wiki_lint')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if ((existing || 0) >= 3) break; // Max 3 lint insights per 24h

      const { error: insertErr } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: finding.insight.slice(0, 500),
          urgency: finding.severity === 'high' ? 'high' : finding.severity === 'medium' ? 'medium' : 'low',
          category: 'wiki_lint',
          nudge_action: finding.nudge_action || null,
        });

      if (!insertErr) stored++;
    } catch (err) {
      log.warn('Wiki lint finding insert failed', { error: err.message });
    }
  }

  log.info('Wiki lint complete', {
    userId,
    totalFindings: lintFindings.length,
    stored,
    types: lintFindings.map(f => f.type),
  });

  return { findings: lintFindings.length, stored, details: lintFindings };
}

// ====================================================================
// Query Filing (Phase 5 -- chat answers compound in wiki)
// ====================================================================

const QUERY_FILING_PROMPT = `Extract the single most important insight about this person from the twin's response below. Write it as a concise factual statement in second person ("You...").

TWIN'S RESPONSE:
{response}

Rules:
- One sentence, max 150 chars
- Must be a specific, actionable insight (not generic)
- Second person ("You...")
- No emojis

Return ONLY the fact statement, nothing else.`;

/**
 * Evaluate if a twin chat response is valuable enough to file back into the wiki.
 * Valuable = cited 2+ memories with avg importance >= 7 (cross-source synthesis).
 * Filed as a high-importance fact that feeds into the next wiki compilation.
 *
 * @param {string} userId
 * @param {string[]} citedIds - Memory IDs the twin cited in its response
 * @param {string} twinResponse - The twin's response text
 * @param {Array} memoriesInContext - Memories that were in the twin's context
 * @returns {{ filed: boolean, domain?: string, insight?: string }}
 */
export async function fileQueryInsightIfValuable(userId, citedIds, twinResponse, memoriesInContext = []) {
  if (!userId || !citedIds || citedIds.length < 2 || !twinResponse) {
    return { filed: false };
  }

  // Check feature flag
  try {
    const flags = await getFeatureFlags(userId);
    if (flags.llm_wiki !== true) return { filed: false };
  } catch {
    return { filed: false };
  }

  // Step 1: Compute average importance of cited memories
  const citedMemories = memoriesInContext.filter(m => citedIds.includes(m.id));
  if (citedMemories.length < 2) return { filed: false };

  const avgImportance = citedMemories.reduce((sum, m) => sum + (m.importance_score || 0), 0) / citedMemories.length;
  if (avgImportance < 7) {
    log.info('Query filing skipped (low importance)', { userId, avgImportance, cited: citedMemories.length });
    return { filed: false };
  }

  // Step 2: Classify to domain
  const { neuropilId: domain } = classifyNeuropil(twinResponse);

  // Step 3: Extract insight via LLM
  let insight;
  try {
    const prompt = QUERY_FILING_PROMPT.replace('{response}', twinResponse.slice(0, 800));
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 100,
      userId,
      purpose: 'query_filing',
    });
    insight = result.content?.trim();
  } catch (err) {
    log.warn('Query filing LLM failed', { userId, error: err.message });
    return { filed: false };
  }

  if (!insight || insight.length < 10 || insight.length > 300) {
    return { filed: false };
  }

  // Step 4: Dedup against existing facts
  try {
    const insightEmbedding = await generateEmbedding(insight);
    if (insightEmbedding) {
      const { data: similar } = await supabaseAdmin.rpc('search_memory_stream', {
        p_user_id: userId,
        p_embedding: `[${insightEmbedding.join(',')}]`,
        p_match_count: 3,
        p_recency_weight: 0,
        p_importance_weight: 0,
        p_relevance_weight: 1,
      });

      const isDuplicate = (similar || []).some(m => {
        const sim = m.similarity || 0;
        return sim > 0.85 && m.memory_type === 'fact';
      });

      if (isDuplicate) {
        log.info('Query filing skipped (duplicate)', { userId, insight: insight.slice(0, 60) });
        return { filed: false };
      }

      // Step 5: Store as fact memory
      const { error: insertErr } = await supabaseAdmin
        .from('user_memories')
        .insert({
          user_id: userId,
          memory_type: 'fact',
          content: insight,
          importance_score: 8,
          confidence: 0.75,
          embedding: `[${insightEmbedding.join(',')}]`,
          metadata: {
            source: 'query_filing',
            domain: domain || 'general',
            cited_memory_ids: citedIds,
            avg_cited_importance: avgImportance,
          },
        });

      if (insertErr) {
        log.warn('Query filing insert failed', { error: insertErr.message });
        return { filed: false };
      }

      log.info('Query insight filed to wiki', {
        userId,
        domain: domain || 'general',
        insight: insight.slice(0, 80),
        citedCount: citedIds.length,
        avgImportance,
      });

      return { filed: true, domain: domain || 'general', insight };
    }
  } catch (err) {
    log.warn('Query filing dedup/store failed', { userId, error: err.message });
  }

  return { filed: false };
}

/**
 * Build full graph data (nodes + edges) server-side.
 * @param {string} userId
 * @param {string[]} connectedPlatforms
 */
export async function buildWikiGraphData(userId, connectedPlatforms = []) {
  const [pages, entities] = await Promise.all([
    getWikiPages(userId),
    getWikiEntities(userId),
  ]);

  const nodes = [];
  const edges = [];
  const edgeSet = new Set();

  // Domain nodes
  for (const page of pages) {
    const config = WIKI_DOMAINS[page.domain];
    if (!config) continue;
    nodes.push({
      id: page.domain, type: 'domain', label: config.title,
      domain: page.domain, contentMd: page.content_md,
      version: page.version, compiledAt: page.compiled_at,
    });
  }

  // Cross-ref edges
  for (const page of pages) {
    const counts = new Map();
    const regex = /\[\[domain:(\w+)(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = regex.exec(page.content_md)) !== null) {
      const target = match[1];
      if (target !== page.domain && WIKI_DOMAINS[target]) {
        counts.set(target, (counts.get(target) || 0) + 1);
      }
    }
    for (const [target, count] of counts) {
      const key = [page.domain, target].sort().join('->');
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: page.domain, target, type: 'crossref', strength: Math.min(count / 5, 1.0) });
      }
    }
  }

  // Platform nodes + edges
  const platformKw = {
    spotify: ['spotify', 'playlist', 'listening', 'track', 'artist'],
    youtube: ['youtube', 'video', 'watch'],
    google_calendar: ['calendar', 'schedule', 'meeting'],
    discord: ['discord', 'server', 'community'],
    linkedin: ['linkedin', 'career'],
    github: ['github', 'repo', 'code'],
    reddit: ['reddit', 'subreddit'],
    gmail: ['gmail', 'email', 'inbox'],
    twitch: ['twitch', 'stream'],
    whoop: ['whoop', 'recovery', 'strain', 'hrv'],
  };
  for (const platform of connectedPlatforms) {
    nodes.push({ id: platform, type: 'platform', label: platform });
    const kws = platformKw[platform] || [];
    for (const page of pages) {
      const lower = page.content_md.toLowerCase();
      const cnt = kws.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0);
      if (cnt > 0) {
        const key = `${platform}->${page.domain}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: platform, target: page.domain, type: 'platform', strength: Math.min(cnt / 4, 1.0) }); }
      }
    }
  }

  // Entity nodes + edges
  for (const entity of entities) {
    const entityId = `entity_${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    nodes.push({
      id: entityId, type: 'entity', label: entity.name,
      category: entity.category, domains: entity.domains,
      confidence: entity.confidence, mentionCount: entity.mention_count,
    });
    for (const domain of entity.domains) {
      const key = `${entityId}->${domain}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: entityId, target: domain, type: 'entity', strength: entity.confidence * 0.7 }); }
    }
  }

  return {
    nodes, edges,
    stats: {
      domainCount: pages.length, platformCount: connectedPlatforms.length,
      entityCount: entities.length,
      crossrefCount: edges.filter(e => e.type === 'crossref').length,
      totalCompilations: pages.reduce((s, p) => s + p.version, 0),
    },
  };
}

// ====================================================================
// Read Operations
// ====================================================================

/**
 * Get all wiki pages for a user.
 * @param {string} userId
 * @returns {Array<{ domain, title, content_md, version, compiled_at }>}
 */
export async function getWikiPages(userId) {
  if (!userId) return [];

  const { data, error } = await supabaseAdmin
    .from('user_wiki_pages')
    .select('domain, title, content_md, version, compiled_at, created_at')
    .eq('user_id', userId)
    .order('domain');

  if (error) {
    log.warn('Failed to fetch wiki pages', { userId, error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Get a single wiki page by domain.
 * @param {string} userId
 * @param {string} domain
 * @returns {{ domain, title, content_md, version, compiled_at } | null}
 */
export async function getWikiPage(userId, domain) {
  if (!userId || !domain) return null;

  const { data, error } = await supabaseAdmin
    .from('user_wiki_pages')
    .select('domain, title, content_md, version, compiled_at, created_at')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (error) {
    log.warn('Failed to fetch wiki page', { userId, domain, error: error.message });
    return null;
  }

  return data;
}

/**
 * Vector search across a user's wiki pages.
 * Returns the most relevant pages for a given query embedding.
 *
 * @param {string} userId
 * @param {number[]|null} queryEmbedding - 1536-dim vector (or null to return all)
 * @param {number} limit - Max pages to return (default 3)
 * @returns {Array<{ domain, title, content_md, version, compiled_at, similarity }>}
 */
export async function getRelevantWikiPages(userId, queryEmbedding, limit = 3) {
  if (!userId) return [];

  // If no embedding provided, return all pages capped at limit
  if (!queryEmbedding) {
    const all = await getWikiPages(userId);
    return all.slice(0, limit);
  }

  // Vector search using pgvector cosine distance
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const { data, error } = await supabaseAdmin.rpc('match_wiki_pages', {
    p_user_id: userId,
    p_embedding: embeddingStr,
    p_limit: limit,
  });

  if (error) {
    // Fallback: return empty (let twinSummary take over) rather than dumping all pages
    log.warn('Wiki vector search failed, returning empty', { error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Get wiki compilation logs for a user.
 * @param {string} userId
 * @param {number} limit
 * @returns {Array<{ domain, version, change_summary, reflections_used, memories_used, created_at }>}
 */
export async function getWikiLogs(userId, limit = 20) {
  if (!userId) return [];

  const { data, error } = await supabaseAdmin
    .from('user_wiki_logs')
    .select('domain, version, change_summary, reflections_used, memories_used, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.warn('Failed to fetch wiki logs', { userId, error: error.message });
    return [];
  }

  return data || [];
}

// Export domain config for reference by other services
export { WIKI_DOMAINS, ALL_DOMAIN_IDS };
