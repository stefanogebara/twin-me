-- Seed Data for Twin AI Learn Platform
-- User: test@example.com (ID: 47f1efef-fca8-4a00-91b5-353ffdde5bc6)

-- 1. Create a Digital Twin for the user
INSERT INTO digital_twins (
  id,
  user_id,
  creator_id,
  name,
  description,
  twin_type,
  status,
  is_active,
  soul_signature,
  connected_platforms,
  personality_traits,
  communication_style,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '47f1efef-fca8-4a00-91b5-353ffdde5bc6',
  '47f1efef-fca8-4a00-91b5-353ffdde5bc6',
  'John''s Digital Twin',
  'A digital twin capturing John''s authentic personality and communication style',
  'personal',
  'active',
  true,
  '{"music_taste": {"genres": ["Electronic", "Indie", "Jazz"], "mood_patterns": "eclectic"}, "content_preferences": {"streaming": ["documentaries", "sci-fi"], "reading": ["tech", "philosophy"]}, "social_patterns": {"discord_activity": "high", "github_contributions": "regular"}}'::jsonb,
  ARRAY['spotify', 'discord', 'github'],
  '{"openness": 0.85, "conscientiousness": 0.75, "extraversion": 0.60, "agreeableness": 0.80, "neuroticism": 0.30}'::jsonb,
  'Thoughtful and articulate, with a preference for detailed explanations',
  NOW() - INTERVAL '7 days',
  NOW()
);

-- 2. Create Soul Signature Profile
INSERT INTO soul_signature_profile (
  id,
  user_id,
  music_signature,
  video_signature,
  gaming_signature,
  communication_signature,
  coding_signature,
  curiosity_profile,
  authenticity_score,
  uniqueness_markers,
  data_completeness,
  confidence_score,
  created_at,
  last_updated
) VALUES (
  gen_random_uuid(),
  '47f1efef-fca8-4a00-91b5-353ffdde5bc6',
  '{"favorite_genres": ["Electronic", "Indie Rock", "Jazz"], "listening_patterns": {"time_of_day": "evening", "avg_session_length": 45}, "top_artists": ["Tame Impala", "Bonobo", "Hiatus Kaiyote"], "discovery_rate": 0.7}'::jsonb,
  '{"youtube_interests": ["tech tutorials", "music production", "science documentaries"], "netflix_patterns": {"binge_behavior": "moderate", "preferred_genres": ["sci-fi", "documentaries"]}, "avg_watch_time_daily": 120}'::jsonb,
  '{"platforms": ["Steam"], "favorite_genres": ["strategy", "indie", "puzzle"], "avg_playtime_weekly": 10}'::jsonb,
  '{"discord_style": "active and helpful", "response_time": "quick", "tone": "casual yet professional", "emoji_usage": "moderate"}'::jsonb,
  '{"languages": ["TypeScript", "Python", "JavaScript"], "frameworks": ["React", "Node.js", "Express"], "contribution_frequency": "daily", "code_style": "clean and documented"}'::jsonb,
  '{"learning_topics": ["AI/ML", "web development", "music theory"], "exploration_rate": "high", "depth_vs_breadth": "balanced"}'::jsonb,
  0.82,
  ARRAY['eclectic music taste', 'technical depth', 'creative problem solving', 'collaborative spirit'],
  0.65,
  0.78,
  NOW() - INTERVAL '7 days',
  NOW()
);

-- 3. Add Spotify listening data
INSERT INTO spotify_listening_data (
  id, user_id, connector_id, track_id, track_name, artist_name, album_name,
  played_at, duration_ms, genres, listening_context, device_type
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'spotify:track:001', 'Borderline', 'Tame Impala', 'The Slow Rush', NOW() - INTERVAL '2 hours', 237000, ARRAY['psychedelic rock', 'indie'], 'focused work', 'desktop'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'spotify:track:002', 'Kerala', 'Bonobo', 'The North Borders', NOW() - INTERVAL '4 hours', 294000, ARRAY['electronic', 'downtempo'], 'coding session', 'desktop'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'spotify:track:003', 'Nakamarra', 'Hiatus Kaiyote', 'Tawk Tomahawk', NOW() - INTERVAL '1 day', 267000, ARRAY['neo-soul', 'jazz fusion'], 'evening relax', 'mobile'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'spotify:track:004', 'Strobe', 'Deadmau5', 'For Lack of a Better Name', NOW() - INTERVAL '1 day', 635000, ARRAY['progressive house', 'electronic'], 'deep focus', 'desktop'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'spotify:track:005', 'Breathe Deeper', 'Tame Impala', 'The Slow Rush', NOW() - INTERVAL '2 days', 374000, ARRAY['psychedelic rock'], 'workout', 'mobile');

