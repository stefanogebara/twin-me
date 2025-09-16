export const TrustedBySection = () => {
  const companies = [
    { name: 'Stanford', logo: 'S' },
    { name: 'MIT', logo: 'M' },
    { name: 'Harvard', logo: 'H' },
    { name: 'Berkeley', logo: 'B' },
    { name: 'Caltech', logo: 'C' },
  ];

  return (
    <section className="py-16 px-6">
      <div className="max-w-7xl mx-auto text-center">
        <p className="text-sm font-medium text-muted-foreground mb-8 uppercase tracking-wider">
          Our Trusted Universities
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
          {companies.map((company) => (
            <div 
              key={company.name}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground font-bold text-xl"
            >
              {company.logo}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};