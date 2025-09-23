export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  user_type: 'student' | 'professor' | 'personal';
  university?: string;
  department?: string;
  bio?: string;
  expertise_areas?: string[];
  created_at: string;
  updated_at: string;
}

export interface DigitalTwin {
  id: string;
  creator_id: string;
  name: string;
  description?: string;
  subject_area?: string;
  twin_type: 'professor' | 'personal';
  is_active: boolean;
  voice_profile_id?: string;
  personality_traits: Record<string, any>;
  teaching_style: Record<string, any>;
  common_phrases?: string[];
  favorite_analogies?: string[];
  knowledge_base_status: 'empty' | 'processing' | 'ready' | 'updating';
  created_at: string;
  updated_at: string;
}

export interface TrainingMaterial {
  id: string;
  twin_id: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  storage_path: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  content_summary?: string;
  extracted_text?: string;
  metadata: Record<string, any>;
  uploaded_at: string;
}

export interface Conversation {
  id: string;
  student_id: string;
  twin_id: string;
  title?: string;
  started_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  is_user_message: boolean;
  message_type: 'text' | 'voice' | 'image';
  audio_url?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface StudentProfile {
  id: string;
  learning_style: Record<string, any>;
  cognitive_preferences: Record<string, any>;
  interaction_history: Record<string, any>;
  performance_metrics: Record<string, any>;
  assessment_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceProfile {
  id: string;
  twin_id: string;
  elevenlabs_voice_id?: string;
  voice_name?: string;
  voice_description?: string;
  sample_audio_url?: string;
  is_cloned: boolean;
  created_at: string;
}

// Specific types for teaching styles and personality traits
export interface TeachingStyle {
  primary_method: 'socratic' | 'direct_instruction' | 'project_based' | 'flipped_classroom';
  encourages_questions: boolean;
  uses_humor: boolean;
  provides_examples: boolean;
  checks_understanding: boolean;
  difficulty_progression: 'linear' | 'spiral' | 'adaptive';
  explanation_style: 'theoretical' | 'practical' | 'mixed';
}

export interface PersonalityTraits {
  communication_style: 'formal' | 'casual' | 'friendly' | 'authoritative';
  energy_level: 'low' | 'moderate' | 'high';
  patience_level: 'low' | 'moderate' | 'high';
  sense_of_humor: 'dry' | 'playful' | 'witty' | 'none';
  supportiveness: 'low' | 'moderate' | 'high';
}

export interface LearningStyle {
  visual_preference: number; // 1-5 scale
  auditory_preference: number;
  kinesthetic_preference: number;
  reading_preference: number;
  social_learning: boolean;
  preferred_pace: 'slow' | 'moderate' | 'fast';
  attention_span: 'short' | 'moderate' | 'long';
  feedback_preference: 'immediate' | 'periodic' | 'final';
}

export interface CognitivePreferences {
  abstract_vs_concrete: number; // 1-5 scale (1=concrete, 5=abstract)
  sequential_vs_global: number; // 1-5 scale (1=sequential, 5=global)
  active_vs_reflective: number; // 1-5 scale (1=active, 5=reflective)
  intuitive_vs_sensing: number; // 1-5 scale (1=sensing, 5=intuitive)
}

// Database response types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      digital_twins: {
        Row: DigitalTwin;
        Insert: Omit<DigitalTwin, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DigitalTwin, 'id' | 'created_at' | 'updated_at'>>;
      };
      training_materials: {
        Row: TrainingMaterial;
        Insert: Omit<TrainingMaterial, 'id' | 'uploaded_at'>;
        Update: Partial<Omit<TrainingMaterial, 'id' | 'uploaded_at'>>;
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, 'id' | 'started_at' | 'last_message_at'>;
        Update: Partial<Omit<Conversation, 'id' | 'started_at'>>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at'>;
        Update: Partial<Omit<Message, 'id' | 'created_at'>>;
      };
      student_profiles: {
        Row: StudentProfile;
        Insert: Omit<StudentProfile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      voice_profiles: {
        Row: VoiceProfile;
        Insert: Omit<VoiceProfile, 'id' | 'created_at'>;
        Update: Partial<Omit<VoiceProfile, 'id' | 'created_at'>>;
      };
    };
  };
};