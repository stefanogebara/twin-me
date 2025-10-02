import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function VoiceSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F5' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ backgroundColor: '#FAF9F5', borderColor: 'rgba(20,20,19,0.1)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/twin-builder')}
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: '#141413', fontFamily: 'var(--_typography---font--tiempos)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Twin Builder
            </button>
            <div>
              <h1 className="text-4xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>
                Voice Settings
              </h1>
              <p className="text-lg" style={{ color: '#6B7280', fontFamily: 'var(--_typography---font--tiempos)' }}>Manage samples, preview synthesis, and review your consent</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto pt-8 pb-20 px-6">

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Status + Preview */}
          <div className="rounded-2xl p-8 shadow-sm border" style={{ backgroundColor: 'white', borderColor: 'rgba(20,20,19,0.1)' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>Current Voice</h3>
              <span className="inline-block px-3 py-1 rounded-full text-sm" style={{ backgroundColor: '#F5F5F5', color: '#D97706', fontFamily: 'var(--_typography---font--tiempos)' }}>
                Pending
              </span>
            </div>
            <p className="mb-6" style={{ color: '#6B7280', fontFamily: 'var(--_typography---font--tiempos)' }}>Preview your cloned voice using a test sentence once it's ready.</p>
            <div className="flex gap-3 items-center mb-4">
              <button className="btn-anthropic-primary">
                Generate Preview
              </button>
              <audio controls style={{display: 'none'}}></audio>
            </div>
            <p className="text-sm" style={{ color: '#6B7280', fontFamily: 'var(--_typography---font--tiempos)' }}>Status updates when processing completes.</p>
          </div>

          {/* Samples Manager */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
            <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>Samples</h3>
            <p className="mb-6" style={{ color: '#141413', fontFamily: 'var(--_typography---font--tiempos)' }}>Upload additional audio or manage existing clips.</p>
            <input
              type="file"
              accept="audio/*"
              multiple
              className="w-full py-3 px-4 rounded-lg border mb-4"
              style={{ borderColor: 'rgba(20,20,19,0.1)', backgroundColor: '#F5F5F5', fontFamily: 'var(--_typography---font--tiempos)' }}
            />
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex justify-between items-center py-3 px-4 border border-dashed rounded-lg" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
                <span style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#141413' }}>intro_01.wav</span>
                <button className="btn-anthropic-secondary text-sm px-4 py-1">
                  Delete
                </button>
              </div>
              <div className="flex justify-between items-center py-3 px-4 border border-dashed rounded-lg" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
                <span style={{ fontFamily: 'var(--_typography---font--tiempos)', color: '#141413' }}>office_hours_02.mp3</span>
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
          <div className="bg-white rounded-2xl p-8 shadow-sm border lg:col-span-2" style={{ borderColor: 'rgba(20,20,19,0.1)' }}>
            <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: '#141413' }}>Consent</h3>
            <p className="mb-4" style={{ color: '#141413', fontFamily: 'var(--_typography---font--tiempos)' }}>Signed on —</p>
            <div
              className="max-h-45 overflow-auto border rounded-lg p-4 mb-4"
              style={{maxHeight: '180px', borderColor: 'rgba(20,20,19,0.1)', backgroundColor: '#F5F5F5'}}
            >
              <p className="text-sm" style={{ color: '#141413', fontFamily: 'var(--_typography---font--tiempos)' }}>
                I confirm I am the legal owner of this voice and authorize Twin Me to process and synthesize it solely for educational use within my courses. I may revoke this at any time; upon revocation, synthesis stops and stored samples are deleted (except minimal logs required by law).
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-anthropic-secondary" style={{ color: '#DC2626', borderColor: '#FCA5A5' }}>
                Revoke & Delete
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}