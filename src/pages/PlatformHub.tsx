import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CollapsibleSidebar } from '@/components/layout/CollapsibleSidebar';
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
import { usePipedream } from '@/contexts/PipedreamContext';
import { PlatformGridSkeleton, DashboardCardSkeleton } from '@/components/ui/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useLoading } from '@/contexts/LoadingContext';
import { NoSearchResultsEmptyState, NoFilteredResultsEmptyState } from '@/components/ui/EmptyStatePresets';

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
  const { openConnect, fetchConnectedAccounts, isLoading: isPipedreamLoading } = usePipedream();
  const { isLoading, setLoading } = useLoading();
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadPlatforms();
    loadStats();
    fetchConnectedAccounts(); // Load Pipedream connected accounts
  }, [user]);

  const loadPlatforms = async () => {
    try {
      setLoading('platformsLoad', true);
      setLoadError(null);

      const response = await fetch('/api/platforms/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load platforms');
      }

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
          color: 'bg-stone-900'
        },
        {
          name: '🎵 Music',
          icon: '🎵',
          platforms: categoryMap.get('music') || [],
          color: 'bg-stone-900'
        },
        {
          name: '📰 News & Reading',
          icon: '📰',
          platforms: [...(categoryMap.get('news') || []), ...(categoryMap.get('books') || [])],
          color: 'bg-stone-900'
        },
        {
          name: '🏃 Health & Fitness',
          icon: '🏃',
          platforms: categoryMap.get('health') || [],
          color: 'bg-stone-900'
        },
        {
          name: '📚 Learning',
          icon: '📚',
          platforms: categoryMap.get('learning') || [],
          color: 'bg-stone-900'
        },
        {
          name: '🍔 Food Delivery',
          icon: '🍔',
          platforms: categoryMap.get('food') || [],
          color: 'bg-stone-900'
        },
        {
          name: '💬 Social & Messaging',
          icon: '💬',
          platforms: [...(categoryMap.get('messaging') || []), ...(categoryMap.get('social') || [])],
          color: 'bg-stone-900'
        },
        {
          name: '💼 Productivity',
          icon: '💼',
          platforms: categoryMap.get('productivity') || [],
          color: 'bg-stone-900'
        },
        {
          name: '🎮 Gaming',
          icon: '🎮',
          platforms: categoryMap.get('gaming') || [],
          color: 'bg-stone-900'
        }
      ];

      setCategories(categoriesData.filter(cat => cat.platforms.length > 0));
    } catch (error) {
      console.error('Error loading platforms:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load platforms');
    } finally {
      setLoading('platformsLoad', false);
    }
  };

  const loadStats = async () => {
    try {
      setLoading('statsLoad', true);

      const response = await fetch('/api/platforms/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load stats');
      }

      const data = await response.json();
      setStats(data.stats || stats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading('statsLoad', false);
    }
  };

  const handleConnectPlatform = async (platformId: string, integrationType: string) => {
    if (integrationType === 'browser_extension') {
      // Show browser extension install modal
      alert('Browser extension required. Install the Soul Signature Extension to connect this platform.');
      return;
    }

    // For OAuth platforms, use Pipedream Connect modal
    if (integrationType === 'oauth') {
      try {
        setLoading(`connect-${platformId}`, true);
        // Open Pipedream Connect modal with platform pre-selected
        await openConnect(platformId);
      } catch (error) {
        console.error('Error connecting platform via Pipedream:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to connect platform');
      } finally {
        setLoading(`connect-${platformId}`, false);
      }
      return;
    }

    // Fallback to direct API connection for MCP platforms
    try {
      setLoading(`connect-${platformId}`, true);

      const response = await fetch(`/api/platforms/connect/${platformId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to connect platform');
      }

      const data = await response.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting platform:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to connect platform');
    } finally {
      setLoading(`connect-${platformId}`, false);
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
        return <Badge className="bg-stone-900 text-white">⚡ MCP</Badge>;
      case 'oauth':
        return <Badge className="bg-stone-900 text-white">🔐 OAuth</Badge>;
      case 'browser_extension':
        return <Badge className="bg-stone-900 text-white">🔌 Extension</Badge>;
      default:
        return null;
    }
  };

  // Loading state
  if (isLoading('platformsLoad') || isLoading('statsLoad')) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-2">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-5 w-96" />
              </div>
              <Skeleton className="h-10 w-40 rounded-lg" />
            </div>

            {/* Stats Skeleton */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <DashboardCardSkeleton key={i} />
              ))}
            </div>
          </div>

          {/* Platform Grid Skeleton */}
          <PlatformGridSkeleton count={9} />
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA]">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl text-stone-900 mb-4">Failed to Load Platforms</h2>
          <p className="text-stone-600 mb-6">{loadError}</p>
          <Button onClick={() => { loadPlatforms(); loadStats(); }} className="bg-black text-white">
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <>
      <CollapsibleSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen bg-[#FAFAFA] p-8 lg:pl-80">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-stone-900 mb-2">
              Platform Hub
            </h1>
            <p className="text-stone-600">
              Connect your digital life to discover your authentic soul signature
            </p>
          </div>

          <Button className="bg-stone-900 hover:bg-stone-800 text-white">
            <Download className="w-4 h-4 mr-2" />
            Install Extension
          </Button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-stone-900">{stats.connected}</div>
                <div className="text-sm text-stone-600 mt-1">
                  Connected
                </div>
              </div>
              <CheckCircle2 className="w-10 h-10 text-stone-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-stone-900">
                  {stats.available}
                </div>
                <div className="text-sm text-stone-600 mt-1">
                  Available
                </div>
              </div>
              <LinkIcon className="w-10 h-10 text-stone-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-stone-900">
                  {stats.dataPoints.toLocaleString()}
                </div>
                <div className="text-sm text-stone-600 mt-1">
                  Data Points
                </div>
              </div>
              <TrendingUp className="w-10 h-10 text-stone-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-stone-900">
                  {stats.soulComplete}%
                </div>
                <div className="text-sm text-stone-600 mt-1">
                  Soul Complete
                </div>
              </div>
              <Sparkles className="w-10 h-10 text-stone-600 opacity-20" />
            </div>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
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
        {filteredCategories.length === 0 ? (
          searchQuery ? (
            <NoSearchResultsEmptyState
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          ) : (
            <NoFilteredResultsEmptyState
              filterName={categoryFilter !== 'all' ? categoryFilter : undefined}
              onClearFilters={() => setCategoryFilter('all')}
            />
          )
        ) : (
          filteredCategories.map((category, idx) => (
            <motion.div
              key={category.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 rounded-xl ${category.color}
                              flex items-center justify-center text-2xl`}>
                  {category.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">
                    {category.name}
                  </h2>
                  <p className="text-sm text-stone-600">
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
                    isConnecting={isLoading(`connect-${platform.id}`)}
                  />
                ))}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Browser Extension CTA */}
      <div className="max-w-7xl mx-auto mt-12">
        <Card className="bg-white/50 backdrop-blur-[16px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)] p-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-stone-900 mb-2">
                Unlock 16 More Platforms
              </h3>
              <p className="text-stone-600 mb-4">
                Install the Soul Signature Browser Extension to connect Netflix, Disney+, HBO Max,
                Instagram, and more platforms without public APIs.
              </p>
              <div className="flex gap-2">
                <Badge className="bg-black/[0.04] text-stone-900 border-none">Chrome</Badge>
                <Badge className="bg-black/[0.04] text-stone-900 border-none">Firefox</Badge>
                <Badge className="bg-black/[0.04] text-stone-900 border-none">Safari</Badge>
              </div>
            </div>
            <Button className="bg-stone-900 hover:bg-stone-800 text-white">
              <Download className="w-5 h-5 mr-2" />
              Install Now
            </Button>
          </div>
        </Card>
      </div>
    </div>
    </>
  );
};

