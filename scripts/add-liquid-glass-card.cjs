const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'Step1Welcome.tsx');

// Read the current file
const currentContent = fs.readFileSync(filePath, 'utf8');

// Update the imports to include User, Heart, Zap
const updatedImports = currentContent.replace(
  "import { ArrowRight, Sparkles } from 'lucide-react';",
  "import { ArrowRight, Sparkles, User, Heart, Zap } from 'lucide-react';"
);

// Define the liquid glass showcase card component
const liquidGlassCard = `
        {/* Liquid Glass Showcase Card - Cofounder style */}
        <div className="flex justify-center px-4">
          <div
            className="relative w-full max-w-3xl rounded-3xl overflow-hidden"
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 8px 32px rgba(135, 206, 235, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            }}
          >
            {/* Subtle highlight overlay */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 50%)',
              }}
            />

            <div className="relative p-8 sm:p-10">
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-medium text-stone-900 mb-2">Your Soul Signature Reveals</h3>
                  <p className="text-sm text-stone-600">Authentic patterns only you possess</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Personal Identity Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.6)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(176, 216, 240, 0.3)',
                      boxShadow: '0 4px 16px rgba(135, 206, 235, 0.08)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgba(176, 216, 240, 0.3), rgba(135, 206, 235, 0.2))',
                        }}
                      >
                        <Heart className="w-6 h-6" style={{ color: '#87CEEB' }} />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Personal Identity</h4>
                      <p className="text-sm text-stone-600">Your unique tastes and preferences</p>
                    </div>
                  </div>

                  {/* Curiosity Profile Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.6)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(176, 216, 240, 0.3)',
                      boxShadow: '0 4px 16px rgba(135, 206, 235, 0.08)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgba(176, 216, 240, 0.3), rgba(135, 206, 235, 0.2))',
                        }}
                      >
                        <Zap className="w-6 h-6" style={{ color: '#87CEEB' }} />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Curiosity Profile</h4>
                      <p className="text-sm text-stone-600">What makes you intellectually alive</p>
                    </div>
                  </div>

                  {/* Authentic You Card */}
                  <div
                    className="group p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.6)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(176, 216, 240, 0.3)',
                      boxShadow: '0 4px 16px rgba(135, 206, 235, 0.08)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgba(176, 216, 240, 0.3), rgba(135, 206, 235, 0.2))',
                        }}
                      >
                        <User className="w-6 h-6" style={{ color: '#87CEEB' }} />
                      </div>
                      <h4 className="text-base font-medium text-stone-900">Authentic You</h4>
                      <p className="text-sm text-stone-600">Beyond your public persona</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
`;

// Update container spacing
const updatedSpacing = updatedImports.replace(
  'className="w-full max-w-5xl space-y-12 relative z-10"',
  'className="w-full max-w-6xl space-y-16 relative z-10"'
);

// Insert the liquid glass card after the supporting copy paragraph
const insertionPoint = '        {/* Platform name scroll - more subtle than icon cards */}';
const finalContent = updatedSpacing.replace(
  insertionPoint,
  liquidGlassCard + '\n' + insertionPoint
);

// Write the updated content
fs.writeFileSync(filePath, finalContent, 'utf8');

console.log('✅ Liquid glass showcase card added to Step1Welcome.tsx!');
console.log('   - Added User, Heart, Zap icons to imports');
console.log('   - Updated container spacing from space-y-12 to space-y-16');
console.log('   - Updated max-width from max-w-5xl to max-w-6xl');
console.log('   - Added glassmorphism card with backdrop-filter: blur(20px) saturate(180%)');
console.log('   - Added three nested glass cards with icons and hover effects');
console.log('   - Applied Cofounder-style subtle blue accents (#87CEEB)');
