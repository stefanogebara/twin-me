export const WhatIBringSection = () => {
  return (
    <section className="min-h-screen bg-slate-50 relative py-32 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto relative">
        {/* Floating Service Tags */}
        <div className="absolute inset-0 pointer-events-none">
          {/* AI Tutoring */}
          <div className="absolute top-16 left-8 bg-blue-200 text-blue-900 px-4 py-2 rounded-full text-sm font-medium transform rotate-12 shadow-sm">
            AI Tutoring
          </div>
          
          {/* Personalized Learning */}
          <div className="absolute top-32 right-16 bg-purple-200 text-purple-900 px-4 py-2 rounded-full text-sm font-medium transform -rotate-6 shadow-sm">
            Personalized Learning
          </div>
          
          {/* Voice Interaction */}
          <div className="absolute top-64 left-24 bg-green-200 text-green-900 px-4 py-2 rounded-full text-sm font-medium transform rotate-6 shadow-sm">
            Voice Interaction
          </div>
          
          {/* 24/7 Availability */}
          <div className="absolute top-48 right-8 bg-orange-200 text-orange-900 px-4 py-2 rounded-full text-sm font-medium transform -rotate-12 shadow-sm">
            24/7 Availability
          </div>
          
          {/* Digital Twins */}
          <div className="absolute bottom-64 left-16 bg-pink-200 text-pink-900 px-4 py-2 rounded-full text-sm font-medium transform rotate-8 shadow-sm">
            Digital Twins
          </div>
          
          {/* Natural Language */}
          <div className="absolute bottom-48 right-24 bg-yellow-200 text-yellow-900 px-4 py-2 rounded-full text-sm font-medium transform -rotate-8 shadow-sm">
            Natural Language
          </div>
          
          {/* Interactive Learning */}
          <div className="absolute bottom-32 left-32 bg-indigo-200 text-indigo-900 px-4 py-2 rounded-full text-sm font-medium transform rotate-4 shadow-sm">
            Interactive Learning
          </div>
          
          {/* Smart AI */}
          <div className="absolute bottom-16 right-32 bg-teal-200 text-teal-900 px-4 py-2 rounded-full text-sm font-medium transform -rotate-4 shadow-sm">
            Smart AI
          </div>
        </div>

        {/* Central Content */}
        <div className="text-center relative z-10">
          {/* Central Icon */}
          <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
            <div className="w-8 h-8 bg-white rounded-full"></div>
          </div>
          
          <h2 className="text-6xl md:text-7xl font-serif text-slate-900 mb-8 italic leading-tight">
            What I bring to<br />
            <span className="not-italic">the table</span>
          </h2>

          <p className="text-slate-600 text-lg font-medium max-w-md mx-auto">
            AI-powered educational experiences that engage students and help your 
            institution stand out from day one
          </p>
        </div>
      </div>
    </section>
  );
};