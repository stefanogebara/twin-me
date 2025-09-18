import { ArtemisNavigation } from '@/components/ArtemisNavigation';

export default function GetStarted() {
  return (
    <div className="min-h-screen bg-background relative">
      <ArtemisNavigation />
      
      {/* Decorative blobs */}
      <div 
        className="absolute w-[420px] h-[420px] rounded-full opacity-30 top-[10%] right-[8%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #FF5722, #FF9800)',
          filter: 'blur(100px)'
        }}
      ></div>
      <div 
        className="absolute w-[320px] h-[320px] rounded-full opacity-30 bottom-[15%] left-[5%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #4A90E2, #00BCD4)',
          filter: 'blur(100px)'
        }}
      ></div>

      {/* Header */}
      <header className="min-h-[60vh] flex items-center justify-center relative pt-[140px] pb-[60px] px-6 text-center">
        <div>
          <h1 className="text-hero leading-tight mb-4 font-playfair italic font-normal">
            Let's build your Digital Teacher Twin
          </h1>
          <p className="text-xl text-muted-foreground max-w-[820px] leading-relaxed mx-auto font-playfair italic">
            Three quick steps. No code. You can edit everything later.
          </p>
        </div>
      </header>

      {/* Wizard */}
      <main className="max-w-[1100px] mx-auto -mt-10 mb-[120px] px-6 relative">
        <section className="bg-white/75 backdrop-blur-sm rounded-[28px] border border-black/[0.06] shadow-soft p-10">
          <div className="flex items-center gap-4 justify-between mb-7">
            <div className="text-2xl font-normal font-playfair italic">Setup Wizard</div>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded-full"></div>
            </div>
          </div>

          {/* Step pills */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="px-4 py-2.5 rounded-full border border-dashed border-black/20 text-center bg-primary text-primary-foreground border-transparent">
              1 · Profile
            </div>
            <div className="px-4 py-2.5 rounded-full border border-dashed border-black/20 text-center">
              2 · Materials
            </div>
            <div className="px-4 py-2.5 rounded-full border border-dashed border-black/20 text-center">
              3 · Mode & Voice
            </div>
          </div>

          <div className="grid gap-6">
            {/* Step 1 */}
            <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
              <h3 className="text-2xl mb-2 font-normal font-playfair italic">1. Who is this twin for?</h3>
              <p className="text-muted-foreground leading-relaxed mb-4 font-playfair italic">Choose the role to tailor inputs and prompts.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border-2 border-primary border-solid rounded-2xl p-5 shadow-soft bg-primary/5">
                  <h4 className="text-xl mb-1.5 font-normal font-playfair italic">Professor / Instructor</h4>
                  <small className="text-muted-foreground font-playfair italic">Lectures, syllabi, readings, office-hours style</small>
                </div>
                <div className="border-2 border-transparent rounded-2xl p-5">
                  <h4 className="text-xl mb-1.5 font-normal font-playfair italic">Teaching Assistant</h4>
                  <small className="text-muted-foreground font-playfair italic">Guides, rubrics, examples, grading notes</small>
                </div>
                <div className="border-2 border-transparent rounded-2xl p-5">
                  <h4 className="text-xl mb-1.5 font-normal font-playfair italic">Guest Educator</h4>
                  <small className="text-muted-foreground font-playfair italic">Talks, workshops, guest sessions</small>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
              <h3 className="text-2xl font-normal font-playfair italic mb-4">Basic profile</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Full name</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Prof. Ana García" 
                    className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic"
                  />
                </div>
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Discipline</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Microeconomics" 
                    className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic"
                  />
                </div>
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Tone & style keywords</label>
                  <input 
                    type="text" 
                    placeholder="e.g., calm, rigorous, analogy-driven" 
                    className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic"
                  />
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
              <h3 className="text-2xl font-normal font-playfair italic mb-2">2. Add core materials</h3>
              <p className="text-muted-foreground leading-relaxed mb-4 font-playfair italic">Paste links or summaries; you can upload files later.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Lecture links (YouTube / platform)</label>
                  <textarea 
                    placeholder="One per line"
                    className="w-full min-h-[120px] py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic resize-y"
                  ></textarea>
                </div>
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Syllabi / assignment briefs (URLs or paste text)</label>
                  <textarea 
                    placeholder="Paste syllabus text or links"
                    className="w-full min-h-[120px] py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic resize-y"
                  ></textarea>
                </div>
                <div>
                  <label className="text-base mb-1.5 block font-playfair italic">Signature metaphors / patterns</label>
                  <textarea 
                    placeholder='e.g., "Bonding = dance partners", "DP = cooking recipe"'
                    className="w-full min-h-[120px] py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic resize-y"
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
              <h3 className="text-2xl font-normal font-playfair italic mb-2">3. Mode & Voice</h3>
              <p className="text-muted-foreground leading-relaxed mb-4 font-playfair italic">Pick the primary interaction mode (you can enable both). Voice setup is optional.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="border-2 border-primary border-solid rounded-2xl p-5 shadow-soft bg-primary/5">
                  <h4 className="text-xl font-normal font-playfair italic">Voice</h4>
                  <small className="text-muted-foreground font-playfair italic">Natural speech, 24/7 office hours</small>
                </div>
                <div className="border-2 border-transparent rounded-2xl p-5">
                  <h4 className="text-xl font-normal font-playfair italic">Chat</h4>
                  <small className="text-muted-foreground font-playfair italic">Threaded Q&A with saved context</small>
                </div>
                <div className="border-2 border-transparent rounded-2xl p-5">
                  <h4 className="text-xl font-normal font-playfair italic">Both</h4>
                  <small className="text-muted-foreground font-playfair italic">Let students choose each session</small>
                </div>
              </div>

              {/* Voice Setup */}
              <div className="bg-background rounded-3xl border border-dashed border-black/[0.12] p-7">
                <h3 className="text-2xl font-normal font-playfair italic mb-1.5">Voice Setup (optional)</h3>
                <p className="text-muted-foreground leading-relaxed mb-4 font-playfair italic">Upload 1–3 short samples (30–60s). You can skip this now and use chat-only.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-base mb-1.5 block font-playfair italic">Upload audio samples (WAV/MP3, ≤ 10MB each)</label>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      multiple 
                      className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-playfair italic"
                    />
                    <small className="text-muted-foreground font-playfair italic">Tip: quiet room, steady mic distance, natural classroom tone.</small>
                  </div>
                  <div>
                    <label className="text-base mb-1.5 block font-playfair italic">Consent</label>
                    <div className="flex gap-2.5 items-start">
                      <input type="checkbox" className="mt-1.5" />
                      <small className="text-muted-foreground font-playfair italic">
                        I confirm I am the legal owner of this voice and authorize Twin Me to process and synthesize it solely for educational use within my courses. I may revoke this at any time; upon revocation, synthesis stops and stored samples are deleted (except minimal logs required by law).
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary CTA */}
            <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
              <h3 className="text-2xl font-normal font-playfair italic mb-2">Summary</h3>
              <p className="text-muted-foreground leading-relaxed mb-4 font-playfair italic">We'll create the twin with the settings above. You can edit everything later.</p>
              <div className="flex justify-end gap-3">
                <a href="/" className="px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block bg-transparent text-foreground border-2 border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                  Cancel
                </a>
                <a href="/voice-settings" className="px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block bg-primary text-primary-foreground hover:scale-105 hover:shadow-strong font-playfair italic">
                  Create Twin
                </a>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className="text-muted-foreground font-playfair italic">Visual design only — wiring comes later</span>
              <div className="flex gap-3">
                <a href="/" className="px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block bg-transparent text-foreground border-2 border-solid border-foreground hover:bg-foreground hover:text-background hover:scale-105 font-playfair italic">
                  Back
                </a>
                <a href="/voice-settings" className="px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block bg-primary text-primary-foreground hover:scale-105 hover:shadow-strong font-playfair italic">
                  Finish
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}