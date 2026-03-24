/**
 * Tests for api/services/enrichment/briefingGenerator.js
 *
 * Tests the pure helper functions directly and the main
 * generateOnboardingBriefing function with mocked LLM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock llmGateway before importing the module
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Now import after mocks are set up
const { generateOnboardingBriefing } = await import(
  '../../../api/services/enrichment/briefingGenerator.js'
);
const { complete } = await import('../../../api/services/llmGateway.js');

// ============================================================================
// Rich test data (developer profile — like stefanogebara@gmail.com)
// ============================================================================
const richDevData = {
  discovered_name: 'Stefano Gebara',
  discovered_photo: 'https://avatars.githubusercontent.com/u/12345',
  discovered_company: null,
  discovered_location: null,
  discovered_bio: 'Building things with AI',
  discovered_github_url: 'https://github.com/stefanogebara',
  discovered_twitter_url: null,
  twitter_handle: 'StefanoGambare',
  twitter_bio: 'Building AI products',
  github_repos: 15,
  github_followers: 3,
  github_languages: ['TypeScript', 'Python', 'JavaScript'],
  github_top_repos: [
    { name: 'restaurant-ai-mcp', description: 'AI-powered restaurant management', language: 'TypeScript', stars: 2 },
    { name: 'ai-olympics', description: 'AI Olympics platform', language: 'Python', stars: 5 },
    { name: 'twin-ai-learn', description: 'Digital twin platform', language: 'TypeScript', stars: 1 },
  ],
  hn_topics: ['claude', 'gpt4', 'gemini'],
  hn_karma: 42,
  spotify_exists: true,
  discovered_platforms: ['amazon', 'spotify', 'twitter', 'instagram', 'tiktok', 'reddit', 'medium', 'pinterest'],
  social_links: [
    { platform: 'github', url: 'https://github.com/stefanogebara' },
    { platform: 'twitter', url: 'https://twitter.com/StefanoGambare' },
    { platform: 'Medium', url: 'https://medium.com/@stefanogebara' },
  ],
  pdl_headline: null,
  pdl_experience: null,
  pdl_education: null,
  pdl_skills: null,
};

// ============================================================================
// Sparse test data (non-dev — like chachoherrera666@gmail.com)
// ============================================================================
const sparseData = {
  discovered_name: 'Chacho Herrera',
  discovered_photo: null,
  discovered_company: null,
  discovered_location: null,
  discovered_bio: null,
  github_languages: null,
  github_top_repos: null,
  social_links: [],
  spotify_exists: true,
  discovered_platforms: ['spotify', 'instagram'],
};

// ============================================================================
// Empty data
// ============================================================================
const emptyData = {
  discovered_name: null,
  discovered_photo: null,
  source: 'none',
};

describe('generateOnboardingBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fallback briefing for null input', async () => {
    const result = await generateOnboardingBriefing(null);
    expect(result).toBeDefined();
    expect(result.headline).toContain('there');
    expect(result.observations).toBeInstanceOf(Array);
    expect(result.gaps).toBeInstanceOf(Array);
    expect(result.cta).toBeTruthy();
  });

  it('returns fallback briefing for empty data (< 2 data points)', async () => {
    const result = await generateOnboardingBriefing(emptyData);
    expect(result.headline).toContain('there');
    expect(result.observations.length).toBeGreaterThan(0);
    // Should NOT call the LLM
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns fallback briefing for sparse data (< 2 data points)', async () => {
    const veryMinimalData = { discovered_name: 'Test User' };
    const result = await generateOnboardingBriefing(veryMinimalData);
    expect(result.headline).toContain('Test');
    expect(complete).not.toHaveBeenCalled();
  });

  it('calls LLM for rich developer data and parses response', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: "You're a builder who turns AI ideas into real products.",
        observations: [
          "You code in TypeScript and Python, and you've shipped at least 3 products",
          "You posted on Hacker News — you're sharing with the community",
          "Your Spotify is active and you're on 8 platforms",
        ],
        gaps: [
          "We couldn't find your location or education",
        ],
        cta: "Connect your Spotify to unlock your full portrait",
      }),
    });

    const result = await generateOnboardingBriefing(richDevData);

    expect(complete).toHaveBeenCalledOnce();
    expect(result.headline).toContain('builder');
    expect(result.observations).toHaveLength(3);
    expect(result.gaps).toHaveLength(1);
    expect(result.cta).toContain('Spotify');
  });

  it('passes correct tier and service name to LLM', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test headline',
        observations: ['obs1'],
        gaps: [],
        cta: 'Do something',
      }),
    });

    await generateOnboardingBriefing(richDevData, { userId: 'user-123' });

    const callArgs = complete.mock.calls[0][0];
    expect(callArgs.tier).toBe('analysis');
    expect(callArgs.serviceName).toBe('onboarding-briefing');
    expect(callArgs.maxTokens).toBe(500);
    expect(callArgs.temperature).toBe(0.6);
  });

  it('handles LLM returning markdown-wrapped JSON', async () => {
    complete.mockResolvedValueOnce({
      content: '```json\n{"headline":"Test","observations":["obs1","obs2"],"gaps":["gap1"],"cta":"Connect more"}\n```',
    });

    const result = await generateOnboardingBriefing(richDevData);

    expect(result.headline).toBe('Test');
    expect(result.observations).toEqual(['obs1', 'obs2']);
  });

  it('falls back gracefully when LLM returns invalid JSON', async () => {
    complete.mockResolvedValueOnce({
      content: 'This is not valid JSON at all, sorry!',
    });

    const result = await generateOnboardingBriefing(richDevData);

    // Should return fallback, not throw
    expect(result).toBeDefined();
    expect(result.headline).toBeTruthy();
    expect(result.observations).toBeInstanceOf(Array);
  });

  it('falls back gracefully when LLM throws an error', async () => {
    complete.mockRejectedValueOnce(new Error('Circuit breaker OPEN'));

    const result = await generateOnboardingBriefing(richDevData);

    expect(result).toBeDefined();
    expect(result.headline).toBeTruthy();
    expect(result.observations).toBeInstanceOf(Array);
  });

  it('caps observations at 5', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test',
        observations: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'],
        gaps: [],
        cta: 'test',
      }),
    });

    const result = await generateOnboardingBriefing(richDevData);
    expect(result.observations.length).toBeLessThanOrEqual(5);
  });

  it('caps gaps at 3', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test',
        observations: ['o1'],
        gaps: ['g1', 'g2', 'g3', 'g4', 'g5'],
        cta: 'test',
      }),
    });

    const result = await generateOnboardingBriefing(richDevData);
    expect(result.gaps.length).toBeLessThanOrEqual(3);
  });

  it('filters out null/empty observations', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test',
        observations: ['valid', null, '', 'also valid', undefined],
        gaps: [],
        cta: 'test',
      }),
    });

    const result = await generateOnboardingBriefing(richDevData);
    expect(result.observations).toEqual(['valid', 'also valid']);
  });

  it('provides default CTA when missing from LLM response', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test',
        observations: ['o1'],
        gaps: [],
      }),
    });

    const result = await generateOnboardingBriefing(richDevData);
    expect(result.cta).toBeTruthy();
    expect(result.cta).toContain('platforms');
  });

  it('includes GitHub data in LLM prompt for dev profiles', async () => {
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: 'Test',
        observations: ['o1'],
        gaps: [],
        cta: 'test',
      }),
    });

    await generateOnboardingBriefing(richDevData);

    const userMessage = complete.mock.calls[0][0].messages[0].content;
    expect(userMessage).toContain('TypeScript');
    expect(userMessage).toContain('restaurant-ai-mcp');
    expect(userMessage).toContain('Hacker News');
  });

  it('handles sparse non-dev data with minimal platforms', async () => {
    // sparseData has name + spotify_exists = 2 data points, just enough for LLM
    complete.mockResolvedValueOnce({
      content: JSON.stringify({
        headline: "We're just getting to know you, Chacho.",
        observations: ["You have a Spotify account — your music taste will tell us a lot"],
        gaps: ["Connect more platforms to build your portrait"],
        cta: "Connect Spotify to get started",
      }),
    });

    const result = await generateOnboardingBriefing(sparseData);
    expect(result.headline).toContain('Chacho');
    expect(result.observations.length).toBeGreaterThan(0);
  });
});
