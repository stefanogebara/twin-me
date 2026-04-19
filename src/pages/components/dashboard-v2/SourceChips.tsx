interface SourceChipsProps {
  sources?: string[] | null;
  max?: number;
}

const CHIP_CLASS =
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium';

const CHIP_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.55)',
  fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
};

/**
 * Renders small provenance chips for the platforms an insight draws from.
 * Hidden entirely when sources is empty (legacy rows should not leave a gap).
 */
export function SourceChips({ sources, max = 5 }: SourceChipsProps) {
  if (!sources || sources.length === 0) return null;
  const visible = sources.slice(0, max);
  const overflow = sources.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {visible.map((name) => (
        <span key={name} className={CHIP_CLASS} style={CHIP_STYLE}>
          {name}
        </span>
      ))}
      {overflow > 0 && (
        <span className={CHIP_CLASS} style={CHIP_STYLE}>
          +{overflow}
        </span>
      )}
    </div>
  );
}
