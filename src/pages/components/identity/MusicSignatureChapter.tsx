import React from 'react';
import { SectionLabel, Divider } from './shared';

interface MusicSignatureChapterProps {
  genres: string[];
  listeningPattern: string | null;
}

const MusicSignatureChapter: React.FC<MusicSignatureChapterProps> = ({ genres, listeningPattern }) => (
  <>
    <SectionLabel label="Music Signature" color="#c1452c" />
    <div className="flex flex-wrap gap-2 mb-3">
      {genres.map((genre, i) => (
        <span
          key={i}
          className="text-[12px] px-3 py-1.5 rounded-[46px]"
          style={{
            color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {genre}
        </span>
      ))}
    </div>
    {listeningPattern && (
      <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {listeningPattern}
      </p>
    )}
    <Divider />
  </>
);

export default MusicSignatureChapter;
