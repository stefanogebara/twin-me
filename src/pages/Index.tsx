import { Navigation } from '@/components/Navigation';
import { ModernHeroSection } from '@/components/ModernHeroSection';
import { WhatIBringSection } from '@/components/WhatIBringSection';
import { WorksSection } from '@/components/WorksSection';
import { BehindTheCanvasSection } from '@/components/BehindTheCanvasSection';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <ModernHeroSection />
      <WhatIBringSection />
      <WorksSection />
      <BehindTheCanvasSection />
      <Footer />
    </div>
  );
};

export default Index;
