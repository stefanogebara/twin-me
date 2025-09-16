import { useState } from 'react';

export const WorksSection = () => {
  const [selectedWork, setSelectedWork] = useState(0);

  const works = [
    {
      id: 1,
      title: 'Professor Mathematics AI',
      category: 'AI Twin',
      image: '/api/placeholder/400/600',
      description: 'Advanced mathematics teaching assistant'
    },
    {
      id: 2,
      title: 'Physics Learning Bot',
      category: 'Educational AI',
      image: '/api/placeholder/400/600',
      description: 'Interactive physics problem solver'
    },
    {
      id: 3,
      title: 'Chemistry Lab Assistant',
      category: 'Lab AI',
      image: '/api/placeholder/400/600',
      description: 'Virtual chemistry lab guidance'
    },
    {
      id: 4,
      title: 'Literature Analysis Twin',
      category: 'Language AI',
      image: '/api/placeholder/400/600',
      description: 'Advanced text analysis and discussion'
    },
    {
      id: 5,
      title: 'History Teaching Bot',
      category: 'Social Studies AI',
      image: '/api/placeholder/400/600',
      description: 'Interactive historical timeline explorer'
    },
    {
      id: 6,
      title: 'Computer Science Tutor',
      category: 'Tech AI',
      image: '/api/placeholder/400/600',
      description: 'Programming and algorithm mentor'
    }
  ];

  return (
    <section className="py-24 bg-white px-6" id="works">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-6">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg"></div>
          </div>
          <h2 className="text-4xl md:text-5xl font-serif text-slate-900 italic mb-4">
            Sneak peak of my works
          </h2>
        </div>

        {/* Works Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {works.map((work, index) => (
            <div
              key={work.id}
              className={`group cursor-pointer transition-all duration-300 ${
                selectedWork === index ? 'scale-105' : 'hover:scale-102'
              }`}
              onClick={() => setSelectedWork(index)}
            >
              <div className="bg-white rounded-3xl shadow-lg overflow-hidden border border-slate-100 hover:shadow-xl transition-shadow duration-300">
                {/* Image Placeholder */}
                <div className="aspect-[4/5] bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-300 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <div className="w-8 h-8 bg-slate-500 rounded-lg"></div>
                      </div>
                      <div className="text-slate-500 font-medium">{work.category}</div>
                    </div>
                  </div>
                  
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="text-sm text-orange-500 font-medium mb-2">{work.category}</div>
                  <h3 className="text-xl font-serif text-slate-900 mb-2">{work.title}</h3>
                  <p className="text-slate-600 text-sm">{work.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 py-3 text-lg font-medium shadow-lg transition-colors duration-200">
            View All Projects
          </button>
        </div>
      </div>
    </section>
  );
};