import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Calendar, MessageSquare, Users, Brain, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

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
  };
}

interface TwinProfilePreviewProps {
  profile?: TwinProfile;
  onActivate: () => void;
  onEdit: () => void;
  isLoading?: boolean;
}

const TwinProfilePreview: React.FC<TwinProfilePreviewProps> = ({
  profile,
  onActivate,
  onEdit,
  isLoading = false
}) => {
  const [profileCompleteness, setProfileCompleteness] = useState(0);

  useEffect(() => {
    if (profile) {
      // Calculate profile completeness
      const dataSources = Object.values(profile.dataSources || {});
      const connectedSources = dataSources.filter(source => source?.connected).length;
      const totalAnalyzed = dataSources.reduce((sum, source) => sum + (source?.analyzed || 0), 0);

      const completeness = Math.min(100, Math.round(
        (connectedSources * 20) + // Each connected source adds 20%
        (totalAnalyzed > 0 ? 20 : 0) // Having analyzed data adds 20%
      ));

      setProfileCompleteness(completeness);
    }
  }, [profile]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg text-muted-foreground">Analyzing your data...</p>
          <p className="text-sm text-muted-foreground mt-2">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="text-center py-12">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No Profile Data</h3>
          <p className="text-muted-foreground">Connect your data sources to generate your twin profile</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header with Profile Summary */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">Your Digital Twin Profile</CardTitle>
              <p className="text-muted-foreground mt-2">
                Generated from {Object.keys(profile.dataSources).filter(key => profile.dataSources[key]?.connected).length} connected data sources
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-2">Profile Completeness</div>
              <div className="flex items-center gap-2">
                <Progress value={profileCompleteness} className="w-32" />
                <span className="font-semibold">{profileCompleteness}%</span>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Profile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personality Profile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personality Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Teaching Philosophy</div>
                <p className="mt-1">{profile.personalityProfile.teachingPhilosophy}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Communication Style</div>
                <p className="mt-1">{profile.personalityProfile.communicationStyle}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Encouragement Level</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="secondary">{profile.personalityProfile.encouragementLevel}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Communication Patterns */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Communication Patterns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Primary Style</div>
                <p className="mt-1">{profile.communication.primaryStyle}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Formality Level</div>
                <div className="mt-2">
                  <Progress value={profile.communication.formalityLevel * 10} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Informal</span>
                    <span>Formal</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Response Patterns</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.communication.responsePatterns.map((pattern, index) => (
                    <Badge key={index} variant="outline">{pattern}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Expertise */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Expertise & Knowledge
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Subjects</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.expertise.subjects.map((subject, index) => (
                    <Badge key={index}>{subject}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Teaching Methods</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.expertise.teachingMethods.map((method, index) => (
                    <Badge key={index} variant="secondary">{method}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Sources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Data Sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(profile.dataSources).map(([source, data]) => (
                  <div key={source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data?.connected ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="capitalize">{source}</span>
                    </div>
                    {data?.connected && (
                      <Badge variant="outline">
                        {data.analyzed} items analyzed
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div>
              <h3 className="font-semibold">Ready to activate your twin?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your digital twin will be available immediately after activation
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onEdit}>
                Edit Profile
              </Button>
              <Button onClick={onActivate} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Activate Twin
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TwinProfilePreview;