/**
 * Reddit Data Extraction & Soul Signature Analysis
 *
 * Extracts community interests, discussion participation, and calculates Big Five personality traits
 * based on subreddit subscriptions, posts, comments, and saved content.
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './encryption.js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Main extraction function - retrieves all Reddit data
 */
export async function extractRedditData(userId) {
  try {
    // Get platform connection with encrypted tokens
    const { data: connection, error: connectionError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'reddit')
      .single();

    if (connectionError || !connection) {
      throw new Error('Reddit not connected for this user');
    }

    if (!connection.access_token) {
      throw new Error('No access token found for Reddit');
    }

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token);

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'TwinMe:v1.0 (by /u/TwinMeApp)'
    };

    console.log(`🤖 Extracting Reddit data for user ${userId}...`);

    // Extract multiple data types in parallel for performance
    const [
      userResponse,
      subredditsResponse,
      postsResponse,
      commentsResponse,
      savedResponse,
      upvotedResponse
    ] = await Promise.all([
      // Get user profile
      axios.get('https://oauth.reddit.com/api/v1/me', { headers }),

      // Get subscribed subreddits
      axios.get('https://oauth.reddit.com/subreddits/mine/subscriber?limit=100', { headers }),

      // Get user's posts
      axios.get('https://oauth.reddit.com/user/me/submitted?limit=100', { headers }),

      // Get user's comments
      axios.get('https://oauth.reddit.com/user/me/comments?limit=100', { headers }),

      // Get saved posts/comments
      axios.get('https://oauth.reddit.com/user/me/saved?limit=100', { headers }),

      // Get upvoted content
      axios.get('https://oauth.reddit.com/user/me/upvoted?limit=100', { headers }).catch(() => ({ data: { data: { children: [] } } }))
    ]);

    // Transform to soul signature format
    const soulData = transformRedditToSoulSignature({
      user: userResponse.data,
      subreddits: subredditsResponse.data.data.children || [],
      posts: postsResponse.data.data.children || [],
      comments: commentsResponse.data.data.children || [],
      saved: savedResponse.data.data.children || [],
      upvoted: upvotedResponse.data.data.children || []
    });

    // Calculate total items extracted
    const totalItems =
      soulData.subreddits.length +
      soulData.posts.length +
      soulData.comments.length +
      soulData.saved.length;

    console.log(`✅ Extracted ${totalItems} Reddit items`);

    // Save extracted data to soul_data table
    const { error: insertError } = await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'reddit',
        data_type: 'comprehensive_reddit_profile',
        raw_data: {
          user: userResponse.data,
          subreddits: subredditsResponse.data,
          posts: postsResponse.data,
          comments: commentsResponse.data,
          saved: savedResponse.data,
          upvoted: upvotedResponse.data
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    if (insertError) {
      console.error('Error saving Reddit data:', insertError);
    }

    // Update connection status
    await supabase
      .from('platform_connections')
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success'
      })
      .eq('user_id', userId)
      .eq('platform', 'reddit');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'reddit',
      insights: soulData.insights,
      profile: soulData.profile
    };

  } catch (error) {
    console.error('Reddit extraction error:', error);

    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('platform_connections')
        .update({
          last_sync_status: 'requires_reauth'
        })
        .eq('user_id', userId)
        .eq('platform', 'reddit');

      return {
        success: false,
        requiresReauth: true,
        error: 'Token expired - reconnection required'
      };
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['x-ratelimit-reset'];
      return {
        success: false,
        rateLimited: true,
        retryAfter: parseInt(retryAfter) || 60,
        error: 'Rate limit exceeded'
      };
    }

    // Update connection with error status
    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'failed'
      })
      .eq('user_id', userId)
      .eq('platform', 'reddit');

    throw error;
  }
}

/**
 * Transform Reddit data to soul signature format with Big Five personality traits
 */
