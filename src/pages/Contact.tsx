import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Contact() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      {/* Header */}
      <div className="bg-white px-6 py-4" style={{ borderBottom: '1px solid var(--_color-theme---border)' }}>
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
              <h1 className="u-display-l text-heading mb-2">
                Contact Us
              </h1>
              <p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>Questions, partnerships, or pilots — we'd love to hear from you</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto pt-8 pb-20 px-6">

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          {/* Contact form */}
          <form className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-body text-base mb-2 block font-medium">Your name</label>
                <input
                  type="text"
                  placeholder="e.g., Prof. Ana García"
                  required
                  className="w-full py-3 px-4 rounded-lg border"
                  style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
                />
              </div>
              <div>
                <label className="text-body text-base mb-2 block font-medium">Email</label>
                <input
                  type="email"
                  placeholder="name@university.edu"
                  required
                  className="w-full py-3 px-4 rounded-lg border"
                  style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-body text-base mb-2 block font-medium">Institution</label>
                <input
                  type="text"
                  placeholder="University / School"
                  className="w-full py-3 px-4 rounded-lg border"
                  style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
                />
              </div>
              <div>
                <label className="text-body text-base mb-2 block font-medium">Role</label>
                <input
                  type="text"
                  placeholder="Professor / Admin / Student"
                  className="w-full py-3 px-4 rounded-lg border"
                  style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-body text-base mb-2 block font-medium">Message</label>
              <textarea
                placeholder="Tell us what you'd like to achieve"
                className="w-full min-h-[140px] py-3 px-4 rounded-lg border resize-y"
                style={{ borderColor: 'var(--_color-theme---border)', backgroundColor: 'var(--_color-theme---background)' }}
              ></textarea>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-anthropic-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-anthropic-primary"
              >
                Send Message
              </button>
            </div>
          </form>

          {/* FAQs */}
          <aside className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <h3 className="text-heading text-xl font-medium mb-6">FAQs</h3>

            <details open className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium">
                <strong className="block">Do I need to upload files now?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'var(--_color-theme---text)' }}>
                No — links or short summaries are fine. You can upload full files later in the portal.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium">
                <strong className="block">Is voice required?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'var(--_color-theme---text)' }}>
                No. You can start with chat-only, then enable voice later with quick samples and consent.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium">
                <strong className="block">Who owns the voice clone?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'var(--_color-theme---text)' }}>
                The educator does. We process it only with explicit consent and only for educational use. You can revoke anytime.
              </p>
            </details>

            <details className="border-t py-4" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <summary className="cursor-pointer text-heading font-medium">
                <strong className="block">Can I bring my own ElevenLabs account?</strong>
              </summary>
              <p className="text-body leading-relaxed mt-2" style={{ color: 'var(--_color-theme---text)' }}>
                Yes. We support managed cloning by Twin Me and self-serve via your own provider later on.
              </p>
            </details>
          </aside>
        </section>
      </main>
    </div>
  );
}