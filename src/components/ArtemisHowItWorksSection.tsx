export const ArtemisHowItWorksSection = () => {
  const steps = [
    {
      number: "01",
      title: "Professor Signs Up",
      description: "Educators create their digital twin by uploading lectures, materials, and teaching preferences.",
      side: "left"
    },
    {
      number: "02", 
      title: "AI Training Process",
      description: "Our advanced AI analyzes teaching patterns, communication style, and subject expertise to create an authentic replica.",
      side: "right"
    },
    {
      number: "03",
      title: "Student Access",
      description: "Students can instantly chat with their professor's AI twin, getting personalized help anytime they need it.",
      side: "left"
    },
    {
      number: "04",
      title: "Continuous Learning",
      description: "The AI twin learns from each interaction, becoming more accurate and helpful over time.",
      side: "right"
    }
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-background">
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-foreground mb-6 leading-tight">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Our simple 4-step process creates AI twins that truly understand and replicate your professor's teaching style.
          </p>
        </div>

        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary via-accent to-primary transform -translate-x-1/2 hidden lg:block"></div>

          <div className="space-y-16">
            {steps.map((step, index) => (
              <div 
                key={index}
                className={`flex flex-col lg:flex-row items-center gap-8 ${
                  step.side === 'right' ? 'lg:flex-row-reverse' : ''
                }`}
              >
                {/* Content */}
                <div className={`flex-1 ${step.side === 'right' ? 'lg:text-right' : ''}`}>
                  <div className="artemis-card max-w-md mx-auto lg:mx-0">
                    <div className="text-sm font-semibold text-primary mb-2">{step.number}</div>
                    <h3 className="text-2xl font-bold text-foreground mb-4">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>

                {/* Number Circle */}
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-card font-bold text-lg">{step.number}</span>
                  </div>
                </div>

                {/* Spacer for alignment */}
                <div className="flex-1 hidden lg:block"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};