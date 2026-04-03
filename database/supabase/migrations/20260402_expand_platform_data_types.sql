-- Migration: Expand CHECK constraints for enhanced platform data extraction
-- Date: 2026-04-02
-- Purpose: Add new data_type values for deeper platform extraction:
--   saved_show (Spotify podcasts), saved_album (Spotify albums),
--   followed_channels_raw (Twitch raw follow data with timestamps),
--   focus_time, out_of_office, calendar_list (Google Calendar event types),
--   user_playlists (YouTube user-created playlists)

-- Extend data_type CHECK — includes all existing values + new extraction types
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
    'userinfo', 'watchHistory', 'workout',
    -- NEW: Enhanced platform extraction (2026-04-02)
    'saved_show', 'saved_album',
    'followed_channels_raw',
    'focus_time', 'out_of_office', 'calendar_list',
    'user_playlists'
  ));
