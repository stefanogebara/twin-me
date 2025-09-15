import { MessageCircle, Mic } from 'lucide-react';

export const WhatIsSection = () => {
  return (
    <section className="section-spacing bg-background">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-xl font-bold mb-8 slide-up">
          What is Twin Me?
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-12 max-w-3xl mx-auto fade-in">
          Twin Me builds <strong className="text-foreground">digital replicas of real teachers</strong> – 
          capturing their lectures, writings, analogies, and distinctive teaching style – and lets students 
          <strong className="text-foreground"> chat or talk directly</strong> with their professor's AI "twin," 
          <strong className="text-foreground"> anytime</strong>.
        </p>
        
        <div className="flex justify-center items-center space-x-12 fade-in">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-accent" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Talk</span>
          </div>
          
          <div className="text-muted-foreground text-sm">or</div>
          
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <Mic className="w-8 h-8 text-accent" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Text</span>
          </div>
        </div>
      </div>
    </section>
  );
};