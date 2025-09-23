import { ArtemisNavigation } from '@/components/ArtemisNavigation';

export default function Contact() {
  return (
    <div className="min-h-screen bg-[hsl(var(--lenny-cream))] relative">
      <ArtemisNavigation />
      
      {/* Decorative blobs */}
      <div 
        className="absolute w-[360px] h-[360px] rounded-full opacity-30 top-[10%] right-[10%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--lenny-orange)), hsl(var(--lenny-peach)))',
          filter: 'blur(100px)'
        }}
      ></div>
      <div 
        className="absolute w-[260px] h-[260px] rounded-full opacity-30 bottom-[10%] left-[6%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--lenny-orange)), hsl(var(--lenny-cream)))',
          filter: 'blur(100px)'
        }}
      ></div>

      <main className="max-w-[1100px] mx-auto pt-[140px] pb-20 px-6 relative">
        <header className="mb-6">
          <h1 className="text-hero font-medium font-display gradient-text mb-2">Contact us</h1>
          <p className="text-[hsl(var(--muted-foreground))] font-body mb-6">
            Questions, partnerships, or pilots — we'd love to hear from you.
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
          {/* Contact form */}
          <form className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-base mb-1.5 block font-medium">Your name</label>
                <input
                  type="text"
                  placeholder="e.g., Prof. Ana García"
                  required
                  className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-body"
                />
              </div>
              <div>
                <label className="text-base mb-1.5 block font-medium">Email</label>
                <input
                  type="email"
                  placeholder="name@university.edu"
                  required
                  className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-body"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-base mb-1.5 block font-medium">Institution</label>
                <input
                  type="text"
                  placeholder="University / School"
                  className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-body"
                />
              </div>
              <div>
                <label className="text-base mb-1.5 block font-medium">Role</label>
                <input
                  type="text"
                  placeholder="Professor / Admin / Student"
                  className="w-full py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-body"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-base mb-1.5 block font-medium">Message</label>
              <textarea
                placeholder="Tell us what you'd like to achieve"
                className="w-full min-h-[140px] py-3.5 px-4 rounded-2xl border border-black/[0.12] bg-white font-body resize-y"
              ></textarea>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <a
                href="/"
                className="btn-lenny-secondary px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block hover:scale-105"
              >
                Cancel
              </a>
              <button
                type="submit"
                className="btn-lenny px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none hover:scale-105"
              >
                Send message
              </button>
            </div>
          </form>

          {/* FAQs */}
          <aside className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <h3 className="text-2xl font-medium font-heading mb-3">FAQs</h3>

            <details open className="border-t border-dashed border-black/20 py-3.5">
              <summary className="cursor-pointer font-medium">
                <strong className="block">Do I need to upload files now?</strong>
              </summary>
              <p className="text-[hsl(var(--muted-foreground))] leading-relaxed mt-1.5 font-body">
                No — links or short summaries are fine. You can upload full files later in the portal.
              </p>
            </details>

            <details className="border-t border-dashed border-black/20 py-3.5">
              <summary className="cursor-pointer font-medium">
                <strong className="block">Is voice required?</strong>
              </summary>
              <p className="text-[hsl(var(--muted-foreground))] leading-relaxed mt-1.5 font-body">
                No. You can start with chat-only, then enable voice later with quick samples and consent.
              </p>
            </details>

            <details className="border-t border-dashed border-black/20 py-3.5">
              <summary className="cursor-pointer font-medium">
                <strong className="block">Who owns the voice clone?</strong>
              </summary>
              <p className="text-[hsl(var(--muted-foreground))] leading-relaxed mt-1.5 font-body">
                The educator does. We process it only with explicit consent and only for educational use. You can revoke anytime.
              </p>
            </details>

            <details className="border-t border-dashed border-black/20 py-3.5">
              <summary className="cursor-pointer font-medium">
                <strong className="block">Can I bring my own ElevenLabs account?</strong>
              </summary>
              <p className="text-[hsl(var(--muted-foreground))] leading-relaxed mt-1.5 font-body">
                Yes. We support managed cloning by Twin Me and self-serve via your own provider later on.
              </p>
            </details>
          </aside>
        </section>
      </main>
    </div>
  );
}