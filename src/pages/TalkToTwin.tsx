import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageCircle, Star, Sparkles, BookOpen, Brain } from 'lucide-react';

const professors = [
  {
    id: 1,
    name: "Dr. Sarah Chen",
    subject: "Computer Science",
    university: "Stanford University",
    expertise: ["Machine Learning", "AI Ethics", "Data Structures"],
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1494790108755-2616c15cb048?w=150&h=150&fit=crop&crop=face",
    description: "Leading expert in machine learning with 15+ years of teaching experience."
  },
  {
    id: 2,
    name: "Prof. Michael Rodriguez",
    subject: "Mathematics",
    university: "MIT",
    expertise: ["Calculus", "Linear Algebra", "Statistics"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
    description: "Passionate mathematician known for making complex concepts accessible."
  },
  {
    id: 3,
    name: "Dr. Emily Johnson",
    subject: "Physics",
    university: "Harvard University",
    expertise: ["Quantum Mechanics", "Thermodynamics", "Astrophysics"],
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    description: "Renowned physicist specializing in quantum mechanics and theoretical physics."
  },
  {
    id: 4,
    name: "Prof. David Kim",
    subject: "Chemistry",
    university: "Caltech",
    expertise: ["Organic Chemistry", "Biochemistry", "Materials Science"],
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    description: "Award-winning chemistry professor with expertise in organic synthesis."
  },
  {
    id: 5,
    name: "Dr. Lisa Thompson",
    subject: "Biology",
    university: "UC Berkeley",
    expertise: ["Genetics", "Cell Biology", "Evolution"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150&h=150&fit=crop&crop=face",
    description: "Molecular biologist with groundbreaking research in genetic engineering."
  },
  {
    id: 6,
    name: "Prof. James Wilson",
    subject: "History",
    university: "Yale University",
    expertise: ["American History", "World Wars", "Political History"],
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face",
    description: "Distinguished historian specializing in 20th century American politics."
  }
];

const TalkToTwin = () => {
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState<string>('All');

  const subjects = ['All', 'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History'];
  
  const filteredProfessors = selectedSubject === 'All' 
    ? professors 
    : professors.filter(prof => prof.subject === selectedSubject);

  const handleProfessorSelect = (professorId: number) => {
    navigate(`/chat/${professorId}`);
  };

  return (
    <div className="min-h-screen bg-hero-gradient relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 liquid-glass rounded-full opacity-30 float" />
        <div className="absolute top-40 right-32 w-20 h-20 liquid-glass rounded-2xl opacity-25 float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-32 left-1/4 w-24 h-24 liquid-glass rounded-3xl opacity-20 float" style={{ animationDelay: '2s' }} />
        
        {/* Educational Icons */}
        <div className="absolute top-1/4 right-1/4 opacity-15 wiggle">
          <BookOpen className="w-16 h-16 text-primary" />
        </div>
        <div className="absolute bottom-1/3 left-1/5 opacity-20 float" style={{ animationDelay: '1.5s' }}>
          <Brain className="w-12 h-12 text-accent-purple" />
        </div>
        <div className="absolute top-1/3 left-1/3 opacity-10 cartoon-bounce">
          <Sparkles className="w-10 h-10 text-accent" />
        </div>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-10 liquid-glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="liquid" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
            <div className="h-6 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-accent-purple to-accent bg-clip-text text-transparent">
              Talk to a Twin
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 liquid-glass px-6 py-3 rounded-full mb-6">
            <Sparkles className="w-5 h-5 text-accent animate-pulse" />
            <span className="text-sm font-medium">AI-Powered Professor Twins</span>
          </div>
          <h2 className="hero-text mb-6">Choose Your Professor Twin</h2>
          <p className="text-xl text-muted-foreground/80 max-w-3xl mx-auto leading-relaxed">
            Select from our collection of AI professor twins, each trained on their real lectures, 
            writings, and teaching style. Start a conversation just like you would with the actual professor.
          </p>
        </div>

        {/* Subject Filter */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {subjects.map((subject) => (
            <Button
              key={subject}
              variant={selectedSubject === subject ? "cartoon" : "liquid"}
              size="sm"
              onClick={() => setSelectedSubject(subject)}
              className="rounded-full px-6 font-semibold"
            >
              {subject}
            </Button>
          ))}
        </div>

        {/* Professors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProfessors.map((professor, index) => (
            <div 
              key={professor.id} 
              className="liquid-glass rounded-3xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group relative overflow-hidden"
              onClick={() => handleProfessorSelect(professor.id)}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Content */}
              <div className="relative z-10">
                <div className="text-center mb-6">
                  <div className="relative mx-auto mb-4 w-28 h-28">
                    <img
                      src={professor.image}
                      alt={professor.name}
                      className="w-28 h-28 rounded-full object-cover mx-auto border-4 border-white/20 group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute -bottom-2 -right-2 liquid-glass rounded-full p-3 shadow-lg">
                      <MessageCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="absolute -top-2 -left-2 liquid-glass rounded-full p-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <Star className="w-4 h-4 text-accent fill-accent" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                    {professor.name}
                  </h3>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
                      {professor.subject}
                    </Badge>
                    <div className="flex items-center gap-1 liquid-glass px-3 py-1 rounded-full">
                      <Star className="w-3 h-3 fill-accent text-accent" />
                      <span className="text-sm font-semibold">{professor.rating}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground/80 font-medium text-center">
                    {professor.university}
                  </p>
                  <p className="text-sm leading-relaxed text-center">
                    {professor.description}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {professor.expertise.slice(0, 3).map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs rounded-full border-primary/20 hover:border-primary/40 transition-colors">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                  <Button 
                    variant="cartoon"
                    className="w-full mt-6 group-hover:scale-105 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProfessorSelect(professor.id);
                    }}
                  >
                    💬 Start Conversation
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;