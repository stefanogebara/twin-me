import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionLabel } from './shared';

const WhatsNextChapter: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <SectionLabel label="What's Next" />
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Your twin is learning. Connect more platforms to deepen your portrait.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/get-started')}
          className="px-4 py-2 rounded-[100px] text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ border: '1px solid #10b77f', color: '#10b77f' }}
        >
          Connect Platforms
        </button>
        <button
          onClick={() => navigate('/interview')}
          className="px-4 py-2 rounded-[100px] text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
        >
          Redo Interview
        </button>
      </div>
    </>
  );
};

export default WhatsNextChapter;
