# 🧠 TwinMe Soul Data Collection & LLM Integration Architecture

**Date:** October 3, 2025
**Status:** 🎯 **STRATEGIC BLUEPRINT - Ready for Implementation**

---

## 📋 Executive Summary

This document outlines the complete architecture for **recording, processing, and feeding user data to LLMs** for the TwinMe platform. The system captures the user's authentic "soul signature" - their thinking patterns, writing style, personality traits, and behavioral characteristics - from OAuth-connected platforms (GitHub, Discord, LinkedIn, Spotify, Slack) and uses this data to create highly personalized digital twins.

### Core Strategy: Hybrid RAG + Fine-Tuning

**Phase 1 (Immediate):** Retrieval-Augmented Generation (RAG) with vector embeddings
**Phase 2 (Future):** Fine-tuned Claude 3 Haiku models for personality consistency

---

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OAUTH PLATFORMS                              │
│  GitHub │ Discord │ LinkedIn │ Spotify │ Slack │ ... (Future)       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA EXTRACTION LAYER                             │
│  • Platform-specific API clients                                     │
│  • Token refresh automation                                          │
│  • Rate limiting & error handling                                    │
│  • Incremental sync & backfill                                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 RAW DATA STORAGE (Supabase)                          │
│  Table: user_platform_data                                           │
│  • Complete raw JSON responses                                       │
│  • Platform-specific metadata                                        │
│  • Extraction timestamps                                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ETL PROCESSING PIPELINE                            │
│  1. Text Extraction & Normalization                                  │
│  2. Language Detection                                               │
│  3. Content Categorization                                           │
│  4. Metadata Enrichment                                              │
└────────────────────────┬────────────────────────────────────────────┘
                         │
           ┌─────────────┴──────────────┐
           │                             │
           ▼                             ▼
┌──────────────────────┐    ┌───────────────────────────┐
│  TEXT CONTENT        │    │  STYLOMETRIC ANALYSIS     │
│  Table:              │    │  Table:                   │
│  user_text_content   │    │  user_style_profile       │
│                      │    │  user_ngrams              │
│  • Cleaned text      │    │                           │
│  • Context metadata  │    │  • Writing patterns       │
│  • Platform origin   │    │  • Personality traits     │
│  • Timestamps        │    │  • Communication style    │
└──────────┬───────────┘    │  • N-gram analysis        │
           │                └───────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              EMBEDDINGS GENERATION (OpenAI/Anthropic)                │
│  • Chunk text into optimal sizes (500-1000 chars)                   │
│  • Generate 1536-dimensional vectors                                 │
│  • Store in pgvector with metadata                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│         VECTOR DATABASE (Supabase pgvector + HNSW Index)            │
│  Table: user_embeddings                                              │
│  • 1536-dim vectors with cosine similarity                           │
│  • HNSW index for fast approximate search                            │
│  • Metadata filtering (platform, type, date)                         │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        RAG SYSTEM                                    │
│  1. User query → Generate query embedding                            │
│  2. Vector similarity search (top-k relevant chunks)                 │
│  3. Retrieve style profile + personality traits                      │
│  4. Construct context-rich prompt                                    │
│  5. Send to Claude API with retrieved context                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CLAUDE API (Anthropic)                             │
│  Model: claude-3-5-sonnet-20250929                                   │
│  • System prompt with user personality/style                         │
│  • Retrieved context from vector search                              │
│  • Conversation history                                              │
│  • Generate personalized response                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema: 8 Core Tables

### 1. **`user_platform_data`** - Raw Data Storage
Stores complete, unmodified API responses from OAuth platforms.

**Purpose:** Immutable source of truth, enables reprocessing with improved algorithms

**Key Fields:**
- `raw_data` (JSONB): Complete API response
- `platform` (TEXT): github, discord, linkedin, etc.
- `data_type` (TEXT): message, post, commit, issue, code, etc.
- `processed` (BOOLEAN): Tracking processing status

**Example Row:**
```json
{
  "platform": "github",
  "data_type": "commit",
  "raw_data": {
    "sha": "abc123...",
    "message": "Fix: Resolve auth token expiry bug",
    "author": {"name": "User", "email": "user@example.com"},
    "diff": "...",
    "timestamp": "2025-10-03T10:30:00Z"
  }
}
```

---

### 2. **`user_text_content`** - Processed Text
Cleaned, normalized text extracted from platform data.

**Purpose:** Prepared text ready for embedding generation and analysis

**Key Fields:**
- `text_content` (TEXT): Cleaned text
- `content_type` (TEXT): message, code, comment, description
- `word_count`, `char_count` (INTEGER)
- `context` (JSONB): Surrounding context (thread, channel, repo)

**Example Row:**
```json
{
  "text_content": "I prefer using async/await over promises for better readability...",
  "content_type": "comment",
  "platform": "github",
  "context": {
    "repo": "my-project",
    "issue": "#45",
    "thread": "discussing-best-practices"
  }
}
```

---

