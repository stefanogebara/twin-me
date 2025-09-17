import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { FloatingElements } from './FloatingElements';

const taglines = [
  "Education, Personalized by AI.",
  "Talk to Your Teacher's Twin.",
  "Learn Differently, From the Same Mind.",
  "Your Professor, Reimagined."
];

export const HeroSection = () => {
  const [currentTagline, setCurrentTagline] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentTagline((prev) => (prev + 1) % taglines.length);
        setIsVisible(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-hero-gradient">
      <FloatingElements />
      
      {/* Liquid Glass UI Element - More cartoonish */}
      <div className="absolute top-1/2 right-1/4 transform -translate-y-1/2 liquid-glass rounded-3xl p-6 max-w-sm opacity-50 mirror-box">
        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-yellow-400 flex items-center justify-center cartoon-bounce">
              <div className="w-6 h-6 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="h-3 bg-gradient-to-r from-muted to-muted/60 rounded-full mb-2" />
              <div className="h-2 bg-gradient-to-r from-muted/60 to-muted/40 rounded-full w-2/3" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2 bg-gradient-to-r from-muted/40 to-muted/20 rounded-full" />
            <div className="h-2 bg-gradient-to-r from-muted/40 to-muted/30 rounded-full w-4/5" />
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <h1 
          className={`hero-text mb-8 transition-all duration-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {taglines[currentTagline]}
        </h1>
        
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed fade-in font-medium">
          Twin Me builds digital replicas of real teachers – capturing their lectures, writings, 
          and distinctive teaching style – letting students chat or talk directly with their professor's AI twin, anytime.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center slide-up">
          <Button 
            variant="default"
            size="lg" 
            className="px-10 py-4 text-lg font-bold shadow-2xl"
            onClick={() => navigate('/talk-to-twin')}
          >
            Talk to a Twin
          </Button>
          <Button variant="cartoon" size="lg" className="px-10 py-4 text-lg">
            Start Learning
          </Button>
        </div>
      </div>
    </section>
  );
};