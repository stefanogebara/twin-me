/**
 * The last two fabrications in the Spotify family.
 *
 * IMPORTERS/CALLERS: exercises spotifyEnhancedExtractor.getDefaultAudioPersonality
 * (returned by analyzeAudioPersonality at lines 326/333) and
 * spotifyInsightGenerator.determineMood (called by getCurrentMoodInsights:163,
 * whose result is consumed by api/routes/intelligent-twin.js:936 and
 * api/routes/soul-insights.js:306).
 * AFFECTED API: none directly — both read STORED patterns rather than calling
 * Spotify. They are downstream of the restricted /v1/audio-features.
 * DATA SCHEMAS: reads soul_data.extracted_patterns (JSONB). No writes.
 * USER'S VERBATIM INSTRUCTION: "take those two as well".
 *
 * getDefaultAudioPersonality returned a fully-specified person —
 * { energy: .6, valence: .5, tempo: 120, dominantMood: 'balanced-versatile',
 *   sophisticationLevel: 'moderate-sophistication' } — as the value for "we
 * measured nothing". With audio-features restricted this was every user's
 * audio personality. It did carry sampleSize: 0, the one honest marker in the
 * whole family, and determineMood ignored it while layering `|| 'neutral'`,
 * `|| 0.5` and `|| 120` on top, rendering "Balanced / steady and focused,
 * valence 50%, energy 50%" as though it were a reading.
 *
 * Both consumers of determineMood already handle absence: intelligent-twin
 * branches on `if (moodInsight?.mood)` into a real energy-based fallback, and
 * soul-insights answers "No recent Spotify data available". The honest result
 * routes through paths that already exist.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const { default: enhancedExtractor } = await import(
  '../../../api/services/spotifyEnhancedExtractor.js'
);
const { default: insightGenerator } = await import(
  '../../../api/services/spotifyInsightGenerator.js'
);

describe('getDefaultAudioPersonality', () => {
  const defaults = () => enhancedExtractor.getDefaultAudioPersonality();

  it('keeps sampleSize 0 so callers can tell it measured nothing', () => {
    expect(defaults().sampleSize).toBe(0);
  });

  it.each(['energy', 'valence', 'danceability', 'tempo'])(
    'reports %s as null rather than inventing a value',
    (key) => {
      expect(defaults().averageFeatures[key]).toBeNull();
    },
  );

  it('does not describe a mood it never observed', () => {
    const { emotionalProfile } = defaults();
    expect(emotionalProfile.dominantMood).toBe('unknown');
    expect(emotionalProfile.energyLevel).toBe('unknown');
    expect(emotionalProfile.valenceTendency).toBe('unknown');
  });

  it('does not rate sophistication or pace it never measured', () => {
    const d = defaults();
    expect(d.complexityProfile.sophisticationLevel).toBe('unknown');
    expect(d.complexityProfile.complexityScore).toBeNull();
    expect(d.energyProfile.preferredPace).toBe('unknown');
  });

  it('still returns the full shape, so consumers do not crash on missing keys', () => {
    const d = defaults();
    expect(Object.keys(d).sort()).toEqual(
      ['averageFeatures', 'complexityProfile', 'emotionalProfile', 'energyProfile', 'sampleSize', 'variance'].sort(),
    );
  });

  it('is what analyzeAudioPersonality returns for an empty feature list', async () => {
    const result = await enhancedExtractor.analyzeAudioPersonality([]);
    expect(result.sampleSize).toBe(0);
    expect(result.averageFeatures.valence).toBeNull();
  });
});

describe('determineMood', () => {
  const measured = {
    emotionalProfile: { currentMood: 'energetic-positive' },
    audioPersonality: { averageFeatures: { valence: 0.8, energy: 0.9 }, sampleSize: 12 },
  };

  it('returns null when nothing was measured', () => {
    expect(insightGenerator.determineMood({}, {})).toBeNull();
  });

  it('returns null for the unmeasured default personality', () => {
    const unmeasured = enhancedExtractor.getDefaultAudioPersonality();
    expect(insightGenerator.determineMood({ emotionalState: 'unknown' }, unmeasured)).toBeNull();
  });

  it('does not call an unmeasured user "Balanced"', () => {
    const mood = insightGenerator.determineMood({}, { sampleSize: 0 });
    expect(mood).toBeNull();
  });

  it('still labels a real reading', () => {
    const mood = insightGenerator.determineMood(
      measured.emotionalProfile,
      measured.audioPersonality,
    );
    expect(mood.label).toBe('Energized');
    expect(mood.valence).toBe(80);
    expect(mood.energy).toBe(90);
  });

  it('labels from currentMood even when features are thin, provided the mood is real', () => {
    const mood = insightGenerator.determineMood(
      { currentMood: 'melancholic-reflective' },
      { averageFeatures: { valence: 0.2, energy: 0.3 }, sampleSize: 5 },
    );
    expect(mood.label).toBe('Reflective');
  });

  // 'Balanced' must remain reachable as a FINDING, distinct from a default.
  it('still reports Balanced when that is what was actually measured', () => {
    const mood = insightGenerator.determineMood(
      { currentMood: 'neutral-balanced' },
      { averageFeatures: { valence: 0.5, energy: 0.5 }, sampleSize: 9 },
    );
    expect(mood.label).toBe('Balanced');
  });

  it('omits percentages when the mood came from a label but no averages', () => {
    const mood = insightGenerator.determineMood({ currentMood: 'calm-content' }, {});
    expect(mood.label).toBe('Peaceful');
    expect(mood.valence).toBeUndefined();
    expect(mood.energy).toBeUndefined();
  });
});

/**
 * Two Big Five traits are derived from audio features, so with the endpoint
 * restricted they rest on a substituted 0.5. The scores still ship (the radar
 * charts type them as required numbers) but now say whether anything was
 * measured, so a placeholder is distinguishable from a computed score.
 */
describe('calculateBigFive evidence marking', () => {
  it('marks audio-derived traits unmeasured when no track was analysed', () => {
    const traits = insightGenerator.calculateBigFive({
      audioPersonality: enhancedExtractor.getDefaultAudioPersonality(),
    });

    expect(traits.extraversion.measured).toBe(false);
    expect(traits.neuroticism.measured).toBe(false);
  });

  it('marks them measured when real features exist', () => {
    const traits = insightGenerator.calculateBigFive({
      audioPersonality: {
        averageFeatures: { energy: 0.8, valence: 0.7 },
        variance: { overall: 0.1 },
        sampleSize: 20,
      },
    });

    expect(traits.extraversion.measured).toBe(true);
    expect(traits.neuroticism.measured).toBe(true);
  });

  it('still returns all five traits with numeric scores', () => {
    const traits = insightGenerator.calculateBigFive({
      audioPersonality: enhancedExtractor.getDefaultAudioPersonality(),
    });

    for (const key of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
      expect(typeof traits[key].score).toBe('number');
      expect(Number.isNaN(traits[key].score)).toBe(false);
    }
  });
});
