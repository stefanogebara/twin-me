-- Migration: Add 'twitch' platform and extension data types
-- Date: 2025-02-09
-- Purpose: Support browser extension captured data for YouTube and Twitch

-- Add 'twitch' to platform CHECK constraint
ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_platform_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_platform_check
  CHECK (platform IN (
    'spotify', 'youtube', 'github', 'discord', 'reddit',
    'gmail', 'calendar', 'linkedin', 'slack', 'teams',
    'twitter', 'instagram', 'tiktok', 'netflix', 'goodreads',
    'twitch', 'whoop'
  ));

-- Add extension data types to data_type CHECK constraint
ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_data_type_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_data_type_check
  CHECK (data_type IN (
    -- Existing types
    'recently_played', 'top_track', 'top_artist', 'playlist',
    'saved_track', 'followed_artist', 'audio_features', 'soul_analysis',
    'watch_history', 'subscription', 'liked_video', 'comment',
    'repository', 'commit', 'pull_request', 'issue', 'review',
    'email', 'thread', 'label',
    'event', 'meeting',
    'message', 'post', 'reaction', 'channel',
    'profile', 'settings', 'activity', 'metadata',
    -- Nango extraction types
    'subscriptions', 'likedVideos', 'channels', 'playlists', 'channelSections',
    'followedChannels', 'user', 'streams', 'videos', 'clips',
    -- Spotify extraction types
    'top_tracks', 'top_artists',
    -- Extension-captured types
    'extension_video_watch', 'extension_search', 'extension_recommendation',
    'extension_homepage', 'extension_stream_watch', 'extension_browse',
    'extension_chat', 'extension_clip_view'
  ));
