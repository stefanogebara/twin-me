import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type DigitalTwin = Database['public']['Tables']['digital_twins']['Row'];
export type DigitalTwinInsert = Database['public']['Tables']['digital_twins']['Insert'];
export type DigitalTwinUpdate = Database['public']['Tables']['digital_twins']['Update'];

export type TrainingMaterial = Database['public']['Tables']['training_materials']['Row'];
export type TrainingMaterialInsert = Database['public']['Tables']['training_materials']['Insert'];
export type TrainingMaterialUpdate = Database['public']['Tables']['training_materials']['Update'];

export type Conversation = Database['public']['Tables']['conversations']['Row'];
export type ConversationInsert = Database['public']['Tables']['conversations']['Insert'];
export type ConversationUpdate = Database['public']['Tables']['conversations']['Update'];

export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageInsert = Database['public']['Tables']['messages']['Insert'];
export type MessageUpdate = Database['public']['Tables']['messages']['Update'];

export type StudentProfile = Database['public']['Tables']['student_profiles']['Row'];
export type StudentProfileInsert = Database['public']['Tables']['student_profiles']['Insert'];
export type StudentProfileUpdate = Database['public']['Tables']['student_profiles']['Update'];

export type VoiceProfile = Database['public']['Tables']['voice_profiles']['Row'];
export type VoiceProfileInsert = Database['public']['Tables']['voice_profiles']['Insert'];
export type VoiceProfileUpdate = Database['public']['Tables']['voice_profiles']['Update'];

// Database helper functions
export const db = {
  // Profile operations
  profiles: {
    async get(id: string): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data;
    },

    async create(profile: ProfileInsert): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .insert(profile)
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return null;
      }
      return data;
    },

    async update(id: string, updates: ProfileUpdate): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        return null;
      }
      return data;
    },

    async getByEmail(email: string): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Error fetching profile by email:', error);
        return null;
      }
      return data;
    }
  },

  // Digital Twin operations
  digitalTwins: {
    async getByCreator(creatorId: string): Promise<DigitalTwin[]> {
      const { data, error } = await supabase
        .from('digital_twins')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching digital twins:', error);
        return [];
      }
      return data;
    },

    async get(id: string): Promise<DigitalTwin | null> {
      const { data, error } = await supabase
        .from('digital_twins')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching digital twin:', error);
        return null;
      }
      return data;
    },

    async create(twin: DigitalTwinInsert): Promise<DigitalTwin | null> {
      const { data, error } = await supabase
        .from('digital_twins')
        .insert(twin)
        .select()
        .single();

      if (error) {
        console.error('Error creating digital twin:', error);
        return null;
      }
      return data;
    },

    async update(id: string, updates: DigitalTwinUpdate): Promise<DigitalTwin | null> {
      const { data, error } = await supabase
        .from('digital_twins')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating digital twin:', error);
        return null;
      }
      return data;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('digital_twins')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting digital twin:', error);
        return false;
      }
      return true;
    },

    async getActiveProfessorTwins(): Promise<DigitalTwin[]> {
      const { data, error } = await supabase
        .from('digital_twins')
        .select('*')
        .eq('is_active', true)
        .eq('twin_type', 'professor')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching active professor twins:', error);
        return [];
      }
      return data;
    }
  },

  // Training Material operations
  trainingMaterials: {
    async getByTwin(twinId: string): Promise<TrainingMaterial[]> {
      const { data, error } = await supabase
        .from('training_materials')
        .select('*')
        .eq('twin_id', twinId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Error fetching training materials:', error);
        return [];
      }
      return data;
    },

    async create(material: TrainingMaterialInsert): Promise<TrainingMaterial | null> {
      const { data, error } = await supabase
        .from('training_materials')
        .insert(material)
        .select()
        .single();

      if (error) {
        console.error('Error creating training material:', error);
        return null;
      }
      return data;
    },

    async update(id: string, updates: TrainingMaterialUpdate): Promise<TrainingMaterial | null> {
      const { data, error } = await supabase
        .from('training_materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating training material:', error);
        return null;
      }
      return data;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('training_materials')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting training material:', error);
        return false;
      }
      return true;
    }
  },

  // Conversation operations
  conversations: {
    async getByStudent(studentId: string): Promise<Conversation[]> {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('student_id', studentId)
        .order('last_message_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
        return [];
      }
      return data;
    },

    async get(id: string): Promise<Conversation | null> {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching conversation:', error);
        return null;
      }
      return data;
    },

    async create(conversation: ConversationInsert): Promise<Conversation | null> {
      const { data, error } = await supabase
        .from('conversations')
        .insert(conversation)
        .select()
        .single();

      if (error) {
        console.error('Error creating conversation:', error);
        return null;
      }
      return data;
    },

    async updateLastMessage(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Error updating conversation last message time:', error);
        return false;
      }
      return true;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting conversation:', error);
        return false;
      }
      return true;
    }
  },

  // Message operations
  messages: {
    async getByConversation(conversationId: string): Promise<Message[]> {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return [];
      }
      return data;
    },

    async create(message: MessageInsert): Promise<Message | null> {
      const { data, error } = await supabase
        .from('messages')
        .insert(message)
        .select()
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return null;
      }
      return data;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting message:', error);
        return false;
      }
      return true;
    }
  },

  // Student Profile operations
  studentProfiles: {
    async get(id: string): Promise<StudentProfile | null> {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching student profile:', error);
        return null;
      }
      return data;
    },

    async create(profile: StudentProfileInsert): Promise<StudentProfile | null> {
      const { data, error } = await supabase
        .from('student_profiles')
        .insert(profile)
        .select()
        .single();

      if (error) {
        console.error('Error creating student profile:', error);
        return null;
      }
      return data;
    },

    async update(id: string, updates: StudentProfileUpdate): Promise<StudentProfile | null> {
      const { data, error } = await supabase
        .from('student_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating student profile:', error);
        return null;
      }
      return data;
    }
  },

  // Voice Profile operations
  voiceProfiles: {
    async getByTwin(twinId: string): Promise<VoiceProfile[]> {
      const { data, error } = await supabase
        .from('voice_profiles')
        .select('*')
        .eq('twin_id', twinId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching voice profiles:', error);
        return [];
      }
      return data;
    },

    async create(profile: VoiceProfileInsert): Promise<VoiceProfile | null> {
      const { data, error } = await supabase
        .from('voice_profiles')
        .insert(profile)
        .select()
        .single();

      if (error) {
        console.error('Error creating voice profile:', error);
        return null;
      }
      return data;
    },

    async update(id: string, updates: VoiceProfileUpdate): Promise<VoiceProfile | null> {
      const { data, error } = await supabase
        .from('voice_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating voice profile:', error);
        return null;
      }
      return data;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await supabase
        .from('voice_profiles')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting voice profile:', error);
        return false;
      }
      return true;
    }
  }
};

// Auth helper functions
export const auth = {
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Error getting current user:', error);
      return null;
    }
    return user;
  },

  async getCurrentProfile(): Promise<Profile | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;

    return await db.profiles.get(user.id);
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      return false;
    }
    return true;
  }
};