import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
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
  Trash2
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
  const { user } = useUser();
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

      // Get authentication token
      const token = await user.getToken();

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
      const token = await user.getToken();

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
      const token = await user!.getToken();

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
      const token = await user!.getToken();

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

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-playfair font-normal italic text-[#1A1A4B]">
              Professor Dashboard
            </h1>
            <p className="text-[#6B7280]">Welcome back, {profile?.full_name || 'Professor'}!</p>
          </div>
          <Button
            onClick={() => setShowCreateForm(true)}
            className="bg-[#FF5722] hover:bg-[#FF5722]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Twin
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Twins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A1A4B]">{stats.totalTwins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Twins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#FF5722]">{stats.activeTwins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A1A4B]">{stats.totalConversations}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Students Reached</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A1A4B]">{stats.totalStudents}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Digital Twins List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="font-playfair italic">Your Digital Twins</CardTitle>
              <CardDescription>Manage your AI teaching assistants</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-2">
                {digitalTwins.map((twin) => (
                  <div
                    key={twin.id}
                    className={`p-4 cursor-pointer border-l-4 transition-colors ${
                      selectedTwin?.id === twin.id
                        ? 'bg-[#FFF3F0] border-l-[#FF5722]'
                        : 'hover:bg-gray-50 border-l-transparent'
                    }`}
                    onClick={() => setSelectedTwin(twin)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-[#1A1A4B]">{twin.name}</h4>
                        <p className="text-sm text-[#6B7280]">{twin.subject_area}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={twin.is_active ? "default" : "secondary"}
                          className={twin.is_active ? "bg-green-100 text-green-800" : ""}
                        >
                          {twin.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTwinStatus(twin.id, twin.is_active);
                          }}
                        >
                          {twin.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {digitalTwins.length === 0 && (
                  <div className="p-8 text-center text-[#6B7280]">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No digital twins yet</p>
                    <p className="text-sm">Create your first AI teaching assistant</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Twin Details */}
          <div className="lg:col-span-2">
            {selectedTwin ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-playfair italic">{selectedTwin.name}</CardTitle>
                      <CardDescription>{selectedTwin.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Subject Area</Label>
                        <p className="text-[#6B7280]">{selectedTwin.subject_area}</p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Status</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={selectedTwin.is_active ? "default" : "secondary"}
                            className={selectedTwin.is_active ? "bg-green-100 text-green-800" : ""}
                          >
                            {selectedTwin.is_active ? 'Active & Available to Students' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Knowledge Base</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getProcessingStatusColor(selectedTwin.knowledge_base_status)}>
                            {selectedTwin.knowledge_base_status}
                          </Badge>
                          <span className="text-sm text-[#6B7280]">
                            {trainingMaterials.length} materials uploaded
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/twin-builder?twin=${selectedTwin.id}`)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Configuration
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/chat/${selectedTwin.id}`)}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Test Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="content" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-playfair italic">Training Materials</CardTitle>
                      <CardDescription>
                        Upload content to train your digital twin's knowledge and personality
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FileUpload
                        twinId={selectedTwin.id}
                        onUploadComplete={(file) => {
                          setTrainingMaterials(prev => [file, ...prev]);
                          toast({
                            title: "File uploaded",
                            description: "Your training material has been uploaded successfully",
                          });
                        }}
                      />

                      {/* Materials List */}
                      <div className="mt-6 space-y-2">
                        <h4 className="font-medium text-[#1A1A4B]">Uploaded Materials</h4>
                        {trainingMaterials.length > 0 ? (
                          trainingMaterials.map((material) => (
                            <div
                              key={material.id}
                              className="flex items-center justify-between p-3 bg-white border border-[#E5E7EB] rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                {getFileTypeIcon(material.file_type)}
                                <div>
                                  <h5 className="font-medium text-[#1A1A4B] text-sm">
                                    {material.file_name}
                                  </h5>
                                  <p className="text-xs text-[#6B7280]">
                                    Uploaded {new Date(material.uploaded_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <Badge className={getProcessingStatusColor(material.processing_status)}>
                                {material.processing_status}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-[#6B7280] text-sm">No materials uploaded yet</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="voice" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-playfair italic">Voice Configuration</CardTitle>
                      <CardDescription>
                        Set up voice cloning and text-to-speech for your digital twin
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <Mic className="w-16 h-16 mx-auto mb-4 text-[#6B7280]" />
                        <h3 className="text-lg font-medium text-[#1A1A4B] mb-2">
                          Voice Cloning Setup
                        </h3>
                        <p className="text-[#6B7280] mb-4">
                          Upload voice samples to create a unique voice for your digital twin
                        </p>
                        <Button className="bg-[#FF5722] hover:bg-[#FF5722]/90">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Voice Samples
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-playfair italic">Performance Analytics</CardTitle>
                      <CardDescription>
                        Track how your digital twin is performing with students
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-8">
                        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-[#6B7280]" />
                        <h3 className="text-lg font-medium text-[#1A1A4B] mb-2">
                          Analytics Coming Soon
                        </h3>
                        <p className="text-[#6B7280]">
                          Detailed analytics about student interactions and learning outcomes
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Users className="w-16 h-16 mx-auto mb-4 text-[#6B7280]" />
                    <h3 className="text-lg font-medium text-[#1A1A4B] mb-2">
                      No Digital Twin Selected
                    </h3>
                    <p className="text-[#6B7280] mb-4">
                      Select a digital twin from the list or create a new one to get started
                    </p>
                    <Button
                      onClick={() => setShowCreateForm(true)}
                      className="bg-[#FF5722] hover:bg-[#FF5722]/90"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Twin
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Twin Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <CardHeader>
              <CardTitle className="font-playfair italic">Create New Digital Twin</CardTitle>
              <CardDescription>
                Set up your AI teaching assistant with basic information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Twin Name</Label>
                <Input
                  id="name"
                  value={twinForm.name}
                  onChange={(e) => setTwinForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Dr. Smith - Physics 101"
                />
              </div>

              <div>
                <Label htmlFor="subject">Subject Area</Label>
                <Input
                  id="subject"
                  value={twinForm.subject_area}
                  onChange={(e) => setTwinForm(prev => ({ ...prev, subject_area: e.target.value }))}
                  placeholder="e.g., Physics, Mathematics, Computer Science"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={twinForm.description}
                  onChange={(e) => setTwinForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your teaching style and expertise..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateTwin}
                  className="bg-[#FF5722] hover:bg-[#FF5722]/90"
                >
                  Create Twin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProfessorDashboard;