import { useNavigate } from 'react-router-dom';
import { BookOpen, Sparkles, ArrowLeft } from 'lucide-react';

const ChooseMode = () => {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--_color-theme---background)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-sm"
          style={{ color: 'var(--_color-theme---text-secondary)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-4xl w-full text-center">
          <h1
            className="text-4xl md:text-6xl font-bold mb-6"
            style={{
              color: 'var(--_color-theme---text)',
              fontFamily: 'var(--_typography---font--styrene-a)'
            }}
          >
            What would you like to do?
          </h1>

          <p
            className="text-lg md:text-xl mb-12 max-w-2xl mx-auto"
            style={{ color: 'var(--_color-theme---text-secondary)' }}
          >
            Choose whether you want to learn from AI twins or create your own digital twin.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Learn Option */}
            <div
              onClick={() => navigate('/talk-to-twin')}
              className="p-8 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-105"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                >
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <h3
                  className="text-2xl font-bold mb-4"
                  style={{
                    color: 'var(--_color-theme---text)',
                    fontFamily: 'var(--_typography---font--styrene-a)'
                  }}
                >
                  Learn
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  Interact with digital twins of real people - discover their unique perspectives, learn from their experiences, and engage with their authentic personalities.
                </p>
              </div>
            </div>

            {/* Create Option */}
            <div
              onClick={() => navigate('/soul-signature')}
              className="p-8 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-105"
              style={{
                backgroundColor: 'var(--_color-theme---surface)',
                borderColor: 'var(--_color-theme---border)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'var(--_color-theme---accent)' }}
                >
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3
                  className="text-2xl font-bold mb-4"
                  style={{
                    color: 'var(--_color-theme---text)',
                    fontFamily: 'var(--_typography---font--styrene-a)'
                  }}
                >
                  Create
                </h3>
                <p
                  className="text-base leading-relaxed"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
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