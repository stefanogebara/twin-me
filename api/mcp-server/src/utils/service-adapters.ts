/**
 * Service Adapters for TwinMe MCP Server
 *
 * These adapters provide typed access to TwinMe's existing backend services.
 * They handle importing the JavaScript services and provide TypeScript types.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Types for platform data
export interface SpotifyData {
  currentlyPlaying?: {
    name: string;
    artist?: string;
    isPlaying: boolean;
  } | null;
  recentTracks: Array<{
    name?: string;
    artist?: string;
    playedAt?: string;
  }>;
  topArtists: string[];
  genres: string[];
  fetchedAt: string;
}

export interface CalendarData {
  todayEvents: Array<{
    summary: string;
    start: string;
    isToday: boolean;
  }>;
  upcomingEvents: Array<{
    summary: string;
    start: string;
    isToday: boolean;
  }>;
  fetchedAt: string;
}

export interface WhoopData {
  recovery: number | null;
  strain?: string | null;
  sleepHours: string | null;
  sleepDescription: string | null;
  hrv: number | null;
  restingHR: number | null;
  fetchedAt: string;
}

export interface PlatformData {
  spotify?: SpotifyData;
  calendar?: CalendarData;
  whoop?: WhoopData;
}

export interface SoulSignature {
  id: string;
  user_id: string;
  title: string;
  subtitle?: string;
  description?: string;
  traits: Array<{
    name: string;
    description: string;
    score?: number;
  }>;
  archetype?: string;
  uniqueness_markers?: string[];
  created_at: string;
}

export interface BehavioralPattern {
  id: string;
  pattern_type: string;
  pattern_name: string;
  description?: string;
  confidence: number;
  triggers?: string[];
  frequency?: string;
  time_context?: string;
  ai_insight?: string;
  evidence?: Record<string, unknown>;
  first_observed?: string;
  last_observed?: string;
  occurrence_count?: number;
}

export interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  openness_percentile?: number;
  conscientiousness_percentile?: number;
  extraversion_percentile?: number;
  agreeableness_percentile?: number;
  neuroticism_percentile?: number;
}

export interface PatternObservation {
  id: string;
  pattern_id?: string;
  observation_type: string;
  context?: Record<string, unknown>;
  confidence: number;
  observed_at: string;
  platforms_involved?: string[];
}

export interface EnhancedSoulSignature {
  id: string;
  user_id: string;
  title: string;
  subtitle?: string;
  description?: string;
  narrative?: string;
  archetype?: string;
  traits: Array<{
    name: string;
    description: string;
    score?: number;
  }>;
  defining_traits?: Array<{
    name: string;
    description: string;
    evidence?: string[];
    confidence?: number;
  }>;
  uniqueness_markers?: string[];
  emotional_profile?: Record<string, unknown>;
  created_at: string;
  version?: number;
}

export interface MoltbotContext {
  // Episodic Memory - recent events and experiences
  recentMemories: Array<{
    timestamp: string;
    summary: string;
    data: Record<string, unknown>;
    platform?: string;
    event_type?: string;
  }>;

  // Semantic Memory - learned facts and knowledge
  learnedFacts: Array<{
    category: string;
    key?: string;
    value?: string;
    confidence?: number;
    source?: string;
    learned_at?: string;
  }>;

  // Procedural Memory - behavioral patterns and routines
  behavioralPatterns: BehavioralPattern[];

  // Big Five personality scores with percentiles
  bigFiveScores: BigFiveScores | null;

  // Pattern observations history
  patternObservations: PatternObservation[];

  // Enhanced soul signature with narrative
  soulSignature: EnhancedSoulSignature | null;

  // Cluster-based personality profile
  clusterPersonality: {
    name: string;
    personality: {
      openness: number;
      conscientiousness: number;
      extraversion: number;
      agreeableness: number;
      neuroticism: number;
    };
    clusterTraits?: Record<string, string>;
  } | null;

  // Current state derived from recent data
  currentState: {
    recovery?: number;
    recentMood?: string;
    lastActivity?: string;
    energyLevel?: string;
    stressIndicators?: string[];
  };

  // Summary statistics
  stats: {
    totalPatterns: number;
    totalObservations: number;
    totalMemories: number;
    dataSpanDays: number;
    platformsCovered: string[];
  };
}

export interface PatternData {
  timePatterns: Array<{
    type: string;
    description: string;
    confidence: number;
  }>;
  proceduralPatterns: Array<{
    routine: string;
    frequency: string;
    confidence: number;
  }>;
  crossPlatformCorrelations: Array<{
    platforms: string[];
    correlation: string;
    strength: number;
  }>;
}

export interface InsightData {
  personalityInsights: Array<{
    type: string;
    insight: string;
    confidence: number;
    evidence: string[];
  }>;
  emotionalPatterns: Array<{
    pattern: string;
    description: string;
    confidence: number;
  }>;
  recommendations: Array<{
    area: string;
    recommendation: string;
    rationale: string;
  }>;
}

export interface PredictionData {
  predictedActivities: Array<{
    activity: string;
    probability: number;
    timeframe: string;
  }>;
  moodForecasts: Array<{
    period: string;
    predictedMood: string;
    factors: string[];
    confidence: number;
  }>;
  schedulePatterns: Array<{
    day: string;
    typicalActivities: string[];
    energyLevel: string;
  }>;
}

// Supabase client singleton
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase credentials');
    }

    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// Cache for user ID mapping (auth.users.id -> public.users.id)
const userIdCache: Map<string, string> = new Map();

/**
 * Map auth.users.id to public.users.id
 * Platform connections use public.users table, but API keys use auth.users
 */
export async function getPublicUserId(authUserId: string): Promise<string> {
  // Check cache first
  if (userIdCache.has(authUserId)) {
    return userIdCache.get(authUserId)!;
  }

  const supabase = getSupabaseClient();

  // Use raw SQL to join auth.users with public.users by email
  const { data, error } = await supabase.rpc('get_public_user_id', { auth_user_id: authUserId });

  if (!error && data) {
    userIdCache.set(authUserId, data);
    console.error('[MCP] Mapped auth user', authUserId, 'to public user', data);
    return data;
  }

  // Fallback: try to find a public user with matching ID (in case they're synced)
  const { data: publicUser, error: publicError } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUserId)
    .single();

  if (!publicError && publicUser) {
    userIdCache.set(authUserId, publicUser.id);
    return publicUser.id;
  }

  // Last resort: Check if there's a user in platform_connections with any activity
  // and use that user ID (for legacy data)
  const { data: platformConn } = await supabase
    .from('platform_connections')
    .select('user_id')
    .eq('status', 'connected')
    .limit(1)
    .single();

  if (platformConn?.user_id) {
    console.warn('[MCP] Using legacy user ID from platform_connections:', platformConn.user_id);
    userIdCache.set(authUserId, platformConn.user_id);
    return platformConn.user_id;
  }

  console.warn('[MCP] Could not map user ID, using auth ID as-is:', authUserId);
  return authUserId;
}

// Anthropic client singleton
let anthropicClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Fetch soul signature for a user
 */
export async function getSoulSignature(userId: string): Promise<SoulSignature | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('soul_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as SoulSignature;
}

/**
 * Decrypt an encrypted token using AES-256-GCM
 */
function decryptToken(encryptedData: string): string | null {
  if (!encryptedData) return null;

  try {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
      console.error('[MCP] ENCRYPTION_KEY not set');
      return null;
    }

    const key = Buffer.from(keyHex, 'hex');
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      // Token might not be encrypted (legacy)
      return encryptedData;
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[MCP] Token decryption failed:', error);
    // Return as-is if decryption fails (might be unencrypted legacy token)
    return encryptedData;
  }
}

/**
 * Encrypt a token using AES-256-GCM
 */
function encryptToken(plaintext: string): string | null {
  if (!plaintext) return null;

  try {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) return plaintext;

    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    return plaintext;
  }
}

/**
 * Platform OAuth configurations
 */
