import { ArtemisNavigation } from '@/components/ArtemisNavigation';

export default function VoiceSettings() {
  return (
    <div className="min-h-screen bg-background relative">
      <ArtemisNavigation />
      
      {/* Decorative blobs */}
      <div 
        className="absolute w-[360px] h-[360px] rounded-full opacity-30 top-[8%] right-[10%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #FF5722, #FF9800)',
          filter: 'blur(100px)'
        }}
      ></div>
      <div 
        className="absolute w-[260px] h-[260px] rounded-full opacity-30 bottom-[8%] left-[6%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #4A90E2, #00BCD4)',
          filter: 'blur(100px)'
        }}
      ></div>

      <main className="max-w-[1100px] mx-auto pt-[140px] pb-20 px-6 relative">
        <header className="mb-6">
          <h1 className="text-hero font-normal font-playfair italic mb-2">Voice Settings</h1>
          <p className="text-muted-foreground font-playfair italic">Manage samples, preview synthesis, and review your consent.</p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status + Preview */}
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <div className="flex justify-between items-center mb-2.5">
              <h3 className="text-2xl font-normal font-playfair italic">Current Voice</h3>
              <span className="inline-block px-3 py-1.5 rounded-full text-sm bg-orange-50 text-orange-800 font-playfair italic">
                Pending
              </span>
            </div>
            <p className="text-muted-foreground font-playfair italic mb-3">Preview your cloned voice using a test sentence once it's ready.</p>
            <div className="flex gap-3 items-center mb-3">
              <button className="px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none bg-transparent text-foreground border-2 border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                Generate Preview
              </button>
              <audio controls style={{display: 'none'}}></audio>
            </div>
            <small className="text-muted-foreground font-playfair italic">Status updates when processing completes.</small>
          </div>

          {/* Samples Manager */}
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <h3 className="text-2xl font-normal font-playfair italic mb-2">Samples</h3>
            <p className="text-muted-foreground font-playfair italic mb-4">Upload additional audio or manage existing clips.</p>
            <input 
              type="file" 
              accept="audio/*" 
              multiple 
              className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic mb-2.5"
            />
            <div className="flex flex-col gap-2.5 mb-3">
              <div className="flex justify-between items-center py-2.5 px-3 border border-dashed border-black/15 rounded-xl">
                <span className="font-playfair italic">intro_01.wav</span>
                <button className="px-6 py-1.5 rounded-full text-sm cursor-pointer transition-all duration-300 border-none bg-transparent text-foreground border border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                  Delete
                </button>
              </div>
              <div className="flex justify-between items-center py-2.5 px-3 border border-dashed border-black/15 rounded-xl">
                <span className="font-playfair italic">office_hours_02.mp3</span>
                <button className="px-6 py-1.5 rounded-full text-sm cursor-pointer transition-all duration-300 border-none bg-transparent text-foreground border border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                  Delete
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button className="px-6 py-2 rounded-full text-base cursor-pointer transition-all duration-300 border-none bg-transparent text-foreground border-2 border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                Refresh
              </button>
              <button className="px-6 py-2 rounded-full text-base cursor-pointer transition-all duration-300 border-none bg-primary text-primary-foreground hover:scale-105 hover:shadow-strong font-playfair italic">
                Upload
              </button>
            </div>
          </div>

          {/* Consent */}
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7 lg:col-span-2">
            <h3 className="text-2xl font-normal font-playfair italic mb-2">Consent</h3>
            <p className="text-muted-foreground font-playfair italic mb-3">Signed on —</p>
            <div 
              className="max-h-45 overflow-auto border border-black/[0.08] rounded-xl p-3 bg-background mb-3"
              style={{maxHeight: '180px'}}
            >
              <small className="text-muted-foreground font-playfair italic">
                I confirm I am the legal owner of this voice and authorize Twin Me to process and synthesize it solely for educational use within my courses. I may revoke this at any time; upon revocation, synthesis stops and stored samples are deleted (except minimal logs required by law).
              </small>
            </div>
            <div className="flex justify-end gap-3">
              <button className="px-6 py-2 rounded-full text-base cursor-pointer transition-all duration-300 border-none bg-transparent text-foreground border-2 border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                Revoke & Delete
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}