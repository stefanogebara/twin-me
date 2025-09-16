import { Navigation } from '@/components/Navigation';
import { ModernHeroSection } from '@/components/ModernHeroSection';
import { ArchitectureSection } from '@/components/ArchitectureSection';
import { TrustedBySection } from '@/components/TrustedBySection';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <ModernHeroSection />
      <ArchitectureSection />
      <TrustedBySection />
      <Footer />
    </div>
  );
};

export default Index;
