import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function VoiceSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div className="bg-white px-6 py-4" style={{ borderBottom: '1px solid var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/twin-builder')}
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Twin Builder
            </button>
            <div>
              <h1 className="u-display-l text-heading mb-2">
                Voice Settings
              </h1>
              <p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>Manage samples, preview synthesis, and review your consent</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto pt-8 pb-20 px-6">

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status + Preview */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-heading text-xl font-medium">Current Voice</h3>
              <span className="inline-block px-3 py-1 rounded-full text-sm" style={{ backgroundColor: 'var(--_color-theme---background-secondary)', color: 'var(--_color-theme---button-primary--background)' }}>
                Pending
              </span>
            </div>
            <p className="text-body mb-6" style={{ color: 'var(--_color-theme---text)' }}>Preview your cloned voice using a test sentence once it's ready.</p>
            <div className="flex gap-3 items-center mb-4">
              <button className="btn-anthropic-primary">
                Generate Preview
              </button>
              <audio controls style={{display: 'none'}}></audio>
            </div>
            <p className="text-body text-sm" style={{ color: 'var(--_color-theme---text)' }}>Status updates when processing completes.</p>
          </div>

          {/* Samples Manager */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <h3 className="text-heading text-xl font-medium mb-2">Samples</h3>
            <p className="text-body mb-6" style={{ color: 'var(--_color-theme---text)' }}>Upload additional audio or manage existing clips.</p>
            <input
              type="file"
              accept="audio/*"
              multiple
              className="w-full py-3 px-4 rounded-lg border mb-4"
              style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
            />
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex justify-between items-center py-3 px-4 border border-dashed rounded-lg" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <span className="text-body">intro_01.wav</span>
                <button className="btn-anthropic-secondary text-sm px-4 py-1">
                  Delete
                </button>
              </div>
              <div className="flex justify-between items-center py-3 px-4 border border-dashed rounded-lg" style={{ borderColor: 'var(--_color-theme---border)' }}>
                <span className="text-body">office_hours_02.mp3</span>
                <button className="btn-anthropic-secondary text-sm px-4 py-1">
                  Delete
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-anthropic-secondary">
                Refresh
              </button>
              <button className="btn-anthropic-primary">
                Upload
              </button>
            </div>
          </div>

          {/* Consent */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border lg:col-span-2" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <h3 className="text-heading text-xl font-medium mb-2">Consent</h3>
            <p className="text-body mb-4" style={{ color: 'var(--_color-theme---text)' }}>Signed on —</p>
            <div
              className="max-h-45 overflow-auto border rounded-lg p-4 mb-4"
              style={{maxHeight: '180px', borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background-secondary)'}}
            >
              <p className="text-body text-sm" style={{ color: 'var(--_color-theme---text)' }}>
                I confirm I am the legal owner of this voice and authorize Twin Me to process and synthesize it solely for educational use within my courses. I may revoke this at any time; upon revocation, synthesis stops and stored samples are deleted (except minimal logs required by law).
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-anthropic-secondary text-red-600 border-red-300 hover:bg-red-50">
                Revoke & Delete
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}