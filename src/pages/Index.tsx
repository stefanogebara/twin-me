import { Navigation } from '@/components/Navigation';
import { ModernHeroSection } from '@/components/ModernHeroSection';
import { WorksSection } from '@/components/WorksSection';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <ModernHeroSection />
      <WorksSection />
      <Footer />
    </div>
  );
};

export default Index;
