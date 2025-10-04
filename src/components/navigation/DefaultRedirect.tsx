import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { navigationConfig } from '../../config/navigation';

/**
 * Default Redirect Component
 *
 * Redirects logged-in users from / to the default main page
 * Redirects logged-out users to /auth
 */

interface DefaultRedirectProps {
  isAuthenticated: boolean;
}

export const DefaultRedirect: React.FC<DefaultRedirectProps> = ({ isAuthenticated }) => {
  const location = useLocation();

  useEffect(() => {
    console.log('🔀 DefaultRedirect:', {
      path: location.pathname,
      isAuthenticated,
      redirectTo: isAuthenticated ? navigationConfig.defaultRoute : '/auth'
    });
  }, [location.pathname, isAuthenticated]);

  if (isAuthenticated) {
    return <Navigate to={navigationConfig.defaultRoute} replace />;
  }

  return <Navigate to="/auth" replace />;
};
