import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  MapPin,
  GraduationCap,
  Briefcase,
  Heart,
  Loader2,
  Check,
  Sparkles
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { originService, OriginData, OriginQuestions } from '@/services/originService';

interface OriginStepProps {
  userId: string;
  onComplete: (data: OriginData) => void;
  onBack: () => void;
  onSkip: () => void;
}

type Section = 'geographic' | 'education' | 'career' | 'values';

const SECTIONS: { id: Section; icon: React.ElementType; label: string }[] = [
  { id: 'geographic', icon: MapPin, label: 'Origin' },
  { id: 'education', icon: GraduationCap, label: 'Education' },
  { id: 'career', icon: Briefcase, label: 'Career' },
  { id: 'values', icon: Heart, label: 'Values' }
];

const VALUE_OPTIONS = [
  { value: 'integrity', label: 'Integrity' },
  { value: 'creativity', label: 'Creativity' },
  { value: 'family', label: 'Family' },
  { value: 'growth', label: 'Growth' },
  { value: 'freedom', label: 'Freedom' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'security', label: 'Security' },
  { value: 'compassion', label: 'Compassion' },
  { value: 'excellence', label: 'Excellence' },
  { value: 'authenticity', label: 'Authenticity' },
  { value: 'balance', label: 'Balance' },
  { value: 'community', label: 'Community' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'health', label: 'Health' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'innovation', label: 'Innovation' },
  { value: 'justice', label: 'Justice' },
  { value: 'spirituality', label: 'Spirituality' },
  { value: 'success', label: 'Success' },
  { value: 'independence', label: 'Independence' }
];

