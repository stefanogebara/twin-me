import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NocturneLanding from './nocturne/NocturneLanding';

/**
 * / — the front door, on Nocturne since the flip (2026-09-01).
 * All landing content and the acquisition flow live in NocturneLanding;
 * this shell only owns the signed-in redirect. The prior cognition-hero
 * experiment is preserved in the pre-flip stash snapshot.
 */
const Index = () => {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/today" replace />;
  return <NocturneLanding />;
};

export default Index;