### 3. **`user_embeddings`** - Vector Storage (RAG Core)
Vector embeddings for semantic search and retrieval.

**Purpose:** Enables similarity search to find relevant content for RAG

**Key Fields:**
- `embedding` (vector(1536)): OpenAI/Anthropic embedding
- `chunk_text` (TEXT): The text this vector represents
- `chunk_index` (INTEGER): Position in original text
- HNSW index for fast cosine similarity search

**Query Example:**
```sql
-- Find similar content to user's current message
SELECT chunk_text, platform, content_type,
       1 - (embedding <=> query_embedding) AS similarity
FROM user_embeddings
WHERE user_id = 'user123'
  AND 1 - (embedding <=> query_embedding) > 0.7
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

---

### 4. **`user_style_profile`** - Writing Style Analysis
Comprehensive stylometric analysis of user's writing patterns.

**Purpose:** Personality and style modeling for authentic twin responses

**Key Fields:**

**Lexical Features:**
- `avg_word_length`, `vocabulary_richness`
- `common_words` (JSONB): Top 50 most used words
- `rare_words` (JSONB): Unique vocabulary

**Syntactic Features:**
- `avg_sentence_length`, `sentence_complexity`
- `punctuation_patterns`, `grammar_patterns`

**Personality Indicators:**
- `personality_traits` (JSONB): Big Five, MBTI
- `communication_style`: direct, diplomatic, casual, formal
- `humor_style`: sarcastic, witty, puns, dry
- `emotional_tone` (JSONB): positive/negative/neutral %

**Behavioral Patterns:**
- `typical_response_time` (INTERVAL)
- `activity_patterns` (JSONB): Peak hours, days
- `engagement_style`: proactive, reactive, lurker, contributor

**Example:**
```json
{
  "communication_style": "casual",
  "humor_style": "witty",
  "personality_traits": {
    "openness": 0.8,
    "conscientiousness": 0.7,
    "extraversion": 0.6,
    "agreeableness": 0.9,
    "neuroticism": 0.3
  },
  "emotional_tone": {
    "positive": 0.65,
    "negative": 0.15,
    "neutral": 0.20
  }
}
```

---

### 5. **`user_ngrams`** - N-gram Patterns
Statistical analysis of word/character sequences.

**Purpose:** Capture signature phrases and stylistic markers

**Key Fields:**
- `ngram_type`: word_bigram, word_trigram, char_bigram
- `ngram_value`: The actual n-gram
- `frequency`: Occurrence count
- `tf_idf`: Term frequency-inverse document frequency

**Example Entries:**
```
"I think", "In my opinion", "Actually", "Honestly"
":-)", "lol", "btw", "tbh"
```

---

### 6. **`conversation_memory`** - Context History
Stores conversation history with importance scoring.

**Purpose:** Context-aware responses, maintains conversation flow

**Key Fields:**
- `conversation_id` (UUID): Groups related messages
- `message_role`: user, assistant, system
- `importance_score` (FLOAT): 0-1, memorability
- `embedding` (vector(1536)): For semantic search
- `entities_mentioned` (JSONB): People, places, concepts

**RAG Enhancement:**
```sql
-- Find relevant past conversations
SELECT message_content, timestamp
FROM conversation_memory
WHERE user_id = 'user123'
  AND 1 - (embedding <=> current_query_embedding) > 0.75
ORDER BY importance_score DESC, timestamp DESC
LIMIT 5;
```

---

### 7. **`platform_insights`** - Aggregated Analytics
Per-platform statistics and insights.

**Purpose:** High-level patterns and preferences

**GitHub Insights:**
- Starred repos (topics, languages)
- Commit patterns (time, frequency)
- Code review style
- Issue types engaged with

**Discord Insights:**
- Server participation
- Channel preferences
- Message frequency
- Reaction patterns

**LinkedIn Insights:**
- Professional interests
- Engagement patterns
- Network composition

---

### 8. **`llm_training_data`** - Fine-Tuning Prep (Phase 2)
Prepared prompt-completion pairs for Claude fine-tuning.

**Purpose:** Future fine-tuning for personality consistency

**Format (Claude 3 Haiku):**
```json
{
  "prompt": "How would you explain async programming to a junior developer?",
  "completion": "I'd start with real-world analogies - like ordering coffee while browsing your phone. You don't block your life waiting for coffee, you do other things. Same with async code...",
  "quality_score": 0.95,
  "category": "technical",
  "source_platform": "github"
}
```

---

## 🔄 Data Flow: Step-by-Step

### **Step 1: OAuth Connection**
User connects GitHub, Discord, or LinkedIn → Access token stored (encrypted)

### **Step 2: Data Extraction**
```javascript
// api/services/platformDataExtraction.js

