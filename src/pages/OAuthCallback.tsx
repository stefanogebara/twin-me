/**
 * OAuth Callback Handler
 * Handles OAuth returns from external providers
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import LoadingScreen from '@/components/LoadingScreen';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    let hasRun = false; // Prevent duplicate requests

    const handleCallback = async () => {
      if (hasRun) return; // Prevent duplicate calls
      hasRun = true;

      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        console.log('🔄 OAuth callback starting with:', { code: !!code, state: !!state, error });

        if (error) {
          throw new Error(`OAuth error: ${error}`);
        }

        if (!code || !state) {
          throw new Error('Missing authorization code or state');
        }

        console.log('📤 Sending callback request to server...');

        // Send callback data to backend
        const response = await fetch(`http://localhost:3001/api/connectors/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state })
        });

        console.log('📥 Server response status:', response.status);
        const result = await response.json();
        console.log('📥 Server response data:', result);

        if (result.success) {
          setStatus('success');
          toast({
            title: "Connected!",
            description: `Successfully connected to ${result.data?.provider}`,
          });

          console.log('✅ Connection successful, redirecting...');
          // Redirect back to onboarding
          setTimeout(() => {
            navigate('/get-started?connected=true');
          }, 2000);
        } else {
          throw new Error(result.error || 'Connection failed');
        }

      } catch (error: any) {
        console.error('❌ OAuth callback error:', error);
        setStatus('error');
        toast({
          title: "Connection failed",
          description: error.message || 'Unable to complete connection',
          variant: "destructive"
        });

        // Redirect back to onboarding after error
        setTimeout(() => {
          navigate('/get-started?error=connection_failed');
        }, 3000);
      }
    };

    handleCallback();
  }, []); // Remove dependencies to prevent re-runs

  if (status === 'processing') {
    return (
      <LoadingScreen
        message="Processing connection"
        submessage="Completing OAuth authentication..."
      />
    );
  }

  if (status === 'success') {
    return (
      <LoadingScreen
        message="Connected successfully!"
        submessage="Redirecting you back to onboarding..."
      />
    );
  }

  if (status === 'error') {
    return (
      <LoadingScreen
        message="Connection failed"
        submessage="Redirecting you back to try again..."
      />
    );
  }

  return null;
};

export default OAuthCallback;