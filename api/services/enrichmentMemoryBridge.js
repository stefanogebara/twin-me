/**
 * Enrichment → Memory Stream Bridge
 *
 * Converts enrichment profile data into fact memories so the twin
 * can access everything discovered during onboarding from its very
 * first conversation.
 *
 * Cost: ~$0.01/onboarding (5-10 embeddings, zero LLM calls)
 */

import { getEnrichment } from './enrichment/enrichmentStore.js';
import { addMemory } from './memoryStreamService.js';

/**
 * Seed user_memories with facts derived from enriched_profiles.
 *
 * @param {string} userId - User UUID
 * @returns {{ success: boolean, memoriesStored: number }} Result
 */
async function seedMemoriesFromEnrichment(userId) {
  if (!userId) {
    return { success: false, memoriesStored: 0, error: 'userId required' };
  }

  try {
    const result = await getEnrichment(userId);

    if (!result.success || !result.data) {
      console.log(`[EnrichmentBridge] No enrichment data found for user ${userId}`);
      return { success: true, memoriesStored: 0 };
    }

    const profile = result.data;

    // Gate on identity confidence: don't auto-seed wrong-person data
    const confidence = profile.identity_confidence;
    if (confidence !== null && confidence !== undefined && confidence < 0.5 && !profile.user_confirmed) {
      console.log(`[EnrichmentBridge] Skipping memory seeding for user ${userId}: low confidence (${confidence}) and not user-confirmed`);
      return { success: true, memoriesStored: 0, skippedReason: 'low_confidence_unconfirmed' };
    }

    // Skip if this was a user-skipped record with no real data
    if (profile.source === 'user_skipped') {
      console.log(`[EnrichmentBridge] User ${userId} skipped enrichment, nothing to seed`);
      return { success: true, memoriesStored: 0 };
    }

    // Build memory entries from non-null fields
    const memoryEntries = [];

    // Name + Title + Company
    const nameParts = [];
    if (profile.discovered_name) nameParts.push(profile.discovered_name);
    if (profile.discovered_title && profile.discovered_company) {
      nameParts.push(`works as ${profile.discovered_title} at ${profile.discovered_company}`);
    } else if (profile.discovered_title) {
      nameParts.push(`works as ${profile.discovered_title}`);
    } else if (profile.discovered_company) {
      nameParts.push(`works at ${profile.discovered_company}`);
    }
    if (nameParts.length > 1) {
      memoryEntries.push({ content: nameParts.join(' '), importance: 7 });
    }

    // Location
    if (profile.discovered_location) {
      memoryEntries.push({
        content: `Based in ${profile.discovered_location}`,
        importance: 5,
      });
    }

    // Career timeline
    if (profile.career_timeline) {
      const career = typeof profile.career_timeline === 'string'
        ? profile.career_timeline
        : JSON.stringify(profile.career_timeline);
      memoryEntries.push({
        content: `Career history: ${career}`.substring(0, 2000),
        importance: 7,
      });
    }

    // Education
    if (profile.education) {
      const education = typeof profile.education === 'string'
        ? profile.education
        : JSON.stringify(profile.education);
      memoryEntries.push({
        content: `Education: ${education}`.substring(0, 2000),
        importance: 6,
      });
    }

    // Interests and hobbies
    if (profile.interests_and_hobbies) {
      const interests = typeof profile.interests_and_hobbies === 'string'
        ? profile.interests_and_hobbies
        : JSON.stringify(profile.interests_and_hobbies);
      memoryEntries.push({
        content: `Interests and hobbies: ${interests}`.substring(0, 2000),
        importance: 7,
      });
    }

    // Personality traits
    if (profile.personality_traits) {
      const traits = typeof profile.personality_traits === 'string'
        ? profile.personality_traits
        : JSON.stringify(profile.personality_traits);
      memoryEntries.push({
        content: `Personality traits: ${traits}`.substring(0, 2000),
        importance: 8,
      });
    }

    // Life story
    if (profile.life_story) {
      const story = typeof profile.life_story === 'string'
        ? profile.life_story
        : JSON.stringify(profile.life_story);
      memoryEntries.push({
        content: `Life story: ${story}`.substring(0, 2000),
        importance: 8,
      });
    }

    // Bio
    if (profile.discovered_bio) {
      memoryEntries.push({
        content: `Bio: ${profile.discovered_bio}`.substring(0, 2000),
        importance: 6,
      });
    }

    // Skills
    if (profile.skills && (!Array.isArray(profile.skills) || profile.skills.length > 0)) {
      const skills = typeof profile.skills === 'string'
        ? profile.skills
        : Array.isArray(profile.skills)
          ? profile.skills.join(', ')
          : JSON.stringify(profile.skills);
      if (skills.trim()) {
        memoryEntries.push({
          content: `Skills: ${skills}`.substring(0, 2000),
          importance: 5,
        });
      }
    }

    // Causes and values
    if (profile.causes_and_values) {
      const values = typeof profile.causes_and_values === 'string'
        ? profile.causes_and_values
        : JSON.stringify(profile.causes_and_values);
      memoryEntries.push({
        content: `Causes and values: ${values}`.substring(0, 2000),
        importance: 7,
      });
    }

    // GitHub tech identity (languages + top repos)
    if (profile.github_languages && Array.isArray(profile.github_languages) && profile.github_languages.length > 0) {
      memoryEntries.push({
        content: `Programs in: ${profile.github_languages.join(', ')}`,
        importance: 6,
      });
    }
    if (profile.github_top_repos && Array.isArray(profile.github_top_repos) && profile.github_top_repos.length > 0) {
      const repoDescriptions = profile.github_top_repos
        .map(r => `${r.name}${r.description ? ` - ${r.description}` : ''}${r.language ? ` (${r.language})` : ''}`)
        .join('; ');
      memoryEntries.push({
        content: `Notable GitHub projects: ${repoDescriptions}`.substring(0, 2000),
        importance: 6,
      });
    }

    // Social media presence from probed profiles
    if (profile.social_links && Array.isArray(profile.social_links) && profile.social_links.length > 0) {
      const platformList = profile.social_links.map(l => l.platform).join(', ');
      memoryEntries.push({
        content: `Active on social platforms: ${platformList}`,
        importance: 5,
      });
    }

    if (memoryEntries.length === 0) {
      console.log(`[EnrichmentBridge] No meaningful enrichment fields for user ${userId}`);
      return { success: true, memoriesStored: 0 };
    }

    // Store all memories in parallel
    const results = await Promise.all(
      memoryEntries.map(entry =>
        addMemory(userId, entry.content, 'fact', { source: 'enrichment' }, {
          skipImportance: true,
          importanceScore: entry.importance,
        })
      )
    );

    const stored = results.filter(Boolean).length;
    console.log(`[EnrichmentBridge] Seeded ${stored}/${memoryEntries.length} memories for user ${userId}`);

    return { success: true, memoriesStored: stored };
  } catch (error) {
    console.error(`[EnrichmentBridge] Error seeding memories for user ${userId}:`, error.message);
    return { success: false, memoriesStored: 0, error: error.message };
  }
}

export { seedMemoriesFromEnrichment };
