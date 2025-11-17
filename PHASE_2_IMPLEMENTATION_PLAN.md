# Phase 2: Multi-Agent AI Orchestration - Implementation Plan

## Research Summary

Based on comprehensive research of 2025 multi-agent AI orchestration frameworks and Anthropic's production patterns, this plan implements a hierarchical multi-agent system for Twin-Me's behavioral pattern detection and soul signature analysis.

## Framework Selection: Custom Orchestrator with Anthropic Claude SDK

**Why not LangGraph/AutoGen:**
- LangGraph: Adds dependency complexity, overkill for our use case
- AutoGen: Microsoft-centric, message-passing overhead
- **Custom approach**: Lightweight, Claude-optimized, full control over context engineering

**Anthropic's proven pattern:**
- Orchestrator-worker architecture
- Parallel subagent execution
- Claude Opus 4 orchestrator + Claude Sonnet 4 subagents
- 90.2% performance improvement over single-agent

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Master Orchestrator Agent                   │
│  (Claude Opus 4 - Task Decomposition & Result Synthesis)    │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        │             │             │             │
        ▼             ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Recommendation│ │   Insight    │ │ Personality  │ │   Pattern    │
│     Agent     │ │    Agent     │ │    Agent     │ │   Detector   │
│ (Sonnet 4)    │ │ (Sonnet 4)   │ │ (Sonnet 4)   │ │    Agent     │
│               │ │              │ │              │ │ (Sonnet 4)   │
│ Music, Content│ │ Analytics    │ │ MBTI Assess  │ │ GNN Patterns │
│ Recommendations│ │ Metrics      │ │ Validation   │ │ Cypher Query │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

## Agent Definitions

### 1. Master Orchestrator Agent

**Role**: Central coordinator, task decomposition, result synthesis

**Responsibilities:**
- Analyze user requests and extract intent
- Decompose complex queries into sub-tasks
- Route tasks to specialized agents (parallel when possible)
- Synthesize results from multiple agents
- Maintain conversation state and context
- Handle error recovery and retries

**Model**: Claude Opus 4 (reasoning, planning)

**Input Example:**
```
User: "What music should I listen to before my big presentation tomorrow at 2pm?"
```

**Orchestrator Analysis:**
1. Extract calendar event (presentation, 2pm tomorrow)
2. Detect temporal patterns (music before events)
3. Get personality insights (stress response style)
4. Generate personalized recommendations

**Task Decomposition:**
```javascript
{
  tasks: [
    {
      agent: 'PatternDetectorAgent',
      objective: 'Find user's music listening patterns before important events',
      parallel: true,
      priority: 1
    },
    {
      agent: 'PersonalityAgent',
      objective: 'Assess user stress response and prep style',
      parallel: true,
      priority: 1
    },
    {
      agent: 'RecommendationAgent',
      objective: 'Generate music recommendations based on patterns and personality',
      parallel: false,
      priority: 2,
      dependencies: ['PatternDetectorAgent', 'PersonalityAgent']
    }
  ]
}
```

### 2. Recommendation Agent

**Role**: Generate personalized recommendations for music, content, activities

**Responsibilities:**
- Analyze user's soul signature and behavioral patterns
- Match content to personality traits
- Consider temporal context (time of day, upcoming events)
- Provide explanations for recommendations

**Model**: Claude Sonnet 4 (fast, efficient)

**Tools:**
- Spotify API (search tracks, playlists)
- YouTube API (search videos)
- User pattern database

**Output Format:**
```javascript
{
  recommendations: [
    {
      type: 'music',
      item: {
        track: 'Weightless',
        artist: 'Marconi Union',
        genre: 'ambient',
        audioFeatures: { energy: 0.2, valence: 0.4 }
      },
      reason: 'Your pattern shows you listen to low-energy ambient music 20 minutes before presentations. This track matches your stress-relief style.',
      confidence: 0.87
    }
  ],
  timing: '20 minutes before event (based on detected pattern)',
  personalityAlignment: 'INTJ - structured preparation with calming music'
}
```

### 3. Insight Agent

**Role**: Behavioral analytics, metrics, and data-driven insights

**Responsibilities:**
- Analyze user behavior across platforms
- Calculate metrics (frequency, trends, correlations)
- Generate human-readable insights
- Identify anomalies and changes over time

**Model**: Claude Sonnet 4

**Tools:**
- SQL queries to behavioral_patterns table
- Neo4j graph statistics
- GNN embeddings for clustering

