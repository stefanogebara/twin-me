/**
 * Empty Visualization
 * Beautiful empty state when no data exists for visualization
 */

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface EmptyVisualizationProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyVisualization({
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyVisualizationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`bg-white rounded-xl border border-stone-200 p-12 ${className}`}
    >
      <div className="max-w-md mx-auto text-center">
        {/* Icon */}
        {icon && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
            className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <div className="text-stone-400">
              {icon}
            </div>
          </motion.div>
        )}

        {/* Title */}
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-xl font-heading font-semibold text-slate-900 mb-3"
        >
          {title}
        </motion.h3>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-sm text-slate-600 mb-6 leading-relaxed"
        >
          {description}
        </motion.p>

        {/* Action */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            {action}
          </motion.div>
        )}

        {/* Decorative dots */}
        <div className="flex justify-center space-x-2 mt-8">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.5,
                delay: 0.6 + index * 0.1,
                repeat: Infinity,
                repeatType: 'reverse',
                repeatDelay: 2
              }}
              className="w-2 h-2 bg-orange-300 rounded-full"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
