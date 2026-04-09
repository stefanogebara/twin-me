-- ============================================================================
-- Add 'guilds' and 'followed_channels' to user_platform_data.data_type whitelist
-- ============================================================================
-- The observation ingestion for Discord writes data_type='guilds' (for server
-- memberships) and Twitch writes data_type='followed_channels'. Both were
-- being silently rejected by the existing CHECK constraint, so structured
-- data was never stored and feature extractors (discordExtractor, twitchExtractor)
-- always returned null features.
-- ============================================================================

ALTER TABLE public.user_platform_data DROP CONSTRAINT user_platform_data_data_type_check;

ALTER TABLE public.user_platform_data ADD CONSTRAINT user_platform_data_data_type_check
CHECK (data_type = ANY (ARRAY[
  'recently_played'::text, 'top_track'::text, 'top_artist'::text, 'playlist'::text,
  'saved_track'::text, 'followed_artist'::text, 'audio_features'::text, 'soul_analysis'::text,
  'watch_history'::text, 'subscription'::text, 'liked_video'::text, 'comment'::text,
  'repository'::text, 'commit'::text, 'pull_request'::text, 'issue'::text, 'review'::text,
  'email'::text, 'thread'::text, 'label'::text, 'event'::text, 'meeting'::text, 'message'::text,
  'post'::text, 'reaction'::text, 'channel'::text, 'profile'::text, 'settings'::text,
  'activity'::text, 'metadata'::text, 'subscriptions'::text, 'likedVideos'::text,
  'channels'::text, 'playlists'::text, 'channelSections'::text, 'followedChannels'::text,
  'user'::text, 'streams'::text, 'videos'::text, 'clips'::text, 'top_tracks'::text,
  'top_artists'::text, 'extension_video_watch'::text, 'extension_search'::text,
  'extension_recommendation'::text, 'extension_homepage'::text, 'extension_stream_watch'::text,
  'extension_browse'::text, 'extension_chat'::text, 'extension_clip_view'::text,
  'tab_visit'::text, 'history_import'::text, 'page_analysis'::text,
  'extension_page_visit'::text, 'extension_article_read'::text, 'extension_web_video'::text,
  'extension_search_query'::text, 'calendar_info'::text, 'calendarEvents'::text,
  'contacts'::text, 'current_playing'::text, 'currentlyPlaying'::text, 'events'::text,
  'mailFolders'::text, 'messages'::text, 'recent_event'::text, 'recentTracks'::text,
  'recovery'::text, 'savedTracks'::text, 'sleep'::text, 'topArtists'::text, 'topTracks'::text,
  'upcoming_event'::text, 'userinfo'::text, 'watchHistory'::text, 'workout'::text,
  'saved_show'::text, 'saved_album'::text, 'followed_channels_raw'::text, 'focus_time'::text,
  'out_of_office'::text, 'calendar_list'::text, 'user_playlists'::text,
  'guilds'::text, 'followed_channels'::text
]));
