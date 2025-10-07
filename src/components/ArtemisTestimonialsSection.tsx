export const ArtemisTestimonialsSection = () => {
  const testimonials = [
    {
      quote: "TwinMe helped me discover patterns in my interests I never noticed. It's fascinating to see how my Netflix choices, Spotify playlists, and Discord communities paint such an authentic picture of who I am.",
      name: "Sarah Chen",
      title: "Creative Professional",
      avatar: "SC"
    },
    {
      quote: "The privacy controls are incredible. I can share my professional side on LinkedIn while keeping my gaming and entertainment preferences separate. True contextual identity.",
      name: "Marcus Rodriguez",
      title: "Software Engineer",
      avatar: "MR"
    },
    {
      quote: "My digital twin captures the real me - not just my resume, but my curiosities, my humor, the things that make me uniquely myself. It's authenticity with control.",
      name: "James Wilson",
      title: "Digital Creator",
      avatar: "JW"
    }
  ];

  return (
    <section id="testimonials" className="py-24 px-6 bg-card">
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-foreground mb-6 leading-tight">
            Trusted by Authentic People
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            See how TwinMe is revolutionizing digital identity by capturing authentic soul signatures.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              className="artemis-card relative"
            >
              {/* Orange quotation mark decoration */}
              <div className="absolute top-4 left-4 text-4xl text-primary font-serif">"</div>
              
              <div className="pt-8">
                <blockquote className="text-muted-foreground leading-relaxed mb-6 italic">
                  {testimonial.quote}
                </blockquote>
                
                <div className="flex items-center">
                  {/* Avatar Circle */}
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mr-3">
                    <span className="text-card font-semibold text-sm">{testimonial.avatar}</span>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-foreground">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.title}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};