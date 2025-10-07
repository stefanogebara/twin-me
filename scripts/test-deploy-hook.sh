#!/bin/bash
# Test Vercel Deploy Hook
# Usage: ./scripts/test-deploy-hook.sh <DEPLOY_HOOK_URL>

set -e

DEPLOY_HOOK_URL="${1:-$VERCEL_DEPLOY_HOOK_URL}"

if [ -z "$DEPLOY_HOOK_URL" ]; then
  echo "❌ ERROR: No deploy hook URL provided"
  echo ""
  echo "Usage:"
  echo "  ./scripts/test-deploy-hook.sh <DEPLOY_HOOK_URL>"
  echo ""
  echo "Or set environment variable:"
  echo "  export VERCEL_DEPLOY_HOOK_URL='https://api.vercel.com/v1/integrations/deploy/...'"
  echo "  ./scripts/test-deploy-hook.sh"
  exit 1
fi

echo "🚀 Testing Vercel Deploy Hook"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Deploy Hook URL: ${DEPLOY_HOOK_URL:0:50}..."
echo "⏰ Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

echo "📤 Sending POST request..."
RESPONSE=$(curl -X POST "$DEPLOY_HOOK_URL" \
  -H "Content-Type: application/json" \
  -w "\n%{http_code}" \
  -s)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo "📊 Response Details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "HTTP Status Code: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "✅ SUCCESS: Deployment triggered!"
  echo ""
  echo "Response Body:"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""

  # Try to extract job ID
  JOB_ID=$(echo "$BODY" | grep -o '"job":{"id":"[^"]*"' | grep -o 'id":"[^"]*"' | cut -d'"' -f3 || echo "")
  if [ -n "$JOB_ID" ]; then
    echo "🆔 Deployment Job ID: $JOB_ID"
  fi

  echo ""
  echo "🔗 Check deployment status at:"
  echo "   https://vercel.com/datalake-9521s-projects/twin-ai-learn"
  echo ""
  echo "✅ Deploy hook is working correctly!"

elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ ERROR: Deploy hook not found (HTTP 404)"
  echo ""
  echo "This means:"
  echo "  - The deploy hook URL is invalid or expired"
  echo "  - The hook was deleted from Vercel"
  echo ""
  echo "Fix:"
  echo "  1. Go to https://vercel.com/datalake-9521s-projects/twin-ai-learn/settings/git"
  echo "  2. Create a new deploy hook"
  echo "  3. Use the new URL"
  exit 1

elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "❌ ERROR: Authentication failed (HTTP $HTTP_CODE)"
  echo ""
  echo "This means:"
  echo "  - The deploy hook URL is incorrect"
  echo ""
  echo "Fix:"
  echo "  1. Verify you copied the complete URL from Vercel"
  echo "  2. The URL should start with: https://api.vercel.com/v1/integrations/deploy/"
  exit 1

else
  echo "❌ FAILED: Unexpected response (HTTP $HTTP_CODE)"
  echo ""
  echo "Response Body:"
  echo "$BODY"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
