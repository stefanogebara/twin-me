#!/bin/bash
# Script to add Phase 2 OAuth credentials to Vercel

echo "Adding Reddit OAuth credentials..."
vercel env add REDDIT_CLIENT_ID production <<< "sPdoyTecXWWSmtR8-6lGNA"
vercel env add REDDIT_CLIENT_SECRET production <<< "UORjGRTZjdQO8arKnHeMHRa9gEmhIA"

echo "Adding GitHub OAuth credentials..."
vercel env add GITHUB_CLIENT_ID production <<< "Ov23liY0gOsrEGMfcM9f"
echo "Note: GitHub Client Secret needs to be obtained from GitHub settings"
# GitHub secret is hidden - need to check if already exists or generate new one

echo "Adding Discord OAuth credentials..."
vercel env add DISCORD_CLIENT_ID production <<< "1423392139995513093"
echo "Note: Discord Client Secret needs to be obtained from Discord developer portal"
# Discord secret is hidden - need to check if already exists or generate new one

echo "Done! Note: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already exist for YouTube OAuth"
