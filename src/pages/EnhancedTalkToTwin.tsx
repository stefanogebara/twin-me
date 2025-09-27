import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, MessageCircle, Star, Users, BookOpen, Zap, BarChart3 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { dbHelpers } from '@/lib/supabase';
import LoadingScreen from '@/components/LoadingScreen';
import { SearchAndFilter } from '@/components/ui/SearchAndFilter';
import { useLoading } from '@/contexts/LoadingContext';
import { useError } from '@/contexts/ErrorContext';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import type { DigitalTwin } from '@/types/database';

interface ProfessorTwin extends DigitalTwin {
  profiles?: {
    full_name: string;
    university?: string;
    department?: string;
    avatar_url?: string;
  };
}

const EnhancedTalkToTwin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setLoading, isLoading } = useLoading();
  const { showError } = useError();
  const { trackUserAction, trackTwinInteraction } = useAnalytics();

  const [digitalTwins, setDigitalTwins] = useState<ProfessorTwin[]>([]);
  const [filteredTwins, setFilteredTwins] = useState<ProfessorTwin[]>([]);

  useEffect(() => {
    loadDigitalTwins();
    trackUserAction('page_visit', 'talk_to_twin_page');
  }, []);

  const loadDigitalTwins = async () => {
    try {
      setLoading('twins', true);
      const twins = await dbHelpers.getActiveProfessorTwins();
      setDigitalTwins(twins);
    } catch (error: any) {
      showError('Failed to load digital twins: ' + error.message);
    } finally {
      setLoading('twins', false);
    }
  };


  const twinFilters = [
    {
      key: 'subject_area' as keyof ProfessorTwin,
      label: 'Subject',
      type: 'select' as const,
      options: Array.from(new Set(digitalTwins.map(twin => twin.subject_area).filter(Boolean))).map(subject => ({
        value: subject!,
        label: subject!
      }))
    },
    {
      key: 'profiles.university' as keyof ProfessorTwin,
      label: 'University',
      type: 'select' as const,
      options: Array.from(new Set(digitalTwins.map(twin => twin.profiles?.university).filter(Boolean))).map(university => ({
        value: university!,
        label: university!
      }))
    }
  ];

  const startConversation = (twinId: string) => {
    trackTwinInteraction(twinId, 'start_conversation', {
      source: 'twin_selection_page',
      twin_name: digitalTwins.find(t => t.id === twinId)?.name
    });
    navigate(`/chat/${twinId}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (isLoading('twins')) {
    return (
      <LoadingScreen
        message="Loading digital twins"
        submessage="Discovering available AI professors"
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
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-playfair font-normal italic text-[#1A1A4B]">
                Talk to AI Professors
              </h1>
              <p className="text-[#6B7280]">Choose a digital twin to start learning</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="bg-[#FFF3F0] text-[#FF5722]">
              {digitalTwins.length} Twins Available
            </Badge>
            <Button
              onClick={() => {
                trackUserAction('navigation', 'professor_dashboard', { source: 'talk_to_twin_header' });
                navigate('/professor-dashboard');
              }}
              className="bg-[#FF5722] hover:bg-[#FF5722]/90"
            >
              <Users className="w-4 h-4 mr-2" />
              Professor Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Search and Filter */}
        <div className="mb-8">
          <SearchAndFilter
            data={digitalTwins}
            onFilteredData={setFilteredTwins}
            searchKeys={['name', 'subject_area', 'description']}
            filters={twinFilters}
            placeholder="Search by professor name, subject, or university..."
          />
        </div>

        {/* Digital Twins Grid */}
        {filteredTwins.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTwins.map((twin) => (
              <Card key={twin.id} className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-[#FF5722]/20">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={twin.profiles?.avatar_url} alt={twin.name} />
                      <AvatarFallback className="bg-[#FF5722]/10 text-[#FF5722] text-lg font-semibold">
                        {getInitials(twin.profiles?.full_name || twin.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-lg font-playfair italic text-[#1A1A4B] mb-1">
                        {twin.profiles?.full_name || twin.name}
                      </CardTitle>
                      <div className="space-y-1">
                        <Badge className="bg-[#FF5722]/10 text-[#FF5722] hover:bg-[#FF5722]/20">
                          {twin.subject_area}
                        </Badge>
                        {twin.profiles?.university && (
                          <p className="text-sm text-[#6B7280]">
                            {twin.profiles.university}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <CardDescription className="text-[#6B7280] mb-4 line-clamp-2">
                    {twin.description || "An AI teaching assistant ready to help you learn and explore new concepts."}
                  </CardDescription>

                  {/* Expertise Areas */}
                  {twin.common_phrases && twin.common_phrases.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-[#1A1A4B] mb-2">Teaching Style:</p>
                      <div className="flex flex-wrap gap-1">
                        {twin.common_phrases.slice(0, 2).map((phrase, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {phrase.length > 20 ? phrase.substring(0, 20) + '...' : phrase}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => startConversation(twin.id)}
                      className="flex-1 bg-[#FF5722] hover:bg-[#FF5722]/90 group-hover:scale-105 transition-transform"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Start Chat
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3"
                      onClick={() => {
                        trackTwinInteraction(twin.id, 'dashboard_view', {
                          twin_name: twin.name,
                          subject_area: twin.subject_area
                        });
                        navigate(`/twin-dashboard/${twin.id}`);
                      }}
                      title="View Dashboard"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3"
                      onClick={() => {
                        trackTwinInteraction(twin.id, 'preview_attempt', {
                          twin_name: twin.name,
                          subject_area: twin.subject_area
                        });
                        toast({
                          title: "Coming Soon",
                          description: "Twin preview feature is coming soon!",
                        });
                      }}
                      title="Preview Twin"
                    >
                      <BookOpen className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4 text-[#6B7280] opacity-50" />
            <h3 className="text-xl font-playfair italic text-[#1A1A4B] mb-2">
              {filteredTwins.length !== digitalTwins.length
                ? 'No matching digital twins found'
                : 'No digital twins available yet'
              }
            </h3>
            <p className="text-[#6B7280] mb-6">
              {filteredTwins.length !== digitalTwins.length
                ? 'Try adjusting your search criteria or filters'
                : 'Professors are still setting up their digital twins'
              }
            </p>
            {filteredTwins.length !== digitalTwins.length ? (
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Clear Filters
              </Button>
            ) : (
              <Button
                onClick={() => {
                  trackUserAction('navigation', 'create_twin_cta', { source: 'empty_state' });
                  navigate('/professor-dashboard');
                }}
                className="bg-[#FF5722] hover:bg-[#FF5722]/90"
              >
                <Zap className="w-4 h-4 mr-2" />
                Create Your Digital Twin
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="mt-16 bg-white border-t border-[#E5E7EB] px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-playfair italic text-[#1A1A4B] mb-4">
              Why Choose AI Professors?
            </h2>
            <p className="text-[#6B7280] text-lg max-w-2xl mx-auto">
              Get personalized, always-available tutoring from digital twins of top educators
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#FF5722]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-[#FF5722]" />
              </div>
              <h3 className="text-xl font-playfair italic text-[#1A1A4B] mb-2">24/7 Availability</h3>
              <p className="text-[#6B7280]">
                Learn anytime, anywhere. Your AI professor is always ready to help, no scheduling required.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-[#FF5722]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-[#FF5722]" />
              </div>
              <h3 className="text-xl font-playfair italic text-[#1A1A4B] mb-2">Personalized Teaching</h3>
              <p className="text-[#6B7280]">
                Each digital twin adapts to your learning style, pace, and preferences for optimal understanding.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-[#FF5722]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-[#FF5722]" />
              </div>
              <h3 className="text-xl font-playfair italic text-[#1A1A4B] mb-2">Expert Knowledge</h3>
              <p className="text-[#6B7280]">
                Learn from digital twins of world-class professors with deep expertise in their fields.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedTalkToTwin;