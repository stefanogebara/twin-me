import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

// Claura 404 — lost among the rings. Saturn-window by night, soul-waves by day.
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md mx-auto">
        {/* 404 number — giant, faded into the scene */}
        <p
          style={{
            fontSize: 'clamp(110px, 20vw, 160px)',
            opacity: 0.16,
            color: 'var(--claura-text)',
            fontFamily: "'Instrument Serif', Georgia, serif",
            lineHeight: 1,
            letterSpacing: '-0.04em',
          }}
        >
          404
        </p>

        {/* Heading */}
        <h1
          className="mb-3"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '32px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
            marginTop: '-24px',
          }}
        >
          Page Not Found
        </h1>

        {/* Subtitle */}
        <p
          className="text-sm mb-10 leading-relaxed"
          style={{ color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}
        >
          The page you're looking for doesn't exist or may have been moved.
        </p>

        {/* Buttons — bone primary, glass secondary */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 justify-center py-2.5 px-6 rounded-[12px] text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-lg"
            style={{
              background: 'var(--claura-bone)',
              color: 'var(--claura-bone-ink)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <Home className="w-4 h-4" />
            Home
          </button>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 justify-center py-2.5 px-6 rounded-[12px] text-sm transition-opacity hover:opacity-70 backdrop-blur-[42px]"
            style={{
              background: 'var(--secondary)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Footer hint */}
        <p
          className="text-xs mt-12"
          style={{ color: 'var(--text-muted)', fontFamily: "'Inter', sans-serif" }}
        >
          Lost? Head back home to find your soul signature.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
