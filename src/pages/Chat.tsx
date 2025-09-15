import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const professors = [
  {
    id: 1,
    name: "Dr. Sarah Chen",
    subject: "Computer Science",
    university: "Stanford University",
    image: "https://images.unsplash.com/photo-1494790108755-2616c15cb048?w=150&h=150&fit=crop&crop=face",
    greeting: "Hello! I'm Dr. Chen. I'm excited to help you explore the fascinating world of computer science. What would you like to learn about today?"
  },
  {
    id: 2,
    name: "Prof. Michael Rodriguez",
    subject: "Mathematics",
    university: "MIT",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
    greeting: "Welcome! I'm Professor Rodriguez. Mathematics is the language of the universe, and I'm here to help you speak it fluently. What mathematical concept can I help clarify for you?"
  },
  {
    id: 3,
    name: "Dr. Emily Johnson",
    subject: "Physics",
    university: "Harvard University",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    greeting: "Hi there! I'm Dr. Johnson. Physics helps us understand how the universe works, from the smallest particles to the largest galaxies. What aspect of physics interests you most?"
  },
  {
    id: 4,
    name: "Prof. David Kim",
    subject: "Chemistry",
    university: "Caltech",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    greeting: "Hello! I'm Professor Kim. Chemistry is all about understanding the building blocks of matter and how they interact. What chemical concepts would you like to explore?"
  },
  {
    id: 5,
    name: "Dr. Lisa Thompson",
    subject: "Biology",
    university: "UC Berkeley",
    image: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150&h=150&fit=crop&crop=face",
    greeting: "Welcome! I'm Dr. Thompson. Biology is the study of life in all its incredible forms. From cells to ecosystems, what aspects of life science intrigue you?"
  },
  {
    id: 6,
    name: "Prof. James Wilson",
    subject: "History",
    university: "Yale University",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face",
    greeting: "Hello! I'm Professor Wilson. History helps us understand how we got to where we are today. What historical period or event would you like to discuss?"
  }
];

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const Chat = () => {
  const { professorId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const professor = professors.find(p => p.id === parseInt(professorId || ''));

  useEffect(() => {
    if (professor) {
      // Add greeting message
      setMessages([{
        id: '1',
        content: professor.greeting,
        isUser: false,
        timestamp: new Date()
      }]);
    }
  }, [professor]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response (replace with actual AI integration)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: `Thank you for your question about "${content}". As ${professor?.name}, I'd be happy to help you understand this concept better. Let me break it down for you...`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1500);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // Here you would send the audio to your speech-to-text service
        // For now, we'll simulate the transcription
        const mockTranscription = "This is a mock transcription of your voice input.";
        await handleSendMessage(mockTranscription);
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const speakMessage = async (content: string) => {
    if (isPlayingAudio) return;
    
    setIsPlayingAudio(true);
    
    // Here you would integrate with your text-to-speech service
    // For now, we'll use the browser's built-in speech synthesis
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    
    speechSynthesis.speak(utterance);
  };

  if (!professor) {
    return <div>Professor not found</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/talk-to-twin')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={professor.image} alt={professor.name} />
                <AvatarFallback>{professor.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-lg font-semibold">{professor.name}</h1>
                <p className="text-sm text-muted-foreground">{professor.subject} • {professor.university}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            {!message.isUser && (
              <Avatar className="w-8 h-8 mt-1">
                <AvatarImage src={professor.image} alt={professor.name} />
                <AvatarFallback>{professor.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
            )}
            <div className={`max-w-[70%] ${message.isUser ? 'order-first' : ''}`}>
              <Card className={`p-4 ${
                message.isUser 
                  ? 'bg-accent text-accent-foreground ml-auto' 
                  : 'bg-muted'
              }`}>
                <p className="text-sm leading-relaxed">{message.content}</p>
                {!message.isUser && (
                  <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => speakMessage(message.content)}
                      disabled={isPlayingAudio}
                      className="h-8 px-2"
                    >
                      {isPlayingAudio ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}
              </Card>
              <p className="text-xs text-muted-foreground mt-1 px-3">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {message.isUser && (
              <Avatar className="w-8 h-8 mt-1">
                <AvatarFallback>You</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <Avatar className="w-8 h-8 mt-1">
              <AvatarImage src={professor.image} alt={professor.name} />
              <AvatarFallback>{professor.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <Card className="p-4 bg-muted max-w-[70%]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Ask ${professor.name} anything...`}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputValue);
                  }
                }}
                className="pr-12"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              className="h-10 w-10 p-0"
              onClick={toggleRecording}
              disabled={isLoading}
            >
              {isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Type your message or click the mic to speak
          </p>
        </div>
      </div>
    </div>
  );
};

export default Chat;