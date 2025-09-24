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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--_color-theme---background)' }}>
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-lg mx-auto">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8" style={{ backgroundColor: 'var(--_color-theme---background-secondary)' }}>
            <span className="u-display-l" style={{ color: 'var(--_color-theme---button-primary--background)' }}>404</span>
          </div>
          <h1 className="u-display-l text-heading mb-6">
            Page Not Found
          </h1>
          <p className="text-body-large mb-8" style={{ color: 'var(--_color-theme---text)' }}>
            The page you're looking for doesn't exist or may have been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(-1)}
              className="btn-anthropic-secondary flex items-center gap-2 justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <button
              onClick={() => navigate('/')}
              className="btn-anthropic-primary flex items-center gap-2 justify-center"
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
