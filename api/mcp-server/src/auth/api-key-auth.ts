/**
 * API Key Authentication for TwinMe MCP Server
 *
 * Validates API keys and maps them to user IDs.
 * API key format: twm_<24-byte-base64url>
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

interface ApiKeyValidation {
  success: boolean;
  userId?: string;
  error?: string;
}

interface ApiKeyRecord {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
}

export class ApiKeyAuth {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate a new API key for a user
   */
  async generateApiKey(userId: string, name: string = 'MCP Server Key'): Promise<{ key: string; id: string }> {
    // Generate 24 random bytes and encode as base64url
    const randomBytes = crypto.randomBytes(24);
    const keyValue = randomBytes.toString('base64url');
    const fullKey = `twm_${keyValue}`;

    // Hash the key for storage (we never store the raw key)
    const keyHash = this.hashKey(fullKey);

    // Store in database
    const { data, error } = await this.supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        key_hash: keyHash,
        name: name,
        is_active: true
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    return { key: fullKey, id: data.id };
  }

  /**
   * Validate an API key and return the associated user ID
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidation> {
    // Check format
    if (!apiKey || !apiKey.startsWith('twm_')) {
      return { success: false, error: 'Invalid API key format' };
    }

    // Hash the provided key
    const keyHash = this.hashKey(apiKey);

    // Look up in database
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, user_id, is_active, expires_at')
      .eq('key_hash', keyHash)
      .single();

    if (error || !data) {
      return { success: false, error: 'Invalid API key' };
    }

    // Check if active
    if (!data.is_active) {
      return { success: false, error: 'API key is deactivated' };
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { success: false, error: 'API key has expired' };
    }

    // Update last_used_at
    await this.supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return { success: true, userId: data.user_id };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', userId);

    return !error;
  }

  /**
   * List all API keys for a user (without the actual key values)
   */
  async listApiKeys(userId: string): Promise<Array<{
    id: string;
    name: string;
    is_active: boolean;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
  }>> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, name, is_active, created_at, last_used_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list API keys: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Hash an API key for secure storage
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

// Singleton instance
let authInstance: ApiKeyAuth | null = null;

export function getApiKeyAuth(): ApiKeyAuth {
  if (!authInstance) {
    authInstance = new ApiKeyAuth();
  }
  return authInstance;
}

/**
 * Middleware-style function to validate API key from environment or request
 */
export async function authenticateRequest(apiKey?: string): Promise<ApiKeyValidation> {
  const key = apiKey || process.env.TWINME_API_KEY;

  if (!key) {
    return {
      success: false,
      error: 'No API key provided. Set TWINME_API_KEY environment variable or pass api_key parameter.'
    };
  }

  const auth = getApiKeyAuth();
  return auth.validateApiKey(key);
}
