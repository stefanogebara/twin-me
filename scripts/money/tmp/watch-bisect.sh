#!/bin/bash
set -u
cd "/Users/stefanogebara/code/twin-me/.claude/worktrees/hungry-shirley-4e2cac"
echo "waiting for the bisect preview to finish building..."
for i in $(seq 1 60); do
  out=$(node scripts/money/tmp/vercel-recent.mjs 2>/dev/null | grep "bisect/api-orphan" | head -1)
  echo "  $out"
  case "$out" in
    *READY*) break ;;
    *ERROR*) echo "the preview errored"; node scripts/money/tmp/vercel-why.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"; exit 1 ;;
  esac
  sleep 45
done
echo "=== the phases of that build ==="
node scripts/money/tmp/vercel-bisect-log.mjs 2>&1 | grep -vE "dotenv|Supabase|Encryption"
