import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Component as AnimatedBackground } from '@/components/ui/open-ai-codex-animated-background';

export const ArtemisHeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="min-h-screen bg-background relative pt-24 pb-16 px-6 overflow-hidden">
      <div className="max-w-[1440px] mx-auto relative">
        {/* Floating Portfolio Cards - Exact Artemis Style */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top Left Card */}
          <div className="absolute top-20 left-16 w-48 h-36 bg-card rounded-2xl shadow-lg transform -rotate-12 border overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-2xl font-bold mb-1">AI</div>
                <div className="text-sm">Physics Prof</div>
              </div>
            </div>
          </div>

          {/* Top Right Card */}
          <div className="absolute top-12 right-16 w-56 h-40 bg-card rounded-2xl shadow-lg transform rotate-6 border overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-lg font-semibold mb-2">Learning Platform</div>
                <div className="text-xs opacity-90">24/7 Access</div>
              </div>
            </div>
          </div>

          {/* Bottom Left Card */}
          <div className="absolute bottom-32 left-24 w-40 h-32 bg-card rounded-2xl shadow-lg transform rotate-3 border overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-lg font-bold">Voice</div>
                <div className="text-xs">Chat Ready</div>
              </div>
            </div>
          </div>

          {/* Bottom Right Card */}
          <div className="absolute bottom-24 right-24 w-44 h-36 bg-card rounded-2xl shadow-lg transform -rotate-6 border overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-base font-semibold mb-1">Personalized</div>
                <div className="text-xs opacity-90">Learning Experience</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Exact Artemis Layout */}
        <div className="text-center relative z-10 pt-20">
          {/* Small intro text */}
          <p className="text-foreground mb-6 font-medium">This is Twin Me</p>
          
          {/* Large serif headline - exact Artemis style */}
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-serif text-foreground mb-8 leading-tight italic">
            AI Professor &<br />
            Learning Twin
          </h1>

          {/* Subtitle */}
          <p className="text-foreground mb-12 text-lg font-medium">
            students can count on!
          </p>

          {/* Orange CTA Button - exact Artemis style */}
          <Button 
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-8 py-3 text-lg font-semibold shadow-lg transition-all duration-300 hover:scale-105"
            onClick={() => navigate('/talk-to-twin')}
          >
            Check out my works
          </Button>
        </div>
      </div>
    </section>
  );
};