import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Music, Youtube, MessageCircle, Github, CheckCircle } from 'lucide-react';

const Step5ConnectPlatforms = () => {
  const navigate = useNavigate();
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const platforms = [
    {
      id: 'spotify',
      name: 'Spotify',
      icon: Music,
      color: '#1DB954',
      description: 'Discover your musical soul signature'
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: Youtube,
      color: '#FF0000',
      description: 'Understand your curiosity and learning patterns'
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: MessageCircle,
      color: '#5865F2',
      description: 'Capture your community engagement style'
    },
    {
      id: 'github',
      name: 'GitHub',
      icon: Github,
      color: '#24292e',
      description: 'Analyze your coding and collaboration patterns'
    }
  ];

  const handleConnectPlatform = async (platformId: string) => {
    try {
      setConnectingPlatform(platformId);

      // Get or create temporary user ID for onboarding
      let tempUserId = sessionStorage.getItem('temp_user_id');
      if (!tempUserId) {
        tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('temp_user_id', tempUserId);
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      // Route to appropriate connector endpoint
      let endpoint = '';
      if (platformId === 'spotify' || platformId === 'youtube') {
        endpoint = `${apiUrl}/entertainment/connect/${platformId}`;
      } else if (platformId === 'discord' || platformId === 'github') {
        endpoint = `${apiUrl}/connectors/auth/${platformId}?userId=${tempUserId}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: tempUserId })
      });

      if (!response.ok) {
        console.error(`Failed to initiate ${platformId} OAuth`);
        setConnectingPlatform(null);
        return;
      }

      const data = await response.json();
      if (data.success && (data.authUrl || data.data?.authUrl)) {
        // Store where to return after OAuth
        sessionStorage.setItem('oauth_return_step', 'platforms');
        // Store connected platforms list
        const updatedPlatforms = [...connectedPlatforms, platformId];
        sessionStorage.setItem('connected_platforms', JSON.stringify(updatedPlatforms));
        // Redirect to platform OAuth
        window.location.href = data.authUrl || data.data.authUrl;
      } else {
        setConnectingPlatform(null);
      }
    } catch (error) {
      console.error(`${platformId} OAuth error:`, error);
      setConnectingPlatform(null);
    }
  };

  const handleContinue = () => {
    // Clear temp data and continue to next step
    sessionStorage.removeItem('oauth_return_step');
    navigate('/step6');
  };

  // Check for recently connected platform from OAuth callback
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const provider = urlParams.get('provider');

    if (connected === 'true' && provider) {
      // Add to connected platforms
      const stored = sessionStorage.getItem('connected_platforms');
      const platforms = stored ? JSON.parse(stored) : [];
      if (!platforms.includes(provider)) {
        platforms.push(provider);
        sessionStorage.setItem('connected_platforms', JSON.stringify(platforms));
        setConnectedPlatforms(platforms);
      }
      // Clean URL
      window.history.replaceState({}, '', '/platforms');
    } else {
      // Load stored connections
      const stored = sessionStorage.getItem('connected_platforms');
      if (stored) {
        setConnectedPlatforms(JSON.parse(stored));
      }
    }
  }, []);

  const isPlatformConnected = (platformId: string) => connectedPlatforms.includes(platformId);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-stone-100">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-8 left-8 text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
      >
        Back
      </button>

      <div className="w-full max-w-3xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-normal tracking-tight text-stone-900 font-garamond">
            Connect your platforms
          </h1>
          <p className="text-[15px] leading-6 text-stone-600 max-w-2xl mx-auto">
            Connect entertainment and social platforms to discover your authentic soul signature.
            These connections help us understand your curiosities, passions, and unique personality.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const isConnected = isPlatformConnected(platform.id);
            const isConnecting = connectingPlatform === platform.id;

            return (
              <button
                key={platform.id}
                onClick={() => !isConnected && !isConnecting && handleConnectPlatform(platform.id)}
                disabled={isConnected || isConnecting}
                className={`
                  flex items-center gap-4 p-6 rounded-xl border transition-all duration-200
                  ${isConnected
                    ? 'bg-stone-50 border-stone-300 cursor-default'
                    : 'bg-white border-stone-200 hover:bg-stone-50 hover:border-stone-300 hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.06)]'
                  }
                  ${isConnecting ? 'opacity-50 cursor-wait' : ''}
                `}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: `${platform.color}20` }}
                >
                  <Icon className="w-6 h-6" style={{ color: platform.color }} />
                </div>

                <div className="flex-1 text-left">
                  <h3 className="text-[15px] leading-5 font-medium text-stone-900">
                    {platform.name}
                  </h3>
                  <p className="text-[13px] leading-5 text-stone-600 mt-1">
                    {platform.description}
                  </p>
                </div>

                {isConnected ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <ArrowRight className="w-5 h-5 text-stone-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-4 text-center">
          <div className="max-w-md mx-auto">
            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 text-[15px] leading-5 font-medium text-white bg-stone-900 rounded-xl transition-all duration-200 hover:bg-stone-800 hover:shadow-md"
            >
              {connectedPlatforms.length > 0
                ? `Continue with ${connectedPlatforms.length} platform${connectedPlatforms.length > 1 ? 's' : ''}`
                : 'Continue'
              }
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleContinue}
            className="text-[15px] leading-5 text-stone-600 hover:text-stone-900 transition-colors duration-200"
          >
            Skip for now
          </button>

          <div className="pt-4 text-[13px] leading-5 text-stone-500 max-w-md mx-auto">
            <p>You can connect these platforms later from your dashboard. Your privacy controls allow you to adjust what information is revealed.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step5ConnectPlatforms;
