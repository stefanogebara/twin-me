/**
 * Inngest Function: Music Mood Match
 * ====================================
 * Detects user's current state from Whoop recovery + calendar + time,
 * finds a matching Spotify playlist, and suggests or auto-plays it.
 *
 * First "wow factor" agentic skill — the twin does something visible.
 *
 * Triggered: when Whoop data is ingested (observationIngestion.js)
 * Cooldown: 6 hours between triggers per user
 * Cost: ~$0.0001 per trigger (one TIER_EXTRACTION LLM call)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { assessMood } from '../../services/moodAssessmentService.js';
import { getAutonomyBySkillName, canAct, logAgentAction } from '../../services/autonomyService.js';
import { getValidAccessToken } from '../../services/tokenRefreshService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';
import axios from 'axios';

const log = createLogger('MusicMoodMatch');

const COOLDOWN_HOURS = 6;

// Genre-energy scoring (same map as toolRegistry.js)
const GENRE_ENERGY_MAP = {
  calm: ['ambient', 'classical', 'jazz', 'acoustic', 'chill', 'piano', 'blues', 'folk', 'soul', 'world-music'],
  focused: ['indie', 'alternative', 'folk', 'indie-pop', 'singer-songwriter', 'acoustic', 'jazz', 'blues', 'study'],
  energizing: ['pop', 'rock', 'hip-hop', 'r-n-b', 'soul', 'funk', 'disco', 'synth-pop', 'dance', 'reggae', 'party'],
  power: ['edm', 'dance', 'electronic', 'house', 'techno', 'dubstep', 'drum-and-bass', 'metal', 'punk', 'hardcore'],
};

export const musicMoodMatchFunction = inngest.createFunction(
  {
    id: 'music-mood-match',
    name: 'Music Mood Match',
    retries: 1,
  },
  { event: EVENTS.MUSIC_MOOD_MATCH },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Check cooldown — skip if triggered recently
    const shouldSkip = await step.run('check-cooldown', async () => {
      const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('agent_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'music_mood_match_triggered')
        .gte('created_at', cutoff);
      return (count || 0) > 0;
    });

    if (shouldSkip) {
      return { success: false, reason: 'cooldown', message: `Triggered within last ${COOLDOWN_HOURS}h` };
    }

    // Step 2: Check prerequisites — autonomy + Spotify connection
    const prerequisites = await step.run('check-prerequisites', async () => {
      const autonomyLevel = await getAutonomyBySkillName(userId, 'music_mood_match');
      if (autonomyLevel === -1) return { skip: true, reason: 'skill_disabled' };

      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { skip: true, reason: 'spotify_not_connected' };

      return { skip: false, autonomyLevel, spotifyToken: tokenResult.accessToken };
    });

    if (prerequisites.skip) {
      return { success: false, reason: prerequisites.reason };
    }

    // Step 3: Gather health data from ANY connected health platform (fallback chain)
    const healthResult = await step.run('gather-health', async () => {
      const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
      for (const provider of HEALTH_PROVIDERS) {
        try {
          const { data } = await supabaseAdmin
            .from('platform_data')
            .select('raw_data')
            .eq('user_id', userId)
            .eq('provider', provider)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data?.raw_data) return { provider, data: data.raw_data };
        } catch { /* try next */ }
      }
      return { provider: null, data: null };
    });

    // Step 4: Gather calendar data from ANY connected calendar platform
    const calendarResult = await step.run('gather-calendar', async () => {
      const CALENDAR_PROVIDERS = ['google_calendar', 'outlook'];
      for (const provider of CALENDAR_PROVIDERS) {
        try {
          const { data } = await supabaseAdmin
            .from('platform_data')
            .select('raw_data')
            .eq('user_id', userId)
            .eq('provider', provider)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data?.raw_data) return { provider, data: data.raw_data };
        } catch { /* try next */ }
      }
      return { provider: null, data: null };
    });

    const healthData = healthResult.data;
    const calendarData = calendarResult.data;

    // Step 5: Assess mood (pure heuristic, <1ms, platform-agnostic)
    const mood = await step.run('assess-mood', async () => {
      // Build platform-agnostic health signals object
      const healthSignals = {};
      if (healthData) {
        // Whoop
        if (healthData.recovery_score != null) healthSignals.recovery = healthData.recovery_score;
        else if (healthData.score?.recovery_score != null) healthSignals.recovery = healthData.score.recovery_score;
        // Oura
        if (healthData.readiness != null) healthSignals.readiness = healthData.readiness;
        if (healthData.readiness_score != null) healthSignals.readiness = healthData.readiness_score;
        // Garmin
        if (healthData.body_battery != null) healthSignals.body_battery = healthData.body_battery;
        if (healthData.stress_level != null) healthSignals.stress = healthData.stress_level;
        // Generic
        if (healthData.sleep_hours != null) healthSignals.sleep_hours = healthData.sleep_hours;
        if (healthData.hrv != null) healthSignals.hrv = healthData.hrv;
        if (healthData.hrv_rmssd_milli != null) healthSignals.hrv = Math.round(healthData.hrv_rmssd_milli);
        if (healthData.score?.hrv_rmssd_milli != null) healthSignals.hrv = Math.round(healthData.score.hrv_rmssd_milli);
        if (healthData.sleep_score != null) healthSignals.sleep_score = healthData.sleep_score;
      }

      // Count calendar events
      let calendarEventCount = 0;
      if (calendarData) {
        if (Array.isArray(calendarData)) calendarEventCount = calendarData.length;
        else if (calendarData.items) calendarEventCount = calendarData.items.length;
        else if (calendarData.events) calendarEventCount = calendarData.events.length;
      }

      const currentHour = new Date().getHours();
      return assessMood({ healthSignals, calendarEventCount, currentHour });
    });

    // Step 6: Find matching playlist from user's Spotify library
    const playlist = await step.run('find-playlist', async () => {
      const headers = { Authorization: `Bearer ${prerequisites.spotifyToken}` };

      let playlists;
      try {
        const res = await axios.get('https://api.spotify.com/v1/me/playlists?limit=50', { headers, timeout: 8000 });
        playlists = res.data?.items || [];
      } catch {
        return null;
      }

      if (playlists.length === 0) return null;

      const targetGenres = GENRE_ENERGY_MAP[mood.energyLevel] || GENRE_ENERGY_MAP.focused;

      // Score playlists by name matching
      const scored = playlists.map(pl => {
        const name = (pl.name || '').toLowerCase();
        let score = 0;
        for (const genre of targetGenres) {
          if (name.includes(genre)) score += 10;
        }
        if (mood.energyLevel === 'calm' && /chill|relax|sleep|ambient|quiet|peace/i.test(name)) score += 15;
        if (mood.energyLevel === 'focused' && /focus|study|work|deep|concentrate|flow/i.test(name)) score += 15;
        if (mood.energyLevel === 'energizing' && /energy|hype|pump|morning|vibe|party|mood/i.test(name)) score += 15;
        if (mood.energyLevel === 'power' && /workout|gym|beast|power|intense|run|lift/i.test(name)) score += 15;
        return { id: pl.id, name: pl.name, trackCount: pl.tracks?.total || 0, score };
      });

      scored.sort((a, b) => b.score - a.score);

      // Return best match, or random if no strong match
      if (scored[0].score > 0) return scored[0];
      // No genre match — pick a random playlist as fallback
      const random = scored[Math.floor(Math.random() * Math.min(scored.length, 10))];
      return { ...random, fallback: true };
    });

    if (!playlist) {
      return { success: false, reason: 'no_playlists', message: 'No Spotify playlists found' };
    }

    // Step 7: Compose personality-filtered suggestion
    const suggestion = await step.run('compose-suggestion', async () => {
      const coreBlocks = await getBlocks(userId);
      const soulSignature = (coreBlocks.soul_signature?.content || '').slice(0, 400);

      const prompt = `You're a digital twin writing a 1-2 sentence music suggestion to your human. Match their voice.

PERSONALITY: ${soulSignature || 'A thoughtful person who values authenticity.'}

STATE: ${mood.reasoning}

PLAYLIST: "${playlist.name}" (${playlist.trackCount} tracks)

Write a brief, casual suggestion. No bullet points. No "I suggest" — just say it like a friend texting.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_EXTRACTION,
        maxTokens: 80,
        temperature: 0.7,
        userId,
        purpose: 'music_mood_match'
      });

      return response?.content || response?.text || `"${playlist.name}" feels right for where you're at.`;
    });

    // Step 8: Deliver — suggest or auto-play based on autonomy
    const delivery = await step.run('deliver', async () => {
      const permission = canAct(prerequisites.autonomyLevel, 'execute');
      let autoPlayed = false;

      // If autonomy allows, start playback
      if (permission.allowed) {
        try {
          const headers = { Authorization: `Bearer ${prerequisites.spotifyToken}`, 'Content-Type': 'application/json' };
          await axios.put(
            'https://api.spotify.com/v1/me/player/play',
            { context_uri: `spotify:playlist:${playlist.id}` },
            { headers, timeout: 8000 }
          );
          autoPlayed = true;
        } catch (err) {
          log.warn('Auto-play failed, falling back to suggestion', { error: err.response?.status || err.message });
        }
      }

      // Always deliver as proactive insight
      await supabaseAdmin.from('proactive_insights').insert({
        user_id: userId,
        insight: autoPlayed ? `Playing "${playlist.name}" — ${suggestion}` : suggestion,
        urgency: 'low',
        category: 'music_mood_match',
        delivered: false,
      });

      // Log agent action
      await logAgentAction(userId, {
        skillName: 'music_mood_match',
        actionType: autoPlayed ? 'execution' : 'suggestion',
        content: `${mood.energyLevel} mood → "${playlist.name}"${autoPlayed ? ' (auto-played)' : ''}`,
        autonomyLevel: prerequisites.autonomyLevel,
        platformSources: ['spotify', healthResult.provider, calendarResult.provider].filter(Boolean),
      });

      // Log agent event
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'music_mood_match_triggered',
        event_data: {
          energyLevel: mood.energyLevel,
          reasoning: mood.reasoning,
          healthSource: mood.healthSource || healthResult.provider,
          playlistName: playlist.name,
          playlistId: playlist.id,
          autoPlayed,
          autonomyLevel: prerequisites.autonomyLevel,
        },
        source: 'music_mood_match_skill',
      });

      log.info('Music Mood Match delivered', {
        userId,
        energyLevel: mood.energyLevel,
        playlist: playlist.name,
        autoPlayed,
      });

      return { autoPlayed, playlistName: playlist.name };
    });

    return {
      success: true,
      userId,
      energyLevel: mood.energyLevel,
      reasoning: mood.reasoning,
      playlist: playlist.name,
      autoPlayed: delivery.autoPlayed,
    };
  }
);
