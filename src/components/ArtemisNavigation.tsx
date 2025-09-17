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
      isScrolled ? 'bg-card/95 backdrop-blur-sm shadow-lg' : 'bg-transparent'
    }`}>
      <div className="max-w-[1440px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div 
            className="text-2xl font-bold text-foreground cursor-pointer"
            onClick={() => navigate('/')}
          >
            Twin Me
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#features"
              className="text-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              How It Works
            </a>
            <a
              href="#testimonials"
              className="text-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Testimonials
            </a>
          </div>

          {/* CTA Button */}
          <Button 
            className="artemis-btn-primary"
            onClick={() => navigate('/auth')}
          >
            Get Started
          </Button>
        </div>
      </div>
    </nav>
  );
};