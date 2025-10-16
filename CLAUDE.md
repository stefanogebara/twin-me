# Soul Signature Platform - Claude Development Guide

## Project Overview

**Soul Signature Platform** (TwinMe) is a revolutionary digital identity platform that creates authentic digital twins by capturing your true originality - not just your public persona, but your complete soul signature. The platform discovers what makes you genuinely YOU through digital footprints that reveal your authentic curiosities, passions, and characteristics.

## Recent Updates (January 2025)

### Platform Refinement
- **Removed Educational Features**: Eliminated 2,041 lines of code related to professor chat and educational onboarding to focus purely on Soul Signature discovery
- **Authentic Data Only**: Removed all sample data fallbacks (262 lines), platform now uses only real user data
- **Claude AI Personality Analysis**: Replaced simplistic keyword matching with Claude 3.5 Sonnet for sophisticated Big Five personality trait analysis
- **Soul Signature Branding**: Rebranded user-facing language from "Digital Twin" to "Soul Signature" for clearer platform identity
- **Data Quality Indicators**: Added extraction status badges showing connection and extraction states with visual quality indicators

### Technical Improvements
- **Claude API Integration**: `api/services/stylometricAnalyzer.js` now uses Claude for context-aware personality analysis
- **Authentic Error States**: Spotify/YouTube failures return honest "NO_DATA" errors instead of fake fallbacks
- **Type System Updates**: Core types updated to reflect Soul Signature extraction focus
- **Frontend Extraction Controls**: Enhanced SoulDataExtractor component with real-time progress and quality scores

## Core Philosophy: The Soul Signature

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

**The Problem with Public Information:**
Everything public about a person is increasingly easy to clone and digitize. But information doesn't have a soul. While professional content and public achievements can be easily replicated, they lack the essence of who someone truly is.

**Our Solution:**
The beauty of our digital twin is finding the **signature of each person's originality** - not just what they wrote or their professional content, but their:
- Authentic curiosities and interests
- Characteristic behavioral patterns
- Personal entertainment choices
- Unique thought processes
- Things that make them genuinely themselves

## The Personal-Professional Spectrum

### Personal Universe (Your Soul Signature)
Entertainment and lifestyle platforms that reveal your authentic self:

**Streaming & Entertainment:**
- **Netflix**: Narrative preferences, binge patterns, emotional journeys
- **Prime/HBO/Disney+**: Content preferences across platforms
- **YouTube**: Learning interests, curiosity profile, creator loyalty
- **TikTok**: Trend participation, attention patterns
- **Twitch**: Live engagement, community participation

**Music & Audio:**
- **Spotify**: Musical taste, mood patterns, discovery behavior
- **Apple Music**: Curated tastes, premium preferences

**Social & Community:**
- **Discord**: Community involvement, social circles
- **Reddit**: Discussion style, expertise areas
- **Gaming Platforms (Steam)**: Game genres, playtime patterns

**Reading & Learning:**
- **Goodreads**: Reading preferences, intellectual interests
- **Personal browsing**: Research patterns, knowledge seeking

### Professional Universe (Your Work Identity)
Tools and platforms that capture your professional persona:
- **Gmail**: Communication style, response patterns
- **Microsoft Teams**: Collaboration dynamics, meeting participation
- **Calendar**: Schedule preferences, work-life balance
- **GitHub**: Technical skills, contribution patterns
- **LinkedIn**: Professional trajectory, skill endorsements
- **Slack**: Team dynamics, communication patterns
- **Google Workspace**: Document creation, organization style

## Revolutionary Feature: "What's To Reveal, What's To Share"

The most sophisticated privacy control interface - a visually stunning dashboard where you see everything collected about you with **intensity controls**:

### Life Clusters with Granular Control
Interactive clusters with thermometer-style intensity sliders (0-100% revelation):

**Personal Clusters:**
- Hobbies & Interests
- Sports & Fitness
- Spirituality & Religion
- Entertainment Choices
- Social Connections

**Professional Clusters:**
- Studies & Education
- Career & Jobs
- Skills & Expertise
- Achievements & Recognition

**Creative Clusters:**
- Artistic Expression
- Content Creation
- Musical Identity

