import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Info,
  Settings,
  Clock,
  Calendar,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { IntensitySlider } from './IntensitySlider';
import { cn } from '@/lib/utils';
import { useTheme } from '../contexts/ThemeContext';

export interface Platform {
  name: string;
  dataPoints: number;
  lastSync?: Date;
  enabled: boolean;
}

export interface SubCluster {
  id: string;
  name: string;
  description: string;
  privacyLevel: number;
  dataPoints: number;
  platforms: Platform[];
  enabled: boolean;
}

export interface LifeCluster {
  id: string;
  name: string;
  category: 'personal' | 'professional' | 'creative';
  icon: React.ElementType;
  color: string;
  description: string;
  privacyLevel: number;
  subclusters: SubCluster[];
  totalDataPoints: number;
  enabled: boolean;
  timeBasedRules?: TimeBasedRule[];
  conditionalRules?: ConditionalRule[];
}

export interface TimeBasedRule {
  id: string;
  type: 'after_days' | 'schedule';
  value: number | string;
  action: 'reveal' | 'hide';
}

export interface ConditionalRule {
  id: string;
  condition: string;
  action: 'reveal' | 'hide';
  threshold?: number;
}

interface ClusterControlProps {
  cluster: LifeCluster;
  onChange: (cluster: LifeCluster) => void;
  onSubclusterChange?: (clusterId: string, subclusterId: string, level: number) => void;
  className?: string;
}

