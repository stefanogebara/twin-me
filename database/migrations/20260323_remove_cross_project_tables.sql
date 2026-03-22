-- ============================================================================
-- MIGRATION: Remove cross-project tables from TwinMe Supabase database
-- Date: 2026-03-23
--
-- !! RUN THIS ONLY AFTER MIGRATING DATA TO SEPARATE SUPABASE PROJECTS !!
--
-- This database accumulated tables from two other projects:
--   1. AI Olympics (aio_* prefix) — 51 tables
--   2. Seatable / restaurant-ai-mcp — 10 tables
--
-- These tables should live in their own Supabase projects:
--   - AI Olympics: separate project (see ~/ai-olympics)
--   - Seatable: ckforlwdhewexyqljsaf.supabase.co (see ~/restaurant-ai-mcp)
--
-- Before running:
--   1. Verify all data has been migrated to the correct project
--   2. Confirm no TwinMe code references these tables
--   3. Take a full database backup
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: AI Olympics tables (51 tables with aio_* prefix)
-- ============================================================================

-- Betting & Markets
DROP TABLE IF EXISTS aio_meta_market_bets CASCADE;
DROP TABLE IF EXISTS aio_meta_market_odds_history CASCADE;
DROP TABLE IF EXISTS aio_meta_markets CASCADE;
DROP TABLE IF EXISTS aio_market_resolutions CASCADE;
DROP TABLE IF EXISTS aio_market_snapshots CASCADE;
DROP TABLE IF EXISTS aio_markets CASCADE;
DROP TABLE IF EXISTS aio_user_bets CASCADE;
DROP TABLE IF EXISTS aio_virtual_bets CASCADE;
DROP TABLE IF EXISTS aio_real_bets CASCADE;
DROP TABLE IF EXISTS aio_agent_betting_stats CASCADE;

-- Competitions & Tournaments
DROP TABLE IF EXISTS aio_championship_round_results CASCADE;
DROP TABLE IF EXISTS aio_championship_rounds CASCADE;
DROP TABLE IF EXISTS aio_championship_participants CASCADE;
DROP TABLE IF EXISTS aio_championships CASCADE;
DROP TABLE IF EXISTS aio_competition_replays CASCADE;
DROP TABLE IF EXISTS aio_competition_participants CASCADE;
DROP TABLE IF EXISTS aio_competitions CASCADE;
DROP TABLE IF EXISTS aio_tournament_matches CASCADE;
DROP TABLE IF EXISTS aio_tournament_participants CASCADE;
DROP TABLE IF EXISTS aio_tournaments CASCADE;
DROP TABLE IF EXISTS aio_prediction_competitions CASCADE;

-- Games & Puzzles
DROP TABLE IF EXISTS aio_game_leaderboards CASCADE;
DROP TABLE IF EXISTS aio_game_sessions CASCADE;
DROP TABLE IF EXISTS aio_game_types CASCADE;
DROP TABLE IF EXISTS aio_gauntlet_runs CASCADE;
DROP TABLE IF EXISTS aio_gauntlet_weeks CASCADE;
DROP TABLE IF EXISTS aio_puzzle_attempts CASCADE;
DROP TABLE IF EXISTS aio_puzzles CASCADE;
DROP TABLE IF EXISTS aio_daily_challenges CASCADE;
DROP TABLE IF EXISTS aio_spectator_votes CASCADE;

-- Agents & Verification
DROP TABLE IF EXISTS aio_agent_domain_ratings CASCADE;
DROP TABLE IF EXISTS aio_agent_popularity CASCADE;
DROP TABLE IF EXISTS aio_agent_verification_history CASCADE;
DROP TABLE IF EXISTS aio_agents CASCADE;
DROP TABLE IF EXISTS aio_verification_challenges CASCADE;
DROP TABLE IF EXISTS aio_verification_sessions CASCADE;
DROP TABLE IF EXISTS aio_domains CASCADE;

-- Portfolios, Positions & Trading
DROP TABLE IF EXISTS aio_real_positions CASCADE;
DROP TABLE IF EXISTS aio_user_positions CASCADE;
DROP TABLE IF EXISTS aio_user_portfolios CASCADE;
DROP TABLE IF EXISTS aio_virtual_portfolios CASCADE;
DROP TABLE IF EXISTS aio_followed_traders CASCADE;
DROP TABLE IF EXISTS aio_trade_notifications CASCADE;

-- Crypto & Finance
DROP TABLE IF EXISTS aio_crypto_wallets CASCADE;
DROP TABLE IF EXISTS aio_exchange_credentials CASCADE;
DROP TABLE IF EXISTS aio_wallets CASCADE;
DROP TABLE IF EXISTS aio_transactions CASCADE;

-- Users & Billing
DROP TABLE IF EXISTS aio_profiles CASCADE;
DROP TABLE IF EXISTS aio_stripe_customers CASCADE;
DROP TABLE IF EXISTS aio_elo_history CASCADE;
DROP TABLE IF EXISTS aio_sync_status CASCADE;

-- ============================================================================
-- PART 2: Seatable / restaurant-ai-mcp tables (10 tables)
-- ============================================================================

-- Restaurant operations
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS service_records CASCADE;
DROP TABLE IF EXISTS guest_memories CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS tables CASCADE;

-- Restaurant registry & contacts
DROP TABLE IF EXISTS restaurant_registry CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;

-- Communication
DROP TABLE IF EXISTS whatsapp_sessions CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;

-- Analytics
DROP TABLE IF EXISTS usage_tracking CASCADE;

COMMIT;
