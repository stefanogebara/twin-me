import React, { useState } from 'react';
import { toSecondPerson } from '@/lib/utils';
import { SectionLabel, Divider } from './shared';

interface SoulChapterProps {
  summary: string;
  archetype: string | null;
  uniquenessMarkers: string[];
}

const SoulChapter: React.FC<SoulChapterProps> = ({ summary, archetype, uniquenessMarkers }) => {
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const dotIdx = summary.indexOf('. ');
  const cutoff = dotIdx !== -1 && dotIdx < 180 ? dotIdx + 1 : 150;
  const summaryPreview = summary.slice(0, cutoff);
  const summaryNeedsTruncation = summary.length > summaryPreview.length;

  return (
    <>
      <SectionLabel label="Soul" />
      {archetype && (
        <h2
          className="mb-4"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '22px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.01em',
          }}
        >
          {archetype}
        </h2>
      )}
      <div>
        <p className="text-[15px] leading-relaxed max-w-prose" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {toSecondPerson(summaryExpanded ? summary : summaryPreview)}
        </p>
        {summaryNeedsTruncation && (
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="mt-2 text-xs"
            style={{ color: '#ff8400' }}
          >
            {summaryExpanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
      {uniquenessMarkers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-5">
          {uniquenessMarkers.map((marker, i) => (
            <span
              key={i}
              className="text-[12px] px-3 py-2 rounded-[46px]"
              style={{
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {marker}
            </span>
          ))}
        </div>
      )}
      <Divider />
    </>
  );
};

export default SoulChapter;
