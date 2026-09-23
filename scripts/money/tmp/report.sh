#!/bin/bash
set -u
cd "/Users/stefanogebara/code/twin-me/.claude/worktrees/hungry-shirley-4e2cac"
git fetch -q origin
sha=$(git rev-parse origin/main)
echo "waiting on the deploy of $(git log --oneline -1 origin/main)"
state=pending
while [ "$state" = "pending" ] || [ -z "$state" ]; do
  sleep 30
  state=$(gh api repos/stefanogebara/twin-me/commits/$sha/status --jq '[.statuses[]|select(.context=="Vercel")][0].state' 2>/dev/null)
  state=${state:-pending}
done
echo "deploy: $state"
if [ "$state" != "success" ]; then
  node scripts/money/tmp/vercel-why.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
  exit 1
fi
echo "=========== 1. what this build cost ==========="
node scripts/money/tmp/vercel-log.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
echo "=========== 2. recent deployments, to see the previews stop ==========="
node scripts/money/tmp/vercel-recent.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption" | head -10
echo "=========== 3. what the production API answers for the term ==========="
node scripts/money/tmp/prod-term.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
echo "=========== 4. the page itself, both widths ==========="
OUT=/Users/stefanogebara/code/twin-me/.claude/worktrees/hungry-shirley-4e2cac/.playwright-mcp node scripts/money/tmp/walk-term2.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption|TokenRefresh"
