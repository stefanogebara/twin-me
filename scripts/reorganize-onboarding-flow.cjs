const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'WelcomeFlow.tsx');

const newContent = `import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Import onboarding steps
import Step1Welcome from './Step1Welcome';
import Step2AboutYouEnhanced from './Step2AboutYouEnhanced';
import Step4ConnectGmail from './Step4ConnectGmail';
import Step7EmailAnalysis from './Step7EmailAnalysis';
import Step13PlatformGallery from './Step13PlatformGallery';
import Step6CreateAccount from './Step6CreateAccount';

/**
 * WelcomeFlow Component
 *
 * Streamlined 6-step onboarding experience (Cofounder-inspired flow):
 * 1. Welcome - Beautiful introduction with Rami quote + Login/Sign Up buttons
 * 2. Create Account - Sign up right after hero (Cofounder pattern)
 * 3. About You + Interests - Name and passion discovery combined
 * 4. Connect Gmail - First platform connection with trust-building
 * 5. Email Analysis - WOW MOMENT showing real insights
 * 6. Platform Gallery - Choose additional platforms to connect
 *
 * Educational content (How It Works, Memory System, Privacy) moved to Help Center
 */

interface WelcomeFlowProps {
  initialStep?: number;
}

const WelcomeFlow: React.FC<WelcomeFlowProps> = ({ initialStep = 1 }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Update step based on URL
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/onboarding/welcome') || path === '/onboarding' || path === '/welcome') {
      setCurrentStep(1);
    } else if (path.includes('/onboarding/create-account')) {
      setCurrentStep(2);
    } else if (path.includes('/onboarding/about')) {
      setCurrentStep(3);
    } else if (path.includes('/onboarding/gmail')) {
      setCurrentStep(4);
    } else if (path.includes('/onboarding/analysis')) {
      setCurrentStep(5);
    } else if (path.includes('/onboarding/platforms')) {
      setCurrentStep(6);
    }
  }, [location.pathname]);

  const goToStep = (step: number) => {
    setCurrentStep(step);

    // Update URL to reflect current step
    const stepRoutes = {
      1: '/onboarding/welcome',
      2: '/onboarding/create-account',
      3: '/onboarding/about',
      4: '/onboarding/gmail',
      5: '/onboarding/analysis',
      6: '/onboarding/platforms'
    };

    navigate(stepRoutes[step as keyof typeof stepRoutes] || '/onboarding/welcome');
  };

  const nextStep = () => {
    if (currentStep < 6) {
      goToStep(currentStep + 1);
    } else {
      // Onboarding complete - redirect to Soul Signature Dashboard
      navigate('/soul-signature');
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  };

  // Progress indicator
  const ProgressIndicator = () => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div
              key={step}
              className="flex-1 h-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor: step <= currentStep ? '#141413' : '#E7E5E4'
              }}
            />
          ))}
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-stone-600">
            Step {currentStep} of 6
          </span>
          <span className="text-xs text-stone-400">
            {Math.round((currentStep / 6) * 100)}% complete
          </span>
        </div>
      </div>
    </div>
  );

  // Render current step component
  const renderStep = () => {
    const stepProps = {
      onNext: nextStep,
      onPrev: prevStep,
      goToStep
    };

    switch (currentStep) {
      case 1:
        return <Step1Welcome {...stepProps} />;
      case 2:
        return <Step6CreateAccount {...stepProps} />;
      case 3:
        return <Step2AboutYouEnhanced {...stepProps} />;
      case 4:
        return <Step4ConnectGmail {...stepProps} />;
      case 5:
        return <Step7EmailAnalysis {...stepProps} />;
      case 6:
        return <Step13PlatformGallery {...stepProps} />;
      default:
        return <Step1Welcome {...stepProps} />;
    }
  };

  return (
    <div className="min-h-screen">
      {currentStep > 1 && <ProgressIndicator />}
      <div className={currentStep > 1 ? 'pt-16' : ''}>
        {renderStep()}
      </div>
    </div>
  );
};

export default WelcomeFlow;
`;

fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ WelcomeFlow.tsx reorganized with Cofounder-inspired flow!');
console.log('   New step order:');
console.log('   1. Welcome (Hero with Login/Sign Up buttons)');
console.log('   2. Create Account');
console.log('   3. About You + Interests');
console.log('   4. Connect Gmail');
console.log('   5. Email Analysis');
console.log('   6. Platform Gallery');
console.log('');
console.log('   URL mapping updated:');
console.log('   - /onboarding/welcome → Step 1');
console.log('   - /onboarding/create-account → Step 2');
console.log('   - /onboarding/about → Step 3');
console.log('   - /onboarding/gmail → Step 4');
console.log('   - /onboarding/analysis → Step 5');
console.log('   - /onboarding/platforms → Step 6');
