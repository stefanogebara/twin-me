export const ArtemisWorksSection = () => {
  return (
    <section id="works" className="py-24 px-6 bg-background">
      <div className="max-w-[1440px] mx-auto">
        {/* Section Header - Exact Artemis Style */}
        <div className="text-center mb-16">
          {/* Decorative element like Artemis */}
          <div className="w-16 h-16 mx-auto mb-8 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center transform rotate-3">
            <div className="w-6 h-6 bg-card rounded-sm"></div>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-serif text-foreground mb-8 italic leading-tight">
            Sneak peak of my works
          </h2>
        </div>

        {/* Portfolio Grid - Artemis Style Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
          {/* Large Featured Card */}
          <div className="md:col-span-8 aspect-[4/3] bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:rotate-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-blue-500 to-purple-600"></div>
            <div className="relative z-10 p-8 h-full flex flex-col justify-end text-white">
              <h3 className="text-2xl font-serif mb-2">AI Professor Physics</h3>
              <p className="text-white/90 text-sm">Interactive quantum mechanics tutoring with real-time problem solving</p>
            </div>
          </div>

          {/* Vertical Card */}
          <div className="md:col-span-4 aspect-[3/4] bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:-rotate-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-pink-500"></div>
            <div className="relative z-10 p-6 h-full flex flex-col justify-center items-center text-center text-white">
              <div className="w-12 h-12 bg-card/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                <div className="w-6 h-6 bg-card rounded-full"></div>
              </div>
              <h3 className="text-lg font-serif mb-2">Neural Learning</h3>
              <p className="text-sm text-white/90">Adaptive AI responses</p>
            </div>
          </div>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
          {/* Square Card */}
          <div className="md:col-span-4 aspect-square bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:rotate-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-cyan-500"></div>
            <div className="relative z-10 p-6 h-full flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-2xl font-bold mb-2">24/7</div>
                <div className="text-sm">Always Available</div>
              </div>
            </div>
          </div>

          {/* Horizontal Card */}
          <div className="md:col-span-8 aspect-[2/1] bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] hover:-rotate-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-400 to-red-400"></div>
            <div className="relative z-10 p-8 h-full flex items-center">
              <div className="text-white">
                <h3 className="text-2xl font-serif mb-3">Voice & Text Interaction</h3>
                <p className="text-white/90">Natural conversation with your AI professor through multiple channels</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="aspect-square bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 hover:rotate-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500"></div>
          </div>
          <div className="aspect-square bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-rotate-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-orange-500"></div>
          </div>
          <div className="aspect-square bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 hover:rotate-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-purple-500"></div>
          </div>
          <div className="aspect-square bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-rotate-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-400 to-red-500"></div>
          </div>
        </div>
      </div>
    </section>
  );
};