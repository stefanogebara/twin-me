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
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 leading-tight">
            Onboard your<br />
            student{' '}
            <span className="inline-block relative">
              10x faster
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            AI-powered workflows replace paperwork, streamline<br />
            onboarding, save time and money.
          </p>

          {/* CTA Button */}
          <Button 
            className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-8 py-3 text-lg font-semibold inline-flex items-center gap-2"
            onClick={() => navigate('/talk-to-twin')}
          >
            Start Free
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};