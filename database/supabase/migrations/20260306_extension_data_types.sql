-- Migration: Extend CHECK constraints for browser extension data types
-- Date: 2026-03-06
-- Purpose: Add missing platform values (web, hbo, amazon, disney) and
--          extension data types (tab_visit, extension_page_visit, etc.)
--          Also includes existing DB values (google_calendar, google_gmail, outlook, etc.)

-- Extend platform CHECK — covers all existing rows + new extension platforms
ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_platform_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_platform_check
  CHECK (platform IN (
    'spotify', 'youtube', 'github', 'discord', 'reddit',
    'gmail', 'calendar', 'linkedin', 'slack', 'teams',
    'twitter', 'instagram', 'tiktok', 'netflix', 'goodreads',
    'twitch', 'whoop',
    -- Browser extension platforms
    'web', 'hbo', 'amazon', 'disney',
    -- Nango platform variants
    'google_calendar', 'google_gmail', 'outlook'
  ));

-- Extend data_type CHECK — covers all existing rows + new extension types
ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_data_type_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_data_type_check
  CHECK (data_type IN (
    -- Core types
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
    'extension_chat', 'extension_clip_view',
    'tab_visit', 'history_import', 'page_analysis',
    'extension_page_visit', 'extension_article_read',
    'extension_web_video', 'extension_search_query',
    -- Existing in DB (Nango/platform variants)
    'calendar_info', 'calendarEvents', 'contacts', 'current_playing',
    'currentlyPlaying', 'events', 'mailFolders', 'messages',
    'recent_event', 'recentTracks', 'recovery', 'savedTracks',
    'sleep', 'topArtists', 'topTracks', 'upcoming_event',
    'userinfo', 'watchHistory', 'workout'
  ));
