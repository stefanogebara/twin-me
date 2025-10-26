import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  Brain,
  Database,
  Zap,
  Eye,
  Calendar,
  MessageSquare,
  BarChart3,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import { PersonalityInsight, DataConnector, PersonalityTrend, TwinEvolutionEntry } from '@/types/data-integration';

// ====================================================================
// PERSONALITY RADAR CHART COMPONENT
// ====================================================================

interface RadarChartProps {
  data: Array<{ trait: string; value: number; maxValue: number }>;
}

const PersonalityRadarChart: React.FC<RadarChartProps> = ({ data }) => {
  const size = 300;
  const center = size / 2;
  const radius = 100;
  const angles = data.map((_, i) => (i * 2 * Math.PI) / data.length - Math.PI / 2);

  const polygonPoints = angles.map((angle, i) => {
    const value = (data[i].value / data[i].maxValue) * radius;
    const x = center + value * Math.cos(angle);
    const y = center + value * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background circles */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius * scale}
            fill="none"
            stroke="rgba(20,20,19,0.1)"
            strokeWidth="1"
            opacity={0.3}
          />
        ))}

        {/* Grid lines */}
        {angles.map((angle, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(angle)}
            y2={center + radius * Math.sin(angle)}
            stroke="rgba(20,20,19,0.1)"
            strokeWidth="1"
            opacity={0.3}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="#D97706"
          fillOpacity={0.2}
          stroke="#D97706"
          strokeWidth="2"
        />

        {/* Data points */}
        {angles.map((angle, i) => {
          const value = (data[i].value / data[i].maxValue) * radius;
          const x = center + value * Math.cos(angle);
          const y = center + value * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="#D97706"
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {/* Labels */}
        {angles.map((angle, i) => {
          const labelRadius = radius + 30;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-sm fill-[#141413]"
              fontSize="12"
            >
              {data[i].trait}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

// ====================================================================
// EVOLUTION TIMELINE COMPONENT
// ====================================================================

interface TimelineProps {
  entries: TwinEvolutionEntry[];
}

const EvolutionTimeline: React.FC<TimelineProps> = ({ entries }) => {
  const sortedEntries = entries.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 10); // Show last 10 changes

  return (
    <div className="space-y-4">
      {sortedEntries.map((entry, index) => (
        <div key={entry.id} className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className={`w-2 h-2 rounded-full mt-2 ${
              entry.changeType === 'personality_update' ? 'bg-blue-500' :
              entry.changeType === 'new_interest' ? 'bg-green-500' :
              entry.changeType === 'behavior_pattern' ? 'bg-purple-500' :
              'bg-gray-500'
            }`} />
            {index < sortedEntries.length - 1 && (
              <div className="w-px h-8 bg-[rgba(20,20,19,0.1)] ml-1 mt-2" />
            )}
          </div>

          <div className="flex-grow">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#141413]">
                {entry.changeSummary}
              </p>
              <span className="text-xs text-[#6B7280]">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="mt-1 flex items-center space-x-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                entry.changeType === 'personality_update' ? 'bg-blue-100 text-blue-800' :
                entry.changeType === 'new_interest' ? 'bg-green-100 text-green-800' :
                entry.changeType === 'behavior_pattern' ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {entry.changeType.replace('_', ' ')}
              </span>

              {entry.confidenceImpact > 0.3 && (
                <span className="text-xs text-[#D97706]">
                  High Impact
                </span>
              )}
            </div>

            <p className="text-xs text-[#6B7280] mt-1">
              Source: {entry.triggerSource.replace('_', ' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ====================================================================
// MAIN DASHBOARD COMPONENT
// ====================================================================

const TwinDashboard: React.FC = () => {
  const { twinId } = useParams<{ twinId: string }>();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [twin, setTwin] = useState<any>(null);
  const [connectors, setConnectors] = useState<DataConnector[]>([]);
  const [insights, setInsights] = useState<PersonalityInsight[]>([]);
  const [trends, setTrends] = useState<PersonalityTrend[]>([]);
  const [evolutionEntries, setEvolutionEntries] = useState<TwinEvolutionEntry[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'personality' | 'evolution' | 'data'>('overview');

  // Mock data for demonstration
  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);

      // Simulate API loading
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock twin data
      setTwin({
        id: twinId,
        name: "Dr. Sarah Chen's Teaching Twin",
        status: 'active',
        lastSync: new Date(),
        dataPoints: 2847,
        conversationsCount: 156,
        studentsEngaged: 89
      });

      // Mock connectors
      setConnectors([
        {
          id: '1',
          userId: user?.id || '',
          provider: 'google_gmail',
          displayName: 'Gmail Integration',
          status: 'connected',
          lastSync: new Date(),
          syncFrequency: 60,
          isActive: true,
          connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          dataPointsCount: 1247,
          healthScore: 0.95
        },
        {
          id: '2',
          userId: user?.id || '',
          provider: 'slack',
          displayName: 'Slack Workspace',
          status: 'connected',
          lastSync: new Date(),
          syncFrequency: 30,
          isActive: true,
          connectedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          dataPointsCount: 856,
          healthScore: 0.87
        },
        {
          id: '3',
          userId: user?.id || '',
          provider: 'microsoft_outlook',
          displayName: 'Outlook Calendar',
          status: 'syncing',
          lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000),
          syncFrequency: 120,
          isActive: true,
          connectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          dataPointsCount: 744,
          healthScore: 0.92
        }
      ]);

      // Mock personality insights
      setInsights([
        {
          id: '1',
          userId: user?.id || '',
          twinId: twinId || '',
          insightType: 'communication_style',
          insightData: {
            trait: 'Warmth',
            value: 0.85,
            description: 'Highly warm and empathetic communication style'
          },
          confidenceScore: 0.89,
          sourceDataIds: ['data1', 'data2'],
          lastUpdated: new Date()
        },
        {
          id: '2',
          userId: user?.id || '',
          twinId: twinId || '',
          insightType: 'teaching_approach',
          insightData: {
            trait: 'Structure',
            value: 0.72,
            description: 'Moderately structured teaching approach'
          },
          confidenceScore: 0.76,
          sourceDataIds: ['data3', 'data4'],
          lastUpdated: new Date()
        }
      ]);

      // Mock trends
      setTrends([
        {
          insightType: 'communication_style',
          trendDirection: 'increasing',
          changeRate: 0.12,
          confidenceTrend: 0.05,
          dataPoints: [
            { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), value: 0.73, confidence: 0.84 },
            { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), value: 0.79, confidence: 0.87 },
            { date: new Date(), value: 0.85, confidence: 0.89 }
          ]
        }
      ]);

      // Mock evolution entries
      setEvolutionEntries([
        {
          id: '1',
          twinId: twinId || '',
          userId: user?.id || '',
          changeType: 'personality_update',
          oldValue: { warmth: 0.73 },
          newValue: { warmth: 0.85 },
          changeSummary: 'Increased warmth in communication style detected',
          confidenceImpact: 0.12,
          triggerSource: 'drift_detection',
          sourceDataIds: ['data1', 'data2'],
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          id: '2',
          twinId: twinId || '',
          userId: user?.id || '',
          changeType: 'new_interest',
          oldValue: null,
          newValue: { topic: 'AI Ethics', confidence: 0.78 },
          changeSummary: 'New expertise area discovered: AI Ethics',
          confidenceImpact: 0.78,
          triggerSource: 'data_analysis',
          sourceDataIds: ['data5'],
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        }
      ]);

      setIsLoading(false);
    };

    loadDashboardData();
  }, [twinId, user]);

  // Personality radar chart data
  const personalityData = [
    { trait: 'Warmth', value: 0.85, maxValue: 1.0 },
    { trait: 'Structure', value: 0.72, maxValue: 1.0 },
    { trait: 'Creativity', value: 0.68, maxValue: 1.0 },
    { trait: 'Patience', value: 0.91, maxValue: 1.0 },
    { trait: 'Expertise', value: 0.88, maxValue: 1.0 },
    { trait: 'Humor', value: 0.56, maxValue: 1.0 }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-[#D97706] mx-auto mb-4" />
          <p className="text-[#6B7280]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#141413]">
      {/* Header */}
      <div className="border-b border-[rgba(20,20,19,0.1)] bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link
                to="/talk-to-twin"
                className="flex items-center text-[#6B7280]"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Twins
              </Link>
              <div className="h-6 w-px bg-[rgba(20,20,19,0.1)]" />
              <h1 className="text-xl text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>{twin?.name || 'Twin Dashboard'}</h1>
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-sm text-[#6B7280]">Live</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 text-[#6B7280] rounded-lg">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[rgba(20,20,19,0.1)] bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: Eye },
              { id: 'personality', label: 'Personality', icon: Brain },
              { id: 'evolution', label: 'Evolution', icon: TrendingUp },
              { id: 'data', label: 'Data Sources', icon: Database }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeView === tab.id
                    ? 'border-[#D97706] text-[#D97706]'
                    : 'border-transparent text-[#6B7280]'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Stats Cards */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#6B7280]">Data Points</p>
                    <p className="text-2xl text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{twin?.dataPoints?.toLocaleString()}</p>
                  </div>
                  <Database className="h-8 w-8 text-[#D97706]" />
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-500">+12% this week</span>
                </div>
              </div>

              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#6B7280]">Conversations</p>
                    <p className="text-2xl text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{twin?.conversationsCount}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-[#D97706]" />
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-500">+8% this week</span>
                </div>
              </div>

              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#6B7280]">Students</p>
                    <p className="text-2xl text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{twin?.studentsEngaged}</p>
                  </div>
                  <Users className="h-8 w-8 text-[#D97706]" />
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-500">+5% this week</span>
                </div>
              </div>

              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#6B7280]">Sync Health</p>
                    <p className="text-2xl text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>94%</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-500" />
                </div>
                <div className="mt-4 flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-500">All systems operational</span>
                </div>
              </div>
            </div>

            {/* Quick Personality Overview */}
            <div className="lg:col-span-2">
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <h3 className="text-lg mb-6 flex items-center text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                  <Brain className="h-5 w-5 mr-2 text-[#D97706]" />
                  Personality Overview
                </h3>

                <div className="flex justify-center">
                  <PersonalityRadarChart data={personalityData} />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  {personalityData.slice(0, 4).map((trait, index) => (
                    <div key={index} className="text-center">
                      <p className="text-sm text-[#6B7280]">{trait.trait}</p>
                      <div className="mt-1 bg-[#F5F5F5] rounded-full h-2">
                        <div
                          className="bg-[#D97706] h-2 rounded-full"
                          style={{ width: `${(trait.value / trait.maxValue) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#6B7280] mt-1">
                        {Math.round((trait.value / trait.maxValue) * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Evolution */}
            <div>
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <h3 className="text-lg mb-6 flex items-center text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                  <TrendingUp className="h-5 w-5 mr-2 text-[#D97706]" />
                  Recent Changes
                </h3>

                <EvolutionTimeline entries={evolutionEntries.slice(0, 5)} />

                <div className="mt-6">
                  <button
                    onClick={() => setActiveView('evolution')}
                    className="w-full text-center text-sm text-[#D97706]"
                  >
                    View complete evolution timeline →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'personality' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Personality Radar */}
            <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
              <h3 className="text-lg mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Personality Profile</h3>
              <div className="flex justify-center">
                <PersonalityRadarChart data={personalityData} />
              </div>
            </div>

            {/* Personality Insights */}
            <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
              <h3 className="text-lg mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Detailed Insights</h3>
              <div className="space-y-4">
                {personalityData.map((trait, index) => (
                  <div key={index} className="p-4 bg-[#F5F5F5] rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{trait.trait}</span>
                      <span className="text-sm text-[#6B7280]">
                        {Math.round((trait.value / trait.maxValue) * 100)}%
                      </span>
                    </div>
                    <div className="bg-card rounded-full h-2 mb-2">
                      <div
                        className="bg-[#D97706] h-2 rounded-full"
                        style={{ width: `${(trait.value / trait.maxValue) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                      {trait.trait === 'Warmth' && 'Shows high empathy and emotional connection with students'}
                      {trait.trait === 'Structure' && 'Moderately organized approach to lesson planning'}
                      {trait.trait === 'Creativity' && 'Uses innovative methods to explain complex concepts'}
                      {trait.trait === 'Patience' && 'Exceptional patience when students struggle'}
                      {trait.trait === 'Expertise' && 'Deep knowledge across multiple subject areas'}
                      {trait.trait === 'Humor' && 'Occasional use of humor to lighten the learning atmosphere'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'evolution' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Full Timeline */}
            <div className="lg:col-span-2">
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <h3 className="text-lg mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Evolution Timeline</h3>
                <EvolutionTimeline entries={evolutionEntries} />
              </div>
            </div>

            {/* Trends Summary */}
            <div>
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6 mb-6">
                <h3 className="text-lg mb-4 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Trending Changes</h3>
                <div className="space-y-3">
                  {trends.map((trend, index) => (
                    <div key={index} className="p-3 bg-[#F5F5F5] rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[#141413] capitalize" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
                          {trend.insightType.replace('_', ' ')}
                        </span>
                        <div className="flex items-center">
                          {trend.trendDirection === 'increasing' && (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          )}
                          {trend.trendDirection === 'decreasing' && (
                            <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[#6B7280]">
                        Change rate: {(trend.changeRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <h3 className="text-lg mb-4 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Evolution Stats</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-[#6B7280]">Total Changes</span>
                    <span className="text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{evolutionEntries.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[#6B7280]">This Week</span>
                    <span className="text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[#6B7280]">High Impact</span>
                    <span className="text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'data' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Connected Services */}
            <div className="lg:col-span-2">
              <div className="bg-card border border-[rgba(20,20,19,0.1)] rounded-xl p-6">
                <h3 className="text-lg mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>Connected Data Sources</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {connectors.map((connector) => (
                    <div key={connector.id} className="p-4 bg-[#F5F5F5] rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${
                            connector.status === 'connected' ? 'bg-green-500' :
                            connector.status === 'syncing' ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`} />
                          <span className="text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>{connector.displayName}</span>
                        </div>
                        <span className="text-xs text-[#6B7280] capitalize">
                          {connector.status}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#6B7280]">Data Points</span>
                          <span className="text-[#141413]">{connector.dataPointsCount?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#6B7280]">Health Score</span>
                          <span className="text-[#141413]">{Math.round((connector.healthScore || 0) * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#6B7280]">Last Sync</span>
                          <span className="text-[#141413]">{new Date(connector.lastSync).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-[rgba(20,20,19,0.1)]">
                        <div className="bg-card rounded-full h-2">
                          <div
                            className="bg-[#D97706] h-2 rounded-full"
                            style={{ width: `${Math.round((connector.healthScore || 0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TwinDashboard;