import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
    if (currentPage < 4) {
      setCurrentPage(currentPage + 1);
    }
  };

  const startBuilding = () => {
    if (selectedType === 'personal') {
      navigate('/get-started?type=personal');
    } else {
      navigate('/get-started');
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    } else {
      navigate('/');
    }
  };

  const twinTypes = [
    {
      id: 'educational',
      title: 'Educational Twin',
      subtitle: 'For teachers, professors, and educational institutions',
      icon: <GraduationCap className="w-8 h-8" />,
      features: [
        { icon: <BookOpen className="w-4 h-4" />, text: 'Course content delivery' },
        { icon: <Users className="w-4 h-4" />, text: 'Student Q&A support' },
        { icon: <BarChart3 className="w-4 h-4" />, text: 'Learning analytics' },
        { icon: <Award className="w-4 h-4" />, text: 'Assessment tools' }
      ]
    },
    {
      id: 'personal',
      title: 'Personal Twin',
      subtitle: 'For individuals, coaches, and personal mentoring',
      icon: <User className="w-8 h-8" />,
      features: [
        { icon: <MessageCircle className="w-4 h-4" />, text: 'Personal conversations' },
        { icon: <Heart className="w-4 h-4" />, text: 'Emotional support' },
        { icon: <Sprout className="w-4 h-4" />, text: 'Personal growth' },
        { icon: <Rocket className="w-4 h-4" />, text: 'Goal achievement' }
      ]
    }
  ];

  // Changed from black background to white background using var(--_color-theme---background)
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Progress Bar */}
      <div className="w-full h-1 fixed top-0 z-50"
        style={{ backgroundColor: 'var(--_color-theme---border)' }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            backgroundColor: 'var(--_color-theme---accent)'
          }}
          style={{ width: `${updateProgress()}%` }}
        ></div>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-sm border-b" style={{ backgroundColor: 'var(--_color-theme---background)/90', borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={prevPage}
              className="flex items-center gap-2 text-sm hover:opacity-70 transition-all hover:scale-105 px-3 py-2 rounded-lg"
              style={{ color: 'var(--_color-theme---text)', backgroundColor: 'var(--_color-theme---surface)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {currentPage > 1 ? 'Back' : 'Home'}
            </button>

            <div className="text-center">
              <h1
                className="text-xl font-bold"
                style={{
                  fontFamily: 'var(--_typography---font--styrene-a)',
                  color: 'var(--_color-theme---text)'
                }}
              >
                Get Started
              </h1>
            </div>

            <div className="w-20"></div>
          </div>
        </div>
      </div>

      {/* Page 1: Choose Path */}
      {currentPage === 1 && (
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="u-display-xl text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Welcome to Twin AI Learn
            </h1>
            <p className="text-body-large max-w-2xl mx-auto" style={{ color: 'var(--_color-theme---text-muted)' }}>
              Create your AI twin and revolutionize how you teach or learn. Choose your path below.
            </p>

            <div className="grid md:grid-cols-2 gap-8 mt-12 max-w-2xl mx-auto">
              <button
                onClick={() => selectPath('creator')}
                className="group relative p-8 rounded-3xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
              >
                <div className="w-20 h-20 mx-auto mb-8 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
                  <Sparkles className="w-10 h-10" style={{ color: 'var(--_color-theme---accent)' }} />
                </div>
                <h3 className="text-heading text-2xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Create</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text-muted)' }}>
                  Build an AI twin of yourself to teach, mentor, or share your knowledge with others.
                </p>
              </button>

              <button
                onClick={() => selectPath('learner')}
                className="group relative p-8 rounded-3xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
                style={{
                  backgroundColor: 'var(--_color-theme---surface)',
                  borderColor: 'var(--_color-theme---border)'
                }}
              >
                <div className="w-20 h-20 mx-auto mb-8 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
                  <Users className="w-10 h-10" style={{ color: 'var(--_color-theme---accent)' }} />
                </div>
                <h3 className="text-heading text-2xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Learn</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text-muted)' }}>
                  Connect with AI twins of teachers, experts, and mentors to accelerate your learning.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page 2: Choose Twin Type */}
      {currentPage === 2 && (
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                <Check className="w-4 h-4" /> Creator Path Selected
              </div>
              <h1 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Choose Your Twin Type
              </h1>
              <p className="text-body-large max-w-3xl mx-auto" style={{ color: 'var(--_color-theme---text-muted)' }}>
                Select the type of AI twin that best matches your goals and use case.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {twinTypes.map((type) => (
                <div key={type.id} className="relative">
                  <button
                    onClick={() => selectType(type.id)}
                    className={`group relative w-full p-8 rounded-3xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 ${selectedType === type.id ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: 'var(--_color-theme---surface)',
                      borderColor: selectedType === type.id
                        ? 'var(--_color-theme---accent)'
                        : 'var(--_color-theme---border)',
                      ringColor: selectedType === type.id ? 'var(--_color-theme---accent)' : 'transparent'
                    }}
                  >
                    {selectedType === type.id && (
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                        <Check className="w-4 h-4" />
                      </div>
                    )}

                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: 'var(--_color-theme---surface-raised)' }}>
                        <div style={{ color: 'var(--_color-theme---accent)' }}>
                          {type.icon}
                        </div>
                      </div>

                      <h3 className="text-heading text-xl font-medium mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>{type.title}</h3>
                      <p className="text-body text-sm mb-4" style={{ color: 'var(--_color-theme---text-muted)' }}>{type.subtitle}</p>

                      {selectedType === type.id && (
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white mb-4"
                          style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                        >
                          <Check className="w-3 h-3" />
                          Selected
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatures(type.id);
                        }}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--_color-theme---accent)' }}
                      >
                        {showFeatures === type.id ? 'Hide Features' : 'View Features'}
                      </button>

                      {showFeatures === type.id && (
                        <div className="mt-4 pt-4 border-t text-left" style={{ borderColor: 'var(--_color-theme---border)' }}>
                          <span className="text-xs font-medium" style={{ color: 'var(--_color-theme---text)' }}>Key Features</span>
                          <div className="mt-2 space-y-2">
                            {type.features.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center"
                                  style={{ color: 'var(--_color-theme---accent)' }}
                                >
                                  {feature.icon}
                                </div>
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---surface-raised)', color: 'var(--_color-theme---accent)' }}>
                                  {feature.icon}
                                </div>
                                <span className="text-body text-sm" style={{ color: 'var(--_color-theme---text)' }}>{feature.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-center pt-4 border-t" style={{ borderColor: 'var(--_color-theme---border)' }}>
                        <span className="text-xs" style={{ color: 'var(--_color-theme---text-muted)' }}>Perfect for {type.id === 'educational' ? 'institutions & formal teaching' : 'personal coaching & mentoring'}</span>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>

            {selectedType && (
              <div className="text-center mt-12">
                <button
                  onClick={nextPage}
                  className="btn-anthropic-primary flex items-center gap-2 mx-auto text-lg px-8 py-4"
                  style={{
                    backgroundColor: 'var(--_color-theme---accent)',
                    color: 'white'
                  }}
                >
                  <ArrowRight className="w-5 h-5" />
                  Continue to Setup
                </button>
                <p className="text-body text-sm" style={{ color: 'var(--_color-theme---text-muted)' }}>
                  Next: Account creation and twin configuration
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page 3: Account Setup */}
      {currentPage === 3 && (
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                <User className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Create Your Account
              </h1>
              <p className="text-body" style={{ color: 'var(--_color-theme---text-muted)' }}>
                Sign up to start building your AI twin
              </p>
            </div>

            <div className="bg-white rounded-2xl border p-6" style={{ backgroundColor: 'var(--_color-theme---surface)', borderColor: 'var(--_color-theme---border)' }}>
              <SignUp
                appearance={{
                  elements: {
                    formButtonPrimary: 'bg-[#d97706] hover:bg-[#b45309] text-white',
                  }
                }}
                redirectUrl="/get-started?step=4"
              />
            </div>
          </div>
        </div>
      )}

      {/* Page 4: Success */}
      {currentPage === 4 && isSignedIn && (
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-24 h-24 mx-auto mb-8 rounded-full flex items-center justify-center animate-bounce" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
              <Check className="w-12 h-12 text-white" />
            </div>

            <h1 className="text-3xl font-bold mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Welcome Aboard! 🎉
            </h1>

            <p className="text-lg mb-8" style={{ color: 'var(--_color-theme---text-muted)' }}>
              Your account is ready. Let's start building your {selectedType === 'personal' ? 'Personal' : 'Educational'} AI Twin.
            </p>

            <button
              onClick={startBuilding}
              className="btn-anthropic-primary text-lg px-8 py-4"
              style={{
                backgroundColor: 'var(--_color-theme---accent)',
                color: 'white'
              }}
            >
              Start Building My Twin
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnthropicGetStarted;