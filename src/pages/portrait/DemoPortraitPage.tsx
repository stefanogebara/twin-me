import { useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  const banner = (
    <div className="pc-pt-banner" role="note">
      <span>This is Stefano's Portrait, read from {DEMO_PORTRAIT.sources.length} sources. Evidence selected from real events.</span>
      <Link to="/">Your own starts from your email on the front door</Link>
    </div>
  );
  return <PortraitPage data={DEMO_PORTRAIT} now={new Date('2026-09-04T12:00:00Z')} banner={banner} />;
}
