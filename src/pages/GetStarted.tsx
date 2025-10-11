import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { AcademicHierarchy, AcademicStructure } from '@/components/ui/AcademicHierarchy';
import EnhancedFileUpload from '@/components/ui/EnhancedFileUpload';
import { ThemeToggle } from '../components/ThemeToggle';

const GetStarted = () => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [twinName, setTwinName] = useState('');
  const [academicStructure, setAcademicStructure] = useState<AcademicStructure | null>(null);
  const [teachingLevel, setTeachingLevel] = useState('');

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
  };

  const nextPage = () => {
    if (currentPage === 2 && selectedType === 'personal') {
      // Skip the teacher setup page for personal twins
      navigate('/personal-twin-builder');
    } else if (currentPage < 4) {
      setCurrentPage(currentPage + 1);
    }
  };

  const previousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToBuilder = () => {
    if (selectedType === 'personal') {
      navigate('/personal-twin-builder');
    } else {
      navigate('/twin-builder');
    }
  };

  const goHome = () => {
    navigate('/');
  };

  const skipToBuilder = () => {
    console.log('Skip to builder clicked, selectedType:', selectedType);
    if (selectedType === 'personal') {
      navigate('/personal-twin-builder');
    } else {
      navigate('/twin-builder');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6 bg-background border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-2xl text-foreground" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
              Twin Me
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={goHome}
                className="font-medium text-foreground hover:text-primary transition-colors"
                style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
              >
                Home
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              className="btn-anthropic-primary"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="fixed top-[80px] left-0 right-0 h-1 z-[40]" style={{ backgroundColor: 'rgba(20,20,19,0.1)' }}>
        <div className="h-full" style={{ backgroundColor: '#D97706', width: `${updateProgress()}%` }}></div>
      </div>
      
      {/* Page 1: Choose Your Path */}
      {currentPage === 1 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6">
          <button className="inline-flex items-center gap-2 text-sm mb-8" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }} onClick={goHome}>
            ← Back to Home
          </button>
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="text-[56px] mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>
              Welcome to Twin Me
            </h1>
            <p className="text-lg max-w-3xl mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>How would you like to use the platform?</p>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-10 mt-16">
              <div
                className="bg-white rounded-[32px] p-16 cursor-pointer overflow-hidden"
                style={{ border: '1px solid rgba(20,20,19,0.1)' }}
                onClick={() => selectPath('creator')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 rounded-[24px] flex items-center justify-center text-5xl" style={{ backgroundColor: 'rgba(217,119,6,0.1)', color: '#D97706' }}>
                  ◉
                </div>
                <h3 className="text-xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>I Want to Create</h3>
                <p className="leading-relaxed" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>Build a digital twin of yourself for teaching, mentoring, or sharing knowledge</p>
              </div>

              <div
                className="bg-white rounded-[32px] p-16 cursor-pointer overflow-hidden"
                style={{ border: '1px solid rgba(20,20,19,0.1)' }}
                onClick={() => selectPath('learner')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 rounded-[24px] flex items-center justify-center text-5xl" style={{ backgroundColor: 'rgba(217,119,6,0.1)', color: '#D97706' }}>
                  ◎
                </div>
                <h3 className="text-xl mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>I Want to Learn</h3>
                <p className="leading-relaxed" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>Access digital twins of educators and experts to enhance your learning journey</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Page 2: Twin Type Selection */}
      {currentPage === 2 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6">
          <button className="inline-flex items-center gap-2 text-sm mb-8" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }} onClick={previousPage}>
            ← Back
          </button>

          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="text-[48px] mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>
              What Type of Twin?
            </h1>
            <p className="text-lg max-w-2xl mx-auto" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>You can create multiple twins for different purposes</p>

            <div className="grid grid-cols-3 gap-8 max-w-[1200px] mx-auto mt-16">
              <div
                className="bg-white rounded-[24px] p-10 cursor-pointer relative"
                style={{ border: selectedType === 'educational' ? '2px solid #D97706' : '1px solid rgba(20,20,19,0.1)' }}
                onClick={() => selectType('educational')}
              >
                {selectedType === 'educational' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: '#D97706' }}>
                    ✓
                  </div>
                )}
                <h3 className="text-[24px] mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Educational Twin</h3>
                <div className="py-1 px-3 rounded-full text-xs inline-block mb-4" style={{ backgroundColor: '#4A90E2', color: 'white' }}>
                  INSTITUTION VERIFIED
                </div>
                <ul className="list-none text-sm leading-8 text-left" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                  <li>→ For universities & schools</li>
                  <li>→ Formal teaching style</li>
                  <li>→ Course integration</li>
                  <li>→ Student analytics</li>
                  <li>→ Institution badge</li>
                </ul>
              </div>

              <div
                className="bg-white rounded-[24px] p-10 cursor-pointer relative"
                style={{ border: selectedType === 'personal' ? '2px solid #D97706' : '1px solid rgba(20,20,19,0.1)' }}
                onClick={() => selectType('personal')}
              >
                {selectedType === 'personal' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: '#D97706' }}>
                    ✓
                  </div>
                )}
                <h3 className="text-[24px] mb-12" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Personal Twin</h3>
                <ul className="list-none text-sm leading-8 text-left" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                  <li>→ Share life experiences</li>
                  <li>→ Mentorship & coaching</li>
                  <li>→ Personal brand</li>
                  <li>→ Flexible monetization</li>
                  <li>→ Public or private access</li>
                </ul>
              </div>

              <div
                className="bg-white rounded-[24px] p-10 cursor-pointer relative"
                style={{ border: selectedType === 'both' ? '2px solid #D97706' : '1px solid rgba(20,20,19,0.1)' }}
                onClick={() => selectType('both')}
              >
                {selectedType === 'both' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: '#D97706' }}>
                    ✓
                  </div>
                )}
                <h3 className="text-[24px] mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Create Both</h3>
                <div className="text-white py-1 px-3 rounded-full text-xs inline-block mb-4" style={{ backgroundColor: '#D97706' }}>
                  BEST VALUE
                </div>
                <ul className="list-none text-sm leading-8 text-left" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                  <li>→ Multiple twins per account</li>
                  <li>→ Switch between profiles</li>
                  <li>→ Share content across twins</li>
                  <li>→ Unified dashboard</li>
                  <li>→ Priority support</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4 justify-center mt-12">
              <button
                className="btn-anthropic-primary"
                onClick={nextPage}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Page 3: Account Creation */}
      {currentPage === 3 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6">
          <button className="inline-flex items-center gap-2 text-sm mb-8" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }} onClick={previousPage}>
            ← Back
          </button>

          <div className="max-w-[500px] mx-auto bg-white rounded-[32px] p-12" style={{ border: '1px solid rgba(20,20,19,0.1)' }}>
            <h2 className="text-center mb-8 text-5xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Create Your Account</h2>

            <div className="space-y-4">
              <p className="text-center mb-6" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Sign up to start building your digital twin
              </p>

              <button
                onClick={() => navigate('/auth?mode=signup')}
                className="w-full py-4 px-6 rounded-2xl bg-[#D97706] text-white text-lg"
                style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}
              >
                Sign Up Now
              </button>

              <p className="text-center text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/auth?mode=signin')}
                  className="underline"
                  style={{ color: '#D97706' }}
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Page 4: Quick Setup Before Builder */}
      {currentPage === 4 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6">
          <button className="inline-flex items-center gap-2 text-sm mb-8" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }} onClick={previousPage}>
            ← Back
          </button>

          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="text-[clamp(42px,6vw,72px)] leading-[1.1] mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>
              Let's Set Up Your First Twin
            </h1>
            <p className="text-xl mt-6 mb-16" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>We'll start with the basics, then refine in the builder</p>

            <div className="grid grid-cols-2 gap-10 max-w-[1200px] mx-auto mt-16">
              <div className="bg-white rounded-[24px] p-10" style={{ border: '1px solid rgba(20,20,19,0.1)' }}>
                <h3 className="text-[26px] mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Quick Info</h3>
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-left" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }}>What should we call your twin?</label>
                  <input
                    type="text"
                    placeholder="Physics 101 with Dr. Smith"
                    value={twinName}
                    onChange={(e) => setTwinName(e.target.value)}
                    className="w-full py-[14px] px-5 rounded-2xl text-sm"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', backgroundColor: '#F5F5F5', fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div className="mb-6">
                  <AcademicHierarchy
                    value={academicStructure || undefined}
                    onChange={setAcademicStructure}
                    allowCustom={true}
                  />
                </div>

                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-left" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }}>Teaching level</label>
                  <select
                    className="w-full py-[14px] px-5 rounded-2xl text-sm"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', backgroundColor: '#F5F5F5', fontFamily: 'var(--_typography---font--tiempos)', color: 'hsl(var(--foreground))' }}
                    value={teachingLevel}
                    onChange={(e) => setTeachingLevel(e.target.value)}
                  >
                    <option value="">Select level</option>
                    <option value="high-school">High School</option>
                    <option value="undergraduate">Undergraduate</option>
                    <option value="graduate">Graduate</option>
                    <option value="professional">Professional</option>
                    <option value="all-levels">All Levels</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-[24px] p-10" style={{ border: '1px solid rgba(20,20,19,0.1)' }}>
                <h3 className="text-[26px] mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: 'hsl(var(--foreground))' }}>Quick Start Content</h3>
                <EnhancedFileUpload
                  twinId="placeholder"
                  title="Drop Your First File"
                  description="Syllabus, lecture notes, or any teaching material"
                  allowMultiple={true}
                  maxFiles={5}
                  className=""
                  onUploadComplete={(file) => {
                    toast({
                      title: "File uploaded successfully",
                      description: `${file.fileName} has been processed for your twin.`
                    });
                  }}
                />

                <p className="mt-6 text-sm text-center" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#6B7280' }}>
                  Don't worry, you can add more content in the builder
                </p>
              </div>
            </div>

            <div className="flex gap-4 justify-center mt-12">
              <button
                className="btn-anthropic-secondary"
                onClick={skipToBuilder}
              >
                Skip for Now
              </button>
              <button
                className="btn-anthropic-primary"
                onClick={goToBuilder}
              >
                Continue to Builder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GetStarted;