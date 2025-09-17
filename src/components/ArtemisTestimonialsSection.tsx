export const ArtemisTestimonialsSection = () => {
  const testimonials = [
    {
      quote: "Having my AI twin available 24/7 has transformed how my students learn. They can get help exactly when they need it, not just during office hours.",
      name: "Dr. Sarah Chen",
      title: "Physics Professor, Stanford",
      avatar: "SC"
    },
    {
      quote: "My professor's AI twin explains concepts in the exact same way she does in class. It's like having personal tutoring sessions whenever I'm stuck.",
      name: "Marcus Rodriguez", 
      title: "Computer Science Student",
      avatar: "MR"
    },
    {
      quote: "The AI twin captures my teaching philosophy perfectly. Students get the same quality explanations and encouragement they'd receive from me directly.",
      name: "Prof. James Wilson",
      title: "Mathematics Department Head",
      avatar: "JW"
    }
  ];

  return (
    <section id="testimonials" className="py-24 px-6 bg-card">
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-foreground mb-6 leading-tight">
            Trusted by Educators & Students
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            See how Twin Me is revolutionizing education for both professors and students worldwide.
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