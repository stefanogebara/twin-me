/**
 * Comprehensive Platform Connector Configurations
 * Covers all 56 platforms across Streaming, Music, News, Health, Books, Food Delivery, and Social
 */

export const ALL_PLATFORM_CONFIGS = {
  // ========================================
  // 🎬 STREAMING PLATFORMS (9)
  // ========================================

  netflix: {
    id: 'netflix',
    name: 'Netflix',
    category: 'streaming',
    icon: '🔴',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'ratings', 'watchlist', 'profiles'],
    description: 'Watch history, ratings, and viewing preferences',
    apiConfig: null, // No public API
    extractionStrategy: 'browser_extension',
    soulInsights: ['narrative_preferences', 'binge_patterns', 'genre_diversity', 'rewatching_behavior']
  },

  disney_plus: {
    id: 'disney_plus',
    name: 'Disney+',
    category: 'streaming',
    icon: '🏰',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'continue_watching'],
    description: 'Family content preferences and nostalgia patterns',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['family_values', 'nostalgia_factor', 'animation_preferences']
  },

  hbo_max: {
    id: 'hbo_max',
    name: 'HBO Max',
    category: 'streaming',
    icon: '🎭',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'ratings'],
    description: 'Premium content preferences and sophisticated tastes',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['content_sophistication', 'prestige_drama_preference']
  },

  prime_video: {
    id: 'prime_video',
    name: 'Prime Video',
    category: 'streaming',
    icon: '📦',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'rentals', 'purchases'],
    description: 'Amazon video viewing and purchasing patterns',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['content_investment', 'indie_preferences', 'international_content']
  },

  apple_tv_plus: {
    id: 'apple_tv_plus',
    name: 'Apple TV+',
    category: 'streaming',
    icon: '🍎',
    integrationType: 'oauth',
    dataTypes: ['watch_history', 'watchlist', 'up_next'],
    description: 'Apple original content viewing patterns',
    apiConfig: {
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      scopes: ['user.media.read'],
      clientId: process.env.APPLE_TV_CLIENT_ID,
      clientSecret: process.env.APPLE_TV_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['premium_content_taste', 'apple_ecosystem_engagement']
  },

  hulu: {
    id: 'hulu',
    name: 'Hulu',
    category: 'streaming',
    icon: '🟢',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'my_stuff'],
    description: 'Current TV and streaming preferences',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['tv_show_dedication', 'current_events_interest']
  },

  paramount_plus: {
    id: 'paramount_plus',
    name: 'Paramount+',
    category: 'streaming',
    icon: '⛰️',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'favorites'],
    description: 'CBS and Paramount content preferences',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['sports_interest', 'news_consumption', 'reality_tv']
  },

  peacock: {
    id: 'peacock',
    name: 'Peacock',
    category: 'streaming',
    icon: '🦚',
    integrationType: 'browser_extension',
    dataTypes: ['watch_history', 'watchlist', 'continue_watching'],
    description: 'NBC and Universal content viewing',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['comedy_preferences', 'sports_engagement']
  },

  youtube: {
    id: 'youtube',
    name: 'YouTube',
    category: 'streaming',
    icon: '▶️',
    integrationType: 'oauth',
    dataTypes: ['watch_history', 'subscriptions', 'playlists', 'likes', 'comments', 'activities'],
    description: 'Learning interests, curiosity profile, creator loyalty, content preferences',
    apiConfig: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['curiosity_patterns', 'learning_style', 'entertainment_mix', 'creator_loyalty', 'Big Five Traits']
  },

  // ========================================
  // 🎵 MUSIC PLATFORMS (8)
  // ========================================

  spotify: {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    icon: '🎵',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'playlists', 'saved_tracks', 'top_artists', 'top_tracks', 'recent_tracks'],
    description: 'Discover your musical soul through your authentic listening habits, genre diversity, and emotional landscape',
    apiConfig: {
      authUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      scopes: [
        'user-read-recently-played',
        'user-top-read',
        'user-library-read',
        'user-read-playback-state',
        'playlist-read-private'
      ],
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['Musical Taste Profile', 'Mood Patterns', 'Discovery Behavior', 'Emotional Landscape', 'Big Five Traits']
  },

  apple_music: {
    id: 'apple_music',
    name: 'Apple Music',
    category: 'music',
    icon: '🍎',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'library', 'playlists', 'stations'],
    description: 'Curated tastes and premium music preferences',
    apiConfig: {
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      scopes: ['user.media.read'],
      clientId: process.env.APPLE_MUSIC_CLIENT_ID,
      clientSecret: process.env.APPLE_MUSIC_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['curation_preferences', 'lossless_audio_appreciation', 'apple_ecosystem']
  },

  deezer: {
    id: 'deezer',
    name: 'Deezer',
    category: 'music',
    icon: '🎵',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'favorite_tracks', 'playlists', 'flow'],
    description: 'International music taste and Flow algorithm preferences',
    apiConfig: {
      authUrl: 'https://connect.deezer.com/oauth/auth.php',
      tokenUrl: 'https://connect.deezer.com/oauth/access_token.php',
      scopes: ['basic_access', 'email', 'listening_history'],
      clientId: process.env.DEEZER_CLIENT_ID,
      clientSecret: process.env.DEEZER_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['international_music_taste', 'flow_engagement', 'regional_preferences']
  },

  soundcloud: {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    icon: '☁️',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'likes', 'playlists', 'following'],
    description: 'Independent and emerging artist preferences',
    apiConfig: {
      authUrl: 'https://soundcloud.com/connect',
      tokenUrl: 'https://api.soundcloud.com/oauth2/token',
      scopes: ['non-expiring'],
      clientId: process.env.SOUNDCLOUD_CLIENT_ID,
      clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['indie_music_taste', 'discovery_behavior', 'underground_scene']
  },

  tidal: {
    id: 'tidal',
    name: 'Tidal',
    category: 'music',
    icon: '🌊',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'favorite_tracks', 'playlists', 'hifi_usage'],
    description: 'High-fidelity audio preferences and artist support',
    apiConfig: {
      authUrl: 'https://auth.tidal.com/v1/oauth2/authorize',
      tokenUrl: 'https://auth.tidal.com/v1/oauth2/token',
      scopes: ['r_usr', 'w_usr'],
      clientId: process.env.TIDAL_CLIENT_ID,
      clientSecret: process.env.TIDAL_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['audiophile_tendencies', 'artist_support', 'hifi_appreciation']
  },

  youtube_music: {
    id: 'youtube_music',
    name: 'YouTube Music',
    category: 'music',
    icon: '🎶',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'playlists', 'uploads', 'likes'],
    description: 'Music discovery through video platform',
    apiConfig: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['video_music_preference', 'remix_culture', 'visual_music_engagement']
  },

  amazon_music: {
    id: 'amazon_music',
    name: 'Amazon Music',
    category: 'music',
    icon: '🎧',
    integrationType: 'oauth',
    dataTypes: ['listening_history', 'playlists', 'stations', 'podcasts'],
    description: 'Amazon ecosystem music preferences',
    apiConfig: {
      authUrl: 'https://www.amazon.com/ap/oa',
      tokenUrl: 'https://api.amazon.com/auth/o2/token',
      scopes: ['profile', 'music::catalog'],
      clientId: process.env.AMAZON_MUSIC_CLIENT_ID,
      clientSecret: process.env.AMAZON_MUSIC_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['prime_ecosystem_usage', 'alexa_integration', 'podcast_preferences']
  },

  pandora: {
    id: 'pandora',
    name: 'Pandora',
    category: 'music',
    icon: '📻',
    integrationType: 'oauth',
    dataTypes: ['stations', 'thumbs', 'bookmarks', 'listening_history'],
    description: 'Radio-style music discovery and curation',
    apiConfig: {
      authUrl: 'https://www.pandora.com/api/v1/auth/login',
      tokenUrl: 'https://www.pandora.com/api/v1/auth/token',
      scopes: ['user_read'],
      clientId: process.env.PANDORA_CLIENT_ID,
      clientSecret: process.env.PANDORA_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['passive_listening', 'discovery_through_radio', 'mood_stations']
  },

  // ========================================
  // 📰 NEWS & READING PLATFORMS (6)
  // ========================================

  nytimes: {
    id: 'nytimes',
    name: 'The New York Times',
    category: 'news',
    icon: '📰',
    integrationType: 'browser_extension',
    dataTypes: ['articles_read', 'saved_articles', 'topics_followed', 'reading_time'],
    description: 'News consumption and topic interests',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['news_depth', 'political_leanings', 'topic_interests', 'journalism_appreciation']
  },

  economist: {
    id: 'economist',
    name: 'The Economist',
    category: 'news',
    icon: '💼',
    integrationType: 'browser_extension',
    dataTypes: ['articles_read', 'espresso_engagement', 'sections_followed'],
    description: 'Global affairs and economic interests',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['global_perspective', 'economic_interest', 'analytical_reading']
  },

  wsj: {
    id: 'wsj',
    name: 'Wall Street Journal',
    category: 'news',
    icon: '📈',
    integrationType: 'browser_extension',
    dataTypes: ['articles_read', 'watchlist', 'market_data'],
    description: 'Business and financial news consumption',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['financial_literacy', 'market_engagement', 'business_acumen']
  },

  washington_post: {
    id: 'washington_post',
    name: 'Washington Post',
    category: 'news',
    icon: '🏛️',
    integrationType: 'browser_extension',
    dataTypes: ['articles_read', 'saved_stories', 'newsletters'],
    description: 'Political and investigative journalism interests',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['political_engagement', 'investigative_interest', 'democracy_values']
  },

  bloomberg: {
    id: 'bloomberg',
    name: 'Bloomberg',
    category: 'news',
    icon: '💹',
    integrationType: 'browser_extension',
    dataTypes: ['articles_read', 'terminal_usage', 'market_watch'],
    description: 'Financial markets and business intelligence',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['market_sophistication', 'data_driven_decisions', 'professional_finance']
  },

  medium: {
    id: 'medium',
    name: 'Medium',
    category: 'news',
    icon: 'Ⓜ️',
    integrationType: 'oauth',
    dataTypes: ['articles_read', 'claps', 'highlights', 'following', 'publications'],
    description: 'Thought leadership and diverse perspectives',
    apiConfig: {
      authUrl: 'https://medium.com/m/oauth/authorize',
      tokenUrl: 'https://api.medium.com/v1/tokens',
      scopes: ['basicProfile', 'listPublications', 'publishPost'],
      clientId: process.env.MEDIUM_CLIENT_ID,
      clientSecret: process.env.MEDIUM_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['intellectual_curiosity', 'niche_interests', 'curation_taste']
  },

  // ========================================
  // 🏃 HEALTH & FITNESS PLATFORMS (6)
  // ========================================

  whoop: {
    id: 'whoop',
    name: 'Whoop',
    category: 'health',
    icon: '⚡',
    integrationType: 'oauth',
    dataTypes: ['strain', 'recovery', 'sleep', 'hrv', 'workouts'],
    description: 'Performance optimization and recovery tracking',
    apiConfig: {
      authUrl: 'https://api.prod.whoop.com/oauth/authorize',
      tokenUrl: 'https://api.prod.whoop.com/oauth/token',
      scopes: ['read:profile', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout'],
      clientId: process.env.WHOOP_CLIENT_ID,
      clientSecret: process.env.WHOOP_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['optimization_mindset', 'recovery_awareness', 'performance_tracking']
  },

  strava: {
    id: 'strava',
    name: 'Strava',
    category: 'health',
    icon: '🏃',
    integrationType: 'mcp',
    dataTypes: ['activities', 'routes', 'achievements', 'social_interactions'],
    description: 'Running, cycling, and athletic community engagement',
    apiConfig: {
      authUrl: 'https://www.strava.com/oauth/authorize',
      tokenUrl: 'https://www.strava.com/oauth/token',
      scopes: ['read', 'activity:read_all', 'profile:read_all'],
      clientId: process.env.STRAVA_CLIENT_ID,
      clientSecret: process.env.STRAVA_CLIENT_SECRET
    },
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-strava',
    soulInsights: ['athletic_commitment', 'competitive_nature', 'outdoor_preference', 'social_fitness']
  },

  fitbit: {
    id: 'fitbit',
    name: 'Fitbit',
    category: 'health',
    icon: '📊',
    integrationType: 'oauth',
    dataTypes: ['steps', 'heart_rate', 'sleep', 'exercise', 'nutrition'],
    description: 'Daily activity and health metrics tracking',
    apiConfig: {
      authUrl: 'https://www.fitbit.com/oauth2/authorize',
      tokenUrl: 'https://api.fitbit.com/oauth2/token',
      scopes: ['activity', 'heartrate', 'location', 'nutrition', 'profile', 'settings', 'sleep', 'social', 'weight'],
      clientId: process.env.FITBIT_CLIENT_ID,
      clientSecret: process.env.FITBIT_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['health_consciousness', 'routine_consistency', 'wellness_priorities']
  },

  peloton: {
    id: 'peloton',
    name: 'Peloton',
    category: 'health',
    icon: '🚴',
    integrationType: 'oauth',
    dataTypes: ['workouts', 'achievements', 'leaderboard', 'classes_taken'],
    description: 'Connected fitness and class participation',
    apiConfig: {
      authUrl: 'https://api.onepeloton.com/auth/login',
      tokenUrl: 'https://api.onepeloton.com/auth/token',
      scopes: ['user.read'],
      clientId: process.env.PELOTON_CLIENT_ID,
      clientSecret: process.env.PELOTON_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['boutique_fitness', 'instructor_loyalty', 'competitive_workouts']
  },

  apple_health: {
    id: 'apple_health',
    name: 'Apple Health',
    category: 'health',
    icon: '❤️',
    integrationType: 'mcp',
    dataTypes: ['workouts', 'steps', 'heart_rate', 'sleep', 'mindfulness'],
    description: 'Comprehensive health and wellness data',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-apple-health',
    soulInsights: ['holistic_health', 'apple_ecosystem', 'wellness_tracking']
  },

  myfitnesspal: {
    id: 'myfitnesspal',
    name: 'MyFitnessPal',
    category: 'health',
    icon: '🍎',
    integrationType: 'oauth',
    dataTypes: ['food_diary', 'exercise', 'weight', 'measurements'],
    description: 'Nutrition tracking and calorie management',
    apiConfig: {
      authUrl: 'https://www.myfitnesspal.com/oauth2/authorize',
      tokenUrl: 'https://www.myfitnesspal.com/oauth2/token',
      scopes: ['diary', 'measurement'],
      clientId: process.env.MFP_CLIENT_ID,
      clientSecret: process.env.MFP_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['nutrition_awareness', 'calorie_tracking', 'diet_discipline']
  },

  // ========================================
  // 📚 BOOKS & LEARNING PLATFORMS (5)
  // ========================================

  goodreads: {
    id: 'goodreads',
    name: 'Goodreads',
    category: 'books',
    icon: '📚',
    integrationType: 'oauth',
    dataTypes: ['books_read', 'currently_reading', 'want_to_read', 'reviews', 'ratings'],
    description: 'Reading preferences and literary taste',
    apiConfig: {
      authUrl: 'https://www.goodreads.com/oauth/authorize',
      tokenUrl: 'https://www.goodreads.com/oauth/access_token',
      scopes: [],
      clientId: process.env.GOODREADS_CLIENT_ID,
      clientSecret: process.env.GOODREADS_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['reading_volume', 'genre_preferences', 'literary_taste', 'review_depth']
  },

  kindle: {
    id: 'kindle',
    name: 'Kindle',
    category: 'books',
    icon: '📖',
    integrationType: 'mcp',
    dataTypes: ['books', 'highlights', 'notes', 'reading_progress'],
    description: 'Digital reading habits and highlighting patterns',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-kindle',
    soulInsights: ['digital_reading', 'annotation_style', 'reading_completion', 'highlight_patterns']
  },

  duolingo: {
    id: 'duolingo',
    name: 'Duolingo',
    category: 'learning',
    icon: '🦉',
    integrationType: 'mcp',
    dataTypes: ['lessons', 'streaks', 'achievements', 'progress', 'languages'],
    description: 'Language learning commitment and progress',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-duolingo',
    soulInsights: ['learning_consistency', 'multilingual_interest', 'gamification_response']
  },

  coursera: {
    id: 'coursera',
    name: 'Coursera',
    category: 'learning',
    icon: '🎓',
    integrationType: 'oauth',
    dataTypes: ['courses_enrolled', 'certificates', 'progress', 'specializations'],
    description: 'Professional development and skill acquisition',
    apiConfig: {
      authUrl: 'https://accounts.coursera.org/oauth2/v1/auth',
      tokenUrl: 'https://accounts.coursera.org/oauth2/v1/token',
      scopes: ['view_profile'],
      clientId: process.env.COURSERA_CLIENT_ID,
      clientSecret: process.env.COURSERA_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['continuous_learning', 'skill_investment', 'career_development']
  },

  udemy: {
    id: 'udemy',
    name: 'Udemy',
    category: 'learning',
    icon: '💻',
    integrationType: 'oauth',
    dataTypes: ['courses_purchased', 'progress', 'certificates', 'reviews'],
    description: 'Self-directed learning and skill interests',
    apiConfig: {
      authUrl: 'https://www.udemy.com/api-2.0/auth',
      tokenUrl: 'https://www.udemy.com/api-2.0/oauth2/token',
      scopes: ['user:read'],
      clientId: process.env.UDEMY_CLIENT_ID,
      clientSecret: process.env.UDEMY_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['practical_learning', 'diverse_interests', 'completion_rate']
  },

  // ========================================
  // 🍔 FOOD DELIVERY PLATFORMS (7)
  // ========================================

  doordash: {
    id: 'doordash',
    name: 'DoorDash',
    category: 'food',
    icon: '🚪',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorite_restaurants', 'cuisines', 'order_frequency'],
    description: 'Food delivery preferences and dining habits',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['cuisine_preferences', 'dining_frequency', 'spending_patterns', 'adventurousness']
  },

  uber_eats: {
    id: 'uber_eats',
    name: 'Uber Eats',
    category: 'food',
    icon: '🍔',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorites', 'reorders', 'ratings'],
    description: 'Food ordering patterns and taste preferences',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['comfort_food', 'variety_seeking', 'late_night_habits']
  },

  ifood: {
    id: 'ifood',
    name: 'iFood',
    category: 'food',
    icon: '🍕',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorite_places', 'categories', 'reviews'],
    description: 'Brazilian food delivery preferences',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['regional_cuisine', 'local_favorites', 'ordering_time_patterns']
  },

  glovo: {
    id: 'glovo',
    name: 'Glovo',
    category: 'food',
    icon: '🛵',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorites', 'delivery_addresses', 'product_categories'],
    description: 'European food and grocery delivery',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['convenience_seeking', 'grocery_vs_restaurant', 'international_taste']
  },

  rappi: {
    id: 'rappi',
    name: 'Rappi',
    category: 'food',
    icon: '🏍️',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorites', 'categories', 'rappi_credits'],
    description: 'Latin American delivery ecosystem',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['platform_loyalty', 'diverse_ordering', 'regional_preferences']
  },

  postmates: {
    id: 'postmates',
    name: 'Postmates',
    category: 'food',
    icon: '📮',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'favorites', 'unlimited_usage'],
    description: 'On-demand delivery preferences',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['convenience_premium', 'delivery_frequency', 'non_food_orders']
  },

  grubhub: {
    id: 'grubhub',
    name: 'Grubhub',
    category: 'food',
    icon: '🍽️',
    integrationType: 'browser_extension',
    dataTypes: ['orders', 'saved_restaurants', 'order_history'],
    description: 'Restaurant delivery and pickup habits',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['restaurant_loyalty', 'pickup_vs_delivery', 'reward_optimization']
  },

  // ========================================
  // 💬 SOCIAL & MESSAGING PLATFORMS (12)
  // ========================================

  instagram: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: '📷',
    integrationType: 'browser_extension',
    dataTypes: ['posts', 'stories', 'likes', 'saved', 'following', 'dms'],
    description: 'Visual content preferences and aesthetic taste',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['aesthetic_preferences', 'visual_curation', 'content_creation', 'engagement_patterns']
  },

  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'messaging',
    icon: '💬',
    integrationType: 'mcp',
    dataTypes: ['messages', 'media', 'groups', 'calls'],
    description: 'Primary messaging and communication patterns',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-whatsapp',
    soulInsights: ['communication_frequency', 'group_dynamics', 'media_sharing', 'response_time']
  },

  telegram: {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    icon: '✈️',
    integrationType: 'mcp',
    dataTypes: ['messages', 'channels', 'groups', 'bots'],
    description: 'Privacy-focused messaging and channel subscriptions',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-telegram',
    soulInsights: ['privacy_awareness', 'community_interests', 'bot_usage', 'channel_preferences']
  },

  discord: {
    id: 'discord',
    name: 'Discord',
    category: 'messaging',
    icon: '💜',
    integrationType: 'oauth',
    dataTypes: ['guilds', 'connections', 'user_profile'],
    description: 'Gaming and community engagement',
    apiConfig: {
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      scopes: ['identify', 'guilds', 'connections'],
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['community_participation', 'gaming_social', 'server_diversity', 'cross_platform_connections', 'Big Five Traits']
  },

  slack: {
    id: 'slack',
    name: 'Slack',
    category: 'messaging',
    icon: '💼',
    integrationType: 'mcp',
    dataTypes: ['messages', 'channels', 'reactions', 'files'],
    description: 'Professional communication and collaboration',
    apiConfig: {
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['channels:history', 'channels:read', 'users:read'],
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET
    },
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-slack',
    soulInsights: ['work_communication', 'collaboration_style', 'emoji_usage', 'response_patterns']
  },

  imessage: {
    id: 'imessage',
    name: 'iMessage',
    category: 'messaging',
    icon: '💙',
    integrationType: 'browser_extension',
    dataTypes: ['messages', 'reactions', 'media', 'groups'],
    description: 'Apple ecosystem messaging patterns',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['ios_ecosystem', 'close_contacts', 'media_sharing', 'reaction_style']
  },

  facebook: {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    icon: '👥',
    integrationType: 'oauth',
    dataTypes: ['posts', 'likes', 'comments', 'groups', 'events'],
    description: 'Social connections and content engagement',
    apiConfig: {
      authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
      scopes: ['email', 'public_profile', 'user_posts', 'user_likes'],
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['social_network', 'content_sharing', 'group_interests', 'event_attendance']
  },

  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    category: 'social',
    icon: '🐦',
    integrationType: 'mcp',
    dataTypes: ['tweets', 'likes', 'retweets', 'following', 'lists'],
    description: 'Real-time interests and thought leadership',
    apiConfig: {
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      scopes: ['tweet.read', 'users.read', 'like.read'],
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET
    },
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-twitter',
    soulInsights: ['news_consumption', 'opinion_expression', 'network_influence', 'engagement_style']
  },

  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    icon: '🎵',
    integrationType: 'browser_extension',
    dataTypes: ['liked_videos', 'saved', 'following', 'watch_time'],
    description: 'Short-form content preferences and trends',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['content_taste', 'trend_participation', 'creator_following', 'engagement_depth']
  },

  snapchat: {
    id: 'snapchat',
    name: 'Snapchat',
    category: 'social',
    icon: '👻',
    integrationType: 'browser_extension',
    dataTypes: ['stories', 'snaps', 'friends', 'spotlight'],
    description: 'Ephemeral content and close connections',
    apiConfig: null,
    extractionStrategy: 'browser_extension',
    soulInsights: ['ephemeral_sharing', 'close_friends', 'ar_engagement', 'content_creation']
  },

  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    icon: '💼',
    integrationType: 'mcp',
    dataTypes: ['posts', 'connections', 'articles', 'endorsements', 'job_activity'],
    description: 'Professional network and career interests',
    apiConfig: {
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET
    },
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-linkedin',
    soulInsights: ['professional_brand', 'career_interests', 'thought_leadership', 'networking_style']
  },

  reddit: {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    icon: '🤖',
    integrationType: 'oauth',
    dataTypes: ['posts', 'comments', 'saved', 'subreddits', 'upvotes'],
    description: 'Community interests and discussion participation',
    apiConfig: {
      authUrl: 'https://www.reddit.com/api/v1/authorize',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
      scopes: ['identity', 'mysubreddits', 'read', 'history'],
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['niche_interests', 'community_depth', 'discussion_style', 'expertise_areas', 'Big Five Traits']
  },

  // ========================================
  // 🎮 ADDITIONAL PLATFORMS
  // ========================================

  github: {
    id: 'github',
    name: 'GitHub',
    category: 'productivity',
    icon: '🐙',
    integrationType: 'oauth',
    dataTypes: ['repositories', 'contributions', 'stars', 'pull_requests', 'issues'],
    description: 'Technical skills and coding patterns',
    apiConfig: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['user', 'repo', 'read:org'],
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    },
    extractionStrategy: 'oauth',
    soulInsights: ['technical_expertise', 'coding_style', 'open_source_engagement', 'collaboration_patterns']
  },

  steam: {
    id: 'steam',
    name: 'Steam',
    category: 'gaming',
    icon: '🎮',
    integrationType: 'mcp',
    dataTypes: ['games', 'playtime', 'achievements', 'friends', 'wishlist'],
    description: 'PC gaming preferences and commitment',
    apiConfig: null,
    extractionStrategy: 'mcp',
    mcpServer: '@modelcontextprotocol/server-steam',
    soulInsights: ['gaming_dedication', 'genre_preferences', 'completion_rate', 'social_gaming']
  }
};

// Helper functions
export function getPlatformsByCategory(category) {
  return Object.values(ALL_PLATFORM_CONFIGS)
    .filter(platform => platform.category === category);
}

export function getPlatformsByIntegrationType(integrationType) {
  return Object.values(ALL_PLATFORM_CONFIGS)
    .filter(platform => platform.integrationType === integrationType);
}

export function getAllCategories() {
  return [...new Set(Object.values(ALL_PLATFORM_CONFIGS).map(p => p.category))];
}

export function getPlatformConfig(platformId) {
  return ALL_PLATFORM_CONFIGS[platformId] || null;
}

export function getPlatformStats() {
  const all = Object.values(ALL_PLATFORM_CONFIGS);
  return {
    total: all.length,
    byCategory: {
      streaming: all.filter(p => p.category === 'streaming').length,
      music: all.filter(p => p.category === 'music').length,
      news: all.filter(p => p.category === 'news').length,
      health: all.filter(p => p.category === 'health').length,
      books: all.filter(p => p.category === 'books').length,
      learning: all.filter(p => p.category === 'learning').length,
      food: all.filter(p => p.category === 'food').length,
      messaging: all.filter(p => p.category === 'messaging').length,
      social: all.filter(p => p.category === 'social').length,
      productivity: all.filter(p => p.category === 'productivity').length,
      gaming: all.filter(p => p.category === 'gaming').length
    },
    byIntegrationType: {
      mcp: all.filter(p => p.integrationType === 'mcp').length,
      oauth: all.filter(p => p.integrationType === 'oauth').length,
      browser_extension: all.filter(p => p.integrationType === 'browser_extension').length
    }
  };
}
