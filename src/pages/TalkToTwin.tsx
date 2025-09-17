import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageCircle, Star } from 'lucide-react';
import { Component as AnimatedBackground } from '@/components/ui/open-ai-codex-animated-background';

const professors = [
  {
    id: 1,
    name: "Dr. Sarah Chen",
    subject: "Corporate Finance",
    university: "Stanford University",
    expertise: ["Financial Analysis", "Investment Banking", "Risk Management"],
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1494790108755-2616c15cb048?w=150&h=150&fit=crop&crop=face",
    description: "Leading expert in corporate finance with 15+ years of teaching experience."
  },
  {
    id: 2,
    name: "Prof. Michael Rodriguez",
    subject: "Statistics",
    university: "MIT",
    expertise: ["Business Analytics", "Data Science", "Predictive Modeling"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
    description: "Passionate statistician known for making complex data concepts accessible."
  },
  {
    id: 3,
    name: "Dr. Emily Johnson",
    subject: "Macroeconomics",
    university: "Harvard University",
    expertise: ["Economic Policy", "Global Markets", "Monetary Theory"],
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    description: "Renowned economist specializing in macroeconomic theory and policy."
  },
  {
    id: 4,
    name: "Prof. David Kim",
    subject: "Blocktech",
    university: "Caltech",
    expertise: ["Blockchain", "Cryptocurrency", "Smart Contracts"],
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    description: "Award-winning blockchain professor with expertise in distributed systems."
  },
  {
    id: 5,
    name: "Dr. Lisa Thompson",
    subject: "Business Driven Technologies",
    university: "UC Berkeley",
    expertise: ["Digital Transformation", "Enterprise Systems", "Tech Strategy"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150&h=150&fit=crop&crop=face",
    description: "Technology strategist with groundbreaking research in business applications."
  },
  {
    id: 6,
    name: "Prof. James Wilson",
    subject: "Marketing Management",
    university: "Yale University",
    expertise: ["Brand Strategy", "Digital Marketing", "Consumer Behavior"],
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face",
    description: "Distinguished marketing professor specializing in modern brand management."
  }
];

const TalkToTwin = () => {
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState<string>('All');

  const subjects = ['All', 'Corporate Finance', 'Statistics', 'Macroeconomics', 'Blocktech', 'Business Driven Technologies', 'Marketing Management'];
  
  const filteredProfessors = selectedSubject === 'All' 
    ? professors 
    : professors.filter(prof => prof.subject === selectedSubject);

  const handleProfessorSelect = (professorId: number) => {
    navigate(`/chat/${professorId}`);
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Navigation - Match home page style */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {/* Left - Back Button */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-foreground hover:text-primary"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>

            {/* Center Logo */}
            <div 
              className="text-2xl font-serif cursor-pointer"
              onClick={() => navigate('/')}
            >
              <span className="text-primary italic">Twin Me</span>
            </div>

            {/* Right - Spacer */}
            <div className="w-24"></div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-6 relative">
        <div className="max-w-[1440px] mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="w-16 h-16 mx-auto mb-8 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center transform rotate-3">
              <MessageCircle className="w-8 h-8 text-card" />
            </div>
            
            <h1 className="text-6xl md:text-7xl font-serif text-foreground mb-8 leading-tight italic">
              Talk to Your Professor's Twin
            </h1>

            <p className="text-muted-foreground mb-12 text-lg font-medium max-w-2xl mx-auto leading-relaxed">
              Choose your professor twin and start learning with personalized AI assistance
            </p>
          </div>

          {/* Subject Filter */}
          <div className="flex flex-wrap gap-3 justify-center mb-16">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`px-6 py-3 rounded-full text-sm font-medium font-serif transition-all duration-200 ${
                  selectedSubject === subject
                    ? 'bg-primary hover:bg-primary/90 text-white shadow-lg'
                    : 'bg-card text-foreground border border-border hover:bg-muted'
                }`}
              >
                {subject}
              </button>
            ))}
          </div>

          {/* Professors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {filteredProfessors.slice(0, 4).map((professor, index) => (
              <div
                key={professor.id}
                className="artemis-card cursor-pointer group transition-all duration-300 hover:scale-[1.02] hover:rotate-1 relative overflow-hidden"
                onClick={() => handleProfessorSelect(professor.id)}
              >
                {/* Decorative Background Elements */}
                <div className="absolute inset-0 opacity-5">
                  <div className="absolute top-8 left-8 w-20 h-20 border-2 border-primary rounded-full"></div>
                  <div className="absolute bottom-8 right-8 w-16 h-16 border border-accent rounded-full"></div>
                </div>

                {/* Content */}
                <div className="relative z-10">
                  {/* Professor Name Circle */}
                  <div className="w-32 h-32 bg-gradient-to-br from-primary/10 to-accent/10 border-2 border-primary/20 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <div className="text-center">
                      <div className="text-lg font-bold text-foreground">{professor.name.split(' ')[0]}</div>
                      <div className="text-sm font-medium text-muted-foreground">{professor.name.split(' ')[1]}</div>
                    </div>
                  </div>

                  {/* Professor Avatar */}
                  <div className="absolute top-6 right-6 w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20">
                    <img
                      src={professor.image}
                      alt={professor.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Professor Details */}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-serif text-foreground mb-2 italic">{professor.name}</h3>
                    
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <span className="bg-accent/10 text-accent px-3 py-1 rounded-full text-sm font-medium border border-accent/20">
                        {professor.subject}
                      </span>
                      <div className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                        <Star className="w-4 h-4 fill-primary text-primary" />
                        <span className="text-sm font-medium">{professor.rating}</span>
                      </div>
                    </div>

                    <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                      {professor.description}
                    </p>

                    {/* Expertise Tags */}
                    <div className="flex flex-wrap gap-2 justify-center mb-6">
                      {professor.expertise.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full border"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Start Conversation Button */}
                  <button className="w-full artemis-btn-primary font-serif flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Start Conversation
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center mt-16">
            <Button 
              className="artemis-btn-primary font-serif text-lg px-10 py-4"
              onClick={() => navigate('/auth')}
            >
              Try Twin Me for Free!
            </Button>
            
            {/* Decorative Elements - Artemis Style */}
            <div className="mt-16 grid grid-cols-3 gap-6 max-w-md mx-auto">
              <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl shadow-lg hover:scale-105 transition-transform duration-300"></div>
              <div className="aspect-square bg-gradient-to-br from-accent/20 to-primary/20 rounded-2xl shadow-lg hover:scale-105 transition-transform duration-300"></div>
              <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl shadow-lg hover:scale-105 transition-transform duration-300"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;