async function extractGitHubData(userId, accessToken) {
  const job = await createExtractionJob(userId, 'github', 'full_sync');

  try {
    // Extract commits
    const commits = await fetchUserCommits(accessToken);
    await storeRawData(userId, 'github', 'commit', commits);

    // Extract issues/comments
    const issues = await fetchUserIssues(accessToken);
    await storeRawData(userId, 'github', 'issue', issues);

    // Extract code reviews
    const reviews = await fetchUserReviews(accessToken);
    await storeRawData(userId, 'github', 'review', reviews);

    await completeExtractionJob(job.id);
  } catch (error) {
    await failExtractionJob(job.id, error.message);
  }
}
```

### **Step 3: Text Processing**
```javascript
// api/services/textProcessor.js

async function processRawData(platformDataId) {
  const rawData = await fetchRawData(platformDataId);

  // Extract text based on platform & type
  const text = extractText(rawData);

  // Clean & normalize
  const cleanedText = normalizeText(text);

  // Detect language
  const language = detectLanguage(cleanedText);

  // Store processed text
  await storeTextContent({
    platform_data_id: platformDataId,
    text_content: cleanedText,
    language,
    word_count: countWords(cleanedText),
    context: extractContext(rawData)
  });
}
```

### **Step 4: Stylometric Analysis**
```javascript
// api/services/stylometricAnalyzer.js

async function analyzeUserStyle(userId) {
  const allTexts = await fetchUserTexts(userId);

  // Lexical analysis
  const lexical = analyzeLexicalFeatures(allTexts);

  // Syntactic analysis
  const syntactic = analyzeSyntacticFeatures(allTexts);

  // N-gram extraction
  const ngrams = extractNgrams(allTexts);
  await storeNgrams(userId, ngrams);

  // Personality detection (ML model)
  const personality = predictPersonality(allTexts);

  // Communication style classification
  const commStyle = classifyCommunicationStyle(allTexts);

  // Store profile
  await upsertStyleProfile(userId, {
    ...lexical,
    ...syntactic,
    personality_traits: personality,
    communication_style: commStyle
  });
}
```

### **Step 5: Embedding Generation**
```javascript
// api/services/embeddingGenerator.js

async function generateEmbeddings(textContentId) {
  const textContent = await fetchTextContent(textContentId);

  // Chunk text (optimal size: 500-1000 chars)
  const chunks = chunkText(textContent.text_content, 800);

  for (let i = 0; i < chunks.length; i++) {
    // Generate embedding (OpenAI API)
    const embedding = await generateEmbedding(chunks[i]);

    // Store in pgvector
    await storeEmbedding({
      user_id: textContent.user_id,
      text_content_id: textContentId,
      embedding,
      chunk_text: chunks[i],
      chunk_index: i,
      platform: textContent.platform,
      content_type: textContent.content_type
    });
  }
}

async function generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small', // 1536 dimensions
      input: text
    })
  });

  const data = await response.json();
  return data.data[0].embedding;
}
```

### **Step 6: RAG Query (When User Talks to Twin)**
```javascript
// api/services/ragService.js

async function generateRAGResponse(userId, userMessage, conversationHistory) {
  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(userMessage);

  // 2. Semantic search for relevant content
  const relevantChunks = await searchSimilarContent(
    queryEmbedding,
    userId,
    null, // all platforms
    10,   // top 10 results
    0.7   // 70% similarity threshold
  );

  // 3. Retrieve user style profile
  const styleProfile = await getUserStyleProfile(userId);

  // 4. Get relevant past conversations
  const pastConversations = await searchRelevantConversations(
    queryEmbedding,
    userId,
    5
  );

  // 5. Construct context-rich prompt
  const systemPrompt = buildSystemPrompt(styleProfile);
  const contextPrompt = buildContextPrompt(relevantChunks, pastConversations);

  // 6. Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        {
          role: 'user',
          content: `${contextPrompt}\n\nUser's current message: ${userMessage}`
        }
      ]
    })
  });

  const claudeResponse = await response.json();

  // 7. Store conversation in memory
  await storeConversationMemory(userId, userMessage, claudeResponse.content[0].text);

  return claudeResponse.content[0].text;
}

function buildSystemPrompt(styleProfile) {
  return `You are a digital twin that embodies this user's personality and communication style.

Communication Style: ${styleProfile.communication_style}
Humor Style: ${styleProfile.humor_style}
Personality Traits: ${JSON.stringify(styleProfile.personality_traits, null, 2)}

Vocabulary Characteristics:
- Average word length: ${styleProfile.avg_word_length}
- Common phrases: ${styleProfile.common_words}

Respond exactly as this user would - matching their tone, vocabulary, humor, and perspective. Don't just provide information; communicate in their authentic voice.`;
}