-- 4. Add Discord server data
INSERT INTO discord_servers (
  id, user_id, connector_id, server_id, server_name, member_count,
  joined_at, server_categories, user_roles, is_owner, activity_level
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'discord:001', 'Tech Community', 5420, NOW() - INTERVAL '2 years', ARRAY['technology', 'programming'], ARRAY['member', 'contributor'], false, 'high'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'discord:002', 'Music Production', 1850, NOW() - INTERVAL '1 year', ARRAY['music', 'creative'], ARRAY['member', 'helper'], false, 'medium'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'discord:003', 'Gaming Squad', 42, NOW() - INTERVAL '6 months', ARRAY['gaming', 'social'], ARRAY['member', 'moderator'], true, 'high');

-- 5. Add GitHub repositories
INSERT INTO github_repositories (
  id, user_id, connector_id, repo_id, repo_name, repo_url, is_owner,
  primary_language, languages_used, stars_count, forks_count, topics, description
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'gh:repo:001', 'awesome-project', 'https://github.com/testuser/awesome-project', true, 'TypeScript', '{"TypeScript": 75, "JavaScript": 20, "CSS": 5}'::jsonb, 42, 8, ARRAY['react', 'typescript', 'vite'], 'A full-stack web application built with React and TypeScript'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'gh:repo:002', 'ml-experiments', 'https://github.com/testuser/ml-experiments', true, 'Python', '{"Python": 95, "Jupyter Notebook": 5}'::jsonb, 18, 3, ARRAY['machine-learning', 'python', 'ai'], 'Collection of machine learning experiments and models'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'gh:repo:003', 'cli-tools', 'https://github.com/testuser/cli-tools', true, 'JavaScript', '{"JavaScript": 100}'::jsonb, 7, 1, ARRAY['cli', 'tools', 'nodejs'], 'Useful command-line utilities');

-- 6. Add GitHub contributions
INSERT INTO github_contributions (
  id, user_id, connector_id, contribution_date, contribution_count,
  commit_count, pr_count, issue_count, review_count, repositories_contributed
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, CURRENT_DATE, 12, 8, 2, 1, 1, ARRAY['awesome-project', 'ml-experiments']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, CURRENT_DATE - 1, 8, 6, 1, 0, 1, ARRAY['awesome-project', 'cli-tools']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, CURRENT_DATE - 2, 15, 12, 2, 1, 0, ARRAY['awesome-project', 'ml-experiments', 'cli-tools']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, CURRENT_DATE - 3, 5, 4, 0, 1, 0, ARRAY['awesome-project']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, CURRENT_DATE - 4, 10, 7, 2, 0, 1, ARRAY['ml-experiments', 'cli-tools']);

-- 7. Add YouTube subscriptions
INSERT INTO youtube_subscriptions (
  id, user_id, connector_id, channel_id, channel_title, channel_description,
  subscribed_at, subscriber_count, channel_categories, channel_keywords
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'yt:ch:001', 'Fireship', 'High-intensity code tutorials', NOW() - INTERVAL '2 years', 2500000, ARRAY['technology', 'programming'], ARRAY['web development', 'tutorials', 'coding']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'yt:ch:002', 'Veritasium', 'Science and engineering videos', NOW() - INTERVAL '3 years', 14000000, ARRAY['education', 'science'], ARRAY['science', 'physics', 'engineering']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'yt:ch:003', 'Andrew Huang', 'Music production and creativity', NOW() - INTERVAL '1 year', 2000000, ARRAY['music', 'creative'], ARRAY['music production', 'music theory', 'creativity']);

-- 8. Add personality insights
INSERT INTO personality_insights (
  id, user_id, insight_type, insight_data, confidence_score,
  source_data_count, analysis_method
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'communication_pattern', '{"style": "thoughtful and detailed", "avg_response_length": 150, "punctuation_style": "balanced", "emoji_usage": "moderate"}'::jsonb, 0.85, 247, 'NLP analysis'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'expertise_area', '{"primary": "web development", "secondary": ["machine learning", "music production"], "confidence_levels": {"web development": 0.9, "machine learning": 0.7, "music production": 0.6}}'::jsonb, 0.82, 189, 'activity pattern analysis'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'interest', '{"categories": ["technology", "music", "science"], "engagement_levels": {"technology": 0.95, "music": 0.85, "science": 0.75}}'::jsonb, 0.88, 312, 'cross-platform aggregation'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'work_pattern', '{"peak_productivity": "evening", "avg_session_length": 120, "break_frequency": "regular", "multitasking_tendency": "low"}'::jsonb, 0.79, 156, 'temporal analysis'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'learning_preference', '{"style": "hands-on experimentation", "depth_preference": "deep dive", "learning_pace": "self-directed", "resource_types": ["tutorials", "documentation", "courses"]}'::jsonb, 0.81, 98, 'behavioral pattern recognition');

