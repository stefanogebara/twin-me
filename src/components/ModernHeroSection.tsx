import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';

export const ModernHeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="pt-24 pb-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto">
          {/* Small badge */}
          <div className="inline-flex items-center gap-2 bg-muted rounded-full px-4 py-2 mb-8 text-sm font-medium text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Twin Me for you
          </div>

          {/* Main heading */}
          <h1 className="hero-text text-6xl md:text-8xl lg:text-9xl mb-8">
            TWIN<br />
            <span className="inline-block relative">
              ME
              <div className="absolute -bottom-4 -right-8 w-16 h-16 rounded-full bg-gradient-to-br from-accent/80 to-primary/80 blur-lg animate-pulse"></div>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-foreground/90 mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
            AI-powered professor twins that capture teaching styles,<br />
            enabling personalized learning conversations 24/7.
          </p>

          {/* CTA Button */}
          <Button 
            className="bg-foreground text-primary hover:bg-foreground/90 rounded-full px-12 py-4 text-xl font-bold inline-flex items-center gap-3 shadow-2xl border-2 border-white/20"
            onClick={() => navigate('/talk-to-twin')}
          >
            Start Learning
            <ArrowRight className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </section>
  );
};