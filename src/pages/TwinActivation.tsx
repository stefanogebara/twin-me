import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Mail, Link, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';

export const TwinActivation = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [showNotification, setShowNotification] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const processingSteps = [
    { id: 1, label: 'Processing content', active: true },
    { id: 2, label: 'Training model', active: false },
    { id: 3, label: 'Configuring voice', active: false },
    { id: 4, label: 'Going live', active: false }
  ];

  const [steps, setSteps] = useState(processingSteps);

  useEffect(() => {
    if (isProcessing) {
      const intervals = [
        setTimeout(() => updateStep(2), 1000),
        setTimeout(() => updateStep(3), 2000),
        setTimeout(() => updateStep(4), 3000),
        setTimeout(() => {
          setIsProcessing(false);
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 5000);
        }, 4000)
      ];

      return () => intervals.forEach(clearTimeout);
    }
  }, [isProcessing]);

  const updateStep = (stepId: number) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, active: true } : step
    ));
    setCurrentStep(stepId);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard!`);
  };

  const ProcessingState = () => (
    <div className="text-center py-20">
      <div className="w-30 h-30 mx-auto mb-10 relative">
        <div className="w-full h-full border-4 border-[rgba(20,20,19,0.2)] border-t-[#D97706] rounded-full" style={{ animation: 'spin 1s linear infinite' }}></div>
      </div>
      <h1 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-5xl text-[#141413] mb-4">Activating Your Twin</h1>
      <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-xl text-[#6B7280] mb-4">This usually takes 30-60 seconds</p>

      <div className="flex justify-center gap-6 mt-10">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              step.active ? 'bg-[#D97706]' : 'bg-[rgba(20,20,19,0.2)]'
            }`}></div>
            <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const SuccessState = () => (
    <div>
      <div className="text-center mb-15">
        <div className="w-25 h-25 mx-auto mb-8 bg-green-600 rounded-full flex items-center justify-center">
          <Check className="w-12 h-12 text-white" />
        </div>
        <h1 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-6xl text-[#141413] mb-4">Your Twin is Live!</h1>
        <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-xl text-[#6B7280]">Dr. Smith - Physics 101 is now active and ready for students</p>
      </div>

      {/* Twin Overview Card */}
      <div className="bg-white rounded-[32px] p-12 border border-[rgba(20,20,19,0.1)] mb-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-4xl text-[#141413] mb-2">Dr. Smith - Physics 101</h2>
            <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-[#6B7280]">Educational Twin for Quantum Physics</p>
            <div className="flex gap-4 mt-3">
              <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">ACTIVE</span>
              <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="px-4 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">EDUCATIONAL</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-anthropic-primary"
          >
            View Dashboard
          </button>
        </div>

        <div className="grid grid-cols-4 gap-8 py-8 border-t border-b border-[rgba(20,20,19,0.1)]">
          <div className="text-center">
            <div style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-3xl text-[#141413] mb-1">0</div>
            <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">Active Students</div>
          </div>
          <div className="text-center">
            <div style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-3xl text-[#141413] mb-1">15</div>
            <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">Topics Covered</div>
          </div>
          <div className="text-center">
            <div style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-3xl text-[#141413] mb-1">100%</div>
            <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">Ready</div>
          </div>
          <div className="text-center">
            <div style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-3xl text-[#141413] mb-1">24/7</div>
            <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">Available</div>
          </div>
        </div>

        {/* Access Links */}
        <div className="grid grid-cols-2 gap-6 mt-8">
          <div className="bg-[#F5F5F5] rounded-xl p-6">
            <h3 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-xl text-[#141413] mb-3">Student Access Link</h3>
            <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280] mb-3">Share this link with your students</p>
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-[rgba(20,20,19,0.1)]">
              <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="font-mono text-sm text-[#6B7280]">twinme.com/learn/smith-physics-101</span>
              <button
                onClick={() => copyToClipboard('twinme.com/learn/smith-physics-101', 'Student link')}
                className="ml-3 px-3 py-1.5 text-sm border border-[rgba(20,20,19,0.1)] rounded-md bg-white text-[#141413]"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#F5F5F5] rounded-xl p-6">
            <h3 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-xl text-[#141413] mb-3">Embed Widget</h3>
            <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280] mb-3">Add to your LMS or website</p>
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-[rgba(20,20,19,0.1)]">
              <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="font-mono text-sm text-[#6B7280]">&lt;iframe src="twinme.com/embed/..."&gt;</span>
              <button
                onClick={() => copyToClipboard('<iframe src="twinme.com/embed/..."></iframe>', 'Embed code')}
                className="ml-3 px-3 py-1.5 text-sm border border-[rgba(20,20,19,0.1)] rounded-md bg-white text-[#141413]"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <h2 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-5xl text-[#141413] text-center my-15">What's Next?</h2>

      <div className="grid grid-cols-3 gap-8 mb-12">
        <div className="bg-white rounded-3xl p-8 text-center border border-[rgba(20,20,19,0.1)] cursor-pointer">
          <div className="w-12 h-12 bg-[#FEF3E2] rounded-xl flex items-center justify-center mx-auto mb-5">
            <span style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#D97706]">1</span>
          </div>
          <h3 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#141413] mb-3">Invite Students</h3>
          <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-[#6B7280] text-sm leading-relaxed">Send invitations to your class or share the access link</p>
        </div>

        <div className="bg-white rounded-3xl p-8 text-center border border-[rgba(20,20,19,0.1)] cursor-pointer">
          <div className="w-12 h-12 bg-[#FEF3E2] rounded-xl flex items-center justify-center mx-auto mb-5">
            <span style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#D97706]">2</span>
          </div>
          <h3 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#141413] mb-3">Test Your Twin</h3>
          <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-[#6B7280] text-sm leading-relaxed">Have a conversation to ensure everything works perfectly</p>
        </div>

        <div className="bg-white rounded-3xl p-8 text-center border border-[rgba(20,20,19,0.1)] cursor-pointer">
          <div className="w-12 h-12 bg-[#FEF3E2] rounded-xl flex items-center justify-center mx-auto mb-5">
            <span style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#D97706]">3</span>
          </div>
          <h3 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#141413] mb-3">Customize Further</h3>
          <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-[#6B7280] text-sm leading-relaxed">Add more content, refine responses, and optimize settings</p>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <button
          onClick={() => navigate('/twin-builder')}
          className="px-6 py-3 text-base border border-[rgba(20,20,19,0.1)] rounded-md bg-white text-[#141413]"
          style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
        >
          Create Another Twin
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-anthropic-primary"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF9F5]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#FAF9F5] border-b border-[rgba(20,20,19,0.1)]">
        <div className="max-w-7xl mx-auto px-15 py-6">
          <div className="flex justify-between items-center">
            <div
              style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}
              className="text-3xl text-[#141413] cursor-pointer"
              onClick={() => navigate('/')}
            >
              Twin Me
            </div>
            <div className="flex gap-8">
              <a href="#dashboard" style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm font-medium text-[#6B7280]">Dashboard</a>
              <a href="#twins" style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm font-medium text-[#6B7280]">My Twins</a>
              <a href="#analytics" style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm font-medium text-[#6B7280]">Analytics</a>
              <a href="#settings" style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm font-medium text-[#6B7280]">Settings</a>
              <a href="#help" style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm font-medium text-[#6B7280]">Help</a>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 px-15 max-w-7xl mx-auto pb-20">
        {isProcessing ? <ProcessingState /> : <SuccessState />}
      </div>

      {/* Success Notification */}
      {showNotification && (
        <div className="fixed bottom-8 right-8 bg-white border border-[rgba(20,20,19,0.1)] rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-[#141413]">Twin Activated Successfully</div>
              <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#6B7280]">Students can now access your twin</div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }} className="text-2xl text-[#141413]">Share Your Twin</h2>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-2 text-[#6B7280]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-[#6B7280] mb-8">Choose how to share with students</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-5 bg-[#F5F5F5] rounded-lg text-center cursor-pointer">
                <Mail className="w-6 h-6 mx-auto mb-2 text-[#141413]" />
                <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#141413]">Email</div>
              </div>
              <div className="p-5 bg-[#F5F5F5] rounded-lg text-center cursor-pointer">
                <Link className="w-6 h-6 mx-auto mb-2 text-[#141413]" />
                <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#141413]">Link</div>
              </div>
              <div className="p-5 bg-[#F5F5F5] rounded-lg text-center cursor-pointer">
                <QrCode className="w-6 h-6 mx-auto mb-2 text-[#141413]" />
                <div style={{ fontFamily: 'var(--_typography---font--tiempos)' }} className="text-sm text-[#141413]">QR Code</div>
              </div>
            </div>

            <button
              className="w-full btn-anthropic-primary"
              onClick={() => setShowShareModal(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};