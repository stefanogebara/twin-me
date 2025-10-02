import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  MessageCircle,
  BookOpen,
  Clock,
  TrendingUp,
  Users,
  Star,
  ArrowRight,
  Plus,
  Settings
} from 'lucide-react';
import { SecureDigitalTwinAPI } from '@/lib/api';
import ThemeToggle from '../components/ThemeToggle';

interface Conversation {
  id: string;
  title: string;
  twin_id: string;
  started_at: string;
  last_message_at: string;
  twin?: {
    name: string;
    subject_area: string;
    creator_id: string;
  };
}

interface ActiveTwin {
  id: string;
  name: string;
  description: string;
  subject_area: string;
  creator_id: string;
  created_at: string;
}

interface StudentStats {
  totalConversations: number;
  totalMessages: number;
  activeTwins: number;
  studyTime: number;
  completedAssessments: number;
  averageRating: number;
}

const StudentDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTwins, setActiveTwins] = useState<ActiveTwin[]>([]);
  const [stats, setStats] = useState<StudentStats>({
    totalConversations: 0,
    totalMessages: 0,
    activeTwins: 0,
    studyTime: 0,
    completedAssessments: 0,
    averageRating: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth_token');

      // Load conversations, active twins, and calculate stats
      const [conversationsResult, twinsResult] = await Promise.all([
        SecureDigitalTwinAPI.getConversations(token),
        SecureDigitalTwinAPI.getActiveTwins(token)
      ]);

      if (conversationsResult.success) {
        setConversations(conversationsResult.data.conversations);
      }

      if (twinsResult.success) {
        setActiveTwins(twinsResult.data.twins);
      }

      // Calculate stats from loaded data
      calculateStats(
        conversationsResult.success ? conversationsResult.data.conversations : [],
        twinsResult.success ? twinsResult.data.twins : []
      );

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (conversations: Conversation[], twins: ActiveTwin[]) => {
    setStats({
      totalConversations: conversations.length,
      totalMessages: conversations.length * 8, // Estimate based on conversations
      activeTwins: twins.length,
      studyTime: conversations.length * 15, // Estimate 15 minutes per conversation
      completedAssessments: Math.floor(conversations.length / 3), // Estimate
      averageRating: 4.5 // Static for now
    });
  };

  const startNewConversation = async (twinId: string, twinName: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const result = await SecureDigitalTwinAPI.createConversation(token, {
        twin_id: twinId,
        title: `Chat with ${twinName}`
      });

      if (result.success) {
        navigate(`/chat/${twinId}?conversation=${result.data.conversation.id}`);
      } else {
        toast({
          title: "Error",
          description: "Failed to start conversation. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to start conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6" style={{ backgroundColor: '#FAF9F5' }}>
        <div className="max-w-7xl mx-auto">
          <div className="space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-96 bg-gray-200 rounded-lg"></div>
              <div className="h-96 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#FAF9F5' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-3xl font-medium"
              style={{
                color: '#141413',
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em'
              }}
            >
              Welcome back, {user?.firstName || 'Student'}!
            </h1>
            <p
              className="mt-1"
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Continue your learning journey with AI-powered digital twins
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="outline" size="sm" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Avatar>
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback>{getInitials(user?.fullName || 'S')}</AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="text-sm font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Total Conversations
              </CardTitle>
              <MessageCircle className="h-4 w-4" style={{ color: '#6B7280' }} />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
              >
                {stats.totalConversations}
              </div>
              <p
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                +2 from last week
              </p>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="text-sm font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Study Time
              </CardTitle>
              <Clock className="h-4 w-4" style={{ color: '#6B7280' }} />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
              >
                {Math.floor(stats.studyTime / 60)}h {stats.studyTime % 60}m
              </div>
              <p
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                +15% from last week
              </p>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="text-sm font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Active Twins
              </CardTitle>
              <Users className="h-4 w-4" style={{ color: '#6B7280' }} />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
              >
                {stats.activeTwins}
              </div>
              <p
                className="text-xs"
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Across {new Set(activeTwins.map(t => t.subject_area)).size} subjects
              </p>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="text-sm font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)'
                }}
              >
                Progress Score
              </CardTitle>
              <TrendingUp className="h-4 w-4" style={{ color: '#6B7280' }} />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-medium"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  letterSpacing: '-0.02em'
                }}
              >
                85%
              </div>
              <Progress value={85} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Conversations */}
          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader>
              <CardTitle
                className="flex items-center gap-2"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em'
                }}
              >
                <MessageCircle className="h-5 w-5" />
                Recent Conversations
              </CardTitle>
              <CardDescription
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Your recent chats with digital twins
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {conversations.length > 0 ? (
                  conversations.slice(0, 5).map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{
                        border: '1px solid rgba(20,20,19,0.1)'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {conversation.twin?.name ? getInitials(conversation.twin.name) : 'AI'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p
                            className="font-medium text-sm"
                            style={{
                              color: '#141413',
                              fontFamily: 'var(--_typography---font--tiempos)'
                            }}
                          >
                            {conversation.title}
                          </p>
                          <p
                            className="text-xs"
                            style={{
                              color: '#6B7280',
                              fontFamily: 'var(--_typography---font--tiempos)'
                            }}
                          >
                            {conversation.twin?.subject_area} • {formatDate(conversation.last_message_at)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/chat/${conversation.twin_id}?conversation=${conversation.id}`)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8" style={{ color: '#6B7280' }}>
                    <MessageCircle className="h-12 w-12 mx-auto mb-3" style={{ color: '#6B7280', opacity: 0.3 }} />
                    <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>No conversations yet</p>
                    <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Start chatting with a digital twin below!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Available Twins */}
          <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <CardHeader>
              <CardTitle
                className="flex items-center gap-2"
                style={{
                  color: '#141413',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em'
                }}
              >
                <Users className="h-5 w-5" />
                Available Digital Twins
              </CardTitle>
              <CardDescription
                style={{
                  color: '#6B7280',
                  fontFamily: 'var(--_typography---font--tiempos)'
                }}
              >
                Active professor twins you can chat with
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeTwins.length > 0 ? (
                  activeTwins.slice(0, 5).map((twin) => (
                    <div
                      key={twin.id}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{
                        border: '1px solid rgba(20,20,19,0.1)'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(twin.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p
                            className="font-medium text-sm"
                            style={{
                              color: '#141413',
                              fontFamily: 'var(--_typography---font--tiempos)'
                            }}
                          >
                            {twin.name}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {twin.subject_area}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span
                                className="text-xs"
                                style={{
                                  color: '#6B7280',
                                  fontFamily: 'var(--_typography---font--tiempos)'
                                }}
                              >
                                {stats.averageRating}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="btn-anthropic-primary"
                        onClick={() => startNewConversation(twin.id, twin.name)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Chat
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8" style={{ color: '#6B7280' }}>
                    <Users className="h-12 w-12 mx-auto mb-3" style={{ color: '#6B7280', opacity: 0.3 }} />
                    <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>No active twins available</p>
                    <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Check back later for new professors!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Learning Progress */}
        <Card style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2"
              style={{
                color: '#141413',
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                letterSpacing: '-0.02em'
              }}
            >
              <BookOpen className="h-5 w-5" />
              Learning Progress
            </CardTitle>
            <CardDescription
              style={{
                color: '#6B7280',
                fontFamily: 'var(--_typography---font--tiempos)'
              }}
            >
              Track your learning journey across different subjects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {['Mathematics', 'Computer Science', 'Physics'].map((subject, index) => (
                <div key={subject} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: '#141413',
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      {subject}
                    </span>
                    <span
                      className="text-sm"
                      style={{
                        color: '#6B7280',
                        fontFamily: 'var(--_typography---font--tiempos)'
                      }}
                    >
                      {[75, 60, 90][index]}%
                    </span>
                  </div>
                  <Progress value={[75, 60, 90][index]} />
                  <p
                    className="text-xs"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'var(--_typography---font--tiempos)'
                    }}
                  >
                    {['5 conversations', '3 conversations', '7 conversations'][index]} completed
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentDashboard;