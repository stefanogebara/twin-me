-- ============================================================================
-- user_platform_data.data_type — admit the 18 values the code actually writes
-- ============================================================================
-- Eighteen data_type values written by application code were absent from the
-- CHECK constraint. Every one of those writes has been failing with a 23514
-- constraint violation, and every call site logs the error at WARN and
-- continues, so they failed SILENTLY. All eighteen have 0 rows in the table.
--
-- The one that surfaced this: `gmail_counters`. gmail.js persists the unread
-- snapshot there so the next run can emit a DELTA ("inbox grew by 12") rather
-- than an absolute backlog. The write never landed, so prevCounters was
-- permanently null and the fetcher re-minted an absolute baseline
-- ("Has a backlog of 42,987 unread emails") on EVERY run since the delta
-- feature shipped in June 2026 — 99 accumulated rows for the test user, each
-- drifting by a few so exact-hash dedup could never collide them, each floored
-- to importance 6 so no archival tier could reclaim them. That is the "40k
-- unread emails" symptom, and its root cause was this constraint.
--
-- The cooldown values are the other alarming group. A cooldown row that never
-- persists is not a cooldown: `wiki_compile_cooldown`, `goal_suggestion_cooldown`,
-- `purchase_cooldown` and `wa_tx_capture_quota` have been unable to suppress
-- anything, so the work they guard has been free to re-run every cycle.
--
-- NOTE ON SHAPE: this whitelist is the wrong tool for an open-ended
-- key-value store. It has now been amended five times
-- (fix_platform_data_type_check, expand_platform_data_types,
-- extension_data_types, extension_data_types_v2, and this one) and each
-- amendment was triggered by a silent production failure. Validating at the
-- write boundary and dropping the constraint would remove the whole class.
-- Left as a follow-up rather than bundled into a fix that is urgent.
--
-- Safety: this only WIDENS the allowed set, so every existing row already
-- satisfies the new constraint and the revalidation scan cannot fail.
-- ============================================================================

ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_data_type_check;

ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_data_type_check CHECK (
  data_type = ANY (ARRAY[
    -- ── existing values, preserved verbatim ──────────────────────────────
    'recently_played','top_track','top_artist','playlist','saved_track',
    'followed_artist','audio_features','soul_analysis','watch_history',
    'subscription','liked_video','comment','repository','commit',
    'pull_request','issue','review','email','thread','label','event',
    'meeting','message','post','reaction','channel','profile','settings',
    'activity','metadata','subscriptions','likedVideos','channels',
    'playlists','channelSections','followedChannels','user','streams',
    'videos','clips','top_tracks','top_artists','extension_video_watch',
    'extension_search','extension_recommendation','extension_homepage',
    'extension_stream_watch','extension_browse','extension_chat',
    'extension_clip_view','tab_visit','history_import','page_analysis',
    'extension_page_visit','extension_article_read','extension_web_video',
    'extension_search_query','calendar_info','calendarEvents','contacts',
    'current_playing','currentlyPlaying','events','mailFolders','messages',
    'recent_event','recentTracks','recovery','savedTracks','sleep',
    'topArtists','topTracks','upcoming_event','userinfo','watchHistory',
    'workout','saved_show','saved_album','followed_channels_raw',
    'focus_time','out_of_office','calendar_list','user_playlists','guilds',
    'followed_channels',

    -- ── added: written by code, previously rejected ─────────────────────
    -- state snapshots the next run reads back
    'gmail_counters',

    -- cooldowns / quotas — a cooldown that cannot persist is not a cooldown
    'goal_suggestion_cooldown','wiki_compile_cooldown','purchase_cooldown',
    'wa_tx_capture_quota',

    -- compiled profiles and analyses
    'comprehensive_github_profile','comprehensive_discord_profile',
    'comprehensive_music_profile','enhanced_profile',
    'deep_personality_analysis','correlation_run',

    -- platform detail rows
    'listening_patterns','genre','historical_watch',

    -- delivery / nudge bookkeeping
    'push_notification','ritual_selection','stress_shop_nudge',
    'financial_weekly_email'
  ]::text[])
);

COMMENT ON CONSTRAINT user_platform_data_data_type_check ON user_platform_data IS
  'Whitelist of data_type values. Amended five times, each after a silent production failure — see 20260728150000. Prefer validating at the write boundary over extending this again.';