export const OriginStep: React.FC<OriginStepProps> = ({
  userId,
  onComplete,
  onBack,
  onSkip
}) => {
  const { theme } = useTheme();
  const [currentSection, setCurrentSection] = useState<Section>('geographic');
  const [questions, setQuestions] = useState<OriginQuestions | null>(null);
  const [formData, setFormData] = useState<Partial<OriginData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = {
    textPrimary: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#57534e',
    muted: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
    bg: theme === 'dark' ? '#232320' : '#FAFAFA',
    cardBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(0, 0, 0, 0.03)',
    inputBg: theme === 'dark' ? 'rgba(45, 45, 41, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)',
    borderFocus: theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(0, 0, 0, 0.2)',
    accent: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
    accentBg: theme === 'dark' ? '#232320' : '#FAFAFA',
    tabActiveBg: theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.06)'
  };

  // Load questions and existing data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Always load questions
        const questionsData = await originService.getQuestions();
        setQuestions(questionsData.questions);

        // Only fetch existing data if we have a userId (not in demo mode)
        if (userId) {
          try {
            const existingData = await originService.getOriginData(userId);
            if (existingData.data) {
              setFormData(existingData.data);
            }
          } catch (dataErr) {
            // It's okay if user doesn't have existing data yet
            console.log('No existing origin data for user');
          }
        }
      } catch (err) {
        console.error('Failed to load origin data:', err);
        setError('Failed to load questions. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [userId]);

  const currentSectionIndex = SECTIONS.findIndex(s => s.id === currentSection);
  const progress = ((currentSectionIndex + 1) / SECTIONS.length) * 100;

  const handleFieldChange = (field: string, value: string | number | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleValueToggle = (value: string) => {
    const currentValues = formData.core_values || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : currentValues.length < 5
        ? [...currentValues, value]
        : currentValues;

    handleFieldChange('core_values', newValues);
  };

  const handleNext = async () => {
    const nextIndex = currentSectionIndex + 1;
    if (nextIndex < SECTIONS.length) {
      setCurrentSection(SECTIONS[nextIndex].id);
    } else {
      // Last section - save and complete
      await handleComplete();
    }
  };

  const handlePrevious = () => {
    const prevIndex = currentSectionIndex - 1;
    if (prevIndex >= 0) {
      setCurrentSection(SECTIONS[prevIndex].id);
    } else {
      onBack();
    }
  };

  const handleComplete = async () => {
    // In demo mode (no userId), just complete with local data
    if (!userId) {
      onComplete(formData as OriginData);
      return;
    }

    try {
      setIsSaving(true);
      const result = await originService.saveOriginData(userId, formData);
      if (result.success) {
        onComplete(result.data as OriginData);
      } else {
        setError('Failed to save origin data');
      }
    } catch (err) {
      console.error('Failed to save origin data:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (question: {
    id: string;
    type: string;
    label: string;
    field: string;
    placeholder?: string;
    description?: string;
    options?: { value: string; label: string }[];
    maxSelections?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  }) => {
    const value = formData[question.field as keyof OriginData];

    switch (question.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(question.field, e.target.value)}
            placeholder={question.placeholder}
            maxLength={question.maxLength}
            className="w-full px-4 py-3.5 rounded-xl transition-all duration-300 focus:outline-none backdrop-blur-sm placeholder:text-[rgba(193,192,182,0.4)]"
            style={{
              backgroundColor: colors.inputBg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontFamily: 'var(--font-ui)'
            }}
            onFocus={(e) => e.target.style.borderColor = colors.borderFocus}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(question.field, e.target.value)}
            placeholder={question.placeholder}
            maxLength={question.maxLength}
            rows={4}
            className="w-full px-4 py-3.5 rounded-xl transition-all duration-300 focus:outline-none resize-none backdrop-blur-sm placeholder:text-[rgba(193,192,182,0.4)]"
            style={{
              backgroundColor: colors.inputBg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontFamily: 'var(--font-ui)'
            }}
            onFocus={(e) => e.target.style.borderColor = colors.borderFocus}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) || ''}
            onChange={(e) => handleFieldChange(question.field, parseInt(e.target.value) || 0)}
            placeholder={question.placeholder}
            min={question.min}
            max={question.max}
            className="w-full px-4 py-3.5 rounded-xl transition-all duration-300 focus:outline-none backdrop-blur-sm placeholder:text-[rgba(193,192,182,0.4)]"
            style={{
              backgroundColor: colors.inputBg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontFamily: 'var(--font-ui)'
            }}
            onFocus={(e) => e.target.style.borderColor = colors.borderFocus}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          />
        );

      case 'select':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(question.field, e.target.value)}
            className="w-full px-4 py-3.5 rounded-xl transition-all duration-300 focus:outline-none cursor-pointer backdrop-blur-sm appearance-none bg-no-repeat bg-right pr-10"
            style={{
              backgroundColor: colors.inputBg,
              border: `1px solid ${colors.border}`,
              color: value ? colors.textPrimary : colors.muted,
              fontFamily: 'var(--font-ui)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23C1C0B6' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 1rem center'
            }}
            onFocus={(e) => e.target.style.borderColor = colors.borderFocus}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          >
            <option value="">{question.placeholder || 'Select...'}</option>
            {question.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'multi_select':
        const selectedValues = (value as string[]) || [];
        const maxSelections = question.maxSelections || 10;
        // Use question options if available, otherwise use VALUE_OPTIONS for core_values
        const multiSelectOptions = question.options || (question.field === 'core_values' ? VALUE_OPTIONS : []);

        const handleMultiSelectToggle = (optValue: string) => {
          const newValues = selectedValues.includes(optValue)
            ? selectedValues.filter(v => v !== optValue)
            : selectedValues.length < maxSelections
              ? [...selectedValues, optValue]
              : selectedValues;
          handleFieldChange(question.field, newValues);
        };

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2.5">
              {multiSelectOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleMultiSelectToggle(opt.value)}
                    disabled={!isSelected && selectedValues.length >= maxSelections}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 backdrop-blur-sm",
                      isSelected
                        ? "shadow-sm"
                        : "hover:bg-opacity-60",
                      !isSelected && selectedValues.length >= maxSelections
                        ? "opacity-40 cursor-not-allowed"
                        : ""
                    )}
                    style={{
                      backgroundColor: isSelected ? colors.accent : colors.inputBg,
                      color: isSelected ? colors.accentBg : colors.textSecondary,
                      border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                      fontFamily: 'var(--font-ui)'
                    }}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 inline mr-1.5" strokeWidth={2.5} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p
              className="text-xs tracking-wide"
              style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}
            >
              {selectedValues.length}/{maxSelections} selected
            </p>
          </div>
        );

      case 'ranking':
        // For ranking, we'll display as a simple list for now
        // A full drag-and-drop implementation could be added later
        const items = (question as { items?: { value: string; label: string }[] }).items || [];
        return (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.value}
                className="flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-sm"
                style={{
                  backgroundColor: colors.inputBg,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{
                    backgroundColor: colors.accent,
                    color: colors.accentBg,
                    fontFamily: 'var(--font-ui)'
                  }}
                >
                  {index + 1}
                </span>
                <span
                  className="text-sm"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-ui)' }}
                >
                  {item.label}
                </span>
              </div>
            ))}
            <p
              className="text-xs tracking-wide mt-2"
              style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}
            >
              Default order shown (drag to reorder coming soon)
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  const renderSection = () => {
    if (!questions) return null;

    const sectionData = questions[currentSection];
    if (!sectionData) return null;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSection}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Section Header */}
          <div className="text-center mb-10">
            <h2
              className="text-2xl md:text-3xl mb-3 tracking-tight"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                color: colors.textPrimary
              }}
            >
              {sectionData.title}
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: colors.textSecondary, fontFamily: 'var(--font-ui)' }}
            >
              {sectionData.description}
            </p>
          </div>

          {/* Questions */}
          <div className="space-y-7">
            {sectionData.questions.map((question, index) => (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="space-y-2.5"
              >
                <label
                  className="block text-sm font-medium tracking-wide"
                  style={{ color: colors.textPrimary, fontFamily: 'var(--font-ui)' }}
                >
                  {question.label}
                </label>
                {question.description && (
                  <p
                    className="text-xs leading-relaxed mb-1"
                    style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}
                  >
                    {question.description}
                  </p>
                )}
                {renderField(question)}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: colors.bg }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.muted }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 p-6"
        style={{ backgroundColor: colors.bg }}
      >
        <p style={{ color: colors.textPrimary, fontFamily: 'var(--font-ui)' }}>{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setError(null);
              setCurrentSection('geographic');
            }}
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
            style={{
              backgroundColor: colors.accent,
              color: colors.accentBg,
              fontFamily: 'var(--font-ui)'
            }}
          >
            Retry
          </button>
          <button
            onClick={onSkip}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textSecondary,
              fontFamily: 'var(--font-ui)'
            }}
          >
            <span>Skip this step</span>
            <SkipForward className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: colors.bg, color: colors.textPrimary }}
    >
      {/* Header */}
      <div
        className="px-6 lg:px-[60px] py-5 flex items-center justify-between backdrop-blur-sm"
        style={{
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: 'rgba(35, 35, 32, 0.8)'
        }}
      >
        <button
          onClick={handlePrevious}
          className="flex items-center gap-1.5 transition-all duration-200 hover:opacity-70"
          style={{ color: colors.textSecondary, fontFamily: 'var(--font-ui)' }}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          <span className="text-[14px]">{currentSectionIndex === 0 ? 'Back' : 'Previous'}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4" style={{ color: colors.muted }} strokeWidth={1.5} />
          <span
            className="text-[14px] tracking-wide"
            style={{ fontFamily: 'var(--font-ui)', color: colors.muted }}
          >
            Origin • {currentSectionIndex + 1} of {SECTIONS.length}
          </span>
        </div>

        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-[14px] transition-all duration-200 hover:opacity-70"
          style={{ color: colors.textSecondary, fontFamily: 'var(--font-ui)' }}
        >
          <span>Skip</span>
          <SkipForward className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-6 lg:px-[60px] pt-4 pb-2">
        <div
          className="h-0.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(193, 192, 182, 0.15)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: colors.accent }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Section tabs */}
        <div className="flex justify-center gap-2 mt-8">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;
            const isActive = section.id === currentSection;
            const isPast = index < currentSectionIndex;

            return (
              <button
                key={section.id}
                onClick={() => setCurrentSection(section.id)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-200 backdrop-blur-sm",
                  isActive ? "opacity-100" : "opacity-60 hover:opacity-90"
                )}
                style={{
                  backgroundColor: isActive ? colors.tabActiveBg : 'transparent',
                  border: `1px solid ${isActive ? colors.border : 'transparent'}`,
                  color: colors.textPrimary,
                  fontFamily: 'var(--font-ui)'
                }}
              >
                {isPast ? (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center bg-[#C1C0B6]">
                    <Check className="w-2.5 h-2.5 text-[#232320]" strokeWidth={3} />
                  </div>
                ) : (
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                )}
                <span className="text-sm hidden sm:inline font-medium">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 lg:px-[60px] py-10 overflow-auto">
        <div className="max-w-[600px] mx-auto">
          {renderSection()}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 lg:px-[60px] py-6 backdrop-blur-sm"
        style={{
          backgroundColor: 'rgba(45, 45, 41, 0.3)',
          borderTop: `1px solid ${colors.border}`
        }}
      >
        <div className="max-w-[600px] mx-auto flex justify-between items-center">
          <span
            className="text-[14px] tracking-wide"
            style={{ fontFamily: 'var(--font-ui)', color: colors.muted }}
          >
            All fields are optional
          </span>

          <button
            onClick={handleNext}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-[14px] font-medium transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 shadow-sm"
            style={{
              backgroundColor: colors.accent,
              color: colors.accentBg,
              fontFamily: 'var(--font-ui)'
            }}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                Saving...
              </>
            ) : currentSectionIndex === SECTIONS.length - 1 ? (
              <>
                Complete
                <Check className="w-4 h-4" strokeWidth={2.5} />
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OriginStep;