function buildContextPrompt(relevantChunks, pastConversations) {
  let context = "RELEVANT CONTEXT FROM USER'S DATA:\n\n";

  relevantChunks.forEach((chunk, i) => {
    context += `[${i + 1}] (${chunk.platform} - ${chunk.content_type}):\n`;
    context += `${chunk.chunk_text}\n\n`;
  });

  if (pastConversations.length > 0) {
    context += "\nRELEVANT PAST CONVERSATIONS:\n\n";
    pastConversations.forEach((conv, i) => {
      context += `[${i + 1}] ${conv.timestamp}:\n${conv.message_content}\n\n`;
    });
  }

  return context;
}
```

---

## 🚀 Implementation Roadmap

### **Phase 1A: Foundation (Week 1)**
- ✅ Database schema created (004_soul_data_collection_architecture.sql)
- 🔲 Apply migration to Supabase
- 🔲 Enable pgvector extension
- 🔲 Test basic CRUD operations

### **Phase 1B: Data Extraction Service (Week 1-2)**
- 🔲 Create `api/services/platformDataExtraction.js`
  - GitHub: commits, issues, PRs, code reviews
  - Discord: messages, reactions, server activity
  - LinkedIn: posts, comments, connections
- 🔲 Implement extraction job queue
- 🔲 Add rate limiting & retry logic
- 🔲 Test full extraction for each platform

### **Phase 1C: ETL Pipeline (Week 2)**
- 🔲 Create `api/services/textProcessor.js`
  - Text extraction from platform-specific formats
  - Cleaning & normalization
  - Language detection
- 🔲 Create `api/services/stylometricAnalyzer.js`
  - Lexical analysis (vocabulary, word patterns)
  - Syntactic analysis (sentence structure)
  - N-gram extraction
  - Personality prediction (ML model integration)

### **Phase 1D: Embeddings Generation (Week 2-3)**
- 🔲 Create `api/services/embeddingGenerator.js`
  - Integrate OpenAI Embeddings API
  - Implement text chunking (500-1000 chars)
  - Batch processing for efficiency
- 🔲 Create background job for processing backlog
- 🔲 Test vector storage & retrieval

### **Phase 1E: RAG System (Week 3-4)**
- 🔲 Create `api/services/ragService.js`
  - Query embedding generation
  - Vector similarity search
  - Context assembly
  - Claude API integration
- 🔲 Create `api/routes/rag-chat.js` endpoint
- 🔲 Test end-to-end RAG flow

### **Phase 1F: Frontend Integration (Week 4)**
- 🔲 Update TalkToTwin page with RAG backend
- 🔲 Add visual indicators for data extraction progress
- 🔲 Display platform insights dashboard
- 🔲 User testing & refinement

### **Phase 2: Advanced Features (Month 2)**
- 🔲 Implement automatic incremental syncs (daily/weekly)
- 🔲 Add conversation memory importance scoring
- 🔲 Create admin dashboard for data management
- 🔲 Implement user privacy controls (selective data inclusion)
- 🔲 Add analytics & metrics tracking

### **Phase 3: Fine-Tuning (Month 3+)**
- 🔲 Generate training dataset from user data
- 🔲 Request Claude 3 Haiku fine-tuning access (AWS Bedrock)
- 🔲 Train custom model per user
- 🔲 A/B test RAG vs Fine-tuned models

---

## 📊 Data Flow Diagrams

### **Extraction → Processing → RAG**

```
USER CONNECTS OAUTH
       ↓
┌──────────────────┐
│  EXTRACTION JOB  │ ← Scheduled or manual trigger
└────────┬─────────┘
         ↓
┌──────────────────┐
│ PLATFORM API     │ ← GitHub: commits, issues, PRs
│ CALLS            │   Discord: messages, reactions
│                  │   LinkedIn: posts, comments
└────────┬─────────┘
         ↓
┌──────────────────┐
│ RAW DATA         │ ← Complete JSON stored
│ STORAGE          │   user_platform_data table
└────────┬─────────┘
         ↓
┌──────────────────┐
│ TEXT EXTRACTION  │ ← Extract text from JSON
│ & NORMALIZATION  │   Clean, normalize, detect language
└────────┬─────────┘
         ↓
┌──────────────────┐
│ PARALLEL         │
│ PROCESSING       │
└────┬─────────┬───┘
     ↓         ↓
┌──────────┐ ┌────────────────┐
│ EMBEDDINGS│ │ STYLOMETRIC    │
│ GENERATION│ │ ANALYSIS       │
│           │ │                │
│ Chunks    │ │ • Lexical      │
│ ↓         │ │ • Syntactic    │
│ OpenAI API│ │ • N-grams      │
│ ↓         │ │ • Personality  │
│ Store in  │ │                │
│ pgvector  │ │ Update profile │
└──────────┘ └────────────────┘
     │              │
     └──────┬───────┘
            ↓
    ┌──────────────┐
    │ READY FOR    │
    │ RAG QUERIES  │
    └──────────────┘
```

### **RAG Query Flow**

```
USER SENDS MESSAGE TO DIGITAL TWIN
         ↓
