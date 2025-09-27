import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Mic, MicOff, Upload, Sparkles, User, BookOpen, Volume2, FileAudio, Clock, ArrowLeft, X, FileText, FileImage } from 'lucide-react';
import Tesseract from 'tesseract.js';
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

const AnthropicTwinBuilder = () => {
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
  const [animatedWords, setAnimatedWords] = useState<string[]>([]);
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

  // Anthropic-style animated word effect
  const animateWords = useCallback((text: string) => {
    const words = text.split(' ');
    setAnimatedWords(words);

    // Trigger animation for each word with stagger
    words.forEach((_, index) => {
      setTimeout(() => {
        const wordElements = document.querySelectorAll('.animate-word');
        if (wordElements[index]) {
          wordElements[index].classList.add('animate-in');
        }
      }, index * 100);
    });
  }, []);

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

      // Start typing animation if requested, otherwise use Anthropic word animation
      if (shouldType) {
        typewriterEffect(text);
      } else {
        setDisplayedText(text);
        animateWords(text);
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
            description: "Using default generated transcription. Please edit if needed.",
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
    try {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Stop all audio tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
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
    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsRecording(false);
      setIsProcessingRecording(false);
    }
  };

  const toggleRecording = () => {
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

  const handleFiles = async (files: File[]) => {
    const supportedFiles = files.filter(file => {
      const isAudio = file.type.startsWith('audio/') ||
        file.name.toLowerCase().endsWith('.wav') ||
        file.name.toLowerCase().endsWith('.mp3') ||
        file.name.toLowerCase().endsWith('.m4a');

      const isDocument = file.type.includes('pdf') ||
        file.type.includes('document') ||
        file.type.includes('text') ||
        file.name.toLowerCase().endsWith('.txt') ||
        file.name.toLowerCase().endsWith('.docx');

      const isImage = file.type.startsWith('image/') ||
        file.name.toLowerCase().endsWith('.png') ||
        file.name.toLowerCase().endsWith('.jpg') ||
        file.name.toLowerCase().endsWith('.jpeg');

      return isAudio || isDocument || isImage;
    });

    if (supportedFiles.length > 0) {
      // Process files for OCR if they're images
      const processedFiles = await Promise.all(
        supportedFiles.map(async (file) => {
          if (file.type.startsWith('image/') || file.name.toLowerCase().match(/\.(png|jpg|jpeg)$/)) {
            try {
              toast({
                title: "Processing image...",
                description: "Extracting text from your image using OCR technology.",
              });

              // Use Tesseract.js to extract text from images
              const { data: { text } } = await Tesseract.recognize(
                file,
                'eng',
                {
                  logger: m => console.log(m) // Log OCR progress
                }
              );

              const extractedText = text.trim();

              if (extractedText.length > 0) {
                toast({
                  title: "OCR completed!",
                  description: `Extracted ${extractedText.length} characters of text from ${file.name}`,
                });

                return {
                  ...file,
                  processed: true,
                  type: 'image',
                  extractedText,
                  ocrSuccess: true
                };
              } else {
                toast({
                  title: "No text found",
                  description: `Could not extract readable text from ${file.name}`,
                  variant: "destructive"
                });
                return {
                  ...file,
                  processed: true,
                  type: 'image',
                  extractedText: '',
                  ocrSuccess: false
                };
              }
            } catch (error) {
              console.error('OCR processing failed:', error);
              toast({
                title: "OCR failed",
                description: `Error processing ${file.name}. File uploaded without text extraction.`,
                variant: "destructive"
              });
              return {
                ...file,
                processed: false,
                type: 'image',
                extractedText: '',
                ocrSuccess: false
              };
            }
          }
          return { ...file, processed: true, type: file.type.startsWith('audio/') ? 'audio' : 'document' };
        })
      );

      setUploadedFiles(prev => [...prev, ...processedFiles]);
      toast({
        title: "Files uploaded!",
        description: `Uploaded ${supportedFiles.length} file(s). I'll analyze these to understand your teaching materials.`,
      });
    } else {
      toast({
        title: "File type not supported",
        description: "Please upload audio files (wav, mp3, m4a), documents (pdf, doc, docx, txt), or images (png, jpg, jpeg).",
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

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "File removed",
      description: "File has been removed from upload list.",
    });
  };

  const getFileIcon = (file: any) => {
    if (file.type === 'image' || file.type?.startsWith('image/')) {
      return <FileImage className="w-4 h-4" />;
    } else if (file.type === 'audio' || file.type?.startsWith('audio/')) {
      return <FileAudio className="w-4 h-4" />;
    } else {
      return <FileText className="w-4 h-4" />;
    }
  };

  const handleNextStep = async () => {
    const hasTextResponse = currentResponse.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0;

    if (!hasTextResponse && !hasFiles) {
      toast({
        title: "Response required",
        description: "Please provide a text response or upload relevant files to continue.",
        variant: "destructive"
      });
      return;
    }

    if (currentStep <= personalityQuestions.length) {
      const currentQuestion = personalityQuestions[currentStep - 1];
      let responseContent = currentResponse;

      // If only files provided, create a response indicating file upload and extracted content
      if (!hasTextResponse && hasFiles) {
        const fileDescriptions = uploadedFiles.map(file => {
          if (file.type === 'image' || file.type?.startsWith('image/')) {
            if (file.extractedText && file.ocrSuccess) {
              return `uploaded image: ${file.name} - extracted text: "${file.extractedText.substring(0, 200)}${file.extractedText.length > 200 ? '...' : ''}"`;
            } else {
              return `uploaded image: ${file.name} (visual content - text extraction ${file.ocrSuccess === false ? 'failed' : 'pending'})`;
            }
          } else if (file.type === 'audio' || file.type?.startsWith('audio/')) {
            return `uploaded audio: ${file.name} (voice recording)`;
          } else {
            return `uploaded document: ${file.name} (teaching materials)`;
          }
        }).join(' | ');

        // Include extracted text in the response for AI processing
        const extractedTexts = uploadedFiles
          .filter(file => file.extractedText && file.ocrSuccess)
          .map(file => `Content from ${file.name}: ${file.extractedText}`)
          .join('\n\n');

        responseContent = extractedTexts
          ? `Based on the uploaded files:\n\n${extractedTexts}\n\nFile details: ${fileDescriptions}`
          : `I've provided this through uploaded files: ${fileDescriptions}`;
      }

      setPersonalityData(prev => ({
        ...prev,
        [currentQuestion.field]: responseContent
      }));

      if (currentStep === personalityQuestions.length) {
        setIsPersonalityComplete(true);
        setTimeout(() => setCurrentStep(currentStep + 1), 1500);
      } else {
        setCurrentStep(currentStep + 1);
      }
      setCurrentResponse('');
      setUploadedFiles([]);
      setAnimatedWords([]);
    } else if (currentStep <= personalityQuestions.length + classQuestions.length) {
      // Handle class questions
      setCurrentStep(currentStep + 1);
      setCurrentResponse('');
      setUploadedFiles([]);
      setAnimatedWords([]);
    }
  };

  const createAnotherClass = () => {
    setCurrentStep(personalityQuestions.length + 1);
    setCurrentResponse('');
    setUploadedFiles([]);
    setAnimatedWords([]);
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

  // Auto-display the first question when component loads (voice disabled)
  useEffect(() => {
    if (currentQuestion && !hasAutoPlayed && currentStep === 1) {
      setHasAutoPlayed(true);
      // Just show the text with word animation, no voice
      setDisplayedText(currentQuestion.question);
      animateWords(currentQuestion.question);
    } else if (currentQuestion && currentStep > 1 && hasAutoPlayed) {
      // For subsequent questions, just use word animation, no voice
      setAnimatedWords([]);
      setDisplayedText(currentQuestion.question);
      animateWords(currentQuestion.question);
    }
  }, [currentStep, currentQuestion, hasAutoPlayed]);

  // Keyboard shortcuts for recording control
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isRecording && (event.key === 'Escape' || event.key === ' ')) {
        event.preventDefault();
        stopRecording();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isRecording]);

  return (
    <div className="hero_wrap min-h-screen" style={{ background: 'var(--_color-theme---background)' }}>
      {/* Back Button */}
      <div className="fixed top-6 left-6 z-20">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white backdrop-blur-sm rounded-full border transition-all duration-200"
          style={{ borderColor: 'var(--_color-theme---border)', color: 'var(--_color-theme---text)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Progress Indicator - Anthropic Style */}
      <div className="fixed top-8 left-8 z-10 flex items-center gap-3 ml-24">
        <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full border" style={{ borderColor: 'var(--_color-theme---border)' }}>
          {isPersonalityPhase ? (
            <User className="w-4 h-4" style={{ color: 'var(--_color-theme---text)' }} />
          ) : (
            <BookOpen className="w-4 h-4" style={{ color: 'var(--_color-theme---text)' }} />
          )}
          <span className="text-body-medium text-sm" style={{ color: 'var(--_color-theme---text)' }}>
            {isPersonalityPhase ? 'Building Your Personality' : 'Adding Your Classes'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen px-6 py-20">
        <div className="max-w-2xl w-full">

          {/* AI Assistant Message - Anthropic Style */}
          <div className="mb-8">
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-12 h-12 bg-gradient-to-br rounded-full flex items-center justify-center shadow-lg ${isAssistantSpeaking ? 'animate-pulse' : ''}`} style={{ background: 'var(--_color-theme---button-primary--background)' }}>
                {isAssistantSpeaking ? (
                  <Volume2 className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="flex-1">
                <div className="bg-white rounded-3xl px-6 py-5 shadow-lg border relative" style={{ borderColor: 'var(--_color-theme---border)' }}>
                  {isPersonalityComplete && currentStep === personalityQuestions.length + 1 ? (
                    <div>
                      <h1 className="u-display-m text-heading" style={{ color: 'var(--_color-theme---text)' }}>
                        {animatedWords.map((word, index) => (
                          <span key={index} className="animate-word" style={{ transitionDelay: `${index * 100}ms` }}>
                            {word}{' '}
                          </span>
                        )) || "Perfect! I've captured your teaching personality. 🎉"}
                      </h1>
                      <p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>
                        Now all your twins will have your unique style, humor, and approach. Let's add your first class!
                      </p>
                    </div>
                  ) : currentStep > personalityQuestions.length + classQuestions.length ? (
                    <div>
                      <h1 className="u-display-m text-heading" style={{ color: 'var(--_color-theme---text)' }}>
                        {animatedWords.map((word, index) => (
                          <span key={index} className="animate-word" style={{ transitionDelay: `${index * 100}ms` }}>
                            {word}{' '}
                          </span>
                        )) || "Excellent! Your first twin is ready. ✨"}
                      </h1>
                      <p className="text-body-large" style={{ color: 'var(--_color-theme---text)' }}>
                        Would you like to create twins for more classes, or start using this one?
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-body-large leading-relaxed min-h-[1.5rem]" style={{ color: 'var(--_color-theme---text)' }}>
                        {animatedWords.length > 0 ? (
                          animatedWords.map((word, index) => (
                            <span key={index} className="animate-word" style={{ transitionDelay: `${index * 100}ms` }}>
                              {word}{' '}
                            </span>
                          ))
                        ) : (
                          <>
                            {displayedText}
                            {isTyping && <span className="animate-pulse">|</span>}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Follow-up encouragement - Anthropic Style */}
            {currentStep > 1 && currentStep <= personalityQuestions.length && (
              <div className="flex items-start gap-4 mb-6 opacity-70">
                <div className="w-12"></div>
                <div className="bg-white/50 rounded-2xl px-4 py-3 border" style={{ borderColor: 'var(--_color-theme---border)' }}>
                  <p className="text-body" style={{ color: 'var(--_color-theme---text)' }}>
                    {personalityQuestions[currentStep - 2]?.followUp}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Response Area - Anthropic Style */}
          {currentStep <= personalityQuestions.length + classQuestions.length && (
            <div
              className={`bg-white rounded-3xl p-6 shadow-lg border-2 transition-all duration-300 mb-6 ${
                isDragOver ? 'border-slate-400' : 'border-transparent'
              }`}
              style={{ borderColor: isDragOver ? 'var(--_color-theme---border-hover)' : 'var(--_color-theme---border)' }}
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
                        : 'text-white hover:scale-105 shadow-lg'
                    }`}
                    style={{
                      backgroundColor: isRecording
                        ? '#ef4444'
                        : isProcessingRecording
                          ? '#6b7280'
                          : 'var(--_color-theme---button-primary--background)'
                    }}
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
                    <div className="absolute -inset-1 rounded-full border-2 border-red-400 animate-pulse" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm" style={{ color: 'var(--_color-theme---text)' }}>
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
                        <span className="text-xs" style={{ color: 'var(--_color-theme---text)' }}>
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
                className={`w-full p-4 border-2 rounded-2xl resize-none min-h-[120px] focus:outline-none transition-colors duration-300 ${
                  isProcessingRecording
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
                style={{
                  backgroundColor: 'var(--_color-theme---background)',
                  color: 'var(--_color-theme---text)',
                  borderColor: 'var(--_color-theme---border)',
                  fontFamily: 'var(--_typography---font--display-sans)'
                }}
                onFocus={(e) => {
                  if (!isProcessingRecording) {
                    e.currentTarget.style.borderColor = 'var(--_color-theme---border-hover)';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--_color-theme---border)';
                }}
              />

              {/* Uploaded Files Display */}
              {uploadedFiles.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--_color-theme---text)' }}>
                      Uploaded files ({uploadedFiles.length}):
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border group hover:shadow-sm transition-all duration-200"
                        style={{
                          backgroundColor: 'var(--_color-theme---background)',
                          borderColor: 'var(--_color-theme---border)',
                          color: 'var(--_color-theme---text)'
                        }}
                      >
                        <div style={{ color: 'var(--_color-theme---text)' }}>
                          {getFileIcon(file)}
                        </div>
                        <span className="max-w-32 truncate">{file.name}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="ml-1 p-1 rounded-full opacity-70 hover:opacity-100 transition-all duration-200 hover:bg-red-100"
                          style={{ color: 'var(--_color-theme---text)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                            e.currentTarget.style.color = '#dc2626';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--_color-theme---text)';
                          }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: 'var(--_color-theme---text)' }}>or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-anthropic-secondary"
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
                    accept=".pdf,.doc,.docx,.txt,.wav,.mp3,.m4a,audio/*,.png,.jpg,.jpeg,image/*"
                  />
                </div>

                <button
                  onClick={handleNextStep}
                  disabled={(!currentResponse.trim() && uploadedFiles.length === 0) || isProcessingRecording}
                  className="btn-anthropic-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Completion Actions - Anthropic Style */}
          {currentStep > personalityQuestions.length + classQuestions.length && (
            <div className="bg-white rounded-3xl p-6 shadow-lg border" style={{ borderColor: 'var(--_color-theme---border)' }}>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={createAnotherClass}
                  className="btn-anthropic-secondary"
                >
                  Add Another Class
                </button>
                <button
                  onClick={finishSetup}
                  className="btn-anthropic-primary"
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

export default AnthropicTwinBuilder;