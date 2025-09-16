export const BehindTheCanvasSection = () => {
  return (
    <section className="min-h-screen bg-slate-900 relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Header Icon */}
        <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-xl">
          <div className="text-4xl">🤖</div>
        </div>

        <h2 className="text-6xl md:text-7xl font-serif text-white mb-8 italic leading-tight">
          Behind the canvas
        </h2>

        <p className="text-slate-300 text-lg mb-8 leading-relaxed">
          Finally, meet the technology passionate about helping 
          students succeed – a quick peek into our AI world
        </p>

        <div className="text-slate-300 text-base leading-relaxed mb-12 max-w-2xl mx-auto space-y-4">
          <p>
            I help educators turn their expertise into AI twins that actually work. 
            Whether you need a teaching assistant that never sleeps or a personalized 
            tutor that adapts to each student, I focus on results over pretty presentations.
          </p>
          <p>
            When I'm not training AI models, you'll find me optimizing learning algorithms or hunting for the 
            perfect teaching method. I believe great education technology should solve real learning problems fast 
            — no endless complexity, no AI ego, just solutions that work.
          </p>
        </div>

        <button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 py-3 text-lg font-medium shadow-lg transition-all duration-200 hover:scale-105">
          Try Twin Me for Free!
        </button>

        {/* Bottom Images Grid */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
          <div className="aspect-square bg-gradient-to-br from-blue-400 to-cyan-300 rounded-2xl shadow-lg"></div>
          <div className="aspect-square bg-gradient-to-br from-orange-400 to-pink-400 rounded-2xl shadow-lg"></div>
          <div className="aspect-square bg-gradient-to-br from-green-400 to-emerald-300 rounded-2xl shadow-lg"></div>
        </div>
      </div>
    </section>
  );
};