import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Send } from 'lucide-react';
import { enrichmentService, EnrichmentData, QuickEnrichmentData, ConfirmedData } from '@/services/enrichmentService';

interface DiscoveryStepProps {
  userId: string;
  userEmail: string;
  userName?: string;
  onComplete: (data: ConfirmedData) => void;
  onSkip: () => void;
}

type ConversationStep = 'greeting' | 'name-confirm' | 'searching' | 'narrative' | 'correction-form';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  isTyping?: boolean;
}

export const DiscoveryStep: React.FC<DiscoveryStepProps> = ({
  userId,
  userEmail,
  userName,
  onComplete,
  onSkip
}) => {
  const [step, setStep] = useState<ConversationStep>('greeting');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData | null>(null);
  const [quickData, setQuickData] = useState<QuickEnrichmentData | null>(null);
  const [confirmedName, setConfirmedName] = useState(userName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showYesNo, setShowYesNo] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Correction form state
  const [formName, setFormName] = useState('');
  const [formLinkedIn, setFormLinkedIn] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStartedRef = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start the conversation
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startConversation();
  }, []);

  const addMessage = (type: 'bot' | 'user', content: string) => {
    const id = Date.now().toString();
    setMessages(prev => [...prev, { id, type, content }]);
    return id;
  };

  const typeMessage = async (content: string, delay: number = 30) => {
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 400));

    const id = Date.now().toString();
    setMessages(prev => [...prev, { id, type: 'bot', content: '', isTyping: true }]);

    for (let i = 0; i <= content.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      setMessages(prev =>
        prev.map(msg => msg.id === id ? { ...msg, content: content.slice(0, i) } : msg)
      );
    }

    setMessages(prev =>
      prev.map(msg => msg.id === id ? { ...msg, isTyping: false } : msg)
    );
    setIsTyping(false);
    return id;
  };

  const startConversation = async () => {
    await typeMessage("Hey there. I'm going to learn a bit about you.", 25);
    await new Promise(resolve => setTimeout(resolve, 600));

    const detectedName = userName || userEmail.split('@')[0];
    await typeMessage(`It looks like your name is ${detectedName}. Should I call you that?`, 25);

    setStep('name-confirm');
    setConfirmedName(detectedName);
  };

  const handleNameSubmit = async () => {
    if (!userInput.trim() && !confirmedName) return;

    const finalName = userInput.trim() || confirmedName;
    addMessage('user', finalName);
    setUserInput('');
    setConfirmedName(finalName);

    await new Promise(resolve => setTimeout(resolve, 400));

    setStep('searching');
    await typeMessage(`Nice to meet you, ${finalName.split(' ')[0]}. Let me see what I can discover about you...`, 25);

    await startEnrichment(finalName);
  };

  const startEnrichment = async (name: string) => {
    setIsLoading(true);

    try {
      // ─── Phase 1: Instant free lookup (Gravatar + GitHub) ───
      // Returns in < 1 second with photo + basic info
      const quickResult = await enrichmentService.quickEnrich();
      const q = quickResult?.data;
      const hasQuickData = q && q.source !== 'none' && q.source !== 'error';

      if (hasQuickData) {
        setQuickData(q);
        // Show instant reveal with whatever we found
        const revealParts: string[] = [];
        if (q.discovered_bio) revealParts.push(q.discovered_bio);
        if (q.discovered_company) revealParts.push(`Works at ${q.discovered_company}`);
        if (q.discovered_location) revealParts.push(`Based in ${q.discovered_location}`);
        if (q.github_repos && q.github_repos > 5) revealParts.push(`${q.github_repos} public repos on GitHub`);

        if (revealParts.length > 0) {
          await typeMessage(`Here's what I found about you:\n\n${revealParts.join('\n')}`, 20);
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }

      // ─── Phase 2: Check for existing full enrichment data ───
      const statusResult = await enrichmentService.getStatus(userId);
      if (statusResult.hasEnrichment) {
        const resultsResult = await enrichmentService.getResults(userId);
        if (resultsResult.data && hasUsefulData(resultsResult.data)) {
          setEnrichmentData(resultsResult.data);
          await showNarrative(resultsResult.data, name);
          return;
        }
      }

      // ─── Phase 3: Full AI-powered enrichment (slower) ───
      if (hasQuickData && !q?.discovered_company) {
        await typeMessage("Let me dig a bit deeper...", 25);
      }

      const searchResult = await enrichmentService.search(userId, userEmail, name);

      if (searchResult.data && hasUsefulData(searchResult.data)) {
        setEnrichmentData(searchResult.data);
        await showNarrative(searchResult.data, name);
      } else if (hasQuickData) {
        // We have quick data but no deep data - still ask for confirmation
        await typeMessage("Does this sound like you?", 30);
        setStep('narrative');
        setShowYesNo(true);
      } else {
        await typeMessage("I found a few people with your name, but I want to make sure I have the right one. Could you share your LinkedIn profile?", 25);
        setStep('correction-form');
        setFormName(name);
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      await typeMessage("I had some trouble searching. Let's do this manually.", 25);
      setStep('correction-form');
      setFormName(name);
    } finally {
      setIsLoading(false);
    }
  };

  const hasUsefulData = (data: EnrichmentData) => {
    const hasProfessionalInfo = data.discovered_company || data.discovered_title || data.discovered_location;
    const hasMeaningfulSummary = data.discovered_summary &&
      data.discovered_summary.length > 50 &&
      !data.discovered_summary.match(/^[A-Za-z\s]+\.$/);
    const hasCareerInfo = data.career_timeline &&
      !data.career_timeline.includes('No information found') &&
      data.career_timeline.length > 100;

    return hasProfessionalInfo || hasMeaningfulSummary || hasCareerInfo;
  };

  const buildNarrativeParagraph = (data: EnrichmentData, name: string): string => {
    // Build a comprehensive narrative showing ALL discovered data
    const lines: string[] = [];

    // 1. Basic identity line
    if (data.discovered_title && data.discovered_company) {
      const titleLower = data.discovered_title.toLowerCase();
      const companyLower = data.discovered_company.toLowerCase();
      const locationPart = data.discovered_location ? `, based in ${data.discovered_location}` : '';

      if (titleLower.includes(companyLower)) {
        lines.push(`${name} is ${data.discovered_title}${locationPart}.`);
      } else {
        lines.push(`${name} is ${data.discovered_title} at ${data.discovered_company}${locationPart}.`);
      }
    } else if (data.discovered_title) {
      const locationPart = data.discovered_location ? `, based in ${data.discovered_location}` : '';
      lines.push(`${name} is ${data.discovered_title}${locationPart}.`);
    } else if (data.discovered_company) {
      const locationPart = data.discovered_location ? `, based in ${data.discovered_location}` : '';
      lines.push(`${name} works at ${data.discovered_company}${locationPart}.`);
    } else if (data.discovered_location) {
      lines.push(`${name} is based in ${data.discovered_location}.`);
    }

    // 2. Add career timeline if available (shows work history)
    if (data.career_timeline && data.career_timeline.length > 20) {
      // Format career timeline nicely
      const careers = data.career_timeline.split('\n\n').filter(c => c.trim());
      if (careers.length > 0) {
        lines.push('');
        lines.push('**Career History:**');
        careers.slice(0, 3).forEach(career => {
          // Extract just the role and company from each entry
          const firstLine = career.split('\n')[0].trim();
          lines.push(`• ${firstLine}`);
        });
        if (careers.length > 3) {
          lines.push(`• ...and ${careers.length - 3} more positions`);
        }
      }
    }

    // 3. Add education if available
    if (data.education && data.education.length > 10) {
      lines.push('');
      lines.push('**Education:**');
      lines.push(`• ${data.education}`);
    }

    // 4. Add skills if available
    if (data.skills && data.skills.length > 5) {
      lines.push('');
      lines.push('**Skills:**');
      lines.push(`• ${data.skills}`);
    }

    // 5. Add bio/summary if available
    if (data.discovered_bio && data.discovered_bio.length > 20) {
      lines.push('');
      lines.push(`**About:** ${data.discovered_bio}`);
    } else if (data.discovered_summary && data.discovered_summary.length > 20) {
      lines.push('');
      lines.push(`**About:** ${data.discovered_summary}`);
    }

    // If we have nothing, return empty
    if (lines.length === 0) {
      return `I couldn't find much public information about ${name}.`;
    }

    return lines.join('\n');
  };

  const showNarrative = async (data: EnrichmentData, name: string) => {
    const narrative = buildNarrativeParagraph(data, data.discovered_name || name);

    await new Promise(resolve => setTimeout(resolve, 600));
    await typeMessage(narrative, 20);

    await new Promise(resolve => setTimeout(resolve, 500));
    await typeMessage("Does this sound like you?", 30);

    setStep('narrative');
    setShowYesNo(true);
  };

  const handleYes = async () => {
    setShowYesNo(false);
    addMessage('user', "Yes, that's me");

    await new Promise(resolve => setTimeout(resolve, 400));
    await typeMessage("Perfect. Let's continue building your soul signature.", 25);

    const confirmedData: ConfirmedData = {
      name: enrichmentData?.discovered_name || quickData?.discovered_name || confirmedName,
      company: enrichmentData?.discovered_company || quickData?.discovered_company || undefined,
      title: enrichmentData?.discovered_title,
      location: enrichmentData?.discovered_location || quickData?.discovered_location || undefined,
      bio: enrichmentData?.discovered_bio || enrichmentData?.discovered_summary || quickData?.discovered_bio || undefined,
      github_url: enrichmentData?.discovered_github_url || quickData?.discovered_github_url || undefined,
    };

    if (enrichmentData) {
      await enrichmentService.confirm(userId, confirmedData);
    }

    setTimeout(() => onComplete(confirmedData), 1200);
  };

  const handleNo = async () => {
    setShowYesNo(false);
    addMessage('user', "Not quite");

    await new Promise(resolve => setTimeout(resolve, 400));
    await typeMessage("No problem. Share your LinkedIn and I'll try again.", 25);

    setStep('correction-form');
    setFormName(enrichmentData?.discovered_name || confirmedName);
  };

  const handleResearchAgain = async () => {
    if (!formLinkedIn.trim() && !formName.trim()) return;

    setIsLoading(true);

    try {
      if (formLinkedIn.trim()) {
        const result = await enrichmentService.enrichFromLinkedIn(userId, formLinkedIn.trim(), formName);

        if (result.data && hasUsefulData(result.data as EnrichmentData)) {
          setEnrichmentData(result.data as EnrichmentData);
          await showNarrative(result.data as EnrichmentData, formName);
          return;
        }
      }

      const confirmedData: ConfirmedData = {
        name: formName,
        bio: undefined
      };

      await typeMessage(`Thanks, ${formName.split(' ')[0]}. Let's move forward.`, 25);
      setTimeout(() => onComplete(confirmedData), 1200);

    } catch (error) {
      console.error('Research error:', error);
      const confirmedData: ConfirmedData = { name: formName };
      setTimeout(() => onComplete(confirmedData), 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step === 'name-confirm') {
        handleNameSubmit();
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      {/* Google Fonts */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');

          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{
            fontFamily: 'var(--font-heading)',
            color: '#E8D5B7'
          }}
        >
          Twin Me
        </div>
        <button
          onClick={onSkip}
          className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
          style={{
            fontFamily: 'var(--font-body)',
            color: '#E8D5B7',
            letterSpacing: '0.1em'
          }}
        >
          Skip
        </button>
      </div>

      {/* Profile Photo Reveal */}
      {quickData?.discovered_photo && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex justify-center pt-4 pb-2"
        >
          <img
            src={quickData.discovered_photo}
            alt=""
            className="w-20 h-20 rounded-full object-cover"
            style={{ border: '2px solid rgba(232, 213, 183, 0.3)' }}
          />
        </motion.div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8">
        <div className="max-w-2xl mx-auto py-8">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`mb-6 ${message.type === 'user' ? 'flex justify-end' : ''}`}
              >
                {message.type === 'bot' ? (
                  <p
                    className="text-xl md:text-2xl leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 400,
                      color: 'rgba(232, 213, 183, 0.9)',
                      maxWidth: '85%'
                    }}
                  >
                    {message.content}
                    {message.isTyping && (
                      <span
                        className="inline-block w-0.5 h-6 ml-1 rounded-full"
                        style={{
                          backgroundColor: '#E8D5B7',
                          animation: 'blink 1s ease-in-out infinite'
                        }}
                      />
                    )}
                  </p>
                ) : (
                  <div
                    className="inline-block px-5 py-3 rounded-2xl text-base"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.1)',
                      border: '1px solid rgba(232, 213, 183, 0.2)',
                      color: '#E8D5B7',
                      fontFamily: 'var(--font-body)'
                    }}
                  >
                    {message.content}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Yes/No buttons */}
          {showYesNo && step === 'narrative' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex gap-4 mt-8"
            >
              <button
                onClick={handleYes}
                className="px-8 py-3 rounded-full text-base transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  color: '#0C0C0C',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500
                }}
              >
                Yes, that's me
              </button>
              <button
                onClick={handleNo}
                className="px-8 py-3 rounded-full text-base transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(232, 213, 183, 0.3)',
                  color: '#E8D5B7',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500
                }}
              >
                Not quite
              </button>
            </motion.div>
          )}

          {/* Correction form */}
          {step === 'correction-form' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 space-y-5"
            >
              <div>
                <label
                  className="block text-sm mb-2 uppercase tracking-wider"
                  style={{
                    color: 'rgba(232, 213, 183, 0.5)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.1em'
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-5 py-4 rounded-xl text-base focus:outline-none transition-all"
                  style={{
                    backgroundColor: 'rgba(232, 213, 183, 0.05)',
                    border: '1px solid rgba(232, 213, 183, 0.15)',
                    color: '#E8D5B7',
                    fontFamily: 'var(--font-body)'
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-sm mb-2 uppercase tracking-wider"
                  style={{
                    color: 'rgba(232, 213, 183, 0.5)',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.1em'
                  }}
                >
                  LinkedIn Profile
                </label>
                <input
                  type="url"
                  value={formLinkedIn}
                  onChange={e => setFormLinkedIn(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="w-full px-5 py-4 rounded-xl text-base focus:outline-none transition-all"
                  style={{
                    backgroundColor: 'rgba(232, 213, 183, 0.05)',
                    border: '1px solid rgba(232, 213, 183, 0.15)',
                    color: '#E8D5B7',
                    fontFamily: 'var(--font-body)'
                  }}
                />
              </div>

              <button
                onClick={handleResearchAgain}
                disabled={isLoading || !formName.trim()}
                className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 disabled:opacity-50 hover:scale-[1.01]"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  color: '#0C0C0C',
                  fontFamily: 'var(--font-body)'
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  'Continue'
                )}
              </button>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - only show during name confirmation */}
      {step === 'name-confirm' && !isTyping && (
        <div className="p-6 md:p-8">
          <div className="max-w-2xl mx-auto">
            <div
              className="relative rounded-2xl overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: 'rgba(232, 213, 183, 0.05)',
                border: '1px solid rgba(232, 213, 183, 0.15)',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your name, or press Enter to confirm..."
                className="w-full px-5 py-4 pr-14 text-base focus:outline-none bg-transparent"
                style={{
                  color: '#E8D5B7',
                  fontFamily: 'var(--font-body)'
                }}
              />
              <button
                onClick={handleNameSubmit}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#0C0C0C]" />
                ) : (
                  <Send className="w-4 h-4 text-[#0C0C0C]" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryStep;
