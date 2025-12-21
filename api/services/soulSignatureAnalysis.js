/**
 * Soul Signature Analysis Service
 * Uses Claude AI to analyze extracted platform data and generate deep personality insights
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Main function: Analyze user's soul data and generate insights
 */
export async function analyzeSoulSignature(userId) {
  console.log(`[Soul Analysis] Starting analysis for user ${userId}...`);

  try {
    // 1. Fetch all soul_data for this user
    const soulData = await fetchUserSoulData(userId);

    if (!soulData || soulData.length === 0) {
      console.log('[Soul Analysis] No data to analyze yet');
      return { success: false, message: 'No data available for analysis' };
    }

    console.log(`[Soul Analysis] Found ${soulData.length} data entries across platforms`);

    // 2. Group data by platform
    const platformData = groupDataByPlatform(soulData);

    // 3. Analyze each platform separately and then create cross-platform insights
    const allInsights = [];

    // Analyze individual platforms
    for (const [platform, data] of Object.entries(platformData)) {
      console.log(`[Soul Analysis] Analyzing ${platform}...`);
      const insights = await analyzePlatformData(userId, platform, data);
      allInsights.push(...insights);
    }

    // DISABLED: Cross-platform synthesis (user feedback: keep insights platform-specific)
    // if (Object.keys(platformData).length > 1) {
    //   console.log('[Soul Analysis] Generating cross-platform synthesis...');
    //   const crossPlatformInsights = await generateCrossPlatformInsights(userId, platformData);
    //   allInsights.push(...crossPlatformInsights);
    // }

    // 4. Deduplicate similar insights to avoid overwhelming users
    const deduplicatedInsights = deduplicateInsights(allInsights);
    console.log(`[Soul Analysis] Deduplicated ${allInsights.length} → ${deduplicatedInsights.length} insights`);

    // 5. Store insights in database
    await storeInsights(userId, deduplicatedInsights);

    console.log(`[Soul Analysis] ✅ Generated ${allInsights.length} insights`);

    return {
      success: true,
      insightsGenerated: allInsights.length,
      platforms: Object.keys(platformData)
    };

  } catch (error) {
    console.error('[Soul Analysis] Error:', error);
    throw error;
  }
}

/**
 * Fetch all soul_data entries for a user
 */
async function fetchUserSoulData(userId) {
  const { data, error } = await supabaseAdmin
    .from('soul_data')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Soul Analysis] Error fetching soul_data:', error);
    throw error;
  }

  return data;
}

/**
 * Group soul_data by platform
 */
function groupDataByPlatform(soulData) {
  const grouped = {};

  for (const entry of soulData) {
    if (!grouped[entry.platform]) {
      grouped[entry.platform] = [];
    }
    grouped[entry.platform].push(entry);
  }

  return grouped;
}

/**
 * Analyze data from a single platform using Claude
 */
async function analyzePlatformData(userId, platform, dataEntries) {
  const insights = [];

  // Prepare data summary for Claude
  const dataSummary = dataEntries.map(entry => ({
    type: entry.data_type,
    items: Array.isArray(entry.raw_data?.items) ? entry.raw_data.items.length : 'N/A',
    sample: getSampleData(entry.raw_data, entry.data_type)
  }));

  // Create platform-specific prompt
  const prompt = createPlatformAnalysisPrompt(platform, dataSummary, dataEntries);

  try {
    // Call Claude for analysis
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const analysis = message.content[0].text;

    // Parse Claude's response and create structured insights
    const parsedInsights = parseClaudeAnalysis(analysis, platform);

    for (const insight of parsedInsights) {
      insights.push({
        userId,
        platforms: [platform],
        insightType: insight.type,
        title: insight.title,
        description: insight.description,
        analysis: {
          fullAnalysis: analysis,
          keyPoints: insight.keyPoints,
          patterns: insight.patterns
        },
        confidenceScore: insight.confidence,
        evidence: dataEntries.map(e => ({
          dataType: e.data_type,
          platform: e.platform,
          recordId: e.id
        }))
      });
    }

  } catch (error) {
    console.error(`[Soul Analysis] Error analyzing ${platform}:`, error);
  }

  return insights;
}

/**
 * Generate cross-platform synthesis insights
 */
