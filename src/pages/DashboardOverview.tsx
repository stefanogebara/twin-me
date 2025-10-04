/**
 * Example Page: Dashboard > Overview
 *
 * Navigation Path: X (Dashboard) > Y (Overview)
 */

export default function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold text-[hsl(var(--claude-text))]"
          style={{
            fontFamily: 'var(--_typography---font--styrene-a)',
            letterSpacing: '-0.02em'
          }}
        >
          Dashboard Overview
        </h1>
        <p
          className="mt-2 text-[hsl(var(--claude-text-muted))]"
          style={{
            fontFamily: 'var(--_typography---font--tiempos)'
          }}
        >
          Main dashboard overview page with statistics and quick actions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Example stat cards */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-6 rounded-xl bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))]"
          >
            <h3 className="text-sm text-[hsl(var(--claude-text-muted))] mb-2">
              Metric {i}
            </h3>
            <p className="text-2xl font-bold text-[hsl(var(--claude-text))]">
              {Math.floor(Math.random() * 1000)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
