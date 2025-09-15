import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import infinityLoop from '@/assets/infinity-loop.png';

const taglines = [
  "Education, Personalized by AI.",
  "Talk to Your Teacher's Twin.",
  "Learn Differently, From the Same Mind.",
  "Your Professor, Reimagined."
];

export const HeroSection = () => {
  const [currentTagline, setCurrentTagline] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

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
      {/* Infinity Loop Background */}
      <div 
        className="absolute inset-0 opacity-5 parallax-slow"
        style={{
          backgroundImage: `url(${infinityLoop})`,
          backgroundSize: '600px 300px',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          transform: 'translateZ(0)',
        }}
      />
      
      {/* Frosted Glass UI Element */}
      <div className="absolute top-1/2 right-1/4 transform -translate-y-1/2 glass-effect rounded-2xl p-6 max-w-sm opacity-40">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-accent animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="h-3 bg-muted rounded mb-2" />
            <div className="h-2 bg-muted/60 rounded w-2/3" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 bg-muted/40 rounded" />
          <div className="h-2 bg-muted/40 rounded w-4/5" />
        </div>
      </div>
      
      {/* Main Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <h1 
          className={`hero-text mb-6 transition-all duration-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {taglines[currentTagline]}
        </h1>
        
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed fade-in">
          Twin Me builds digital replicas of real teachers – capturing their lectures, writings, 
          and distinctive teaching style – letting students chat or talk directly with their professor's AI twin, anytime.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center slide-up">
          <Button size="lg" className="px-8 py-4 text-lg font-medium">
            Talk to a Twin
          </Button>
          <Button variant="outline" size="lg" className="px-8 py-4 text-lg font-medium">
            Start Learning
          </Button>
        </div>
      </div>
    </section>
  );
};