**Output Format:**
```javascript
{
  insights: [
    {
      category: 'temporal_patterns',
      insight: 'You consistently listen to lo-fi music 15-25 minutes before important meetings (5 occurrences)',
      confidence: 0.85,
      trend: 'stable',
      recommendation: 'Create a pre-meeting playlist to optimize your preparation routine'
    }
  ],
  metrics: {
    total_patterns: 12,
    high_confidence_patterns: 5,
    temporal_correlations: 8
  }
}
```

### 4. Personality Agent

**Role**: MBTI assessment, personality validation, pattern alignment

**Responsibilities:**
- Administer 16 Personalities questionnaire
- Validate patterns against personality type
- Boost confidence for personality-aligned patterns
- Provide personality-contextualized explanations

**Model**: Claude Sonnet 4

**Tools:**
- 16 Personalities assessment database
- Personality trait mappings
- Pattern validation algorithms

**Output Format:**
```javascript
{
  personalityType: 'INTJ',
  traits: {
    stress_response: 'withdrawal_and_focus',
    preparation_style: 'structured_planning',
    music_preference: ['ambient', 'classical', 'lo-fi'],
    ideal_prep_time: 15 // minutes
  },
  patternValidation: {
    pattern_id: 'music_before_events_123',
    alignment: 0.92, // 92% alignment with INTJ traits
    confidence_boost: 0.12 // Increase pattern confidence by 12%
  }
}
```

### 5. Pattern Detector Agent

**Role**: GNN-based and Cypher-based pattern detection

**Responsibilities:**
- Query Neo4j for temporal patterns
- Run GNN model inference when needed
- Detect correlations vs causation
- Export pattern embeddings

**Model**: Claude Sonnet 4

**Tools:**
- Neo4j Cypher queries
- GNN pattern detector Python bridge
- Pattern correlation calculator

**Output Format:**
```javascript
{
  patterns: [
    {
      pattern_type: 'temporal_music_before_event',
      trigger: { type: 'calendar_event', event_type: 'presentation' },
      response: { type: 'music', genre: 'lo-fi', avg_energy: 0.3 },
      time_offset_minutes: 20,
      occurrence_count: 5,
      confidence_score: 85,
      source: 'neo4j_cypher' // or 'gnn_model'
    }
  ]
}
```

## Implementation Strategy

### Phase 2.1: Core Orchestrator (Week 1)

**Files to create:**
1. `api/services/agents/MasterOrchestrator.js` - Main orchestrator
2. `api/services/agents/AgentBase.js` - Shared agent utilities
3. `api/services/agents/TaskDecomposer.js` - Task analysis and decomposition
4. `api/services/agents/ResultSynthesizer.js` - Multi-agent result aggregation

**Key features:**
- Parallel task execution
- Dependency graph resolution
- Error handling and retries
- State persistence (Redis)

### Phase 2.2: Specialized Agents (Week 2)

**Files to create:**
1. `api/services/agents/RecommendationAgent.js`
2. `api/services/agents/InsightAgent.js`
3. `api/services/agents/PersonalityAgent.js`
4. `api/services/agents/PatternDetectorAgent.js`

**Each agent includes:**
- Claude API integration (Sonnet 4)
- Tool definitions and function calling
- Output validation
- Caching for efficiency

### Phase 2.3: API Routes & Integration (Week 2)

**Files to create:**
1. `api/routes/orchestrator.js` - RESTful endpoints
2. `api/routes/agents.js` - Individual agent endpoints (testing)

**Endpoints:**
- POST `/api/orchestrator/query` - Main orchestration endpoint
- POST `/api/orchestrator/recommend` - Quick recommendations
- POST `/api/orchestrator/insights` - Analytics insights
- GET `/api/orchestrator/health` - System health

### Phase 2.4: Frontend Integration (Week 3)

**Files to create/modify:**
1. `src/pages/TalkToTwin.tsx` - Integrate orchestrator
2. `src/components/AgentResponse.tsx` - Multi-agent response UI
3. `src/components/AgentThinking.tsx` - Show parallel agent execution

## Best Practices from Research

### 1. Context Engineering (Critical)

```javascript
// Good: Specific, bounded objectives
const taskPrompt = `
You are the Pattern Detector Agent. Your ONLY job is to:
1. Query Neo4j for temporal patterns matching: ${eventType}
2. Return patterns with confidence >= 0.75
3. Format output as JSON (schema provided)

DO NOT generate recommendations. DO NOT analyze personality.
Your role is pattern detection only.
`;

// Bad: Vague, unbounded
const taskPrompt = "Help find patterns for this user";
```

### 2. Parallel Execution (90% time reduction)

```javascript
// Execute independent tasks in parallel
const parallelTasks = tasks.filter(t => t.priority === 1);
const parallelResults = await Promise.all(
  parallelTasks.map(task => executeAgent(task))
);

// Sequential for dependent tasks
const dependentTask = tasks.find(t => t.priority === 2);
const result = await executeAgent(dependentTask, parallelResults);
```

