import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Contact() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAF9F5]">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-[#FAF9F5] border-[rgba(20,20,19,0.1)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-sm text-[#141413]"
              style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
            <div>
              <h1 className="text-[clamp(2rem,4vw,3rem)] mb-2 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                Contact Us
              </h1>
              <p className="text-[18px] text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Questions, partnerships, or pilots — we'd love to hear from you</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto pt-8 pb-20 px-6">

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          {/* Contact form */}
          <form className="rounded-2xl p-8 bg-card border border-[rgba(20,20,19,0.1)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-base mb-2 block text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>Your name</label>
                <input
                  type="text"
                  placeholder="e.g., Prof. Ana García"
                  required
                  className="w-full py-3 px-4 rounded-lg border focus:outline-none bg-[#F5F5F5] border-[rgba(20,20,19,0.1)] text-[#141413]"
                  style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
                />
              </div>
              <div>
                <label className="text-base mb-2 block text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>Email</label>
                <input
                  type="email"
                  placeholder="name@university.edu"
                  required
                  className="w-full py-3 px-4 rounded-lg border focus:outline-none bg-[#F5F5F5] border-[rgba(20,20,19,0.1)] text-[#141413]"
                  style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-base mb-2 block text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>Institution</label>
                <input
                  type="text"
                  placeholder="University / School"
                  className="w-full py-3 px-4 rounded-lg border focus:outline-none bg-[#F5F5F5] border-[rgba(20,20,19,0.1)] text-[#141413]"
                  style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
                />
              </div>
              <div>
                <label className="text-base mb-2 block text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>Role</label>
                <input
                  type="text"
                  placeholder="Professor / Admin / Student"
                  className="w-full py-3 px-4 rounded-lg border focus:outline-none bg-[#F5F5F5] border-[rgba(20,20,19,0.1)] text-[#141413]"
                  style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-base mb-2 block text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>Message</label>
              <textarea
                placeholder="Tell us what you'd like to achieve"
                className="w-full min-h-[140px] py-3 px-4 rounded-lg border resize-y focus:outline-none bg-[#F5F5F5] border-[rgba(20,20,19,0.1)] text-[#141413]"
                style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
              ></textarea>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-lg border bg-card border-[rgba(20,20,19,0.1)] text-[#141413]"
                style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 rounded-lg btn-anthropic-primary"
                style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}
              >
                Send Message
              </button>
            </div>
          </form>

          {/* FAQs */}
          <aside className="rounded-2xl p-8 bg-card border border-[rgba(20,20,19,0.1)]">
            <h3 className="text-xl mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>
              Frequently Asked Questions
            </h3>

            <details open className="border-t py-4 border-[rgba(20,20,19,0.1)]">
              <summary className="cursor-pointer text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>
                <strong className="block">Do I need to upload files now?</strong>
              </summary>
              <p className="leading-relaxed mt-2 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                No — links or short summaries are fine. You can upload full files later in the portal.
              </p>
            </details>

            <details className="border-t py-4 border-[rgba(20,20,19,0.1)]">
              <summary className="cursor-pointer text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>
                <strong className="block">Is voice required?</strong>
              </summary>
              <p className="leading-relaxed mt-2 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                No. You can start with chat-only, then enable voice later with quick samples and consent.
              </p>
            </details>

            <details className="border-t py-4 border-[rgba(20,20,19,0.1)]">
              <summary className="cursor-pointer text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>
                <strong className="block">Who owns the voice clone?</strong>
              </summary>
              <p className="leading-relaxed mt-2 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                The educator does. We process it only with explicit consent and only for educational use. You can revoke anytime.
              </p>
            </details>

            <details className="border-t py-4 border-[rgba(20,20,19,0.1)]">
              <summary className="cursor-pointer text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}>
                <strong className="block">Can I bring my own ElevenLabs account?</strong>
              </summary>
              <p className="leading-relaxed mt-2 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                Yes. We support managed cloning by Twin Me and self-serve via your own provider later on.
              </p>
            </details>
          </aside>
        </section>
      </main>
    </div>
  );
}