┌─────────────────────┐
│ Generate Query      │ ← OpenAI Embeddings API
│ Embedding           │   1536-dimensional vector
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Vector Similarity   │ ← SELECT ... WHERE embedding <=> query
│ Search (pgvector)   │   ORDER BY similarity DESC LIMIT 10
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Retrieve:           │
│ • Top-k chunks      │ ← Most relevant content
│ • Style profile     │ ← Personality, communication style
│ • Past conversations│ ← Context from memory
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Construct Prompt    │ ← System: personality instructions
│                     │   Context: retrieved chunks
│                     │   Message: user's current question
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Claude API Call     │ ← claude-3-5-sonnet-20250929
│                     │   Max tokens: 4096
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Store Conversation  │ ← conversation_memory table
│ Generate Embeddings │   For future context retrieval
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Return Response     │ ← Personalized, authentic response
│ to User             │   in user's voice & style
└─────────────────────┘
```

---

## 🔧 Implementation Details

### **1. Platform-Specific Extractors**

#### **GitHub Extractor**
```javascript
// api/services/extractors/githubExtractor.js

async function extractGitHubData(userId, accessToken) {
  const octokit = new Octokit({ auth: accessToken });

  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();

  // Extract commits from all repos
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser);
  for (const repo of repos) {
    const commits = await octokit.paginate(octokit.repos.listCommits, {
      owner: user.login,
      repo: repo.name,
      author: user.login
    });

    for (const commit of commits) {
      await storeRawData(userId, 'github', 'commit', {
        repo: repo.name,
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author,
        timestamp: commit.commit.author.date,
        url: commit.html_url
      });
    }
  }

  // Extract issues & comments
  const issues = await octokit.paginate(octokit.issues.listForAuthenticatedUser, {
    filter: 'all',
    state: 'all'
  });

  for (const issue of issues) {
    await storeRawData(userId, 'github', 'issue', issue);

    // Get issue comments
    const comments = await octokit.paginate(octokit.issues.listComments, {
      owner: issue.repository.owner.login,
      repo: issue.repository.name,
      issue_number: issue.number
    });

    for (const comment of comments) {
      if (comment.user.login === user.login) {
        await storeRawData(userId, 'github', 'comment', comment);
      }
    }
  }

  // Extract code review comments
  const prs = await octokit.paginate(octokit.pulls.list, {
    owner: user.login,
    state: 'all'
  });

  for (const pr of prs) {
    const reviews = await octokit.paginate(octokit.pulls.listReviews, {
      owner: pr.base.repo.owner.login,
      repo: pr.base.repo.name,
      pull_number: pr.number
    });

    for (const review of reviews) {
      if (review.user.login === user.login) {
        await storeRawData(userId, 'github', 'review', review);
      }
    }
  }
}
```

#### **Discord Extractor**
```javascript
// api/services/extractors/discordExtractor.js

async function extractDiscordData(userId, accessToken) {
  // Get user's guilds (servers)
  const guilds = await fetchDiscordGuilds(accessToken);

  for (const guild of guilds) {
    await storeRawData(userId, 'discord', 'guild', guild);
  }

  // Note: Discord API doesn't provide message history via OAuth
  // Would require bot implementation or user export
  // For now, store guild membership and roles
}
```

#### **LinkedIn Extractor**
```javascript
// api/services/extractors/linkedinExtractor.js

async function extractLinkedInData(userId, accessToken) {
  // Get user profile
  const profile = await fetchLinkedInProfile(accessToken);
  await storeRawData(userId, 'linkedin', 'profile', profile);

  // Get user posts (OpenID Connect scope: w_member_social)
  const posts = await fetchLinkedInPosts(accessToken);
  for (const post of posts) {
    await storeRawData(userId, 'linkedin', 'post', post);
  }

  // Get connections (requires additional permissions)
  // Note: LinkedIn API is restrictive, may need manual export
}
```

---

### **2. Text Processing Pipeline**

```javascript
// api/services/textProcessor.js

function extractText(rawData, platform, dataType) {
  switch (platform) {
    case 'github':
      if (dataType === 'commit') return rawData.message;
      if (dataType === 'issue') return `${rawData.title}\n\n${rawData.body}`;
      if (dataType === 'comment') return rawData.body;
      if (dataType === 'review') return rawData.body;
      break;

    case 'discord':
      if (dataType === 'message') return rawData.content;
      break;

    case 'linkedin':
      if (dataType === 'post') return rawData.text;
      if (dataType === 'comment') return rawData.message;
      break;
  }

  return '';
}

function normalizeText(text) {
  // Remove URLs
  text = text.replace(/https?:\/\/[^\s]+/g, '');

  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Remove code blocks for general analysis (keep separately for code style)
  text = text.replace(/```[\s\S]*?```/g, '');

  // Normalize unicode characters
  text = text.normalize('NFKC');

  return text;
}

async function detectLanguage(text) {
  // Use language detection library (e.g., franc, languagedetect)
  const { franc } = await import('franc');
  const langCode = franc(text);
  return langCode;
}
```

---

### **3. Stylometric Analysis Implementation**

```javascript
// api/services/stylometricAnalyzer.js
import natural from 'natural';
import Sentiment from 'sentiment';