### Contextual Revelation
- Different privacy settings for different audiences
- Audience-specific twins (professional, social, dating, educational)
- Example: "I don't want you to mention my Netflix series" vs "Share my viewing habits"

## Technology Stack

### Frontend
- **React 18.3.1** with TypeScript
- **Vite 5.4.19** for build tooling
- **Tailwind CSS 3.4.17** with Anthropic-inspired design system
- **shadcn/ui** components with Radix UI primitives
- **React Router DOM 6.30.1** for routing
- **TanStack React Query 5.83.0** for state management
- **Framer Motion 12.23.13** for animations

### Backend
- **Node.js** with **Express 5.1.0**
- **Supabase** (PostgreSQL) for database
- **Express Rate Limiting** and **Helmet** for security
- **Multer** for file upload handling

### AI & Voice
- **Anthropic Claude API** (claude-3-5-sonnet model)
- **OpenAI API** for additional AI processing
- **ElevenLabs API** for voice synthesis

## Development Environment

### Environment Configuration

```bash
# Development servers
Frontend: http://localhost:8086 (Vite dev server)
Backend: http://localhost:3001 (Express API)

# Start development
npm run dev          # Frontend only
npm run server:dev   # Backend only
npm run dev:full     # Both frontend and backend
```

### Environment Variables (.env)

**Database & Authentication:**
```env
VITE_SUPABASE_URL="https://lurebwaudisfilhuhmnj.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

**AI & Voice APIs:**
```env
ANTHROPIC_API_KEY="your-anthropic-key"
OPENAI_API_KEY="your-openai-key"
ELEVENLABS_API_KEY="your-elevenlabs-key"
VITE_ELEVENLABS_API_KEY="your-elevenlabs-key"
```

**Server Configuration:**
```env
PORT=3001
NODE_ENV=development
VITE_APP_URL=http://localhost:8086
VITE_API_URL=http://localhost:3001/api
```

## Core Features

### 1. Soul Signature Dashboard
**Location:** `src/pages/SoulSignatureDashboard.tsx`
**Purpose:** Main interface for discovering and managing your soul signature

**Key Features:**
- Visual life clusters (personal, professional, creative)
- Real-time data integration status
- Privacy intensity controls
- Soul signature visualization

### 2. Privacy Spectrum Dashboard
**Location:** `src/components/PrivacySpectrumDashboard.tsx`
**Purpose:** Granular privacy control interface

**Features:**
- Thermometer-style intensity sliders (0-100%)
- Life cluster categorization
- Contextual revelation settings
- Audience-specific twin configurations

### 3. Platform Connectors
**Location:** `api/routes/entertainment-connectors.js`, `api/routes/mcp-connectors.js`
**Purpose:** OAuth integration with 30+ platforms

**Supported Platforms:**
- ✅ **Has API**: Spotify, YouTube, GitHub, LinkedIn, Reddit, Twitch, Discord
- ⚠️ **Limited API**: Netflix (no watch history), Instagram, TikTok
- ❌ **No API**: HBO, Prime Video, Disney+ (requires browser extension)

### 4. Soul Extraction Engine
**Location:** `api/routes/soul-extraction.js`, `api/services/dataExtraction.js`
**Purpose:** Extract authentic personality from platform data

**Capabilities:**
- Behavioral pattern recognition
- Interest clustering
- Personality trait extraction
- Curiosity profiling
- Mood and preference analysis

## Design System - Anthropic Inspired

### Color Palette
```css
:root {
  /* Backgrounds */
  --color-ivory: #FAF9F5;           /* Main background */
  --color-white: #FFFFFF;            /* Surface/cards */

  /* Text */
  --color-slate: #141413;            /* Primary text */
  --color-slate-medium: #595959;     /* Secondary text */
  --color-slate-light: #8C8C8C;      /* Muted text */

  /* Accents */
  --color-orange: #D97706;           /* Interactive */
  --color-orange-hover: #B45309;     /* Hover state */

  /* Borders */
  --color-slate-faded: rgba(20, 20, 19, 0.1);
}
```

### Typography
```css
/* Headlines - Space Grotesk (Styrene B alternative) */
--font-heading: 'Space Grotesk', system-ui, sans-serif;
font-weight: 500;  /* Medium */
line-height: 1.1;
letter-spacing: -0.02em;

