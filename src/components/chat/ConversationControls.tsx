/**
 * ConversationControls Component
 * Conversation management: New Chat, Save, Export
 */

import React, { useState } from 'react';
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
    color: 'rgba(255,255,255,0.4)'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* New Chat Button - Prominent */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 px-4 py-2 font-medium shadow-sm hover:opacity-90 transition-opacity rounded-[100px]"
        style={{ backgroundColor: '#10b77f', color: '#0a0f0a', fontWeight: 600 }}
      >
        <Plus className="w-4 h-4" />
        <span>New Chat</span>
      </button>

      {/* Save Button */}
      {onSave && (
        <button
          onClick={handleSave}
          className="p-2 rounded-lg transition-colors hover:brightness-150"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
          title={isSaved ? 'Conversation saved' : 'Save conversation'}
        >
          {savedRecently || isSaved ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <Save className="w-5 h-5" style={iconBtnStyle} />
          )}
        </button>
      )}

      {/* Export Button with Dropdown */}
      {onExport && (
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="p-2 rounded-lg transition-colors hover:brightness-150"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            title="Export conversation"
          >
            <Download className="w-5 h-5" style={iconBtnStyle} />
          </button>

          {/* Export Menu */}
          {showExportMenu && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-2xl overflow-hidden z-10"
              style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)'
              }}
            >
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/10"
                style={{ color: 'var(--foreground)' }}
              >
                <FileText className="w-4 h-4 text-red-500" />
                <span>Export as PDF</span>
              </button>
              <button
                onClick={() => handleExport('text')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/10"
                style={{ color: 'var(--foreground)' }}
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>Export as Text</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 text-left flex items-center gap-2 text-sm transition-colors hover:bg-white/10"
                style={{ color: 'var(--foreground)' }}
              >
                <FileText className="w-4 h-4 text-green-500" />
                <span>Export as JSON</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
