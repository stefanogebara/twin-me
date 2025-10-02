import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { BookOpen, Sparkles, ArrowLeft, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ChooseMode = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hasExistingTwin, setHasExistingTwin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user has existing twins
  useEffect(() => {
    const checkForExistingTwins = async () => {
      if (!user) return;

      try {
        // Check multiple possible endpoints for twins
        const endpoints = [
          '/api/twins',
          '/api/soul-extraction/status',
          '/api/connectors/status/current-user'
        ];

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`);
            if (response.ok) {
              const data = await response.json();

              // Check if user has any twins or connections that indicate a created twin
              if ((data.data && data.data.length > 0) ||
                  (data.twins && data.twins.length > 0) ||
                  (data.success && Object.keys(data.data || {}).length > 0)) {
                setHasExistingTwin(true);
                break;
              }
            }
          } catch (err) {
            console.log(`Endpoint ${endpoint} not available:`, err);
            continue;
          }
        }
      } catch (error) {
        console.log('Error checking for existing twins:', error);
      } finally {
        setLoading(false);
      }
    };

    checkForExistingTwins();
  }, [user]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FAF9F5' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-sm"
          style={{ color: '#6B7280' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-4xl w-full text-center">
          <h1
            className="text-4xl md:text-6xl mb-6"
            style={{
              color: '#141413',
              fontFamily: 'var(--_typography---font--styrene-a)',
              fontWeight: 500,
              letterSpacing: '-0.02em'
            }}
          >
            What would you like to do?
          </h1>

          <p
            className="text-lg md:text-xl mb-12 max-w-2xl mx-auto"
            style={{
              color: '#6B7280',
              fontFamily: 'var(--_typography---font--tiempos)'
            }}
          >
            {loading ? 'Loading your options...' : hasExistingTwin
              ? 'Welcome back! Access your existing twin or create a new one.'
              : 'Choose whether you want to learn from AI twins or create your own digital twin.'
            }
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Learn/Access Twin Option */}
            <div
              onClick={() => hasExistingTwin ? navigate('/soul-signature') : navigate('/talk-to-twin')}
              className="p-8 rounded-2xl border cursor-pointer"
              style={{
                backgroundColor: 'white',
                borderColor: 'rgba(20, 20, 19, 0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: '#D97706' }}
                >
                  {hasExistingTwin ? (
                    <User className="w-8 h-8 text-white" />
                  ) : (
                    <BookOpen className="w-8 h-8 text-white" />
                  )}
                </div>
                <h3
                  className="text-2xl mb-4"
                  style={{
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em'
                  }}
                >
                  {loading ? 'Loading...' : hasExistingTwin ? 'Access Twin' : 'Learn'}
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  {loading ? 'Checking your account...' : hasExistingTwin
                    ? 'Access and manage your existing digital twin, update your soul signature, or chat with your twin.'
                    : 'Interact with digital twins of real people - discover their unique perspectives, learn from their experiences, and engage with their authentic personalities.'
                  }
                </p>
              </div>
            </div>

            {/* Create Option */}
            <div
              onClick={() => navigate('/soul-signature')}
              className="p-8 rounded-2xl border cursor-pointer"
              style={{
                backgroundColor: 'white',
                borderColor: 'rgba(20, 20, 19, 0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3
                  className="text-2xl mb-4"
                  style={{
                    color: '#141413',
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em'
                  }}
                >
                  Create
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  Build your digital twin by connecting your digital life - from Netflix to Spotify to Gmail - capturing your true essence and originality.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChooseMode;