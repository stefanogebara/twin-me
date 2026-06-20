# Twin Me - Discover Your Soul Signature

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

Twin Me creates digital twins that capture your true originality - not just your public persona, but your complete soul signature. By connecting your digital life (Spotify, Google, YouTube, Discord, GitHub, and more), we discover what makes you authentically YOU.

## 🚀 Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development servers
npm run dev         # Frontend: http://localhost:8086
npm run server:dev  # Backend: http://localhost:3004

# Or run both together
npm run dev:full
```

## 🎯 Core Philosophy

While public information is easily cloned and commoditized, it lacks soul. Twin Me goes deeper by:
- **Mapping your entertainment DNA** through streaming patterns and music moods
- **Understanding your social dynamics** via gaming and community platforms
- **Capturing professional identity** while preserving your personal essence
- **Creating multi-dimensional twins** that reflect your authentic originality

## ✨ Key Features

### Soul Signature Discovery
- Connect 10 platforms (Spotify, Google Calendar, YouTube, Gmail, Discord, LinkedIn, GitHub, Reddit, Twitch, Whoop)
- Automatic pattern extraction from your digital footprints
- Visual soul signature dashboard with life clusters

### Revolutionary Privacy Controls - "What's To Reveal, What's To Share"
- Granular intensity sliders (0-100%) for each aspect of your identity
- Different privacy settings for different audiences
- Life clusters: Personal, Professional, Creative, Social
- Context-aware sharing (professional vs social vs personal)

### Platform Connectors
- ✅ **Has API**: Spotify, YouTube, GitHub, LinkedIn, Reddit, Discord
- ⚠️ **Limited API**: Netflix, Instagram, TikTok
- 🔧 **Browser Extension**: For platforms without APIs

## 🏗️ Architecture

```
twin-me/
├── src/                  # React frontend
│   ├── pages/           # Page components
│   ├── components/      # Reusable UI components
│   └── contexts/        # State management
├── api/                  # Express backend
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic + memory architecture
│   ├── middleware/      # Auth, rate limiting, validation
│   └── config/          # AI model tiers, constants
├── database/             # Supabase migrations
└── public/              # Static assets
```

## 🔑 Environment Setup

Create a `.env` file:

```env
# Core
PORT=3004
VITE_APP_URL=http://localhost:8086
VITE_API_URL=http://localhost:3004/api

# Auth & crypto
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-byte-encryption-key

# Database (Supabase — the only active datastore)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI (all LLM calls route through OpenRouter)
OPENROUTER_API_KEY=your-openrouter-key

# Platform OAuth (see .env.example for the full list)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
YOUTUBE_API_KEY=your-youtube-key
```

`.env.example` is the canonical, complete list — copy it to `.env` and fill in values.

## 📊 The Personal-Professional Spectrum

### Personal Universe
- **Entertainment**: Netflix narratives, Spotify moods, YouTube interests
- **Gaming**: Discord communities, Steam patterns, Twitch engagement
- **Social**: Reddit discussions, Twitter thoughts, Instagram aesthetics

### Professional Universe
- **Communication**: Email patterns, Slack dynamics, Teams collaboration
- **Technical**: GitHub contributions, LinkedIn trajectory, portfolio work
- **Productivity**: Calendar patterns, task management, documentation style

## 🎛️ Life Clusters System

**Personal Clusters**
- Hobbies & Interests
- Sports & Fitness
- Spirituality & Religion
- Entertainment Choices
- Social Connections

**Professional Clusters**
- Studies & Education
- Career & Jobs
- Skills & Expertise
- Achievements & Recognition

**Creative Clusters**
- Artistic Expression
- Content Creation
- Musical Identity

## 🚦 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/stefanogebara/twin-ai-learn
   cd twin-ai-learn
   ```

2. **Install dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Add your API keys and configuration

4. **Run the application**
   ```bash
   npm run dev:full
   ```

5. **Access the platform**
   - Frontend: http://localhost:8086
   - Backend API: http://localhost:3004

## 🔐 Security & Privacy

- **Privacy-First Design**: Complete transparency on collected data
- **Granular Controls**: Delete any portion of your data anytime
- **Progressive Disclosure**: Start simple, unlock features as you share more
- **Contextual Sharing**: Different aspects for different audiences
- **Data Portability**: Export your entire profile anytime

### Security posture

- **Auth**: JWT (HS256) for app sessions; OAuth 2.0 + PKCE for platform connections.
- **Secrets**: server-side env vars only, validated at startup; gitleaks pre-commit + CI gate; anything that ever leaked is rotated, not just removed from the diff.
- **Tokens**: OAuth tokens encrypted at rest (AES-256-GCM); disconnecting a platform revokes the grant at the provider where an endpoint exists.
- **Data isolation**: enforced in the API layer today (every user-scoped query filters by `user_id`); PII tables have RLS enabled with service-role-only policies; a database-level per-user backstop is planned.
- **Hardening**: Helmet CSP + CORS allowlist, rate limiting on auth/OAuth/LLM endpoints, LLM spend ceilings, and prompt-injection fencing of untrusted context.

**Reporting a vulnerability**: email stefanogebara@gmail.com with details and reproduction steps. Please do not open a public issue for security-sensitive reports.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, JWT Authentication
- **AI**: OpenRouter gateway (DeepSeek V3.2 default, Claude Sonnet 4.6 for deep twin chat, Gemini 2.5 Flash for vision)
- **Database**: Supabase (PostgreSQL)
- **Auth**: OAuth 2.0 for platform connections

## 📈 Roadmap

- [ ] Real OAuth implementation for all platforms
- [ ] Browser extension for Netflix/streaming data
- [ ] Soul signature matching algorithm
- [ ] Advanced visualization interface
- [ ] API rate limiting and caching
- [ ] Mobile applications
- [ ] Blockchain-based identity verification

## 🤝 Contributing

This is a proprietary, closed-source project; external contributions are not accepted.

## 📄 License

Proprietary and confidential. Copyright (c) 2026 TwinMe. All rights reserved. This project is not open-source; no license is granted to use, copy, modify, or distribute this software.

## 🙏 Acknowledgments

Built with inspiration from the philosophy that true originality lies not in what we present publicly, but in the authentic patterns of our private choices and genuine curiosities.

---

**Twin Me** - Discover what makes you authentically YOU ✨# Automated Deployment Test

