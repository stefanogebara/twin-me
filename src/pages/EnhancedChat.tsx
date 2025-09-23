import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Send, Mic, MicOff, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase, dbHelpers } from '@/lib/supabase';
import { SecureDigitalTwinAPI } from '@/lib/api';
import LoadingScreen from '@/components/LoadingScreen';
import type { DigitalTwin, Conversation, Message as DBMessage, StudentProfile } from '@/types/database';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const EnhancedChat = () => {
  const { twinId } = useParams();
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [digitalTwin, setDigitalTwin] = useState<DigitalTwin | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (user && twinId) {
      initializeChat();
    }
  }, [user, twinId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeChat = async () => {
    try {
      setIsLoading(true);

      // Load digital twin
      const { data: twin, error: twinError } = await supabase
        .from('digital_twins')
        .select(`
          *,
          profiles!digital_twins_creator_id_fkey(full_name, university, department, avatar_url)
        `)
        .eq('id', twinId)
        .eq('is_active', true)
        .single();

      if (twinError) throw twinError;
      if (!twin) {
        toast({
          title: "Twin not found",
          description: "This digital twin is not available or has been deactivated.",
          variant: "destructive"
        });
        navigate('/talk-to-twin');
        return;
      }

      setDigitalTwin(twin);

      // Skip student profile operations for now to prevent 404 errors
      // TODO: Implement proper Clerk-Supabase integration
      console.log('Chat initialized for user:', user!.id, 'twin:', twinId);

      // Create a basic student profile from Clerk data
      const profile = {
        id: user!.id,
        learning_style: {},
        cognitive_preferences: {},
        interaction_history: {},
        performance_metrics: {},
        assessment_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setStudentProfile(profile);

      // Get or create conversation
      let { data: conversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('student_id', user!.id)
        .eq('twin_id', twinId)
        .order('last_message_at', { ascending: false })
        .limit(1);

      let currentConversation: Conversation;

      if (conversations && conversations.length > 0) {
        currentConversation = conversations[0];
      } else {
        // Create new conversation
        currentConversation = await dbHelpers.createConversation({
          student_id: user!.id,
          twin_id: twinId,
          title: `Chat with ${twin.name}`
        });
      }

      setConversation(currentConversation);

      // Load messages
      const dbMessages = await dbHelpers.getMessages(currentConversation.id);
      const formattedMessages: Message[] = dbMessages.map(msg => ({
        id: msg.id,
        content: msg.content,
        isUser: msg.is_user_message,
        timestamp: new Date(msg.created_at)
      }));

      // Add greeting if no messages exist
      if (formattedMessages.length === 0) {
        const greeting = await generateGreeting(twin, profile);
        const greetingMessage: Message = {
          id: 'greeting',
          content: greeting,
          isUser: false,
          timestamp: new Date()
        };
        setMessages([greetingMessage]);

        // Save greeting to database
        await dbHelpers.addMessage({
          conversation_id: currentConversation.id,
          content: greeting,
          is_user_message: false,
          message_type: 'text',
          metadata: { type: 'greeting' }
        });
      } else {
        setMessages(formattedMessages);
      }

    } catch (error: any) {
      toast({
        title: "Error loading chat",
        description: error.message,
        variant: "destructive"
      });
      navigate('/talk-to-twin');
    } finally {
      setIsLoading(false);
    }
  };

  const generateGreeting = async (twin: DigitalTwin, studentProfile: StudentProfile | null): Promise<string> => {
    try {
      // Use Vicente-specific method if this is Vicente Leon
      if (twin.name.toLowerCase().includes('vicente') || twin.name.toLowerCase().includes('leon')) {
        const response = await SecureDigitalTwinAPI.generateVicenteResponse(
          "Please provide a warm greeting to introduce yourself to a new student. Keep it friendly and encouraging, mention what subject you teach, and use your characteristic style.",
          {
            twin,
            studentProfile: studentProfile || undefined,
            conversationHistory: [],
            professorContext: twin.profiles as any
          }
        );
        return response;
      } else {
        const response = await SecureDigitalTwinAPI.generateResponse(
          "Please provide a warm greeting to introduce yourself to a new student. Keep it friendly and encouraging, and mention what subject you teach.",
          {
            twin,
            studentProfile: studentProfile || undefined,
            conversationHistory: [],
            professorContext: twin.profiles as any
          }
        );
        return response;
      }
    } catch (error) {
      // Fallback greeting
      return `Hello! I'm ${twin.name}, your AI teaching assistant for ${twin.subject_area}. I'm here to help you learn and answer any questions you might have. What would you like to explore today?`;
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !conversation || !digitalTwin || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Save user message to database
      await dbHelpers.addMessage({
        conversation_id: conversation.id,
        content: content.trim(),
        is_user_message: true,
        message_type: 'text',
        metadata: {}
      });

      // Generate AI response
      const dbMessages = await dbHelpers.getMessages(conversation.id);

      // Use Vicente-specific method if this is Vicente Leon
      const aiResponse = digitalTwin.name.toLowerCase().includes('vicente') || digitalTwin.name.toLowerCase().includes('leon')
        ? await SecureDigitalTwinAPI.generateVicenteResponse(
            content.trim(),
            {
              twin: digitalTwin,
              studentProfile: studentProfile || undefined,
              conversationHistory: dbMessages,
              professorContext: digitalTwin.profiles as any
            }
          )
        : await SecureDigitalTwinAPI.generateResponse(
            content.trim(),
            {
              twin: digitalTwin,
              studentProfile: studentProfile || undefined,
              conversationHistory: dbMessages,
              professorContext: digitalTwin.profiles as any
            }
          );

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Save AI response to database
      await dbHelpers.addMessage({
        conversation_id: conversation.id,
        content: aiResponse,
        is_user_message: false,
        message_type: 'text',
        metadata: {}
      });

    } catch (error: any) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive"
      });

      // Remove the user message if AI response failed
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
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
        // Here you would integrate with speech-to-text service
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

    // Here you would integrate with ElevenLabs or another TTS service
    // For now, we'll use the browser's built-in speech synthesis
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    speechSynthesis.speak(utterance);
  };

  if (isLoading && !digitalTwin) {
    return (
      <LoadingScreen
        message="Loading your conversation"
        submessage="Connecting you with your AI professor"
      />
    );
  }

  if (!digitalTwin) {
    return (
      <div className="min-h-screen bg-[hsl(var(--lenny-cream))] flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-display gradient-text mb-2">Digital Twin Not Found</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-4">This digital twin is not available or has been deactivated.</p>
          <Button className="btn-lenny" onClick={() => navigate('/talk-to-twin')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Twins
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--lenny-cream))] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--lenny-cream))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--lenny-cream))]/60 border-b">
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
                <AvatarImage src={digitalTwin.profiles?.avatar_url} alt={digitalTwin.name} />
                <AvatarFallback>{digitalTwin.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-lg font-display gradient-text">{digitalTwin.name}</h1>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {digitalTwin.subject_area} • {digitalTwin.profiles?.university}
                </p>
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
                <AvatarImage src={digitalTwin.profiles?.avatar_url} alt={digitalTwin.name} />
                <AvatarFallback>{digitalTwin.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
            )}
            <div className={`max-w-[70%] ${message.isUser ? 'order-first' : ''}`}>
              <Card className={`p-4 ${
                message.isUser
                  ? 'bg-[hsl(var(--lenny-orange))] text-white ml-auto'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}>
                <p className={`text-sm leading-relaxed ${
                  message.isUser ? 'text-white' : 'text-[hsl(var(--lenny-black))]'
                }`}>{message.content}</p>
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
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 px-3">
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
              <AvatarImage src={digitalTwin.profiles?.avatar_url} alt={digitalTwin.name} />
              <AvatarFallback>{digitalTwin.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <Card className="p-4 bg-white border border-gray-200 shadow-sm max-w-[70%]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-[hsl(var(--lenny-cream))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--lenny-cream))]/60 border-t">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Ask ${digitalTwin.name} anything...`}
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
                className="btn-lenny absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              className={`h-10 w-10 p-0 ${!isRecording ? 'btn-lenny-secondary' : ''}`}
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
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 text-center">
            Type your message or click the mic to speak
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnhancedChat;