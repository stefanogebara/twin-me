import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const ArtemisNavigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ? 'bg-card/95 backdrop-blur-sm' : 'bg-transparent'
    }`}>
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          {/* Left Menu */}
          <div className="flex items-center">
            <a
              href="#works"
              className="text-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Works
            </a>
          </div>

          {/* Center Logo - Exact Artemis style */}
          <div 
            className="text-2xl font-serif cursor-pointer"
            onClick={() => navigate('/')}
          >
            <span className="text-primary italic">Twin Me &</span>
            <span className="text-foreground"> Artemis</span>
          </div>

          {/* Right Menu */}
          <div className="flex items-center">
            <a
              href="#playground"
              className="text-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Playground
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};