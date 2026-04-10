/**
 * WikiPage
 *
 * Displays the user's compiled knowledge base -- 5 domain pages
 * that the LLM Wiki system builds from platform observations and reflections.
 *
 * Each domain card shows cross-referenced, incrementally compiled knowledge
 * that compounds over time.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import { getWikiPages, type WikiPage as WikiPageType } from '@/services/api/wikiAPI';
import WikiDomainCard from './components/wiki/WikiDomainCard';

// Domain display order
const DOMAIN_ORDER = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'];

const WikiPageView: React.FC = () => {
  useDocumentTitle('Knowledge Base');
  const { user } = useAuth();

  const domainRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const { data: pages, isLoading, error } = useQuery({
    queryKey: ['wiki-pages', user?.id],
    queryFn: getWikiPages,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: !!user?.id,
  });

  // Handle cross-reference clicks -- scroll to the target domain card
  const handleDomainClick = useCallback((domain: string) => {
    const ref = domainRefs.current[domain];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Brief highlight flash via CSS class (no direct DOM mutation)
      ref.style.outline = '1px solid rgba(255,132,0,0.4)';
      ref.style.outlineOffset = '4px';
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        if (ref) ref.style.outline = 'none';
        highlightTimerRef.current = null;
      }, 1500);
    }
  }, []);

  // Sort pages by domain order
  const sortedPages = pages
    ? DOMAIN_ORDER
        .map(d => pages.find(p => p.domain === d))
        .filter((p): p is WikiPageType => p != null)
    : [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[20px] h-48 animate-pulse"
            style={{ background: 'var(--glass-surface-bg)' }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <BookOpen
          className="mx-auto mb-4 opacity-30"
          size={40}
          style={{ color: 'var(--text-muted)' }}
        />
        <h2
          className="text-[18px] font-semibold tracking-tight mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Something went wrong
        </h2>
        <p className="text-[14px] mb-4" style={{ color: 'var(--text-muted)' }}>
          Could not load your knowledge base. Please try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-[13px] px-3 py-1.5 rounded-[100px]"
          style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', color: 'var(--text-primary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <BookOpen
          className="mx-auto mb-4 opacity-30"
          size={40}
          style={{ color: 'var(--text-muted)' }}
        />
        <h2
          className="text-[18px] font-semibold tracking-tight mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Knowledge Base
        </h2>
        <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
          Your knowledge base is still being compiled. Connect platforms and chat
          with your twin to build up enough data for the first compilation.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1
          className="text-[24px] font-semibold tracking-tight mb-1"
          style={{ color: 'var(--text-primary)', fontFamily: "'Instrument Serif', serif" }}
        >
          Knowledge Base
        </h1>
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Compiled from {sortedPages.reduce((sum, p) => sum + p.version, 0)} compilation
          {sortedPages.reduce((sum, p) => sum + p.version, 0) !== 1 ? 's' : ''} across{' '}
          {sortedPages.length} domains. Cross-references link patterns across your life.
        </p>
      </motion.div>

      {/* Domain cards */}
      <div className="space-y-4">
        {sortedPages.map((page, i) => (
          <div
            key={page.domain}
            ref={el => { domainRefs.current[page.domain] = el; }}
            className="transition-all duration-300"
          >
            <WikiDomainCard
              page={page}
              onDomainClick={handleDomainClick}
              index={i}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WikiPageView;
