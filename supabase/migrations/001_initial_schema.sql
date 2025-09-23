-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for both professors and students
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  user_type TEXT CHECK (user_type IN ('student', 'professor', 'personal')) NOT NULL,
  university TEXT,
  department TEXT,
  bio TEXT,
  expertise_areas TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create digital_twins table
CREATE TABLE digital_twins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  subject_area TEXT,
  twin_type TEXT CHECK (twin_type IN ('professor', 'personal')) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  voice_profile_id TEXT, -- ElevenLabs voice ID
  personality_traits JSONB DEFAULT '{}',
  teaching_style JSONB DEFAULT '{}',
  common_phrases TEXT[],
  favorite_analogies TEXT[],
  knowledge_base_status TEXT DEFAULT 'empty',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create training_materials table
CREATE TABLE training_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  content_summary TEXT,
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create conversations table
CREATE TABLE conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create messages table
CREATE TABLE messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_user_message BOOLEAN NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'image')),
  audio_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create student_profiles table for learning preferences
CREATE TABLE student_profiles (
  id UUID REFERENCES profiles(id) PRIMARY KEY,
  learning_style JSONB DEFAULT '{}',
  cognitive_preferences JSONB DEFAULT '{}',
  interaction_history JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  assessment_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create voice_profiles table
CREATE TABLE voice_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE NOT NULL,
  elevenlabs_voice_id TEXT,
  voice_name TEXT,
  voice_description TEXT,
  sample_audio_url TEXT,
  is_cloned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_twins ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can create own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own digital twins" ON digital_twins
  FOR SELECT USING (auth.uid() = creator_id);

CREATE POLICY "Users can create own digital twins" ON digital_twins
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own digital twins" ON digital_twins
  FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete own digital twins" ON digital_twins
  FOR DELETE USING (auth.uid() = creator_id);

-- Allow students to view active professor twins
CREATE POLICY "Students can view active professor twins" ON digital_twins
  FOR SELECT USING (is_active = true AND twin_type = 'professor');

-- Similar policies for other tables...
CREATE POLICY "Users can manage own training materials" ON training_materials
  FOR ALL USING (EXISTS (
    SELECT 1 FROM digital_twins
    WHERE digital_twins.id = training_materials.twin_id
    AND digital_twins.creator_id = auth.uid()
  ));

CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can view messages in own conversations" ON messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.student_id = auth.uid()
  ));

CREATE POLICY "Users can create messages in own conversations" ON messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.student_id = auth.uid()
  ));

CREATE POLICY "Users can view own student profile" ON student_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own student profile" ON student_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can create own student profile" ON student_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twins_updated_at BEFORE UPDATE ON digital_twins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_profiles_updated_at BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();