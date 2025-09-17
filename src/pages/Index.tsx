import { ArtemisNavigation } from '@/components/ArtemisNavigation';
import { ArtemisHeroSection } from '@/components/ArtemisHeroSection';
import { ArtemisWorksSection } from '@/components/ArtemisWorksSection';
import { ArtemisHowItWorksSection } from '@/components/ArtemisHowItWorksSection';
import { ArtemisCTASection } from '@/components/ArtemisCTASection';
import { ArtemisFooter } from '@/components/ArtemisFooter';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <ArtemisNavigation />
      <ArtemisHeroSection />
      <ArtemisWorksSection />
      <ArtemisHowItWorksSection />
      <ArtemisCTASection />
      <ArtemisFooter />
    </div>
  );
};

export default Index;
