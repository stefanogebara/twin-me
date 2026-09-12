import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

// The 404, in the register. The numeral is the only ornament: a Geist ghost at
// 8% on the page, aria-hidden. The title is the upright Cosmos heading; the
// buttons are the register's 32/4 primary and secondary.
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-6">
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

        <h1 className="n-heading mb-3" style={{ marginTop: '-8px' }}>
          This page went missing.
        </h1>

        <p className="n-body mb-10">
          The page you're looking for doesn't exist, or has moved since it was linked.
        </p>

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

        <p className="n-micro mt-12">
          Lost? Head home to find your soul signature.
        </p>
      </div>
    </main>
  );
};

export default NotFound;
