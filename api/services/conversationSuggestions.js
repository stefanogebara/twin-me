/**
 * Conversation Suggestions Service
 *
 * Generates contextual conversation starters and follow-ups
 * inspired by Inflection AI's suggestion cards.
 * Suggestions are dynamic based on user's soul data and conversation flow.
 */

/**
 * Generate conversation suggestions based on context
 * @param {Object} options - Generation options
 * @param {string} options.userId - User ID
 * @param {Array} options.messages - Recent conversation messages
 * @param {Object} options.soulData - User's soul data
 * @param {string} options.twinMode - Current twin mode
 * @param {string} options.conversationContext - Current context
 * @returns {Array} Array of suggestion objects
 */
export function generateConversationSuggestions(options) {
  const {
    userId,
    messages = [],
    soulData = [],
    twinMode = 'personal',
    conversationContext = 'casual'
  } = options;

  const suggestions = [];

  // If no messages yet (start of conversation), provide discovery prompts
  if (messages.length === 0) {
    suggestions.push(...getInitialSuggestions(soulData, twinMode));
  } else {
    // Generate context-aware follow-ups based on last message
    suggestions.push(...getFollowUpSuggestions(messages, soulData, twinMode));
  }

  // Shuffle and return top 3-4 suggestions
  return shuffleArray(suggestions).slice(0, 4);
}

/**
 * Get initial conversation starters based on soul data
 */
function getInitialSuggestions(soulData, twinMode) {
  const suggestions = [];

  // Group soul data by platform
  const platforms = {};
  soulData.forEach(item => {
    if (!platforms[item.platform]) platforms[item.platform] = [];
    platforms[item.platform].push(item);
  });

  // Spotify suggestions
  if (platforms.spotify && platforms.spotify.length > 0) {
    const topArtists = platforms.spotify
      .filter(d => d.data_type === 'top_artist')
      .slice(0, 3);

    if (topArtists.length > 0) {
      const artist = topArtists[0].raw_data?.name;
      suggestions.push({
        text: `What's the vibe with ${artist}?`,
        category: 'music',
        icon: '🎵'
      });
      suggestions.push({
        text: "What's been on repeat lately?",
        category: 'music',
        icon: '🎧'
      });
    }

    const recentTracks = platforms.spotify
      .filter(d => d.data_type === 'recently_played')
      .slice(0, 1);

    if (recentTracks.length > 0) {
      suggestions.push({
        text: "Walk me through my current playlist",
        category: 'music',
        icon: '📱'
      });
    }
  }

  // Generic personal discovery
  if (twinMode === 'personal') {
    suggestions.push(
      {
        text: "What makes me... me?",
        category: 'identity',
        icon: '✨'
      },
      {
        text: "Any patterns I'm not seeing?",
        category: 'discovery',
        icon: '🔍'
      },
      {
        text: "How am I different lately?",
        category: 'growth',
        icon: '📈'
      }
    );
  }

  // Professional mode suggestions
  if (twinMode === 'professional') {
    suggestions.push(
      {
        text: "How do I show up professionally?",
        category: 'work',
        icon: '💼'
      },
      {
        text: "What's my work style?",
        category: 'work',
        icon: '⚡'
      }
    );
  }

  return suggestions;
}

/**
 * Get follow-up suggestions based on conversation flow
 */
function getFollowUpSuggestions(messages, soulData, twinMode) {
  const suggestions = [];
  const lastMessage = messages[messages.length - 1];
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();

  // If no user messages yet, return initial suggestions
  if (!lastUserMessage) {
    return getInitialSuggestions(soulData, twinMode);
  }

  const userText = lastUserMessage.content.toLowerCase();

  // Music-related follow-ups
  if (userText.includes('music') || userText.includes('song') || userText.includes('artist')) {
    suggestions.push(
      {
        text: "Compare to last month",
        category: 'comparison',
        icon: '📊'
      },
      {
        text: "What mood does this match?",
        category: 'insight',
        icon: '🎭'
      },
      {
        text: "Show me something unexpected",
        category: 'discovery',
        icon: '🎲'
      }
    );
  }

  // Pattern/insight follow-ups
  if (userText.includes('pattern') || userText.includes('why') || userText.includes('how')) {
    suggestions.push(
      {
        text: "Go deeper on that",
        category: 'exploration',
        icon: '🔬'
      },
      {
        text: "Any other connections?",
        category: 'discovery',
        icon: '🔗'
      },
      {
        text: "What changed?",
        category: 'comparison',
        icon: '📈'
      }
    );
  }

  // Always include generic prompts
  suggestions.push(
    {
      text: "Tell me more",
      category: 'general',
      icon: '💬'
    },
    {
      text: "Surprise me",
      category: 'discovery',
      icon: '✨'
    },
    {
      text: "What else?",
      category: 'general',
      icon: '🤔'
    }
  );

  return suggestions;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
