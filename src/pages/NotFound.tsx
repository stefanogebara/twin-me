import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

// Nocturne 404. The numeral is the only ornament — a serif ghost at 8% on
// obsidian, no photography behind it (the saturn-window/soul-waves pair
// retired with the flip).
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md mx-auto">
        <p
          aria-hidden
          className="n-display"
          style={{
            fontSize: 'clamp(110px, 20vw, 160px)',
            opacity: 0.08,
            lineHeight: 1,
            letterSpacing: '-0.04em',
          }}
        >
          404
        </p>

        {/* Law 4: the italic marks the verb, not the line. */}
        <h1 className="n-heading mb-3" style={{ fontSize: '32px', marginTop: '-8px' }}>
          This page went <em>missing</em>
        </h1>

        <p className="n-body mb-10" style={{ color: 'var(--n-ash)' }}>
          The page you're looking for doesn't exist, or has moved since it was linked.
        </p>

        {/* Law 2: one white primary, one ghost. No shadow, no lift, no blur. */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => navigate('/')} className="n-btn n-btn--primary">
            <Home className="w-4 h-4" aria-hidden />
            Home
          </button>
          <button onClick={() => navigate(-1)} className="n-btn n-btn--ghost">
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Go back
          </button>
        </div>

        <p className="n-micro mt-12" style={{ color: 'var(--n-fog)' }}>
          LOST? HEAD HOME TO FIND YOUR SOUL SIGNATURE.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
