import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, User, ArrowLeft } from 'lucide-react';

const ChooseTwinType = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'create';

  const handleTwinTypeSelection = (twinType: 'educational' | 'personal') => {
    if (mode === 'learn') {
      // For learning mode, go to existing twins or discovery page
      if (twinType === 'educational') {
        navigate('/talk-to-twin');
      } else {
        navigate('/student-dashboard');
      }
    } else {
      // For create mode, go to get-started page
      navigate(`/get-started?type=${twinType}`);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FAF9F5' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6">
        <button
          onClick={() => navigate('/choose-mode')}
          className="flex items-center space-x-2 text-sm"
          style={{ color: '#6B7280' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Mode Selection</span>
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
            {mode === 'learn' ? 'What would you like to learn about?' : 'What type of twin do you want to create?'}
          </h1>

          <p
            className="text-lg md:text-xl mb-12 max-w-2xl mx-auto"
            style={{
              color: '#6B7280',
              fontFamily: 'var(--_typography---font--tiempos)'
            }}
          >
            {mode === 'learn'
              ? 'Choose between educational content from professors or personal guidance from life coaches and mentors.'
              : 'Choose between creating an educational twin for teaching or a personal twin for general assistance.'
            }
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Educational Twin Option */}
            <div
              onClick={() => handleTwinTypeSelection('educational')}
              className="p-8 rounded-2xl border-2 cursor-pointer"
              style={{
                backgroundColor: 'white',
                borderColor: 'rgba(20,20,19,0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <GraduationCap className="w-8 h-8 text-white" />
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
                  Educational Twin
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  {mode === 'learn'
                    ? 'Learn from AI twins of professors, teachers, and subject matter experts. Get explanations, practice problems, and academic guidance.'
                    : 'Create a twin that embodies your teaching style and knowledge. Perfect for professors, instructors, and subject matter experts.'
                  }
                </p>
              </div>
            </div>

            {/* Personal Twin Option */}
            <div
              onClick={() => handleTwinTypeSelection('personal')}
              className="p-8 rounded-2xl border-2 cursor-pointer"
              style={{
                backgroundColor: 'white',
                borderColor: 'rgba(20,20,19,0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: '#D97706' }}
                >
                  <User className="w-8 h-8 text-white" />
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
                  Personal Twin
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--_typography---font--tiempos)'
                  }}
                >
                  {mode === 'learn'
                    ? 'Get guidance from AI twins of coaches, mentors, and advisors. Receive personal development advice and life coaching.'
                    : 'Create a twin that captures your personality and life experience. Great for coaches, mentors, and personal advisors.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChooseTwinType;