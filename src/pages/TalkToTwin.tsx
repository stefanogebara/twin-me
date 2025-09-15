import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageCircle, Star } from 'lucide-react';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-2xl font-bold">Talk to a Twin</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Choose Your Professor Twin</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Select from our collection of AI professor twins, each trained on their real lectures, 
            writings, and teaching style. Start a conversation just like you would with the actual professor.
          </p>
        </div>

        {/* Subject Filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {subjects.map((subject) => (
            <Button
              key={subject}
              variant={selectedSubject === subject ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedSubject(subject)}
              className="rounded-full"
            >
              {subject}
            </Button>
          ))}
        </div>

        {/* Professors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfessors.map((professor) => (
            <Card 
              key={professor.id} 
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] group"
              onClick={() => handleProfessorSelect(professor.id)}
            >
              <CardHeader className="text-center pb-4">
                <div className="relative mx-auto mb-4">
                  <img
                    src={professor.image}
                    alt={professor.name}
                    className="w-24 h-24 rounded-full object-cover mx-auto"
                  />
                  <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-md">
                    <MessageCircle className="w-6 h-6 text-accent" />
                  </div>
                </div>
                <CardTitle className="text-xl">{professor.name}</CardTitle>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{professor.subject}</Badge>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span>{professor.rating}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-3">{professor.university}</p>
                <p className="text-sm mb-4 line-clamp-2">{professor.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {professor.expertise.slice(0, 3).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
                <Button 
                  className="w-full group-hover:bg-accent group-hover:text-accent-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProfessorSelect(professor.id);
                  }}
                >
                  Start Conversation
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;