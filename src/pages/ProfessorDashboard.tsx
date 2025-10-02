import { useState, useEffect } from 'react';
import { useAuth, SignedIn, SignedOut } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus,
  Settings,
  Users,
  MessageSquare,
  Upload,
  Play,
  Pause,
  BarChart3,
  FileText,
  Mic,
  Video,
  Eye,
  Edit,
  Trash2,
  Home,
  ChevronRight
} from 'lucide-react';
import { SecureDigitalTwinAPI } from '@/lib/api';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import FileUpload from '@/components/FileUpload';
import LoadingScreen from '@/components/LoadingScreen';
import type { DigitalTwin, TrainingMaterial, Profile, TeachingStyle, PersonalityTraits } from '@/types/database';

interface DashboardStats {
  totalTwins: number;
  activeTwins: number;
  totalConversations: number;
  totalStudents: number;
}

const ProfessorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Async operations hooks
  const twinOperation = useAsyncOperation({
    showSuccessToast: true,
    showErrorToast: true
  });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [digitalTwins, setDigitalTwins] = useState<DigitalTwin[]>([]);
  const [selectedTwin, setSelectedTwin] = useState<DigitalTwin | null>(null);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalTwins: 0, activeTwins: 0, totalConversations: 0, totalStudents: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form states for creating/editing twins
  const [twinForm, setTwinForm] = useState({
    name: '',
    description: '',
    subject_area: '',
    personality_traits: {} as PersonalityTraits,
    teaching_style: {} as TeachingStyle,
    common_phrases: [''],
    favorite_analogies: ['']
  });

  useEffect(() => {
    if (user) {
      initializeProfessor();
    }
  }, [user]);

  useEffect(() => {
    if (selectedTwin) {
      loadTrainingMaterials(selectedTwin.id);
    }
  }, [selectedTwin]);

  const initializeProfessor = async () => {
    try {
      setIsLoading(true);

      if (!user) {
        toast({
          title: "Authentication Error",
          description: "Please sign in to access the dashboard.",
          variant: "destructive"
        });
        navigate('/auth');
        return;
      }

      // Get authentication token from localStorage
      const token = localStorage.getItem('auth_token');

      // Load digital twins using secure API
      const twins = await SecureDigitalTwinAPI.getMyTwins(token);
      setDigitalTwins(twins);

      // Load stats
      const activeTwins = twins.filter(t => t.is_active).length;
      setStats({
        totalTwins: twins.length,
        activeTwins,
        totalConversations: 0, // TODO: Implement conversation counting
        totalStudents: 0 // TODO: Implement student counting
      });

      if (twins.length > 0) {
        setSelectedTwin(twins[0]);
      }

    } catch (error: any) {
      toast({
        title: "Error loading dashboard",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrainingMaterials = async (twinId: string) => {
    try {
      if (!user) return;
      const token = localStorage.getItem('auth_token');

      // TODO: Add API endpoint for getting training materials
      // For now, return empty array
      setTrainingMaterials([]);
    } catch (error: any) {
      toast({
        title: "Error loading training materials",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleCreateTwin = async () => {
    if (!twinForm.name.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a name for your digital twin",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');

      const newTwin = await SecureDigitalTwinAPI.createTwin({
        creator_id: user!.id,
        name: twinForm.name,
        description: twinForm.description,
        subject_area: twinForm.subject_area,
        twin_type: 'professor',
        is_active: false,
        personality_traits: twinForm.personality_traits,
        teaching_style: twinForm.teaching_style,
        common_phrases: twinForm.common_phrases.filter(p => p.trim()),
        favorite_analogies: twinForm.favorite_analogies.filter(a => a.trim()),
        knowledge_base_status: 'empty'
      }, token);

      setDigitalTwins(prev => [newTwin, ...prev]);
      setSelectedTwin(newTwin);
      setShowCreateForm(false);

      // Reset form
      setTwinForm({
        name: '',
        description: '',
        subject_area: '',
        personality_traits: {} as PersonalityTraits,
        teaching_style: {} as TeachingStyle,
        common_phrases: [''],
        favorite_analogies: ['']
      });

      toast({
        title: "Digital Twin Created",
        description: "Your digital twin has been created successfully!",
      });

    } catch (error: any) {
      toast({
        title: "Error creating twin",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const toggleTwinStatus = async (twinId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('auth_token');

      const updatedTwin = await SecureDigitalTwinAPI.updateTwin(twinId, {
        is_active: !currentStatus
      }, token);

      setDigitalTwins(prev =>
        prev.map(t => t.id === twinId ? updatedTwin : t)
      );

      if (selectedTwin?.id === twinId) {
        setSelectedTwin(updatedTwin);
      }

      toast({
        title: currentStatus ? "Twin Deactivated" : "Twin Activated",
        description: `Your digital twin is now ${!currentStatus ? 'active' : 'inactive'}`,
      });

    } catch (error: any) {
      toast({
        title: "Error updating twin",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getProcessingStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getFileTypeIcon = (fileType: string) => {
    if (fileType.includes('audio')) return <Mic className="w-4 h-4" />;
    if (fileType.includes('video')) return <Video className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  if (isLoading) {
    return (
      <LoadingScreen
        message="Loading your dashboard"
        submessage="Preparing your digital twin management center"
      />
    );
  }

  // Add authentication protection
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF9F5' }}>
        <div className="text-center">
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
            Access Denied
          </h2>
          <p className="mb-6" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
            Please sign in to access the professor dashboard.
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-anthropic-primary"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F5' }}>
      {/* Navigation Breadcrumb */}
      <div className="px-6 py-4 border-b" style={{ backgroundColor: '#FAF9F5', borderColor: 'rgba(20,20,19,0.1)' }}>
        <div className="max-w-7xl mx-auto">
          <nav className="flex items-center space-x-2 text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ color: '#6B7280' }}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
            <ChevronRight className="w-4 h-4" style={{ color: '#6B7280' }} />
            <span style={{ color: '#141413', fontWeight: 500 }}>Dashboard</span>
          </nav>
        </div>
      </div>

      {/* Header with Clear Visual Hierarchy */}
      <div className="px-6 py-8 border-b" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
        <div className="max-w-7xl mx-auto">
          {/* Large Title */}
          <div className="mb-6">
            <h1 className="text-4xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
              Dashboard
            </h1>
            <p className="text-lg" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
              Manage your digital soul signatures
            </p>
          </div>

          {/* Primary Action */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-anthropic-primary inline-flex items-center gap-2 text-base px-6 py-3"
          >
            <Plus className="w-5 h-5" />
            Discover Your Soul Signature
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats */}
        {stats.totalTwins > 0 && (
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Primary Metric - Active Twins */}
              <div className="rounded-2xl p-6 border" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#6B7280' }}>Active Signatures</p>
                    <p className="text-3xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#D97706' }}>{stats.activeTwins}</p>
                    <p className="text-sm mt-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>Ready to share</p>
                  </div>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                    <Play className="w-6 h-6" style={{ color: '#D97706' }} />
                  </div>
                </div>
              </div>

              {/* Secondary Metric - Total */}
              <div className="rounded-2xl p-6 border" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#6B7280' }}>Soul Signatures</p>
                    <p className="text-3xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>{stats.totalTwins}</p>
                    <p className="text-sm mt-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                      {stats.totalTwins - stats.activeTwins > 0 ? `${stats.totalTwins - stats.activeTwins} being refined` : 'All signatures ready'}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                    <Users className="w-6 h-6" style={{ color: '#6B7280' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Organization */}
        <div className="space-y-8">
          {digitalTwins.length > 0 ? (
            <div>
              {/* Section Title */}
              <div className="mb-8">
                <h2 className="text-2xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                  Your Soul Signatures
                </h2>
                <p className="text-base" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                  {digitalTwins.length} {digitalTwins.length === 1 ? 'signature' : 'signatures'} discovered
                </p>
              </div>

              {/* Content Grouping */}
              <div className="space-y-8">
                {/* Active Twins Group */}
                {digitalTwins.filter(t => t.is_active).length > 0 && (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>Ready to Share</h3>
                      <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                        Signatures refined and ready for sharing
                      </p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {digitalTwins.filter(t => t.is_active).map((twin) => (
                        <div
                          key={twin.id}
                          className={`p-6 rounded-xl border cursor-pointer ${
                            selectedTwin?.id === twin.id ? 'ring-2' : ''
                          }`}
                          style={{
                            backgroundColor: 'white',
                            borderColor: selectedTwin?.id === twin.id ? '#D97706' : 'rgba(20,20,19,0.1)',
                            ringColor: selectedTwin?.id === twin.id ? '#D97706' : 'transparent'
                          }}
                          onClick={() => setSelectedTwin(twin)}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <h4 className="text-lg mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>{twin.name}</h4>
                              <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>{twin.subject_area}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="px-3 py-1 rounded-full text-xs text-white" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, backgroundColor: '#D97706' }}>
                                Live
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                              <span>Ready to share</span>
                            </div>
                            <button
                              className="p-2 rounded-lg"
                              style={{ color: '#6B7280', backgroundColor: '#F5F5F5' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTwinStatus(twin.id, twin.is_active);
                              }}
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* In Development Twins Group */}
                {digitalTwins.filter(t => !t.is_active).length > 0 && (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>Being Refined</h3>
                      <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                        Signatures still discovering their depth
                      </p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {digitalTwins.filter(t => !t.is_active).map((twin) => (
                        <div
                          key={twin.id}
                          className={`p-6 rounded-xl border cursor-pointer ${
                            selectedTwin?.id === twin.id ? 'ring-2' : ''
                          }`}
                          style={{
                            backgroundColor: 'white',
                            borderColor: selectedTwin?.id === twin.id ? '#D97706' : 'rgba(20,20,19,0.1)',
                            ringColor: selectedTwin?.id === twin.id ? '#D97706' : 'transparent'
                          }}
                          onClick={() => setSelectedTwin(twin)}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <h4 className="text-lg mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>{twin.name}</h4>
                              <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>{twin.subject_area}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="px-3 py-1 rounded-full text-xs" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, backgroundColor: '#F5F5F5', color: '#6B7280' }}>
                                Draft
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                              <span>Refine and explore</span>
                            </div>
                            <button
                              className="p-2 rounded-lg"
                              style={{ color: '#6B7280', backgroundColor: '#F5F5F5' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTwinStatus(twin.id, twin.is_active);
                              }}
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <Users className="w-10 h-10" style={{ color: '#6B7280' }} />
              </div>
              <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                Discover Your Soul Signature
              </h3>
              <p className="text-base mb-8 max-w-md mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Connect your digital life to reveal your authentic essence and create a shareable soul signature
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn-anthropic-primary inline-flex items-center gap-2 text-base px-6 py-3"
              >
                <Plus className="w-5 h-5" />
                Get Started
              </button>
            </div>
          )}

          {/* Twin Details Panel */}
          {selectedTwin && (
            <div className="rounded-2xl border" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>{selectedTwin.name}</h3>
                    <p className="text-base" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>{selectedTwin.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/twin-builder?twin=${selectedTwin.id}`)}
                      className="btn-anthropic-secondary"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/chat/${selectedTwin.id}`)}
                      className="btn-anthropic-primary"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Test Chat
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#F5F5F5' }}>
                    <p className="text-sm mb-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#6B7280' }}>Subject</p>
                    <p style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>{selectedTwin.subject_area}</p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#F5F5F5' }}>
                    <p className="text-sm mb-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#6B7280' }}>Status</p>
                    <p style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: selectedTwin.is_active ? '#D97706' : '#6B7280' }}>
                      {selectedTwin.is_active ? 'Active' : 'In Development'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#F5F5F5' }}>
                    <p className="text-sm mb-1" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#6B7280' }}>Knowledge Base</p>
                    <p className="capitalize" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, color: '#141413' }}>{selectedTwin.knowledge_base_status}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Twin Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 rounded-2xl border" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
              <div className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                    Create New Soul Signature
                  </h2>
                  <p className="text-base" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                    Begin your journey to discover your authentic digital essence
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm mb-2" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#141413' }}>Signature Name</label>
                    <input
                      value={twinForm.name}
                      onChange={(e) => setTwinForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., My Authentic Self, Creative Explorer"
                      className="w-full px-4 py-3 rounded-xl border text-base"
                      style={{ fontFamily: 'var(--_typography---font--tiempos)', backgroundColor: '#F5F5F5', borderColor: 'rgba(20,20,19,0.1)', color: '#141413' }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#141413' }}>Primary Focus</label>
                    <input
                      value={twinForm.subject_area}
                      onChange={(e) => setTwinForm(prev => ({ ...prev, subject_area: e.target.value }))}
                      placeholder="e.g., Creative Arts, Technology, Wellness, Music"
                      className="w-full px-4 py-3 rounded-xl border text-base"
                      style={{ fontFamily: 'var(--_typography---font--tiempos)', backgroundColor: '#F5F5F5', borderColor: 'rgba(20,20,19,0.1)', color: '#141413' }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500, color: '#141413' }}>Description</label>
                    <textarea
                      value={twinForm.description}
                      onChange={(e) => setTwinForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe what makes you unique and authentic..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border text-base resize-none"
                      style={{ fontFamily: 'var(--_typography---font--tiempos)', backgroundColor: '#F5F5F5', borderColor: 'rgba(20,20,19,0.1)', color: '#141413' }}
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-4">
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="btn-anthropic-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTwin}
                      className="btn-anthropic-primary"
                    >
                      Create Signature
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessorDashboard;