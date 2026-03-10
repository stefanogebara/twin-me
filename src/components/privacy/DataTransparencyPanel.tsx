import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Download,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  HardDrive,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

export interface DataSource {
  platform: string;
  connected: boolean;
  dataPoints: number;
  lastSync: Date;
  quality: number; // 0-100
  categories: string[];
  size: string; // e.g., "2.4 MB"
}

interface DataTransparencyPanelProps {
  dataSources: DataSource[];
  totalDataPoints: number;
  totalSize: string;
  onExportData?: () => void;
  onDeleteData?: (platform: string) => void;
  onViewRawData?: (platform: string) => void;
}

const getQualityColor = (quality: number) => {
  if (quality >= 80) return 'text-green-400';
  if (quality >= 60) return 'text-yellow-600';
  return 'text-red-400';
};

const getQualityLabel = (quality: number) => {
  if (quality >= 80) return 'Excellent';
  if (quality >= 60) return 'Good';
  if (quality >= 40) return 'Fair';
  return 'Limited';
};

export const DataTransparencyPanel: React.FC<DataTransparencyPanelProps> = ({
  dataSources,
  totalDataPoints,
  totalSize,
  onExportData,
  onDeleteData,
  onViewRawData,
}) => {
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const connectedSources = dataSources.filter((s) => s.connected);
  const totalQuality = connectedSources.length > 0
    ? Math.round(
        connectedSources.reduce((sum, s) => sum + s.quality, 0) / connectedSources.length
      )
    : 0;

  const handleDeleteConfirm = (platform: string) => {
    if (onDeleteData) {
      onDeleteData(platform);
      setShowDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-2xl font-medium text-[var(--claude-text)] mb-2">
            Data Transparency
          </h3>
          <p className="text-sm text-muted-foreground font-body leading-relaxed">
            Complete visibility into what we've collected about you
          </p>
        </div>

        {onExportData && (
          <motion.button
            onClick={onExportData}
            className="
              flex items-center gap-2 px-4 py-2.5 rounded-xl
              bg-[var(--claude-accent)] text-white
              hover:bg-[var(--claude-accent)]/90
              font-ui font-medium text-sm
              shadow-md hover:shadow-lg
              transition-all duration-200
            "
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-4 h-4" />
            Export All Data
          </motion.button>
        )}
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium font-ui uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Connected
            </span>
          </div>
          <p className="text-3xl font-heading font-bold" style={{ color: 'var(--foreground)' }}>
            {connectedSources.length}
          </p>
          <p className="text-xs mt-1 font-ui" style={{ color: 'var(--text-secondary)' }}>
            platforms synced
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium font-ui uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Data Points
            </span>
          </div>
          <p className="text-3xl font-heading font-bold" style={{ color: 'var(--foreground)' }}>
            {totalDataPoints.toLocaleString('en-US')}
          </p>
          <p className="text-xs mt-1 font-ui" style={{ color: 'var(--text-secondary)' }}>
            moments captured
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium font-ui uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Quality
            </span>
          </div>
          <p className="text-3xl font-heading font-bold" style={{ color: 'var(--foreground)' }}>
            {totalQuality}%
          </p>
          <p className="text-xs mt-1 font-ui" style={{ color: 'var(--text-secondary)' }}>
            {getQualityLabel(totalQuality).toLowerCase()}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <HardDrive className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium font-ui uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Storage
            </span>
          </div>
          <p className="text-3xl font-heading font-bold" style={{ color: 'var(--foreground)' }}>
            {totalSize}
          </p>
          <p className="text-xs mt-1 font-ui" style={{ color: 'var(--text-secondary)' }}>
            total data size
          </p>
        </motion.div>
      </div>

      {/* Data Sources List */}
      <div className="space-y-3">
        <h4 className="font-heading text-lg font-medium text-[var(--claude-text)] mb-4">
          Connected Data Sources
        </h4>

        {connectedSources.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 rounded-xl bg-[var(--glass-surface-bg)] border-2 border-dashed border-white/12 text-center"
          >
            <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-body">
              No data sources connected yet. Connect platforms to start building your soul signature.
            </p>
          </motion.div>
        ) : (
          connectedSources.map((source, index) => {
            const isExpanded = expandedPlatform === source.platform;
            const showingDeleteConfirm = showDeleteConfirm === source.platform;

            return (
              <motion.div
                key={source.platform}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                layout
                className="glass-card relative overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="p-3 rounded-lg bg-white/8">
                        <Database className="w-5 h-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-heading text-base font-medium text-[var(--claude-text)] capitalize">
                            {source.platform}
                          </h5>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {source.dataPoints.toLocaleString('en-US')} data points
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {source.size}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {source.lastSync.toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quality Badge */}
                      <div
                        className={`
                          px-3 py-1.5 rounded-lg bg-[var(--glass-surface-bg)] border border-[var(--glass-surface-border)]
                          flex items-center gap-2
                        `}
                      >
                        <TrendingUp className={`w-3.5 h-3.5 ${getQualityColor(source.quality)}`} />
                        <span className={`text-sm font-medium font-ui ${getQualityColor(source.quality)}`}>
                          {source.quality}%
                        </span>
                      </div>

                      {/* Expand Button */}
                      <motion.button
                        onClick={() =>
                          setExpandedPlatform(isExpanded ? null : source.platform)
                        }
                        className="p-2 rounded-lg hover:bg-white/12 transition-colors"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                      </motion.button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="pt-4 border-t border-white/10 space-y-4"
                      >
                        {/* Categories */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 font-ui">
                            Data Categories
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {source.categories.map((category) => (
                              <span
                                key={category}
                                className="px-2.5 py-1 rounded-lg bg-white/8 text-muted-foreground text-xs font-medium font-ui"
                              >
                                {category}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {onViewRawData && (
                            <button
                              onClick={() => onViewRawData(source.platform)}
                              className="
                                flex items-center gap-2 px-3 py-2 rounded-lg
                                bg-white/8 hover:bg-white/10
                                text-muted-foreground font-ui font-medium text-sm
                                transition-colors
                              "
                            >
                              <Eye className="w-4 h-4" />
                              View Raw Data
                            </button>
                          )}

                          {onDeleteData && !showingDeleteConfirm && (
                            <button
                              onClick={() => setShowDeleteConfirm(source.platform)}
                              className="
                                flex items-center gap-2 px-3 py-2 rounded-lg
                                bg-red-900/20 hover:bg-red-900/20
                                text-red-700 font-ui font-medium text-sm
                                transition-colors
                              "
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete Data
                            </button>
                          )}

                          {showingDeleteConfirm && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-2"
                            >
                              <p className="text-sm text-red-700 font-medium font-ui">
                                Are you sure?
                              </p>
                              <button
                                onClick={() => handleDeleteConfirm(source.platform)}
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-ui font-medium text-sm hover:bg-red-700 transition-colors"
                              >
                                Yes, Delete
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 text-muted-foreground font-ui font-medium text-sm hover:bg-white/15 transition-colors"
                              >
                                Cancel
                              </button>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Privacy Notice */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-xl bg-blue-900/20 border-2 border-blue-800/30"
      >
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h5 className="font-heading text-sm font-medium text-blue-900 mb-1">
              Your Data, Your Control
            </h5>
            <p className="text-sm text-blue-800 font-body leading-relaxed">
              All data is encrypted and stored securely. You can export or delete your data at any time.
              We never share your personal data with third parties without your explicit consent.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
