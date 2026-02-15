import { Card } from '@/components/ui/card';
import { Brain, BookOpen, MessageSquare, Zap } from 'lucide-react';

export const ArchitectureSection = () => {
  return (
    <section className="py-20 px-6 bg-muted/30">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <h2 className="text-4xl font-bold text-foreground mb-6 leading-tight">
              The AI architecture for<br />
              modern onboarding
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Twin Me automates, personalizes, and secures, helping startups scale quickly.
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 border-0 bg-background/50">
                <Brain className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">AI Learning</h3>
                <p className="text-sm text-muted-foreground">Adaptive teaching methods</p>
              </Card>
              <Card className="p-4 border-0 bg-background/50">
                <BookOpen className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Digital Twins</h3>
                <p className="text-sm text-muted-foreground">Professor replicas</p>
              </Card>
              <Card className="p-4 border-0 bg-background/50">
                <MessageSquare className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Chat Interface</h3>
                <p className="text-sm text-muted-foreground">Natural conversations</p>
              </Card>
              <Card className="p-4 border-0 bg-background/50">
                <Zap className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">Instant Access</h3>
                <p className="text-sm text-muted-foreground">24/7 availability</p>
              </Card>
            </div>
          </div>

          {/* Right Image/Video */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[4/3]">
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop&crop=center"
                alt="Students learning with AI technology"
                className="w-full h-full object-cover"
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-20 h-20 bg-card/90 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-white transition-colors">
                  <div className="w-0 h-0 border-l-[16px] border-l-foreground border-y-[12px] border-y-transparent ml-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};