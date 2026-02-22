/**
 * ConversationControls Component
 * Conversation management: New Chat, Save, Export
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, Download, FileText, Check } from 'lucide-react';

interface ConversationControlsProps {
  onNewChat: () => void;
  onSave?: () => void;
  onExport?: (format: 'pdf' | 'text' | 'json') => void;
  className?: string;
  isSaved?: boolean;
}

export function ConversationControls({
  onNewChat,
  onSave,
  onExport,
  className = '',
  isSaved = false
}: ConversationControlsProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);

  const handleSave = () => {
    if (onSave) {
      onSave();
      setSavedRecently(true);
      setTimeout(() => setSavedRecently(false), 2000);
    }
  };

  const handleExport = (format: 'pdf' | 'text' | 'json') => {
    if (onExport) {
      onExport(format);
      setShowExportMenu(false);
    }
  };

  const iconBtnStyle = {
    color: '#8A857D'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* New Chat Button - Prominent */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onNewChat}
        className="btn-cta-app flex items-center gap-2 px-4 py-2 font-medium shadow-sm"
      >
        <Plus className="w-4 h-4" />
        <span>New Chat</span>
      </motion.button>

      {/* Save Button */}
      {onSave && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          className="p-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
          title={isSaved ? 'Conversation saved' : 'Save conversation'}
        >
          {savedRecently || isSaved ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : (
            <Save className="w-5 h-5" style={iconBtnStyle} />
          )}
        </motion.button>
      )}

      {/* Export Button with Dropdown */}
      {onExport && (
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
            title="Export conversation"
          >
            <Download className="w-5 h-5" style={iconBtnStyle} />
          </motion.button>

          {/* Export Menu */}
          {showExportMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-48 rounded-2xl overflow-hidden z-10"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(10px) saturate(140%)',
                WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)'
              }}
            >
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/20"
                style={{ color: '#1F1C18' }}
              >
                <FileText className="w-4 h-4 text-red-500" />
                <span>Export as PDF</span>
              </button>
              <button
                onClick={() => handleExport('text')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/20"
                style={{ color: '#1F1C18' }}
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>Export as Text</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/20"
                style={{ color: '#1F1C18' }}
              >
                <FileText className="w-4 h-4 text-green-500" />
                <span>Export as JSON</span>
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
