import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Film, Tv } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { NetflixContent } from '@/hooks/useNetflixInsights';

interface TopContentCardProps {
  content: NetflixContent[];
  className?: string;
}

export const TopContentCard: React.FC<TopContentCardProps> = ({ content, className = '' }) => {
  // Take top 5 content items
  const topContent = content.slice(0, 5);

  // Calculate max watch count for progress bar scaling
  const maxWatchCount = Math.max(...topContent.map(c => c.watchCount));

  // Format runtime from minutes to hours/minutes
  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#E50914]/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-[#E50914]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">Top Content</h3>
          <p className="text-xs text-stone-600">Your most watched shows & movies</p>
        </div>
      </div>

      {/* Content List */}
      <div className="space-y-4">
        {topContent.map((item, index) => (
          <motion.div
            key={`${item.title}-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded flex items-center justify-center bg-stone-100 text-xs font-medium text-stone-600 group-hover:bg-[#E50914]/10 group-hover:text-[#E50914] transition-colors">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-ui text-sm font-medium text-stone-900 truncate">
                    {item.title}
                  </p>
                  {item.type === 'TV Show' ? (
                    <Tv className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                  ) : (
                    <Film className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-stone-600">{item.type}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-stone-900">{item.watchCount}x</div>
                <div className="text-xs text-stone-500">{formatRuntime(item.runtime_minutes)}</div>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#E50914] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(item.watchCount / maxWatchCount) * 100}%` }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      {content.length > 5 && (
        <div className="mt-4 pt-4 border-t border-stone-200">
          <p className="text-xs text-stone-500 text-center">
            +{content.length - 5} more titles in your library
          </p>
        </div>
      )}
    </Card>
  );
};
