import { ArtemisNavigation } from '@/components/ArtemisNavigation';

export default function WatchDemo() {
  return (
    <div className="min-h-screen bg-[hsl(var(--lenny-cream))] relative">
      <ArtemisNavigation />
      
      {/* Decorative blobs */}
      <div 
        className="absolute w-[420px] h-[420px] rounded-full opacity-30 top-[12%] right-[8%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--lenny-orange)), hsl(var(--lenny-peach)))',
          filter: 'blur(100px)'
        }}
      ></div>
      <div 
        className="absolute w-[320px] h-[320px] rounded-full opacity-30 bottom-[10%] left-[5%] animate-pulse"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--lenny-orange)), hsl(var(--lenny-cream)))',
          filter: 'blur(100px)'
        }}
      ></div>

      {/* Hero with video */}
      <section className="min-h-[70vh] flex items-center justify-center pt-[140px] pb-[60px] px-6 relative text-center">
        <div>
          <h1 className="text-hero leading-tight mb-2.5 font-display font-medium gradient-text">
            Watch the platform in action
          </h1>
          <p className="text-xl text-[hsl(var(--muted-foreground))] max-w-[820px] mx-auto mb-6 leading-relaxed font-body">
            See voice conversations, chat explanations, and progress insights — all in a clean, distraction-free interface.
          </p>
          <div className="max-w-[1100px] mx-auto mt-6 bg-white/75 backdrop-blur-sm border border-black/[0.06] rounded-[28px] shadow-soft p-5">
            <div className="relative w-full pt-[56.25%] rounded-2xl overflow-hidden bg-black">
              <iframe 
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="Twin Me Demo"
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features cards */}
      <section className="py-20 px-6 bg-white">
        <div className="text-center mb-10">
          <h2 className="text-hero font-medium font-display gradient-text">What the demo shows</h2>
        </div>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <h3 className="text-2xl font-medium font-heading mb-2">Voice Office Hours</h3>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
              Natural, always-available conversations with a Teacher Twin that mirrors the educator's style.
            </p>
          </div>
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <h3 className="text-2xl font-medium font-heading mb-2">Chat Walkthroughs</h3>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
              Threaded, context-aware explanations with retries when confusion is detected.
            </p>
          </div>
          <div className="bg-white rounded-3xl border border-black/[0.06] shadow-medium p-7">
            <h3 className="text-2xl font-medium font-heading mb-2">Progress Insights</h3>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
              Lightweight snapshots highlighting what works for each learner over time.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[90px] px-6 text-center bg-[hsl(var(--lenny-cream))]">
        <h2 className="text-hero font-medium font-display gradient-text mb-3">Ready to create your Twin?</h2>
        <p className="text-xl text-[hsl(var(--muted-foreground))] mb-7 font-body">
          It takes minutes — you can edit everything later.
        </p>
        <a
          href="/get-started"
          className="btn-lenny px-8 py-3 rounded-full text-base cursor-pointer transition-all duration-300 border-none no-underline inline-block hover:scale-105"
        >
          Get Started
        </a>
      </section>
    </div>
  );
}