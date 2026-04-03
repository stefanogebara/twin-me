/**
 * SplitPanelLayout — Dimension.dev-inspired split panel
 * =====================================================
 * No big container cards. Individual sections float as glass cards
 * on the warm gradient background. The grid just provides structure.
 *
 * Desktop: 60/40 grid, sidebar sticky.
 * Tablet: full-width main + drawer sidebar.
 * Mobile: single column stack.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

interface SplitPanelLayoutProps {
  main: React.ReactNode;
  sidebar: React.ReactNode;
}

const SplitPanelLayout: React.FC<SplitPanelLayoutProps> = ({ main, sidebar }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        '--body-gradient-1': 'rgba(210,145,55,0.50)',
        '--body-gradient-2': 'rgba(180,110,65,0.42)',
        '--body-gradient-3': 'rgba(160,95,55,0.46)',
        '--body-gradient-4': 'rgba(55,45,140,0.38)',
      } as React.CSSProperties}
    >
      {/* ── Desktop: side-by-side grid ─────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_380px] gap-8 max-w-[1200px] mx-auto px-6 py-10">
        {/* Main — no wrapper, sections float individually */}
        <div className="min-w-0">
          {main}
        </div>

        {/* Sidebar — sticky, no outer card */}
        <div
          className="sticky top-[80px] self-start overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 100px)' }}
        >
          {sidebar}
        </div>
      </div>

      {/* ── Tablet: drawer toggle ──────────────────────────────────── */}
      <div className="hidden md:block lg:hidden max-w-[720px] mx-auto px-6 py-10">
        <div>{main}</div>

        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="fixed right-4 bottom-36 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
          aria-label={drawerOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {drawerOpen
            ? <PanelRightClose className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
            : <PanelRightOpen className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
          }
        </button>

        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-40"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
              />
              <motion.div
                className="fixed right-0 top-0 bottom-0 z-50 w-[380px] max-w-[85vw] overflow-y-auto px-5 py-6"
                style={{
                  background: 'rgba(20,18,28,0.95)',
                  backdropFilter: 'blur(56px)',
                  WebkitBackdropFilter: 'blur(56px)',
                  borderLeft: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
                }}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                {sidebar}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile: single column ──────────────────────────────────── */}
      <div className="block md:hidden max-w-[680px] mx-auto px-4 sm:px-5 py-8 space-y-6">
        <div>{main}</div>
        <div>{sidebar}</div>
      </div>
    </div>
  );
};

export default SplitPanelLayout;
