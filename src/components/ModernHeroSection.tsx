import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Component as AnimatedBackground } from '@/components/ui/open-ai-codex-animated-background';

export const ModernHeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="min-h-screen bg-slate-50 relative pt-32 pb-16 px-6 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 w-full h-full opacity-10 -z-10">
        <AnimatedBackground />
      </div>
      
      <div className="max-w-6xl mx-auto relative">
        {/* Floating Cards */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top Left Card */}
          <div className="absolute top-0 left-8 w-48 h-32 bg-white rounded-2xl shadow-lg transform rotate-12 border">
            <div className="p-4 h-full bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-500 rounded-full mx-auto mb-2"></div>
                <div className="text-sm font-medium text-slate-700">AI Professor</div>
              </div>
            </div>
          </div>

          {/* Top Right Card */}
          <div className="absolute top-12 right-8 w-48 h-32 bg-white rounded-2xl shadow-lg transform -rotate-12 border">
            <div className="p-4 h-full bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 bg-green-500 rounded-full mx-auto mb-2"></div>
                <div className="text-sm font-medium text-slate-700">24/7 Learning</div>
              </div>
            </div>
          </div>

          {/* Bottom Left Card */}
          <div className="absolute bottom-32 left-16 w-48 h-32 bg-white rounded-2xl shadow-lg transform rotate-6 border">
            <div className="p-4 h-full bg-gradient-to-br from-pink-50 to-red-50 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 bg-pink-500 rounded-full mx-auto mb-2"></div>
                <div className="text-sm font-medium text-slate-700">Personalized</div>
              </div>
            </div>
          </div>

          {/* Bottom Right Card */}
          <div className="absolute bottom-24 right-16 w-48 h-32 bg-white rounded-2xl shadow-lg transform -rotate-6 border">
            <div className="p-4 h-full bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 bg-orange-500 rounded-full mx-auto mb-2"></div>
                <div className="text-sm font-medium text-slate-700">Smart AI</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="text-center relative z-10">
          <p className="text-slate-600 mb-4 font-medium">This is Twin Me</p>
          
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-serif text-slate-900 mb-8 leading-tight">
            AI Professor &<br />
            <span className="italic">Learning Twin</span>
          </h1>

          <p className="text-slate-600 mb-12 text-lg font-medium max-w-md mx-auto">
            students can count on!
          </p>

          <Button 
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 py-3 text-lg font-medium shadow-lg"
            onClick={() => navigate('/talk-to-twin')}
          >
            Check out my works
          </Button>
        </div>
      </div>
    </section>
  );
};