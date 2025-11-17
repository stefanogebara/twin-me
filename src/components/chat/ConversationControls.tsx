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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* New Chat Button - Prominent */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onNewChat}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors shadow-sm hover:shadow-md"
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
          className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group relative"
          title={isSaved ? 'Conversation saved' : 'Save conversation'}
        >
          {savedRecently || isSaved ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : (
            <Save className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white" />
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
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group"
            title="Export conversation"
          >
            <Download className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white" />
          </motion.button>

          {/* Export Menu */}
          {showExportMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 overflow-hidden z-10"
            >
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-4 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 text-red-600" />
                <span>Export as PDF</span>
              </button>
              <button
                onClick={() => handleExport('text')}
                className="w-full px-4 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Export as Text</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 text-green-600" />
                <span>Export as JSON</span>
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
