import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Landing from './landing/Landing';

/**
 * / — the front door. Since 2026-09-05 (decision: Stefano) it is the landing started
 * from a white page, src/pages/landing/Landing.tsx: the page is the portrait. This shell
 * only owns the signed-in redirect, which lands on the Portrait (the signed-in home since
 * 2026-09-03). The previous front doors stay browsable: the Cosmos one at /cosmos/landing,
 * the Nocturne one at /nocturne.
 */
const Index = () => {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/portrait" replace />;
  return <Landing />;
};

export default Index;
