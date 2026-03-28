/**
 * SplitPanelLayout — Dimension.dev-inspired split panel
 * =====================================================
 * Desktop: 60/40 grid with frosted glass panels floating on warm gradient.
 * Tablet: sidebar collapses to drawer.
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
        // Boost ambient orb brightness for the identity page
        '--body-gradient-1': 'rgba(210,145,55,0.50)',
        '--body-gradient-2': 'rgba(180,110,65,0.42)',
        '--body-gradient-3': 'rgba(160,95,55,0.46)',
        '--body-gradient-4': 'rgba(55,45,140,0.38)',
      } as React.CSSProperties}
    >
      {/* ── Desktop: side-by-side grid ─────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_380px] gap-6 max-w-[1200px] mx-auto px-6 py-10">
        {/* Main panel — scrollable */}
        <div
          className="rounded-[24px] px-8 py-10 min-h-0"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(56px)',
            WebkitBackdropFilter: 'blur(56px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {main}
        </div>

        {/* Context sidebar — sticky */}
        <div
          className="rounded-[24px] px-5 py-6 sticky top-[80px] self-start overflow-y-auto"
          style={{
            maxHeight: 'calc(100vh - 100px)',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(56px)',
            WebkitBackdropFilter: 'blur(56px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {sidebar}
        </div>
      </div>

      {/* ── Tablet: drawer toggle ──────────────────────────────────── */}
      <div className="hidden md:block lg:hidden max-w-[720px] mx-auto px-6 py-10">
        <div
          className="rounded-[24px] px-6 py-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(56px)',
            WebkitBackdropFilter: 'blur(56px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {main}
        </div>

        {/* Drawer toggle button */}
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

        {/* Slide-in drawer */}
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
      <div className="block md:hidden max-w-[680px] mx-auto px-5 py-8 space-y-6">
        <div
          className="rounded-[20px] px-5 py-6"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(56px)',
            WebkitBackdropFilter: 'blur(56px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {main}
        </div>
        <div
          className="rounded-[20px] px-5 py-6"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(56px)',
            WebkitBackdropFilter: 'blur(56px)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          {sidebar}
        </div>
      </div>
    </div>
  );
};

export default SplitPanelLayout;
