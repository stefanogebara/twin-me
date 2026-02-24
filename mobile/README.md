# TwinMe Android App

React Native (Expo) app for TwinMe — your soul signature, in your pocket.

## Features

- **Home**: Memory count, platform breakdown, top twin insights
- **Twin Chat**: Real-time streaming conversation with your AI twin
- **Settings**: App usage sync toggle, Android permissions, sign out
- **Background Sync**: Uploads Android usage stats every 6 hours (Phase 4)

## Setup

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_URL to your backend
```

- **Android emulator**: `http://10.0.2.2:3004/api` (emulator's host loopback)
- **Physical device on LAN**: `http://192.168.x.x:3004/api`

### 3. Start development server

```bash
npm start          # Start Metro bundler
npm run android    # Open in Android emulator
```

## Running on a Physical Device (Expo Go)

1. Install [Expo Go](https://expo.dev/go) on your Android phone
2. Run `npm start` in this directory
3. Scan the QR code with your phone's camera

> Your phone and computer must be on the same Wi-Fi network.
> Update `EXPO_PUBLIC_API_URL` to your machine's LAN IP.

## Cloud Build (EAS)

No Android Studio required for production builds:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production
```

## Android Permissions

The app requests:

| Permission | Purpose |
|-----------|---------|
| `PACKAGE_USAGE_STATS` | App time tracking via UsageStatsManager |
| `BIND_NOTIFICATION_LISTENER_SERVICE` | Notification frequency patterns |
| `FOREGROUND_SERVICE` | Background data sync |

**Usage stats** must be granted manually:
Android Settings → Apps → Special App Access → Usage Access → TwinMe

## Project Structure

```
mobile/
├── App.tsx                 # Root navigator + auth gate
├── app.json                # Expo config (permissions, plugins)
├── eas.json                # EAS build profiles
├── src/
│   ├── constants/          # Colors, API URL, storage keys
│   ├── hooks/              # useAuth
│   ├── screens/            # Login, Home, TwinChat, Settings
│   ├── services/           # API client (auth, memory, chat, sync)
│   └── types/              # TypeScript interfaces
```

## Backend Integration

The mobile app connects to the same TwinMe backend as the web app:

- `POST /api/auth/login` — get JWT
- `GET /api/auth/verify` — validate stored token
- `GET /api/twin/memory-stats` — memory count + platform breakdown
- `GET /api/twin/insights` — top twin insights
- `POST /api/twin/chat/message?stream=1` — streaming twin chat (SSE)
- `POST /api/imports/gdpr` — upload Android usage data

### Android Usage Upload

When background sync runs, it uploads a JSON payload:

```json
{
  "apps": [
    { "packageName": "com.spotify.music", "appName": "Spotify", "totalTimeMs": 3600000, "date": "2026-02-24" }
  ],
  "notifications": [
    { "packageName": "com.whatsapp", "appName": "WhatsApp", "count": 45, "date": "2026-02-24" }
  ],
  "capturedAt": "2026-02-24T12:00:00Z"
}
```

This gets ingested as `platform: 'android_usage'` via the GDPR import pipeline.
