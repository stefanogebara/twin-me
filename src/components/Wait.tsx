/**
 * A page that is waiting.
 *
 * The orb shapes itself while the page is on its way (2026-09-16: Stefano asked for the
 * shape-changing one here), centred on the screen with its line under it.
 *
 * The orb at 64, breathing, and one line in the register under it, nothing else: no mark,
 * no card, no spinner. It is what a person sees for a second or two between pressing
 * something and getting the page, so it should look like the page they are about to get.
 * With no line at all it is the loading screen between routes: the orb alone, centred.
 * When the wait ends badly, the line says what happened and offers one way on, and the
 * orb goes, because nothing is working any more.
 */
import '../styles/money-v2.css';
import LedgerOrb, { type OrbState } from './LedgerOrb';
import { useT } from '@/lib/i18n';

type Action = { label: string; onClick: () => void };

export default function Wait({ line = 'One moment.', sub = null, action = null, state = 'shaping', inline = false }: { line?: string; sub?: string | null; action?: Action | null; state?: OrbState; /** Inside a page's column, while its first read is in flight. */ inline?: boolean }) {
  const t = useT();
  const Tag = inline ? 'div' : 'main';
  return (
    <Tag className={`mv mv-wait${inline ? ' is-inline' : ''}`} role="status" aria-live="polite">
      <div className={`mv-wait-col${line ? '' : ' is-bare'}`}>
        {action ? null : <LedgerOrb state={state} size={64} label={t(line || 'One moment.')} />}
        {line ? <p className="mv-wait-line">{t(line)}</p> : null}
        {sub ? <p className="mv-sub">{t(sub)}</p> : null}
        {action ? <div className="mv-ctas"><button type="button" className="mv-pill" onClick={action.onClick}>{t(action.label)}</button></div> : null}
      </div>
    </Tag>
  );
}
