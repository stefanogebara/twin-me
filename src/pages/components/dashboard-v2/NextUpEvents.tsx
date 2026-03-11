interface NextUpEventsProps {
  events: Array<{ title: string; startTime: string; endTime: string }>;
}

const LABEL_STYLE = 'text-[11px] uppercase tracking-[0.15em] font-medium mb-4';

function formatEventTime(startTime: string): string {
  const now = new Date();
  const start = new Date(startTime);
  const diffMs = start.getTime() - now.getTime();

  if (diffMs < 0) return 'now';

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `in ${diffMin}m`;

  const diffH = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;

  const isToday = start.toDateString() === now.toDateString();
  if (isToday) {
    return remainMin > 0 ? `in ${diffH}h ${remainMin}m` : `in ${diffH}h`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();
  const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isTomorrow) return `Tomorrow ${timeStr}`;
  return `${start.toLocaleDateString([], { weekday: 'short' })} ${timeStr}`;
}

export function NextUpEvents({ events }: NextUpEventsProps) {
  const visible = events.slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <section className="mb-12">
      <p className={LABEL_STYLE} style={{ color: 'var(--text-muted)' }}>
        NEXT UP
      </p>
      <div>
        {visible.map((evt, i) => (
          <div
            key={`${evt.title}-${i}`}
            className="flex items-center justify-between py-3"
            style={{
              borderBottom: i < visible.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined,
            }}
          >
            <span className="text-[14px]" style={{ color: 'var(--foreground)' }}>
              {evt.title}
            </span>
            <span className="text-[13px] ml-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {formatEventTime(evt.startTime)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
