import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Star, GraduationCap, Search } from 'lucide-react';

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
    subject: "Blockchain Technology",
    university: "Caltech",
    expertise: ["Blockchain", "Cryptocurrency", "Smart Contracts"],
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    description: "Award-winning blockchain professor with expertise in distributed systems."
  },
  {
    id: 5,
    name: "Dr. Lisa Thompson",
    subject: "Business Technology",
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
  const [searchTerm, setSearchTerm] = useState('');

  const subjects = ['All', 'Corporate Finance', 'Statistics', 'Macroeconomics', 'Blockchain Technology', 'Business Technology', 'Marketing Management'];

  const filteredProfessors = professors.filter(prof => {
    const matchesSubject = selectedSubject === 'All' || prof.subject === selectedSubject;
    const matchesSearch = prof.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         prof.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         prof.university.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSubject && matchesSearch;
  });

  const handleProfessorSelect = (professorId: number) => {
    navigate(`/chat/${professorId}`);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Navigation */}
      <div className="sticky top-0 z-50 backdrop-blur-sm border-b" style={{ backgroundColor: 'var(--_color-theme---background)/90', borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/get-started')}
                className="px-6 py-2 rounded-lg font-medium border transition-colors"
                style={{
                  borderColor: 'var(--_color-theme---border)',
                  color: 'var(--_color-theme---text)',
                  backgroundColor: 'transparent'
                }}
              >
                Create Your Twin
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-16 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
              <MessageCircle className="w-10 h-10" style={{ color: 'var(--_color-theme---accent)' }} />
            </div>

            <h1 className="u-display-xl text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Talk to Professor Twins
            </h1>

            <p className="text-body-large max-w-3xl mx-auto mb-12" style={{ color: 'var(--_color-theme---text-muted)' }}>
              Choose from our collection of AI professor twins and start learning with personalized assistance that matches each educator's unique teaching style.
            </p>

            {/* Search Bar */}
            <div className="max-w-lg mx-auto mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--_color-theme---text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by professor, subject, or university..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border transition-colors focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'var(--_color-theme---border)',
                    backgroundColor: 'white',
                    color: 'var(--_color-theme---text)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Subject Filter */}
          <div className="flex flex-wrap gap-3 justify-center mb-16">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  selectedSubject === subject ? '' : 'border'
                }`}
                style={selectedSubject === subject ? {
                  backgroundColor: 'var(--_color-theme---accent)',
                  color: 'white'
                } : {
                  borderColor: 'var(--_color-theme---border)',
                  color: 'var(--_color-theme---text)',
                  backgroundColor: 'white'
                }}
              >
                {subject}
              </button>
            )}
          </div>

          {/* Professors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProfessors.map((professor) => (
              <div
                key={professor.id}
                className="rounded-2xl p-6 border cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                style={{ backgroundColor: 'white', borderColor: 'var(--_color-theme---border)' }}
                onClick={() => handleProfessorSelect(professor.id)}
              >
                {/* Professor Avatar and Info */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: 'var(--_color-theme---accent)' }}>
                    <img
                      src={professor.image}
                      alt={professor.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-heading text-lg font-medium mb-1" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                      {professor.name}
                    </h3>
                    <p className="text-body text-sm mb-2" style={{ color: 'var(--_color-theme---text-muted)' }}>
                      {professor.university}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--_color-theme---surface-raised)', color: 'var(--_color-theme---accent)' }}>
                        {professor.subject}
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-current" style={{ color: 'var(--_color-theme---accent)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--_color-theme---text)' }}>{professor.rating}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-body text-sm leading-relaxed mb-4" style={{ color: 'var(--_color-theme---text-muted)' }}>
                  {professor.description}
                </p>

                {/* Expertise Tags */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {professor.expertise.slice(0, 3).map((skill) => (
                    <span
                      key={skill}
                      className="text-xs px-2 py-1 rounded-lg border"
                      style={{
                        borderColor: 'var(--_color-theme---border)',
                        color: 'var(--_color-theme---text-muted)',
                        backgroundColor: 'var(--_color-theme---background)'
                      }}
                    >
                      {skill}
                    </span>
                  )}
                </div>

                {/* Start Conversation Button */}
                <button className="w-full px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'var(--_color-theme---accent)',
                    color: 'white'
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Start Conversation
                </button>
              </div>
            )}
          </div>

          {/* Empty State */}
          {filteredProfessors.length === 0 && (
            <div className="text-center py-16">
              <GraduationCap className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--_color-theme---text-muted)' }} />
              <h3 className="text-heading text-xl font-medium mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                No professors found
              </h3>
              <p className="text-body" style={{ color: 'var(--_color-theme---text-muted)' }}>
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}

          {/* CTA Section */}
          <div className="text-center mt-20 pt-16 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <h2 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Want to Create Your Own Twin?
            </h2>
            <p className="text-body-large max-w-2xl mx-auto mb-8" style={{ color: 'var(--_color-theme---text-muted)' }}>
              Join thousands of educators who are already using AI twins to enhance their teaching and reach more students.
            </p>
            <button
              className="px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:scale-105"
              style={{
                backgroundColor: 'var(--_color-theme---accent)',
                color: 'white'
              }}
              onClick={() => navigate('/get-started')}
            >
              Create Your Twin Today
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TalkToTwin;