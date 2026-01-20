# Wearable Platform OAuth Setup Guide

This guide explains how to set up real OAuth credentials for wearable platforms.

## Overview

TwinMe uses **Open Wearables** (self-hosted) to connect to wearable devices. You need to:
1. Register as a developer with each platform
2. Get OAuth credentials (Client ID & Secret)
3. Add credentials to Open Wearables config

## Platform-by-Platform Setup

### 1. Garmin Connect

**Developer Portal:** https://developer.garmin.com/

1. Create a Garmin developer account
2. Go to "Health API" section
3. Create a new application
4. Set OAuth redirect URI: `http://localhost:8000/api/v1/oauth/garmin/callback`
5. Copy your Consumer Key and Consumer Secret

**Add to Open Wearables config (`open-wearables/backend/config/.env`):**
```env
GARMIN_CONSUMER_KEY=your-consumer-key
GARMIN_CONSUMER_SECRET=your-consumer-secret
```

### 2. Polar Flow

**Developer Portal:** https://www.polar.com/accesslink/

1. Register for Polar AccessLink API
2. Create a new application
3. Set OAuth redirect URI: `http://localhost:8000/api/v1/oauth/polar/callback`
4. Copy Client ID and Client Secret

**Add to Open Wearables config:**
```env
POLAR_CLIENT_ID=your-client-id
POLAR_CLIENT_SECRET=your-client-secret
```

### 3. Suunto

**Developer Portal:** https://www.suunto.com/en-us/Support/Suunto-app/

1. Contact Suunto developer relations for API access
2. Register your application
3. Set OAuth redirect URI: `http://localhost:8000/api/v1/oauth/suunto/callback`

**Add to Open Wearables config:**
```env
SUUNTO_CLIENT_ID=your-client-id
SUUNTO_CLIENT_SECRET=your-client-secret
```

### 4. WHOOP

**Developer Portal:** https://developer.whoop.com/

1. Apply for WHOOP API access
2. Create an application once approved
3. Set OAuth redirect URI: `http://localhost:8000/api/v1/oauth/whoop/callback`

**Add to Open Wearables config:**
```env
WHOOP_CLIENT_ID=your-client-id
WHOOP_CLIENT_SECRET=your-client-secret
```

### 5. Apple Health

Apple Health doesn't use OAuth - data is imported via:
- Export from iPhone Health app
- Third-party sync apps (Auto Health Export, etc.)

Open Wearables supports Apple Health data import via XML file upload.

## Restart Open Wearables

After adding credentials:

```bash
cd open-wearables
docker compose restart
```

## Verify Configuration

1. Go to http://localhost:8000/docs
2. Check `/api/v1/oauth/providers` endpoint
3. Each configured provider should show `is_enabled: true`

## TwinMe Configuration

Ensure these are set in TwinMe's `.env`:

```env
OPEN_WEARABLES_URL=http://localhost:8000
OPEN_WEARABLES_API_KEY=your-api-key-from-developer-portal
```

Get the API key from Open Wearables developer portal at http://localhost:3000

## Data Flow

Once configured:

1. User clicks "Connect Garmin" in TwinMe
2. TwinMe calls Open Wearables `/oauth/garmin/authorize`
3. User redirected to Garmin login
4. After login, redirected back to TwinMe
5. TwinMe calls `/wearables/sync` to fetch data
6. Data stored in `user_platform_data` table
7. Soul Signature builder includes wearable insights

## Troubleshooting

### "Invalid client_id" error
- Double-check the OAuth credentials in Open Wearables config
- Ensure the redirect URI matches exactly what's registered with the provider

### "Token expired" error
- Open Wearables should auto-refresh tokens
- Check logs: `docker compose logs -f backend`

### No data syncing
- Verify the user has a device connected to their account
- Some platforms have data availability delays (up to 24 hours)