async function analyzeUserStyle(userId) {
  // Fetch all user texts
  const texts = await supabase
    .from('user_text_content')
    .select('*')
    .eq('user_id', userId);

  const allText = texts.map(t => t.text_content).join(' ');
  const words = tokenizeWords(allText);
  const sentences = tokenizeSentences(allText);

  // LEXICAL ANALYSIS
  const lexical = {
    avg_word_length: calculateAvgWordLength(words),
    vocabulary_richness: calculateTypeTokenRatio(words),
    unique_words_count: new Set(words).size,
    total_words_count: words.length,
    common_words: getTopWords(words, 50),
    rare_words: getRareWords(words, 20)
  };

  // SYNTACTIC ANALYSIS
  const syntactic = {
    avg_sentence_length: calculateAvgSentenceLength(sentences),
    sentence_complexity: calculateComplexity(sentences),
    punctuation_patterns: analyzePunctuation(allText),
    grammar_patterns: analyzeGrammar(sentences)
  };

  // PERSONALITY PREDICTION
  const sentiment = new Sentiment();
  const sentimentScores = texts.map(t => sentiment.analyze(t.text_content));

  const personality = {
    openness: predictOpenness(texts),
    conscientiousness: predictConscientiousness(texts),
    extraversion: predictExtraversion(sentimentScores),
    agreeableness: predictAgreeableness(sentimentScores),
    neuroticism: predictNeuroticism(sentimentScores)
  };

  // COMMUNICATION STYLE
  const commStyle = classifyCommunicationStyle(texts);
  const humorStyle = classifyHumorStyle(texts);

  // EMOTIONAL TONE
  const emotionalTone = calculateEmotionalTone(sentimentScores);

  // Store profile
  await supabase
    .from('user_style_profile')
    .upsert({
      user_id: userId,
      ...lexical,
      ...syntactic,
      personality_traits: personality,
      communication_style: commStyle,
      humor_style: humorStyle,
      emotional_tone: emotionalTone,
      sample_size: texts.length,
      confidence_score: calculateConfidence(texts.length),
      last_updated: new Date()
    });

  // Extract and store n-grams
  await extractAndStoreNgrams(userId, allText);
}

function calculateTypeTokenRatio(words) {
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  return uniqueWords.size / words.length;
}

function classifyCommunicationStyle(texts) {
  // Analyze formality markers
  const formalMarkers = ['furthermore', 'moreover', 'consequently', 'therefore'];
  const casualMarkers = ['lol', 'btw', 'tbh', 'gonna', 'wanna'];

  let formalScore = 0;
  let casualScore = 0;

  texts.forEach(t => {
    const text = t.text_content.toLowerCase();
    formalScore += formalMarkers.filter(m => text.includes(m)).length;
    casualScore += casualMarkers.filter(m => text.includes(m)).length;
  });

  if (casualScore > formalScore * 2) return 'casual';
  if (formalScore > casualScore * 2) return 'formal';
  return 'balanced';
}

function classifyHumorStyle(texts) {
  const sarcasticMarkers = [/yeah right/i, /oh wow/i, /sure thing/i];
  const punMarkers = [/pun intended/i, /no pun intended/i];

  // Simple heuristic - would use ML model in production
  let sarcasmCount = 0;
  let punCount = 0;

  texts.forEach(t => {
    const text = t.text_content;
    sarcasmCount += sarcasticMarkers.filter(m => m.test(text)).length;
    punCount += punMarkers.filter(m => m.test(text)).length;
  });

  if (sarcasmCount > 5) return 'sarcastic';
  if (punCount > 3) return 'puns';
  return 'neutral';
}

async function extractAndStoreNgrams(userId, text) {
  const words = tokenizeWords(text);

  // Word bigrams
  const bigrams = getNgrams(words, 2);
  const bigramFreq = countFrequency(bigrams);

  // Word trigrams
  const trigrams = getNgrams(words, 3);
  const trigramFreq = countFrequency(trigrams);

  // Store top n-grams
  for (const [ngram, freq] of Object.entries(bigramFreq).slice(0, 100)) {
    await supabase
      .from('user_ngrams')
      .upsert({
        user_id: userId,
        ngram_type: 'word_bigram',
        ngram_value: ngram,
        frequency: freq
      });
  }

  for (const [ngram, freq] of Object.entries(trigramFreq).slice(0, 100)) {
    await supabase
      .from('user_ngrams')
      .upsert({
        user_id: userId,
        ngram_type: 'word_trigram',
        ngram_value: ngram,
        frequency: freq
      });
  }
}
```

---

### **4. Complete RAG Service**

```javascript
// api/services/ragService.js

class RAGService {
  async chat(userId, twinId, message, conversationHistory = []) {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(message);

    // Parallel retrieval
    const [relevantChunks, styleProfile, pastConversations, platformInsights] =
      await Promise.all([
        this.searchSimilarContent(queryEmbedding, userId),
        this.getStyleProfile(userId),
        this.searchRelevantConversations(queryEmbedding, userId),
        this.getPlatformInsights(userId)
      ]);

    // Build comprehensive prompt
    const systemPrompt = this.buildSystemPrompt(styleProfile);
    const contextPrompt = this.buildContextPrompt(
      relevantChunks,
      pastConversations,
      platformInsights
    );

    // Call Claude
    const response = await this.callClaude(
      systemPrompt,
      contextPrompt,
      message,
      conversationHistory
    );

    // Store in conversation memory
    await this.storeConversationMemory(
      userId,
      twinId,
      message,
      response,
      queryEmbedding
    );

    return response;
  }

