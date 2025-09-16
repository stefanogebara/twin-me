import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export const Navigation = () => {
  const navigate = useNavigate();

  const menuItems = [
    { label: 'Works', href: '#works' },
    { label: 'Playground', href: '#playground' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          {/* Left Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#works"
              className="text-slate-600 hover:text-slate-900 transition-colors duration-200 font-medium"
            >
              Works
            </a>
          </div>

          {/* Center Logo */}
          <div 
            className="text-2xl font-serif text-orange-500 cursor-pointer italic"
            onClick={() => navigate('/')}
          >
            Twin Me & <span className="text-slate-900">Artemis</span>
          </div>

          {/* Right Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#playground"
              className="text-slate-600 hover:text-slate-900 transition-colors duration-200 font-medium"
            >
              Playground
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};