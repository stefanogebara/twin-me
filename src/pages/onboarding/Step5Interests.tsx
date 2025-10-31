import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Sparkles } from 'lucide-react';

const Step5Interests = () => {
  const navigate = useNavigate();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInterest, setCustomInterest] = useState('');

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

  const handleContinue = () => {
    if (selectedInterests.length > 0) {
      sessionStorage.setItem('onboarding_interests', selectedInterests.join(', '));
      navigate('/step6');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-4xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100 mb-4">
            <Sparkles className="w-8 h-8 text-violet-600" />
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
                      className={`
                        px-4 py-2 text-[15px] leading-5 font-medium rounded-lg border transition-all duration-200
                        ${isSelected
                          ? 'bg-indigo-500 text-white border-indigo-500 shadow-md hover:bg-indigo-600'
                          : 'bg-white text-stone-900 border-stone-200 hover:border-stone-300 hover:shadow-sm'
                        }
                      `}
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
              className="inline-flex items-center gap-2 px-4 py-2 text-[15px] leading-5 font-medium text-stone-600 bg-stone-50 border border-stone-200 rounded-lg transition-all duration-200 hover:bg-white hover:border-stone-300 hover:text-stone-900"
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
                className="flex-1 px-4 py-2 text-[15px] leading-5 text-stone-900 placeholder:text-stone-400 bg-white border border-stone-200 rounded-lg shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
                autoFocus
              />
              <button
                onClick={handleAddCustom}
                disabled={!customInterest.trim()}
                className="px-4 py-2 text-[15px] leading-5 font-medium text-white bg-indigo-500 rounded-lg transition-all duration-200 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomInterest('');
                }}
                className="px-4 py-2 text-[15px] leading-5 font-medium text-stone-600 bg-stone-50 rounded-lg transition-all duration-200 hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Selected Interests Preview */}
        {selectedInterests.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-3">
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
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg"
                >
                  {interest}
                  <button
                    onClick={() => toggleInterest(interest)}
                    className="hover:text-indigo-900 transition-colors duration-200"
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
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] leading-5 font-medium text-stone-900 bg-white border border-stone-200 rounded-xl transition-all duration-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate('/step6')}
            className="text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step5Interests;
