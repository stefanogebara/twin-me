/**
 * DiscoverCorrectionForm — inline form when persona scrape is wrong
 * Shows Name + LinkedIn + Website + "Research Again" button
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface DiscoverCorrectionFormProps {
  defaultName?: string;
  onResearch: (data: { name: string; linkedin: string; website: string }) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export const DiscoverCorrectionForm: React.FC<DiscoverCorrectionFormProps> = ({
  defaultName = '',
  onResearch,
  onSkip,
  isLoading = false,
}) => {
  const [name, setName] = useState(defaultName);
  const [linkedin, setLinkedin] = useState('');
  const [website, setWebsite] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onResearch({ name: name.trim(), linkedin: linkedin.trim(), website: website.trim() });
  };

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: '#F5F5F4',
    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
  };

  const labelStyle = {
    color: 'rgba(255,255,255,0.40)',
    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
    fontSize: '12px',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto mt-6"
    >
      <p
        className="text-[14px] mb-5 text-center"
        style={{ color: 'rgba(255,255,255,0.50)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Help us find the right you:
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label style={labelStyle} className="block mb-1.5">Full Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Doe"
            required
            className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none focus:border-[rgba(255,255,255,0.20)]"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} className="block mb-1.5">LinkedIn Profile</label>
          <input
            type="url"
            value={linkedin}
            onChange={e => setLinkedin(e.target.value)}
            placeholder="https://linkedin.com/in/yourprofile"
            className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none focus:border-[rgba(255,255,255,0.20)]"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} className="block mb-1.5">Personal Website (optional)</label>
          <input
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="https://yourwebsite.com"
            className="w-full px-4 py-2.5 rounded-xl text-[14px] outline-none focus:border-[rgba(255,255,255,0.20)]"
            style={inputStyle}
          />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[13px] font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: '#F5F5F4',
              color: '#110f0f',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isLoading ? 'Researching...' : 'Research Again'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] transition-opacity hover:opacity-70"
            style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Skip
          </button>
        </div>
      </form>
    </motion.div>
  );
};
