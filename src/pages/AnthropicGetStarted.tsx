import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignUp, useAuth } from '@clerk/clerk-react';
import { useToast } from '@/components/ui/use-toast';
import { AcademicHierarchy, AcademicStructure } from '@/components/ui/AcademicHierarchy';
import { Sparkles, User, BookOpen, ArrowLeft, ArrowRight, Users, GraduationCap, Heart, Check, Building2, Book, BarChart3, Award, MessageCircle, Sprout, Rocket, Briefcase } from 'lucide-react';

const AnthropicGetStarted = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [showFeatures, setShowFeatures] = useState<string | null>(null);

  // Check if user completed signup and auto-advance to next step
  useEffect(() => {
    if (isSignedIn && currentPage === 3) {
      setCurrentPage(4);
    }
  }, [isSignedIn, currentPage]);

  const updateProgress = () => {
    return (currentPage / 4) * 100;
  };

  const selectPath = (path: string) => {
    setSelectedPath(path);
    if (path === 'learner') {
      toast({
        title: "Feature Coming Soon",
        description: "Learner dashboard is currently under development. Please check back soon!",
        duration: 5000
      });
      return;
    }
    nextPage();
  };

  const selectType = (type: string) => {
    setSelectedType(type);
    // Show features when a type is selected
    setShowFeatures(type);
  };

  const toggleFeatures = (typeId: string) => {
    setShowFeatures(showFeatures === typeId ? null : typeId);
  };

  const nextPage = () => {
    if (currentPage === 2 && selectedType === 'personal') {
      // Route personal twins to connector onboarding (same as educational)
      navigate('/get-started?type=personal');
      return;
    } else if (currentPage === 2 && selectedType === 'educational') {
      navigate('/get-started');
      return;
    }
    setCurrentPage(currentPage + 1);
  };

  const previousPage = () => {
    setCurrentPage(currentPage - 1);
  };

  const goHome = () => {
    navigate('/');
  };

  const twinTypes = [
    {
      id: 'educational',
      title: 'Educational Twin',
      subtitle: 'For formal teaching',
      badge: 'Institution Verified',
      icon: <GraduationCap className="w-8 h-8" />,
      features: [
        { icon: <Building2 className="w-4 h-4" />, text: 'Universities & schools' },
        { icon: <Book className="w-4 h-4" />, text: 'Course integration' },
        { icon: <BarChart3 className="w-4 h-4" />, text: 'Student analytics' },
        { icon: <Award className="w-4 h-4" />, text: 'Formal methodology' }
      ]
    },
    {
      id: 'personal',
      title: 'Personal Twin',
      subtitle: 'For individual use',
      badge: null,
      icon: <Heart className="w-8 h-8" />,
      features: [
        { icon: <MessageCircle className="w-4 h-4" />, text: 'Share experiences' },
        { icon: <Sprout className="w-4 h-4" />, text: 'Mentorship & coaching' },
        { icon: <Rocket className="w-4 h-4" />, text: 'Personal branding' },
        { icon: <Briefcase className="w-4 h-4" />, text: 'Flexible monetization' }
      ]
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Progress Bar */}
      <div
        className="fixed top-0 left-0 right-0 h-1 z-50"
        style={{ backgroundColor: 'var(--_color-theme---border)' }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${updateProgress()}%`,
            backgroundColor: 'var(--_color-theme---accent)'
          }}
        />
      </div>

      {/* Page 1: Choose Your Path */}
      {currentPage === 1 && (
        <div className="min-h-screen pt-12 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            <button
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-12"
              onClick={goHome}
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>

            <div className="text-center mb-20">
              <h1 className="u-display-xl text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Welcome to Twin Me
              </h1>
              <p className="text-body-large max-w-2xl mx-auto" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                How would you like to use the platform?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
              <div
                className="group rounded-2xl p-12 cursor-pointer transition-all duration-300 shadow-sm border hover:shadow-lg hover:-translate-y-2"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
                onClick={() => selectPath('creator')}
              >
                <div className="w-20 h-20 mx-auto mb-8 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                  <Sparkles className="w-10 h-10" style={{ color: 'var(--_color-theme---accent)' }} />
                </div>
                <h3 className="text-heading text-2xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Create</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  Build a digital twin of yourself for teaching, mentoring, or sharing knowledge with others.
                </p>
              </div>

              <div
                className="group rounded-2xl p-12 cursor-pointer transition-all duration-300 shadow-sm border hover:shadow-lg hover:-translate-y-2"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
                onClick={() => selectPath('learner')}
              >
                <div className="w-20 h-20 mx-auto mb-8 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
                  <Users className="w-10 h-10" style={{ color: 'var(--_color-theme---accent)' }} />
                </div>
                <h3 className="text-heading text-2xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Learn</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                  Access digital twins of educators and experts to enhance your learning journey.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page 2: Twin Type Selection - Beautiful Visual Design */}
      {currentPage === 2 && (
        <div className="min-h-screen pt-12 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            <button
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-12"
              onClick={previousPage}
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="text-center mb-20">
              <h1 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Choose Your Twin Type
              </h1>
              <p className="text-body-large max-w-3xl mx-auto" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                Each twin type is designed for different use cases. You can create multiple twins later.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
              {twinTypes.map((type) => (
                <div
                  key={type.id}
                  className={`relative rounded-2xl p-8 border-2 cursor-pointer transition-all duration-300 group hover:shadow-xl hover:scale-105 ${
                    selectedType === type.id ? 'shadow-lg' : 'hover:shadow-lg'
                  }`}
                  style={{
                    backgroundColor: 'var(--_color-theme---surface)',
                    borderColor: selectedType === type.id
                      ? 'var(--_color-theme---accent)'
                      : 'var(--_color-theme---border)',
                    boxShadow: selectedType === type.id
                      ? '0 10px 40px rgba(0,0,0,0.1)'
                      : ''
                  }}
                  onClick={() => selectType(type.id)}
                >

                  {/* Selection Indicator */}
                  {selectedType === type.id && (
                    <div className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                      <Check className="w-4 h-4" />
                    </div>
                  )}

                  {/* Icon */}
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
                    <div style={{ color: 'var(--_color-theme---accent)' }}>
                      {type.icon}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="text-center mb-6">
                    <h3 className="text-heading text-xl font-medium mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>{type.title}</h3>
                    <p className="text-body text-sm mb-4" style={{ color: 'var(--_color-theme---text-secondary)' }}>{type.subtitle}</p>

                    {type.badge && (
                      <div
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white mb-4"
                        style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                      >
                        {type.badge}
                      </div>
                    )}

                    {/* Progressive disclosure - show details button */}
                    {!showFeatures && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatures(type.id);
                        }}
                        className="text-xs underline hover:opacity-70 transition-opacity focus:outline-none focus:ring-1 focus:ring-opacity-50 rounded px-2 py-1"
                        style={{ color: 'var(--_color-theme---accent)' }}
                        aria-label={`Show details for ${type.title}`}
                      >
                        Show details
                      </button>
                    )}
                  </div>

                  {/* Features - Progressive Disclosure */}
                  {showFeatures === type.id && (
                    <div className="space-y-3 animate-[fadeIn_0.3s_ease-in-out]">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-medium" style={{ color: 'var(--_color-theme---text)' }}>Key Features</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFeatures(type.id);
                          }}
                          className="text-xs underline hover:opacity-70 transition-opacity focus:outline-none focus:ring-1 focus:ring-opacity-50 rounded px-2 py-1"
                          style={{ color: 'var(--_color-theme---accent)' }}
                          aria-label={`Hide details for ${type.title}`}
                        >
                          Hide details
                        </button>
                      </div>
                      {type.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---surface-raised)', color: 'var(--_color-theme---accent)' }}>
                            {feature.icon}
                          </div>
                          <span className="text-body text-sm" style={{ color: 'var(--_color-theme---text)' }}>{feature.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* When no features shown, show summary info */}
                  {showFeatures !== type.id && (
                    <div className="text-center pt-4 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                      <span className="text-xs" style={{ color: 'var(--_color-theme---text-secondary)' }}>Perfect for {type.id === 'educational' ? 'institutions & formal teaching' : 'personal coaching & mentoring'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedType && (
              <div className="text-center mt-20 animate-[fadeIn_0.5s_ease]">
                <div className="space-y-6">
                  <button
                    onClick={nextPage}
                    className="btn-anthropic-primary text-lg px-12 py-4 flex items-center gap-3 mx-auto rounded-xl transition-all hover:scale-105"
                    style={{
                      backgroundColor: 'var(--_color-theme---accent)',
                      color: 'white',
                      boxShadow: '0 4px 20px rgba(217, 119, 6, 0.3)'
                    }}
                  >
                    Continue with {twinTypes.find(t => t.id === selectedType)?.title}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  <p className="text-body text-sm" style={{ color: 'var(--_color-theme---text-secondary)' }}>
                    You can create additional twin types later
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page 3: Institution Setup (if educational) - Skipped for now */}
      {/* Page 4: Completion - Redirect handled in nextPage function */}
    </div>
  );
};

export default AnthropicGetStarted;