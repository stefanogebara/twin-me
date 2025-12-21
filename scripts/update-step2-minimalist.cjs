const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'Step2AboutYouEnhanced.tsx');

const newContent = `import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Sparkles } from 'lucide-react';

/**
 * Step2AboutYouEnhanced Component
 *
 * Merged component combining:
 * - Step2AboutYou (name collection)
 * - Step5Interests (passion discovery)
 *
 * This provides a smoother onboarding flow by collecting
 * basic info and interests in one consolidated step.
 */

interface Step2AboutYouEnhancedProps {
  onNext?: () => void;
  onPrev?: () => void;
  goToStep?: (step: number) => void;
}

const Step2AboutYouEnhanced: React.FC<Step2AboutYouEnhancedProps> = ({
  onNext,
  onPrev
}) => {
  const navigate = useNavigate();

  // Form state
  const [fullName, setFullName] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInterest, setCustomInterest] = useState('');
  const [showInterests, setShowInterests] = useState(false);

  const interestCategories = [
    {
      name: 'Technology',
      interests: ['Programming', 'AI & Machine Learning', 'Cybersecurity', 'Gaming', 'Web Development', 'Mobile Apps']
    },
    {
      name: 'Arts & Culture',
      interests: ['Photography', 'Painting', 'Music Production', 'Writing', 'Film & Cinema', 'Design']
    },
    {
      name: 'Sports & Fitness',
      interests: ['Running', 'Yoga', 'Weightlifting', 'Cycling', 'Swimming', 'Hiking']
    },
    {
      name: 'Entertainment',
      interests: ['Movies & TV', 'Podcasts', 'Reading', 'Board Games', 'Video Games', 'Theater']
    },
    {
      name: 'Learning',
      interests: ['History', 'Science', 'Philosophy', 'Languages', 'Psychology', 'Economics']
    },
    {
      name: 'Lifestyle',
      interests: ['Cooking', 'Travel', 'Fashion', 'Gardening', 'DIY Projects', 'Meditation']
    }
  ];

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleAddCustom = () => {
    if (customInterest.trim() && !selectedInterests.includes(customInterest.trim())) {
      setSelectedInterests(prev => [...prev, customInterest.trim()]);
      setCustomInterest('');
      setShowCustomInput(false);
    }
  };

  const handleNameSubmit = () => {
    if (fullName.trim()) {
      sessionStorage.setItem('onboarding_name', fullName);
      setShowInterests(true);
    }
  };

  const handleContinue = () => {
    if (selectedInterests.length > 0) {
      sessionStorage.setItem('onboarding_interests', selectedInterests.join(', '));
    }

    // Call onNext if provided (from WelcomeFlow), otherwise navigate directly
    if (onNext) {
      onNext();
    } else {
      navigate('/onboarding/gmail');
    }
  };

  const handleBack = () => {
    if (showInterests) {
      setShowInterests(false);
    } else if (onPrev) {
      onPrev();
    } else {
      navigate(-1);
    }
  };

  // Name collection view
  if (!showInterests) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20" style={{ background: '#FAFAFA' }}>
        <button
          onClick={handleBack}
          className="absolute top-8 left-8 text-[15px] text-stone-600 hover:text-stone-900 transition-colors"
        >
          Back
        </button>

        <div className="w-full max-w-md space-y-12">
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 text-center font-garamond">
            Tell me about yourself
          </h1>

          <div className="space-y-6">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="What's your full name?"
              className="w-full px-5 py-4 text-[15px] leading-5 text-stone-900 placeholder:text-stone-400 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleNameSubmit();
                }
              }}
              autoFocus
            />

            <button
              onClick={handleNameSubmit}
              disabled={!fullName.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-xl transition-all duration-200 hover:bg-stone-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interests selection view
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20" style={{ background: '#FAFAFA' }}>
      <button
        onClick={handleBack}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-4xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'rgba(0, 0, 0, 0.04)'
            }}
          >
            <Sparkles className="w-8 h-8 text-stone-600" />
          </div>
          <h1 className="text-4xl font-normal tracking-tight text-stone-900 font-garamond">
            What are you passionate about?
          </h1>
          <p className="text-[15px] leading-6 text-stone-600">
            Select the interests that resonate with you. Choose as many as you like.
          </p>
          <p className="text-sm text-stone-400">
            Selected: <span className="font-medium text-stone-600">{selectedInterests.length}</span>
          </p>
        </div>

        {/* Interest Categories */}
        <div className="space-y-8">
          {interestCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="space-y-3">
              <h2 className="text-sm font-medium text-stone-900 uppercase tracking-wide">
                {category.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {category.interests.map((interest, interestIndex) => {
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interestIndex}
                      onClick={() => toggleInterest(interest)}
                      className={\`
                        px-4 py-2 text-[15px] leading-5 font-medium rounded-lg border transition-all duration-200
                        \${isSelected
                          ? 'bg-stone-900 text-white border-stone-900 shadow-md hover:bg-stone-800'
                          : 'bg-white text-stone-900 border-stone-200 hover:border-stone-300 hover:shadow-sm'
                        }
                      \`}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Custom Interest Input */}
        <div className="flex flex-col items-center gap-4">
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-[15px] leading-5 font-medium text-stone-600 bg-white border border-stone-200 rounded-lg transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900"
            >
              <Plus className="w-4 h-4" />
              Add custom interest
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full max-w-md">
              <input
                type="text"
                value={customInterest}
                onChange={(e) => setCustomInterest(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                placeholder="Type your custom interest..."
                className="flex-1 px-4 py-2 text-[15px] leading-5 text-stone-900 placeholder:text-stone-400 bg-white border border-stone-200 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
                autoFocus
              />
              <button
                onClick={handleAddCustom}
                disabled={!customInterest.trim()}
                className="px-4 py-2 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-lg transition-all duration-200 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomInterest('');
                }}
                className="px-4 py-2 text-[15px] leading-5 font-medium text-stone-600 bg-white rounded-lg transition-all duration-200 hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Selected Interests Preview */}
        {selectedInterests.length > 0 && (
          <div
            className="rounded-xl border p-6 space-y-3"
            style={{
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-stone-900">Your selections</h3>
              <button
                onClick={() => setSelectedInterests([])}
                className="text-sm text-stone-600 hover:text-stone-900 transition-colors duration-200"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedInterests.map((interest, index) => (
                <div
                  key={index}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-700 bg-stone-100 border border-stone-200 rounded-lg"
                >
                  {interest}
                  <button
                    onClick={() => toggleInterest(interest)}
                    className="hover:text-stone-900 transition-colors duration-200"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue Button */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleContinue}
            disabled={selectedInterests.length === 0}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-xl transition-all duration-200 hover:bg-stone-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleContinue}
            className="text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step2AboutYouEnhanced;
`;

fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ Step2AboutYouEnhanced.tsx updated to minimalist gray design!');
console.log('   - Changed background to #FAFAFA (light gray)');
console.log('   - Removed violet/indigo colors');
console.log('   - Updated icon background to subtle gray (rgba(0, 0, 0, 0.04))');
console.log('   - Changed selected interests from indigo to stone-900 (dark gray)');
console.log('   - Updated buttons to stone-900/stone-800 hover');
console.log('   - Applied glassmorphism to selections card');
console.log('   - All accents now stone-gray tones');
