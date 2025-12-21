import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { YouTubeCategory } from '@/hooks/useYouTubeInsights';

interface CategoryDistributionChartProps {
  categories: YouTubeCategory[];
  className?: string;
}

// YouTube-inspired color palette: reds with complementary colors
const CATEGORY_COLORS = [
  '#FF0000', // YouTube Red
  '#CC0000', // Dark Red
  '#FF4444', // Light Red
  '#B30000', // Deep Red
  '#FF6B6B', // Coral Red
  '#E60000', // Bright Red
  '#990000', // Burgundy
  '#FF8888', // Pink Red
];

export const CategoryDistributionChart: React.FC<CategoryDistributionChartProps> = ({
  categories,
  className = ''
}) => {
  // Prepare data for chart - take top 5 categories
  const chartData = categories.slice(0, 5).map((category, index) => ({
    name: category.category,
    value: category.percentage,
    count: category.count,
    watchTime: category.watchTime,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));

  // Format watch time in hours
  const formatWatchTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-stone-200 rounded-lg shadow-lg p-3">
          <p className="font-ui text-sm font-medium text-stone-900">
            {payload[0].name}
          </p>
          <p className="text-xs text-stone-600 mt-1">
            {payload[0].value.toFixed(1)}% ({payload[0].payload.count} videos)
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            {formatWatchTime(payload[0].payload.watchTime)} watched
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-md hover:shadow-lg transition-shadow duration-200 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">
            Category Distribution
          </h3>
          <p className="text-xs text-stone-500">
            Your content preferences
          </p>
        </div>
      </div>

      {chartData.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                animationBegin={200}
                animationDuration={800}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    className="hover:opacity-80 transition-opacity"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="mt-4 space-y-2">
            {chartData.map((category, index) => (
              <motion.div
                key={category.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between group cursor-default hover:bg-stone-50 px-2 py-1 rounded transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm font-ui text-stone-700 truncate">
                    {category.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-sm font-mono text-stone-600">
                    {category.value.toFixed(1)}%
                  </span>
                  <span className="text-xs text-stone-500">
                    ({formatWatchTime(category.watchTime)})
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="text-center py-12">
          <LayoutGrid className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-sm text-stone-500">
            No category data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
