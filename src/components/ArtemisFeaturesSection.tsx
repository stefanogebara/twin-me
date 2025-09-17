export const ArtemisFeaturesSection = () => {
  const features = [
    {
      title: "Voice & Text Chat",
      description: "Interact with your AI twin through natural conversation, just like talking to your real professor.",
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
      title: "Personalized Learning",
      description: "Each AI twin adapts to your learning style and pace, providing customized explanations and examples.",
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
      title: "24/7 Availability",
      description: "Get help whenever you need it. Your AI professor never sleeps and is always ready to assist.",
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
      title: "Knowledge Retention",
      description: "Your AI twin remembers every conversation and builds on previous discussions for continuous learning.",
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
            Revolutionize Your Learning Experience
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Experience education like never before with AI twins that capture the essence of your favorite professors.
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