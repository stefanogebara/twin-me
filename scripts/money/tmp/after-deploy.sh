#!/bin/bash
set -u
cd "/Users/stefanogebara/code/twin-me/.claude/worktrees/hungry-shirley-4e2cac"
echo "waiting for #501 to merge..."
until [ "$(gh pr view 501 --json state -q .state 2>/dev/null)" = "MERGED" ]; do sleep 20; done
git fetch -q origin
sha=$(git rev-parse origin/main)
echo "merged; main is $sha ($(git log --oneline -1 origin/main))"
echo "waiting for the Vercel deploy..."
state=pending
until [ "$state" != "pending" ] && [ -n "$state" ]; do
  sleep 30
  state=$(gh api repos/stefanogebara/twin-me/commits/$sha/status --jq '[.statuses[]|select(.context=="Vercel")][0].state' 2>/dev/null)
  state=${state:-pending}
done
echo "deploy state: $state"
[ "$state" != "success" ] && exit 1
echo "=========== 1. what the build cost this time ==========="
node scripts/money/tmp/vercel-log.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
echo "=========== 2. the plan the API answers ==========="
node scripts/money/tmp/prod-term.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
echo "=========== 3. the page itself ==========="
OUT=/Users/stefanogebara/code/twin-me/.claude/worktrees/hungry-shirley-4e2cac/.playwright-mcp node scripts/money/tmp/walk-term2.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption|TokenRefresh"
