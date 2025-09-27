import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Contact() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ backgroundColor: 'var(--_color-theme---background)', borderColor: 'var(--_color-theme---border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-body hover:opacity-70 transition-opacity text-sm"
              style={{ color: 'var(--_color-theme---text)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
            <div>
              <h1 className="u-display-l text-heading mb-2" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
                Contact Us
              </h1>
              <p className="text-body-large" style={{ color: 'var(--_color-theme---text-muted)' }}>Questions, partnerships, or pilots — we'd love to hear from you</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto pt-8 pb-20 px-6">

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          {/* Contact form */}
          <form className="rounded-2xl p-8 shadow-sm border" style={{ backgroundColor: 'white', borderColor: 'var(--_color-theme---border)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-body text-base mb-2 block font-medium" style={{ color: 'var(--_color-theme---text)' }}>Your name</label>
                <input
                  type="text"
                  placeholder="e.g., Prof. Ana García"
                  required
                  className="w-full py-3 px-4 rounded-lg border transition-colors focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'var(--_color-theme---border)',
                    backgroundColor: 'hsl(var(--claude-bg))',
                    color: 'var(--_color-theme---text)'
                  }}
                />
              </div>
              <div>
                <label className="text-body text-base mb-2 block font-medium" style={{ color: 'var(--_color-theme---text)' }}>Email</label>
                <input
                  type="email"
                  placeholder="name@university.edu"
                  required
                  className="w-full py-3 px-4 rounded-lg border transition-colors focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'var(--_color-theme---border)',
                    backgroundColor: 'hsl(var(--claude-bg))',
                    color: 'var(--_color-theme---text)'
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-body text-base mb-2 block font-medium" style={{ color: 'var(--_color-theme---text)' }}>Institution</label>
                <input
                  type="text"
                  placeholder="University / School"
                  className="w-full py-3 px-4 rounded-lg border transition-colors focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'var(--_color-theme---border)',
                    backgroundColor: 'hsl(var(--claude-bg))',
                    color: 'var(--_color-theme---text)'
                  }}
                />
              </div>
              <div>
                <label className="text-body text-base mb-2 block font-medium" style={{ color: 'var(--_color-theme---text)' }}>Role</label>
                <input
                  type="text"
                  placeholder="Professor / Admin / Student"
                  className="w-full py-3 px-4 rounded-lg border transition-colors focus:ring-2 focus:ring-opacity-50"
                  style={{
                    borderColor: 'var(--_color-theme---border)',
                    backgroundColor: 'hsl(var(--claude-bg))',
                    color: 'var(--_color-theme---text)'
                  }}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-body text-base mb-2 block font-medium" style={{ color: 'var(--_color-theme---text)' }}>Message</label>
              <textarea
                placeholder="Tell us what you'd like to achieve"
                className="w-full min-h-[140px] py-3 px-4 rounded-lg border resize-y transition-colors focus:ring-2 focus:ring-opacity-50"
                style={{
                  borderColor: 'var(--_color-theme---border)',
                  backgroundColor: 'hsl(var(--claude-bg))',
                  color: 'var(--_color-theme---text)'
                }}
              ></textarea>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-lg font-medium border transition-colors"
                style={{
                  borderColor: 'var(--_color-theme---border)',
                  color: 'var(--_color-theme---text)',
                  backgroundColor: 'transparent'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--_color-theme---accent)',
                  color: 'white'
                }}
              >
                Send Message
              </button>
            </div>
          </form>

          {/* FAQs */}
          <aside className="rounded-2xl p-8 shadow-sm border" style={{ backgroundColor: 'white', borderColor: 'var(--_color-theme---border)' }}>
            <h3 className="text-heading text-xl font-medium mb-6" style={{ fontFamily: 'var(--_typography---font--styrene-a)', color: 'var(--_color-theme---text)' }}>
              Frequently Asked Questions
            </h3>

            <details open className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                <strong className="block">Do I need to upload files now?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'hsl(var(--claude-text-muted))' }}>
                No — links or short summaries are fine. You can upload full files later in the portal.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                <strong className="block">Is voice required?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'hsl(var(--claude-text-muted))' }}>
                No. You can start with chat-only, then enable voice later with quick samples and consent.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                <strong className="block">Who owns the voice clone?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'hsl(var(--claude-text-muted))' }}>
                The educator does. We process it only with explicit consent and only for educational use. You can revoke anytime.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                <strong className="block">Can I bring my own ElevenLabs account?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'hsl(var(--claude-text-muted))' }}>
                Yes. We support managed cloning by Twin AI Learn and self-serve via your own provider later on.
              </p>
            </details>
          </aside>
        </section>
      </main>
    </div>
  );
}