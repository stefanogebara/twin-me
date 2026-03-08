import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";
import { Clay3DIcon } from '@/components/Clay3DIcon';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="min-h-screen relative overflow-hidden"
    >
      {/* Subtle background texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(255, 255, 255, 0.05) 0%, transparent 70%), radial-gradient(ellipse 60% 80% at 80% 80%, rgba(255, 255, 255, 0.04) 0%, transparent 70%)',
        }}
      />

      <div className="min-h-screen flex items-center justify-center px-6 relative z-10">
        <div className="text-center max-w-lg mx-auto">
          {/* Glass card */}
          <div
            className="glass-card-ds mb-8"
            style={{ padding: '3rem' }}
          >
            {/* Icon */}
            <div className="mx-auto mb-8" style={{ opacity: 0.75 }}>
              <Clay3DIcon name="compass" size={80} />
            </div>

            {/* 404 number */}
            <p
              className="text-8xl font-bold mb-4"
              style={{
                color: 'rgba(255, 255, 255, 0.06)',
                fontFamily: '"Halant", Georgia, serif',
                lineHeight: 1,
                letterSpacing: '-0.04em',
              }}
            >
              404
            </p>

            {/* Heading */}
            <h1
              className="heading-serif text-[clamp(1.75rem,3.5vw,2.5rem)] mb-4"
            >
              Page Not Found
            </h1>

            {/* Subtitle */}
            <p
              className="text-base mb-10 leading-relaxed"
              style={{
                color: 'var(--text-secondary)',
              }}
            >
              The page you're looking for doesn't exist or may have been moved.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate(-1)}
                className="btn-glass-app flex items-center gap-2 justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </button>
              <button
                onClick={() => navigate('/')}
                className="btn-cta-app flex items-center gap-2 justify-center"
              >
                <Home className="w-4 h-4" />
                Home
              </button>
            </div>
          </div>

          {/* Footer hint */}
          <p
            className="text-xs"
            style={{ color: 'rgba(138, 133, 125, 0.6)' }}
          >
            Lost? Head back home to find your soul signature.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
