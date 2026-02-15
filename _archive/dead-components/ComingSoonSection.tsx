export const ComingSoonSection = () => {
  return (
    <section className="section-spacing bg-gradient-to-br from-secondary/30 to-muted/20">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="mb-4 fade-in">
          <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground bg-secondary/50 rounded-full">
            Coming Soon
          </span>
        </div>
        
        <h2 className="text-xl font-bold mb-6 slide-up">
          Student Twins
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-12 max-w-2xl mx-auto fade-in">
          Soon, students will be able to create their own AI learning companions, 
          opening up new ways to personalize education.
        </p>
        
        {/* Abstract Student Network Visual */}
        <div className="relative max-w-md mx-auto fade-in">
          <div className="flex justify-center items-center space-x-8">
            {/* Student Silhouettes */}
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="relative"
                style={{ animationDelay: `${index * 0.5}s` }}
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/10 border-2 border-accent/20" />
                <div className="absolute inset-2 rounded-full bg-accent/10" />
              </div>
            ))}
          </div>
          
          {/* Connecting Lines */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="200"
              height="60"
              className="text-accent/20"
              style={{ animation: 'pulse 3s ease-in-out infinite' }}
            >
              <path
                d="M40 30 L80 30 M120 30 L160 30"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </svg>
          </div>
          
          {/* Central Infinity Symbol */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-8 h-4 opacity-30">
              <svg viewBox="0 0 24 12" className="w-full h-full text-accent">
                <path
                  d="M12 6c0-3.314-2.686-6-6-6S0 2.686 0 6s2.686 6 6 6c1.657 0 3.157-.671 4.243-1.757L12 8.485l1.757 1.758C14.843 11.329 16.343 12 18 12c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6"
                  fill="currentColor"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};