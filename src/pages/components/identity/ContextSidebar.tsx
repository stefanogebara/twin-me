/**
 * ContextSidebar — Right panel for split-panel identity layout
 * =============================================================
 * Individual glass cards stacked on the gradient, not one big container.
 * Card 1: Soul Score ring + contributor grid
 * Card 2: Tabbed content (Soul / Insights / Activity)
 * Card 3: Chat CTA
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, ArrowRight, Clock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { authFetch } from '@/services/api/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import SoulScore from './SoulScore';
import InsightCards from './InsightCards';
import SidebarTabs, { type SidebarTab } from './SidebarTabs';

const glassStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(42px)',
  WebkitBackdropFilter: 'blur(42px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.15)',
};

interface ContextSidebarProps {
  className?: string;
}

const ContextSidebar: React.FC<ContextSidebarProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('soul');
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: activityData } = useQuery<{ memories?: { content: string; memory_type: string; created_at: string }[] }>({
    queryKey: ['sidebar-activity'],
    queryFn: async () => {
      const res = await authFetch('/twin/identity');
      if (!res.ok) return { memories: [] };
      const json = await res.json();
      return json.data ?? { memories: [] };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Card 1: Soul Score ────────────────────────────────── */}
      <div
        className="rounded-[20px] px-5 py-5 transition-all duration-300 hover:-translate-y-0.5"
        style={glassStyle}
      >
        <SoulScore compact />
      </div>

      {/* ── Card 2: Tabbed Content ────────────────────────────── */}
      <div
        className="rounded-[20px] px-5 py-5 transition-all duration-300 hover:-translate-y-0.5"
        style={glassStyle}
      >
        <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-4 min-h-[120px]">
          {activeTab === 'soul' && (
            <motion.div
              key="soul"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p
                className="text-xs text-center py-3"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                Connect more platforms to deepen your soul signature
              </p>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <InsightCards className="[&>div]:flex-col [&>div]:overflow-visible [&>div]:gap-3" />
            </motion.div>
          )}

          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-2"
            >
              <h3
                className="text-[11px] font-medium tracking-[0.12em] uppercase"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}
              >
                Recent Activity
              </h3>
              {activityData?.memories && activityData.memories.length > 0 ? (
                activityData.memories.slice(0, 6).map((mem, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-[12px] transition-all duration-150 hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <div className="mt-0.5">
                      {mem.memory_type === 'reflection' ? (
                        <Zap className="w-3.5 h-3.5" style={{ color: 'rgba(255,132,0,0.6)' }} />
                      ) : (
                        <Clock className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
                        {mem.content}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', sans-serif" }}>
                        {new Date(mem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif" }}>
                  Activity will appear as your twin learns more about you
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Card 3: Chat CTA ──────────────────────────────────── */}
      <button
        onClick={() => navigate('/talk-to-twin')}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-[100px] text-sm font-medium transition-all duration-150 hover:opacity-85 active:scale-[0.98]"
        style={{
          background: 'var(--accent-vibrant)',
          color: '#0a0909',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <MessageCircle className="w-4 h-4" />
        Chat with your Twin
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ContextSidebar;