-- 9. Add analytics events
INSERT INTO analytics_events (
  id, user_id, event_type, event_data, session_id, timestamp
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'platform_connected', '{"platform": "spotify", "connection_method": "oauth"}'::jsonb, 'session_001', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'platform_connected', '{"platform": "discord", "connection_method": "oauth"}'::jsonb, 'session_001', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'platform_connected', '{"platform": "github", "connection_method": "oauth"}'::jsonb, 'session_001', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'soul_analysis_started', '{"platforms": ["spotify", "discord", "github"]}'::jsonb, 'session_002', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'soul_analysis_completed', '{"data_points": 247, "confidence_score": 0.78, "duration_seconds": 45}'::jsonb, 'session_002', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'twin_created', '{"twin_name": "John''s Digital Twin", "platforms_used": 3}'::jsonb, 'session_003', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'data_sync', '{"platform": "spotify", "items_synced": 42}'::jsonb, 'session_004', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'chat_session', '{"twin_id": "twin_001", "message_count": 8, "duration_minutes": 12}'::jsonb, 'session_005', NOW() - INTERVAL '3 hours');

-- 10. Add LLM training data samples
INSERT INTO llm_training_data (
  id, user_id, twin_id, prompt, completion, source_platform,
  source_type, quality_score, category, tags
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'How do you approach learning new technologies?', 'I tend to dive deep into documentation first, then build small experimental projects to understand the core concepts. I find hands-on practice essential for retention.', 'discord', 'extracted_conversation', 0.92, 'learning_style', ARRAY['learning', 'technology', 'methodology']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'What music do you listen to while coding?', 'Usually electronic music or instrumental jazz - something with enough energy to keep me focused but without lyrics that might distract. Artists like Bonobo, Tycho, or Tame Impala are my go-to.', 'discord', 'extracted_conversation', 0.88, 'preferences', ARRAY['music', 'coding', 'productivity']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'Thoughts on TypeScript vs JavaScript?', 'TypeScript has been a game-changer for my projects. The type safety catches so many bugs early, and the IDE support makes refactoring much more confident. The initial setup overhead is worth it for anything beyond a small script.', 'github', 'code_comment', 0.95, 'technical_opinion', ARRAY['typescript', 'javascript', 'programming']),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', NULL, 'What''s your debugging process?', 'I start with console.log to isolate the problem area, then use the debugger for step-through analysis. I also like to explain the problem out loud (rubber duck debugging) - it often surfaces the solution.', 'discord', 'extracted_conversation', 0.90, 'technical_process', ARRAY['debugging', 'programming', 'methodology']);

-- 11. Add user style profile
INSERT INTO user_style_profile (
  id, user_id, avg_word_length, vocabulary_richness, unique_words_count,
  total_words_count, avg_sentence_length, punctuation_patterns,
  communication_style, personality_traits, sample_size, confidence_score
) VALUES (
  gen_random_uuid(),
  '47f1efef-fca8-4a00-91b5-353ffdde5bc6',
  5.2,
  0.68,
  1847,
  8924,
  18.3,
  '{"period_usage": 0.45, "comma_usage": 0.35, "question_usage": 0.08, "exclamation_usage": 0.02}'::jsonb,
  'thoughtful and articulate',
  '{"openness": 0.85, "conscientiousness": 0.75, "extraversion": 0.60, "agreeableness": 0.80, "neuroticism": 0.30}'::jsonb,
  247,
  0.78
);

-- 12. Add soul signature data (using soul_signature_data if table exists)
-- Note: This table name may need adjustment based on actual schema
INSERT INTO soul_signature_data (
  id, user_id, platform, data_category, extracted_insights, confidence_score, data_points_count, last_updated
) VALUES
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'spotify', 'music_preferences', '{"genres": ["electronic", "indie", "jazz"], "listening_patterns": "evening focused", "discovery_rate": 0.7}'::jsonb, 0.85, 42, NOW()),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'discord', 'communication_style', '{"tone": "helpful and collaborative", "response_speed": "quick", "emoji_usage": "moderate"}'::jsonb, 0.82, 156, NOW()),
  (gen_random_uuid(), '47f1efef-fca8-4a00-91b5-353ffdde5bc6', 'github', 'technical_identity', '{"languages": ["TypeScript", "Python"], "contribution_frequency": "daily", "code_style": "clean and documented"}'::jsonb, 0.88, 189, NOW())
ON CONFLICT DO NOTHING;

COMMIT;