/* Body - Source Serif 4 (Tiempos alternative) */
--font-body: 'Source Serif 4', Georgia, serif;
font-weight: 400;
line-height: 1.6;

/* UI - DM Sans */
--font-ui: 'DM Sans', system-ui, sans-serif;
```

## API Architecture

### Core API Routes

**Platform Connections:**
```
GET  /api/platforms                    - List available platforms
POST /api/platforms/connect/:platform  - Initiate OAuth flow
GET  /api/platforms/callback/:platform - OAuth callback handler
GET  /api/platforms/status             - Get connection status
```

**Soul Extraction:**
```
POST /api/soul-extraction/extract      - Extract soul signature
GET  /api/soul-extraction/profile/:id  - Get soul profile
PUT  /api/soul-extraction/privacy      - Update privacy settings
```

**Digital Twins:**
```
GET    /api/twins             - List user's twins
POST   /api/twins             - Create new twin
GET    /api/twins/:id         - Get specific twin
PUT    /api/twins/:id         - Update twin
DELETE /api/twins/:id         - Delete twin
```

**Soul Data:**
```
GET /api/soul-data/clusters           - Get life clusters
GET /api/soul-data/style-profile      - Get style profile
POST /api/soul-data/analyze-style     - Analyze communication style
```

## Database Schema

### Core Tables

**users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**digital_twins**
```sql
CREATE TABLE digital_twins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  soul_signature JSONB,
  privacy_settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**platform_connections**
```sql
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_sync TIMESTAMP,
  UNIQUE(user_id, platform)
);
```

**soul_data**
```sql
CREATE TABLE soul_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  data_type TEXT NOT NULL,
  raw_data JSONB,
  extracted_patterns JSONB,
  privacy_level INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Routing Architecture

### Main Application Routes

**Public Routes:**
- `/` - Landing page showcasing Soul Signature platform
- `/contact` - Contact form

**Protected Routes (Require Authentication):**
- `/soul-dashboard` - Main soul signature dashboard
- `/privacy-controls` - Privacy spectrum interface
- `/connect-platforms` - Platform connection wizard
- `/twin-builder` - Digital twin creation interface
- `/talk-to-twin` - Interact with your digital twin
- `/chat/:twinId` - Individual twin chat interface

### Route Protection Pattern
```tsx
<Route path="/soul-dashboard" element={
  <ProtectedRoute>
    <SoulSignatureDashboard />
  </ProtectedRoute>
} />
```

## Platform Integration Guide

### OAuth Flow Implementation

**Step 1: Platform Configuration**
```javascript
// api/services/platformAPIMappings.js
const PLATFORM_CONFIGS = {
  spotify: {
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: ['user-read-recently-played', 'user-top-read']
  }
};
```

**Step 2: Initiate OAuth**
```javascript
// Frontend
const connectPlatform = async (platform) => {
  const response = await fetch(`/api/platforms/connect/${platform}`);
  const { authUrl } = await response.json();
  window.location.href = authUrl;
};
```

**Step 3: Handle Callback**
```javascript
// Backend - api/routes/entertainment-connectors.js
router.get('/callback/:platform', async (req, res) => {
  const { code } = req.query;
  const tokens = await exchangeCodeForTokens(code);
  await savePlatformConnection(userId, platform, tokens);
  res.redirect('/soul-dashboard');
});
```

## Development Workflows

### Adding New Platform Connector

1. **Define platform configuration** in `api/services/platformAPIMappings.js`
2. **Add OAuth routes** in `api/routes/entertainment-connectors.js`
3. **Implement data extraction** in `api/services/dataExtraction.js`
4. **Update UI** in `src/components/PlatformConnector.tsx`
5. **Test OAuth flow** and data extraction

### Adding New Life Cluster

1. **Define cluster schema** in `src/types/data-integration.ts`
2. **Update extraction logic** in `api/routes/soul-extraction.js`
3. **Add privacy controls** in `src/components/PrivacySpectrumDashboard.tsx`
4. **Visualize in dashboard** in `src/pages/SoulSignatureDashboard.tsx`

## Visual Development Workflow

### Design Principles & Style Guide
- **Comprehensive design checklist**: `/context/design-principles.md` - World-class UI/UX standards inspired by Stripe, Airbnb, and Linear
- **Component patterns & tokens**: `/context/style-guide.md` - Ready-to-use code patterns with Anthropic-inspired design system
- **When making visual (front-end, UI/UX) changes**, always refer to these files for guidance on:
  - Color tokens and HSL custom properties
  - Typography scale and font families
  - Spacing system and border radii
  - Component design standards
  - Accessibility requirements (WCAG AA+)
  - Animation patterns and micro-interactions

### Quick Visual Verification Workflow

IMMEDIATELY after implementing any front-end change, follow this verification process:

1. **Identify What Changed** - Review the modified components/pages
2. **Start Local Dev Server** - Ensure `npm run dev` is running on `http://localhost:8086`
3. **Navigate to Affected Pages** - Use `mcp__playwright__browser_navigate` to visit each changed view
4. **Verify Design Compliance** - Compare against `/context/design-principles.md` and `/context/style-guide.md`:
   - Color tokens match design system
   - Typography follows established scale
   - Spacing uses 8px base unit system
   - Interactive states (hover, focus, active) are properly styled
   - Accessibility features present (focus rings, ARIA labels, semantic HTML)
