import React from 'react';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Download,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface DataManagementSettingsProps {
  isDemoMode: boolean;
  navigate: (path: string) => void;
  exporting: boolean;
  deleting: boolean;
  showDeleteConfirm: boolean;
  deleteConfirmText: string;
  dataMessage: { type: 'success' | 'error'; text: string } | null;
  handleExportData: () => void;
  handleDeleteAccount: () => void;
  setShowDeleteConfirm: (show: boolean) => void;
  setDeleteConfirmText: (text: string) => void;
  cardStyle: string;
}

const DataManagementSettings: React.FC<DataManagementSettingsProps> = ({
  isDemoMode,
  navigate,
  exporting,
  deleting,
  showDeleteConfirm,
  deleteConfirmText,
  dataMessage,
  handleExportData,
  handleDeleteAccount,
  setShowDeleteConfirm,
  setDeleteConfirmText,
  cardStyle,
}) => {
  return (
    <section className={`p-5 ${cardStyle}`}>
      <div className="flex items-center gap-3 mb-2">
        <Download className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        <h2
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: '#10b77f' }}
        >
          Your Data
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.4)' }}>
        You own your data. Export it anytime, or delete your account to permanently remove everything.
      </p>

      {/* Data message */}
      {dataMessage && (
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{
            backgroundColor: dataMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: dataMessage.type === 'success' ? '#10B981' : '#ef4444'
          }}
        >
          {dataMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {dataMessage.text}
        </div>
      )}

      <div className="space-y-3">
        {/* Privacy Policy link */}
        <button
          onClick={() => navigate('/privacy-policy')}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: 'var(--foreground)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <span className="text-sm">Privacy Policy</span>
          <ExternalLink className="w-4 h-4 opacity-40" />
        </button>

        {/* Export Data */}
        <button
          onClick={handleExportData}
          disabled={exporting || isDemoMode}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            color: '#3B82F6',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            opacity: (exporting || isDemoMode) ? 0.5 : 1,
          }}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Exporting...' : 'Download My Data'}
        </button>

        {/* Delete Account */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => !isDemoMode && setShowDeleteConfirm(true)}
            disabled={isDemoMode}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              opacity: isDemoMode ? 0.5 : 1,
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete My Account
          </button>
        ) : (
          <div
            className="p-4 rounded-xl space-y-3"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.04)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
              This will permanently delete:
            </p>
            <ul className="text-xs space-y-1" style={{ color: '#dc2626' }}>
              <li>- Your profile and account data</li>
              <li>- All platform connections and extracted data</li>
              <li>- Your soul signature and personality analysis</li>
              <li>- All twin conversations and memories</li>
              <li>- Behavioral patterns and insights</li>
            </ul>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Type <strong style={{ color: '#ef4444' }}>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--foreground)',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                className="flex-1 px-4 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--foreground)',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{
                  backgroundColor: deleteConfirmText === 'DELETE' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                  color: '#fff',
                  fontFamily: "'Inter', sans-serif",
                  opacity: deleteConfirmText !== 'DELETE' ? 0.5 : 1,
                }}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Account deletion is immediate and irreversible. We recommend exporting your data first.
        </p>
      </div>
    </section>
  );
};

export default DataManagementSettings;
