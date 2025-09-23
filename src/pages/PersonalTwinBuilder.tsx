import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, User, Brain, Heart, Mic, FileText, Save, Sparkles, Upload } from 'lucide-react';
import { supabase, dbHelpers } from '@/lib/supabase';
import EnhancedFileUpload from '@/components/ui/EnhancedFileUpload';
import LoadingScreen from '@/components/LoadingScreen';
import type { DigitalTwin, Profile, PersonalityTraits } from '@/types/database';

const PersonalTwinBuilder = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('identity');
  const [isRecording, setIsRecording] = useState(false);

  // Form states for creating personal twin
  const [twinForm, setTwinForm] = useState({
    name: '',
    description: '',
    personality_traits: {
      communication_style: 'friendly',
      energy_level: 'moderate',
      sense_of_humor: 'playful',
      supportiveness: 'high',
      openness: 'high',
      conscientiousness: 'moderate',
      extraversion: 'moderate',
      agreeableness: 'high',
      neuroticism: 'low'
    } as PersonalityTraits & {
      openness: string;
      conscientiousness: string;
      extraversion: string;
      agreeableness: string;
      neuroticism: string;
    },
    interests: [''],
    goals: [''],
    values: [''],
    life_experiences: '',
    learning_preferences: '',
    communication_patterns: '',
    decision_making_style: 'analytical'
  });

  useEffect(() => {
    if (user) {
      initializePersonalBuilder();
    }
  }, [user]);

  const initializePersonalBuilder = async () => {
    try {
      setIsLoading(true);

      // Skip profile operations for now to prevent 404 errors
      // TODO: Implement proper Clerk-Supabase integration
      console.log('Personal Twin Builder initialized for user:', user!.id);

      // Pre-fill name with user data from Clerk
      if (user!.fullName) {
        setTwinForm(prev => ({
          ...prev,
          name: `${user!.fullName}'s Digital Twin`
        }));
      }

    } catch (error: unknown) {
      toast({
        title: "Error loading builder",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePersonalTwin = async () => {
    if (!twinForm.name.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a name for your digital twin",
        variant: "destructive"
      });
      return;
    }

    try {
      const newTwin = await dbHelpers.createDigitalTwin({
        creator_id: user!.id,
        name: twinForm.name,
        description: twinForm.description,
        subject_area: 'Personal Development',
        twin_type: 'personal',
        is_active: false,
        personality_traits: twinForm.personality_traits,
        teaching_style: {
          primary_method: 'socratic',
          encourages_questions: true,
          uses_humor: twinForm.personality_traits.sense_of_humor !== 'none',
          provides_examples: true,
          checks_understanding: true
        },
        common_phrases: [],
        favorite_analogies: [],
        knowledge_base_status: 'empty'
      });

      toast({
        title: "Personal Digital Twin Created",
        description: "Your digital twin has been created successfully!",
      });

      // Navigate to activation or dashboard
      navigate('/twin-activation', { state: { twinId: newTwin.id } });

    } catch (error: unknown) {
      toast({
        title: "Error creating twin",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Implement actual voice recording
  };

  const addArrayItem = (field: 'interests' | 'goals' | 'values') => {
    setTwinForm(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };

  const updateArrayItem = (field: 'interests' | 'goals' | 'values', index: number, value: string) => {
    setTwinForm(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };

  const removeArrayItem = (field: 'interests' | 'goals' | 'values', index: number) => {
    setTwinForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  if (isLoading) {
    return (
      <LoadingScreen
        message="Preparing your personal twin builder"
        submessage="Setting up your personalized AI creation space"
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/get-started')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-playfair font-normal italic text-[#1A1A4B]">
                Create Your Personal Digital Twin
              </h1>
              <p className="text-[#6B7280]">Design an AI version of yourself for self-reflection and growth</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FF5722]" />
            <span className="text-sm text-[#6B7280]">Personal AI Assistant</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="identity" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Identity
            </TabsTrigger>
            <TabsTrigger value="personality" className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Personality
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Voice
            </TabsTrigger>
          </TabsList>

          {/* Identity Tab */}
          <TabsContent value="identity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair italic flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Basic Identity
                </CardTitle>
                <CardDescription>
                  Define the core identity of your digital twin
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="name">Twin Name</Label>
                    <Input
                      id="name"
                      value={twinForm.name}
                      onChange={(e) => setTwinForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="My Digital Twin"
                    />
                  </div>
                  <div>
                    <Label htmlFor="decision-style">Decision Making Style</Label>
                    <Select
                      value={twinForm.decision_making_style}
                      onValueChange={(value) => setTwinForm(prev => ({ ...prev, decision_making_style: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analytical">Analytical</SelectItem>
                        <SelectItem value="intuitive">Intuitive</SelectItem>
                        <SelectItem value="collaborative">Collaborative</SelectItem>
                        <SelectItem value="decisive">Decisive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={twinForm.description}
                    onChange={(e) => setTwinForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe yourself, your background, and what makes you unique..."
                    rows={4}
                  />
                </div>

                {/* Interests */}
                <div>
                  <Label>Interests & Hobbies</Label>
                  <div className="space-y-2">
                    {twinForm.interests.map((interest, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={interest}
                          onChange={(e) => updateArrayItem('interests', index, e.target.value)}
                          placeholder="e.g., Photography, Cooking, Technology"
                        />
                        {twinForm.interests.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeArrayItem('interests', index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addArrayItem('interests')}
                    >
                      Add Interest
                    </Button>
                  </div>
                </div>

                {/* Goals */}
                <div>
                  <Label>Personal Goals</Label>
                  <div className="space-y-2">
                    {twinForm.goals.map((goal, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={goal}
                          onChange={(e) => updateArrayItem('goals', index, e.target.value)}
                          placeholder="e.g., Learn a new language, Start a business"
                        />
                        {twinForm.goals.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeArrayItem('goals', index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addArrayItem('goals')}
                    >
                      Add Goal
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Personality Tab */}
          <TabsContent value="personality" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair italic flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Personality Traits
                </CardTitle>
                <CardDescription>
                  Define how your digital twin thinks and behaves
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Communication Style</Label>
                    <Select
                      value={twinForm.personality_traits.communication_style}
                      onValueChange={(value) => setTwinForm(prev => ({
                        ...prev,
                        personality_traits: { ...prev.personality_traits, communication_style: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="direct">Direct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Energy Level</Label>
                    <Select
                      value={twinForm.personality_traits.energy_level}
                      onValueChange={(value) => setTwinForm(prev => ({
                        ...prev,
                        personality_traits: { ...prev.personality_traits, energy_level: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Sense of Humor</Label>
                    <Select
                      value={twinForm.personality_traits.sense_of_humor}
                      onValueChange={(value) => setTwinForm(prev => ({
                        ...prev,
                        personality_traits: { ...prev.personality_traits, sense_of_humor: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="dry">Dry</SelectItem>
                        <SelectItem value="playful">Playful</SelectItem>
                        <SelectItem value="witty">Witty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Supportiveness</Label>
                    <Select
                      value={twinForm.personality_traits.supportiveness}
                      onValueChange={(value) => setTwinForm(prev => ({
                        ...prev,
                        personality_traits: { ...prev.personality_traits, supportiveness: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="life-experiences">Key Life Experiences</Label>
                  <Textarea
                    id="life-experiences"
                    value={twinForm.life_experiences}
                    onChange={(e) => setTwinForm(prev => ({ ...prev, life_experiences: e.target.value }))}
                    placeholder="Describe important experiences that shaped who you are..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="communication-patterns">Communication Patterns</Label>
                  <Textarea
                    id="communication-patterns"
                    value={twinForm.communication_patterns}
                    onChange={(e) => setTwinForm(prev => ({ ...prev, communication_patterns: e.target.value }))}
                    placeholder="How do you typically communicate? Any catchphrases or patterns?"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair italic flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Training Materials
                </CardTitle>
                <CardDescription>
                  Upload content to help your digital twin learn about you
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EnhancedFileUpload
                  twinId="placeholder" // Will be updated after twin creation
                  onUploadComplete={(file) => {
                    toast({
                      title: "File uploaded",
                      description: "Your personal content has been uploaded successfully",
                    });
                  }}
                  maxFiles={10}
                  title="Upload Personal Content"
                  description="Upload journals, recordings, essays, or other personal materials to train your digital twin"
                />
                <div className="mt-4 text-sm text-[#6B7280]">
                  <p className="mb-2">You can upload:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Personal journals or diary entries</li>
                    <li>Voice recordings of yourself</li>
                    <li>Essays or written reflections</li>
                    <li>Videos where you speak</li>
                    <li>Social media exports or communications</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Voice Tab */}
          <TabsContent value="voice" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair italic flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  Voice Profile
                </CardTitle>
                <CardDescription>
                  Optional: Add voice samples to clone your voice for your digital twin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <h3 className="text-xl font-playfair italic text-[#1A1A4B] mb-2">
                    Voice Cloning Setup (Optional)
                  </h3>
                  <p className="text-[#6B7280] mb-8">
                    Choose to record directly or upload existing audio files to create a unique voice
                  </p>

                  <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                    {/* Record Voice */}
                    <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 hover:border-[#FF5722] hover:bg-[#FF5722]/5 transition-all duration-300">
                      <div className={`w-16 h-16 mx-auto rounded-full border-4 flex items-center justify-center mb-4 transition-all duration-300 ${
                        isRecording
                          ? 'border-red-500 bg-red-50 animate-pulse'
                          : 'border-[#FF5722] bg-[#FF5722]/10'
                      }`}>
                        <Mic className={`w-8 h-8 ${isRecording ? 'text-red-500' : 'text-[#FF5722]'}`} />
                      </div>
                      <h4 className="font-medium mb-2">Record Now</h4>
                      <p className="text-sm text-[#6B7280] mb-4">Record about 1.5 minutes of your voice</p>
                      <Button
                        onClick={toggleRecording}
                        size="sm"
                        className={
                          isRecording
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-[#FF5722] hover:bg-[#FF5722]/90'
                        }
                      >
                        <Mic className="w-4 h-4 mr-2" />
                        {isRecording ? 'Stop' : 'Record'}
                      </Button>
                    </div>

                    {/* Upload Audio */}
                    <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 hover:border-[#FF5722] hover:bg-[#FF5722]/5 transition-all duration-300 cursor-pointer">
                      <div className="w-16 h-16 mx-auto rounded-full border-4 border-[#4A90E2] bg-[#4A90E2]/10 flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8 text-[#4A90E2]" />
                      </div>
                      <h4 className="font-medium mb-2">Upload Files</h4>
                      <p className="text-sm text-[#6B7280] mb-4">Upload existing audio recordings</p>
                      <Button size="sm" variant="outline">
                        <Upload className="w-4 h-4 mr-2" />
                        Browse
                      </Button>
                    </div>
                  </div>

                  <div className="mt-8 text-sm text-[#6B7280] max-w-lg mx-auto">
                    <p className="mb-2">💡 Tips for better voice quality:</p>
                    <ul className="list-disc list-inside space-y-1 text-left">
                      <li>Record in a quiet environment</li>
                      <li>Speak clearly and naturally</li>
                      <li>Include varied emotions and tones</li>
                      <li>Aim for about 1.5 minutes total</li>
                      <li>Accepted formats: MP3, WAV, M4A</li>
                    </ul>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                      ⚠️ Voice cloning is optional. Your digital twin will use a default voice if no samples are provided.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end mt-8">
          <Button
            variant="outline"
            onClick={() => navigate('/get-started')}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreatePersonalTwin}
            className="bg-[#FF5722] hover:bg-[#FF5722]/90"
          >
            <Save className="w-4 h-4 mr-2" />
            Create My Digital Twin
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PersonalTwinBuilder;