### 3. State Management (Resumability)

```javascript
// Save state after each agent completion
await redis.set(`orchestrator:${sessionId}:state`, JSON.stringify({
  completedTasks: ['PatternDetectorAgent', 'PersonalityAgent'],
  pendingTasks: ['RecommendationAgent'],
  results: { ... }
}));

// Resume on error
if (error) {
  const state = await redis.get(`orchestrator:${sessionId}:state`);
  return resumeFromState(state);
}
```

### 4. Model Selection (Cost vs Quality)

- **Orchestrator**: Claude Opus 4 (complex reasoning, planning)
- **Subagents**: Claude Sonnet 4 (fast, 90% cheaper)
- **Pattern**: Use extended thinking for orchestrator planning
- **Cost savings**: 80% cheaper than all-Opus architecture

### 5. Tool Quality (Critical)

```javascript
// Good tool description
{
  name: 'detect_temporal_patterns',
  description: 'Query Neo4j for temporal behavioral patterns. Returns patterns where music activity PRECEDES calendar events within specified time window. Use this when user asks about habits, routines, or "what I do before X".',
  parameters: {
    event_type: 'Type of calendar event (presentation, meeting, interview)',
    min_confidence: 'Minimum confidence score 0-1 (default: 0.75)',
    time_window: 'Max minutes between music and event (default: 30)'
  }
}

// Bad tool description
{
  name: 'detect_patterns',
  description: 'Detect patterns'
}
```

### 6. Observable Decisions (Without logging content)

```javascript
// Log agent decisions, not conversation content
logger.info('Orchestrator decomposed task', {
  taskCount: tasks.length,
  parallelAgents: tasks.filter(t => t.parallel).length,
  dependencies: tasks.map(t => t.dependencies).flat()
});

// Don't log sensitive content
// ❌ logger.info('User query:', userMessage);
```

## Performance Targets

Based on Anthropic's research:

- **Query Response Time**: < 3 seconds for simple queries (1 agent, 3-10 tool calls)
- **Complex Analysis**: < 15 seconds for multi-agent (10+ subagents, parallel)
- **Token Efficiency**: 80% variance explained by smart context management
- **Accuracy**: 90%+ improvement over single-agent (Anthropic benchmark)
- **Cost**: 80% cheaper using Opus orchestrator + Sonnet subagents

## Evaluation Strategy

### Week 1: Unit Tests
- Each agent tested independently
- Mock tool responses
- Validate output schemas

### Week 2: Integration Tests
- Orchestrator + 2-3 agents
- Real tool calls (test data)
- Dependency resolution

### Week 3: Production Evaluation
- 20 real user queries (manual testing)
- LLM judge evaluating:
  - Factual accuracy
  - Completeness
  - Tool efficiency
  - Response quality

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent hallucinates | High | Validate outputs against schemas, add confidence thresholds |
| Cost overrun | Medium | Cache results, use Sonnet for subagents, set token limits |
| Latency > 30s | Medium | Parallel execution, abort slow agents after timeout |
| Context overflow | Low | Paginate results, summarize before passing to orchestrator |
| Tool failures | Medium | Retry logic, fallback to alternative tools, graceful degradation |

## Success Criteria

### Phase 2 Complete When:
1. ✅ Master Orchestrator decomposes tasks correctly
2. ✅ All 4 specialized agents execute independently
3. ✅ Parallel execution works (3+ agents concurrently)
4. ✅ Results synthesized into coherent response
5. ✅ < 3s response time for simple queries
6. ✅ 20 test queries pass with 90%+ accuracy

## Next Steps After Phase 2

- **Phase 3**: 16 Personalities Integration (2 weeks)
  - Personality assessment questionnaire
  - Pattern validation based on MBTI
  - Confidence boosting algorithm

- **Phase 4**: Advanced Features (3 weeks)
  - Real-time pattern streaming
  - Causality inference engine
  - Mobile metrics extraction

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Orchestrator Core | MasterOrchestrator.js, TaskDecomposer.js |
| 2 | Specialized Agents | 4 agent implementations, API routes |
| 3 | Integration & Testing | Frontend integration, evaluation framework |

**Total: 3 weeks to Phase 2 completion**

## References

- [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [LangGraph Multi-Agent Orchestration Guide 2025](https://latenode.com/blog/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)
- [AgentOrchestra: Hierarchical Multi-Agent Framework](https://arxiv.org/html/2506.12508v1)
- [Taxonomy of Hierarchical Multi-Agent Systems](https://arxiv.org/html/2508.12683)
