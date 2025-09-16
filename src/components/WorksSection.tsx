export const WorksSection = () => {
  return (
    <section id="works" className="min-h-screen bg-white py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="w-20 h-20 mx-auto mb-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
            <div className="text-3xl">📚</div>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-serif text-slate-900 mb-8 italic">
            Sneak peak of my works
          </h2>
        </div>

        {/* Main Featured Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {/* Large Featured Card */}
          <div className="lg:col-span-2 aspect-[3/2] bg-gradient-to-br from-green-400 via-blue-500 to-purple-600 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-black bg-opacity-20"></div>
            <div className="relative z-10 p-8 h-full flex flex-col justify-end text-white">
              <h3 className="text-3xl font-serif mb-2">AI Professor Physics</h3>
              <p className="text-white/90">Interactive quantum mechanics tutoring with real-time problem solving</p>
            </div>
          </div>

          {/* Poster Style Card */}
          <div className="aspect-[3/4] bg-gradient-to-br from-red-500 to-orange-400 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-black bg-opacity-10"></div>
            <div className="relative z-10 p-6 h-full flex flex-col justify-center items-center text-center text-white">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-serif mb-2">Statistics Twin</h3>
              <p className="text-sm text-white/90">Data analysis made simple</p>
            </div>
          </div>
        </div>

        {/* UI Components Showcase */}
        <div className="flex justify-center items-center space-x-8 mb-12">
          <div className="w-12 h-12 bg-green-500 rounded-full shadow-lg"></div>
          <div className="w-12 h-12 bg-purple-500 rounded-full shadow-lg"></div>
          <div className="w-12 h-12 bg-orange-500 rounded-full shadow-lg"></div>
          <div className="w-12 h-12 bg-pink-500 rounded-full shadow-lg"></div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-500 rounded-full"></div>
            <div className="w-16 h-8 bg-white border-2 border-green-500 rounded-full relative">
              <div className="w-6 h-6 bg-green-500 rounded-full absolute right-1 top-0.5"></div>
            </div>
          </div>
        </div>

        {/* Bottom Projects Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="aspect-square bg-gradient-to-br from-blue-400 to-cyan-300 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2"></div>
          <div className="aspect-square bg-gradient-to-br from-orange-400 to-pink-400 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2"></div>
          <div className="aspect-square bg-gradient-to-br from-green-400 to-emerald-300 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2"></div>
          <div className="aspect-square bg-gradient-to-br from-purple-400 to-indigo-400 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-2"></div>
        </div>
      </div>
    </section>
  );
};