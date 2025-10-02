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
    <div className="min-h-screen bg-[#FAF9F5]">
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-lg mx-auto">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 bg-white border border-[rgba(20,20,19,0.1)]">
            <span className="text-4xl text-[#D97706]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}>404</span>
          </div>
          <h1 className="text-[clamp(2rem,4vw,3rem)] mb-6 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Page Not Found
          </h1>
          <p className="text-[20px] mb-8 text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            The page you're looking for doesn't exist or may have been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 justify-center px-6 py-3 rounded-lg border bg-white border-[rgba(20,20,19,0.1)] text-[#141413]"
              style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 justify-center px-6 py-3 rounded-lg btn-anthropic-primary"
              style={{ fontFamily: 'var(--_typography---font--tiempos)', fontWeight: 500 }}
            >
              <Home className="w-4 h-4" />
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
