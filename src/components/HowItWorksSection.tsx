import { Upload, Brain, MessageSquare, FileText, Video, Headphones } from 'lucide-react';

const steps = [
  {
    title: "Content Ingestion",
    description: "Twin Me gathers the professor's knowledge sources – lecture videos, audio recordings, academic papers, and writings.",
    icon: Upload,
    visual: [
      { icon: Video, label: "Lectures" },
      { icon: FileText, label: "Papers" },
      { icon: Headphones, label: "Audio" }
    ]
  },
  {
    title: "AI Twin Creation", 
    description: "Advanced AI analyzes and learns from the content to create the professor's digital twin, mapping their teaching style and knowledge.",
    icon: Brain,
    visual: []
  },
  {
    title: "Interactive AI Professor",
    description: "The professor's twin is ready to engage with students 24/7 through natural conversation – chat or talk anytime.",
    icon: MessageSquare,
    visual: []
  }
];

export const HowItWorksSection = () => {
  return (
    <section className="section-spacing bg-muted/30">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-xl font-bold text-center mb-16 slide-up">
          How It Works
        </h2>
        
        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((step, index) => (
            <div key={index} className="text-center fade-in">
              {/* Step Icon */}
              <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                <step.icon className="w-10 h-10 text-accent" />
              </div>
              
              {/* Step Number */}
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold mb-4">
                {index + 1}
              </div>
              
              {/* Step Title */}
              <h3 className="text-lg font-semibold mb-4">
                {step.title}
              </h3>
              
              {/* Step Description */}
              <p className="text-muted-foreground leading-relaxed mb-6">
                {step.description}
              </p>
              
              {/* Visual Elements for Step 1 */}
              {step.visual.length > 0 && (
                <div className="flex justify-center space-x-6">
                  {step.visual.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center mb-2">
                        <item.icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* AI Twin Creation Visual */}
              {index === 1 && (
                <div className="relative">
                  <div className="w-24 h-24 mx-auto rounded-full border-2 border-dashed border-accent/30 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-accent/40 animate-pulse" />
                    </div>
                  </div>
                  <div className="absolute -inset-4 opacity-30">
                    <div className="w-2 h-2 bg-accent/60 rounded-full absolute top-2 left-6 animate-pulse" />
                    <div className="w-1 h-1 bg-accent/40 rounded-full absolute bottom-4 right-8 animate-pulse" style={{ animationDelay: '0.5s' }} />
                    <div className="w-1.5 h-1.5 bg-accent/50 rounded-full absolute top-8 right-2 animate-pulse" style={{ animationDelay: '1s' }} />
                  </div>
                </div>
              )}
              
              {/* Interactive Professor Visual */}
              {index === 2 && (
                <div className="glass-effect rounded-xl p-4 mx-auto max-w-xs">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="bg-secondary/60 rounded-lg p-2 mb-2">
                        <div className="h-2 bg-muted/60 rounded mb-1" />
                        <div className="h-2 bg-muted/40 rounded w-3/4" />
                      </div>
                      <div className="text-xs text-muted-foreground">Professor's Twin</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};