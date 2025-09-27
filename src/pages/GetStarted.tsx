import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { AcademicHierarchy, AcademicStructure } from '@/components/ui/AcademicHierarchy';
import EnhancedFileUpload from '@/components/ui/EnhancedFileUpload';

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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Background Effects */}
      <div className="fixed w-[400px] h-[400px] bg-gradient-to-br rounded-full top-[20%] right-[10%] blur-[100px] opacity-20 animate-[float_20s_ease-in-out_infinite] pointer-events-none" style={{ background: 'linear-gradient(135deg, var(--_color-theme---accent), var(--_color-theme---accent-light))' }}></div>
      <div className="fixed w-[300px] h-[300px] bg-gradient-to-br rounded-full bottom-[20%] left-[10%] blur-[100px] opacity-20 animate-[float_20s_ease-in-out_infinite] pointer-events-none" style={{ background: 'linear-gradient(135deg, var(--_color-theme---accent), var(--_color-theme---background))' }}></div>
      
      {/* Navigation - Match home page exactly */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6"
           style={{ backgroundColor: 'var(--_color-theme---background)/90', borderBottom: '1px solid var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-2xl font-bold" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Twin AI Learn
            </div>
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={goHome}
                className="relative font-medium transition-all group"
                style={{ color: 'var(--_color-theme---text)' }}
              >
                Home
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 transition-all group-hover:w-full" style={{ backgroundColor: 'var(--_color-theme---accent)' }}></div>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              className="btn-anthropic-primary"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>
      
      {/* Progress Bar */}
      <div className="fixed top-[80px] left-0 right-0 h-1 bg-gray-200/50 z-[40]">
        <div className="h-full transition-all duration-500" style={{ backgroundColor: 'var(--_color-theme---accent)', width: `${updateProgress()}%` }}></div>
      </div>
      
      {/* Page 1: Choose Your Path */}
      {currentPage === 1 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-8" style={{ color: 'var(--_color-theme---text)' }} onClick={goHome}>
            ← Back to Home
          </button>
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="u-display-xl text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Welcome to Twin Me
            </h1>
            <p className="text-body-large max-w-3xl mx-auto" style={{ color: 'var(--_color-theme---text)' }}>How would you like to use the platform?</p>
            
            <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-10 mt-16">
              <div 
                className="bg-white rounded-[32px] p-16 cursor-pointer transition-all duration-[0.4s] shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden transform -rotate-2 hover:translate-y-[-10px] hover:rotate-0 hover:scale-[1.02] hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]"
                onClick={() => selectPath('creator')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] rounded-[24px] flex items-center justify-center text-5xl">
                  ◉
                </div>
                <h3 className="text-heading text-xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Create</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>Build a digital twin of yourself for teaching, mentoring, or sharing knowledge</p>
              </div>
              
              <div 
                className="bg-white rounded-[32px] p-16 cursor-pointer transition-all duration-[0.4s] shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden transform rotate-2 hover:translate-y-[-10px] hover:rotate-0 hover:scale-[1.02] hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]"
                onClick={() => selectPath('learner')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 bg-gradient-to-br from-[rgba(74,144,226,0.1)] to-[rgba(0,188,212,0.1)] rounded-[24px] flex items-center justify-center text-5xl">
                  ◎
                </div>
                <h3 className="text-heading text-xl font-medium mb-4" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>I Want to Learn</h3>
                <p className="text-body leading-relaxed" style={{ color: 'var(--_color-theme---text)' }}>Access digital twins of educators and experts to enhance your learning journey</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Page 2: Twin Type Selection */}
      {currentPage === 2 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-8" style={{ color: 'var(--_color-theme---text)' }} onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="u-display-l text-heading mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              What Type of Twin?
            </h1>
            <p className="text-body-large max-w-2xl mx-auto" style={{ color: 'var(--_color-theme---text)' }}>You can create multiple twins for different purposes</p>
            
            <div className="grid grid-cols-3 gap-8 max-w-[1200px] mx-auto mt-16">
              <div
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'educational' ? 'border-[var(--_color-theme---accent)] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('educational')}
              >
                {selectedType === 'educational' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                    ✓
                  </div>
                )}
                <h3 className="font-heading text-[24px] font-medium mb-4">Educational Twin</h3>
                <div className="bg-[#4A90E2] text-white py-1 px-3 rounded-full text-xs inline-block mb-4">
                  INSTITUTION VERIFIED
                </div>
                <ul className="list-none style={{ color: 'var(--_color-theme---text)' }} text-sm leading-8 text-left">
                  <li>→ For universities & schools</li>
                  <li>→ Formal teaching style</li>
                  <li>→ Course integration</li>
                  <li>→ Student analytics</li>
                  <li>→ Institution badge</li>
                </ul>
              </div>
              
              <div
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'personal' ? 'border-[var(--_color-theme---accent)] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('personal')}
              >
                {selectedType === 'personal' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                    ✓
                  </div>
                )}
                <h3 className="font-heading text-[24px] font-medium mb-12">Personal Twin</h3>
                <ul className="list-none style={{ color: 'var(--_color-theme---text)' }} text-sm leading-8 text-left">
                  <li>→ Share life experiences</li>
                  <li>→ Mentorship & coaching</li>
                  <li>→ Personal brand</li>
                  <li>→ Flexible monetization</li>
                  <li>→ Public or private access</li>
                </ul>
              </div>
              
              <div
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'both' ? 'border-[var(--_color-theme---accent)] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('both')}
              >
                {selectedType === 'both' && (
                  <div className="absolute top-5 right-5 w-8 h-8 text-white rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: 'var(--_color-theme---accent)' }}>
                    ✓
                  </div>
                )}
                <h3 className="font-heading text-[24px] font-medium mb-4">Create Both</h3>
                <div className="style={{ backgroundColor: 'var(--_color-theme---accent)' }} text-white py-1 px-3 rounded-full text-xs inline-block mb-4">
                  BEST VALUE
                </div>
                <ul className="list-none style={{ color: 'var(--_color-theme---text)' }} text-sm leading-8 text-left">
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
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-8" style={{ color: 'var(--_color-theme---text)' }} onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[500px] mx-auto bg-white rounded-[32px] p-12 shadow-[0_20px_60px_rgba(0,0,0,0.1)]">
            <h2 className="font-display text-center mb-8 text-5xl font-medium gradient-text">Create Your Account</h2>
            
            <div className="clerk-signup-wrapper">
              <SignUp 
                redirectUrl="/get-started?step=4"
                appearance={{
                  elements: {
                    formButtonPrimary: 'bg-[#d97706] hover:bg-[#b45309] text-white',
                    card: 'shadow-none border-none bg-transparent',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    socialButtons: 'flex flex-col gap-4',
                    socialButtonsBlockButton: 'border-2 border-[#E5E7EB] rounded-2xl bg-white hover:border-[#111319] hover:transform hover:translate-y-[-2px] transition-all duration-300',
                    formFieldInput: 'w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm transition-all duration-300 focus:outline-none focus:border-[#d97706] focus:bg-[#fefdf9]',
                    formFieldLabel: 'block mb-2 text-sm font-medium text-[#111319]',
                    dividerLine: 'bg-[#E5E7EB]',
                    dividerText: 'text-[#6b7280] text-sm'
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Page 4: Quick Setup Before Builder */}
      {currentPage === 4 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm mb-8" style={{ color: 'var(--_color-theme---text)' }} onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="font-display text-[clamp(42px,6vw,72px)] font-medium leading-[1.1] mb-6 gradient-text">
              Let's Set Up Your First Twin
            </h1>
            <p className="text-xl mt-6 mb-16">We'll start with the basics, then refine in the builder</p>
            
            <div className="grid grid-cols-2 gap-10 max-w-[1200px] mx-auto mt-16">
              <div className="bg-white rounded-[24px] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                <h3 className="font-heading text-[26px] font-medium mb-6">Quick Info</h3>
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))] text-left">What should we call your twin?</label>
                  <input
                    type="text"
                    placeholder="Physics 101 with Dr. Smith"
                    value={twinName}
                    onChange={(e) => setTwinName(e.target.value)}
                    className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm"
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
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))] text-left">Teaching level</label>
                  <select
                    className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm"
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
              
              <div className="bg-white rounded-[24px] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                <h3 className="font-heading text-[26px] font-medium mb-6">Quick Start Content</h3>
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

                <p className="mt-6 text-sm text-center" style={{ color: 'var(--_color-theme---text)' }}>
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