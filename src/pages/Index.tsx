import { ArtemisNavigation } from '@/components/ArtemisNavigation';
import { ArtemisHeroSection } from '@/components/ArtemisHeroSection';
import { ArtemisFeaturesSection } from '@/components/ArtemisFeaturesSection';
import { ArtemisHowItWorksSection } from '@/components/ArtemisHowItWorksSection';
import { ArtemisTestimonialsSection } from '@/components/ArtemisTestimonialsSection';
import { ArtemisCTASection } from '@/components/ArtemisCTASection';
import { ArtemisFooter } from '@/components/ArtemisFooter';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <ArtemisNavigation />
      <ArtemisHeroSection />
      <ArtemisFeaturesSection />
      <ArtemisHowItWorksSection />
      <ArtemisTestimonialsSection />
      <ArtemisCTASection />
      <ArtemisFooter />
    </div>
  );
};

export default Index;
