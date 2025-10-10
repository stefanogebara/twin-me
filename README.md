# Twin Me - Discover Your Soul Signature

> "Perhaps we are searching in the branches for what we only find in the roots." - Rami

Twin Me creates digital twins that capture your true originality - not just your public persona, but your complete soul signature. By connecting your digital life (Netflix, Spotify, Discord, and 30+ platforms), we discover what makes you authentically YOU.

## 🚀 Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development servers
npm run dev         # Frontend: http://localhost:8086
npm run server:dev  # Backend: http://localhost:3001

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
- Connect 30+ platforms (Spotify, Netflix, YouTube, Discord, GitHub, etc.)
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
│   ├── services/        # Business logic
│   └── connectors/      # Platform integrations
└── public/              # Static assets
```

## 🔑 Environment Setup

Create a `.env` file:

```env
# Core
PORT=3001
VITE_APP_URL=http://localhost:8086
VITE_API_URL=http://localhost:3001/api

# Authentication
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-jwt-secret

# AI Services
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-key
```

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
   - Backend API: http://localhost:3001

## 🔐 Security & Privacy

- **Privacy-First Design**: Complete transparency on collected data
- **Granular Controls**: Delete any portion of your data anytime
- **Progressive Disclosure**: Start simple, unlock features as you share more
- **Contextual Sharing**: Different aspects for different audiences
- **Data Portability**: Export your entire profile anytime

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, JWT Authentication
- **AI**: Anthropic Claude, OpenAI GPT
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

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with inspiration from the philosophy that true originality lies not in what we present publicly, but in the authentic patterns of our private choices and genuine curiosities.

---

**Twin Me** - Discover what makes you authentically YOU ✨# Automated Deployment Test

