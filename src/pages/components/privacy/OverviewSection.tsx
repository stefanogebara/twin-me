/**
 * Overview Section
 *
 * Three figures as compact rows: areas on, average shared, overall level.
 */

import React from 'react';
import { Section, List, Row } from '@/components/register';

// --- Types ---
interface OverviewSectionProps {
  activeClusters: number;
  totalClusters: number;
  averagePrivacy: string;
  currentGlobal: number;
}

const OverviewSection: React.FC<OverviewSectionProps> = ({
  activeClusters,
  totalClusters,
  averagePrivacy,
  currentGlobal,
}) => (
  <Section title="Overview">
    <List label="Overview" className="rs-compact">
      <Row title="Areas on" action={<span className="rs-figure">{activeClusters} of {totalClusters}</span>} />
      <Row title="Average shared" action={<span className="rs-figure">{averagePrivacy}</span>} />
      <Row title="Overall level" action={<span className="rs-figure">{currentGlobal}%</span>} />
    </List>
  </Section>
);

export default OverviewSection;
