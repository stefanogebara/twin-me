import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from api directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Create server-side Supabase client with service role key
// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️  Missing Supabase configuration. Database operations will not be available.');
  console.warn('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.warn(`Current values: URL=${supabaseUrl ? 'SET' : 'MISSING'}, KEY=${supabaseServiceKey ? 'SET' : 'MISSING'}`);
  console.warn('📋 Server will continue running with limited functionality.');
} else {
  try {
    // Server-side client that bypasses RLS (Row Level Security) with connection pooling
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-connection-pool': 'server'
        }
      }
    });
    console.log('✅ Supabase client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error.message);
  }
}

export { supabaseAdmin };

// Helper function to check database availability
const checkDbAvailable = () => {
  if (!supabaseAdmin) {
    return {
      data: null,
      error: new Error('Database not available - missing Supabase configuration')
    };
  }
  return null;
};

// Database operations for server-side use
export const serverDb = {
  // Profile operations
  async createProfile(profileData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating profile:', error);
      return { data: null, error };
    }
  },

  async getProfile(userId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
      return { data: null, error };
    }
  },

  async updateProfile(userId, updates) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error updating profile:', error);
      return { data: null, error };
    }
  },

  // Digital Twin operations
  async createDigitalTwin(twinData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('digital_twins')
        .insert(twinData)
        .select()
        .single();

      if (error) {
        console.error('Error creating digital twin:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating digital twin:', error);
      return { data: null, error };
    }
  },

  async getDigitalTwin(twinId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('digital_twins')
        .select('*')
        .eq('id', twinId)
        .single();

      if (error) {
        console.error('Error fetching digital twin:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching digital twin:', error);
      return { data: null, error };
    }
  },

  async getDigitalTwinsByCreator(creatorId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('digital_twins')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching digital twins:', error);
        return { data: [], error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching digital twins:', error);
      return { data: [], error };
    }
  },

  async updateDigitalTwin(twinId, updates) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error} = await supabaseAdmin
        .from('digital_twins')
        .update(updates)
        .eq('id', twinId)
        .select()
        .single();

      if (error) {
        console.error('Error updating digital twin:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error updating digital twin:', error);
      return { data: null, error };
    }
  },

  async deleteDigitalTwin(twinId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { error } = await supabaseAdmin
        .from('digital_twins')
        .delete()
        .eq('id', twinId);

      if (error) {
        console.error('Error deleting digital twin:', error);
        return { success: false, error };
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('Unexpected error deleting digital twin:', error);
      return { success: false, error };
    }
  },

  // Platform Connection operations
  async getPlatformConnection(userId, platform) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error getting platform connection:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Unexpected error getting platform connection:', error);
      return null;
    }
  },

  // Training Material operations
  async createTrainingMaterial(materialData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('training_materials')
        .insert(materialData)
        .select()
        .single();

      if (error) {
        console.error('Error creating training material:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating training material:', error);
      return { data: null, error };
    }
  },

  async getTrainingMaterialsByTwin(twinId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('training_materials')
        .select('*')
        .eq('twin_id', twinId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Error fetching training materials:', error);
        return { data: [], error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching training materials:', error);
      return { data: [], error };
    }
  },

  async updateTrainingMaterial(materialId, updates) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('training_materials')
        .update(updates)
        .eq('id', materialId)
        .select()
        .single();

      if (error) {
        console.error('Error updating training material:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error updating training material:', error);
      return { data: null, error };
    }
  },

  // Conversation operations
  async createConversation(conversationData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .insert(conversationData)
        .select()
        .single();

      if (error) {
        console.error('Error creating conversation:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating conversation:', error);
      return { data: null, error };
    }
  },

  async getConversation(conversationId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error) {
        console.error('Error fetching conversation:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching conversation:', error);
      return { data: null, error };
    }
  },

  async getConversationsByStudent(studentId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('user_id', studentId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
        return { data: [], error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching conversations:', error);
      return { data: [], error };
    }
  },

  async updateConversationLastMessage(conversationId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { error } = await supabaseAdmin
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) {
        console.error('Error updating conversation last message time:', error);
        return { success: false, error };
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('Unexpected error updating conversation:', error);
      return { success: false, error };
    }
  },

  async deleteConversation(conversationId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { error } = await supabaseAdmin
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) {
        console.error('Error deleting conversation:', error);
        return { success: false, error };
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('Unexpected error deleting conversation:', error);
      return { success: false, error };
    }
  },

  // Message operations
  async createMessage(messageData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating message:', error);
      return { data: null, error };
    }
  },

  async getMessagesByConversation(conversationId, limit = 50) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching messages:', error);
        return { data: [], error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching messages:', error);
      return { data: [], error };
    }
  },

  // Student Profile operations
  async createStudentProfile(profileData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('student_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        console.error('Error creating student profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating student profile:', error);
      return { data: null, error };
    }
  },

  async getStudentProfile(studentId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('student_profiles')
        .select('*')
        .eq('id', studentId)
        .single();

      if (error) {
        console.error('Error fetching student profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching student profile:', error);
      return { data: null, error };
    }
  },

  async updateStudentProfile(studentId, updates) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('student_profiles')
        .update(updates)
        .eq('id', studentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating student profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error updating student profile:', error);
      return { data: null, error };
    }
  },

  // Voice Profile operations
  async createVoiceProfile(profileData) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        console.error('Error creating voice profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error creating voice profile:', error);
      return { data: null, error };
    }
  },

  async getVoiceProfilesByTwin(twinId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .select('*')
        .eq('twin_id', twinId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching voice profiles:', error);
        return { data: [], error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching voice profiles:', error);
      return { data: [], error };
    }
  },

  async updateVoiceProfile(profileId, updates) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .single();

      if (error) {
        console.error('Error updating voice profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error updating voice profile:', error);
      return { data: null, error };
    }
  },

  async getVoiceProfile(profileId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { data, error } = await supabaseAdmin
        .from('voice_profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (error) {
        console.error('Error fetching voice profile:', error);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error fetching voice profile:', error);
      return { data: null, error };
    }
  },

  async deleteVoiceProfile(profileId) {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const { error } = await supabaseAdmin
        .from('voice_profiles')
        .delete()
        .eq('id', profileId);

      if (error) {
        console.error('Error deleting voice profile:', error);
        return { success: false, error };
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('Unexpected error deleting voice profile:', error);
      return { success: false, error };
    }
  },

  // Utility functions
  async healthCheck() {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    const startTime = Date.now();

    try {
      // Test basic connectivity with a simple query
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('count', { count: 'exact', head: true });

      if (error) {
        console.error('Database health check failed:', error);
        return { healthy: false, error, responseTime: Date.now() - startTime };
      }

      const responseTime = Date.now() - startTime;

      // Additional performance checks
      const performanceChecks = await Promise.allSettled([
        // Test digital twins query performance
        supabaseAdmin
          .from('digital_twins')
          .select('id', { count: 'exact', head: true }),

        // Test conversations query performance
        supabaseAdmin
          .from('conversations')
          .select('id', { count: 'exact', head: true }),

        // Test messages query performance
        supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
      ]);

      const performance = {
        responseTime,
        tables: {
          profiles: { status: 'healthy' },
          digital_twins: performanceChecks[0].status === 'fulfilled' ? { status: 'healthy' } : { status: 'error', error: performanceChecks[0].reason },
          conversations: performanceChecks[1].status === 'fulfilled' ? { status: 'healthy' } : { status: 'error', error: performanceChecks[1].reason },
          messages: performanceChecks[2].status === 'fulfilled' ? { status: 'healthy' } : { status: 'error', error: performanceChecks[2].reason }
        },
        timestamp: new Date().toISOString()
      };

      return {
        healthy: true,
        error: null,
        performance,
        connectionPool: {
          status: 'active',
          headers: { 'x-connection-pool': 'server' }
        }
      };
    } catch (error) {
      console.error('Database health check error:', error);
      return {
        healthy: false,
        error,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  },

  // Performance monitoring
  async getPerformanceStats() {
    const dbCheck = checkDbAvailable();
    if (dbCheck) return dbCheck;

    try {
      const startTime = Date.now();

      // Get table sizes and row counts
      const tableStats = await Promise.allSettled([
        supabaseAdmin.from('digital_twins').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
      ]);

      const responseTime = Date.now() - startTime;

      return {
        data: {
          responseTime,
          tables: {
            digital_twins: tableStats[0].status === 'fulfilled' ? tableStats[0].value : { count: 0, error: tableStats[0].reason },
            conversations: tableStats[1].status === 'fulfilled' ? tableStats[1].value : { count: 0, error: tableStats[1].reason },
            messages: tableStats[2].status === 'fulfilled' ? tableStats[2].value : { count: 0, error: tableStats[2].reason },
            profiles: tableStats[3].status === 'fulfilled' ? tableStats[3].value : { count: 0, error: tableStats[3].reason }
          },
          timestamp: new Date().toISOString()
        },
        error: null
      };
    } catch (error) {
      console.error('Performance stats error:', error);
      return { data: null, error };
    }
  }
};