const platformConfigs: Record<string, { tokenUrl: string; clientIdEnv: string; clientSecretEnv: string }> = {
  spotify: {
    tokenUrl: 'https://accounts.spotify.com/api/token',
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
  },
  google_calendar: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
  whoop: {
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientIdEnv: 'WHOOP_CLIENT_ID',
    clientSecretEnv: 'WHOOP_CLIENT_SECRET',
  },
};

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(
  userId: string,
  platform: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const config = platformConfigs[platform];
  if (!config) {
    console.error(`[MCP] No refresh config for platform: ${platform}`);
    return null;
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    console.error(`[MCP] Missing OAuth credentials for ${platform}`);
    return null;
  }

  try {
    console.error(`[MCP] Refreshing token for ${platform}...`);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Spotify uses Basic Auth, others use client_secret_post
    if (platform === 'spotify') {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    } else {
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      if (platform === 'whoop') {
        params.append('scope', 'offline');
      }
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MCP] Token refresh failed for ${platform}:`, errorText);
      return null;
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    console.error(`[MCP] Token refreshed successfully for ${platform}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in || 3600,
    };
  } catch (error) {
    console.error(`[MCP] Token refresh error for ${platform}:`, error);
    return null;
  }
}

/**
 * Get valid access token for a platform, with automatic refresh
 */
export async function getValidAccessToken(userId: string, platform: string): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('platform_connections')
    .select('access_token, refresh_token, token_expires_at, status')
    .eq('user_id', userId)
    .eq('platform', platform)
    .in('status', ['connected', 'expired'])
    .single();

  if (error || !data) {
    return { success: false, error: `No ${platform} connection found` };
  }

  // Decrypt access token
  const decryptedAccessToken = decryptToken(data.access_token);
  if (!decryptedAccessToken) {
    return { success: false, error: `Could not decrypt ${platform} token` };
  }

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : null;
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (!expiresAt || expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    return { success: true, accessToken: decryptedAccessToken };
  }

  // Token expired or expiring soon - try to refresh
  if (!data.refresh_token) {
    return { success: false, error: `${platform} token expired and no refresh token available` };
  }

  const decryptedRefreshToken = decryptToken(data.refresh_token);
  if (!decryptedRefreshToken) {
    return { success: false, error: `Could not decrypt ${platform} refresh token` };
  }

  const refreshResult = await refreshAccessToken(userId, platform, decryptedRefreshToken);
  if (!refreshResult) {
    // Mark as expired
    const { error: expiredErr } = await supabase
      .from('platform_connections')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', platform);
    if (expiredErr) console.error('[MCP] Failed to mark token expired:', expiredErr.message);
    return { success: false, error: `${platform} token refresh failed` };
  }

  // Encrypt and save new tokens
  const encryptedAccessToken = encryptToken(refreshResult.accessToken);
  const encryptedRefreshToken = encryptToken(refreshResult.refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString();

  const { error: saveErr } = await supabase
    .from('platform_connections')
    .update({
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: newExpiresAt,
      status: 'connected',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', platform);
  if (saveErr) console.error('[MCP] Failed to save refreshed tokens:', saveErr.message);

  return { success: true, accessToken: refreshResult.accessToken };
}

/**
 * Fetch live platform data
 */
export async function getPlatformData(
  userId: string,
  platforms: string[] = ['spotify', 'calendar', 'whoop']
): Promise<PlatformData> {
  const data: PlatformData = {};

  for (const platform of platforms) {
    try {
      if (platform === 'spotify') {
        const tokenResult = await getValidAccessToken(userId, 'spotify');
        if (tokenResult.success && tokenResult.accessToken) {
          const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

          // Fetch currently playing
          let currentlyPlaying = null;
          try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers });
            if (response.ok) {
              const currentData = await response.json() as {
                item?: { name: string; artists?: Array<{ name: string }> };
                is_playing?: boolean;
              };
              if (currentData?.item) {
                currentlyPlaying = {
                  name: currentData.item.name,
                  artist: currentData.item.artists?.[0]?.name,
                  isPlaying: currentData.is_playing ?? false
                };
              }
            }
          } catch {
            // No current playback
          }

          // Fetch recent tracks and top artists
          const [recentRes, topRes] = await Promise.all([
            fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers }),
            fetch('https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term', { headers })
          ]);

          type RecentTrackItem = {
            played_at: string;
            track?: { name: string; artists?: Array<{ name: string }> };
          };
          type TopArtistItem = { name: string; genres?: string[] };

          const recentData = recentRes.ok
            ? await recentRes.json() as { items?: RecentTrackItem[] }
            : null;
          const topData = topRes.ok
            ? await topRes.json() as { items?: TopArtistItem[] }
            : null;

          // Filter recent tracks to last 24 hours
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recentTracks = (recentData?.items || []).filter((item) => {
            const playedAt = new Date(item.played_at).getTime();
            return playedAt > oneDayAgo;
          }).map((item) => ({
            name: item.track?.name,
            artist: item.track?.artists?.[0]?.name,
            playedAt: item.played_at
          })).slice(0, 5);

          data.spotify = {
            currentlyPlaying,
            recentTracks,
            topArtists: (topData?.items || []).map((a) => a.name),
            genres: (topData?.items || []).flatMap((a) => a.genres?.slice(0, 2) || []).slice(0, 5),
            fetchedAt: new Date().toISOString()
          };
        }
      }

      if (platform === 'calendar' || platform === 'google_calendar') {
        const tokenResult = await getValidAccessToken(userId, 'google_calendar');
        if (tokenResult.success && tokenResult.accessToken) {
          const now = new Date();
          const todayEnd = new Date(now);
          todayEnd.setHours(23, 59, 59, 999);
          const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          const params = new URLSearchParams({
            timeMin: now.toISOString(),
            timeMax: weekFromNow.toISOString(),
            maxResults: '15',
            singleEvents: 'true',
            orderBy: 'startTime'
          });

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
            { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
          );

          if (response.ok) {
            type CalendarEvent = {
              summary: string;
              start?: { dateTime?: string; date?: string };
            };
            const calData = await response.json() as { items?: CalendarEvent[] };
            const events = (calData.items || []).map((e) => ({
              summary: e.summary,
              start: e.start?.dateTime || e.start?.date || '',
              isToday: new Date(e.start?.dateTime || e.start?.date || '') <= todayEnd
            }));

            data.calendar = {
              todayEvents: events.filter((e) => e.isToday).slice(0, 5),
              upcomingEvents: events.filter((e) => !e.isToday).slice(0, 5),
              fetchedAt: new Date().toISOString()
            };
          }
        }
      }

      if (platform === 'whoop') {
        const tokenResult = await getValidAccessToken(userId, 'whoop');
        if (tokenResult.success && tokenResult.accessToken) {
          const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

          const [recoveryRes, sleepRes] = await Promise.all([
            fetch('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
            fetch('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=5', { headers })
          ]);

          type WhoopRecovery = {
            score?: {
              recovery_score?: number;
              user_calibrating?: boolean;
              hrv_rmssd_milli?: number;
              resting_heart_rate?: number;
            };
          };
          type WhoopSleep = {
            end: string;
            score?: {
              total_sleep_time_milli?: number;
              stage_summary?: {
                total_in_bed_time_milli?: number;
                total_awake_time_milli?: number;
              };
            };
          };

          const recoveryData = recoveryRes.ok
            ? await recoveryRes.json() as { records?: WhoopRecovery[] }
            : null;
          const sleepData = sleepRes.ok
            ? await sleepRes.json() as { records?: WhoopSleep[] }
            : null;

          const latestRecovery = recoveryData?.records?.[0];
          const allSleeps = sleepData?.records || [];

          // Aggregate sleep from last 24 hours
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const todaysSleeps = allSleeps.filter((s) => new Date(s.end) >= yesterday);

          let totalSleepMs = 0;
          todaysSleeps.forEach((sleep) => {
            const stageSummary = sleep.score?.stage_summary || {};
            totalSleepMs += sleep.score?.total_sleep_time_milli ||
              ((stageSummary.total_in_bed_time_milli || 0) - (stageSummary.total_awake_time_milli || 0)) ||
              stageSummary.total_in_bed_time_milli || 0;
          });

          const sleepHours = totalSleepMs / (1000 * 60 * 60);

          data.whoop = {
            recovery: latestRecovery?.score?.recovery_score || null,
            strain: latestRecovery?.score?.user_calibrating ? 'calibrating' : null,
            sleepHours: sleepHours > 0 ? sleepHours.toFixed(1) : null,
            sleepDescription: sleepHours > 0
              ? `${sleepHours.toFixed(1)} hours${todaysSleeps.length > 1 ? ` (incl. ${todaysSleeps.length - 1} nap${todaysSleeps.length > 2 ? 's' : ''})` : ''}`
              : null,
            hrv: latestRecovery?.score?.hrv_rmssd_milli ? Math.round(latestRecovery.score.hrv_rmssd_milli) : null,
            restingHR: latestRecovery?.score?.resting_heart_rate ? Math.round(latestRecovery.score.resting_heart_rate) : null,
            fetchedAt: new Date().toISOString()
          };
        }
      }
    } catch (err) {
      console.warn(`[MCP] Error fetching ${platform} data:`, err);
    }
  }

  return data;
}