function transformRedditToSoulSignature(redditData) {
  const {
    user,
    subreddits,
    posts,
    comments,
    saved,
    upvoted
  } = redditData;

  // Extract subreddit communities
  const subscribedSubreddits = subreddits.map(sub => ({
    name: sub.data.display_name,
    title: sub.data.title,
    description: sub.data.public_description,
    subscribers: sub.data.subscribers,
    category: sub.data.advertiser_category || 'General'
  }));

  // Analyze community interests
  const communityCategories = extractCommunityCategories(subscribedSubreddits, posts, comments);

  // Analyze discussion patterns
  const discussionPatterns = analyzeDiscussionPatterns(posts, comments, saved);

  return {
    profile: {
      username: user.name,
      id: user.id,
      linkKarma: user.link_karma,
      commentKarma: user.comment_karma,
      totalKarma: user.total_karma || (user.link_karma + user.comment_karma),
      accountCreated: new Date(user.created_utc * 1000),
      isPremium: user.is_gold || false,
      hasMail: user.has_mail || false
    },

    subreddits: subscribedSubreddits,

    posts: posts.slice(0, 50).map(post => ({
      id: post.data.id,
      title: post.data.title,
      subreddit: post.data.subreddit,
      score: post.data.score,
      numComments: post.data.num_comments,
      created: new Date(post.data.created_utc * 1000),
      url: post.data.url,
      selftext: post.data.selftext?.substring(0, 500) || ''
    })),

    comments: comments.slice(0, 50).map(comment => ({
      id: comment.data.id,
      body: comment.data.body?.substring(0, 500) || '',
      subreddit: comment.data.subreddit,
      score: comment.data.score,
      created: new Date(comment.data.created_utc * 1000)
    })),

    saved: saved.slice(0, 50).map(item => ({
      id: item.data.id,
      type: item.kind, // t1 = comment, t3 = post
      subreddit: item.data.subreddit,
      title: item.data.title || item.data.link_title,
      created: new Date(item.data.created_utc * 1000)
    })),

    insights: {
      totalSubreddits: subreddits.length,
      totalPosts: posts.length,
      totalComments: comments.length,
      totalSaved: saved.length,

      karma: {
        link: user.link_karma,
        comment: user.comment_karma,
        total: user.total_karma || (user.link_karma + user.comment_karma),
        ratio: user.link_karma / Math.max(user.comment_karma, 1)
      },

      topCommunities: subscribedSubreddits
        .sort((a, b) => b.subscribers - a.subscribers)
        .slice(0, 10),

      topCategories: communityCategories.slice(0, 10),

      discussionStyle: discussionPatterns.discussionStyle,
      expertiseAreas: discussionPatterns.expertiseAreas,
      engagementLevel: discussionPatterns.engagementLevel,

      // Big Five Personality Traits (0-100 scale)
      traits: {
        openness: calculateOpenness(communityCategories, subscribedSubreddits),
        extraversion: calculateExtraversion(posts, comments),
        agreeableness: calculateAgreeableness(comments, upvoted),
        conscientiousness: calculateConscientiousness(posts, comments, saved),
        neuroticism: calculateNeuroticism(communityCategories, posts)
      },

      // Additional personality indicators
      redditPersonality: determineRedditPersonality({
        categories: communityCategories,
        posts: posts.length,
        comments: comments.length,
        karma: user.total_karma || (user.link_karma + user.comment_karma),
        engagement: discussionPatterns.engagementLevel
      })
    }
  };
}

/**
 * Extract community categories from subreddits and content
 */
function extractCommunityCategories(subreddits, posts, comments) {
  const categories = {};

  // Analyze subreddit names and descriptions for keywords
  const allContent = [
    ...subreddits.map(s => ({ text: `${s.name} ${s.title} ${s.description}`, type: 'subscription' })),
    ...posts.map(p => ({ text: `${p.data.title} ${p.data.subreddit}`, type: 'post' })),
    ...comments.map(c => ({ text: c.data.subreddit, type: 'comment' }))
  ];

  const categoryKeywords = {
    'Technology': ['technology', 'programming', 'coding', 'software', 'developer', 'tech', 'gadgets', 'android', 'apple', 'linux'],
    'Gaming': ['gaming', 'games', 'xbox', 'playstation', 'nintendo', 'pcgaming', 'esports', 'minecraft', 'pokemon'],
    'Science': ['science', 'physics', 'biology', 'chemistry', 'space', 'astronomy', 'research', 'scientific'],
    'Politics': ['politics', 'political', 'news', 'worldnews', 'government', 'election', 'policy'],
    'Entertainment': ['movies', 'television', 'tv', 'music', 'entertainment', 'celebrity', 'netflix', 'marvel', 'starwars'],
    'Sports': ['sports', 'football', 'basketball', 'soccer', 'baseball', 'nfl', 'nba', 'fitness', 'exercise'],
    'Finance': ['finance', 'investing', 'stocks', 'crypto', 'bitcoin', 'wallstreetbets', 'personalfinance', 'money'],
    'Learning': ['learn', 'education', 'university', 'college', 'study', 'tutorial', 'howto', 'eli5', 'askscience'],
    'Hobbies': ['diy', 'art', 'craft', 'cooking', 'baking', 'gardening', 'photography', 'woodworking'],
    'Humor': ['funny', 'memes', 'jokes', 'humor', 'dankmemes', 'wholesomememes', 'comics']
  };

  allContent.forEach(content => {
    const text = content.text.toLowerCase();

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      const matchCount = keywords.filter(keyword => text.includes(keyword)).length;
      if (matchCount > 0) {
        categories[category] = (categories[category] || 0) + matchCount;
      }
    });
  });

  return Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));
}

