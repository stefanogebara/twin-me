/**
 * A page that is waiting.
 *
 * One line in the register, a thin ink sweep under it, nothing else: no mark, no card, no
 * spinner. It is what a person sees for a second or two between pressing something and
 * getting the page, so it should look like the page they are about to get. When the wait
 * ends badly, the line says what happened and offers one way on.
 */
import '../styles/money-v2.css';

type Action = { label: string; onClick: () => void };

export default function Wait({ line = 'One moment.', sub = null, action = null }: { line?: string; sub?: string | null; action?: Action | null }) {
  return (
    <main className="mv mv-wait" role="status" aria-live="polite">
      <div className="mv-wait-col">
        <p className="mv-wait-line">{line}</p>
        {sub ? <p className="mv-sub">{sub}</p> : null}
        {action ? (
          <div className="mv-ctas"><button type="button" className="mv-pill" onClick={action.onClick}>{action.label}</button></div>
        ) : (
          <span className="mv-wait-track" aria-hidden="true"><i /></span>
        )}
      </div>
    </main>
  );
}