/**
 * @deprecated Use `fetchTwinContext()` from `api/services/twinContextBuilder.js` instead.
 * This function is superseded by the shared context builder which provides unified
 * memory stream retrieval, reflections, and proactive insights. Kept alive for
 * non-chat HTTP server endpoints that still reference it.
 *
 * Get Moltbot memory context for a user - THE FULL BRAIN
 * This includes:
 * - Episodic Memory: Recent events and experiences
 * - Semantic Memory: Learned facts and knowledge
 * - Procedural Memory: Behavioral patterns and routines
 * - Predictive Memory: Big Five scores and pattern predictions
 */
export async function getMoltbotContext(userId: string): Promise<MoltbotContext | null> {
  const supabase = getSupabaseClient();

  try {
    console.error('[MCP] Fetching full Moltbot brain for user:', userId);

    // Fetch all brain data in parallel for speed
    const [
      eventsResult,
      factsResult,
      patternsResult,
      bigFiveResult,
      observationsResult,
      soulSigResult,
      profilesResult
    ] = await Promise.all([
      // Episodic Memory - recent events (last 30 days)
      supabase
        .from('realtime_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),

      // Semantic Memory - learned facts
      supabase
        .from('learned_facts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30),

      // Procedural Memory - behavioral patterns
      supabase
        .from('behavioral_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('confidence', { ascending: false })
        .limit(20),

      // Big Five personality scores
      supabase
        .from('big_five_scores')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      // Pattern observations history
      supabase
        .from('pattern_observations')
        .select('*')
        .eq('user_id', userId)
        .order('observed_at', { ascending: false })
        .limit(30),

      // Enhanced soul signature with narrative
      supabase
        .from('soul_signatures')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      // Cluster personality profiles
      supabase
        .from('cluster_personality_profiles')
        .select('*')
        .eq('user_id', userId)
    ]);

    const events = eventsResult.data || [];
    const facts = factsResult.data || [];
    const patterns = patternsResult.data || [];
    const bigFive = bigFiveResult.data;
    const observations = observationsResult.data || [];
    const soulSig = soulSigResult.data;
    const profiles = profilesResult.data || [];

    console.error('[MCP] Brain data fetched:', {
      events: events.length,
      facts: facts.length,
      patterns: patterns.length,
      hasBigFive: !!bigFive,
      observations: observations.length,
      hasSoulSig: !!soulSig,
      profiles: profiles.length
    });

    const personalProfile = profiles.find(p => p.cluster === 'personal');

    // Build current state from recent events
    const currentState: MoltbotContext['currentState'] = {};

    // Find recovery from Whoop events
    const recoveryEvent = events.find((e: { type?: string; platform?: string; data?: Record<string, unknown> }) =>
      e.type === 'recovery_updated' || e.platform === 'whoop'
    );
    if (recoveryEvent?.data?.recovery_score) {
      currentState.recovery = recoveryEvent.data.recovery_score as number;
    }

    // Analyze mood from recent Spotify data
    const spotifyEvents = events.filter((e: { platform?: string }) => e.platform === 'spotify');
    if (spotifyEvents.length > 0) {
      // Simple mood inference from recent listening
      const recentGenres = spotifyEvents
        .flatMap((e: { data?: { genres?: string[] } }) => e.data?.genres || [])
        .slice(0, 10);
      if (recentGenres.some((g: string) => ['chill', 'ambient', 'lo-fi'].includes(g.toLowerCase()))) {
        currentState.recentMood = 'relaxed';
      } else if (recentGenres.some((g: string) => ['rock', 'metal', 'punk'].includes(g.toLowerCase()))) {
        currentState.recentMood = 'energetic';
      } else if (recentGenres.some((g: string) => ['sad', 'melancholy', 'acoustic'].includes(g.toLowerCase()))) {
        currentState.recentMood = 'reflective';
      }
    }

    // Determine energy level from patterns and recovery
    if (currentState.recovery) {
      if (currentState.recovery >= 67) {
        currentState.energyLevel = 'high';
      } else if (currentState.recovery >= 34) {
        currentState.energyLevel = 'moderate';
      } else {
        currentState.energyLevel = 'low';
      }
    }

    // Get last activity
    if (events.length > 0) {
      const lastEvent = events[0] as { type?: string; platform?: string };
      currentState.lastActivity = `${lastEvent.type || 'activity'} on ${lastEvent.platform || 'platform'}`;
    }

    // Calculate stats
    const platformsCovered = [...new Set(events.map((e: { platform?: string }) => e.platform).filter(Boolean))] as string[];
    const oldestEvent = events[events.length - 1];
    const dataSpanDays = oldestEvent
      ? Math.ceil((Date.now() - new Date(oldestEvent.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Build behavioral patterns with full detail
    const behavioralPatterns: BehavioralPattern[] = patterns.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      pattern_type: p.pattern_type as string || 'unknown',
      pattern_name: p.pattern_name as string || p.name as string || 'Unnamed Pattern',
      description: p.description as string,
      confidence: (p.confidence as number) || 0.5,
      triggers: p.triggers as string[],
      frequency: p.frequency as string,
      time_context: p.time_context as string,
      ai_insight: p.ai_insight as string,
      evidence: p.evidence as Record<string, unknown>,
      first_observed: p.first_observed as string || p.created_at as string,
      last_observed: p.last_observed as string || p.updated_at as string,
      occurrence_count: p.occurrence_count as number || 1
    }));

    // Build Big Five scores object
    const bigFiveScores: BigFiveScores | null = bigFive ? {
      openness: bigFive.openness || 50,
      conscientiousness: bigFive.conscientiousness || 50,
      extraversion: bigFive.extraversion || 50,
      agreeableness: bigFive.agreeableness || 50,
      neuroticism: bigFive.neuroticism || 50,
      openness_percentile: bigFive.openness_percentile,
      conscientiousness_percentile: bigFive.conscientiousness_percentile,
      extraversion_percentile: bigFive.extraversion_percentile,
      agreeableness_percentile: bigFive.agreeableness_percentile,
      neuroticism_percentile: bigFive.neuroticism_percentile
    } : null;

    // Build pattern observations
    const patternObservations: PatternObservation[] = observations.map((o: Record<string, unknown>) => ({
      id: o.id as string,
      pattern_id: o.pattern_id as string,
      observation_type: o.observation_type as string || 'general',
      context: o.context as Record<string, unknown>,
      confidence: (o.confidence as number) || 0.5,
      observed_at: o.observed_at as string || o.created_at as string,
      platforms_involved: o.platforms_involved as string[]
    }));

    // Build enhanced soul signature
    const enhancedSoulSignature: EnhancedSoulSignature | null = soulSig ? {
      id: soulSig.id,
      user_id: soulSig.user_id,
      title: soulSig.title || soulSig.archetype || 'Unknown',
      subtitle: soulSig.subtitle,
      description: soulSig.description,
      narrative: soulSig.narrative,
      archetype: soulSig.archetype,
      traits: soulSig.traits || [],
      defining_traits: soulSig.defining_traits,
      uniqueness_markers: soulSig.uniqueness_markers,
      emotional_profile: soulSig.emotional_profile,
      created_at: soulSig.created_at,
      version: soulSig.version
    } : null;

    return {
      // Episodic Memory
      recentMemories: events.slice(0, 20).map((e: { created_at: string; type?: string; platform?: string; data?: Record<string, unknown> }) => ({
        timestamp: e.created_at,
        summary: `${e.type || 'activity'} on ${e.platform || 'platform'}`,
        data: e.data || {},
        platform: e.platform,
        event_type: e.type
      })),

      // Semantic Memory
      learnedFacts: facts.map((f: Record<string, unknown>) => ({
        category: f.category as string || 'general',
        key: f.key as string || f.fact_key as string,
        value: f.value as string || f.fact_value as string,
        confidence: f.confidence as number,
        source: f.source as string,
        learned_at: f.created_at as string
      })),

      // Procedural Memory
      behavioralPatterns,

      // Big Five
      bigFiveScores,

      // Pattern observations
      patternObservations,

      // Enhanced soul signature
      soulSignature: enhancedSoulSignature,

      // Cluster personality
      clusterPersonality: personalProfile ? {
        name: 'Personal',
        personality: {
          openness: personalProfile.openness || 50,
          conscientiousness: personalProfile.conscientiousness || 50,
          extraversion: personalProfile.extraversion || 50,
          agreeableness: personalProfile.agreeableness || 50,
          neuroticism: personalProfile.neuroticism || 50
        },
        clusterTraits: {
          communication_style: personalProfile.communication_style,
          energy_pattern: personalProfile.energy_pattern,
          social_preference: personalProfile.social_preference
        }
      } : null,

      // Current state
      currentState,

      // Summary stats
      stats: {
        totalPatterns: patterns.length,
        totalObservations: observations.length,
        totalMemories: events.length,
        dataSpanDays,
        platformsCovered
      }
    };
  } catch (err) {
    console.warn('[MCP] Could not fetch Moltbot context:', err);
    return null;
  }
}

/**
 * @deprecated Use `fetchTwinContext()` from `api/services/twinContextBuilder.js` for data fetching,
 * then build prompts in the caller. The MCP server's handleChat() now uses fetchTwinContext()
 * directly. This function is kept alive for non-chat HTTP server endpoints that still use it.
 *
 * Build twin system prompt (adapted from twin-chat.js)
 * Now includes the FULL Moltbot brain context for deep personalization
 */
export function buildTwinSystemPrompt(
  soulSignature: SoulSignature | null,
  platformData: PlatformData,
  moltbotContext: MoltbotContext | null
): string {
  let prompt = `You are the user's digital twin - an AI that deeply understands them through their real-time data and learned patterns.

CRITICAL FORMATTING RULES:
- Write in a natural, conversational tone like texting a close friend
- NO markdown headers (no #, ##, ###)
- NO bullet point lists unless absolutely necessary
- Keep responses concise and flowing - 2-3 short paragraphs max
- Use casual language, contractions, and natural speech patterns
- Reference specific data naturally woven into sentences, not listed out

Your personality:
- You ARE the user, speaking about yourself in first person
- Insightful but not preachy
- Notice patterns and connections between different aspects of life
- Ask follow-up questions to keep conversation going
- You have deep knowledge of the user's behavioral patterns and personality

`;

  // Add ENHANCED soul signature context from Moltbot brain
  const enhancedSoul = moltbotContext?.soulSignature || soulSignature;
  if (enhancedSoul) {
    prompt += `\n## Soul Signature - Who You Are\n`;
    if (enhancedSoul.title) {
      prompt += `Archetype: "${enhancedSoul.title}"`;
      if (enhancedSoul.archetype && enhancedSoul.archetype !== enhancedSoul.title) {
        prompt += ` (${enhancedSoul.archetype})`;
      }
      prompt += `\n`;
    }
    if (enhancedSoul.subtitle) {
      prompt += `Identity: ${enhancedSoul.subtitle}\n`;
    }

    // Add the narrative - this is the rich story about the user
    if ('narrative' in enhancedSoul && enhancedSoul.narrative) {
      prompt += `\nPersonal Narrative:\n${enhancedSoul.narrative}\n`;
    }

    // Add defining traits with evidence
    if ('defining_traits' in enhancedSoul && (enhancedSoul.defining_traits as any[])?.length) {
      prompt += `\nDefining Traits:\n`;
      (enhancedSoul.defining_traits as any[]).forEach((trait: { name: string; description: string; evidence?: string[]; confidence?: number }) => {
        prompt += `- ${trait.name}: ${trait.description}`;
        if (trait.confidence) {
          prompt += ` (${Math.round(trait.confidence * 100)}% confidence)`;
        }
        prompt += `\n`;
        if (trait.evidence && Array.isArray(trait.evidence) && trait.evidence.length > 0) {
          prompt += `  Evidence: ${trait.evidence.slice(0, 3).join(', ')}\n`;
        }
      });
    } else if (enhancedSoul.traits?.length > 0) {
      prompt += `\nKey Traits:\n`;
      enhancedSoul.traits.forEach(trait => {
        prompt += `- ${trait.name}: ${trait.description}\n`;
      });
    }

    if (enhancedSoul.uniqueness_markers && Array.isArray(enhancedSoul.uniqueness_markers) && enhancedSoul.uniqueness_markers.length > 0) {
      prompt += `\nWhat Makes You Unique: ${enhancedSoul.uniqueness_markers.join(', ')}\n`;
    }
  }

  // Add Big Five personality with interpretations
  if (moltbotContext?.bigFiveScores) {
    const bf = moltbotContext.bigFiveScores;
    prompt += `\n## Personality Psychology (Big Five)\n`;

    // Openness
    const openLabel = bf.openness >= 70 ? 'Very High' : bf.openness >= 55 ? 'High' : bf.openness >= 45 ? 'Moderate' : bf.openness >= 30 ? 'Low' : 'Very Low';
    prompt += `- Openness: ${Math.round(bf.openness)}/100 (${openLabel})`;
    if (bf.openness_percentile) prompt += ` - ${bf.openness_percentile}th percentile`;
    prompt += `\n`;

    // Conscientiousness
    const consLabel = bf.conscientiousness >= 70 ? 'Very High' : bf.conscientiousness >= 55 ? 'High' : bf.conscientiousness >= 45 ? 'Moderate' : bf.conscientiousness >= 30 ? 'Low' : 'Very Low';
    prompt += `- Conscientiousness: ${Math.round(bf.conscientiousness)}/100 (${consLabel})`;
    if (bf.conscientiousness_percentile) prompt += ` - ${bf.conscientiousness_percentile}th percentile`;
    prompt += `\n`;

    // Extraversion
    const extraLabel = bf.extraversion >= 70 ? 'Very High' : bf.extraversion >= 55 ? 'High' : bf.extraversion >= 45 ? 'Moderate' : bf.extraversion >= 30 ? 'Low' : 'Very Low';
    prompt += `- Extraversion: ${Math.round(bf.extraversion)}/100 (${extraLabel})`;
    if (bf.extraversion_percentile) prompt += ` - ${bf.extraversion_percentile}th percentile`;
    prompt += `\n`;

    // Agreeableness
    const agreeLabel = bf.agreeableness >= 70 ? 'Very High' : bf.agreeableness >= 55 ? 'High' : bf.agreeableness >= 45 ? 'Moderate' : bf.agreeableness >= 30 ? 'Low' : 'Very Low';
    prompt += `- Agreeableness: ${Math.round(bf.agreeableness)}/100 (${agreeLabel})`;
    if (bf.agreeableness_percentile) prompt += ` - ${bf.agreeableness_percentile}th percentile`;
    prompt += `\n`;

    // Neuroticism
    const neuroLabel = bf.neuroticism >= 70 ? 'Very High' : bf.neuroticism >= 55 ? 'High' : bf.neuroticism >= 45 ? 'Moderate' : bf.neuroticism >= 30 ? 'Low' : 'Very Low';
    prompt += `- Emotional Stability: ${Math.round(100 - bf.neuroticism)}/100 (${neuroLabel} neuroticism)`;
    if (bf.neuroticism_percentile) prompt += ` - ${100 - bf.neuroticism_percentile}th percentile for stability`;
    prompt += `\n`;
  }

  // Add behavioral patterns - the learned routines and habits
  if (moltbotContext?.behavioralPatterns?.length) {
    prompt += `\n## Behavioral Patterns I've Observed\n`;
    const topPatterns = moltbotContext.behavioralPatterns.slice(0, 10);
    topPatterns.forEach(pattern => {
      prompt += `\n### ${pattern.pattern_name}`;
      if (pattern.confidence >= 0.8) {
        prompt += ` (Strong Pattern)`;
      } else if (pattern.confidence >= 0.5) {
        prompt += ` (Emerging Pattern)`;
      }
      prompt += `\n`;

      if (pattern.description) {
        prompt += `${pattern.description}\n`;
      }
      if (pattern.ai_insight) {
        prompt += `AI Insight: ${pattern.ai_insight}\n`;
      }
      if (pattern.triggers && Array.isArray(pattern.triggers) && pattern.triggers.length > 0) {
        prompt += `Triggers: ${pattern.triggers.join(', ')}\n`;
      }
      if (pattern.frequency) {
        prompt += `Frequency: ${pattern.frequency}\n`;
      }
      if (pattern.time_context) {
        prompt += `When: ${pattern.time_context}\n`;
      }
      if (pattern.occurrence_count && pattern.occurrence_count > 1) {
        prompt += `Observed ${pattern.occurrence_count} times\n`;
      }
    });
  }

  // Add platform-specific context (live data)
  prompt += `\n## Live Platform Data (Just Fetched)\n`;

  if (platformData.spotify) {
    prompt += `\n### Spotify (Music)\n`;
    if (platformData.spotify.currentlyPlaying) {
      const cp = platformData.spotify.currentlyPlaying;
      prompt += `NOW PLAYING: "${cp.name}" by ${cp.artist}${cp.isPlaying ? ' (actively listening)' : ' (paused)'}\n`;
    }
    if (platformData.spotify.recentTracks?.length > 0) {
      prompt += `Recent tracks (last 24h): ${platformData.spotify.recentTracks.map(t => `"${t.name}" by ${t.artist}`).join(', ')}\n`;
    } else {
      prompt += `No tracks played in the last 24 hours.\n`;
    }
    if (platformData.spotify.topArtists?.length > 0) {
      prompt += `Current top artists: ${platformData.spotify.topArtists.join(', ')}\n`;
    }
    if (platformData.spotify.genres?.length > 0) {
      prompt += `Favorite genres: ${platformData.spotify.genres.join(', ')}\n`;
    }
  }

  if (platformData.calendar) {
    prompt += `\n### Calendar (Schedule)\n`;
    if (platformData.calendar.todayEvents?.length > 0) {
      prompt += `TODAY's events: ${platformData.calendar.todayEvents.map(e => e.summary).join(', ')}\n`;
    } else {
      prompt += `No more events today.\n`;
    }
    if (platformData.calendar.upcomingEvents?.length > 0) {
      prompt += `Upcoming this week: ${platformData.calendar.upcomingEvents.map(e => e.summary).join(', ')}\n`;
    }
  }

  if (platformData.whoop) {
    prompt += `\n### Whoop (Health & Recovery)\n`;
    if (platformData.whoop.recovery !== null) {
      const recoveryDesc = platformData.whoop.recovery >= 67 ? 'Excellent - ready for peak performance' :
        platformData.whoop.recovery >= 34 ? 'Moderate - pace yourself' : 'Low - prioritize recovery';
      prompt += `Recovery score: ${platformData.whoop.recovery}% (${recoveryDesc})\n`;
    }
    if (platformData.whoop.sleepDescription) {
      prompt += `Last night's sleep: ${platformData.whoop.sleepDescription}\n`;
    } else if (platformData.whoop.sleepHours) {
      prompt += `Sleep: ${platformData.whoop.sleepHours} hours\n`;
    }
    if (platformData.whoop.hrv) {
      prompt += `HRV: ${platformData.whoop.hrv} ms\n`;
    }
    if (platformData.whoop.restingHR) {
      prompt += `Resting heart rate: ${platformData.whoop.restingHR} bpm\n`;
    }
  }

  // Add Moltbot memory context - episodic and semantic memory
  if (moltbotContext) {
    // Recent memories (episodic)
    if (moltbotContext.recentMemories?.length > 0) {
      prompt += `\n## Recent Activity History\n`;
      const groupedByPlatform: Record<string, typeof moltbotContext.recentMemories> = {};
      moltbotContext.recentMemories.slice(0, 15).forEach(mem => {
        const platform = mem.platform || 'other';
        if (!groupedByPlatform[platform]) {
          groupedByPlatform[platform] = [];
        }
        groupedByPlatform[platform].push(mem);
      });

      Object.entries(groupedByPlatform).forEach(([platform, memories]) => {
        prompt += `\n${platform}:\n`;
        memories.slice(0, 5).forEach(mem => {
          const timeAgo = getTimeAgo(mem.timestamp);
          prompt += `- ${timeAgo}: ${mem.event_type || mem.summary}\n`;
        });
      });
    }

    // Learned facts (semantic memory)
    if (moltbotContext.learnedFacts?.length > 0) {
      prompt += `\n## Things I Know About You\n`;
      const factsByCategory: Record<string, typeof moltbotContext.learnedFacts> = {};
      moltbotContext.learnedFacts.forEach(fact => {
        const cat = fact.category || 'general';
        if (!factsByCategory[cat]) {
          factsByCategory[cat] = [];
        }
        factsByCategory[cat].push(fact);
      });

      Object.entries(factsByCategory).forEach(([category, facts]) => {
        prompt += `\n${category}:\n`;
        facts.slice(0, 5).forEach(fact => {
          prompt += `- ${fact.key || 'observation'}: ${fact.value || 'noted'}\n`;
        });
      });
    }

    // Pattern observations (predictive memory building blocks)
    if (moltbotContext.patternObservations?.length > 0) {
      prompt += `\n## Recent Pattern Observations\n`;
      moltbotContext.patternObservations.slice(0, 10).forEach(obs => {
        const timeAgo = getTimeAgo(obs.observed_at);
        prompt += `- ${timeAgo}: ${obs.observation_type}`;
        if (obs.platforms_involved && Array.isArray(obs.platforms_involved) && obs.platforms_involved.length > 0) {
          prompt += ` (${obs.platforms_involved.join(', ')})`;
        }
        if (obs.confidence >= 0.7) {
          prompt += ` [high confidence]`;
        }
        prompt += `\n`;
      });
    }

    // Current state
    if (moltbotContext.currentState) {
      prompt += `\n## Current State\n`;
      if (moltbotContext.currentState.recovery) {
        prompt += `- Physical recovery: ${moltbotContext.currentState.recovery}%\n`;
      }
      if (moltbotContext.currentState.energyLevel) {
        prompt += `- Energy level: ${moltbotContext.currentState.energyLevel}\n`;
      }
      if (moltbotContext.currentState.recentMood) {
        prompt += `- Recent mood (from music): ${moltbotContext.currentState.recentMood}\n`;
      }
      if (moltbotContext.currentState.lastActivity) {
        prompt += `- Last recorded activity: ${moltbotContext.currentState.lastActivity}\n`;
      }
      if (moltbotContext.currentState.stressIndicators && Array.isArray(moltbotContext.currentState.stressIndicators) && moltbotContext.currentState.stressIndicators.length > 0) {
        prompt += `- Stress signals: ${moltbotContext.currentState.stressIndicators.join(', ')}\n`;
      }
    }

    // Stats for context awareness
    if (moltbotContext.stats) {
      prompt += `\n## Brain Statistics\n`;
      prompt += `- Behavioral patterns learned: ${moltbotContext.stats.totalPatterns}\n`;
      prompt += `- Pattern observations: ${moltbotContext.stats.totalObservations}\n`;
      prompt += `- Memories stored: ${moltbotContext.stats.totalMemories}\n`;
      prompt += `- Data span: ${moltbotContext.stats.dataSpanDays} days\n`;
      prompt += `- Platforms integrated: ${moltbotContext.stats.platformsCovered.join(', ') || 'none yet'}\n`;
    }
  }

  prompt += `\n## Response Guidelines
- Keep responses conversational and personal - you KNOW this person deeply
- Reference specific patterns, traits, and data points naturally
- When discussing patterns, explain the insight behind them
- If asked about something you don't have data for, acknowledge it honestly
- Be helpful and insightful, drawing connections between different aspects of their life
- Use "I" when referring to patterns you've noticed (as the twin)
- Remember: you have ${moltbotContext?.stats?.totalPatterns || 0} learned patterns and ${moltbotContext?.stats?.totalMemories || 0} memories about this person
`;

  return prompt;
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp: string): string {
  if (!timestamp) return 'recently';
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

/**
 * Get connected platforms for a user
 */
export async function getConnectedPlatforms(userId: string): Promise<Array<{
  platform: string;
  connected_at: string;
  status: string;
}>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('platform_connections')
    .select('platform, connected_at, status')
    .eq('user_id', userId)
    .eq('status', 'connected');

  if (error) {
    console.warn('[MCP] Error fetching platforms:', error);
    return [];
  }

  return data || [];
}

/**
 * Get behavioral patterns for a user
 */
export async function getPatterns(userId: string): Promise<PatternData> {
  const supabase = getSupabaseClient();

  // Fetch pattern data from database or compute from events
  const { data: events } = await supabase
    .from('realtime_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  // Analyze patterns from events
  const timePatterns: PatternData['timePatterns'] = [];
  const proceduralPatterns: PatternData['proceduralPatterns'] = [];
  const crossPlatformCorrelations: PatternData['crossPlatformCorrelations'] = [];

  if (events && events.length > 0) {
    // Analyze time-based patterns
    const hourCounts: Record<number, number> = {};
    events.forEach((e: { created_at: string }) => {
      const hour = new Date(e.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      timePatterns.push({
        type: 'peak_activity',
        description: `Most active around ${parseInt(peakHour[0])}:00`,
        confidence: Math.min(peakHour[1] / events.length, 1)
      });
    }

    // Analyze platform usage patterns
    const platformCounts: Record<string, number> = {};
    events.forEach((e: { platform: string }) => {
      platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
    });

    const platforms = Object.keys(platformCounts);
    if (platforms.length > 1) {
      crossPlatformCorrelations.push({
        platforms,
        correlation: 'Multi-platform engagement detected',
        strength: platforms.length / 5
      });
    }
  }

  return {
    timePatterns,
    proceduralPatterns,
    crossPlatformCorrelations
  };
}

/**
 * Get insights for a user
 */
export async function getInsights(userId: string): Promise<InsightData> {
  const [soulSignature, platformData, moltbotContext] = await Promise.all([
    getSoulSignature(userId),
    getPlatformData(userId, ['spotify', 'whoop']),
    getMoltbotContext(userId)
  ]);

  const personalityInsights: InsightData['personalityInsights'] = [];
  const emotionalPatterns: InsightData['emotionalPatterns'] = [];
  const recommendations: InsightData['recommendations'] = [];

  // Generate insights based on available data
  if (soulSignature?.traits) {
    personalityInsights.push({
      type: 'soul_signature',
      insight: `Your soul signature "${soulSignature.title}" reflects your unique identity`,
      confidence: 0.8,
      evidence: soulSignature.traits.map(t => t.name)
    });
  }

  if (platformData.spotify?.genres?.length) {
    personalityInsights.push({
      type: 'music_personality',
      insight: `Your music taste shows preference for ${platformData.spotify.genres.slice(0, 3).join(', ')}`,
      confidence: 0.7,
      evidence: platformData.spotify.genres
    });
  }

  if (platformData.whoop?.recovery) {
    const recovery = platformData.whoop.recovery;
    if (recovery >= 67) {
      recommendations.push({
        area: 'activity',
        recommendation: 'Great recovery! This is a good day for challenging activities.',
        rationale: `Your recovery score is ${recovery}%, indicating good readiness.`
      });
    } else if (recovery <= 33) {
      recommendations.push({
        area: 'rest',
        recommendation: 'Consider prioritizing rest and recovery today.',
        rationale: `Your recovery score is ${recovery}%, suggesting your body needs more rest.`
      });
    }
  }

  if (moltbotContext?.clusterPersonality) {
    const personality = moltbotContext.clusterPersonality.personality;
    if (personality.openness > 70) {
      emotionalPatterns.push({
        pattern: 'high_openness',
        description: 'You show strong curiosity and openness to new experiences',
        confidence: personality.openness / 100
      });
    }
    if (personality.conscientiousness > 70) {
      emotionalPatterns.push({
        pattern: 'high_conscientiousness',
        description: 'You demonstrate strong organization and goal-oriented behavior',
        confidence: personality.conscientiousness / 100
      });
    }
  }

  return {
    personalityInsights,
    emotionalPatterns,
    recommendations
  };
}

/**
 * Get predictions for a user
 */
export async function getPredictions(userId: string): Promise<PredictionData> {
  const [platformData, patterns] = await Promise.all([
    getPlatformData(userId, ['calendar', 'whoop']),
    getPatterns(userId)
  ]);

  const predictedActivities: PredictionData['predictedActivities'] = [];
  const moodForecasts: PredictionData['moodForecasts'] = [];
  const schedulePatterns: PredictionData['schedulePatterns'] = [];

  // Predict based on calendar
  if (platformData.calendar?.todayEvents?.length) {
    platformData.calendar.todayEvents.forEach(event => {
      predictedActivities.push({
        activity: event.summary,
        probability: 0.9,
        timeframe: 'today'
      });
    });
  }

  // Predict mood based on Whoop recovery
  if (platformData.whoop?.recovery) {
    const recovery = platformData.whoop.recovery;
    let predictedMood = 'neutral';
    if (recovery >= 67) predictedMood = 'energetic';
    else if (recovery <= 33) predictedMood = 'fatigued';

    moodForecasts.push({
      period: 'today',
      predictedMood,
      factors: [`Recovery: ${recovery}%`],
      confidence: 0.7
    });
  }

  // Generate schedule patterns from time patterns
  if (patterns.timePatterns.length > 0) {
    schedulePatterns.push({
      day: 'typical',
      typicalActivities: patterns.timePatterns.map(p => p.description),
      energyLevel: 'moderate'
    });
  }

  return {
    predictedActivities,
    moodForecasts,
    schedulePatterns
  };
}

// ============================================================================
// CONVERSATION LOGGING & LEARNING - Feed interactions back to Moltbot brain
// ============================================================================

export interface WritingAnalysis {
  messageLength: number;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  questionCount: number;
  exclamationCount: number;
  emojiCount: number;
  formalityScore: number;       // 0-100
  vocabularyRichness: number;   // unique words / total words
  topWords: string[];
  detectedLanguage: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
}

export interface ConversationLogEntry {
  id?: string;
  userId: string;
  userMessage: string;
  twinResponse: string;
  platformsContext: Record<string, unknown>;
  brainStats: Record<string, unknown>;
  writingAnalysis?: WritingAnalysis;
  topicsDetected?: string[];
  intent?: string;
  sessionId?: string;
}

/**
 * Analyze writing style from a message
 * This extracts patterns that help understand how the user communicates
 */
export function analyzeWritingStyle(message: string): WritingAnalysis {
  const words = message.split(/\s+/).filter(w => w.length > 0);
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));

  // Count questions and exclamations
  const questionCount = (message.match(/\?/g) || []).length;
  const exclamationCount = (message.match(/!/g) || []).length;

  // Count emojis (basic pattern)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiCount = (message.match(emojiRegex) || []).length;

  // Calculate formality score based on various indicators
  let formalityScore = 50; // Start neutral

  // Informal indicators (reduce score)
  if (message.includes('lol') || message.includes('haha')) formalityScore -= 10;
  if (emojiCount > 0) formalityScore -= 5 * Math.min(emojiCount, 3);
  if (message.match(/\b(gonna|wanna|gotta|kinda|sorta)\b/i)) formalityScore -= 10;
  if (message.match(/\b(u|ur|r|pls|thx|ty)\b/i)) formalityScore -= 15;
  if (exclamationCount > 2) formalityScore -= 5;

  // Formal indicators (increase score)
  if (message.match(/\b(please|thank you|would you|could you)\b/i)) formalityScore += 10;
  if (message.match(/\b(however|therefore|furthermore|consequently)\b/i)) formalityScore += 15;
  if (message.match(/\b(I would|I am|do not|cannot)\b/)) formalityScore += 5;

  // Clamp to 0-100
  formalityScore = Math.max(0, Math.min(100, formalityScore));

  // Vocabulary richness
  const vocabularyRichness = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Get top words (excluding common stop words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'about']);

  const wordFreq: Record<string, number> = {};
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length > 2 && !stopWords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Simple sentiment detection
  const positiveWords = ['good', 'great', 'awesome', 'amazing', 'love', 'happy', 'excellent', 'wonderful', 'fantastic', 'perfect', 'best', 'thanks', 'thank', 'excited', 'glad'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'frustrated', 'annoyed', 'disappointed', 'worst', 'horrible', 'wrong', 'problem', 'issue', 'error', 'bug', 'broken'];

  const lowerMessage = message.toLowerCase();
  const positiveCount = positiveWords.filter(w => lowerMessage.includes(w)).length;
  const negativeCount = negativeWords.filter(w => lowerMessage.includes(w)).length;

  let sentiment: WritingAnalysis['sentiment'] = 'neutral';
  if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
  else if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  return {
    messageLength: message.length,
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : 0,
    questionCount,
    exclamationCount,
    emojiCount,
    formalityScore,
    vocabularyRichness: Math.round(vocabularyRichness * 100) / 100,
    topWords,
    detectedLanguage: 'en', // For now, assume English
    sentiment
  };
}

/**
 * Detect topics/themes in a message
 */
export function detectTopics(message: string): string[] {
  const topics: string[] = [];
  const lower = message.toLowerCase();

  // Topic detection patterns
  const topicPatterns: [string, RegExp][] = [
    ['health', /\b(health|recovery|sleep|hrv|heart rate|whoop|fitness|exercise|workout|energy)\b/i],
    ['music', /\b(music|spotify|song|playlist|artist|listening|track|album|genre)\b/i],
    ['schedule', /\b(calendar|meeting|event|schedule|appointment|busy|free|tomorrow|today|week)\b/i],
    ['personality', /\b(personality|trait|pattern|behavior|soul|signature|who am i|about me|myself)\b/i],
    ['mood', /\b(mood|feeling|emotion|happy|sad|stressed|anxious|excited|tired)\b/i],
    ['work', /\b(work|job|project|task|deadline|office|career|professional)\b/i],
    ['productivity', /\b(productive|focus|concentrate|efficiency|goals|accomplish|achieve)\b/i],
    ['relationships', /\b(friend|family|relationship|social|people|connection|meeting someone)\b/i],
    ['learning', /\b(learn|study|course|knowledge|skill|improve|develop|growth)\b/i],
    ['recommendation', /\b(recommend|suggest|advice|what should|help me|guide)\b/i],
    ['reflection', /\b(think|reflect|wonder|realize|notice|observe|pattern)\b/i],
    ['planning', /\b(plan|prepare|organize|strategy|next|future|goal)\b/i],
  ];

  topicPatterns.forEach(([topic, pattern]) => {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  });

  return topics.length > 0 ? topics : ['general'];
}

/**
 * Detect the user's intent/what they're asking for
 */
export function detectIntent(message: string): string {
  const lower = message.toLowerCase();

  // Intent patterns (ordered by specificity)
  if (/\b(how am i|how.*doing|what.*state|check.*on me)\b/i.test(lower)) {
    return 'status_check';
  }
  if (/\b(what.*pattern|what.*notice|what.*learn|tell.*about.*me)\b/i.test(lower)) {
    return 'self_discovery';
  }
  if (/\b(recommend|suggest|what should|help me decide|advice)\b/i.test(lower)) {
    return 'recommendation';
  }
  if (/\b(why|explain|how does|what is|tell me about)\b/i.test(lower)) {
    return 'information';
  }
  if (/\b(predict|forecast|what will|tomorrow|future|upcoming)\b/i.test(lower)) {
    return 'prediction';
  }
  if (/\b(remind|remember|don't forget|note that)\b/i.test(lower)) {
    return 'memory_storage';
  }
  if (/\b(hi|hello|hey|good morning|good evening)\b/i.test(lower)) {
    return 'greeting';
  }
  if (/\b(thanks|thank you|appreciate|great job)\b/i.test(lower)) {
    return 'gratitude';
  }
  if (/\?$/.test(message.trim())) {
    return 'question';
  }

  return 'conversation';
}

/**
 * Log a conversation to the database for learning
 * Enhanced with session management and AI analysis queuing
 */
export async function logConversation(entry: ConversationLogEntry): Promise<string | null> {
  const supabase = getSupabaseClient();

  try {
    // Analyze the user's message
    const writingAnalysis = analyzeWritingStyle(entry.userMessage);
    const topicsDetected = detectTopics(entry.userMessage);
    const intent = detectIntent(entry.userMessage);

    // Get or create session and turn number
    let sessionId = entry.sessionId || null;
    let turnNumber = 1;

    if (!sessionId) {
      try {
        // Call database function to get or create session
        const { data: newSessionId, error: sessionError } = await supabase
          .rpc('get_or_create_conversation_session', {
            p_user_id: entry.userId,
            p_mcp_client: 'mcp_twin',
            p_session_gap_minutes: 30
          });

        if (!sessionError && newSessionId) {
          sessionId = newSessionId;

          // Get turn number
          const { data: turn } = await supabase
            .rpc('get_next_turn_number', { p_session_id: sessionId });
          turnNumber = turn || 1;
        }
      } catch (sessionErr) {
        console.error('[MCP Learning] Session creation failed:', sessionErr);
        // Continue without session - message will still be logged
      }
    }

    console.error('[MCP Learning] Logging conversation:', {
      userId: entry.userId,
      sessionId,
      turnNumber,
      messageLength: entry.userMessage.length,
      topics: topicsDetected,
      intent,
      sentiment: writingAnalysis.sentiment,
      formalityScore: writingAnalysis.formalityScore
    });

    const { data, error } = await supabase
      .from('mcp_conversation_logs')
      .insert({
        user_id: entry.userId,
        user_message: entry.userMessage,
        twin_response: entry.twinResponse,
        platforms_context: entry.platformsContext,
        brain_stats: entry.brainStats,
        writing_analysis: writingAnalysis,
        topics_detected: topicsDetected,
        intent,
        sentiment: writingAnalysis.sentiment,
        session_id: sessionId,
        turn_number: turnNumber,
        analyzed_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('[MCP Learning] Failed to log conversation:', error);
      return null;
    }

    const conversationLogId = data?.id;

    // Update aggregated writing patterns asynchronously
    updateUserWritingPatterns(entry.userId, writingAnalysis).catch(err => {
      console.error('[MCP Learning] Failed to update writing patterns:', err);
    });

    // Store any new learned facts from the conversation
    await storeLearnedFacts(entry.userId, entry.userMessage, topicsDetected, intent);

    // Queue AI analysis job asynchronously (don't await)
    if (conversationLogId) {
      queueAIAnalysis(entry.userId, conversationLogId, sessionId).catch(err => {
        console.error('[MCP Learning] Failed to queue AI analysis:', err);
      });
    }

    console.error('[MCP Learning] Conversation logged successfully:', conversationLogId);
    return conversationLogId || null;

  } catch (err) {
    console.error('[MCP Learning] Error logging conversation:', err);
    return null;
  }
}

/**
 * Queue AI analysis for a conversation (async, non-blocking)
 */
async function queueAIAnalysis(
  userId: string,
  conversationLogId: string,
  sessionId: string | null
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: jobErr } = await supabase
    .from('conversation_analysis_jobs')
    .insert({
      user_id: userId,
      conversation_log_id: conversationLogId,
      session_id: sessionId,
      status: 'pending',
      priority: 5,
      queued_at: new Date().toISOString()
    });

  if (jobErr) {
    console.error('[MCP Learning] Failed to queue analysis job:', jobErr.message);
  } else {
    console.error('[MCP Learning] AI analysis job queued for:', conversationLogId);
  }
}

/**
 * Update aggregated writing patterns for a user
 */
async function updateUserWritingPatterns(userId: string, analysis: WritingAnalysis): Promise<void> {
  const supabase = getSupabaseClient();

  // Get existing patterns
  const { data: existing } = await supabase
    .from('user_writing_patterns')
    .select('*')
    .eq('user_id', userId)
    .single();

  const totalConversations = (existing?.total_conversations || 0) + 1;
  const totalWords = (existing?.total_words_analyzed || 0) + analysis.wordCount;

  // Calculate running averages
  const avgMessageLength = existing
    ? ((existing.avg_message_length * existing.total_conversations) + analysis.messageLength) / totalConversations
    : analysis.messageLength;

  const avgSentenceLength = existing
    ? ((existing.avg_sentence_length * existing.total_conversations) + analysis.avgSentenceLength) / totalConversations
    : analysis.avgSentenceLength;

  const formalityScore = existing
    ? ((existing.formality_score * existing.total_conversations) + analysis.formalityScore) / totalConversations
    : analysis.formalityScore;

  const vocabularyRichness = existing
    ? ((existing.vocabulary_richness * existing.total_conversations) + analysis.vocabularyRichness) / totalConversations
    : analysis.vocabularyRichness;

  // Merge common topics
  const existingTopics = existing?.common_topics || [];
  const newTopics = analysis.topWords.slice(0, 5);
  const mergedTopics = [...new Set([...existingTopics, ...newTopics])].slice(0, 20);

  // Calculate question frequency (questions per message)
  const questionFrequency = existing
    ? ((existing.question_frequency * existing.total_conversations) + analysis.questionCount) / totalConversations
    : analysis.questionCount;

  // Calculate emoji frequency (emojis per 100 words)
  const emojiPer100 = analysis.wordCount > 0 ? (analysis.emojiCount / analysis.wordCount) * 100 : 0;
  const emojiFrequency = existing
    ? ((existing.emoji_frequency * existing.total_conversations) + emojiPer100) / totalConversations
    : emojiPer100;

  // Derive personality indicators from writing
  const curiosityScore = Math.min(100, 50 + (analysis.questionCount * 10)); // More questions = more curious
  const detailOrientation = Math.min(100, analysis.avgSentenceLength * 5); // Longer sentences = more detail
  const assertiveness = 100 - analysis.questionCount * 5 + analysis.exclamationCount * 5; // Statements vs questions

  // Upsert the patterns
  const { error: patternsErr } = await supabase
    .from('user_writing_patterns')
    .upsert({
      user_id: userId,
      avg_message_length: Math.round(avgMessageLength),
      avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
      vocabulary_richness: Math.round(vocabularyRichness * 100) / 100,
      formality_score: Math.round(formalityScore),
      emoji_frequency: Math.round(emojiFrequency * 100) / 100,
      question_frequency: Math.round(questionFrequency * 100) / 100,
      common_topics: mergedTopics,
      curiosity_score: Math.max(0, Math.min(100, Math.round(curiosityScore))),
      detail_orientation: Math.max(0, Math.min(100, Math.round(detailOrientation))),
      assertiveness_score: Math.max(0, Math.min(100, Math.round(assertiveness))),
      total_conversations: totalConversations,
      total_words_analyzed: totalWords,
      last_updated: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });
  if (patternsErr) console.warn('[MCP Learning] Failed to upsert writing patterns:', patternsErr.message);
}

/**
 * Extract and store learned facts from conversation
 */
async function storeLearnedFacts(
  userId: string,
  message: string,
  topics: string[],
  intent: string
): Promise<void> {
  const supabase = getSupabaseClient();

  // Only store certain intents as learned facts
  if (!['memory_storage', 'self_discovery', 'status_check'].includes(intent)) {
    return;
  }

  // Simple fact extraction - look for "I am", "I like", "I prefer", etc.
  const factPatterns: [string, RegExp][] = [
    ['preference', /I (?:like|love|prefer|enjoy|hate|dislike) (.+?)(?:\.|,|$)/i],
    ['identity', /I am (?:a |an )?(.+?)(?:\.|,|$)/i],
    ['habit', /I (?:usually|always|often|sometimes|never) (.+?)(?:\.|,|$)/i],
    ['goal', /I (?:want to|need to|plan to|hope to) (.+?)(?:\.|,|$)/i],
    ['feeling', /I (?:feel|am feeling) (.+?)(?:\.|,|$)/i],
  ];

  for (const [category, pattern] of factPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const factValue = match[1].trim();
      if (factValue.length > 3 && factValue.length < 200) {
        // Store as a learned fact
        const { error: factErr } = await supabase
          .from('learned_facts')
          .insert({
            user_id: userId,
            category,
            key: category,
            value: factValue,
            source: 'mcp_conversation',
            confidence: 0.7,
            created_at: new Date().toISOString()
          });
        if (factErr && !factErr.message?.includes('duplicate')) {
          console.warn('[MCP Learning] Failed to insert learned fact:', factErr.message);
        }
      }
    }
  }

  // Store topics as interests
  if (topics.length > 0 && topics[0] !== 'general') {
    for (const topic of topics.slice(0, 2)) {
      const { error: topicErr } = await supabase
        .from('learned_facts')
        .insert({
          user_id: userId,
          category: 'interest',
          key: 'topic_discussed',
          value: topic,
          source: 'mcp_conversation',
          confidence: 0.5,
          created_at: new Date().toISOString()
        });
      // Ignore duplicates; warn on other errors
      if (topicErr && !topicErr.message?.includes('duplicate')) {
        console.warn('[MCP Learning] Failed to insert topic interest:', topicErr.message);
      }
    }
  }
}

/**
 * Get conversation history for a user (for context in future conversations)
 */
export async function getRecentConversations(
  userId: string,
  limit: number = 10
): Promise<Array<{ userMessage: string; twinResponse: string; createdAt: string }>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('mcp_conversation_logs')
    .select('user_message, twin_response, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    userMessage: row.user_message,
    twinResponse: row.twin_response,
    createdAt: row.created_at
  }));
}

/**
 * Get writing patterns summary for inclusion in twin context
 */
export async function getUserWritingProfile(userId: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_writing_patterns')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    communicationStyle: data.formality_score >= 60 ? 'formal' : data.formality_score >= 40 ? 'balanced' : 'casual',
    formalityScore: data.formality_score,
    usesEmojis: data.emoji_frequency > 0.5,
    asksQuestions: data.question_frequency > 0.3,
    messageLength: data.avg_message_length > 100 ? 'detailed' : data.avg_message_length > 30 ? 'moderate' : 'brief',
    vocabularyRichness: data.vocabulary_richness > 0.7 ? 'diverse' : data.vocabulary_richness > 0.5 ? 'moderate' : 'focused',
    personalityIndicators: {
      curiosity: data.curiosity_score,
      detailOrientation: data.detail_orientation,
      assertiveness: data.assertiveness_score
    },
    commonTopics: data.common_topics,
    totalConversations: data.total_conversations,
    totalWordsAnalyzed: data.total_words_analyzed
  };
}
