# Health & Fitness Platform Setup Guide

This guide covers setup for Garmin Connect, Strava, and Fitbit integrations.

## Garmin Connect

### Developer Portal
1. Go to https://developer.garmin.com/
2. Sign in with your Garmin account
3. Create a new application

### OAuth Configuration
- **Authorization URL**: `https://connect.garmin.com/oauthConfirm`
- **Token URL**: `https://connect.garmin.com/oauth-service/oauth/access_token`
- **Scopes**: `GARMIN_HEALTH_API_WELLNESS_READ`

### Nango Setup
1. Go to Nango Dashboard > Integrations
2. Add new integration: `garmin`
3. Set OAuth credentials from Garmin Developer Portal
4. Add scope: `GARMIN_HEALTH_API_WELLNESS_READ`

### Available Data
- User profile
- Daily activity summaries
- Activities (runs, walks, etc.)
- Sleep data
- Heart rate data

---

## Strava

### Developer Portal
1. Go to https://www.strava.com/settings/api
2. Create a new application

### OAuth Configuration
- **Authorization URL**: `https://www.strava.com/oauth/authorize`
- **Token URL**: `https://www.strava.com/oauth/token`
- **Scopes**: `read,activity:read_all,profile:read_all`

### Nango Setup
1. Go to Nango Dashboard > Integrations
2. Add new integration: `strava`
3. Set OAuth credentials from Strava API Settings
4. Add scopes: `read`, `activity:read_all`, `profile:read_all`

### Available Data
- Athlete profile
- Activities (runs, rides, swims)
- Athlete stats (yearly/all-time)
- Training zones

---

## Fitbit

### Developer Portal
1. Go to https://dev.fitbit.com/apps
2. Sign in with your Fitbit account
3. Register a new application

### OAuth Configuration
- **Authorization URL**: `https://www.fitbit.com/oauth2/authorize`
- **Token URL**: `https://api.fitbit.com/oauth2/token`
- **Scopes**: `activity`, `heartrate`, `profile`, `sleep`, `weight`

### Nango Setup
1. Go to Nango Dashboard > Integrations
2. Add new integration: `fitbit`
3. Set OAuth credentials from Fitbit Developer Portal
4. Add scopes: `activity`, `heartrate`, `profile`, `sleep`, `weight`

### Available Data
- User profile
- Daily activity (steps, calories, distance)
- Sleep data
- Heart rate (intraday and resting)
- Weight/body logs

---

## Testing Integrations

After configuring each platform in Nango:

```bash
# Get platform list (should show 14+ platforms)
curl http://localhost:3004/api/nango/platforms | jq '.count'

# Test extraction (requires OAuth connection first)
curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3004/api/nango/extract/garmin

curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3004/api/nango/extract/strava

curl -H "Authorization: Bearer <JWT>" \
  http://localhost:3004/api/nango/extract/fitbit
```

## Common Issues

### Rate Limiting
All health platforms have rate limits:
- **Garmin**: 500 requests/15 minutes
- **Strava**: 100 requests/15 minutes, 1000/day
- **Fitbit**: 150 requests/hour

Our retry service handles 429 responses with exponential backoff.

### Token Refresh
Nango handles token refresh automatically. If you encounter 401 errors:
1. Check if the connection is still active in Nango Dashboard
2. Have the user re-authenticate if needed

### Missing Scopes
If certain endpoints return 403, the user may need to re-authenticate with additional scopes.
