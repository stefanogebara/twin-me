import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Globe,
  Users,
  Briefcase,
  Heart,
  Lock,
  Eye,
  Zap,
  Download,
  Upload,
  Save,
  Plus,
  Check,
  Star,
  Clock
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PrivacyTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  settings: {
    globalPrivacy: number;
    clusterSettings: Record<string, number>;
  };
  isDefault?: boolean;
  isCustom?: boolean;
  lastUsed?: Date;
  usageCount?: number;
}

interface PrivacyTemplatesProps {
  templates: PrivacyTemplate[];
  activeTemplateId?: string;
  onApplyTemplate: (templateId: string) => void;
  onSaveAsTemplate?: () => void;
  onImportTemplate?: () => void;
  onExportTemplate?: (templateId: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
  className?: string;
}

// Default privacy templates
export const DEFAULT_TEMPLATES: PrivacyTemplate[] = [
  {
    id: 'maximum-privacy',
    name: 'Maximum Privacy',
    description: 'Hide everything - complete lockdown mode',
    icon: Lock,
    color: '#6B7280',
    isDefault: true,
    settings: {
      globalPrivacy: 0,
      clusterSettings: {
        personal: 0,
        professional: 0,
        creative: 0
      }
    }
  },
  {
    id: 'professional-only',
    name: 'Professional Only',
    description: 'Share career and skills, hide personal life',
    icon: Briefcase,
    color: '#3B82F6',
    isDefault: true,
    settings: {
      globalPrivacy: 50,
      clusterSettings: {
        personal: 20,
        professional: 85,
        creative: 40
      }
    }
  },
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Share interests and hobbies, protect work details',
    icon: Users,
    color: '#8B5CF6',
    isDefault: true,
    settings: {
      globalPrivacy: 60,
      clusterSettings: {
        personal: 80,
        professional: 30,
        creative: 75
      }
    }
  },
  {
    id: 'balanced-sharing',
    name: 'Balanced Sharing',
    description: 'Moderate visibility across all areas',
    icon: Shield,
    color: '#F59E0B',
    isDefault: true,
    settings: {
      globalPrivacy: 50,
      clusterSettings: {
        personal: 50,
        professional: 50,
        creative: 50
      }
    }
  },
  {
    id: 'full-transparency',
    name: 'Full Transparency',
    description: 'Share everything - maximum openness',
    icon: Globe,
    color: '#10B981',
    isDefault: true,
    settings: {
      globalPrivacy: 100,
      clusterSettings: {
        personal: 100,
        professional: 100,
        creative: 100
      }
    }
  },
  {
    id: 'dating-profile',
    name: 'Dating Profile',
    description: 'Showcase personality, hide work specifics',
    icon: Heart,
    color: '#EC4899',
    isDefault: true,
    settings: {
      globalPrivacy: 65,
      clusterSettings: {
        personal: 85,
        professional: 25,
        creative: 80
      }
    }
  }
];

