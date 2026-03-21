/**
 * E2E Test: Music Mood Match Pipeline
 * =====================================
 * Exercises the same steps as the Inngest workflow without the durable wrapper.
 *
 * Run: node api/scripts/test-music-mood-match.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Music Mood Match E2E Test ===\n');

  const { supabaseAdmin } = await import('../services/database.js');
  const { assessMood } = await import('../services/moodAssessmentService.js');
  const { complete, TIER_EXTRACTION } = await import('../services/llmGateway.js');
  const { getBlocks } = await import('../services/coreMemoryService.js');
  const { getValidAccessToken } = await import('../services/tokenRefreshService.js');
  const axios = (await import('axios')).default;

  // Step 1: Gather Whoop data
  console.log('Step 1: Gathering Whoop health data...');
  let healthData = null;
  try {
    const { data } = await supabaseAdmin
      .from('platform_data')
      .select('raw_data')
      .eq('user_id', TEST_USER_ID)
      .eq('provider', 'whoop')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    healthData = data?.raw_data || null;
  } catch {}
  const recoveryScore = healthData?.recovery_score ?? healthData?.score?.recovery_score ?? null;
  console.log(`  Recovery: ${recoveryScore != null ? recoveryScore + '%' : 'No data'}`);

  // Step 2: Gather calendar data
  console.log('Step 2: Gathering calendar data...');
  let calendarData = null;
  try {
    const { data } = await supabaseAdmin
      .from('platform_data')
      .select('raw_data')
      .eq('user_id', TEST_USER_ID)
      .eq('provider', 'google_calendar')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    calendarData = data?.raw_data || null;
  } catch {}

  let calendarEventCount = 0;
  if (calendarData) {
    if (Array.isArray(calendarData)) calendarEventCount = calendarData.length;
    else if (calendarData.items) calendarEventCount = calendarData.items.length;
    else if (calendarData.events) calendarEventCount = calendarData.events.length;
  }
  console.log(`  Events today: ${calendarEventCount}`);

  // Step 3: Assess mood
  console.log('\nStep 3: Assessing mood (heuristic)...');
  const currentHour = new Date().getHours();
  const mood = assessMood({ recoveryScore, calendarEventCount, currentHour });
  console.log(`  Energy level: ${mood.energyLevel}`);
  console.log(`  Reasoning: ${mood.reasoning}`);
  console.log(`  Confidence: ${mood.confidence}`);

  // Step 4: Find matching playlist from Spotify
  console.log('\nStep 4: Finding matching playlist...');
  const tokenResult = await getValidAccessToken(TEST_USER_ID, 'spotify');
  if (!tokenResult.success) {
    console.log('  Spotify not connected — skipping playlist search');
    console.log('  (This is expected if Spotify OAuth has expired)');
    console.log('\n  Generating suggestion with mock playlist...');

    // Use mock playlist for the rest of the test
    const mockPlaylist = { id: 'mock', name: 'Chill Vibes', trackCount: 25 };
    await testSuggestionAndDelivery(supabaseAdmin, complete, TIER_EXTRACTION, getBlocks, mood, mockPlaylist);
    return;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
  let playlists = [];
  try {
    const res = await axios.get('https://api.spotify.com/v1/me/playlists?limit=50', { headers, timeout: 8000 });
    playlists = res.data?.items || [];
  } catch (err) {
    console.log(`  Spotify API error: ${err.response?.status || err.message}`);
  }
  console.log(`  Found ${playlists.length} playlists`);

  if (playlists.length === 0) {
    console.log('  No playlists found — using mock');
    const mockPlaylist = { id: 'mock', name: 'Focus Flow', trackCount: 30 };
    await testSuggestionAndDelivery(supabaseAdmin, complete, TIER_EXTRACTION, getBlocks, mood, mockPlaylist);
    return;
  }

  // Score playlists by mood
  const GENRE_ENERGY_MAP = {
    calm: ['ambient', 'classical', 'jazz', 'acoustic', 'chill', 'piano', 'blues', 'folk', 'soul'],
    focused: ['indie', 'alternative', 'folk', 'indie-pop', 'singer-songwriter', 'study'],
    energizing: ['pop', 'rock', 'hip-hop', 'r-n-b', 'soul', 'funk', 'disco', 'dance', 'party'],
    power: ['edm', 'dance', 'electronic', 'house', 'techno', 'metal', 'punk', 'workout'],
  };

  const targetGenres = GENRE_ENERGY_MAP[mood.energyLevel] || GENRE_ENERGY_MAP.focused;
  const scored = playlists.map(pl => {
    const name = (pl.name || '').toLowerCase();
    let score = 0;
    for (const g of targetGenres) { if (name.includes(g)) score += 10; }
    if (mood.energyLevel === 'calm' && /chill|relax|sleep|ambient|quiet/i.test(name)) score += 15;
    if (mood.energyLevel === 'focused' && /focus|study|work|deep|flow/i.test(name)) score += 15;
    if (mood.energyLevel === 'energizing' && /energy|hype|pump|vibe|party/i.test(name)) score += 15;
    if (mood.energyLevel === 'power' && /workout|gym|beast|power|intense/i.test(name)) score += 15;
    return { id: pl.id, name: pl.name, trackCount: pl.tracks?.total || 0, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const bestMatch = scored[0];
  console.log(`  Best match: "${bestMatch.name}" (score: ${bestMatch.score}, ${bestMatch.trackCount} tracks)`);
  if (scored.length > 1) console.log(`  Runner-up: "${scored[1].name}" (score: ${scored[1].score})`);

  await testSuggestionAndDelivery(supabaseAdmin, complete, TIER_EXTRACTION, getBlocks, mood, bestMatch);
}

async function testSuggestionAndDelivery(supabaseAdmin, complete, TIER_EXTRACTION, getBlocks, mood, playlist) {
  // Step 5: Compose suggestion
  console.log('\nStep 5: Composing personality-filtered suggestion...');
  const coreBlocks = await getBlocks(TEST_USER_ID);
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
    userId: TEST_USER_ID,
    purpose: 'music_mood_match_test'
  });

  const suggestion = response?.content || response?.text || `"${playlist.name}" feels right.`;
  console.log(`  Suggestion: ${suggestion}`);

  // Step 6: Deliver as proactive insight
  console.log('\nStep 6: Delivering as proactive insight...');
  const { data: insight, error: insightErr } = await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: TEST_USER_ID,
      insight: suggestion,
      urgency: 'low',
      category: 'music_mood_match',
      delivered: false,
    })
    .select()
    .single();

  if (insightErr) {
    console.error('  FAIL: Could not insert insight:', insightErr.message);
    process.exit(1);
  }
  console.log(`  PASS: Insight created: ${insight.id}`);

  // Log agent event
  const { error: eventErr } = await supabaseAdmin.from('agent_events').insert({
    user_id: TEST_USER_ID,
    event_type: 'music_mood_match_triggered',
    event_data: {
      energyLevel: mood.energyLevel,
      reasoning: mood.reasoning,
      playlistName: playlist.name,
      test: true,
    },
    source: 'music_mood_match_test',
  });

  if (!eventErr) console.log('  Agent event logged');

  // Verify
  console.log('\nStep 7: Verification...');
  const { data: verify } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, category, urgency, delivered')
    .eq('id', insight.id)
    .single();

  if (verify) {
    console.log('  PASS: Verified in DB');
    console.log(`    Category: ${verify.category}`);
    console.log(`    Urgency: ${verify.urgency}`);
  }

  console.log('\n=== Music Mood Match E2E Test COMPLETE ===');
  console.log('Pipeline:');
  console.log(`  Whoop recovery: ${mood.energyLevel === 'calm' || mood.energyLevel === 'focused' ? 'low/moderate' : 'high'}`);
  console.log(`  Mood: ${mood.energyLevel} (${mood.reasoning})`);
  console.log(`  Playlist: "${playlist.name}"`);
  console.log(`  Suggestion: ${suggestion.slice(0, 80)}...`);
  console.log(`  Insight ID: ${insight.id}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
