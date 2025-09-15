import { HeroSection } from '@/components/HeroSection';
import { WhatIsSection } from '@/components/WhatIsSection';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { ComingSoonSection } from '@/components/ComingSoonSection';
import { CTASection } from '@/components/CTASection';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <WhatIsSection />
      <HowItWorksSection />
      <ComingSoonSection />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
