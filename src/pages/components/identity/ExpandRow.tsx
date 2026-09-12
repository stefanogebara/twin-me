/**
 * ExpandRow — a register row whose longer text sits behind a press.
 *
 * The register allows one grey line per row. Identity's readings are often a
 * paragraph, so the row shows the first sentence and a chevron; pressing it
 * opens the rest underneath, inside the same list item. With nothing more to
 * show it is a plain Row. Built on the page kit's classes (register-kit.css);
 * the kit's Row has no expanded state, so this is the local extension.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Row } from '@/components/register';

interface ExpandRowProps {
  title: React.ReactNode;
  /** The one grey line: usually the first sentence. */
  line?: React.ReactNode;
  /** What the press reveals. Null or empty makes this a plain row. */
  more?: React.ReactNode;
  /** A 32px icon square. */
  icon?: React.ReactNode;
  /** Controlled open state, for pages that keep one row open at a time. */
  open?: boolean;
  onToggle?: () => void;
}

const ExpandRow: React.FC<ExpandRowProps> = ({ title, line, more, icon, open, onToggle }) => {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const toggle = onToggle ?? (() => setOwnOpen((o) => !o));

  if (!more) return <Row title={title} line={line} icon={icon} />;

  return (
    <li>
      <button
        type="button"
        className={`rg-row rg-row--link${icon ? '' : ' rg-row--plain'}`}
        aria-expanded={isOpen}
        onClick={toggle}
        // Open, the hairline moves under the revealed text.
        style={isOpen ? { borderBottomColor: 'transparent' } : undefined}
      >
        {icon ? <span className="rg-row-icon" aria-hidden="true">{icon}</span> : null}
        <span className="rg-row-text">
          <span className="rg-row-title">{title}</span>
          {line ? <span className="rg-row-line">{line}</span> : null}
        </span>
        <span className="rg-row-action">
          <ChevronDown
            className="rg-chevron"
            aria-hidden="true"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--rg-quick)' }}
          />
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: `0 12px 20px ${icon ? 60 : 12}px`,
            marginTop: -8,
            borderBottom: '1px solid var(--rg-rule)',
            color: 'var(--rg-ink-2)',
            fontWeight: 350,
          }}
        >
          {more}
        </div>
      )}
    </li>
  );
};

export default ExpandRow;