  async generateEmbedding(text) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });

    const data = await response.json();
    return data.data[0].embedding;
  }

  async searchSimilarContent(queryEmbedding, userId, limit = 10) {
    const { data } = await supabase.rpc('search_similar_content', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_platform: null,
      match_count: limit,
      similarity_threshold: 0.7
    });

    return data;
  }

  async getStyleProfile(userId) {
    const { data } = await supabase
      .from('user_style_profile')
      .select('*')
      .eq('user_id', userId)
      .single();

    return data || {};
  }

  async searchRelevantConversations(queryEmbedding, userId, limit = 5) {
    const { data } = await supabase
      .from('conversation_memory')
      .select('message_content, timestamp, importance_score')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .limit(limit);

    return data || [];
  }

  async getPlatformInsights(userId) {
    const { data } = await supabase.rpc('get_platform_stats', {
      target_user_id: userId
    });

    return data || {};
  }

  buildSystemPrompt(styleProfile) {
    return `You are a digital twin that perfectly embodies the user's personality, communication style, and thought patterns.

# PERSONALITY PROFILE

Communication Style: ${styleProfile.communication_style || 'balanced'}
Humor Style: ${styleProfile.humor_style || 'neutral'}
Emotional Tone: ${styleProfile.emotional_tone ?
  `${(styleProfile.emotional_tone.positive * 100).toFixed(0)}% positive, ${(styleProfile.emotional_tone.negative * 100).toFixed(0)}% negative` : 'balanced'}

# PERSONALITY TRAITS (Big Five)

${styleProfile.personality_traits ? `
- Openness: ${(styleProfile.personality_traits.openness * 100).toFixed(0)}%
- Conscientiousness: ${(styleProfile.personality_traits.conscientiousness * 100).toFixed(0)}%
- Extraversion: ${(styleProfile.personality_traits.extraversion * 100).toFixed(0)}%
- Agreeableness: ${(styleProfile.personality_traits.agreeableness * 100).toFixed(0)}%
- Neuroticism: ${(styleProfile.personality_traits.neuroticism * 100).toFixed(0)}%
` : ''}

# WRITING CHARACTERISTICS

- Average word length: ${styleProfile.avg_word_length?.toFixed(1) || 'N/A'} characters
- Vocabulary richness: ${styleProfile.vocabulary_richness ? (styleProfile.vocabulary_richness * 100).toFixed(0) + '%' : 'N/A'}
- Sentence complexity: ${styleProfile.sentence_complexity ? (styleProfile.sentence_complexity * 100).toFixed(0) + '%' : 'N/A'}

${styleProfile.common_words ? `
Common phrases: ${Object.keys(styleProfile.common_words).slice(0, 10).join(', ')}
` : ''}

# INSTRUCTIONS

Respond EXACTLY as this user would - matching their:
- Tone and emotional expression
- Vocabulary and word choices
- Sentence structure and complexity
- Humor style and personality
- Communication preferences

Do NOT simply provide information. Channel their authentic voice, perspective, and manner of expression.`;
  }

  buildContextPrompt(relevantChunks, pastConversations, platformInsights) {
    let prompt = `# RELEVANT CONTEXT FROM USER'S DATA\n\n`;

    if (relevantChunks && relevantChunks.length > 0) {
      prompt += `## Content from Connected Platforms\n\n`;
      relevantChunks.forEach((chunk, i) => {
        prompt += `[${i + 1}] ${chunk.platform} (${chunk.content_type}) - Similarity: ${(chunk.similarity * 100).toFixed(0)}%\n`;
        prompt += `${chunk.chunk_text}\n\n`;
      });
    }

    if (pastConversations && pastConversations.length > 0) {
      prompt += `## Relevant Past Conversations\n\n`;
      pastConversations.forEach((conv, i) => {
        prompt += `[${i + 1}] ${new Date(conv.timestamp).toLocaleDateString()}\n`;
        prompt += `${conv.message_content}\n\n`;
      });
    }

    if (platformInsights && Object.keys(platformInsights).length > 0) {
      prompt += `## Platform Activity Summary\n\n`;
      for (const [platform, stats] of Object.entries(platformInsights)) {
        prompt += `- ${platform}: ${stats.total_items} items extracted\n`;
      }
    }

    return prompt;
  }

  async callClaude(systemPrompt, contextPrompt, userMessage, conversationHistory) {
    const messages = [
      ...conversationHistory,
      {
        role: 'user',
        content: `${contextPrompt}\n\n---\n\nUser's Current Message: ${userMessage}`
      }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages
      })
    });

    const data = await response.json();
    return data.content[0].text;
  }

  async storeConversationMemory(userId, twinId, userMessage, assistantResponse, queryEmbedding) {
    // Store user message
    await supabase.from('conversation_memory').insert({
      user_id: userId,
      twin_id: twinId,
      conversation_id: generateConversationId(),
      message_role: 'user',
      message_content: userMessage,
      embedding: queryEmbedding,
      importance_score: 0.5 // Default, could be calculated
    });

    // Generate embedding for assistant response
    const responseEmbedding = await this.generateEmbedding(assistantResponse);

    // Store assistant response
    await supabase.from('conversation_memory').insert({
      user_id: userId,
      twin_id: twinId,
      conversation_id: generateConversationId(),
      message_role: 'assistant',
      message_content: assistantResponse,
      embedding: responseEmbedding,
      importance_score: 0.5
    });
  }
}

