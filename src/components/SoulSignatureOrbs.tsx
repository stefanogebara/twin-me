/**
 * Soul Signature Orbs - Visual & User-Friendly Design
 * Beautiful floating orbs that represent life clusters - easy to understand, visually stunning
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Briefcase,
  Palette,
  Music,
  Film,
  Gamepad2,
  BookOpen,
  Users,
  Trophy,
  Code,
  Sparkles,
  TrendingUp,
  Database,
  X
} from 'lucide-react';
import type { SoulSignatureData, LifeCluster } from './SoulSignatureVisualization';

interface SoulSignatureOrbsProps {
  data: SoulSignatureData;
}

const getClusterIcon = (clusterName: string) => {
  const name = clusterName.toLowerCase();
  if (name.includes('hobbies') || name.includes('interests')) return Heart;
  if (name.includes('sports') || name.includes('fitness')) return TrendingUp;
  if (name.includes('spiritual') || name.includes('religion')) return Sparkles;
  if (name.includes('entertainment')) return Film;
  if (name.includes('social')) return Users;
  if (name.includes('education') || name.includes('studies')) return BookOpen;
  if (name.includes('career') || name.includes('jobs')) return Briefcase;
  if (name.includes('skills') || name.includes('expertise')) return Code;
  if (name.includes('achievements')) return Trophy;
  if (name.includes('artistic') || name.includes('art')) return Palette;
  if (name.includes('content creation')) return Database;
  if (name.includes('music')) return Music;
  if (name.includes('gaming')) return Gamepad2;
  return Sparkles;
};

const getCategoryColor = (category: 'personal' | 'professional' | 'creative') => {
  switch (category) {
    case 'personal':
      return { bg: '#FEF3C7', border: '#F59E0B', glow: '#F59E0B' }; // Warm amber
    case 'professional':
      return { bg: '#DBEAFE', border: '#3B82F6', glow: '#3B82F6' }; // Professional blue
    case 'creative':
      return { bg: '#EDE9FE', border: '#8B5CF6', glow: '#8B5CF6' }; // Creative purple
  }
};

export const SoulSignatureOrbs: React.FC<SoulSignatureOrbsProps> = ({ data }) => {
  const [selectedCluster, setSelectedCluster] = useState<LifeCluster | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

  // Group and sort clusters by category and intensity
  const personalClusters = data.clusters
    .filter(c => c.category === 'personal')
    .sort((a, b) => b.intensity - a.intensity);

  const professionalClusters = data.clusters
    .filter(c => c.category === 'professional')
    .sort((a, b) => b.intensity - a.intensity);

  const creativeClusters = data.clusters
    .filter(c => c.category === 'creative')
    .sort((a, b) => b.intensity - a.intensity);

  return (
    <div className="w-full bg-gradient-to-br from-white via-stone-50 to-stone-100 rounded-3xl border-2 border-stone-200 p-8 relative overflow-hidden" style={{ minHeight: '600px' }}>
      {/* Header */}
      <div className="mb-8 text-center relative z-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Sparkles className="w-8 h-8 text-[#D97706]" />
          <h2 className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
            Your Soul Signature
          </h2>
        </div>
        <p className="text-stone-600 text-lg max-w-2xl mx-auto">
          Each orb represents a different aspect of your identity. <br />
          <span className="text-sm">Bigger orbs = stronger presence in your life</span>
        </p>
      </div>

      {/* Organized Rows by Category */}
      <div className="space-y-8 mb-8">
        {/* Personal Row */}
        {personalClusters.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
              <h3 className="text-lg font-semibold text-stone-800" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
                Personal Life
              </h3>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              {personalClusters.map((cluster, index) => {
                const Icon = getClusterIcon(cluster.name);
                const colors = getCategoryColor(cluster.category);
                const size = 80 + (cluster.intensity / 100) * 60; // 80px to 140px
                const isHovered = hoveredCluster === cluster.name;

                return (
                  <motion.div
                    key={cluster.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      damping: 20,
                      stiffness: 100,
                      delay: index * 0.1
                    }}
                    whileHover={{ scale: 1.1 }}
                    className="relative cursor-pointer"
                    style={{ width: `${size}px`, height: `${size}px` }}
                    onMouseEnter={() => setHoveredCluster(cluster.name)}
                    onMouseLeave={() => setHoveredCluster(null)}
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    {/* Glow effect */}
                    {isHovered && (
                      <motion.div
                        className="absolute inset-0 rounded-full blur-xl opacity-50"
                        style={{ backgroundColor: colors.glow }}
                        initial={{ scale: 1 }}
                        animate={{ scale: 1.2 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}

                    {/* Orb */}
                    <div
                      className="absolute inset-0 rounded-full flex flex-col items-center justify-center shadow-xl"
                      style={{
                        backgroundColor: colors.bg,
                        border: `3px solid ${colors.border}`
                      }}
                    >
                      <Icon style={{ color: colors.border, width: '28px', height: '28px' }} />
                      <div className="text-xs font-bold text-center px-2 mt-1" style={{ color: colors.border }}>
                        {cluster.name}
                      </div>
                      <div className="text-xl font-bold" style={{ color: colors.border }}>
                        {cluster.intensity}%
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Professional Row */}
        {professionalClusters.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#3B82F6]"></div>
              <h3 className="text-lg font-semibold text-stone-800" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
                Professional Life
              </h3>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              {professionalClusters.map((cluster, index) => {
                const Icon = getClusterIcon(cluster.name);
                const colors = getCategoryColor(cluster.category);
                const size = 80 + (cluster.intensity / 100) * 60;
                const isHovered = hoveredCluster === cluster.name;

                return (
                  <motion.div
                    key={cluster.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      damping: 20,
                      stiffness: 100,
                      delay: index * 0.1
                    }}
                    whileHover={{ scale: 1.1 }}
                    className="relative cursor-pointer"
                    style={{ width: `${size}px`, height: `${size}px` }}
                    onMouseEnter={() => setHoveredCluster(cluster.name)}
                    onMouseLeave={() => setHoveredCluster(null)}
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    {isHovered && (
                      <motion.div
                        className="absolute inset-0 rounded-full blur-xl opacity-50"
                        style={{ backgroundColor: colors.glow }}
                        initial={{ scale: 1 }}
                        animate={{ scale: 1.2 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}

                    <div
                      className="absolute inset-0 rounded-full flex flex-col items-center justify-center shadow-xl"
                      style={{
                        backgroundColor: colors.bg,
                        border: `3px solid ${colors.border}`
                      }}
                    >
                      <Icon style={{ color: colors.border, width: '28px', height: '28px' }} />
                      <div className="text-xs font-bold text-center px-2 mt-1" style={{ color: colors.border }}>
                        {cluster.name}
                      </div>
                      <div className="text-xl font-bold" style={{ color: colors.border }}>
                        {cluster.intensity}%
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Creative Row */}
        {creativeClusters.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
              <h3 className="text-lg font-semibold text-stone-800" style={{ fontFamily: 'var(--_typography---font--styrene-a)' }}>
                Creative Life
              </h3>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              {creativeClusters.map((cluster, index) => {
                const Icon = getClusterIcon(cluster.name);
                const colors = getCategoryColor(cluster.category);
                const size = 80 + (cluster.intensity / 100) * 60;
                const isHovered = hoveredCluster === cluster.name;

                return (
                  <motion.div
                    key={cluster.name}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      damping: 20,
                      stiffness: 100,
                      delay: index * 0.1
                    }}
                    whileHover={{ scale: 1.1 }}
                    className="relative cursor-pointer"
                    style={{ width: `${size}px`, height: `${size}px` }}
                    onMouseEnter={() => setHoveredCluster(cluster.name)}
                    onMouseLeave={() => setHoveredCluster(null)}
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    {isHovered && (
                      <motion.div
                        className="absolute inset-0 rounded-full blur-xl opacity-50"
                        style={{ backgroundColor: colors.glow }}
                        initial={{ scale: 1 }}
                        animate={{ scale: 1.2 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}

                    <div
                      className="absolute inset-0 rounded-full flex flex-col items-center justify-center shadow-xl"
                      style={{
                        backgroundColor: colors.bg,
                        border: `3px solid ${colors.border}`
                      }}
                    >
                      <Icon style={{ color: colors.border, width: '28px', height: '28px' }} />
                      <div className="text-xs font-bold text-center px-2 mt-1" style={{ color: colors.border }}>
                        {cluster.name}
                      </div>
                      <div className="text-xl font-bold" style={{ color: colors.border }}>
                        {cluster.intensity}%
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="mt-8 grid grid-cols-3 gap-4 relative z-10">
        <div className="text-center p-4 bg-white rounded-xl border-2 border-stone-200">
          <div className="text-3xl font-bold text-[#D97706]">{data.overallScore}%</div>
          <div className="text-xs text-stone-600 mt-1">Overall Authenticity</div>
        </div>
        <div className="text-center p-4 bg-white rounded-xl border-2 border-stone-200">
          <div className="text-3xl font-bold text-stone-900">{data.clusters.length}</div>
          <div className="text-xs text-stone-600 mt-1">Life Dimensions</div>
        </div>
        <div className="text-center p-4 bg-white rounded-xl border-2 border-stone-200">
          <div className="text-3xl font-bold text-stone-900">{data.totalDataPoints.toLocaleString()}</div>
          <div className="text-xs text-stone-600 mt-1">Data Points</div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCluster && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCluster(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-lg w-full border-4"
              style={{ borderColor: getCategoryColor(selectedCluster.category).border }}
            >
              <button
                onClick={() => setSelectedCluster(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-stone-600" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                  style={{
                    backgroundColor: getCategoryColor(selectedCluster.category).bg,
                    border: `3px solid ${getCategoryColor(selectedCluster.category).border}`
                  }}
                >
                  {React.createElement(getClusterIcon(selectedCluster.name), {
                    className: 'w-8 h-8',
                    style: { color: getCategoryColor(selectedCluster.category).border }
                  })}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-stone-900">{selectedCluster.name}</h3>
                  <p className="text-sm text-stone-600 capitalize">{selectedCluster.category} Life Area</p>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-stone-700">Intensity Level</span>
                  <span className="text-4xl font-bold" style={{ color: getCategoryColor(selectedCluster.category).border }}>
                    {selectedCluster.intensity}%
                  </span>
                </div>
                <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedCluster.intensity}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: getCategoryColor(selectedCluster.category).border }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-stone-50 rounded-xl">
                  <div className="text-xs text-stone-600 mb-1">Data Points</div>
                  <div className="text-2xl font-bold text-stone-900">{selectedCluster.dataPoints.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-stone-50 rounded-xl">
                  <div className="text-xs text-stone-600 mb-1">Confidence</div>
                  <div className="text-2xl font-bold text-stone-900">{selectedCluster.confidenceScore}%</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-stone-700 mb-3">Data Sources</div>
                <div className="flex flex-wrap gap-2">
                  {selectedCluster.platforms.map(platform => (
                    <span
                      key={platform}
                      className="px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-sm font-medium"
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SoulSignatureOrbs;
