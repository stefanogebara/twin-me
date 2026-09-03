import { useEffect } from 'react';
import { DEMO_PORTRAIT } from '../../data/demoPortrait';
import { PortraitPage } from './PortraitPage';

/**
 * /demo: Stefano's Portrait, public, from the approved static export.
 * The fixed `now` keeps the export's states stable: the demo is a snapshot dated the day
 * after the last evidence, so the ledger reads "New this week" for what was new then.
 */
export default function DemoPortraitPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Stefano's Portrait · TwinMe";
    return () => { document.title = previousTitle; };
  }, []);
  // Rendered as the hero kicker; the page adds the "Read your own" action when a banner is present.
  const banner = <>What it told Stefano, from his own data</>;
  return <PortraitPage data={DEMO_PORTRAIT} now={new Date('2026-09-04T12:00:00Z')} banner={banner} />;
}