async function generateCrossPlatformInsights(userId, platformData) {
  const insights = [];
  const platforms = Object.keys(platformData);

  // Create a summary of all platform data
  const crossPlatformSummary = {};
  for (const [platform, entries] of Object.entries(platformData)) {
    crossPlatformSummary[platform] = entries.map(e => ({
      type: e.data_type,
      preview: getSampleData(e.raw_data, e.data_type, true) // Get small preview
    }));
  }

  const prompt = `You are analyzing a person's "soul signature" - the authentic patterns that reveal who they truly are across multiple digital platforms.

You have data from these platforms: ${platforms.join(', ')}

Platform Data Overview:
${JSON.stringify(crossPlatformSummary, null, 2)}

Based on this cross-platform data, identify:

1. **Consistent Personality Traits**: What characteristics show up across ALL platforms?
2. **Curiosity Profile**: What topics/areas does this person consistently explore?
3. **Social Style**: How do they engage with communities across different contexts?
4. **Hidden Passions**: What interests might they not be fully aware of themselves?
5. **Behavioral Patterns**: What habits or routines emerge across platforms?

Respond in JSON format with an array of insights:
[
  {
    "type": "personality|interests|behavior_patterns|skills|social_style",
    "title": "Brief insight title",
    "description": "1 concise sentence that's emotionally resonant and avoids technical jargon",
    "keyPoints": ["point 1", "point 2", "point 3"],
    "patterns": ["observed pattern 1", "observed pattern 2"],
    "confidence": 0.85
  }
]

Make the insights feel authentic and meaningful - like something that would resonate deeply with the person.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const analysis = message.content[0].text;
    const parsedInsights = parseClaudeAnalysis(analysis, platforms.join('+'));

    for (const insight of parsedInsights) {
      insights.push({
        userId,
        platforms: platforms,
        insightType: insight.type,
        title: insight.title,
        description: insight.description,
        analysis: {
          fullAnalysis: analysis,
          keyPoints: insight.keyPoints,
          patterns: insight.patterns,
          crossPlatform: true
        },
        confidenceScore: insight.confidence,
        evidence: platforms.map(p => ({ platform: p, type: 'cross_platform_synthesis' }))
      });
    }

  } catch (error) {
    console.error('[Soul Analysis] Error generating cross-platform insights:', error);
  }

  return insights;
}

/**
 * Create platform-specific analysis prompt
 */
function createPlatformAnalysisPrompt(platform, dataSummary, fullData) {
  const platformPrompts = {
    github: `Analyze this developer's GitHub activity to reveal their technical soul signature.

Data available:
${JSON.stringify(dataSummary, null, 2)}

Focus on:
- What technologies and languages truly excite them?
- What problems do they naturally gravitate toward solving?
- Are they a builder, explorer, contributor, or curator?
- What does their activity reveal about their learning style?
- What communities and ecosystems do they engage with?

Sample of actual data:
${JSON.stringify(getSampleData(fullData[0]?.raw_data, 'repositories'), null, 2)}`,

    spotify: `Analyze this person's music listening patterns to reveal their emotional and cultural soul signature.

Data available:
${JSON.stringify(dataSummary, null, 2)}

Focus on:
- What moods and emotions do they explore through music?
- What does their music taste reveal about their personality?
- Are they a discoverer of new sounds or loyal to favorites?
- What cultural influences shape their identity?
- How does music fit into their daily life?`,

    discord: `Analyze this person's Discord presence to reveal their social and community soul signature.

Data available:
${JSON.stringify(dataSummary, null, 2)}

Focus on:
- What communities matter most to them?
- Are they a leader, contributor, lurker, or bridge-builder?
- What topics bring them into conversation?
- How do they balance different aspects of their identity?`,

    reddit: `Analyze this person's Reddit activity to reveal their curiosity and engagement soul signature.

Data available:
${JSON.stringify(dataSummary, null, 2)}

Focus on:
- What topics genuinely fascinate them?
- Do they ask questions, share knowledge, or observe?
- What communities do they trust and engage with?
- What does their saved content reveal about their values?`,

    twitch: `Analyze this person's Twitch activity to reveal their entertainment and community preferences.

Data available:
${JSON.stringify(dataSummary, null, 2)}

Focus on:
- What content and creators resonate with them?
- Are they entertained by skill, personality, or community?
- What does their viewing reveal about their interests?`
  };

  const basePrompt = platformPrompts[platform] || `Analyze this person's ${platform} data to reveal authentic patterns about who they are.

Data available:
${JSON.stringify(dataSummary, null, 2)}`;

  return `${basePrompt}

Respond in JSON format with an array of 2-4 insights:
[
  {
    "type": "personality|interests|behavior_patterns|skills|social_style",
    "title": "Brief insight title",
    "description": "1 concise sentence that's emotionally resonant and avoids technical jargon",
    "keyPoints": ["specific observation 1", "specific observation 2"],
    "patterns": ["behavioral pattern 1", "behavioral pattern 2"],
    "confidence": 0.85
  }
]

Make insights specific and authentic - avoid generic statements. Use simple, clear language that anyone can understand. Focus on what makes THIS person unique.`;
}

/**
 * Get sample data for analysis
 */
function getSampleData(rawData, dataType, small = false) {
  if (!rawData || !rawData.items) return null;

  const items = rawData.items;
  const sampleSize = small ? 3 : 10;

  // Return relevant fields based on data type
  return items.slice(0, sampleSize).map(item => {
    // GitHub repositories
    if (dataType === 'repositories') {
      return {
        name: item.name,
        description: item.description,
        language: item.language,
        stars: item.stargazers_count,
        topics: item.topics
      };
    }

    // GitHub starred
    if (dataType === 'starred') {
      return {
        name: item.name,
        description: item.description,
        language: item.language
      };
    }

    // Spotify top tracks
    if (dataType === 'top_tracks') {
      return {
        name: item.name,
        artist: item.artists?.[0]?.name,
        album: item.album?.name
      };
    }

    // Spotify top artists
    if (dataType === 'top_artists') {
      return {
        name: item.name,
        genres: item.genres
      };
    }

    // Discord guilds
    if (dataType === 'guilds') {
      return {
        name: item.name,
        memberCount: item.approximate_member_count
      };
    }

    // Generic fallback
    return item;
  });
}

/**
 * Parse Claude's JSON response into structured insights
 */
function parseClaudeAnalysis(analysisText, platform) {
  try {
    // Try to extract JSON from Claude's response
    const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: create a single generic insight
    return [{
      type: 'personality',
      title: `${platform} Soul Signature`,
      description: analysisText.substring(0, 300),
      keyPoints: ['Analysis completed'],
      patterns: [],
      confidence: 0.75
    }];
  } catch (error) {
    console.error('[Soul Analysis] Error parsing Claude response:', error);
    return [];
  }
}

/**
 * Deduplicate similar insights to avoid overwhelming users with repetitive content
 */
function deduplicateInsights(insights) {
  const seen = new Map();
  const deduplicated = [];

  for (const insight of insights) {
    // Create a similarity key based on type, title similarity, and platform
    const titleKey = insight.title.toLowerCase().trim();
    const typeKey = insight.insightType;
    const platformKey = insight.platforms.sort().join(',');

    // Check for very similar titles (edit distance / fuzzy matching)
    let isDuplicate = false;
    for (const [key, existingInsight] of seen.entries()) {
      const [existingTitle, existingType, existingPlatform] = key.split('|');

      // Same type and platform, check title similarity
      if (existingType === typeKey && existingPlatform === platformKey) {
        const similarity = calculateTitleSimilarity(titleKey, existingTitle);
        if (similarity > 0.7) { // 70% similar
          isDuplicate = true;
          // Keep the one with higher confidence
          if (insight.confidenceScore > existingInsight.confidenceScore) {
            // Replace with higher confidence version
            const index = deduplicated.findIndex(i => i.title === existingInsight.title);
            if (index !== -1) {
              deduplicated[index] = insight;
              seen.set(key, insight);
            }
          }
          break;
        }
      }
    }

    if (!isDuplicate) {
      const key = `${titleKey}|${typeKey}|${platformKey}`;
      seen.set(key, insight);
      deduplicated.push(insight);
    }
  }

  return deduplicated;
}

/**
 * Calculate title similarity (simple word overlap ratio)
 */
function calculateTitleSimilarity(title1, title2) {
  const words1 = new Set(title1.split(/\s+/));
  const words2 = new Set(title2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size; // Jaccard similarity
}

/**
 * Store insights in database
 */
async function storeInsights(userId, insights) {
  for (const insight of insights) {
    try {
      const { error } = await supabaseAdmin
        .from('soul_insights')
        .insert({
          user_id: insight.userId,
          platforms: insight.platforms,
          insight_type: insight.insightType,
          title: insight.title,
          description: insight.description,
          analysis: insight.analysis,
          confidence_score: insight.confidenceScore,
          evidence: insight.evidence,
          analyzed_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Soul Analysis] Error storing insight:', error);
      } else {
        console.log(`[Soul Analysis] ✅ Stored insight: ${insight.title}`);
      }
    } catch (error) {
      console.error('[Soul Analysis] Error storing insight:', error);
    }
  }
}

/**
 * Get existing insights for a user
 */
export async function getUserInsights(userId) {
  const { data, error } = await supabaseAdmin
    .from('soul_insights')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Soul Analysis] Error fetching insights:', error);
    throw error;
  }

  return data;
}

/**
 * Re-analyze specific platforms for a user
 */
export async function reanalyzePlatforms(userId, platforms) {
  console.log(`[Soul Analysis] Re-analyzing platforms: ${platforms.join(', ')}`);

  // Delete old insights for these platforms
  await supabaseAdmin
    .from('soul_insights')
    .delete()
    .eq('user_id', userId)
    .contains('platforms', platforms);

  // Run fresh analysis
  return await analyzeSoulSignature(userId);
}