5. **Validate Feature Implementation** - Ensure the change fulfills the user's specific request
6. **Check Acceptance Criteria** - Review any provided context files or requirements
7. **Capture Evidence** - Take full page screenshot at desktop viewport (1440px) of each changed view
8. **Check for Errors** - Run `mcp__playwright__browser_console_messages` to catch JavaScript errors

**Example Workflow:**
```typescript
// After implementing new Soul Signature Dashboard card
await mcp__playwright__browser_navigate('http://localhost:8086/soul-signature');
await mcp__playwright__browser_resize({ width: 1440, height: 900 });
await mcp__playwright__browser_take_screenshot({ filename: 'soul-signature-dashboard.png' });
const consoleMessages = await mcp__playwright__browser_console_messages({ onlyErrors: true });
```

This verification ensures changes meet design standards and user requirements BEFORE requesting comprehensive review.

### Comprehensive Design Review

Invoke the `@agent-design-review` subagent for thorough design validation when:
- Completing significant UI/UX features
- Before finalizing PRs with visual changes
- Needing comprehensive accessibility and responsiveness testing
- Implementing new components or page layouts
- Making changes to the design system itself

**Slash Command Alternative:**
Use `/design-review` for on-demand design reviews of pending git changes

**What the Design Review Agent Does:**
1. **Interaction Testing**: Tests user flows, interactive states (hover, active, disabled), confirmations
2. **Responsiveness**: Verifies 1440px (desktop), 768px (tablet), 375px (mobile) viewports
3. **Visual Polish**: Checks alignment, spacing, typography, color consistency
4. **Accessibility**: Tests keyboard navigation, focus states, WCAG 2.1 AA compliance
5. **Robustness**: Tests edge cases, error states, loading states, content overflow
6. **Code Health**: Verifies component reuse, design token usage, pattern adherence
7. **Console & Content**: Checks for errors, grammar, clarity

**Review Output Format:**
```markdown
### Design Review Summary
[Positive opening and overall assessment]

### Findings

#### Blockers
- [Critical failures requiring immediate fix + screenshot]

#### High-Priority
- [Significant issues to fix before merge + screenshot]

#### Medium-Priority / Suggestions
- [Improvements for follow-up]

#### Nitpicks
- Nit: [Minor aesthetic details]
```

### Development Server URL

**IMPORTANT**: All Playwright MCP browser navigation must use the correct local development URL:
```
http://localhost:8086
```

This is the Vite dev server running the React frontend. Do NOT use http://localhost:3001 (that's the Express API server).

### Design System Quick Reference

