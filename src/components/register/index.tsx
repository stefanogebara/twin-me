import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * The register's page kit (src/styles/register-kit.css): the shapes every app
 * screen is built from. A page is a PageHead, then Sections; a Section is a
 * heading and one grey line over a List of Rows. No cards, no panels.
 *
 *   <Page>
 *     <PageHead title="Settings" line="Your account and your twin." />
 *     <Section title="Account" line="How you sign in.">
 *       <List>
 *         <Row title="Email" line="stefano@..." />
 *         <Row title="Voice" line="Standard voice" to="/settings/voice" />
 *       </List>
 *     </Section>
 *   </Page>
 */

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rg-page', className)}>{children}</div>;
}

export function PageHead({ title, line, action }: { title: ReactNode; line?: ReactNode; action?: ReactNode }) {
  return (
    <header className="rg-apphead">
      <h1 className="rg-apphead-title">{title}</h1>
      {line ? <p className="rg-apphead-line">{line}</p> : null}
      {action ? <div className="rg-apphead-action">{action}</div> : null}
    </header>
  );
}

export function Section({
  title,
  line,
  action,
  id,
  children,
  className,
}: {
  title?: ReactNode;
  line?: ReactNode;
  /** The section's one action, at the right end of the heading line (e.g. an add button). */
  action?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx('rg-section', className)}>
      {title || line ? (
        <div className="rg-sechead">
          {title ? <h2 className="rg-sechead-title">{title}</h2> : null}
          {line ? <p className="rg-sechead-line">{line}</p> : null}
          {action ? <div className="rg-sechead-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul className={cx('rg-list', className)} aria-label={label}>
      {children}
    </ul>
  );
}

export function Chevron() {
  return <ChevronRight className="rg-chevron" aria-hidden="true" />;
}

type RowProps = {
  title: ReactNode;
  /** The one grey line under the title. */
  line?: ReactNode;
  /** A 32px icon square; omit for a plain row. */
  icon?: ReactNode;
  /** One action at the row's end: a chevron, a 32px button or a menu. Never two. */
  action?: ReactNode;
  /** The whole row links here (a chevron is added when no action is given). */
  to?: string;
  /** The whole row is one button. */
  onClick?: () => void;
  /** Cut the grey line to one line with an ellipsis. */
  clip?: boolean;
  className?: string;
};

export function Row({ title, line, icon, action, to, onClick, clip, className }: RowProps) {
  const linked = Boolean(to || onClick);
  const end = action ?? (linked ? <Chevron /> : null);
  const body = (
    <>
      {icon ? <span className="rg-row-icon" aria-hidden="true">{icon}</span> : null}
      <span className="rg-row-text">
        <span className="rg-row-title">{title}</span>
        {line ? <span className={cx('rg-row-line', clip && 'rg-row-line--clip')}>{line}</span> : null}
      </span>
      {end ? <span className="rg-row-action">{end}</span> : <span />}
    </>
  );
  const rowClass = cx('rg-row', !icon && 'rg-row--plain', linked && 'rg-row--link', className);

  if (to) {
    return (
      <li>
        <Link to={to} className={rowClass}>{body}</Link>
      </li>
    );
  }
  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} className={rowClass}>{body}</button>
      </li>
    );
  }
  return <li className={rowClass}>{body}</li>;
}

export function SubRow({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <li className={cx('rg-subrow', className)}>
      <span className="rg-row-text">{children}</span>
      {action ? <span className="rg-row-action">{action}</span> : <span />}
    </li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rg-empty">{children}</p>;
}
