import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Home, ArrowLeft } from "lucide-react";
import { Clay3DIcon } from '@/components/Clay3DIcon';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const bgColor = theme === 'dark' ? '#232320' : '#FAFAFA';

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-lg mx-auto">
          <div className="mx-auto mb-8 opacity-60">
            <Clay3DIcon name="compass" size={80} />
          </div>
          <h1
            className="text-[clamp(2rem,4vw,3rem)] mb-4"
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: textColor
            }}
          >
            Page Not Found
          </h1>
          <p
            className="text-base mb-8"
            style={{
              fontFamily: 'var(--font-body)',
              color: textSecondary
            }}
          >
            The page you're looking for doesn't exist or may have been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 justify-center px-6 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.15)' : '1px solid rgba(0, 0, 0, 0.08)',
                color: textColor,
                fontFamily: 'var(--font-body)'
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 justify-center px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                color: theme === 'dark' ? '#232320' : '#ffffff',
                fontFamily: 'var(--font-body)'
              }}
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
