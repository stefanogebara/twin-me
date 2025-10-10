import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HelpCircle, BookOpen, MessageCircle, Code, ChevronDown, ChevronUp,
  Sparkles, Shield, Database, Zap, Users, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const Help: React.FC = () => {
  const navigate = useNavigate();
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('getting-started');

  const faqItems: FAQItem[] = [
    {
      question: 'What is Soul Signature Platform?',
      answer: 'Soul Signature Platform (TwinMe) creates authentic digital twins by capturing your true originality through your digital footprints. Unlike traditional cloning that focuses on public information, we discover what makes you genuinely YOU through your personal choices, curiosities, and authentic patterns.',
      category: 'getting-started'
    },
    {
      question: 'How does the platform protect my privacy?',
      answer: 'We use granular privacy controls with intensity sliders (0-100%) for every life cluster. You have complete control over what data is collected, analyzed, and shared. All data is encrypted, and you can export or delete your data at any time. We never share your data without explicit permission.',
      category: 'privacy'
    },
    {
      question: 'What platforms can I connect?',
      answer: 'We support 30+ platforms including Spotify, Netflix, YouTube, GitHub, Discord, Slack, Gmail, Calendar, LinkedIn, and more. Entertainment platforms reveal your personal soul, while professional tools capture your work identity.',
      category: 'getting-started'
    },
    {
      question: 'How does soul signature extraction work?',
      answer: 'Our AI analyzes your digital footprints to identify authentic patterns in your behavior, preferences, and communication style. We extract personality traits (Big Five), communication patterns, humor style, and uniqueness markers to create a comprehensive soul signature.',
      category: 'extraction'
    },
    {
      question: 'What is the uniqueness score?',
      answer: 'The uniqueness score (0-100%) measures how distinct your personality profile is from average patterns. It considers vocabulary richness, personality trait variance, communication style, and confidence in the analysis. Higher scores indicate more distinctive patterns.',
      category: 'extraction'
    },
    {
      question: 'Can I chat with my digital twin?',
      answer: 'Yes! Once you\'ve extracted your soul signature, you can interact with your digital twin through RAG-powered chat. Your twin responds based on your authentic personality profile and communication patterns.',
      category: 'features'
    },
    {
      question: 'What are life clusters?',
      answer: 'Life clusters organize your data into Personal Soul (entertainment, hobbies, social), Professional Identity (work, communication, skills), and Creative Expression (artistic, content creation). Each cluster has separate privacy controls.',
      category: 'features'
    },
    {
      question: 'How do I disconnect a platform?',
      answer: 'Go to Settings → Connected Platforms, select the platform you want to disconnect, and click "Revoke Access". This immediately stops data collection and removes stored access tokens.',
      category: 'account'
    },
    {
      question: 'Can I export my data?',
      answer: 'Yes, absolutely! Go to Settings → Data Export to download all your collected data, analysis results, and soul signature profiles in JSON format. You own your data.',
      category: 'account'
    },
    {
      question: 'What is the browser extension for?',
      answer: 'The browser extension captures data from platforms that don\'t provide public APIs (like Netflix watch history, HBO viewing patterns). It only collects data you explicitly authorize.',
      category: 'features'
    }
  ];

  const categories = [
    { id: 'getting-started', label: 'Getting Started', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'features', label: 'Features', icon: <Zap className="w-4 h-4" /> },
    { id: 'extraction', label: 'Soul Extraction', icon: <Database className="w-4 h-4" /> },
    { id: 'privacy', label: 'Privacy & Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'account', label: 'Account Management', icon: <Settings className="w-4 h-4" /> }
  ];

  const filteredFAQs = activeCategory === 'all'
    ? faqItems
    : faqItems.filter(faq => faq.category === activeCategory);

  const toggleFAQ = (index: number) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <HelpCircle className="w-10 h-10" style={{ color: '#D97706' }} />
            <h1
              className="text-5xl font-medium"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                letterSpacing: '-0.02em',
                color: 'hsl(var(--claude-text))'
              }}
            >
              Help & Documentation
            </h1>
          </div>
          <p
            className="text-lg max-w-3xl mx-auto"
            style={{
              fontFamily: 'var(--_typography---font--tiempos)',
              color: 'hsl(var(--claude-text-muted))'
            }}
          >
            Everything you need to know about creating and managing your authentic digital twin
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card
            className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
            onClick={() => navigate('/soul-dashboard')}
          >
            <BookOpen className="w-8 h-8 mb-4" style={{ color: '#D97706' }} />
            <h3
              className="text-xl mb-2"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                color: 'hsl(var(--claude-text))'
              }}
            >
              Getting Started Guide
            </h3>
            <p
              className="text-sm"
              style={{
                fontFamily: 'var(--_typography---font--tiempos)',
                color: 'hsl(var(--claude-text-muted))'
              }}
            >
              Learn how to extract your soul signature and connect platforms
            </p>
          </Card>

          <Card
            className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
            onClick={() => window.open('https://github.com/anthropics/twin-ai-learn', '_blank')}
          >
            <Code className="w-8 h-8 mb-4" style={{ color: '#D97706' }} />
            <h3
              className="text-xl mb-2"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                color: 'hsl(var(--claude-text))'
              }}
            >
              API Documentation
            </h3>
            <p
              className="text-sm"
              style={{
                fontFamily: 'var(--_typography---font--tiempos)',
                color: 'hsl(var(--claude-text-muted))'
              }}
            >
              Integrate with our API or contribute to the project
            </p>
          </Card>

          <Card
            className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
            style={{
              backgroundColor: 'hsl(var(--claude-surface))',
              border: '1px solid hsl(var(--claude-border))'
            }}
            onClick={() => navigate('/contact')}
          >
            <MessageCircle className="w-8 h-8 mb-4" style={{ color: '#D97706' }} />
            <h3
              className="text-xl mb-2"
              style={{
                fontFamily: 'var(--_typography---font--styrene-a)',
                fontWeight: 500,
                color: 'hsl(var(--claude-text))'
              }}
            >
              Contact Support
            </h3>
            <p
              className="text-sm"
              style={{
                fontFamily: 'var(--_typography---font--tiempos)',
                color: 'hsl(var(--claude-text-muted))'
              }}
            >
              Get help from our team or join the community
            </p>
          </Card>
        </div>

        {/* Core Features Overview */}
        <div className="mb-12">
          <h2
            className="text-3xl mb-6"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'hsl(var(--claude-text))'
            }}
          >
            Core Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card
              className="p-6"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    Soul Signature Extraction
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Our AI analyzes your digital footprint across 30+ platforms to discover your authentic personality patterns, communication style, and unique characteristics. Get insights into your Big Five personality traits, humor style, and communication patterns.
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-6"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    Privacy Controls
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Granular intensity sliders (0-100%) for every life cluster. Control exactly what data is revealed and to whom. Different privacy settings for different audiences. Complete transparency with data export and deletion capabilities.
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-6"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    Digital Twin Chat
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Interact with your digital twin powered by RAG (Retrieval-Augmented Generation). Your twin responds based on your authentic personality profile, communication patterns, and soul signature. Ask questions and get responses that sound like you.
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className="p-6"
              style={{
                backgroundColor: 'hsl(var(--claude-surface))',
                border: '1px solid hsl(var(--claude-border))'
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Database className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3
                    className="text-lg mb-2"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500,
                      color: 'hsl(var(--claude-text))'
                    }}
                  >
                    Platform Connectors
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    Connect 30+ platforms including Spotify, Netflix, YouTube, GitHub, Discord, Slack, Gmail, and more. Secure OAuth integration with automatic token refresh. Entertainment platforms reveal personal soul, professional tools capture work identity.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* FAQ Section */}
        <div>
          <h2
            className="text-3xl mb-6"
            style={{
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'hsl(var(--claude-text))'
            }}
          >
            Frequently Asked Questions
          </h2>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((category) => (
              <Button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                variant={activeCategory === category.id ? 'default' : 'outline'}
                className="text-sm"
                style={{
                  backgroundColor: activeCategory === category.id ? '#D97706' : 'transparent',
                  color: activeCategory === category.id ? 'white' : '#141413',
                  border: activeCategory === category.id ? 'none' : '1px solid rgba(20,20,19,0.1)',
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  fontWeight: 500
                }}
              >
                {category.icon}
                <span className="ml-2">{category.label}</span>
              </Button>
            ))}
          </div>

          {/* FAQ Items */}
          <div className="space-y-4">
            {filteredFAQs.map((faq, index) => (
              <Card
                key={index}
                className="overflow-hidden"
                style={{
                  backgroundColor: 'hsl(var(--claude-surface))',
                  border: '1px solid hsl(var(--claude-border))'
                }}
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full p-6 text-left flex items-center justify-between"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Badge
                      className="mt-1"
                      style={{
                        backgroundColor: '#D97706',
                        color: 'white',
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      Q
                    </Badge>
                    <h3
                      className="text-lg flex-1"
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)',
                        fontWeight: 500,
                        color: 'hsl(var(--claude-text))'
                      }}
                    >
                      {faq.question}
                    </h3>
                  </div>
                  {expandedFAQ === index ? (
                    <ChevronUp className="w-5 h-5 flex-shrink-0" style={{ color: '#D97706' }} />
                  ) : (
                    <ChevronDown className="w-5 h-5 flex-shrink-0" style={{ color: '#6B7280' }} />
                  )}
                </button>

                {expandedFAQ === index && (
                  <div
                    className="px-6 pb-6 pl-16"
                    style={{
                      fontFamily: 'var(--_typography---font--tiempos)',
                      color: 'hsl(var(--claude-text-muted))'
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-12 flex justify-center gap-4">
          <Button
            onClick={() => navigate('/soul-dashboard')}
            style={{
              backgroundColor: '#D97706',
              color: 'white',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Go to Soul Dashboard
          </Button>
          <Button
            onClick={() => navigate('/contact')}
            variant="outline"
            style={{
              border: '2px solid #D97706',
              color: '#D97706',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500
            }}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Help;
