import React from 'react';

export const FloatingElements = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Educational themed floating elements */}
      <div className="absolute top-1/4 left-1/4 w-6 h-6 bg-gradient-to-br from-accent to-yellow-400 rounded-full float opacity-60" />
      <div className="absolute top-3/4 right-1/4 w-4 h-4 bg-gradient-to-br from-accent-pink to-pink-400 rounded-full float opacity-50" 
           style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-3/4 w-5 h-5 bg-gradient-to-br from-accent-blue to-blue-400 rounded-full float opacity-55"
           style={{ animationDelay: '2s' }} />
      
      {/* Book icons */}
      <div className="absolute top-1/3 right-1/3 opacity-20 float"
           style={{ animationDelay: '0.5s' }}>
        <div className="w-8 h-6 bg-gradient-to-br from-primary to-purple-500 rounded-sm relative">
          <div className="absolute inset-1 bg-background/80 rounded-sm" />
        </div>
      </div>
      
      {/* Pencil icon */}
      <div className="absolute bottom-1/3 left-1/5 opacity-25 wiggle">
        <div className="w-1 h-8 bg-gradient-to-b from-accent-orange to-orange-400 rounded-full relative">
          <div className="w-2 h-2 bg-gradient-to-br from-accent to-yellow-300 rounded-full absolute -top-1 -left-0.5" />
        </div>
      </div>
      
      {/* Mathematical symbols */}
      <div className="absolute top-1/5 right-1/5 text-3xl font-bold text-primary/20 float"
           style={{ animationDelay: '1.5s' }}>
        ∑
      </div>
      <div className="absolute bottom-1/4 right-2/3 text-2xl font-bold text-accent/30 float"
           style={{ animationDelay: '2.5s' }}>
        π
      </div>
    </div>
  );
};