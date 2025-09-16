import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>

            <div 
              className="text-2xl font-serif text-orange-500 cursor-pointer italic"
              onClick={() => navigate('/')}
            >
              Twin Me & <span className="text-slate-900">Artemis</span>
            </div>

            <div className="w-24"></div> {/* Spacer for center alignment */}
          </div>
        </div>
      </nav>

      {/* Floating Decorative Cards */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-32 left-8 w-32 h-20 bg-white rounded-2xl shadow-lg transform rotate-12 border">
          <div className="p-3 h-full bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 bg-blue-500 rounded-full mx-auto mb-1"></div>
              <div className="text-xs font-medium text-slate-700">AI Tutoring</div>
            </div>
          </div>
        </div>

        <div className="absolute top-48 right-16 w-32 h-20 bg-white rounded-2xl shadow-lg transform -rotate-12 border">
          <div className="p-3 h-full bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 bg-green-500 rounded-full mx-auto mb-1"></div>
              <div className="text-xs font-medium text-slate-700">24/7 Learning</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-64 left-24 w-32 h-20 bg-white rounded-2xl shadow-lg transform rotate-6 border">
          <div className="p-3 h-full bg-gradient-to-br from-pink-50 to-red-50 rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 bg-pink-500 rounded-full mx-auto mb-1"></div>
              <div className="text-xs font-medium text-slate-700">Personal AI</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-32 pb-16 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <p className="text-slate-600 mb-4 font-medium">Choose Your Professor</p>
            
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-serif text-slate-900 mb-8 leading-tight">
              Talk to Your<br />
              <span className="italic">Professor's Twin</span>
            </h1>

            <p className="text-slate-600 mb-12 text-lg font-medium max-w-2xl mx-auto">
              Start learning with AI twins of real professors, trained on their actual teaching style and expertise.
            </p>
          </div>

          {/* Subject Filter */}
          <div className="flex flex-wrap gap-3 justify-center mb-16">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedSubject === subject
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-300 hover:text-orange-500'
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
          <div className="text-center mt-12">
            <button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 py-3 text-lg font-medium shadow-lg transition-colors duration-200">
              View More Professors
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;