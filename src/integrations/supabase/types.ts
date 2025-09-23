export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          user_type: 'student' | 'professor' | 'personal'
          university: string | null
          department: string | null
          bio: string | null
          expertise_areas: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          user_type: 'student' | 'professor' | 'personal'
          university?: string | null
          department?: string | null
          bio?: string | null
          expertise_areas?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          user_type?: 'student' | 'professor' | 'personal'
          university?: string | null
          department?: string | null
          bio?: string | null
          expertise_areas?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      digital_twins: {
        Row: {
          id: string
          creator_id: string
          name: string
          description: string | null
          subject_area: string | null
          twin_type: 'professor' | 'personal'
          is_active: boolean
          voice_profile_id: string | null
          personality_traits: Json
          teaching_style: Json
          common_phrases: string[] | null
          favorite_analogies: string[] | null
          knowledge_base_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          name: string
          description?: string | null
          subject_area?: string | null
          twin_type: 'professor' | 'personal'
          is_active?: boolean
          voice_profile_id?: string | null
          personality_traits?: Json
          teaching_style?: Json
          common_phrases?: string[] | null
          favorite_analogies?: string[] | null
          knowledge_base_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          name?: string
          description?: string | null
          subject_area?: string | null
          twin_type?: 'professor' | 'personal'
          is_active?: boolean
          voice_profile_id?: string | null
          personality_traits?: Json
          teaching_style?: Json
          common_phrases?: string[] | null
          favorite_analogies?: string[] | null
          knowledge_base_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_twins_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      training_materials: {
        Row: {
          id: string
          twin_id: string
          file_name: string
          file_type: string
          file_size: number | null
          storage_path: string
          processing_status: 'pending' | 'processing' | 'completed' | 'failed'
          content_summary: string | null
          extracted_text: string | null
          metadata: Json
          uploaded_at: string
        }
        Insert: {
          id?: string
          twin_id: string
          file_name: string
          file_type: string
          file_size?: number | null
          storage_path: string
          processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
          content_summary?: string | null
          extracted_text?: string | null
          metadata?: Json
          uploaded_at?: string
        }
        Update: {
          id?: string
          twin_id?: string
          file_name?: string
          file_type?: string
          file_size?: number | null
          storage_path?: string
          processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
          content_summary?: string | null
          extracted_text?: string | null
          metadata?: Json
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_materials_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          id: string
          student_id: string
          twin_id: string
          title: string | null
          started_at: string
          last_message_at: string
        }
        Insert: {
          id?: string
          student_id: string
          twin_id: string
          title?: string | null
          started_at?: string
          last_message_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          twin_id?: string
          title?: string | null
          started_at?: string
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          content: string
          is_user_message: boolean
          message_type: 'text' | 'voice' | 'image'
          audio_url: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          content: string
          is_user_message: boolean
          message_type?: 'text' | 'voice' | 'image'
          audio_url?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          content?: string
          is_user_message?: boolean
          message_type?: 'text' | 'voice' | 'image'
          audio_url?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      student_profiles: {
        Row: {
          id: string
          learning_style: Json
          cognitive_preferences: Json
          interaction_history: Json
          performance_metrics: Json
          assessment_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          learning_style?: Json
          cognitive_preferences?: Json
          interaction_history?: Json
          performance_metrics?: Json
          assessment_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          learning_style?: Json
          cognitive_preferences?: Json
          interaction_history?: Json
          performance_metrics?: Json
          assessment_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      voice_profiles: {
        Row: {
          id: string
          twin_id: string
          elevenlabs_voice_id: string | null
          voice_name: string | null
          voice_description: string | null
          sample_audio_url: string | null
          is_cloned: boolean
          created_at: string
        }
        Insert: {
          id?: string
          twin_id: string
          elevenlabs_voice_id?: string | null
          voice_name?: string | null
          voice_description?: string | null
          sample_audio_url?: string | null
          is_cloned?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          twin_id?: string
          elevenlabs_voice_id?: string | null
          voice_name?: string | null
          voice_description?: string | null
          sample_audio_url?: string | null
          is_cloned?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_profiles_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "digital_twins"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