export const PrivacyTemplates: React.FC<PrivacyTemplatesProps> = ({
  templates,
  activeTemplateId,
  onApplyTemplate,
  onSaveAsTemplate,
  onImportTemplate,
  onExportTemplate,
  onDeleteTemplate,
  className
}) => {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  // Sort templates: default first, then by usage count
  const sortedTemplates = [...templates].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return (b.usageCount || 0) - (a.usageCount || 0);
  });

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-stone-900">Privacy Templates</h3>
          <p className="text-sm text-stone-500">
            Quick presets for different sharing contexts
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onImportTemplate && (
            <Button variant="outline" size="sm" onClick={onImportTemplate}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
          )}
          {onSaveAsTemplate && (
            <Button variant="default" size="sm" onClick={onSaveAsTemplate}>
              <Save className="w-4 h-4 mr-2" />
              Save Current
            </Button>
          )}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedTemplates.map((template) => {
          const Icon = template.icon;
          const isActive = template.id === activeTemplateId;
          const isHovered = template.id === hoveredTemplate;

          return (
            <motion.div
              key={template.id}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onHoverStart={() => setHoveredTemplate(template.id)}
              onHoverEnd={() => setHoveredTemplate(null)}
            >
              <Card
                className={cn(
                  "p-5 cursor-pointer transition-all duration-200 relative overflow-hidden",
                  isActive
                    ? "border-2 shadow-lg"
                    : "border hover:border-stone-300 hover:shadow-md"
                )}
                style={{
                  borderColor: isActive ? template.color : undefined
                }}
                onClick={() => onApplyTemplate(template.id)}
              >
                {/* Background Gradient Effect */}
                <motion.div
                  className="absolute inset-0 opacity-5"
                  style={{
                    background: `radial-gradient(circle at top right, ${template.color}, transparent 70%)`
                  }}
                  animate={{
                    opacity: isHovered ? 0.1 : 0.05
                  }}
                />

                {/* Active Indicator */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-md"
                      style={{ backgroundColor: template.color }}
                    >
                      <Check className="w-5 h-5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Template Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 relative"
                  style={{
                    backgroundColor: `${template.color}15`,
                    color: template.color
                  }}
                >
                  <Icon className="w-7 h-7" />

                  {/* Pulse effect for active template */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: template.color }}
                      animate={{
                        opacity: [0.2, 0.4, 0.2],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  )}
                </div>

                {/* Template Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-stone-900">{template.name}</h4>
                    {template.isDefault && (
                      <Badge variant="outline" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                {/* Privacy Level Indicators */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">Global Privacy</span>
                    <span
                      className="font-medium"
                      style={{ color: template.color }}
                    >
                      {template.settings.globalPrivacy}%
                    </span>
                  </div>

                  {/* Mini cluster bars */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(template.settings.clusterSettings).map(([cluster, level]) => (
                      <div key={cluster} className="space-y-1">
                        <div className="text-xs text-stone-500 capitalize truncate">
                          {cluster}
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: template.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${level}%` }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Info */}
                <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                  {template.lastUsed ? (
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(template.lastUsed).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Star className="w-3 h-3" />
                      <span>Never used</span>
                    </div>
                  )}

                  {template.usageCount !== undefined && template.usageCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {template.usageCount} uses
                    </Badge>
                  )}
                </div>

                {/* Quick Actions for Custom Templates */}
                {template.isCustom && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: isHovered ? 1 : 0,
                      y: isHovered ? 0 : 10
                    }}
                    className="flex items-center gap-1 mt-3 pt-3 border-t border-stone-200"
                  >
                    {onExportTemplate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportTemplate(template.id);
                        }}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export
                      </Button>
                    )}
                    {onDeleteTemplate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(template.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </motion.div>
                )}

                {/* Apply Button on Hover */}
                <AnimatePresence>
                  {isHovered && !isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-3"
                    >
                      <Button
                        className="w-full h-8 text-xs"
                        style={{
                          backgroundColor: template.color,
                          color: 'white'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyTemplate(template.id);
                        }}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Apply Template
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}

        {/* Create Custom Template Card */}
        {onSaveAsTemplate && (
          <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card
              className="p-5 cursor-pointer border-2 border-dashed border-stone-300 hover:border-stone-400 hover:bg-stone-50 transition-all duration-200 flex flex-col items-center justify-center h-full min-h-[280px]"
              onClick={onSaveAsTemplate}
            >
              <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center mb-4">
                <Plus className="w-7 h-7 text-stone-400" />
              </div>
              <h4 className="font-medium text-stone-900 mb-2">Create Template</h4>
              <p className="text-sm text-stone-500 text-center">
                Save your current settings as a reusable template
              </p>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Quick Apply Bar */}
      {activeTemplateId && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg bg-stone-50 border border-stone-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{
                  backgroundColor: `${templates.find(t => t.id === activeTemplateId)?.color}15`,
                  color: templates.find(t => t.id === activeTemplateId)?.color
                }}
              >
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-stone-900">
                  Currently using: {templates.find(t => t.id === activeTemplateId)?.name}
                </h4>
                <p className="text-xs text-stone-500">
                  {templates.find(t => t.id === activeTemplateId)?.description}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
