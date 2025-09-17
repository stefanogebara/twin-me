import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Component as AnimatedBackground } from '@/components/ui/open-ai-codex-animated-background';

export const ArtemisHeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="min-h-screen bg-background relative pt-24 pb-16 px-6 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 w-full h-full opacity-5 -z-10">
        <AnimatedBackground />
      </div>
      
      {/* Organic Shapes */}
      <div className="absolute top-20 right-10 w-80 h-80 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-3xl"></div>
      <div className="absolute bottom-20 left-10 w-60 h-60 rounded-full bg-gradient-to-tr from-accent/20 to-primary/20 blur-3xl"></div>
      
      <div className="max-w-[1440px] mx-auto relative">
        {/* Floating Interface Cards */}
        <div className="absolute inset-0 pointer-events-none">
          {/* AI Chat Card */}
          <div className="absolute top-20 right-16 w-80 h-48 bg-card rounded-3xl shadow-lg transform rotate-3 border artemis-shadow">
            <div className="p-6 h-full bg-gradient-to-br from-accent/5 to-primary/5 rounded-3xl">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                  <div className="w-5 h-5 bg-card rounded-full"></div>
                </div>
                <div className="ml-3">
                  <div className="text-sm font-semibold text-foreground">AI Professor</div>
                  <div className="text-xs text-muted-foreground">Physics Expert</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded-full w-4/5"></div>
                <div className="h-3 bg-muted rounded-full w-3/5"></div>
                <div className="h-3 bg-primary/20 rounded-full w-2/3"></div>
              </div>
            </div>
          </div>

          {/* Learning Progress Card */}
          <div className="absolute top-40 left-16 w-72 h-40 bg-card rounded-3xl shadow-lg transform -rotate-6 border artemis-shadow">
            <div className="p-6 h-full bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl">
              <div className="text-sm font-semibold text-foreground mb-3">Learning Progress</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Quantum Physics</span>
                  <span className="text-xs font-medium text-accent">85%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-gradient-to-r from-accent to-primary h-2 rounded-full" style={{width: '85%'}}></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Calculus</span>
                  <span className="text-xs font-medium text-primary">72%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full" style={{width: '72%'}}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Voice Interaction Card */}
          <div className="absolute bottom-32 right-20 w-64 h-32 bg-card rounded-3xl shadow-lg transform rotate-2 border artemis-shadow">
            <div className="p-4 h-full bg-gradient-to-br from-accent/5 to-primary/5 rounded-3xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full mx-auto mb-2 flex items-center justify-center">
                  <div className="w-6 h-6 bg-card rounded-full animate-pulse"></div>
                </div>
                <div className="text-sm font-medium text-foreground">Voice Chat Active</div>
                <div className="text-xs text-muted-foreground">Listening...</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="text-center relative z-10 pt-20">
          <h1 className="hero-text text-foreground mb-6 leading-tight max-w-4xl mx-auto">
            AI Professor &<br />
            <span className="italic">Learning Twin</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
            Twin Me builds digital replicas of real teachers – capturing their lectures, writings, 
            and distinctive teaching style – letting students chat or talk directly with their professor's AI twin, anytime.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button 
              className="artemis-btn-primary text-lg px-8 py-4"
              onClick={() => navigate('/talk-to-twin')}
            >
              Try AI Professor
            </Button>
            <Button 
              className="artemis-btn-secondary text-lg px-8 py-4"
              onClick={() => navigate('/auth')}
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};