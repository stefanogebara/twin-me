export const ArtemisFeaturesSection = () => {
  const features = [
    {
      title: "Platform Integration",
      description: "Connect to Netflix, Spotify, Discord, GitHub, and 30+ platforms to extract your authentic soul signature.",
      visual: (
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mb-4">
          <div className="w-8 h-8 relative">
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <div className="absolute inset-2 bg-primary rounded-full animate-pulse"></div>
          </div>
        </div>
      )
    },
    {
      title: "Privacy Control",
      description: "Granular 0-100% intensity sliders for each life cluster. Share what you want, when you want, with whom you want.",
      visual: (
        <div className="w-16 h-16 bg-gradient-to-br from-accent to-primary rounded-2xl flex items-center justify-center mb-4 relative">
          <div className="grid grid-cols-2 gap-1">
            <div className="w-3 h-3 bg-card rounded-sm"></div>
            <div className="w-3 h-3 bg-card/60 rounded-sm"></div>
            <div className="w-3 h-3 bg-card/60 rounded-sm"></div>
            <div className="w-3 h-3 bg-card rounded-sm"></div>
          </div>
        </div>
      )
    },
    {
      title: "Contextual Sharing",
      description: "Different twin personas for different contexts - professional for LinkedIn, personal for dating, creative for communities.",
      visual: (
        <div className="w-16 h-16 bg-gradient-to-br from-primary/80 to-accent/80 rounded-2xl flex items-center justify-center mb-4">
          <div className="w-8 h-8 bg-card rounded-full relative">
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-0.5 h-3 bg-primary rounded-full"></div>
            <div className="absolute top-1/2 right-1 transform -translate-y-1/2 w-3 h-0.5 bg-accent rounded-full"></div>
          </div>
        </div>
      )
    },
    {
      title: "Soul Signature Discovery",
      description: "AI-powered pattern recognition reveals curiosities, interests, and characteristics you didn't know about yourself.",
      visual: (
        <div className="w-16 h-16 bg-gradient-to-br from-accent/90 to-primary/70 rounded-2xl flex items-center justify-center mb-4">
          <div className="relative">
            <div className="w-6 h-6 border-2 border-card rounded-full"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-card rounded-full"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-card rounded-full"></div>
          </div>
        </div>
      )
    }
  ];

  return (
    <section id="features" className="py-24 px-6 bg-card">
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-foreground mb-6 leading-tight">
            Capture Your Authentic Soul Signature
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Experience digital identity like never before with AI twins that capture the essence of who you truly are.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="artemis-card text-center group cursor-pointer"
            >
              <div className="flex justify-center">
                {feature.visual}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};