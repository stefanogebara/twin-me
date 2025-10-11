import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import TwinProfilePreview from '@/components/TwinProfilePreview';

interface TwinProfile {
  personalityProfile: {
    name: string;
    email: string;
    teachingPhilosophy: string;
    communicationStyle: string;
    encouragementLevel: string;
  };
  communication: {
    primaryStyle: string;
    formalityLevel: number;
    responsePatterns: string[];
  };
  expertise: {
    subjects: string[];
    teachingMethods: string[];
    specializations: string[];
  };
  availability: {
    officeHours: string;
    responseTime: string;
    preferredChannels: string[];
  };
  dataSources: {
    gmail?: { connected: boolean; analyzed: number };
    calendar?: { connected: boolean; analyzed: number };
    teams?: { connected: boolean; analyzed: number };
    slack?: { connected: boolean; analyzed: number };
    discord?: { connected: boolean; analyzed: number };
    github?: { connected: boolean; analyzed: number };
    linkedin?: { connected: boolean; analyzed: number };
    spotify?: { connected: boolean; analyzed: number };
    youtube?: { connected: boolean; analyzed: number };
  };
}

const TwinProfilePreviewPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TwinProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfileData();
  }, [user]);

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      const userId = user?.id;

      if (!userId) {
        console.error('No user ID available');
        setIsLoading(false);
        return;
      }

      // Fetch soul signature profile
      const soulResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/soul-data/soul-signature?userId=${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Fetch connected platforms
      const platformsResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/data-sources/connected`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Fetch user style profile
      const styleResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/soul-data/style-profile?userId=${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const soulData = soulResponse.ok ? await soulResponse.json() : null;
      const platformsData = platformsResponse.ok ? await platformsResponse.json() : null;
      const styleData = styleResponse.ok ? await styleResponse.json() : null;

      // Build profile from available data
      if (soulData?.success && soulData.soulSignature) {
        const soul = soulData.soulSignature;
        const style = styleData?.profile || {};

        // Map connected platforms to dataSources
        const dataSources: TwinProfile['dataSources'] = {};
        const connectedPlatforms = platformsData?.platforms || [];

        connectedPlatforms.forEach((platform: any) => {
          const platformName = platform.provider.toLowerCase();
          dataSources[platformName as keyof typeof dataSources] = {
            connected: true,
            analyzed: platform.total_items || 0
          };
        });

        const twinProfile: TwinProfile = {
          personalityProfile: {
            name: user?.firstName + ' ' + user?.lastName || user?.email || 'User',
            email: user?.email || '',
            teachingPhilosophy: soul.curiosity_profile?.description || 'Passionate about authentic learning and personal growth',
            communicationStyle: style.communication_style || 'direct',
            encouragementLevel: style.emotional_tone?.dominant || 'balanced'
          },
          communication: {
            primaryStyle: style.communication_style || 'direct',
            formalityLevel: style.avg_sentence_length ? Math.min(10, Math.round(style.avg_sentence_length / 2)) : 5,
            responsePatterns: style.grammar_patterns?.common_patterns || ['Thoughtful responses', 'Clear communication']
          },
          expertise: {
            subjects: style.expertise_areas || soul.uniqueness_markers || [],
            teachingMethods: ['Personalized Learning', 'Data-Driven Insights'],
            specializations: style.interests || []
          },
          availability: {
            officeHours: style.typical_response_time || 'Flexible',
            responseTime: style.typical_response_time || '2-3 hours',
            preferredChannels: Object.keys(dataSources)
          },
          dataSources
        };

        setProfile(twinProfile);
      } else {
        // No soul signature found, but check if we have connected platforms
        if (platformsData?.platforms && platformsData.platforms.length > 0) {
          const dataSources: TwinProfile['dataSources'] = {};
          platformsData.platforms.forEach((platform: any) => {
            const platformName = platform.provider.toLowerCase();
            dataSources[platformName as keyof typeof dataSources] = {
              connected: true,
              analyzed: platform.total_items || 0
            };
          });

          // Create minimal profile
          const minimalProfile: TwinProfile = {
            personalityProfile: {
              name: user?.firstName + ' ' + user?.lastName || user?.email || 'User',
              email: user?.email || '',
              teachingPhilosophy: 'Building your soul signature...',
              communicationStyle: 'Analyzing your style...',
              encouragementLevel: 'pending'
            },
            communication: {
              primaryStyle: 'Analyzing...',
              formalityLevel: 5,
              responsePatterns: ['Extracting patterns...']
            },
            expertise: {
              subjects: ['Analyzing your expertise...'],
              teachingMethods: ['Analyzing your methods...'],
              specializations: []
            },
            availability: {
              officeHours: 'Analyzing...',
              responseTime: 'Analyzing...',
              preferredChannels: Object.keys(dataSources)
            },
            dataSources
          };

          setProfile(minimalProfile);
        } else {
          // No data at all
          setProfile(null);
        }
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = () => {
    navigate('/soul-signature');
  };

  const handleEdit = () => {
    navigate('/soul-signature');
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] p-8">
      <TwinProfilePreview
        profile={profile || undefined}
        onActivate={handleActivate}
        onEdit={handleEdit}
        isLoading={isLoading}
      />
    </div>
  );
};

export default TwinProfilePreviewPage;