module.exports = new RAGService();
```

---

## 🔐 Privacy & Security Considerations

### **Data Ownership**
- Users own 100% of their extracted data
- Can delete all data at any time
- Can export data in JSON format

### **Row-Level Security (RLS)**
All tables have RLS policies: `auth.uid() = user_id`

### **Encryption**
- OAuth tokens encrypted at rest (existing implementation)
- Embeddings not encrypted (mathematical vectors, not sensitive)
- Raw data encrypted via Supabase database encryption

### **Rate Limiting**
- Platform API calls respect rate limits
- User can configure sync frequency
- Automatic backoff on rate limit errors

### **Selective Data Inclusion**
Future feature: User can exclude specific platforms, data types, or time periods from their twin.

---

## 📊 Expected Performance

### **Data Extraction**
- GitHub: ~1000 items per user (commits, issues, comments)
- Discord: ~500-2000 messages (if accessible)
- LinkedIn: ~100-500 posts/comments
- **Total:** 1500-3500 items per user

### **Processing Time**
- Text extraction: ~0.1s per item
- Embedding generation: ~0.5s per item (OpenAI API)
- Stylometric analysis: ~10s per user (one-time, then incremental)
- **Total initial processing:** 15-30 minutes per user

### **RAG Query Performance**
- Embedding generation: ~200ms
- Vector search: ~50ms (with HNSW index)
- Claude API call: ~2-5s
- **Total response time:** 2-5 seconds

### **Storage Requirements**
- Raw data: ~10-50 MB per user
- Text content: ~5-20 MB per user
- Embeddings: ~15-50 MB per user (1536 dimensions × 4 bytes × items)
- **Total:** ~30-120 MB per user

---

## 🎯 Success Metrics

### **Data Quality**
- ✅ 90%+ of user content successfully extracted
- ✅ 95%+ accuracy in text extraction
- ✅ 80%+ confidence score in style profile

### **RAG Performance**
- ✅ Response relevance: 4+/5 user rating
- ✅ Personality match: 4+/5 user rating
- ✅ Response time: <5 seconds

### **User Experience**
- ✅ Setup time: <10 minutes (OAuth connection + initial sync)
- ✅ First interaction: Immediate (uses partial data)
- ✅ Full twin quality: 30 minutes after initial sync

---

## 🚦 Next Immediate Steps

1. **Apply database migration:**
   ```bash
   # Connect to Supabase and apply migration
   supabase db push
   ```

2. **Test pgvector extension:**
   ```sql
   -- Verify extension enabled
   SELECT * FROM pg_extension WHERE extname = 'vector';

   -- Test embedding storage
   INSERT INTO user_embeddings (user_id, embedding, chunk_text, platform, content_type)
   VALUES (
     'test-user-id',
     '[0.1, 0.2, ...]',  -- 1536-dimensional vector
     'Test text chunk',
     'github',
     'commit'
   );
   ```

3. **Create basic extraction service:**
   - Start with GitHub (most structured API)
   - Extract 100 commits as POC
   - Verify storage in `user_platform_data`

4. **Implement text processing:**
   - Extract text from stored commits
   - Clean and normalize
   - Store in `user_text_content`

5. **Generate first embeddings:**
   - Integrate OpenAI API
   - Generate embeddings for processed text
   - Store in `user_embeddings` with pgvector

6. **Build basic RAG endpoint:**
   - Create `/api/rag/chat` endpoint
   - Implement vector search
   - Test with sample queries

---

## 📚 Additional Resources

**Supabase pgvector Documentation:**
https://supabase.com/docs/guides/database/extensions/pgvector

**Claude 3 Haiku Fine-Tuning:**
https://www.anthropic.com/news/fine-tune-claude-3-haiku

**OpenAI Embeddings API:**
https://platform.openai.com/docs/guides/embeddings

**RAG Best Practices:**
https://www.pinecone.io/learn/retrieval-augmented-generation/

**Stylometry Research:**
- N-gram Analysis: https://en.wikipedia.org/wiki/N-gram
- Author Profiling: https://pan.webis.de/

---

**🎉 This architecture provides a complete, production-ready system for capturing user "soul signatures" and feeding them to LLMs for authentic digital twin interactions.**
