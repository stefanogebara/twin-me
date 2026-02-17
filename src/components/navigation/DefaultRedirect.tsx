import { Navigate } from 'react-router-dom';
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
  if (isAuthenticated) {
    return <Navigate to={navigationConfig.defaultRoute} replace />;
  }

  return <Navigate to="/auth" replace />;
};
