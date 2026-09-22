/**
 * One place, ahead of every route: a twin page renders the parked line instead of itself
 * while the twin is parked. See src/lib/legacyTwin.ts for the list and the switch.
 */
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { legacyTwinEnabled, parkedPage } from '@/lib/legacyTwin';
import Parked from '@/pages/Parked';

export default function LegacyTwinGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (!legacyTwinEnabled() && parkedPage(pathname)) return <Parked />;
  return <>{children}</>;
}
