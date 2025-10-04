/**
 * Soul Chat Page
 * Full-page RAG-powered chat interface with personality-aware responses
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Brain, Sparkles, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SoulChat } from '@/components/SoulChat';
import { soulDataService, StyleProfile } from '@/services/soulDataService';

const SoulChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSignedIn } = useAuth();
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [hasExtractedData, setHasExtractedData] = useState(false);

  // Authentication check
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/auth');
      return;
    }
  }, [isSignedIn, navigate]);

  // Load style profile to check if extraction has been done
  useEffect(() => {
    if (user) {
      loadStyleProfile();
    }
  }, [user]);

  const loadStyleProfile = async () => {
    try {
      const userId = user?.id || user?.email || 'anonymous-user';
      const profile = await soulDataService.getStyleProfile(userId);

      if (profile.success) {
        setStyleProfile(profile);
        setHasExtractedData(true);
      }
    } catch (err) {
      console.log('No style profile found yet');
      setHasExtractedData(false);
    }
  };

  const userId = user?.id || user?.email || 'anonymous-user';

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] text-[hsl(var(--claude-text))]">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/soul-signature-dashboard')}
            className="mb-4 text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-text))]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-[hsl(var(--claude-text))] mb-2 flex items-center gap-3">
                <Brain className="w-10 h-10 text-[hsl(var(--claude-accent))]" />
                Soul Signature Chat
              </h1>
              <p className="text-lg text-[hsl(var(--claude-text-muted))]">
                Talk to your AI twin powered by your extracted personality and data
              </p>
            </div>
            <Badge className="bg-[hsl(var(--claude-accent))] text-white">
              <Sparkles className="w-4 h-4 mr-1" />
              Powered by Claude 3.5 Sonnet
            </Badge>
          </div>
        </div>

        {/* Profile Status Card */}
        {styleProfile && hasExtractedData && (
          <Card className="mb-6 p-4 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--claude-accent))] flex items-center justify-center flex-shrink-0">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-2">
                  Your Personality Profile Active
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-[hsl(var(--claude-text-muted))]">Communication:</span>
                    <span className="ml-2 text-[hsl(var(--claude-text))] font-medium capitalize">
                      {styleProfile.profile.communication_style}
                    </span>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--claude-text-muted))]">Humor:</span>
                    <span className="ml-2 text-[hsl(var(--claude-text))] font-medium capitalize">
                      {styleProfile.profile.humor_style}
                    </span>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--claude-text-muted))]">Confidence:</span>
                    <span className="ml-2 text-[hsl(var(--claude-text))] font-medium">
                      {(styleProfile.profile.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--claude-text-muted))]">Sample Size:</span>
                    <span className="ml-2 text-[hsl(var(--claude-text))] font-medium">
                      {styleProfile.profile.sample_size} texts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Warning Card - No Extraction Yet */}
        {!hasExtractedData && (
          <Card className="mb-6 p-6 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
            <div className="flex items-start gap-4">
              <Info className="w-6 h-6 text-[hsl(var(--claude-accent))] flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-2">
                  No Soul Signature Extracted Yet
                </h3>
                <p className="text-sm text-[hsl(var(--claude-text-muted))] mb-4">
                  To get personalized, personality-aware responses, you need to first extract your soul signature
                  from your connected platforms. Without this, the chat will provide generic responses.
                </p>
                <Button
                  onClick={() => navigate('/soul-signature-dashboard')}
                  className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent))]/90"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract Soul Signature First
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Main Chat Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Component */}
          <div className="lg:col-span-2">
            <SoulChat
              userId={userId}
              twinId="default"
              onNewMessage={(message) => {
                console.log('New message:', message);
              }}
            />
          </div>

          {/* Info Sidebar */}
          <div className="space-y-4">
            <Card className="p-4 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
              <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-3">
                How It Works
              </h3>
              <div className="space-y-3 text-sm text-[hsl(var(--claude-text-muted))]">
                <div className="flex gap-2">
                  <span className="text-[hsl(var(--claude-accent))]">1.</span>
                  <p>
                    Your message is converted to a vector embedding for semantic search
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="text-[hsl(var(--claude-accent))]">2.</span>
                  <p>
                    Relevant content from your platforms is retrieved using similarity search
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="text-[hsl(var(--claude-accent))]">3.</span>
                  <p>
                    Your personality profile shapes the response style and tone
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="text-[hsl(var(--claude-accent))]">4.</span>
                  <p>
                    Claude generates a response that sounds authentically like you
                  </p>
                </div>
              </div>
            </Card>

            {styleProfile && (
              <Card className="p-4 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
                <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-3">
                  Personality Traits
                </h3>
                <div className="space-y-2">
                  {styleProfile.profile.personality_traits &&
                    Object.entries(styleProfile.profile.personality_traits).map(([trait, value]) => (
                      <div key={trait} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[hsl(var(--claude-text))] capitalize">{trait}</span>
                          <span className="text-[hsl(var(--claude-text-muted))]">
                            {(value * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-[hsl(var(--claude-surface-raised))] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[hsl(var(--claude-accent))] transition-all"
                            style={{ width: `${value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            <Card className="p-4 bg-[hsl(var(--claude-surface))] border-[hsl(var(--claude-border))]">
              <h3 className="text-lg font-semibold text-[hsl(var(--claude-text))] mb-3">
                Privacy & Data
              </h3>
              <p className="text-sm text-[hsl(var(--claude-text-muted))]">
                All chat conversations are stored securely and used to improve your twin's responses.
                Your data never leaves your account and is protected by encryption.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoulChatPage;
