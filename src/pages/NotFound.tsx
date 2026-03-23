import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md mx-auto">
        {/* 404 number */}
        <p
          className="text-8xl font-bold mb-4"
          style={{
            color: 'rgba(255, 255, 255, 0.04)',
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
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Page Not Found
        </h1>

        {/* Subtitle */}
        <p
          className="text-sm mb-10 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
        >
          The page you're looking for doesn't exist or may have been moved.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 justify-center py-2.5 px-5 rounded-lg text-sm transition-opacity hover:opacity-70"
            style={{
              border: '1px solid var(--border)',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 justify-center py-2.5 px-5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: '#252222',
              color: '#fdfcfb',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        </div>

        {/* Footer hint */}
        <p
          className="text-xs mt-12"
          style={{ color: 'rgba(255,255,255,0.15)' }}
        >
          Lost? Head back home to find your soul signature.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
