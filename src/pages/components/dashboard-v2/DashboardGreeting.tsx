interface DashboardGreetingProps {
  firstName: string;
  timeLabel: 'morning' | 'afternoon' | 'evening';
  insightCount: number;
  streak: number;
}

export function DashboardGreeting({ firstName, timeLabel, insightCount, streak }: DashboardGreetingProps) {
  const hasName = firstName && firstName !== 'there';
  const greetingText = hasName ? `Good ${timeLabel}, ${firstName}` : `Good ${timeLabel}`;
  const sub = insightCount > 0
    ? `${insightCount} new insight${insightCount === 1 ? '' : 's'} since yesterday`
    : 'Your twin is learning about you';
  const streakText = streak > 0 ? `${streak}-day streak` : null;

  return (
    <section className="mb-12">
      <h1
        className="tracking-tight"
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
          color: 'var(--foreground)',
          lineHeight: 1.1,
        }}
      >
        {greetingText}
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {sub}{streakText ? <> &middot; {streakText}</> : null}
      </p>
    </section>
  );
}
