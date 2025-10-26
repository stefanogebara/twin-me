import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Circle,
  Sparkles,
  TrendingUp,
  Link as LinkIcon,
  AlertCircle,
  Download,
  Zap,
  Filter,
  Search
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Platform {
  id: string;
  name: string;
  category: string;
  icon: string;
  integrationType: 'mcp' | 'oauth' | 'browser_extension';
  dataTypes: string[];
  description: string;
  soulInsights: string[];
  connected: boolean;
  dataCount?: number;
}

interface PlatformCategory {
  name: string;
  icon: string;
  platforms: Platform[];
  color: string;
}

const PlatformHub: React.FC = () => {
  const { user } = useAuth();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [categories, setCategories] = useState<PlatformCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    connected: 0,
    available: 56,
    dataPoints: 0,
    soulComplete: 0
  });

  useEffect(() => {
    loadPlatforms();
    loadStats();
  }, [user]);

  const loadPlatforms = async () => {
    try {
      const response = await fetch('/api/platforms/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      setPlatforms(data.platforms || []);

      // Organize platforms by category
      const categoryMap = new Map<string, Platform[]>();

      data.platforms?.forEach((platform: Platform) => {
        if (!categoryMap.has(platform.category)) {
          categoryMap.set(platform.category, []);
        }
        categoryMap.get(platform.category)!.push(platform);
      });

      const categoriesData: PlatformCategory[] = [
        {
          name: '🎬 Streaming',
          icon: '🎬',
          platforms: categoryMap.get('streaming') || [],
          color: 'from-purple-500 to-pink-500'
        },
        {
          name: '🎵 Music',
          icon: '🎵',
          platforms: categoryMap.get('music') || [],
          color: 'from-green-500 to-emerald-500'
        },
        {
          name: '📰 News & Reading',
          icon: '📰',
          platforms: [...(categoryMap.get('news') || []), ...(categoryMap.get('books') || [])],
          color: 'from-blue-500 to-cyan-500'
        },
        {
          name: '🏃 Health & Fitness',
          icon: '🏃',
          platforms: categoryMap.get('health') || [],
          color: 'from-orange-500 to-red-500'
        },
        {
          name: '📚 Learning',
          icon: '📚',
          platforms: categoryMap.get('learning') || [],
          color: 'from-indigo-500 to-purple-500'
        },
        {
          name: '🍔 Food Delivery',
          icon: '🍔',
          platforms: categoryMap.get('food') || [],
          color: 'from-yellow-500 to-orange-500'
        },
        {
          name: '💬 Social & Messaging',
          icon: '💬',
          platforms: [...(categoryMap.get('messaging') || []), ...(categoryMap.get('social') || [])],
          color: 'from-pink-500 to-rose-500'
        },
        {
          name: '💼 Productivity',
          icon: '💼',
          platforms: categoryMap.get('productivity') || [],
          color: 'from-slate-500 to-gray-500'
        },
        {
          name: '🎮 Gaming',
          icon: '🎮',
          platforms: categoryMap.get('gaming') || [],
          color: 'from-violet-500 to-purple-500'
        }
      ];

      setCategories(categoriesData.filter(cat => cat.platforms.length > 0));
    } catch (error) {
      console.error('Error loading platforms:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/platforms/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setStats(data.stats || stats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleConnectPlatform = async (platformId: string, integrationType: string) => {
    if (integrationType === 'browser_extension') {
      // Show browser extension install modal
      alert('Browser extension required. Install the Soul Signature Extension to connect this platform.');
      return;
    }

    try {
      const response = await fetch(`/api/platforms/connect/${platformId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting platform:', error);
    }
  };

  const filteredCategories = categories
    .map(category => ({
      ...category,
      platforms: category.platforms.filter(platform =>
        (selectedCategory === 'all' || category.name.toLowerCase().includes(selectedCategory)) &&
        (searchQuery === '' ||
          platform.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          platform.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    }))
    .filter(category => category.platforms.length > 0);

  const getIntegrationBadge = (type: string) => {
    switch (type) {
      case 'mcp':
        return <Badge className="bg-green-500 text-white">⚡ MCP</Badge>;
      case 'oauth':
        return <Badge className="bg-blue-500 text-white">🔐 OAuth</Badge>;
      case 'browser_extension':
        return <Badge className="bg-purple-500 text-white">🔌 Extension</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--claude-bg))] to-gray-50 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-[hsl(var(--claude-text))] mb-2">
              Platform Hub
            </h1>
            <p className="text-[hsl(var(--claude-text-secondary))]">
              Connect your digital life to discover your authentic soul signature
            </p>
          </div>

          <Button className="bg-[hsl(var(--claude-accent))]">
            <Download className="w-4 h-4 mr-2" />
            Install Extension
          </Button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-card border-[hsl(var(--claude-border))]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-green-500">{stats.connected}</div>
                <div className="text-sm text-[hsl(var(--claude-text-secondary))] mt-1">
                  Connected
                </div>
              </div>
              <CheckCircle2 className="w-10 h-10 text-green-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-[hsl(var(--claude-border))]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-[hsl(var(--claude-accent))]">
                  {stats.available}
                </div>
                <div className="text-sm text-[hsl(var(--claude-text-secondary))] mt-1">
                  Available
                </div>
              </div>
              <LinkIcon className="w-10 h-10 text-[hsl(var(--claude-accent))] opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-[hsl(var(--claude-border))]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-blue-500">
                  {stats.dataPoints.toLocaleString()}
                </div>
                <div className="text-sm text-[hsl(var(--claude-text-secondary))] mt-1">
                  Data Points
                </div>
              </div>
              <TrendingUp className="w-10 h-10 text-blue-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-[hsl(var(--claude-border))]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-purple-500">
                  {stats.soulComplete}%
                </div>
                <div className="text-sm text-[hsl(var(--claude-text-secondary))] mt-1">
                  Soul Complete
                </div>
              </div>
              <Sparkles className="w-10 h-10 text-purple-500 opacity-20" />
            </div>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search platforms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-[hsl(var(--claude-border))] rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-3 border border-[hsl(var(--claude-border))] rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]"
          >
            <option value="all">All Categories</option>
            <option value="streaming">Streaming</option>
            <option value="music">Music</option>
            <option value="news">News & Reading</option>
            <option value="health">Health & Fitness</option>
            <option value="learning">Learning</option>
            <option value="food">Food Delivery</option>
            <option value="social">Social & Messaging</option>
            <option value="productivity">Productivity</option>
            <option value="gaming">Gaming</option>
          </select>
        </div>
      </div>

      {/* Platform Categories */}
      <div className="max-w-7xl mx-auto space-y-12">
        {filteredCategories.map((category, idx) => (
          <motion.div
            key={category.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${category.color}
                            flex items-center justify-center text-2xl`}>
                {category.icon}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[hsl(var(--claude-text))]">
                  {category.name}
                </h2>
                <p className="text-sm text-[hsl(var(--claude-text-secondary))]">
                  {category.platforms.length} platforms available
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {category.platforms.map((platform, platformIdx) => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  onConnect={handleConnectPlatform}
                  delay={platformIdx * 0.05}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Browser Extension CTA */}
      <div className="max-w-7xl mx-auto mt-12">
        <Card className="bg-gradient-to-r from-[hsl(var(--claude-accent))] to-purple-600 p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold mb-2">
                Unlock 16 More Platforms
              </h3>
              <p className="text-white/90 mb-4">
                Install the Soul Signature Browser Extension to connect Netflix, Disney+, HBO Max,
                Instagram, and more platforms without public APIs.
              </p>
              <div className="flex gap-2">
                <Badge className="bg-card/20 text-white">Chrome</Badge>
                <Badge className="bg-card/20 text-white">Firefox</Badge>
                <Badge className="bg-card/20 text-white">Safari</Badge>
              </div>
            </div>
            <Button className="bg-card text-[hsl(var(--claude-accent))] hover:bg-muted">
              <Download className="w-5 h-5 mr-2" />
              Install Now
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Platform Card Component
interface PlatformCardProps {
  platform: Platform;
  onConnect: (platformId: string, integrationType: string) => void;
  delay: number;
}

const PlatformCard: React.FC<PlatformCardProps> = ({ platform, onConnect, delay }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
    >
      <Card className={`p-6 border-2 transition-all duration-200 hover:shadow-xl
                     ${platform.connected
                       ? 'border-green-500 bg-green-50'
                       : 'border-[hsl(var(--claude-border))] hover:border-[hsl(var(--claude-accent))]'
                     }`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{platform.icon}</div>
            <div>
              <h3 className="font-semibold text-[hsl(var(--claude-text))]">
                {platform.name}
              </h3>
              {platform.connected && platform.dataCount && (
                <p className="text-xs text-green-600">
                  {platform.dataCount.toLocaleString()} items
                </p>
              )}
            </div>
          </div>

          {platform.connected ? (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300" />
          )}
        </div>

        <p className="text-sm text-[hsl(var(--claude-text-secondary))] mb-4 line-clamp-2">
          {platform.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {getIntegrationBadge(platform.integrationType)}
          {platform.dataTypes.slice(0, 2).map(type => (
            <Badge key={type} variant="outline" className="text-xs">
              {type.replace('_', ' ')}
            </Badge>
          ))}
          {platform.dataTypes.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{platform.dataTypes.length - 2} more
            </Badge>
          )}
        </div>

        {/* Soul Insights Preview */}
        {platform.soulInsights && platform.soulInsights.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-xs font-medium text-purple-600">Soul Insights:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {platform.soulInsights.slice(0, 2).map(insight => (
                <span key={insight} className="text-xs text-muted-foreground bg-purple-50 px-2 py-1 rounded">
                  {insight.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {platform.connected ? (
          <Button variant="outline" className="w-full" disabled>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Connected
          </Button>
        ) : (
          <Button
            onClick={() => onConnect(platform.id, platform.integrationType)}
            className="w-full bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90"
          >
            {platform.integrationType === 'browser_extension' ? (
              <>
                <Download className="w-4 h-4 mr-2" />
                Needs Extension
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Connect
              </>
            )}
          </Button>
        )}
      </Card>
    </motion.div>
  );
};

function getIntegrationBadge(type: string) {
  switch (type) {
    case 'mcp':
      return <Badge className="bg-green-500 text-white text-xs">⚡ MCP</Badge>;
    case 'oauth':
      return <Badge className="bg-blue-500 text-white text-xs">🔐 OAuth</Badge>;
    case 'browser_extension':
      return <Badge className="bg-purple-500 text-white text-xs">🔌 Extension</Badge>;
    default:
      return null;
  }
}

export default PlatformHub;
