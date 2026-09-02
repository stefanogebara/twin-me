import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MercuryLanding from './mercury/MercuryLanding';

/**
 * / — the front door, in the Mercury register since 2026-09-02 (decision: Stefano).
 * All landing content and the acquisition flow live in MercuryLanding; this shell
 * only owns the signed-in redirect. The Nocturne landing stays browsable at /nocturne.
 */
const Index = () => {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/today" replace />;
  return <MercuryLanding />;
};

export default Index;
