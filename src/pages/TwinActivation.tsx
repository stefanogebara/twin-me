import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
        <div className="w-full h-full border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
      <h1 className="text-5xl font-serif italic text-foreground mb-4">Activating Your Twin</h1>
      <p className="text-xl text-muted-foreground mb-4">This usually takes 30-60 seconds</p>
      
      <div className="flex justify-center gap-6 mt-10">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
              step.active ? 'bg-primary animate-pulse' : 'bg-muted'
            }`}></div>
            <span className="text-sm text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const SuccessState = () => (
    <div>
      <div className="text-center mb-15">
        <div className="w-25 h-25 mx-auto mb-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center animate-scale-in">
          <Check className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-6xl font-serif italic text-foreground mb-4">Your Twin is Live!</h1>
        <p className="text-xl text-muted-foreground">Dr. Smith - Physics 101 is now active and ready for students</p>
      </div>

      {/* Twin Overview Card */}
      <div className="bg-card rounded-[32px] p-12 shadow-elegant mb-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-4xl font-serif italic text-foreground mb-2">Dr. Smith - Physics 101</h2>
            <p className="text-muted-foreground">Educational Twin for Quantum Physics</p>
            <div className="flex gap-4 mt-3">
              <span className="px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">ACTIVE</span>
              <span className="px-4 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">EDUCATIONAL</span>
            </div>
          </div>
          <Button onClick={() => navigate('/dashboard')} className="artemis-btn-primary">
            View Dashboard
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-8 py-8 border-t border-b border-border">
          <div className="text-center">
            <div className="text-3xl font-serif italic text-foreground mb-1">0</div>
            <div className="text-sm text-muted-foreground">Active Students</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-serif italic text-foreground mb-1">15</div>
            <div className="text-sm text-muted-foreground">Topics Covered</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-serif italic text-foreground mb-1">100%</div>
            <div className="text-sm text-muted-foreground">Ready</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-serif italic text-foreground mb-1">24/7</div>
            <div className="text-sm text-muted-foreground">Available</div>
          </div>
        </div>

        {/* Access Links */}
        <div className="grid grid-cols-2 gap-6 mt-8">
          <div className="bg-background rounded-xl p-6">
            <h3 className="text-xl font-serif italic text-foreground mb-3">Student Access Link</h3>
            <p className="text-sm text-muted-foreground mb-3">Share this link with your students</p>
            <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:shadow-md transition-all duration-300">
              <span className="font-mono text-sm text-muted-foreground">twinme.com/learn/smith-physics-101</span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => copyToClipboard('twinme.com/learn/smith-physics-101', 'Student link')}
                className="ml-3"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="bg-background rounded-xl p-6">
            <h3 className="text-xl font-serif italic text-foreground mb-3">Embed Widget</h3>
            <p className="text-sm text-muted-foreground mb-3">Add to your LMS or website</p>
            <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:shadow-md transition-all duration-300">
              <span className="font-mono text-sm text-muted-foreground">&lt;iframe src="twinme.com/embed/..."&gt;</span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => copyToClipboard('<iframe src="twinme.com/embed/..."></iframe>', 'Embed code')}
                className="ml-3"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <h2 className="text-5xl font-serif italic text-foreground text-center my-15">What's Next?</h2>
      
      <div className="grid grid-cols-3 gap-8 mb-12">
        <div className="bg-card rounded-3xl p-8 text-center border-2 border-transparent hover:border-primary hover:-translate-y-1 hover:shadow-elegant transition-all duration-300 cursor-pointer">
          <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl font-serif italic text-primary">1</span>
          </div>
          <h3 className="text-2xl font-serif italic text-foreground mb-3">Invite Students</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">Send invitations to your class or share the access link</p>
        </div>

        <div className="bg-card rounded-3xl p-8 text-center border-2 border-transparent hover:border-primary hover:-translate-y-1 hover:shadow-elegant transition-all duration-300 cursor-pointer">
          <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl font-serif italic text-primary">2</span>
          </div>
          <h3 className="text-2xl font-serif italic text-foreground mb-3">Test Your Twin</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">Have a conversation to ensure everything works perfectly</p>
        </div>

        <div className="bg-card rounded-3xl p-8 text-center border-2 border-transparent hover:border-primary hover:-translate-y-1 hover:shadow-elegant transition-all duration-300 cursor-pointer">
          <div className="w-12 h-12 bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-2xl font-serif italic text-primary">3</span>
          </div>
          <h3 className="text-2xl font-serif italic text-foreground mb-3">Customize Further</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">Add more content, refine responses, and optimize settings</p>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <Button variant="outline" onClick={() => navigate('/twin-builder')} size="lg">
          Create Another Twin
        </Button>
        <Button onClick={() => navigate('/dashboard')} size="lg" className="artemis-btn-primary">
          Go to Dashboard
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-15 py-6">
          <div className="flex justify-between items-center">
            <div 
              className="text-3xl font-serif italic text-foreground cursor-pointer"
              onClick={() => navigate('/')}
            >
              Twin Me
            </div>
            <div className="flex gap-8">
              <a href="#dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Dashboard</a>
              <a href="#twins" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">My Twins</a>
              <a href="#analytics" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Analytics</a>
              <a href="#settings" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Settings</a>
              <a href="#help" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Help</a>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-32 px-15 max-w-7xl mx-auto pb-20">
        {isProcessing ? <ProcessingState /> : <SuccessState />}
      </div>

      {/* Success Notification */}
      {showNotification && (
        <div className={`fixed bottom-8 right-8 bg-card border border-border rounded-2xl p-5 shadow-elegant transition-transform duration-300 ${
          showNotification ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="font-semibold text-foreground">Twin Activated Successfully</div>
              <div className="text-sm text-muted-foreground">Students can now access your twin</div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-3xl p-10 max-w-md w-full mx-4 animate-slide-up">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-serif italic text-foreground">Share Your Twin</h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowShareModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-muted-foreground mb-8">Choose how to share with students</p>
            
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-5 bg-background rounded-lg text-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105">
                <Mail className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm">Email</div>
              </div>
              <div className="p-5 bg-background rounded-lg text-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105">
                <Link className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm">Link</div>
              </div>
              <div className="p-5 bg-background rounded-lg text-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-105">
                <QrCode className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm">QR Code</div>
              </div>
            </div>
            
            <Button 
              className="w-full artemis-btn-primary" 
              onClick={() => setShowShareModal(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};