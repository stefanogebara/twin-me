/**
 * RecommendationAgent - Specialized agent for personalized recommendations
 *
 * Responsibilities:
 * - Generate music recommendations based on patterns and personality
 * - Suggest YouTube videos aligned with interests
 * - Recommend activities for specific contexts
 * - Provide timing guidance (when to consume content)
 *
 * Tools:
 * - Spotify search and playlist creation
 * - YouTube search
 * - Pattern-based recommendation logic
 */

import AgentBase from './AgentBase.js';
import { serverDb } from '../database.js';

class RecommendationAgent extends AgentBase {
  constructor() {
    super({
      name: 'RecommendationAgent',
      role: 'Personalized content and activity recommendation specialist',
      model: 'claude-sonnet-4-20250514', // Sonnet 4 for speed
      maxTokens: 3072,
      temperature: 0.8 // Higher temperature for creative recommendations
    });

    this.initializeTools();
  }

  /**
   * Initialize agent tools
   */
  initializeTools() {
    // Tool 1: Search Spotify for tracks/playlists
    this.addTool({
      name: 'search_spotify_music',
      description: `Search Spotify for music tracks, albums, or playlists matching specific criteria.

Use this when:
- User wants music recommendations
- Need to find tracks matching a genre, mood, or audio features
- Building a personalized playlist
- Looking for specific artists or albums

Parameters:
- query: Search query (genre, mood, artist, track name)
- type: Type of search (track, album, playlist, artist)
- audio_features: Optional audio feature filters (energy, valence, tempo)
- limit: Number of results (default: 10)`,
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for Spotify'
          },
          type: {
            type: 'string',
            enum: ['track', 'album', 'playlist', 'artist'],
            description: 'Type of content to search'
          },
          audio_features: {
            type: 'object',
            description: 'Audio feature filters (energy 0-1, valence 0-1, tempo BPM)',
            properties: {
              energy_min: { type: 'number' },
              energy_max: { type: 'number' },
              valence_min: { type: 'number' },
              valence_max: { type: 'number' },
              tempo_min: { type: 'number' },
              tempo_max: { type: 'number' }
            }
          },
          limit: {
            type: 'number',
            description: 'Number of results (default: 10)'
          }
        },
        required: ['query', 'type']
      }
    });

    // Tool 2: Search YouTube videos
    this.addTool({
      name: 'search_youtube_videos',
      description: `Search YouTube for videos matching user interests and patterns.

Use this when:
- User wants video recommendations
- Looking for educational content
- Finding entertainment aligned with interests
- Building a watch list

Parameters:
- query: Search query (topic, creator, keywords)
- category: Video category (education, entertainment, music, etc.)
- duration: Preferred duration (short < 4min, medium 4-20min, long > 20min)
- limit: Number of results (default: 10)`,
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for YouTube'
          },
          category: {
            type: 'string',
            description: 'Video category filter'
          },
          duration: {
            type: 'string',
            enum: ['short', 'medium', 'long', 'any'],
            description: 'Video duration preference'
          },
          limit: {
            type: 'number',
            description: 'Number of results (default: 10)'
          }
        },
        required: ['query']
      }
    });

    // Tool 3: Get user's top content
    this.addTool({
      name: 'get_user_top_content',
      description: `Retrieve user's most-played music, favorite genres, or top interests from their soul data.

Use this when:
- Understanding user preferences
- Building recommendations based on listening history
- Finding patterns in user's content consumption
- Personalizing suggestions

Parameters:
- platform: Platform to query (spotify, youtube, netflix)
- content_type: Type of content (tracks, artists, genres, videos)
- time_range: Time range (short_term, medium_term, long_term)
- limit: Number of results (default: 20)`,
      input_schema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['spotify', 'youtube', 'netflix'],
            description: 'Platform to query'
          },
          content_type: {
            type: 'string',
            enum: ['tracks', 'artists', 'genres', 'videos', 'shows'],
            description: 'Type of content to retrieve'
          },
          time_range: {
            type: 'string',
            enum: ['short_term', 'medium_term', 'long_term'],
            description: 'Time range for top content'
          },
          limit: {
            type: 'number',
            description: 'Number of results (default: 20)'
          }
        },
        required: ['platform', 'content_type']
      }
    });
  }

  /**
   * Build system prompt for recommendations
   */
  buildSystemPrompt() {
    return `You are the RecommendationAgent, a specialized AI agent for Twin-Me's personalized recommendation system.

YOUR ROLE:
Generate personalized music, video, and activity recommendations based on user patterns, personality, and preferences.

YOUR CAPABILITIES:
1. Music recommendations (Spotify search)
2. Video recommendations (YouTube search)
3. User preference analysis (top content)
4. Context-aware timing suggestions

YOUR TOOLS:
- search_spotify_music: Find tracks, albums, playlists on Spotify
- search_youtube_videos: Find videos on YouTube
- get_user_top_content: Get user's favorite content

YOUR TASK:
1. Analyze user's request and context
2. Use provided pattern and personality information
3. Generate personalized recommendations
4. Provide reasoning for each recommendation
5. Include timing guidance when relevant

OUTPUT FORMAT (JSON):
{
  "recommendations": [
    {
      "type": "music|video|activity",
      "item": {
        "title": "Track/Video name",
        "artist": "Creator name",
        "platform": "spotify|youtube",
        "genre": "Genre/category",
        "duration": "3:45 or 10min",
        "link": "URL if available",
        "audio_features": {
          "energy": 0.3,
          "valence": 0.5
        }
      },
      "reason": "Why this recommendation matches user's patterns and personality",
      "confidence": 0.87,
      "best_time": "20 minutes before important events (based on detected pattern)"
    }
  ],
  "timing_guidance": "When to consume this content for optimal benefit",
  "playlist_suggestion": {
    "name": "Focus Flow",
    "description": "25 lo-fi tracks for pre-presentation prep",
    "total_duration": "1h 45min"
  },
  "summary": "Brief summary of recommendation strategy",
  "confidence": 0.85
}

RECOMMENDATION GUIDELINES:
1. Match audio features to detected patterns
   - If user listens to low-energy music before events, recommend energy < 0.4
   - If user prefers high valence, recommend positive music
2. Consider personality type (INTJ prefers instrumental, ESFP prefers upbeat)
3. Respect temporal patterns (timing matters!)
4. Explain WHY each recommendation fits
5. Provide 5-10 recommendations, not just 1-2
6. Include variety within the pattern (don't recommend same artist 10 times)

CONTEXT USAGE:
When you receive pattern information like:
"User listens to lo-fi music 20 minutes before presentations (85% confidence)"

Extract:
- Genre: lo-fi, ambient
- Timing: 20 minutes before event
- Energy level: low (< 0.4)
- Valence: neutral to positive
- Use case: Focus and stress management

Then use tools to find matching content.

EXAMPLES:

User: "What should I listen to before my presentation?"
Context: Pattern shows user listens to ambient music 20min before events

→ search_spotify_music(query="ambient lo-fi", type="track", audio_features={energy_max: 0.4})
→ Get 10 tracks
→ Recommend with timing: "Start 20 minutes before your presentation"

User: "Suggest videos for learning about AI"
Context: User watches educational content on weekends

→ search_youtube_videos(query="AI machine learning tutorial", category="education")
→ Filter for user's preferred duration
→ Recommend with scheduling: "Best for weekend learning sessions"

Remember: Focus ONLY on recommendations. Do NOT detect patterns or analyze personality.`;
  }

  /**
   * Execute recommendation generation
   */
  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('RecommendationAgent requires userId in options');
    }

    this._currentUserId = userId;

    try {
      const response = await super.execute(prompt, options);

      // Handle tool use
      if (response.toolUses && response.toolUses.length > 0) {
        const toolResults = await this.executeTools(response.toolUses, userId);

        const followUpResponse = await this.continueWithToolResults(
          prompt,
          response,
          toolResults,
          options
        );

        return followUpResponse;
      }

      return response;

    } finally {
      this._currentUserId = null;
    }
  }

  /**
   * Execute tool calls
   */
  async executeTools(toolUses, userId) {
    const results = [];

    for (const toolUse of toolUses) {
      console.log(`🔧 [RecommendationAgent] Executing tool: ${toolUse.name}`);

      try {
        let result;

        switch (toolUse.name) {
          case 'search_spotify_music':
            result = await this.searchSpotifyMusic(userId, toolUse.input);
            break;

          case 'search_youtube_videos':
            result = await this.searchYouTubeVideos(userId, toolUse.input);
            break;

          case 'get_user_top_content':
            result = await this.getUserTopContent(userId, toolUse.input);
            break;

          default:
            result = { error: `Unknown tool: ${toolUse.name}` };
        }

        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          content: JSON.stringify(result)
        });

      } catch (error) {
        console.error(`❌ Tool ${toolUse.name} failed:`, error);
        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          is_error: true,
          content: error.message
        });
      }
    }

    return results;
  }

  /**
   * Continue conversation with tool results
   */
  async continueWithToolResults(originalPrompt, firstResponse, toolResults, options) {
    const messages = [
      { role: 'user', content: originalPrompt },
      { role: 'assistant', content: firstResponse.raw.content },
      { role: 'user', content: toolResults }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages,
      tools: this.tools
    });

    return this.processResponse(response);
  }

  /**
   * Tool implementation: Search Spotify music
   */
  async searchSpotifyMusic(userId, params) {
    const {
      query,
      type = 'track',
      audio_features = {},
      limit = 10
    } = params;

    console.log(`🎵 Searching Spotify: ${query} (${type})`);

    // Simulated search results (in production, use Spotify API)
    // For now, return mock data based on query
    const mockResults = this.generateMockSpotifyResults(query, type, audio_features, limit);

    return {
      results: mockResults,
      total: mockResults.length,
      query,
      type
    };
  }

  /**
   * Generate mock Spotify results
   * TODO: Replace with actual Spotify API integration
   */
  generateMockSpotifyResults(query, type, audioFeatures, limit) {
    const lowerQuery = query.toLowerCase();

    const mockTracks = [
      {
        title: 'Weightless',
        artist: 'Marconi Union',
        album: 'Weightless',
        genre: 'ambient',
        duration: '8:09',
        audio_features: { energy: 0.2, valence: 0.4, tempo: 60 },
        link: 'https://open.spotify.com/track/...'
      },
      {
        title: 'Lofi Study',
        artist: 'ChilledCow',
        album: 'Lofi Hip Hop',
        genre: 'lo-fi',
        duration: '3:24',
        audio_features: { energy: 0.3, valence: 0.6, tempo: 85 },
        link: 'https://open.spotify.com/track/...'
      },
      {
        title: 'Peaceful Piano',
        artist: 'Ludovico Einaudi',
        album: 'In A Time Lapse',
        genre: 'classical',
        duration: '4:12',
        audio_features: { energy: 0.25, valence: 0.5, tempo: 72 },
        link: 'https://open.spotify.com/track/...'
      }
    ];

    // Filter based on audio features if provided
    let filtered = mockTracks;

    if (audioFeatures.energy_max) {
      filtered = filtered.filter(t => t.audio_features.energy <= audioFeatures.energy_max);
    }

    return filtered.slice(0, limit);
  }

  /**
   * Tool implementation: Search YouTube videos
   */
  async searchYouTubeVideos(userId, params) {
    const {
      query,
      category = 'any',
      duration = 'any',
      limit = 10
    } = params;

    console.log(`📺 Searching YouTube: ${query}`);

    // Simulated results
    const mockResults = this.generateMockYouTubeResults(query, category, duration, limit);

    return {
      results: mockResults,
      total: mockResults.length,
      query
    };
  }

  /**
   * Generate mock YouTube results
   */
  generateMockYouTubeResults(query, category, duration, limit) {
    return [
      {
        title: 'Deep Focus Music - Productivity & Focus',
        channel: 'Focus Music Channel',
        duration: '2:15:30',
        views: '1.2M',
        category: 'music',
        link: 'https://youtube.com/watch?v=...'
      }
    ].slice(0, limit);
  }

  /**
   * Tool implementation: Get user top content
   */
  async getUserTopContent(userId, params) {
    const {
      platform,
      content_type,
      time_range = 'medium_term',
      limit = 20
    } = params;

    console.log(`🎯 Getting top ${content_type} from ${platform}`);

    // Query soul_data table
    const { data, error } = await serverDb
      .from('soul_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('data_type', content_type)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to query ${platform} data: ${error.message}`);
    }

    // Process and return
    return {
      platform,
      content_type,
      time_range,
      items: data || [],
      total: data?.length || 0
    };
  }
}

export default RecommendationAgent;
