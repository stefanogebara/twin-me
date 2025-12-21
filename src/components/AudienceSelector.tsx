import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Briefcase,
  Heart,
  GraduationCap,
  Globe,
  Plus,
  Check,
  ChevronDown,
  Edit2,
  Trash2,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';

export interface Audience {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  description: string;
  privacyLevel: number;
  clusterSettings?: Record<string, number>;
  isCustom?: boolean;
}

interface AudienceSelectorProps {
  audiences: Audience[];
  selectedAudienceId: string;
  onSelectAudience: (audienceId: string) => void;
  onCreateAudience?: () => void;
  onEditAudience?: (audienceId: string) => void;
  onDeleteAudience?: (audienceId: string) => void;
  onDuplicateAudience?: (audienceId: string) => void;
  className?: string;
}

// Default audience presets
export const DEFAULT_AUDIENCES: Audience[] = [
  {
    id: 'public',
    name: 'Public',
    icon: Globe,
    color: '#10B981',
    description: 'Share with everyone - maximum visibility',
    privacyLevel: 100,
    isCustom: false
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: Briefcase,
    color: '#3B82F6',
    description: 'Work contexts, colleagues, LinkedIn',
    privacyLevel: 75,
    isCustom: false
  },
  {
    id: 'social',
    name: 'Social',
    icon: Users,
    color: '#8B5CF6',
    description: 'Friends and casual networks',
    privacyLevel: 50,
    isCustom: false
  },
  {
    id: 'dating',
    name: 'Dating',
    icon: Heart,
    color: '#EC4899',
    description: 'Dating apps and personal connections',
    privacyLevel: 60,
    isCustom: false
  },
  {
    id: 'educational',
    name: 'Educational',
    icon: GraduationCap,
    color: '#F59E0B',
    description: 'Academic contexts and learning platforms',
    privacyLevel: 65,
    isCustom: false
  }
];

export const AudienceSelector: React.FC<AudienceSelectorProps> = ({
  audiences,
  selectedAudienceId,
  onSelectAudience,
  onCreateAudience,
  onEditAudience,
  onDeleteAudience,
  onDuplicateAudience,
  className
}) => {
  const [expandedView, setExpandedView] = useState(false);

  const selectedAudience = audiences.find(a => a.id === selectedAudienceId) || audiences[0];
  const SelectedIcon = selectedAudience?.icon || Globe;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Current Audience Display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{
              backgroundColor: `${selectedAudience?.color}15`,
              color: selectedAudience?.color
            }}
          >
            <SelectedIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-stone-900">Current Audience</h3>
            <p className="text-xs text-stone-500">{selectedAudience?.name}</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandedView(!expandedView)}
          className="gap-2"
        >
          <span>Change Audience</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              expandedView && "rotate-180"
            )}
          />
        </Button>
      </div>

      {/* Expanded Audience Grid */}
      <AnimatePresence>
        {expandedView && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
              {audiences.map((audience) => {
                const Icon = audience.icon;
                const isSelected = audience.id === selectedAudienceId;

                return (
                  <motion.div
                    key={audience.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card
                      className={cn(
                        "p-4 cursor-pointer transition-all duration-200 relative",
                        isSelected
                          ? "border-2 shadow-md"
                          : "border hover:border-stone-300 hover:shadow-sm"
                      )}
                      style={{
                        borderColor: isSelected ? audience.color : undefined
                      }}
                      onClick={() => onSelectAudience(audience.id)}
                    >
                      {/* Selection Indicator */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: audience.color }}
                        >
                          <Check className="w-4 h-4 text-white" />
                        </motion.div>
                      )}

                      {/* Audience Icon */}
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                        style={{
                          backgroundColor: `${audience.color}15`,
                          color: audience.color
                        }}
                      >
                        <Icon className="w-6 h-6" />
                      </div>

                      {/* Audience Info */}
                      <div className="space-y-1 mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-stone-900">{audience.name}</h4>
                          {audience.isCustom && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 line-clamp-2">
                          {audience.description}
                        </p>
                      </div>

                      {/* Privacy Level Indicator */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-stone-500">Privacy Level</span>
                          <span
                            className="font-medium"
                            style={{ color: audience.color }}
                          >
                            {audience.privacyLevel}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: audience.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${audience.privacyLevel}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          />
                        </div>
                      </div>

                      {/* Actions for custom audiences */}
                      {audience.isCustom && (
                        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-stone-200">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAudience?.(audience.id);
                            }}
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateAudience?.(audience.id);
                            }}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAudience?.(audience.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}

              {/* Create New Audience Card */}
              {onCreateAudience && (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card
                    className="p-4 cursor-pointer border-2 border-dashed border-stone-300 hover:border-stone-400 hover:bg-stone-50 transition-all duration-200 flex flex-col items-center justify-center h-full min-h-[200px]"
                    onClick={onCreateAudience}
                  >
                    <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center mb-3">
                      <Plus className="w-6 h-6 text-stone-400" />
                    </div>
                    <h4 className="font-medium text-stone-900 mb-1">Create Custom Audience</h4>
                    <p className="text-xs text-stone-500 text-center">
                      Build your own privacy profile
                    </p>
                  </Card>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Context Info */}
      {selectedAudience && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg bg-stone-50 border border-stone-200"
        >
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{
                backgroundColor: `${selectedAudience.color}15`,
                color: selectedAudience.color
              }}
            >
              <SelectedIcon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-stone-900 mb-1">
                Sharing with {selectedAudience.name}
              </h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                {selectedAudience.description}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{
                    borderColor: selectedAudience.color,
                    color: selectedAudience.color
                  }}
                >
                  {selectedAudience.privacyLevel}% Revelation
                </Badge>
                {selectedAudience.clusterSettings && (
                  <Badge variant="outline" className="text-xs">
                    {Object.keys(selectedAudience.clusterSettings).length} Custom Rules
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
