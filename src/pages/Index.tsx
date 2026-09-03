import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CosmosLanding from './cosmos/CosmosLanding';

/**
 * / — the front door, in the Cosmos design language since 2026-09-02 (decision:
 * Stefano), built from the same components as /presence. All landing content and the
 * acquisition flow live in CosmosLanding; this shell only owns the signed-in redirect,
 * which lands on the Portrait (the signed-in home since 2026-09-03).
 * The Nocturne landing stays browsable at /nocturne.
 */
const Index = () => {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/portrait" replace />;
  return <CosmosLanding />;
};

export default Index;
