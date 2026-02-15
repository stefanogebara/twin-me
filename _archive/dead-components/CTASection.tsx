import { Button } from '@/components/ui/button';

export const CTASection = () => {
  return (
    <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
      {/* Subtle reflection effect */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent" />
      
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <p className="text-lg mb-12 opacity-80 fade-in">
          Ready to explore a new way of learning?
        </p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center slide-up">
          <Button 
            variant="outline" 
            size="lg" 
            className="px-8 py-4 text-lg font-medium bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
          >
            Start Learning
          </Button>
          <Button 
            variant="secondary"
            size="lg" 
            className="px-8 py-4 text-lg font-medium"
          >
            Try the Demo
          </Button>
        </div>
      </div>
      
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-32 h-16 border border-primary-foreground/10 rounded-full transform rotate-12" />
        <div className="absolute bottom-1/3 right-1/3 w-24 h-12 border border-primary-foreground/10 rounded-full transform -rotate-12" />
      </div>
    </section>
  );
};