/**
 * Analyze discussion patterns from user behavior
 */
function analyzeDiscussionPatterns(posts, comments, saved) {
  const postCount = posts.length;
  const commentCount = comments.length;
  const savedCount = saved.length;

  const totalEngagement = postCount + commentCount;
  const commentRatio = commentCount / Math.max(totalEngagement, 1);

  // Determine discussion style
  let discussionStyle = 'Lurker';
  if (commentRatio > 0.8) discussionStyle = 'Commentator';
  if (commentRatio > 0.5 && postCount > 10) discussionStyle = 'Balanced Contributor';
  if (postCount > commentCount && postCount > 20) discussionStyle = 'Content Creator';
  if (totalEngagement > 100) discussionStyle = 'Power User';

  // Extract expertise areas from most engaged subreddits
  const subredditEngagement = {};
  [...posts, ...comments].forEach(item => {
    const subreddit = item.data.subreddit;
    subredditEngagement[subreddit] = (subredditEngagement[subreddit] || 0) + 1;
  });

  const expertiseAreas = Object.entries(subredditEngagement)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([subreddit, count]) => ({ subreddit, engagementCount: count }));

  // Determine engagement level
  let engagementLevel = 'Low';
  if (totalEngagement > 20) engagementLevel = 'Medium';
  if (totalEngagement > 50) engagementLevel = 'High';
  if (totalEngagement > 100) engagementLevel = 'Very High';

  return {
    discussionStyle,
    expertiseAreas,
    engagementLevel
  };
}

/**
 * Big Five Personality Trait: Openness to Experience
 * Based on community diversity and niche interests
 */
function calculateOpenness(communityCategories, subreddits) {
  const categoryDiversity = communityCategories.length;
  const diversityScore = Math.min((categoryDiversity / 10) * 60, 60); // Max 10 categories = 60 points

  const subredditScore = Math.min((subreddits.length / 50) * 40, 40); // Max 50 subs = 40 points

  return Math.round(diversityScore + subredditScore);
}

/**
 * Big Five Personality Trait: Extraversion
 * Based on posting frequency and comment engagement
 */
function calculateExtraversion(posts, comments) {
  const postScore = Math.min((posts.length / 50) * 50, 50); // Content sharing
  const commentScore = Math.min((comments.length / 100) * 50, 50); // Social interaction

  return Math.round((postScore + commentScore) / 2);
}

/**
 * Big Five Personality Trait: Agreeableness
 * Based on upvoting behavior and comment tone
 */
function calculateAgreeableness(comments, upvoted) {
  // Estimate based on upvoting ratio
  const upvoteScore = Math.min((upvoted.length / 100) * 50, 50);

  // Estimate based on comment engagement (assuming positive participation)
  const commentScore = Math.min((comments.length / 100) * 50, 50);

  return Math.round((upvoteScore + commentScore) / 2);
}

/**
 * Big Five Personality Trait: Conscientiousness
 * Based on saved content and engagement consistency
 */
function calculateConscientiousness(posts, comments, saved) {
  const savedScore = Math.min((saved.length / 50) * 50, 50); // Content curation
  const engagementScore = Math.min(((posts.length + comments.length) / 100) * 50, 50); // Participation

  return Math.round((savedScore + engagementScore) / 2);
}

/**
 * Big Five Personality Trait: Neuroticism
 * Based on intense or negative community participation
 */
function calculateNeuroticism(communityCategories, posts) {
  const intensiveCategories = ['Politics', 'News', 'Debate', 'Rant'];
  const intensiveContent = communityCategories.filter(cat =>
    intensiveCategories.includes(cat.category)
  ).reduce((sum, cat) => sum + cat.count, 0);

  const totalContent = communityCategories.reduce((sum, cat) => sum + cat.count, 0);
  const intensiveRatio = intensiveContent / Math.max(totalContent, 1);

  return Math.round(intensiveRatio * 100);
}

/**
 * Helper: Determine overall Reddit personality archetype
 */
function determineRedditPersonality(metrics) {
  const { categories, posts, comments, karma, engagement } = metrics;

  const topCategory = categories[0]?.category || '';

  if (topCategory === 'Technology' && karma > 1000) return 'Tech Enthusiast';
  if (posts > comments && posts > 30) return 'Content Creator';
  if (topCategory === 'Gaming' && engagement === 'High') return 'Gaming Community Member';
  if (topCategory === 'Politics' || topCategory === 'News') return 'News & Politics Follower';
  if (categories.length > 8) return 'Diverse Explorer';
  if (topCategory === 'Learning' || topCategory === 'Science') return 'Knowledge Seeker';
  if (comments > posts * 3) return 'Discussion Enthusiast';
  if (karma > 5000) return 'Active Redditor';

  return 'Casual Browser';
}

export default {
  extractRedditData
};