// Platform Card Component
interface PlatformCardProps {
  platform: Platform;
  onConnect: (platformId: string, integrationType: string) => void;
  delay: number;
  isConnecting?: boolean;
}

const PlatformCard: React.FC<PlatformCardProps> = ({ platform, onConnect, delay, isConnecting = false }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
    >
      <Card className={`p-6 border transition-all duration-200 bg-white/50 backdrop-blur-[16px]
                     ${platform.connected
                       ? 'border-stone-900 shadow-[0_4px_16px_rgba(0,0,0,0.08)]'
                       : 'border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:border-black/[0.12]'
                     }`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{platform.icon}</div>
            <div>
              <h3 className="font-semibold text-stone-900">
                {platform.name}
              </h3>
              {platform.connected && platform.dataCount && (
                <p className="text-xs text-stone-600">
                  {platform.dataCount.toLocaleString()} items
                </p>
              )}
            </div>
          </div>

          {platform.connected ? (
            <CheckCircle2 className="w-6 h-6 text-stone-900" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300" />
          )}
        </div>

        <p className="text-sm text-stone-600 mb-4 line-clamp-2">
          {platform.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {getIntegrationBadge(platform.integrationType)}
          {platform.dataTypes.slice(0, 2).map(type => (
            <Badge key={type} variant="outline" className="text-xs border-black/[0.06] text-stone-600">
              {type.replace('_', ' ')}
            </Badge>
          ))}
          {platform.dataTypes.length > 2 && (
            <Badge variant="outline" className="text-xs border-black/[0.06] text-stone-600">
              +{platform.dataTypes.length - 2} more
            </Badge>
          )}
        </div>

        {/* Soul Insights Preview */}
        {platform.soulInsights && platform.soulInsights.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3 h-3 text-stone-600" />
              <span className="text-xs font-medium text-stone-900">Soul Insights:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {platform.soulInsights.slice(0, 2).map(insight => (
                <span key={insight} className="text-xs text-stone-600 bg-black/[0.04] px-2 py-1 rounded">
                  {insight.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {platform.connected ? (
          <Button variant="outline" className="w-full border-stone-900 text-stone-900" disabled>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Connected
          </Button>
        ) : isConnecting ? (
          <Button variant="outline" className="w-full border-stone-600 text-stone-600" disabled>
            <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-stone-600 border-t-transparent"></div>
            Connecting...
          </Button>
        ) : (
          <Button
            onClick={() => onConnect(platform.id, platform.integrationType)}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white"
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
      return <Badge className="bg-stone-900 text-white text-xs">⚡ MCP</Badge>;
    case 'oauth':
      return <Badge className="bg-stone-900 text-white text-xs">🔐 OAuth</Badge>;
    case 'browser_extension':
      return <Badge className="bg-stone-900 text-white text-xs">🔌 Extension</Badge>;
    default:
      return null;
  }
}

export default PlatformHub;
