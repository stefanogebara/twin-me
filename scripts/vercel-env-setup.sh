#!/bin/bash
# =============================================================================
# Vercel Environment Variables Setup Script
# =============================================================================
# Reads values from local .env and pushes them to Vercel production environment.
#
# Usage:
#   chmod +x scripts/vercel-env-setup.sh
#   cd twin-ai-learn
#   ./scripts/vercel-env-setup.sh
#
# Prerequisites:
#   - Vercel CLI installed: npm i -g vercel
#   - Logged in: vercel login
#   - Project linked: vercel link
#
# NOTE: Redirect URIs are overridden to use the production URL.
# =============================================================================

set -euo pipefail

ENV_FILE=".env"
PROD_URL="https://twin-ai-learn.vercel.app"
PROD_CALLBACK="${PROD_URL}/oauth/callback"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run this from the twin-ai-learn directory."
  exit 1
fi

# Read a value from the .env file (strips quotes)
get_env_value() {
  local key="$1"
  local val
  val=$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  # Strip surrounding quotes
  val="${val%\"}"
  val="${val#\"}"
  echo "$val"
}

# Add a single env var to Vercel production
add_env() {
  local name="$1"
  local value="$2"

  if [ -z "$value" ] || [ "$value" = "your-"* ]; then
    echo "  SKIP  $name (empty or placeholder)"
    return
  fi

  echo "  ADD   $name"
  printf '%s' "$value" | vercel env add "$name" production --force 2>/dev/null || \
    echo "  WARN  $name may already exist or failed"
}

echo ""
echo "=== Vercel Env Setup for twin-ai-learn ==="
echo "Target: production"
echo ""

# -------------------------------------------------------
# CRITICAL - App breaks without these
# -------------------------------------------------------
echo "--- CRITICAL VARIABLES ---"

add_env "OPENROUTER_API_KEY" "$(get_env_value OPENROUTER_API_KEY)"
add_env "OPENAI_API_KEY" "$(get_env_value OPENAI_API_KEY)"
add_env "WHOOP_CLIENT_ID" "$(get_env_value WHOOP_CLIENT_ID)"
add_env "WHOOP_CLIENT_SECRET" "$(get_env_value WHOOP_CLIENT_SECRET)"
# Override redirect URI to production
add_env "WHOOP_REDIRECT_URI" "$PROD_CALLBACK"
add_env "NANGO_SECRET_KEY" "$(get_env_value NANGO_SECRET_KEY)"
add_env "NANGO_PUBLIC_KEY" "$(get_env_value NANGO_PUBLIC_KEY)"
add_env "TWITCH_CLIENT_ID" "$(get_env_value TWITCH_CLIENT_ID)"
add_env "SCRAPIN_API_KEY" "$(get_env_value SCRAPIN_API_KEY)"
add_env "VITE_POSTHOG_KEY" "$(get_env_value VITE_POSTHOG_KEY)"
add_env "VITE_POSTHOG_HOST" "$(get_env_value VITE_POSTHOG_HOST)"

echo ""
echo "--- IMPORTANT VARIABLES ---"

add_env "PERPLEXITY_API_KEY" "$(get_env_value PERPLEXITY_API_KEY)"
add_env "GOOGLE_AI_API_KEY" "$(get_env_value GOOGLE_AI_API_KEY)"
add_env "WHOOP_WEBHOOK_SECRET" "$(get_env_value WHOOP_WEBHOOK_SECRET)"
add_env "NANGO_WEBHOOK_SECRET" "$(get_env_value NANGO_WEBHOOK_SECRET)"
add_env "PIPEDREAM_CLIENT_ID" "$(get_env_value PIPEDREAM_CLIENT_ID)"
add_env "PIPEDREAM_CLIENT_SECRET" "$(get_env_value PIPEDREAM_CLIENT_SECRET)"
add_env "PIPEDREAM_PROJECT_ID" "$(get_env_value PIPEDREAM_PROJECT_ID)"
add_env "PIPEDREAM_ENV" "production"
# Override redirect URI to production
add_env "REDDIT_REDIRECT_URI" "$PROD_CALLBACK"

echo ""
echo "--- EXISTING VARS (verify redirect URIs point to production) ---"

# These may already exist but should be verified/overridden to prod URLs
add_env "DISCORD_REDIRECT_URI" "$PROD_CALLBACK"
add_env "GITHUB_REDIRECT_URI" "$PROD_CALLBACK"
add_env "SLACK_REDIRECT_URI" "$PROD_CALLBACK"
add_env "LINKEDIN_REDIRECT_URI" "$PROD_CALLBACK"
add_env "YOUTUBE_REDIRECT_URI" "$PROD_CALLBACK"
add_env "GMAIL_REDIRECT_URI" "$PROD_CALLBACK"
add_env "GOOGLE_REDIRECT_URI" "$PROD_CALLBACK"
add_env "TEAMS_REDIRECT_URI" "$PROD_CALLBACK"

echo ""
echo "--- PRODUCTION APP URLS ---"

add_env "APP_URL" "$PROD_URL"
add_env "VITE_APP_URL" "$PROD_URL"
add_env "VITE_API_URL" "${PROD_URL}/api"
add_env "VITE_ENVIRONMENT" "production"
add_env "NODE_ENV" "production"

echo ""
echo "--- LOW PRIORITY (skipped) ---"
echo "  Skipping: MOLTBOT_*, OPEN_WEARABLES_*, PDL_API_KEY, MICROSOFT_*, GITHUB_PERSONAL_ACCESS_TOKEN"

echo ""
echo "=== Done! Run 'vercel env ls' to verify. ==="
echo ""