export const ClusterControl: React.FC<ClusterControlProps> = ({
  cluster,
  onChange,
  onSubclusterChange,
  className
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const Icon = cluster.icon;

  const handlePrivacyChange = (value: number) => {
    onChange({
      ...cluster,
      privacyLevel: value
    });
  };

  const handleToggleCluster = (enabled: boolean) => {
    onChange({
      ...cluster,
      enabled
    });
  };

  const handleSubclusterChange = (subclusterId: string, value: number) => {
    const updatedSubclusters = cluster.subclusters.map(sub =>
      sub.id === subclusterId ? { ...sub, privacyLevel: value } : sub
    );
    onChange({
      ...cluster,
      subclusters: updatedSubclusters
    });

    if (onSubclusterChange) {
      onSubclusterChange(cluster.id, subclusterId, value);
    }
  };

  const handleToggleSubcluster = (subclusterId: string, enabled: boolean) => {
    const updatedSubclusters = cluster.subclusters.map(sub =>
      sub.id === subclusterId ? { ...sub, enabled } : sub
    );
    onChange({
      ...cluster,
      subclusters: updatedSubclusters
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Card className="overflow-hidden border-stone-200">
        {/* Cluster Header */}
        <div
          className={cn(
            "p-5 cursor-pointer transition-all duration-200",
            isExpanded ? "bg-stone-50" : "bg-white hover:bg-stone-50"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              {/* Expand/Collapse Icon */}
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-5 h-5 text-stone-400" />
              </motion.div>

              {/* Cluster Icon */}
              <div
                className="p-3 rounded-xl"
                style={{
                  backgroundColor: `${cluster.color}15`,
                  color: cluster.color
                }}
              >
                <Icon className="w-6 h-6" />
              </div>

              {/* Cluster Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-medium text-stone-900">{cluster.name}</h3>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize"
                  >
                    {cluster.category}
                  </Badge>
                </div>
                <p className="text-sm text-stone-500">{cluster.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                  <span>{cluster.totalDataPoints} data points</span>
                  <span>{cluster.subclusters.length} subcategories</span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {cluster.privacyLevel}% visible
                  </span>
                </div>
              </div>

              {/* Cluster Toggle */}
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    backgroundColor: cluster.enabled ? `${cluster.color}15` : '#F3F4F6',
                    color: cluster.enabled ? cluster.color : '#9CA3AF'
                  }}
                >
                  {cluster.enabled ? (
                    <Unlock className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <Switch
                  checked={cluster.enabled}
                  onCheckedChange={handleToggleCluster}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-5 pt-0 space-y-6 bg-stone-50">
                {/* Main Privacy Control */}
                <div className="p-4 rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]" style={{
                  backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                  borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                  borderWidth: '1px',
                  borderStyle: 'solid'
                }}>
                  <IntensitySlider
                    value={cluster.privacyLevel}
                    onChange={handlePrivacyChange}
                    label="Cluster Privacy Level"
                    description="Overall visibility for this life cluster"
                    disabled={!cluster.enabled}
                    clusterId={cluster.id}
                  />
                </div>

                {/* Subclusters */}
                {cluster.subclusters.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-stone-900 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Subcategories
                    </h4>

                    {cluster.subclusters.map((subcluster) => (
                      <div
                        key={subcluster.id}
                        className="p-4 rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]"
                        style={{
                          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                          borderWidth: '1px',
                          borderStyle: 'solid'
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-sm font-medium text-stone-900">
                                {subcluster.name}
                              </h5>
                              {!subcluster.enabled && (
                                <Badge variant="secondary" className="text-xs">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-stone-500">{subcluster.description}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
                              <span>{subcluster.dataPoints} points</span>
                              <span>{subcluster.platforms.length} platforms</span>
                            </div>
                          </div>

                          <Switch
                            checked={subcluster.enabled}
                            onCheckedChange={(enabled) => handleToggleSubcluster(subcluster.id, enabled)}
                          />
                        </div>

                        {subcluster.enabled && (
                          <div className="space-y-3">
                            {/* Subcluster Privacy Slider */}
                            <IntensitySlider
                              value={subcluster.privacyLevel}
                              onChange={(value) => handleSubclusterChange(subcluster.id, value)}
                              label=""
                              showThermometer={false}
                            />

                            {/* Platform Details */}
                            {subcluster.platforms.length > 0 && (
                              <div className="pt-3 border-t border-stone-200">
                                <p className="text-xs font-medium text-stone-700 mb-2">Data Sources</p>
                                <div className="flex flex-wrap gap-2">
                                  {subcluster.platforms.map((platform, idx) => (
                                    <Badge
                                      key={idx}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {platform.name} ({platform.dataPoints})
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Advanced Settings */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 ml-2 transition-transform",
                        showAdvanced && "rotate-180"
                      )}
                    />
                  </Button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-3 overflow-hidden"
                      >
                        {/* Time-Based Rules */}
                        <div className="p-4 rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]" style={{
                          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                          borderWidth: '1px',
                          borderStyle: 'solid'
                        }}>
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-4 h-4 text-stone-600" />
                            <h5 className="text-sm font-medium text-stone-900">Time-Based Revelation</h5>
                          </div>
                          <p className="text-xs text-stone-500 mb-3">
                            Automatically reveal or hide data after a certain time period
                          </p>
                          {cluster.timeBasedRules && cluster.timeBasedRules.length > 0 ? (
                            <div className="space-y-2">
                              {cluster.timeBasedRules.map((rule) => (
                                <div key={rule.id} className="flex items-center justify-between text-xs">
                                  <span className="text-stone-600">
                                    {rule.action === 'reveal' ? 'Reveal' : 'Hide'} after {rule.value} days
                                  </span>
                                  <Badge variant="outline">{rule.action}</Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="w-full text-xs">
                              <Calendar className="w-3 h-3 mr-1" />
                              Add Time Rule
                            </Button>
                          )}
                        </div>

                        {/* Conditional Rules */}
                        <div className="p-4 rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]" style={{
                          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                          borderWidth: '1px',
                          borderStyle: 'solid'
                        }}>
                          <div className="flex items-center gap-2 mb-3">
                            <Shield className="w-4 h-4 text-stone-600" />
                            <h5 className="text-sm font-medium text-stone-900">Conditional Sharing</h5>
                          </div>
                          <p className="text-xs text-stone-500 mb-3">
                            Share data based on specific conditions or matching criteria
                          </p>
                          {cluster.conditionalRules && cluster.conditionalRules.length > 0 ? (
                            <div className="space-y-2">
                              {cluster.conditionalRules.map((rule) => (
                                <div key={rule.id} className="flex items-center justify-between text-xs">
                                  <span className="text-stone-600">{rule.condition}</span>
                                  <Badge variant="outline">{rule.action}</Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="w-full text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Add Condition
                            </Button>
                          )}
                        </div>

                        {/* Data Expiry */}
                        <div className="p-4 rounded-lg backdrop-blur-[16px] shadow-[0_4px_16px_rgba(0,0,0,0.03)]" style={{
                          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                          borderWidth: '1px',
                          borderStyle: 'solid'
                        }}>
                          <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-stone-600" />
                            <h5 className="text-sm font-medium text-stone-900">Data Expiry</h5>
                          </div>
                          <p className="text-xs text-stone-500 mb-3">
                            Automatically remove old data from your twin
                          </p>
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            Set Expiry Policy
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
};
