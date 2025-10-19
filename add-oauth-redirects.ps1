# OAuth Redirect URI Addition Script
# Adds http://localhost:8086/oauth/callback to all platform OAuth apps

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OAuth Redirect URI Configuration Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$LOCAL_REDIRECT_URI = "http://localhost:8086/oauth/callback"

# Slack Configuration
$SLACK_APP_ID = "A09JFR059PC"
$SLACK_APP_URL = "https://api.slack.com/apps/$SLACK_APP_ID/oauth"

# Discord Configuration
$DISCORD_APP_ID = "1423392139995513093"
$DISCORD_APP_URL = "https://discord.com/developers/applications/$DISCORD_APP_ID/oauth2"

# GitHub Configuration
$GITHUB_OAUTH_URL = "https://github.com/settings/developers"

# LinkedIn Configuration
$LINKEDIN_APPS_URL = "https://www.linkedin.com/developers/apps"

Write-Host "This script will help you add redirect URIs to OAuth applications." -ForegroundColor Yellow
Write-Host "Since OAuth apps require authentication, manual configuration is needed." -ForegroundColor Yellow
Write-Host ""
Write-Host "Redirect URI to add: $LOCAL_REDIRECT_URI" -ForegroundColor Green
Write-Host ""

# Function to open browser and provide instructions
function Open-OAuthApp {
    param (
        [string]$Platform,
        [string]$Url,
        [string]$Instructions
    )

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "$Platform Configuration" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "URL: $Url" -ForegroundColor Green
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Yellow
    Write-Host $Instructions
    Write-Host ""

    $response = Read-Host "Open $Platform OAuth app in browser? (y/n)"
    if ($response -eq 'y') {
        Start-Process $Url
        Write-Host "✅ Opened $Url" -ForegroundColor Green
    }

    Write-Host ""
    Read-Host "Press Enter after adding redirect URI to continue..."
    Write-Host ""
}

# Slack
$slackInstructions = @"
1. Login to Slack if prompted
2. Navigate to 'OAuth & Permissions' (left sidebar)
3. Scroll to 'Redirect URLs' section
4. Click 'Add New Redirect URL'
5. Enter: $LOCAL_REDIRECT_URI
6. Click 'Add' (ignore HTTPS warning for localhost)
7. Click 'Save URLs' button at the bottom
"@

Open-OAuthApp -Platform "Slack" -Url $SLACK_APP_URL -Instructions $slackInstructions

# Discord
$discordInstructions = @"
1. Login to Discord if prompted
2. You should see the OAuth2 settings page
3. Scroll to 'Redirects' section
4. Click 'Add Redirect'
5. Enter: $LOCAL_REDIRECT_URI
6. Click 'Save Changes' at the bottom
"@

Open-OAuthApp -Platform "Discord" -Url $DISCORD_APP_URL -Instructions $discordInstructions

# GitHub
$githubInstructions = @"
1. Login to GitHub if prompted
2. Click 'OAuth Apps' in the left sidebar
3. Find the app with Client ID: Ov23liY0gOsrEGMfcM9f
4. Click on the app name

OPTION A (Temporary - for development):
  5. Find 'Authorization callback URL' field
  6. Change to: $LOCAL_REDIRECT_URI
  7. Click 'Update application'

  ⚠️ WARNING: This removes production redirect URI

OPTION B (Recommended - separate dev app):
  5. Go back to https://github.com/settings/developers
  6. Click 'New OAuth App'
  7. Fill in:
     - Application name: TwinMe Soul Signature (Dev)
     - Homepage URL: http://localhost:8086
     - Authorization callback URL: $LOCAL_REDIRECT_URI
  8. Click 'Register application'
  9. Copy the new Client ID and Client Secret
  10. Update .env file with dev credentials
"@

Open-OAuthApp -Platform "GitHub" -Url $GITHUB_OAUTH_URL -Instructions $githubInstructions

# LinkedIn
$linkedinInstructions = @"
1. Login to LinkedIn if prompted
2. Find 'TwinMe Soul Signature' app (or create new app)
3. Go to 'Auth' tab
4. Under 'OAuth 2.0 settings'
5. Find 'Redirect URLs' section
6. Click 'Add redirect URL'
7. Enter: $LOCAL_REDIRECT_URI
8. Click 'Update'

⚠️ NOTE: If no LinkedIn app exists, you'll need to create one first
"@

Open-OAuthApp -Platform "LinkedIn" -Url $LINKEDIN_APPS_URL -Instructions $linkedinInstructions

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test platform connections at: http://localhost:8086/get-started" -ForegroundColor White
Write-Host "2. Connect each platform (Slack, Discord, GitHub, LinkedIn)" -ForegroundColor White
Write-Host "3. Verify data extraction works" -ForegroundColor White
Write-Host ""
Write-Host "If GitHub Option B was chosen:" -ForegroundColor Yellow
Write-Host "- Update .env with new GitHub dev credentials" -ForegroundColor White
Write-Host "- Restart backend server: npm run server:dev" -ForegroundColor White
Write-Host ""
