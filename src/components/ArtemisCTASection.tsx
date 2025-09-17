import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const ArtemisCTASection = () => {
  const navigate = useNavigate();

  return (
    <section className="py-24 px-6 bg-gradient-to-br from-background to-card relative overflow-hidden">
      {/* Decorative shapes */}
      <div className="absolute top-10 right-10 w-32 h-32 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-2xl"></div>
      <div className="absolute bottom-10 left-10 w-40 h-40 bg-gradient-to-tr from-accent/20 to-primary/20 rounded-full blur-2xl"></div>
      
      <div className="max-w-[1440px] mx-auto text-center relative z-10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-5xl font-serif text-foreground mb-6 leading-tight italic">
            Ready to Transform Your Learning Experience?
          </h2>
          
          <p className="text-lg text-muted-foreground mb-12 leading-relaxed">
            Join thousands of students and educators already using Twin Me to create more engaging, 
            accessible, and personalized learning experiences.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button 
              className="artemis-btn-primary text-lg px-10 py-4"
              onClick={() => navigate('/auth')}
            >
              Start Free Trial
            </Button>
            <Button 
              className="artemis-btn-secondary text-lg px-10 py-4"
              onClick={() => navigate('/talk-to-twin')}
            >
              Try Demo
            </Button>
          </div>
          
          <div className="mt-8 text-sm text-muted-foreground">
            No credit card required • 14-day free trial • Cancel anytime
          </div>
        </div>
      </div>
    </section>
  );
};