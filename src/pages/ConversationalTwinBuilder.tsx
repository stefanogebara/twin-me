import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Mic, MicOff, Upload, Sparkles, User, BookOpen, Volume2, FileAudio, Clock } from 'lucide-react';
import { secureApi } from '@/lib/secureApi';

interface PersonalityData {
  teachingPhilosophy: string;
  studentInteraction: string;
  humorStyle: string;
  communicationStyle: string;
  expertise: string[];
}

interface ClassData {
  subject: string;
  level: string;
  description: string;
  materials: File[];
}

const ConversationalTwinBuilder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [isPersonalityComplete, setIsPersonalityComplete] = useState(false);
  const [personalityData, setPersonalityData] = useState<PersonalityData>({
    teachingPhilosophy: '',
    studentInteraction: '',
    humorStyle: '',
    communicationStyle: '',
    expertise: []
  });
  const [classes, setClasses] = useState<ClassData[]>([]);
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
      question: "Hi! I'm here to help you create your digital twin. First, tell me about your teaching philosophy in your own words.",
      placeholder: "I believe learning should be...",
      field: 'teachingPhilosophy',
      followUp: "That sounds wonderful! Your students are lucky to have you."
    },
    {
      question: "How do you usually handle it when students are confused or struggling?",
      placeholder: "When students are confused, I usually...",
      field: 'studentInteraction',
      followUp: "I love that approach! Patience really makes all the difference."
    },
    {
      question: "What's your sense of humor like in class? Are you more serious, playful, or somewhere in between?",
      placeholder: "In class, my humor is...",
      field: 'humorStyle',
      followUp: "Perfect! Humor is such a great way to connect with students."
    },
    {
      question: "How would you describe your communication style? Direct and clear? Warm and encouraging? Something else?",
      placeholder: "I would describe my style as...",
      field: 'communicationStyle',
      followUp: "Excellent! That really helps me understand your teaching personality."
    }
  ];

  const classQuestions = [
    {
      question: "Great! Now let's create your first class twin. What subject or class is this for?",
      placeholder: "Introduction to Physics, Advanced Chemistry, etc.",
      field: 'subject'
    },
    {
      question: "What level are these students? (Freshman, Advanced, Graduate, etc.)",
      placeholder: "Freshman, Sophomore, Advanced, Graduate...",
      field: 'level'
    },
    {
      question: "Tell me about this class in your own words - what should students expect?",
      placeholder: "This class covers... Students will learn...",
      field: 'description'
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
            "I try to be patient and use different approaches when students struggle",
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
        description: `Uploaded ${audioFiles.length} file(s). I'll analyze these to understand your teaching materials.`,
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
    } else if (currentStep <= personalityQuestions.length + classQuestions.length) {
      // Handle class questions
      if (currentResponse.trim()) {
        setCurrentStep(currentStep + 1);
        setCurrentResponse('');
        setUploadedFiles([]);
      }
    }
  };

  const createAnotherClass = () => {
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
    } else if (currentStep <= personalityQuestions.length + classQuestions.length) {
      return classQuestions[currentStep - personalityQuestions.length - 1];
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
    <div className="min-h-screen bg-[hsl(var(--claude-bg))] relative overflow-hidden">
      {/* Background Elements */}
      <div className="fixed w-[400px] h-[400px] bg-gradient-to-br from-[hsl(var(--claude-accent))] to-orange-600 rounded-full top-[15%] right-[10%] blur-[120px] opacity-10 animate-[float_25s_ease-in-out_infinite] pointer-events-none"></div>
      <div className="fixed w-[300px] h-[300px] bg-gradient-to-br from-[hsl(var(--claude-accent))] to-orange-500 rounded-full bottom-[15%] left-[10%] blur-[120px] opacity-10 animate-[float_30s_ease-in-out_infinite_reverse] pointer-events-none"></div>

      {/* Progress Indicator */}
      <div className="fixed top-8 left-8 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--claude-surface))]/80 backdrop-blur-sm rounded-full border border-[hsl(var(--claude-border))]">
          {isPersonalityPhase ? <User className="w-4 h-4 text-[hsl(var(--claude-accent))]" /> : <BookOpen className="w-4 h-4 text-[hsl(var(--claude-accent))]" />}
          <span className="text-sm font-medium text-[hsl(var(--claude-text))]">
            {isPersonalityPhase ? 'Building Your Personality' : 'Adding Your Classes'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen px-6 py-20">
        <div className="max-w-2xl w-full">

          {/* AI Assistant Message */}
          <div className="mb-8">
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-12 h-12 bg-gradient-to-br from-[hsl(var(--claude-accent))] to-orange-600 rounded-full flex items-center justify-center shadow-lg ${isAssistantSpeaking ? 'animate-pulse' : ''}`}>
                {isAssistantSpeaking ? (
                  <Volume2 className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="flex-1">
                <div className="bg-[hsl(var(--claude-surface))] rounded-3xl px-6 py-5 shadow-lg border border-[hsl(var(--claude-border))] relative">
                  {isPersonalityComplete && currentStep === personalityQuestions.length + 1 ? (
                    <div>
                      <p className="text-[hsl(var(--claude-text))] font-medium mb-3">
                        Perfect! I've captured your teaching personality. 🎉
                      </p>
                      <p className="text-[hsl(var(--claude-text-muted))] text-sm mb-4">
                        Now all your twins will have your unique style, humor, and approach. Let's add your first class!
                      </p>
                      <button
                        onClick={() => speakAssistantResponse("Perfect! I've captured your teaching personality. Now all your twins will have your unique style, humor, and approach. Let's add your first class!", false)}
                        className="absolute top-3 right-3 p-2 hover:bg-[hsl(var(--claude-surface-raised))] rounded-full transition-colors duration-200"
                        disabled={isAssistantSpeaking}
                      >
                        <Volume2 className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />
                      </button>
                    </div>
                  ) : currentStep > personalityQuestions.length + classQuestions.length ? (
                    <div>
                      <p className="text-[hsl(var(--claude-text))] font-medium mb-3">
                        Excellent! Your first twin is ready. ✨
                      </p>
                      <p className="text-[hsl(var(--claude-text-muted))] text-sm mb-4">
                        Would you like to create twins for more classes, or start using this one?
                      </p>
                      <button
                        onClick={() => speakAssistantResponse("Excellent! Your first twin is ready. Would you like to create twins for more classes, or start using this one?", false)}
                        className="absolute top-3 right-3 p-2 hover:bg-[hsl(var(--claude-surface-raised))] rounded-full transition-colors duration-200"
                        disabled={isAssistantSpeaking}
                      >
                        <Volume2 className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[hsl(var(--claude-text))] leading-relaxed min-h-[1.5rem]">
                        {displayedText}
                        {isTyping && <span className="animate-pulse">|</span>}
                      </p>
                      <button
                        onClick={() => currentQuestion && speakAssistantResponse(currentQuestion.question, false)}
                        className="absolute top-3 right-3 p-2 hover:bg-[hsl(var(--claude-surface-raised))] rounded-full transition-colors duration-200"
                        disabled={isAssistantSpeaking || !currentQuestion}
                      >
                        <Volume2 className="w-4 h-4 text-[hsl(var(--claude-text-muted))]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Follow-up encouragement */}
            {currentStep > 1 && currentStep <= personalityQuestions.length && (
              <div className="flex items-start gap-4 mb-6 opacity-70">
                <div className="w-12"></div>
                <div className="bg-[hsl(var(--claude-accent-subtle))] rounded-2xl px-4 py-3 border border-[hsl(var(--claude-accent))]/20">
                  <p className="text-[hsl(var(--claude-accent))] text-sm">
                    {personalityQuestions[currentStep - 2]?.followUp}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Response Area */}
          {currentStep <= personalityQuestions.length + classQuestions.length && (
            <div
              className={`bg-[hsl(var(--claude-surface))] rounded-3xl p-6 shadow-lg border-2 transition-all duration-300 mb-6 ${
                isDragOver ? 'border-[hsl(var(--claude-accent))] bg-[hsl(var(--claude-accent-subtle))]' : 'border-[hsl(var(--claude-border))]'
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
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isRecording
                        ? 'bg-red-500 text-white shadow-lg'
                        : isProcessingRecording
                        ? 'bg-gray-500 text-white cursor-not-allowed'
                        : 'bg-[hsl(var(--claude-accent))] text-white hover:scale-105 shadow-lg'
                    }`}
                  >
                    {isProcessingRecording ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : isRecording ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </button>

                  {/* Recording indicator ring */}
                  {isRecording && (
                    <div
                      className="absolute -inset-1 rounded-full border-2 border-red-400 animate-pulse"
                    />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[hsl(var(--claude-text-muted))]">
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
                          className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 hover:scale-105"
                        >
                          Stop Recording
                        </button>
                        <span className="text-xs text-[hsl(var(--claude-text-muted))]">
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
                className={`w-full p-4 border-2 bg-[hsl(var(--claude-bg))] text-[hsl(var(--claude-text))] rounded-2xl resize-none min-h-[120px] focus:outline-none transition-colors duration-300 ${
                  isProcessingRecording
                    ? 'border-[hsl(var(--claude-border))] opacity-50 cursor-not-allowed'
                    : 'border-[hsl(var(--claude-border))] focus:border-[hsl(var(--claude-accent))]'
                }`}
                style={{ height: 'auto' }}
              />

              {/* Uploaded Files Display */}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[hsl(var(--claude-surface-raised))] px-3 py-2 rounded-full text-sm">
                      <FileAudio className="w-4 h-4 text-[hsl(var(--claude-accent))]" />
                      <span className="text-[hsl(var(--claude-text-muted))]">{file.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[hsl(var(--claude-text-muted))]">or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--claude-surface-raised))] hover:bg-[hsl(var(--claude-border))] rounded-full text-sm text-[hsl(var(--claude-text))] transition-colors duration-300"
                  >
                    <Upload className="w-4 h-4" />
                    Upload files
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
                  className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent-hover))] disabled:bg-[hsl(var(--claude-surface-raised))] disabled:text-[hsl(var(--claude-text-muted))] text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Completion Actions */}
          {currentStep > personalityQuestions.length + classQuestions.length && (
            <div className="bg-[hsl(var(--claude-surface))] rounded-3xl p-6 shadow-lg border border-[hsl(var(--claude-border))]">
              <div className="flex gap-4 justify-center">
                <button
                  onClick={createAnotherClass}
                  className="bg-[hsl(var(--claude-surface-raised))] hover:bg-[hsl(var(--claude-border))] text-[hsl(var(--claude-text))] px-6 py-3 rounded-full font-medium transition-all duration-300"
                >
                  Add Another Class
                </button>
                <button
                  onClick={finishSetup}
                  className="bg-[hsl(var(--claude-accent))] hover:bg-[hsl(var(--claude-accent-hover))] text-white px-8 py-3 rounded-full font-medium transition-all duration-300"
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