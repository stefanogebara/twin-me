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
    <div className="min-h-screen bg-slate-900 relative">
      {/* Navigation */}
      <nav className="relative z-50 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-300 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>

            <div 
              className="text-2xl font-serif text-orange-500 cursor-pointer italic"
              onClick={() => navigate('/')}
            >
              Twin Me & <span className="text-white">Artemis</span>
            </div>

            <div className="w-24"></div> {/* Spacer for center alignment */}
          </div>
        </div>
      </nav>

      {/* Illustrated Characters Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Floating musical notes */}
        <div className="absolute top-32 left-16 text-6xl animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}>
          🎵
        </div>
        <div className="absolute top-48 right-20 text-4xl animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }}>
          🎶
        </div>
        <div className="absolute bottom-32 left-32 text-5xl animate-bounce" style={{ animationDelay: '2s', animationDuration: '3.5s' }}>
          🎼
        </div>
        
        {/* Art supplies */}
        <div className="absolute top-64 left-8 text-5xl animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '4s' }}>
          🎨
        </div>
        <div className="absolute bottom-48 right-16 text-4xl animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '3s' }}>
          ✏️
        </div>
        
        {/* Educational items */}
        <div className="absolute top-80 right-32 text-4xl animate-bounce" style={{ animationDelay: '0.8s', animationDuration: '3.8s' }}>
          📚
        </div>
        <div className="absolute bottom-64 left-48 text-3xl animate-bounce" style={{ animationDelay: '2.2s', animationDuration: '4.2s' }}>
          🔬
        </div>

        {/* Illustrated Character - Teacher */}
        <div className="absolute top-40 right-8 w-32 h-40 opacity-30">
          <div className="relative">
            {/* Simple illustrated teacher character */}
            <div className="w-20 h-24 bg-purple-600 rounded-t-full mx-auto"></div>
            <div className="w-16 h-16 bg-orange-400 rounded-full mx-auto -mt-8 border-4 border-purple-600"></div>
            <div className="w-12 h-3 bg-slate-800 rounded-full mx-auto mt-2"></div>
            <div className="w-2 h-2 bg-white rounded-full mx-auto -mt-1"></div>
          </div>
        </div>

        {/* Illustrated Character - Student */}
        <div className="absolute bottom-40 left-8 w-28 h-36 opacity-30">
          <div className="relative">
            {/* Simple illustrated student character */}
            <div className="w-18 h-20 bg-yellow-500 rounded-t-full mx-auto"></div>
            <div className="w-14 h-14 bg-orange-300 rounded-full mx-auto -mt-6 border-4 border-yellow-500"></div>
            <div className="w-10 h-2 bg-slate-800 rounded-full mx-auto mt-2"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-16 pb-16 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Header with AI Icon */}
          <div className="text-center mb-16 relative">
            {/* Animated Background */}
            <div className="absolute inset-0 w-full h-full opacity-20 -z-10">
              <AnimatedBackground />
            </div>
            
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-xl relative z-10">
              <div className="text-4xl">🤖</div>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-serif text-white mb-8 leading-tight italic relative z-10">
              Talk to Your Professor's Twin
            </h1>

            <p className="text-slate-300 mb-12 text-lg font-medium max-w-2xl mx-auto leading-relaxed relative z-10">
              Finally, meet the AI technology passionate about helping 
              students succeed – choose your professor twin and start learning
            </p>
          </div>

          {/* Subject Filter */}
          <div className="flex flex-wrap gap-3 justify-center mb-16">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedSubject === subject
                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg'
                    : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 hover:text-white'
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
                className="relative bg-gradient-to-br from-purple-500 to-purple-700 rounded-3xl p-8 text-white cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 overflow-hidden"
                onClick={() => handleProfessorSelect(professor.id)}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-8 left-8 w-24 h-24 border-2 border-white rounded-full"></div>
                  <div className="absolute top-12 right-8 w-16 h-16 border border-white rounded-full"></div>
                </div>

                {/* Content */}
                <div className="relative z-10">
                  {/* Professor Name Circle */}
                  <div className="w-32 h-32 bg-gradient-to-br from-purple-300 to-purple-400 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple-900">{professor.name.split(' ')[0]}</div>
                      <div className="text-sm font-medium text-purple-800">{professor.name.split(' ')[1]}</div>
                    </div>
                  </div>

                  {/* Professor Avatar (smaller, positioned top right) */}
                  <div className="absolute top-4 right-4 w-16 h-16 rounded-full overflow-hidden border-2 border-white/30">
                    <img
                      src={professor.image}
                      alt={professor.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Professor Details */}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold mb-2">{professor.name}</h3>
                    
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <span className="bg-black/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                        {professor.subject}
                      </span>
                      <div className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">{professor.rating}</span>
                      </div>
                    </div>

                    <p className="text-white/90 text-sm mb-6 leading-relaxed">
                      {professor.description}
                    </p>

                    {/* Expertise Tags */}
                    <div className="flex flex-wrap gap-2 justify-center mb-6">
                      {professor.expertise.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="text-xs bg-white/20 text-white px-3 py-1 rounded-full"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Start Conversation Button */}
                  <button className="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white rounded-full px-8 py-3 font-medium shadow-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Start Conversation
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          <div className="text-center mt-16">
            <button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 py-3 text-lg font-medium shadow-lg transition-all duration-200 hover:scale-105">
              Try Twin Me for Free!
            </button>
            
            {/* Bottom decorative grid like original design */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto opacity-20">
              <div className="aspect-square bg-gradient-to-br from-blue-400 to-cyan-300 rounded-2xl shadow-lg"></div>
              <div className="aspect-square bg-gradient-to-br from-orange-400 to-pink-400 rounded-2xl shadow-lg"></div>
              <div className="aspect-square bg-gradient-to-br from-green-400 to-emerald-300 rounded-2xl shadow-lg"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;