/**
 * Twin Profile Preview Page
 * Preview your digital twin's personality, traits, and characteristics
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, User, Brain, MessageSquare, Sparkles,
  Heart, Briefcase, Palette, TrendingUp, Target, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { soulDataService } from '@/services/soulDataService';

export const TwinProfilePreview: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const userId = user?.id || user?.email || 'anonymous-user';
        const profile = await soulDataService.getStyleProfile(userId);

        if (profile.success) {
          setProfileData(profile.profile);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--claude-bg))] flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-12 h-12 mx-auto mb-4 animate-pulse" style={{ color: '#D97706' }} />
          <p
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text-muted))'
            }}
          >
            Loading your twin profile...
          </p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-[hsl(var(--claude-bg))] flex items-center justify-center px-4">
        <Card className="p-8 max-w-md text-center">
          <Brain className="w-16 h-16 mx-auto mb-4" style={{ color: '#6B7280' }} />
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              color: 'hsl(var(--claude-text))'
            }}
          >
            No Soul Signature Yet
          </h2>
          <p
            className="text-sm mb-6"
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text-muted))'
            }}
          >
            Extract your soul signature first to preview your digital twin.
          </p>
          <Button
            onClick={() => navigate('/soul-signature')}
            style={{
              backgroundColor: '#D97706',
              color: 'white',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            Go to Soul Signature
          </Button>
        </Card>
      </div>
    );
  }

  const personalityTraits = profileData.personality_traits || {};
  const confidenceScore = Math.round((profileData.confidence_score || 0) * 100);

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Button
            onClick={() => navigate('/soul-signature')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center gap-2">
            <User className="w-6 h-6" style={{ color: '#D97706' }} />
            <h1
              className="text-2xl sm:text-3xl font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              Your Digital Twin Preview
            </h1>
            <Sparkles className="w-6 h-6" style={{ color: '#D97706' }} />
          </div>

          <div className="w-32"></div>
        </div>

        {/* Profile Header Card */}
        <Card
          className="p-6 mb-6"
          style={{
            backgroundColor: 'hsl(var(--claude-surface))',
            border: '1px solid hsl(var(--claude-border))'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#D97706' }}
              >
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2
                  className="text-xl font-medium mb-1"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    color: 'hsl(var(--claude-text))'
                  }}
                >
                  {user?.fullName || user?.email || 'Your'} Digital Twin
                </h2>
                <p
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--_typography---font--tiempos)',
                    color: 'hsl(var(--claude-text-muted))'
                  }}
                >
                  Based on {profileData.sample_size || 0} analyzed samples
                </p>
              </div>
            </div>

            <Badge
              className="text-lg px-4 py-2"
              style={{
                backgroundColor: '#D97706',
                color: 'white',
                fontFamily: 'var(--_typography---font--styrene-a)'
              }}
            >
              {confidenceScore}% Confidence
            </Badge>
          </div>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Communication Style */}
          <Card
            className="p-6"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5" style={{ color: '#D97706' }} />
              <h3
                className="text-lg font-medium"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Communication Style
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Primary Style
                  </span>
                  <Badge className="capitalize">
                    {profileData.communication_style || 'Analyzing'}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Humor Style
                  </span>
                  <Badge className="capitalize">
                    {profileData.humor_style || 'Analyzing'}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Vocabulary Richness
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    {Math.round((profileData.vocabulary_richness || 0) * 100)}%
                  </span>
                </div>
                <Progress value={(profileData.vocabulary_richness || 0) * 100} className="h-2" />
              </div>
            </div>
          </Card>

          {/* Big Five Personality Traits */}
          <Card
            className="p-6"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5" style={{ color: '#D97706' }} />
              <h3
                className="text-lg font-medium"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Personality Traits
              </h3>
            </div>

            <div className="space-y-4">
              {[
                { key: 'openness', label: 'Openness', icon: Palette },
                { key: 'conscientiousness', label: 'Conscientiousness', icon: Target },
                { key: 'extraversion', label: 'Extraversion', icon: Zap },
                { key: 'agreeableness', label: 'Agreeableness', icon: Heart },
                { key: 'neuroticism', label: 'Neuroticism', icon: TrendingUp }
              ].map(({ key, label, icon: Icon }) => {
                const value = personalityTraits[key] !== undefined ? personalityTraits[key] : 0.5;
                const percentage = Math.round(value * 100);

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: '#6B7280' }} />
                        <span
                          className="text-sm"
                          style={{
                            fontFamily: 'var(--_typography---font--tiempos)',
                            color: 'hsl(var(--claude-text))'
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{
                          fontFamily: 'var(--_typography---font--styrene-a)',
                          color: 'hsl(var(--claude-text))'
                        }}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Writing Patterns */}
          <Card
            className="p-6"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5" style={{ color: '#D97706' }} />
              <h3
                className="text-lg font-medium"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Writing Patterns
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Sentence Complexity
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    {Math.round((profileData.sentence_complexity || 0) * 100)}%
                  </span>
                </div>
                <Progress value={(profileData.sentence_complexity || 0) * 100} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Formality Level
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    {Math.round((profileData.formality_score || 0) * 100)}%
                  </span>
                </div>
                <Progress value={(profileData.formality_score || 0) * 100} className="h-2" />
              </div>
            </div>
          </Card>

          {/* Key Characteristics */}
          <Card
            className="p-6"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-5 h-5" style={{ color: '#D97706' }} />
              <h3
                className="text-lg font-medium"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'hsl(var(--claude-text))'
                }}
              >
                Key Characteristics
              </h3>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Analytical Thinking', value: personalityTraits.openness },
                { label: 'Team Collaboration', value: personalityTraits.agreeableness },
                { label: 'Task Organization', value: personalityTraits.conscientiousness },
                { label: 'Social Energy', value: personalityTraits.extraversion }
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]"
                >
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    {label}
                  </span>
                  <Badge>
                    {value !== undefined
                      ? value > 0.7
                        ? 'High'
                        : value < 0.3
                        ? 'Low'
                        : 'Moderate'
                      : 'N/A'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-center gap-4">
          <Button
            onClick={() => navigate('/soul-chat')}
            style={{
              backgroundColor: '#D97706',
              color: 'white',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat with Your Twin
          </Button>

          <Button
            onClick={() => navigate('/soul-signature')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Update Soul Signature
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TwinProfilePreview;
