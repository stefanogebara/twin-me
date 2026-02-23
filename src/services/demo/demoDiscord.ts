/**
 * Demo Discord Data
 * Discord community memberships and interest signals for demo mode
 */

export interface DemoDiscordServer {
  name: string;
  category: 'tech/dev' | 'gaming' | 'creative' | 'learning' | 'community';
  memberCount?: number;
}

export interface DemoDiscordData {
  servers: DemoDiscordServer[];
  totalServers: number;
  categoryBreakdown: { category: string; count: number; percentage: number }[];
  topCategories: string[];
}

export interface DemoDiscordInsights {
  success: boolean;
  reflection: {
    id: string;
    text: string;
    generatedAt: string;
    expiresAt: string | null;
    confidence: 'high' | 'medium' | 'low';
    themes: string[];
  };
  patterns: { id: string; text: string; occurrences: 'often' | 'sometimes' | 'noticed' }[];
  history: { id: string; text: string; generatedAt: string }[];
  evidence: { id: string; observation: string; dataPoints: string[]; confidence: 'high' | 'medium' | 'low' }[];
  discordServers: DemoDiscordServer[];
  discordTotalServers: number;
  discordCategoryBreakdown: { category: string; count: number; percentage: number }[];
}

const DEMO_SERVERS: DemoDiscordServer[] = [
  { name: 'TypeScript Community', category: 'tech/dev', memberCount: 42000 },
  { name: 'Indie Hackers', category: 'tech/dev', memberCount: 18000 },
  { name: 'Product Hunt', category: 'tech/dev', memberCount: 31000 },
  { name: 'AI & ML Research', category: 'tech/dev', memberCount: 22000 },
  { name: 'Lo-fi Beats & Chill', category: 'creative', memberCount: 65000 },
  { name: 'Motion Design Lab', category: 'creative', memberCount: 8400 },
  { name: 'Productivity Systems', category: 'learning', memberCount: 14000 },
  { name: 'Deep Work Club', category: 'community', memberCount: 5200 },
];

function buildCategoryBreakdown(servers: DemoDiscordServer[]) {
  const counts: Record<string, number> = {};
  for (const s of servers) {
    counts[s.category] = (counts[s.category] || 0) + 1;
  }
  const total = servers.length;
  return Object.entries(counts)
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export function getDemoDiscordData(): DemoDiscordData {
  const breakdown = buildCategoryBreakdown(DEMO_SERVERS);
  return {
    servers: DEMO_SERVERS,
    totalServers: DEMO_SERVERS.length,
    categoryBreakdown: breakdown,
    topCategories: breakdown.slice(0, 2).map(c => c.category),
  };
}

export function getDemoDiscordInsights(): DemoDiscordInsights {
  const data = getDemoDiscordData();
  return {
    success: true,
    reflection: {
      id: 'demo-discord-reflection-1',
      text:
        'Your Discord presence tells a story of intentional community. You gravitate toward places where builders and makers gather — tech communities dominate your server list, but you balance that intensity with creative and calm spaces like lo-fi music servers. This pattern suggests someone who stays sharp through peer connection while actively guarding their mental bandwidth.',
      generatedAt: new Date().toISOString(),
      expiresAt: null,
      confidence: 'high',
      themes: ['community', 'identity', 'focus'],
    },
    patterns: [
      {
        id: 'discord-pattern-1',
        text: 'Your server list skews heavily toward tech and builder communities — you learn in public and value peers who are also building things.',
        occurrences: 'often',
      },
      {
        id: 'discord-pattern-2',
        text: 'The presence of lo-fi and creative servers alongside productivity ones suggests you consciously use community to shift between high-focus and recovery modes.',
        occurrences: 'sometimes',
      },
      {
        id: 'discord-pattern-3',
        text: 'You tend to join communities with a clear purpose or niche rather than generic social spaces — quality of connection over volume.',
        occurrences: 'noticed',
      },
    ],
    history: [
      {
        id: 'discord-history-1',
        text: 'Your community footprint shows a consistent interest in the intersection of technology and creativity — not purely one or the other.',
        generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    evidence: [
      {
        id: 'discord-evidence-1',
        observation: `${data.topCategories[0]} communities make up the majority of your Discord presence`,
        dataPoints: [
          `${data.categoryBreakdown[0]?.count} of ${data.totalServers} servers`,
          `Servers: ${DEMO_SERVERS.filter(s => s.category === data.topCategories[0]).map(s => s.name).join(', ')}`,
        ],
        confidence: 'high',
      },
    ],
    discordServers: data.servers,
    discordTotalServers: data.totalServers,
    discordCategoryBreakdown: data.categoryBreakdown,
  };
}
