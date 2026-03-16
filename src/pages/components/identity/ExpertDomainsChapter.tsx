import React from 'react';
import { toSecondPerson } from '@/lib/utils';
import { cleanBullets } from './helpers';
import { EXPERT_SECTIONS } from './types';
import { SectionLabel, Divider } from './shared';

interface ExpertDomainsChapterProps {
  expertInsights: Record<string, string[]>;
}

const ExpertDomainsChapter: React.FC<ExpertDomainsChapterProps> = ({ expertInsights }) => (
  <>
    {EXPERT_SECTIONS.map((section) => {
      const rawBullets = expertInsights[section.key] ?? [];
      const bullets = cleanBullets(rawBullets);
      if (bullets.length === 0) return null;

      return (
        <React.Fragment key={section.key}>
          <SectionLabel label={section.label} color={section.dotColor} />
          <div className="space-y-3">
            {bullets.map((bullet, i) => (
              <p
                key={i}
                className="text-[15px] leading-relaxed max-w-prose"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {toSecondPerson(bullet)}
              </p>
            ))}
          </div>
          <Divider />
        </React.Fragment>
      );
    })}
  </>
);

export default ExpertDomainsChapter;
