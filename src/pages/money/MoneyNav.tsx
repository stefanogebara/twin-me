/**
 * The money pages' navigation: a 200px column of plain text links beside the content, the
 * current one underlined and nothing filled; on a phone the same links sit behind a menu
 * button. Styles are in money-v2.css (.mv-side).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export type MoneyNavLink = { to: string; label: string; current?: boolean; sub?: boolean };

export default function MoneyNav({ links }: { links: MoneyNavLink[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <aside className={`mv-side${open ? ' is-open' : ''}`}>
      <div className="mv-side-bar">
        <Link to="/money" className="mv-mark" aria-label="TwinMe, this month" onClick={close}><i /><i /><i /><i /><i /><i /></Link>
        <button
          type="button"
          className="mv-pill mv-pill--ghost mv-side-toggle"
          aria-expanded={open}
          aria-controls="mv-side-links"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
          <span>Menu</span>
        </button>
      </div>
      <nav id="mv-side-links" className="mv-side-links" aria-label="Money">
        {links.map((l) => (l.to.startsWith('#') ? (
          <a key={l.to} href={l.to} className={l.sub ? 'is-sub' : undefined} onClick={close}>{l.label}</a>
        ) : (
          <Link key={l.to} to={l.to} className={l.sub ? 'is-sub' : undefined} aria-current={l.current ? 'page' : undefined} onClick={close}>{l.label}</Link>
        )))}
      </nav>
    </aside>
  );
}
