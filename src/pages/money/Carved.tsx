/**
 * The carved marks: relief woodcuts cut with Racha's pipeline (tools/carve there), one per
 * kind of place and per thing the ledger holds. Each file is an alpha mask, black ink on
 * nothing, so it sits on any ground. A mark stands for a thing in the ledger, never for a
 * mood: the tile's ground is the kind's signature at low strength, the ink stays ink.
 */
import { GROUND_BY_KIND, markFor } from './carvedKinds';

/** A 32px tile with the kind's mark in ink on its ground; the kind's initial when there is no mark. */
export function KindTile({ kind, label }: { kind: string | null | undefined; label?: string }) {
  const mark = markFor(kind);
  const ground = (kind && GROUND_BY_KIND[kind]) || 'none';
  return (
    <span className={`mv-icon mv-tile mv-tile--${ground}`} aria-hidden="true">
      {mark ? <img className="mv-carved" src={`/images/money/carved/${mark}.png`} alt="" width={26} height={26} /> : <span>{(label || kind || '').charAt(0).toUpperCase()}</span>}
    </span>
  );
}

/** The page's stamp: one carving the size of a postage stamp at the head of a page. Never animates, never changes with the numbers. */
export function Stamp({ mark }: { mark: string }) {
  return <img className="mv-stamp" src={`/images/money/carved/${mark}.png`} alt="" width={88} height={88} aria-hidden="true" />;
}