**Primary Colors:**
- Background: `bg-[hsl(var(--claude-bg))]` (#FAF9F5 - warm ivory)
- Surface: `bg-[hsl(var(--claude-surface))]` (#FFFFFF - white cards)
- Accent: `bg-[hsl(var(--claude-accent))]` (#D97706 - orange)
- Text: `text-[hsl(var(--claude-text))]` (#141413 - deep slate)

**Typography:**
- Heading: `font-heading` (Space Grotesk)
- Body: `font-body` (Source Serif 4)
- UI: `font-ui` (DM Sans)

**Common Patterns:**
- Primary CTA: Orange accent button with icon
- Card: White surface with subtle border
- Status Badge: Colored with icon (connected, extracting, error)
- Empty State: Centered with icon, heading, description, CTA

## Code Review Workflow

### Pragmatic Quality Framework

The Soul Signature platform follows Anthropic's "Pragmatic Quality" code review methodology:
- **Net Positive > Perfection**: Changes should definitively improve code health, even if not perfect
- **Focus on Substance**: Emphasize architecture, security, and business logic over style
- **Grounded in Principles**: Feedback based on SOLID, DRY, KISS, YAGNI principles
- **Development Velocity**: Balance rigorous standards with shipping speed

### When to Request Code Review

**Automatic Reviews (via `/code-review`):**
- After implementing a new feature or significant refactor
- Before merging a pull request
- After security-critical changes (OAuth, API keys, data handling)
- When touching core platform systems (soul extraction, privacy controls, AI integration)

**Examples:**
- "I've added a new platform connector for Discord"
- "Refactored the soul extraction pipeline for better performance"
- "Updated privacy intensity sliders with new validation"
- "Integrated Claude API for personality analysis"

### Code Review Agent

Invoke the `@agent-code-review` subagent for comprehensive reviews that analyze:

1. **Architectural Design** (Critical)
   - Modularity and Single Responsibility Principle
   - Separation of concerns (frontend/backend/AI services)
   - Platform connector isolation and reusability
   - Soul extraction pipeline patterns

2. **Functionality & Correctness** (Critical)
   - Business logic implementation
   - Edge case handling (missing data, API failures, rate limits)
   - OAuth flows (token expiration, revocation, network errors)
   - Privacy controls (0-100% validation, concurrent updates)

3. **Security** (Non-Negotiable)
   - **OAuth Security**: State validation, secure token storage, refresh handling
   - **API Keys**: Environment variables only, never hardcoded
   - **User Data Privacy**: RLS policies, proper access controls
   - **Input Validation**: All user inputs sanitized (XSS, SQLi prevention)
   - **Supabase Security**: Proper RLS, restricted service role usage

4. **Maintainability & Readability** (High Priority)
   - Descriptive naming (`soulDataService`, `extractionPipeline`)
   - TypeScript interfaces (`SoulSignature`, `LifeCluster`, `PrivacySettings`)
   - Comments explaining "why" (privacy decisions, AI model choices, platform quirks)

5. **Testing Strategy** (High Priority)
   - OAuth flows: Token refresh, expiration, revocation scenarios
   - Soul extraction: Partial data, API failures, rate limiting
   - Privacy controls: Boundary values (0%, 100%), concurrent updates
   - RAG chat: No context, large context, API failures

6. **Performance & Scalability** (Important)
   - Database query efficiency, N+1 problems
   - React Query caching, lazy loading
   - Platform data extraction: Batch processing, rate limit handling
   - Personality analysis: Claude API batching, result caching

7. **Dependencies & Documentation** (Important)
   - New platform integrations: OAuth scopes, API limits, data structure
   - AI service changes: Model versions, prompt templates, fallback behavior
   - Database migrations: Rollback scripts, schema documentation

### Slash Command Usage

Use `/code-review` for on-demand reviews of pending git changes:

```bash
# Review all uncommitted changes
/code-review

# Or be specific
/code-review Please review the last 3 commits
```

### Review Output Format

```markdown
### Code Review Summary
[Overall assessment: ready to merge?]
[Positive highlights]

---

### Findings

#### Critical Issues / Blockers
- **[File:Line]** [Issue]
  - **Problem**: [What's wrong and why critical]
  - **Impact**: [Effect on users/security/system]
  - **Recommendation**: [Specific action]

#### High-Priority Issues
- **[File:Line]** [Issue]
  - **Problem**: [What could be improved]
  - **Recommendation**: [Specific suggestion]

#### Suggested Improvements
- **[File:Line]** [Enhancement]
  - **Benefit**: [How this improves quality]

#### Nitpicks
- **Nit**: [File:Line]: [Minor detail]

---

### Positive Highlights
- [Exceptional work]

---

### Testing Recommendations
- [Specific test scenarios]

---

### Next Steps
1. [Priority actions]
```

### Soul Signature Security Checklist

**Before Merging ANY Code:**
- [ ] No hardcoded API keys or secrets (grep for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- [ ] OAuth state validation present for all platform connectors
- [ ] User input validated on all endpoints (soul data, chat messages, privacy settings)
- [ ] Supabase RLS policies tested for new tables/columns
- [ ] Error messages don't expose sensitive data (tokens, user IDs, internal paths)
- [ ] Platform API rate limits handled gracefully
- [ ] TypeScript types defined for all new interfaces
- [ ] Privacy controls properly validated (0-100% range, database persistence)

### Dual-Loop Architecture

**Inner Loop** (Development):
- Use `@agent-code-review` or `/code-review` during development
- Quick feedback on architecture, security, functionality
- Iterate rapidly with AI-assisted reviews

**Outer Loop** (CI/CD):
- GitHub Actions with automated code review (future enhancement)
- Runs on every PR before human review
- Ensures consistent quality standards

## Code Standards

### TypeScript Interfaces
```typescript
interface SoulSignature {
  id: string;
  userId: string;
  personalClusters: LifeCluster[];
  professionalClusters: LifeCluster[];
  creativeClusters: LifeCluster[];
  privacySettings: PrivacySettings;
}

interface LifeCluster {
  name: string;
  category: 'personal' | 'professional' | 'creative';
  intensityLevel: number; // 0-100
  dataPoints: DataPoint[];
  revealLevel: number; // 0-100
}

interface PrivacySettings {
  globalLevel: number;
  clusterOverrides: Record<string, number>;
  audienceSettings: Record<string, ClusterSettings>;
}
```

## Performance Optimizations

### Frontend
1. **Code Splitting**: Route-based with React.lazy
2. **API Caching**: TanStack Query for intelligent caching
3. **Bundle Optimization**: Regular bundle size monitoring
4. **Image Optimization**: WebP with fallbacks

### Backend
1. **Database Indexing**: Proper indexes on user_id, platform, data_type
2. **Rate Limiting**: Per-platform rate limiting for API calls
3. **Data Caching**: Redis for frequently accessed soul signatures
4. **Connection Pooling**: Efficient database connections

## Security & Privacy

### Data Protection
- **End-to-end encryption** for sensitive platform data
- **JWT authentication** with short-lived tokens
- **Row Level Security (RLS)** on all database tables
- **GDPR compliance** with full data export and deletion

### Privacy Controls
- **Granular permissions** per data cluster
- **Audit logging** for all data access
- **Contextual sharing** with audience-specific settings
- **Complete transparency** on collected data

## Future Roadmap

### Planned Features
1. **Advanced Soul Matching**: Find people with complementary soul signatures
2. **Life Journey Tracking**: Visualize how interests evolve over time
3. **Browser Extension**: Capture data from platforms without APIs
4. **AI-Powered Insights**: Discover patterns you didn't know about yourself
5. **Mobile Application**: Native iOS/Android experience

### Technical Improvements
1. **Real-time Sync**: WebSocket integration for live platform updates
2. **ML Model Training**: Custom models for personality extraction
3. **Microservices**: Split into focused services (connectors, extraction, twin engine)
4. **Advanced Analytics**: Usage metrics and engagement tracking

## Troubleshooting Guide

### Common Issues

**Platform OAuth Not Working:**
- Verify CLIENT_ID and CLIENT_SECRET in .env
- Check redirect URI matches platform configuration
- Ensure callback URL is whitelisted

**Soul Extraction Failing:**
- Check platform API rate limits
- Verify access tokens are valid and not expired
- Review extraction logs in `api/services/dataExtraction.js`

**Privacy Controls Not Saving:**
- Verify user authentication
- Check database RLS policies
- Review network requests in DevTools

## Contact & Support

**Key Principles:**
- **Privacy First**: User control over all data
- **Authenticity Over Performance**: Real soul signature, not manufactured persona
- **Transparency**: Complete visibility into collected data
- **Contextual Sharing**: Different aspects for different audiences

This platform revolutionizes digital identity by moving beyond public information to capture the authentic soul signature that makes each person uniquely themselves.
