import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const GetStarted = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const updateProgress = () => {
    return (currentPage / 4) * 100;
  };

  const selectPath = (path: string) => {
    setSelectedPath(path);
    if (path === 'learner') {
      alert('Redirecting to learner dashboard...');
      return;
    }
    nextPage();
  };

  const selectType = (type: string) => {
    setSelectedType(type);
  };

  const nextPage = () => {
    if (currentPage < 4) {
      setCurrentPage(currentPage + 1);
    }
  };

  const previousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToBuilder = () => {
    navigate('/twin-builder');
  };

  const skipToBuilder = () => {
    navigate('/twin-builder');
  };

  const goHome = () => {
    navigate('/');
  };

  return (
    <div className="font-inter bg-[#FBF7F0] text-[#1A1A4B] min-h-screen">
      {/* Background Effects */}
      <div className="fixed w-[400px] h-[400px] bg-gradient-to-br from-[#FF5722] to-[#FF9800] rounded-full top-[20%] right-[10%] blur-[100px] opacity-30 animate-[float_20s_ease-in-out_infinite] pointer-events-none"></div>
      <div className="fixed w-[300px] h-[300px] bg-gradient-to-br from-[#4A90E2] to-[#00BCD4] rounded-full bottom-[20%] left-[10%] blur-[100px] opacity-30 animate-[float_20s_ease-in-out_infinite] pointer-events-none"></div>
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-[100] p-6">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="font-playfair text-[28px] font-normal italic text-[#1A1A4B] cursor-pointer" onClick={goHome}>
            Twin Me
          </div>
          <div className="flex items-center gap-8">
            <a href="#" className="text-[#6B7280] no-underline text-sm transition-colors duration-300 hover:text-[#FF5722]">
              Help
            </a>
            <a href="#" className="text-[#6B7280] no-underline text-sm transition-colors duration-300 hover:text-[#FF5722]">
              Sign In
            </a>
          </div>
        </div>
      </nav>
      
      {/* Progress Bar */}
      <div className="fixed top-[80px] left-0 right-0 h-1 bg-gray-200/50 z-[90]">
        <div className="h-full bg-gradient-to-r from-[#FF5722] to-[#FF9800] transition-all duration-500" style={{ width: `${updateProgress()}%` }}></div>
      </div>
      
      {/* Page 1: Choose Your Path */}
      {currentPage === 1 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="font-playfair text-[clamp(48px,6vw,72px)] font-normal italic leading-[1.1] mb-6">
              Welcome to Twin Me
            </h1>
            <p className="text-xl mt-6 mb-16">How would you like to use the platform?</p>
            
            <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-10 mt-16">
              <div 
                className="bg-white rounded-[32px] p-16 cursor-pointer transition-all duration-[0.4s] shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden transform -rotate-2 hover:translate-y-[-10px] hover:rotate-0 hover:scale-[1.02] hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]"
                onClick={() => selectPath('creator')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] rounded-[24px] flex items-center justify-center text-5xl">
                  ◉
                </div>
                <h3 className="font-playfair text-[32px] font-normal italic mb-2">I Want to Create</h3>
                <p className="text-[#6B7280] leading-[1.6]">Build a digital twin of yourself for teaching, mentoring, or sharing knowledge</p>
              </div>
              
              <div 
                className="bg-white rounded-[32px] p-16 cursor-pointer transition-all duration-[0.4s] shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden transform rotate-2 hover:translate-y-[-10px] hover:rotate-0 hover:scale-[1.02] hover:shadow-[0_30px_60px_rgba(0,0,0,0.15)]"
                onClick={() => selectPath('learner')}
              >
                <div className="w-[100px] h-[100px] mx-auto mb-8 bg-gradient-to-br from-[rgba(74,144,226,0.1)] to-[rgba(0,188,212,0.1)] rounded-[24px] flex items-center justify-center text-5xl">
                  ◎
                </div>
                <h3 className="font-playfair text-[32px] font-normal italic mb-2">I Want to Learn</h3>
                <p className="text-[#6B7280] leading-[1.6]">Access digital twins of educators and experts to enhance your learning journey</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Page 2: Twin Type Selection */}
      {currentPage === 2 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-[#6B7280] no-underline text-sm mb-8 transition-colors duration-300 hover:text-[#1A1A4B]" onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="font-playfair text-[clamp(42px,6vw,72px)] font-normal italic leading-[1.1] mb-6">
              What Type of Twin?
            </h1>
            <p className="text-xl mt-6 mb-16">You can create multiple twins for different purposes</p>
            
            <div className="grid grid-cols-3 gap-8 max-w-[1200px] mx-auto mt-16">
              <div 
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'educational' ? 'border-[#FF5722] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('educational')}
              >
                {selectedType === 'educational' && (
                  <div className="absolute top-5 right-5 w-8 h-8 bg-[#FF5722] text-white rounded-full flex items-center justify-center text-lg">
                    ✓
                  </div>
                )}
                <h3 className="font-playfair text-[24px] font-normal italic mb-4">Educational Twin</h3>
                <div className="bg-[#4A90E2] text-white py-1 px-3 rounded-full text-xs inline-block mb-4">
                  INSTITUTION VERIFIED
                </div>
                <ul className="list-none text-[#6B7280] text-sm leading-8 text-left">
                  <li>→ For universities & schools</li>
                  <li>→ Formal teaching style</li>
                  <li>→ Course integration</li>
                  <li>→ Student analytics</li>
                  <li>→ Institution badge</li>
                </ul>
              </div>
              
              <div 
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'personal' ? 'border-[#FF5722] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('personal')}
              >
                {selectedType === 'personal' && (
                  <div className="absolute top-5 right-5 w-8 h-8 bg-[#FF5722] text-white rounded-full flex items-center justify-center text-lg">
                    ✓
                  </div>
                )}
                <h3 className="font-playfair text-[24px] font-normal italic mb-12">Personal Twin</h3>
                <ul className="list-none text-[#6B7280] text-sm leading-8 text-left">
                  <li>→ Share life experiences</li>
                  <li>→ Mentorship & coaching</li>
                  <li>→ Personal brand</li>
                  <li>→ Flexible monetization</li>
                  <li>→ Public or private access</li>
                </ul>
              </div>
              
              <div 
                className={`bg-white rounded-[24px] p-10 border-2 cursor-pointer transition-all duration-300 relative ${
                  selectedType === 'both' ? 'border-[#FF5722] transform translate-y-[-4px] shadow-[0_20px_40px_rgba(0,0,0,0.1)]' : 'border-transparent'
                }`}
                onClick={() => selectType('both')}
              >
                {selectedType === 'both' && (
                  <div className="absolute top-5 right-5 w-8 h-8 bg-[#FF5722] text-white rounded-full flex items-center justify-center text-lg">
                    ✓
                  </div>
                )}
                <h3 className="font-playfair text-[24px] font-normal italic mb-4">Create Both</h3>
                <div className="bg-[#FF5722] text-white py-1 px-3 rounded-full text-xs inline-block mb-4">
                  BEST VALUE
                </div>
                <ul className="list-none text-[#6B7280] text-sm leading-8 text-left">
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
                className="py-[14px] px-8 rounded-full bg-[#FF5722] text-white font-medium text-sm cursor-pointer transition-all duration-300 border-none hover:transform hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]"
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
          <button className="inline-flex items-center gap-2 text-[#6B7280] no-underline text-sm mb-8 transition-colors duration-300 hover:text-[#1A1A4B]" onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[500px] mx-auto bg-white rounded-[32px] p-12 shadow-[0_20px_60px_rgba(0,0,0,0.1)]">
            <h2 className="font-playfair text-center mb-8 text-5xl font-normal italic">Create Your Account</h2>
            
            <form>
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Full Name</label>
                <input 
                  type="text" 
                  placeholder="Dr. Jane Smith"
                  className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                />
              </div>
              
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Email Address</label>
                <input 
                  type="email" 
                  placeholder="jane.smith@university.edu"
                  className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                />
              </div>
              
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Password</label>
                <input 
                  type="password" 
                  placeholder="Create a strong password"
                  className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                />
                <div className="h-1 bg-[#E5E7EB] rounded-sm mt-2 overflow-hidden">
                  <div className="h-full bg-[#4CAF50] transition-all duration-300 w-0"></div>
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Institution (Optional)</label>
                <input 
                  type="text" 
                  placeholder="Stanford University"
                  className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                />
              </div>
              
              <div className="text-center my-8 relative">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-[#E5E7EB]"></div>
                <span className="bg-white px-4 relative text-[#6B7280] text-sm">or continue with</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button type="button" className="py-3 px-4 border-2 border-[#E5E7EB] rounded-2xl bg-white cursor-pointer transition-all duration-300 flex items-center justify-center gap-2 font-inter text-sm font-medium hover:border-[#1A1A4B] hover:transform hover:translate-y-[-2px]">
                  <span className="text-xl">G</span>
                  Google
                </button>
                <button type="button" className="py-3 px-4 border-2 border-[#E5E7EB] rounded-2xl bg-white cursor-pointer transition-all duration-300 flex items-center justify-center gap-2 font-inter text-sm font-medium hover:border-[#1A1A4B] hover:transform hover:translate-y-[-2px]">
                  <span className="text-xl">M</span>
                  Microsoft
                </button>
              </div>
              
              <button 
                type="button" 
                className="w-full py-[14px] px-8 rounded-full bg-[#FF5722] text-white font-medium text-sm cursor-pointer transition-all duration-300 border-none hover:transform hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]"
                onClick={nextPage}
              >
                Create Account
              </button>
              
              <p className="text-center mt-6 text-sm">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-[#FF5722]">Terms</a> and{' '}
                <a href="#" className="text-[#FF5722]">Privacy Policy</a>
              </p>
            </form>
          </div>
        </div>
      )}
      
      {/* Page 4: Quick Setup Before Builder */}
      {currentPage === 4 && (
        <div className="min-h-screen pt-[140px] pb-20 px-6 animate-[fadeIn_0.5s_ease]">
          <button className="inline-flex items-center gap-2 text-[#6B7280] no-underline text-sm mb-8 transition-colors duration-300 hover:text-[#1A1A4B]" onClick={previousPage}>
            ← Back
          </button>
          
          <div className="max-w-[1200px] mx-auto text-center">
            <h1 className="font-playfair text-[clamp(42px,6vw,72px)] font-normal italic leading-[1.1] mb-6">
              Let's Set Up Your First Twin
            </h1>
            <p className="text-xl mt-6 mb-16">We'll start with the basics, then refine in the builder</p>
            
            <div className="grid grid-cols-2 gap-10 max-w-[1200px] mx-auto mt-16">
              <div className="bg-white rounded-[24px] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                <h3 className="font-playfair text-[26px] font-normal italic mb-6">Quick Info</h3>
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B] text-left">What should we call your twin?</label>
                  <input 
                    type="text" 
                    placeholder="Physics 101 with Dr. Smith"
                    className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm"
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B] text-left">Primary subject area</label>
                  <select className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm">
                    <option>Select a subject</option>
                    <option>Computer Science</option>
                    <option>Physics</option>
                    <option>Mathematics</option>
                    <option>Biology</option>
                    <option>Literature</option>
                    <option>Business</option>
                    <option>Other</option>
                  </select>
                </div>
                
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B] text-left">Teaching level</label>
                  <select className="w-full py-[14px] px-5 border-2 border-[#E5E7EB] rounded-2xl text-sm">
                    <option>Select level</option>
                    <option>High School</option>
                    <option>Undergraduate</option>
                    <option>Graduate</option>
                    <option>Professional</option>
                    <option>All Levels</option>
                  </select>
                </div>
              </div>
              
              <div className="bg-white rounded-[24px] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
                <h3 className="font-playfair text-[26px] font-normal italic mb-6">Quick Start Content</h3>
                <div className="border-2 border-dashed border-[#E5E7EB] rounded-[20px] p-10 text-center cursor-pointer transition-all duration-300 bg-[#FAFAFA] hover:border-[#FF5722] hover:bg-[rgba(255,87,34,0.03)]">
                  <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] rounded-[20px] flex items-center justify-center text-[32px]">
                    ↑
                  </div>
                  <h4 className="mb-2 font-medium">Drop Your First File</h4>
                  <p className="text-[#6B7280] text-sm mb-5">
                    Syllabus, lecture notes, or any teaching material
                  </p>
                  <button className="py-[14px] px-8 rounded-full bg-transparent text-[#1A1A4B] border-2 border-[#1A1A4B] font-medium text-sm cursor-pointer transition-all duration-300 hover:bg-[#1A1A4B] hover:text-white">
                    Browse Files
                  </button>
                </div>
                
                <p className="mt-6 text-sm text-[#6B7280] text-center">
                  Don't worry, you can add more content in the builder
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 justify-center mt-12">
              <button 
                className="py-[14px] px-8 rounded-full bg-transparent text-[#1A1A4B] border-2 border-[#1A1A4B] font-medium text-sm cursor-pointer transition-all duration-300 hover:bg-[#1A1A4B] hover:text-white"
                onClick={skipToBuilder}
              >
                Skip for Now
              </button>
              <button 
                className="py-[14px] px-8 rounded-full bg-[#FF5722] text-white font-medium text-sm cursor-pointer transition-all duration-300 border-none hover:transform hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]"
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