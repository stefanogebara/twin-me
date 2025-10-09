import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Supabase Realtime payload type
export interface RealtimePayload<T = unknown> {
  schema: string;
  table: string;
  commit_timestamp: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
  errors: string[] | null;
}

// Helper functions for common database operations
export const dbHelpers = {
  // Profile operations
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, updates: Database['public']['Tables']['profiles']['Update']) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Digital Twin operations
  async getDigitalTwins(userId: string) {
    const { data, error } = await supabase
      .from('digital_twins')
      .select('*')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getActiveProfessorTwins() {
    const { data, error } = await supabase
      .from('digital_twins')
      .select(`
        *,
        profiles!digital_twins_creator_id_fkey(full_name, university, department, avatar_url)
      `)
      .eq('is_active', true)
      .eq('twin_type', 'professor')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async createDigitalTwin(twinData: Database['public']['Tables']['digital_twins']['Insert']) {
    const { data, error } = await supabase
      .from('digital_twins')
      .insert(twinData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateDigitalTwin(twinId: string, updates: Database['public']['Tables']['digital_twins']['Update']) {
    const { data, error } = await supabase
      .from('digital_twins')
      .update(updates)
      .eq('id', twinId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Training Materials operations
  async getTrainingMaterials(twinId: string) {
    const { data, error } = await supabase
      .from('training_materials')
      .select('*')
      .eq('twin_id', twinId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async uploadTrainingMaterial(materialData: Database['public']['Tables']['training_materials']['Insert']) {
    const { data, error } = await supabase
      .from('training_materials')
      .insert(materialData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Conversation operations
  async getConversations(studentId: string) {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        digital_twins(name, subject_area),
        messages(content, is_user_message, created_at)
      `)
      .eq('student_id', studentId)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async createConversation(conversationData: Database['public']['Tables']['conversations']['Insert']) {
    const { data, error } = await supabase
      .from('conversations')
      .insert(conversationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getMessages(conversationId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  async addMessage(messageData: Database['public']['Tables']['messages']['Insert']) {
    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (error) throw error;

    // Update conversation's last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', messageData.conversation_id);

    return data;
  },

  // Student Profile operations
  async getStudentProfile(userId: string) {
    const { data, error } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
    return data;
  },

  async updateStudentProfile(userId: string, updates: Database['public']['Tables']['student_profiles']['Update']) {
    const { data, error } = await supabase
      .from('student_profiles')
      .upsert({ id: userId, ...updates })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Voice Profile operations
  async getVoiceProfile(twinId: string) {
    const { data, error } = await supabase
      .from('voice_profiles')
      .select('*')
      .eq('twin_id', twinId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async createVoiceProfile(voiceData: Database['public']['Tables']['voice_profiles']['Insert']) {
    const { data, error } = await supabase
      .from('voice_profiles')
      .insert(voiceData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // File upload to Supabase Storage
  async uploadFile(bucket: string, path: string, file: File) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
    return data;
  },

  async getFileUrl(bucket: string, path: string) {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  },

  // Real-time subscriptions
  subscribeToConversation(conversationId: string, callback: (payload: RealtimePayload) => void) {
    return supabase
      .channel(`conversation-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        callback
      )
      .subscribe();
  },

  subscribeToTwinUpdates(twinId: string, callback: (payload: RealtimePayload) => void) {
    return supabase
      .channel(`twin-${twinId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'digital_twins',
          filter: `id=eq.${twinId}`,
        },
        callback
      )
      .subscribe();
  }
};