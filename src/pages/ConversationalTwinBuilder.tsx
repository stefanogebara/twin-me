import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Mic, MicOff, Upload, Sparkles, User, BookOpen, Volume2, FileAudio, Clock } from 'lucide-react';
import { secureApi } from '@/lib/secureApi';

interface PersonalityData {
  personalityCore: string;
  socialStyle: string;
  humorStyle: string;
  communicationStyle: string;
  interests: string[];
}

interface PlatformData {
  entertainment: string;
  social: string;
  professional: string;
  materials: File[];
}

const ConversationalTwinBuilder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [isPersonalityComplete, setIsPersonalityComplete] = useState(false);
  const [personalityData, setPersonalityData] = useState<PersonalityData>({
    personalityCore: '',
    socialStyle: '',
    humorStyle: '',
    communicationStyle: '',
    interests: []
  });
  const [platforms, setPlatforms] = useState<PlatformData[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ElevenLabs Voice ID for the conversational assistant
  const ASSISTANT_VOICE_ID = '1SM7GgM6IMuvQlz2BwM3';

  const personalityQuestions = [
    {
      question: "Hi! I'm here to help you create your digital twin. First, tell me about what drives you - your passions, values, and what makes you uniquely you.",
      placeholder: "I'm passionate about... I value... What makes me unique is...",
      field: 'personalityCore',
      followUp: "That's fascinating! I love hearing what makes people tick."
    },
    {
      question: "How do you usually interact with people? Are you outgoing and social, more reserved and thoughtful, or somewhere in between?",
      placeholder: "In social situations, I'm usually...",
      field: 'socialStyle',
      followUp: "I love that! Everyone has their own authentic way of connecting with others."
    },
    {
      question: "What's your sense of humor like? Witty and sarcastic? Playful and silly? Dry and subtle? Something else?",
      placeholder: "My humor is...",
      field: 'humorStyle',
      followUp: "Perfect! Humor says so much about who we are."
    },
    {
      question: "How would you describe your communication style? Direct and straightforward? Warm and empathetic? Analytical and precise?",
      placeholder: "I would describe my style as...",
      field: 'communicationStyle',
      followUp: "Excellent! That really helps me understand your authentic personality."
    }
  ];

  const platformQuestions = [
    {
      question: "Great! Now let's connect to your digital platforms. Which entertainment platforms do you use most? (Netflix, Spotify, YouTube, etc.)",
      placeholder: "Netflix, Spotify, YouTube, Prime Video...",
      field: 'entertainment'
    },
    {
      question: "What social or community platforms are you active on? (Discord, Reddit, Twitter, Instagram, etc.)",
      placeholder: "Discord, Reddit, Twitter, Instagram...",
      field: 'social'
    },
    {
      question: "Any professional or creative platforms? (GitHub, LinkedIn, Medium, Behance, etc.)",
      placeholder: "GitHub, LinkedIn, Medium, Behance...",
      field: 'professional'
    }
  ];

  const typewriterEffect = useCallback((text: string, callback?: () => void) => {
    setDisplayedText('');
    setIsTyping(true);
    let index = 0;

    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.substring(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
        setIsTyping(false);
        if (callback) callback();
      }
    }, 30);

    return () => clearInterval(timer);
  }, []);

  const speakAssistantResponse = async (text: string, shouldType = false) => {
    try {
      setIsAssistantSpeaking(true);

      // Start typing animation if requested
      if (shouldType) {
        typewriterEffect(text);
      }

      // Use secure server-side voice synthesis
      try {
        const audioUrl = await secureApi.synthesizeVoice(text, ASSISTANT_VOICE_ID, {
          model_id: 'eleven_multilingual_v2',
          stability: 0.5,
          similarity_boost: 0.75
        });

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();

          audioRef.current.onended = () => {
            setIsAssistantSpeaking(false);
          };
        }
      } catch (error) {
        console.error('Voice synthesis failed:', error);
        setIsAssistantSpeaking(false);
      }
    } catch (error) {
      console.log('Voice synthesis failed, continuing without audio:', error);
      setIsAssistantSpeaking(false);
    }
  };


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      streamRef.current = stream;

      // Set up recording
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        setIsProcessingRecording(true);
        const blob = new Blob(recordedChunks.current, { type: 'audio/wav' });

        try {
          // Create FormData and send to transcription API
          const formData = new FormData();
          formData.append('audio', blob, 'recording.wav');

          const response = await fetch(`${import.meta.env.VITE_API_URL}/voice/transcribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('clerk_token')}`,
            },
            body: formData,
          });

          if (response.ok) {
            const result = await response.json();
            setCurrentResponse(result.transcription || 'No transcription available');

            toast({
              title: "Recording processed",
              description: "Voice transcribed successfully! You can edit the text below.",
            });
          } else {
            throw new Error(`Transcription failed: ${response.status}`);
          }
        } catch (error) {
          console.error('Error transcribing audio:', error);

          // Fallback to sample response if API fails
          const sampleResponses = [
            "I believe learning should be engaging and interactive",
            "I try to be understanding and adapt my communication to different people",
            "I like to use humor to make concepts more memorable",
            "I prefer a warm and encouraging communication style"
          ];

          const randomResponse = sampleResponses[Math.floor(Math.random() * sampleResponses.length)];
          setCurrentResponse(randomResponse);

          toast({
            title: "Transcription failed",
            description: "Using sample response. Please try again or edit manually.",
            variant: "destructive"
          });
        } finally {
          setIsProcessingRecording(false);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Auto-stop after 60 seconds as safety fallback
      autoStopTimeoutRef.current = setTimeout(() => {
        console.log('Auto-stopping recording after 60 seconds');
        stopRecording();
        toast({
          title: "Recording auto-stopped",
          description: "Recording automatically stopped after 60 seconds.",
        });
      }, 60000);

      toast({
        title: "Voice recording started",
        description: "Speak clearly! Stop by clicking the red button, pressing ESC/Spacebar, or wait for auto-stop.",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording failed",
        description: "Please check your microphone permissions and try again.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    console.log('Stop recording called, isRecording:', isRecording);

    try {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log('Stopping MediaRecorder');
        mediaRecorderRef.current.stop();
      }

      // Stop all audio tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          console.log('Stopping track:', track.label);
          track.stop();
        });
        streamRef.current = null;
      }

      // Clean up timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      // Clean up auto-stop timeout
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }

      // Reset all recording states
      setIsRecording(false);
      setIsProcessingRecording(false);

      toast({
        title: "Recording stopped",
        description: "Ready for your input...",
      });

      console.log('Recording cleanup complete');
    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsRecording(false);
      setIsProcessingRecording(false);
    }
  };

  const toggleRecording = () => {
    console.log('Toggle recording clicked, current state:', isRecording);
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    const audioFiles = files.filter(file =>
      file.type.startsWith('audio/') ||
      file.name.toLowerCase().endsWith('.wav') ||
      file.name.toLowerCase().endsWith('.mp3') ||
      file.name.toLowerCase().endsWith('.m4a') ||
      file.type.includes('pdf') ||
      file.type.includes('document')
    );

    if (audioFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...audioFiles]);
      toast({
        title: "Files uploaded!",
        description: `Uploaded ${audioFiles.length} file(s). I'll analyze these to understand your personality and interests.`,
      });
    } else {
      toast({
        title: "File type not supported",
        description: "Please upload audio files (wav, mp3, m4a) or documents (pdf, doc, docx, txt).",
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = (files: FileList | null) => {
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      handleFiles(fileArray);
    }
  };

  const handleNextStep = () => {
    if (currentStep <= personalityQuestions.length) {
      if (currentResponse.trim()) {
        const currentQuestion = personalityQuestions[currentStep - 1];
        setPersonalityData(prev => ({
          ...prev,
          [currentQuestion.field]: currentResponse
        }));

        if (currentStep === personalityQuestions.length) {
          setIsPersonalityComplete(true);
          setTimeout(() => setCurrentStep(currentStep + 1), 1500);
        } else {
          setCurrentStep(currentStep + 1);
        }
        setCurrentResponse('');
        setUploadedFiles([]);
      }
    } else if (currentStep <= personalityQuestions.length + platformQuestions.length) {
      // Handle platform questions
      if (currentResponse.trim()) {
        setCurrentStep(currentStep + 1);
        setCurrentResponse('');
        setUploadedFiles([]);
      }
    }
  };

  const addMorePlatforms = () => {
    setCurrentStep(personalityQuestions.length + 1);
    setCurrentResponse('');
    setUploadedFiles([]);
  };

  const finishSetup = () => {
    toast({
      title: "Your twins are being created!",
      description: "This will take just a moment...",
    });
    setTimeout(() => {
      navigate('/twin-dashboard');
    }, 2000);
  };

  const getCurrentQuestion = () => {
    if (currentStep <= personalityQuestions.length) {
      return personalityQuestions[currentStep - 1];
    } else if (currentStep <= personalityQuestions.length + platformQuestions.length) {
      return platformQuestions[currentStep - personalityQuestions.length - 1];
    }
    return null;
  };

  const isPersonalityPhase = currentStep <= personalityQuestions.length;
  const currentQuestion = getCurrentQuestion();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [currentResponse]);

  // Cleanup effect for recording resources
  useEffect(() => {
    return () => {
      // Cleanup on component unmount
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-play the first question when component loads
  useEffect(() => {
    // Stop any currently playing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (currentQuestion && !hasAutoPlayed && currentStep === 1) {
      setHasAutoPlayed(true);
      // Start with typing effect and voice
      speakAssistantResponse(currentQuestion.question, true);
    } else if (currentQuestion && currentStep > 1 && hasAutoPlayed) {
      // For subsequent questions, just show the text and play voice
      setDisplayedText(currentQuestion.question);
      speakAssistantResponse(currentQuestion.question);
    }
  }, [currentStep, currentQuestion, hasAutoPlayed]);

  // Keyboard shortcuts for recording control
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isRecording && (event.key === 'Escape' || event.key === ' ')) {
        event.preventDefault();
        console.log('Keyboard shortcut used to stop recording:', event.key);
        stopRecording();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isRecording]);

  return (
    <div className="min-h-screen bg-[#FAF9F5] relative overflow-hidden">
      {/* Progress Indicator */}
      <div className="fixed top-8 left-8 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-[rgba(20,20,19,0.1)]">
          {isPersonalityPhase ? <User className="w-4 h-4 text-[#D97706]" /> : <BookOpen className="w-4 h-4 text-[#D97706]" />}
          <span className="text-sm text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
            {isPersonalityPhase ? 'Building Your Soul Signature' : 'Connecting Your Platforms'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen px-6 py-20">
        <div className="max-w-2xl w-full">

          {/* AI Assistant Message */}
          <div className="mb-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-[#D97706] rounded-full flex items-center justify-center">
                {isAssistantSpeaking ? (
                  <Volume2 className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="flex-1">
                <div className="bg-card rounded-3xl px-6 py-5 border border-[rgba(20,20,19,0.1)] relative">
                  {isPersonalityComplete && currentStep === personalityQuestions.length + 1 ? (
                    <div>
                      <p className="text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                        Perfect! I've captured your authentic personality.
                      </p>
                      <p className="text-[#6B7280] text-sm mb-4" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                        Now your digital twin will have your unique style, humor, and communication approach. Let's connect your platforms!
                      </p>
                      <button
                        onClick={() => speakAssistantResponse("Perfect! I've captured your authentic personality. Now your digital twin will have your unique style, humor, and communication approach. Let's connect your platforms!", false)}
                        className="absolute top-3 right-3 p-2 rounded-full"
                        disabled={isAssistantSpeaking}
                      >
                        <Volume2 className="w-4 h-4 text-[#6B7280]" />
                      </button>
                    </div>
                  ) : currentStep > personalityQuestions.length + classQuestions.length ? (
                    <div>
                      <p className="text-[#141413] mb-3" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                        Excellent! Your first twin is ready.
                      </p>
                      <p className="text-[#6B7280] text-sm mb-4" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                        Would you like to create twins for more classes, or start using this one?
                      </p>
                      <button
                        onClick={() => speakAssistantResponse("Excellent! Your first twin is ready. Would you like to create twins for more classes, or start using this one?", false)}
                        className="absolute top-3 right-3 p-2 rounded-full"
                        disabled={isAssistantSpeaking}
                      >
                        <Volume2 className="w-4 h-4 text-[#6B7280]" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[#141413] leading-relaxed min-h-[1.5rem]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                        {displayedText}
                        {isTyping && <span>|</span>}
                      </p>
                      <button
                        onClick={() => currentQuestion && speakAssistantResponse(currentQuestion.question, false)}
                        className="absolute top-3 right-3 p-2 rounded-full"
                        disabled={isAssistantSpeaking || !currentQuestion}
                      >
                        <Volume2 className="w-4 h-4 text-[#6B7280]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Follow-up encouragement */}
            {currentStep > 1 && currentStep <= personalityQuestions.length && (
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12"></div>
                <div className="bg-[#FEF3E2] rounded-2xl px-4 py-3 border border-[rgba(217,119,6,0.2)]">
                  <p className="text-[#D97706] text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                    {personalityQuestions[currentStep - 2]?.followUp}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Response Area */}
          {currentStep <= personalityQuestions.length + platformQuestions.length && (
            <div
              className={`bg-card rounded-3xl p-6 border-2 mb-6 ${
                isDragOver ? 'border-[#D97706] bg-[#FEF3E2]' : 'border-border'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <button
                    onClick={toggleRecording}
                    disabled={isProcessingRecording}
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isRecording
                        ? 'bg-red-500 text-white'
                        : isProcessingRecording
                        ? 'bg-muted text-foreground cursor-not-allowed'
                        : 'bg-[#D97706] text-white'
                    }`}
                  >
                    {isProcessingRecording ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : isRecording ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </button>

                  {/* Recording indicator ring */}
                  {isRecording && (
                    <div className="absolute -inset-1 rounded-full border-2 border-red-400" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                      {isProcessingRecording
                        ? 'Processing recording...'
                        : isRecording
                        ? `Recording... ${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, '0')}`
                        : 'Click to record your voice response'
                      }
                    </span>

                    {isRecording && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-red-400" />
                          <span className="text-sm font-mono text-red-400">
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                        <button
                          onClick={stopRecording}
                          className="px-3 py-1 text-xs bg-red-500 text-white rounded-full"
                        >
                          Stop Recording
                        </button>
                        <span className="text-xs text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                          or press ESC/Spacebar
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={currentResponse}
                onChange={(e) => setCurrentResponse(e.target.value)}
                placeholder={isProcessingRecording ? "Processing your voice recording..." : currentQuestion?.placeholder || "Type your response..."}
                disabled={isProcessingRecording}
                className={`w-full p-4 border-2 bg-[#F5F5F5] text-[#141413] rounded-2xl resize-none min-h-[120px] focus:outline-none ${
                  isProcessingRecording
                    ? 'border-[rgba(20,20,19,0.1)] opacity-50 cursor-not-allowed'
                    : 'border-[rgba(20,20,19,0.1)] focus:border-[#D97706]'
                }`}
                style={{ height: 'auto', fontFamily: 'var(--_typography---font--tiempos)' }}
              />

              {/* Uploaded Files Display */}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#F5F5F5] px-3 py-2 rounded-full text-sm">
                      <FileAudio className="w-4 h-4 text-[#D97706]" />
                      <span className="text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>{file.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm text-[#141413]"
                  >
                    <Upload className="w-4 h-4" />
                    <span style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Upload files</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.wav,.mp3,.m4a,audio/*"
                  />
                </div>

                <button
                  onClick={handleNextStep}
                  disabled={!currentResponse.trim() || isProcessingRecording}
                  className="btn-anthropic-primary disabled:bg-[#F5F5F5] disabled:text-[#6B7280] disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Completion Actions */}
          {currentStep > personalityQuestions.length + platformQuestions.length && (
            <div className="bg-card rounded-3xl p-6 border border-[rgba(20,20,19,0.1)]">
              <div className="flex gap-4 justify-center">
                <button
                  onClick={addMorePlatforms}
                  className="bg-[#F5F5F5] text-[#141413] px-6 py-3 rounded-full"
                  style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}
                >
                  Connect More Platforms
                </button>
                <button
                  onClick={finishSetup}
                  className="btn-anthropic-primary px-8 py-3"
                >
                  Start Using My Twins
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio element for voice playback */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default ConversationalTwinBuilder;