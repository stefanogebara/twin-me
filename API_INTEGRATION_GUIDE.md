# API Integration Guide - Twin AI Learn Frontend

## Overview

This document provides comprehensive information about the frontend API integration work completed to replace demo/mock data with real backend API calls.

**Date**: January 2025
**Status**: ✅ Completed
**Migration**: Demo Data → Real API Integration

---

## Changes Summary

### Files Modified

1. **`src/services/soulApi.ts`** (NEW)
   - Centralized API service for all soul signature, twin chat, and platform endpoints
   - Includes retry logic, error handling, and proper authentication headers
   - Replaces scattered fetch calls with organized service methods

2. **`src/pages/Dashboard.tsx`**
   - Removed demo data fallbacks for stats
   - Now fetches real data from `useSoulSignature` hook
   - Updated status cards to show real platform counts and data points
   - Fixed platform count to use real `connectedPlatforms.length`

3. **`src/pages/Insights.tsx`**
   - Replaced hardcoded mock patterns with real API calls to `/api/soul/insights/:userId`
   - Integrated `useSoulSignature` hook for score data
   - Added proper error states and empty states
   - Transforms API insights into UI-friendly format

4. **`src/pages/TalkToTwin.tsx`**
   - Integrated `twinApi` service for real chat functionality
   - Fetches real twin statistics from `/api/twin/statistics/:userId`
   - Uses real conversation data (total messages, conversations, completion percentage)
   - Improved error messaging with `handleAPIError`

5. **`src/pages/SoulSignatureDashboard.tsx`**
   - Already using real data via `useSoulSignature` hook
   - Added TODO comments for remaining mock data (interests/traits from Claude AI)
   - Platform status derived from real API responses

6. **`src/contexts/AuthContext.tsx`**
   - Added clear documentation comments for demo mode vs real auth
   - Marked all demo mode logic with `DEMO MODE:` comments
   - Clarified that `isDemoMode` flag controls behavior throughout app

---

## API Service Architecture

### Core Service: `src/services/soulApi.ts`

#### Soul Signature APIs

```typescript
// Get soul signature for a user
soulApi.getSoulSignature(userId: string): Promise<SoulSignatureResponse>
// Endpoint: GET /api/soul/signature/:userId

// Get soul status (platforms and extraction progress)
soulApi.getSoulStatus(userId: string): Promise<SoulStatusResponse>
// Endpoint: GET /api/soul/status/:userId

// Get soul insights (Claude-generated personality patterns)
soulApi.getSoulInsights(userId: string): Promise<SoulInsightsResponse>
// Endpoint: GET /api/soul/insights/:userId

// Trigger soul extraction for a user
soulApi.triggerExtraction(userId: string): Promise<{ success: boolean; message: string }>
// Endpoint: POST /api/soul/extract/:userId
```

#### Twin Chat APIs

```typescript
// Get all conversations for a user
twinApi.getConversations(userId: string): Promise<TwinConversation[]>
// Endpoint: GET /api/twin/conversations/:userId

// Get messages for a conversation
twinApi.getConversationMessages(conversationId: string): Promise<TwinMessage[]>
// Endpoint: GET /api/twin/conversations/:conversationId/messages

// Get twin statistics
twinApi.getTwinStats(userId: string): Promise<TwinStatsResponse>
// Endpoint: GET /api/twin/statistics/:userId

// Send a message to the twin
twinApi.sendMessage(conversationId: string | null, message: string, options?: {...}): Promise<{...}>
// Endpoint: POST /api/twin/chat
```

#### Platform APIs

```typescript
// Get platform connection status
platformApi.getStatus(userId?: string): Promise<{ platforms: PlatformConnectionStatus[] }>
// Endpoint: GET /api/platforms/status

// Trigger sync for a specific platform
platformApi.syncPlatform(platform: string): Promise<{ success: boolean }>
// Endpoint: POST /api/platforms/sync/:platform
```

### Authentication Headers

All API calls include proper authentication:

```typescript
const getAuthHeaders = (): AuthHeaders => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : undefined
  };
};
```

### Retry Logic

All fetch calls use `fetchWithRetry` which:
- Retries up to 3 times on 5xx errors and rate limits (429)
- Uses exponential backoff (1s, 2s, 4s)
- Does NOT retry on 4xx client errors (except 429)
- Throws clear error messages for debugging

---

## Page-by-Page Integration

### Dashboard (`src/pages/Dashboard.tsx`)

**Before:**
```typescript
const connectedPlatforms = isDemoMode ?
  DEMO_DATA.platformConnections.filter(p => p.connected).length :
  realConnectedPlatforms;
```

**After:**
```typescript
const connectedPlatforms = realConnectedPlatforms; // Direct from API
```

**Real Data Shown:**
- ✅ Soul Windows Connected: `connectedPlatforms.length`
- ✅ Authentic Moments Captured: `score?.insights?.totalDataPoints`
- ✅ Self-Discovery Journey: `score?.overall` percentage
- ✅ Twin Readiness: `stats.trainingStatus` from training API

**Empty State:**
- When `connectedPlatforms.length === 0`, shows onboarding CTA

---

### Insights Page (`src/pages/Insights.tsx`)

**Before:**
```typescript
setPatterns([
  { id: '1', title: "You're a Weekend Learner", ... }  // Hardcoded
]);
```

**After:**
```typescript
const insightsData = await soulApi.getSoulInsights(user.id);
const transformedPatterns = insightsData.insights.map((insight, index) => ({
  id: `pattern-${index}`,
  title: insight.title,
  description: insight.description,
  icon: getIconForCategory(insight.category),
  confidence: Math.round(insight.confidence * 100)
}));
setPatterns(transformedPatterns);
```

**Real Data Shown:**
- ✅ Pattern discoveries from Claude AI analysis
- ✅ Confidence scores (0-100%)
- ✅ Interest categories derived from personal/professional split
- ✅ Soul signature health metrics (completeness, data freshness, suggestions)

**Empty State:**
- When `patterns.length === 0 && connectedPlatforms.length === 0`
- Shows "No Insights Yet" with CTA to connect platforms

**Error State:**
- Shows error message with "Try Again" button

---

### Twin Chat (`src/pages/TalkToTwin.tsx`)

**Before:**
```typescript
const response = await fetch(`${API_URL}/twin/chat`, {
  method: 'POST',
  body: JSON.stringify({...})
});
```

**After:**
```typescript
const data = await twinApi.sendMessage(conversationId, messageToSend, {
  twinType: twinMode,
  context: conversationContext
});
```

**Real Data Shown:**
- ✅ Twin completion percentage: `twinStats.completion_percentage`
- ✅ Total messages: `twinStats.total_messages`
- ✅ Total conversations: `twinStats.total_conversations`
- ✅ Connected platforms: `twinStats.connected_platforms`
- ✅ Last interaction time: `twinStats.last_interaction`

**Empty State:**
- When `connectedCount === 0`, shows "Your Twin Needs Data" with CTA
- When `messages.length === 0`, shows conversation starters

**Loading State:**
- Shows loading skeleton for stats panel
- Shows typing indicator during AI response generation

---

### Soul Signature Dashboard (`src/pages/SoulSignatureDashboard.tsx`)

**Current Status:**
- ✅ Already uses real data via `useSoulSignature` hook
- ✅ Platform connections from real API
- ✅ Authenticity score calculated from real data
- ✅ Data points aggregated from connected platforms

**Remaining Mock Data (Future Work):**
```typescript
// TODO: Replace with real API data from /api/soul/signature/:userId
// These would come from Claude AI analysis of platform data
const topInterests = [...];  // Currently generic based on connected count
const coreTraits = [...];    // Currently generic based on connected count
```

**Note:** Full interest/trait extraction requires:
1. Backend endpoint: `/api/soul/signature/:userId` to return detailed personality analysis
2. Claude AI integration for deep pattern recognition
3. Life cluster aggregation from multiple platforms

---

## Loading States

All pages implement proper loading states:

### Dashboard
```typescript
if (loading) {
  return <PageLoader />;
}
```

### Insights
```typescript
if (loading || soulLoading) {
  return (
    <div className="flex items-center justify-center h-screen">
      <Activity className="w-8 h-8 animate-spin" />
      <p>Loading insights...</p>
    </div>
  );
}
```

### Twin Chat
```typescript
{statsLoading ? (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="w-6 h-6 animate-spin" />
  </div>
) : (
  <div className="grid grid-cols-2 gap-3">...</div>
)}
```

---

## Error States

### Insights Page Error Handling

```typescript
if (error) {
  return (
    <div className="flex items-center justify-center h-screen">
      <AlertCircle className="w-12 h-12 text-red-600" />
      <h2>Failed to Load Insights</h2>
      <p>{error}</p>
      <button onClick={loadInsights}>Try Again</button>
    </div>
  );
}
```

### Twin Chat Error Handling

```typescript
catch (error) {
  const errorMessage: Message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: `Sorry, I encountered an error: ${handleAPIError(error)}`,
    timestamp: new Date()
  };
  setMessages(prev => [...prev, errorMessage]);
}
```

---

## Empty States

### Insights Page
- **Condition**: `patterns.length === 0 && connectedPlatforms.length === 0`
- **Shows**: Sparkles icon, "No Insights Yet", CTA to connect platforms

### Twin Chat
- **Condition 1**: `connectedCount === 0`
  - Shows: "Your Twin Needs Data", explains need for platform connections
- **Condition 2**: `messages.length === 0` (but platforms connected)
  - Shows: "Start a Conversation", test question suggestions

### Dashboard
- Uses existing onboarding flow when no platforms connected

---

## Demo Mode Behavior

### AuthContext Demo Mode

Demo mode is controlled by `localStorage.getItem('demo_mode') === 'true'`

**When Active:**
1. `user` is set to `DEMO_USER` from `demoDataService`
2. `isDemoMode` flag is `true` throughout app
3. Token validation is skipped
4. Console logs show `[AuthContext] 🎭 Demo mode active`

**Entry Point:**
- Landing page "Explore Demo" button sets demo mode
- User can exit demo mode by signing out

**API Behavior in Demo Mode:**
- Most API calls will still execute (allowing backend testing)
- Frontend components check `isDemoMode` for conditional rendering
- DEMO_DATA fallbacks exist in some components for activity feeds

---

## Environment Variables

Ensure `.env` has correct API URL:

```env
VITE_API_URL=http://127.0.0.1:3001/api
```

**Important Notes:**
- Frontend uses `VITE_API_URL` (includes `/api` path)
- Backend runs on port `3001`
- Frontend dev server runs on port `8086`
- All OAuth redirects use `127.0.0.1` (not `localhost`)

---

## Testing Checklist

### ✅ Completed Integration Tests

- [x] Dashboard loads real stats from API
- [x] Soul Signature page fetches from `/api/soul/signature/:userId` (via hook)
- [x] Insights page fetches from `/api/soul/insights/:userId`
- [x] Platform Status fetches from `/api/platforms/status`
- [x] Twin Chat fetches from `/api/twin/*` endpoints
- [x] Twin stats show real message/conversation counts
- [x] Loading skeletons show during data fetch
- [x] Error states display when API fails
- [x] Empty states show when no data exists
- [x] Demo mode clearly marked in AuthContext

### Manual Testing Steps

1. **Start Backend**: `npm run server:dev` (port 3001)
2. **Start Frontend**: `npm run dev` (port 8086)
3. **Sign In**: Use real Google OAuth or test credentials
4. **Connect Platforms**: Connect Spotify, Discord, or GitHub
5. **Verify Dashboard**: Check stats update with real platform counts
6. **Check Insights**: Navigate to insights, verify Claude-generated patterns
7. **Test Twin Chat**: Send messages, verify conversation persistence
8. **Trigger Extraction**: Connect new platform, watch real-time sync
9. **Test Demo Mode**: Click "Explore Demo" on landing page, verify DEMO_USER

---

## Future Enhancements

### 1. Real-Time Updates

Add WebSocket connection for live platform sync status:

```typescript
// src/hooks/useRealtimeSync.ts
const socket = io(API_URL);
socket.on('platform:synced', (data) => {
  refetch(); // Refresh soul signature
});
```

### 2. Advanced Caching

Implement React Query for automatic caching:

```typescript
const { data } = useQuery({
  queryKey: ['soul-signature', userId],
  queryFn: () => soulApi.getSoulSignature(userId),
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000  // 30 minutes
});
```

### 3. Optimistic Updates

Update UI immediately before API confirmation:

```typescript
const mutation = useMutation({
  mutationFn: twinApi.sendMessage,
  onMutate: async (newMessage) => {
    // Optimistically update UI
    setMessages(prev => [...prev, newMessage]);
  },
  onError: (err, newMessage, context) => {
    // Rollback on error
    setMessages(prev => prev.filter(m => m.id !== newMessage.id));
  }
});
```

### 4. Complete Soul Signature Extraction

**Backend Enhancement Needed:**

```typescript
// New endpoint: GET /api/soul/signature/:userId
// Returns:
{
  userId: string;
  interests: Array<{ name: string; intensity: number; sources: string[] }>;
  traits: Array<{ name: string; strength: number; confidence: number }>;
  clusters: Array<LifeCluster>;
  personality: {
    bigFive: { openness: number; conscientiousness: number; ... };
    mbti?: string;
    enneagram?: number;
  };
  lastAnalyzed: string;
}
```

**Frontend Update:**

```typescript
// In SoulSignatureDashboard.tsx
useEffect(() => {
  if (user?.id) {
    soulApi.getSoulSignature(user.id).then(data => {
      setTopInterests(data.interests.map(i => i.name));
      setCoreTraits(data.traits.map(t => t.name));
      // ... populate visualization
    });
  }
}, [user?.id]);
```

---

## Troubleshooting

### Issue: "Failed to fetch" errors

**Causes:**
1. Backend not running (`npm run server:dev`)
2. Wrong API URL in `.env`
3. CORS configuration issues

**Solution:**
```bash
# 1. Check backend is running
curl http://127.0.0.1:3001/api/health

# 2. Verify .env
cat .env | grep VITE_API_URL

# 3. Check backend CORS in api/index.js
```

### Issue: Empty data despite connected platforms

**Causes:**
1. Platform extraction not completed
2. User ID mismatch between frontend and backend
3. Database query failing silently

**Solution:**
```typescript
// Add debugging in browser console
localStorage.getItem('auth_token');  // Check token exists
user?.id;  // Check user ID matches backend

// Check backend logs for extraction status
```

### Issue: Demo mode not working

**Causes:**
1. `localStorage.getItem('demo_mode')` not set to `'true'`
2. DEMO_USER import missing
3. isDemoMode checks failing

**Solution:**
```javascript
// Manually enable demo mode in browser console
localStorage.setItem('demo_mode', 'true');
window.location.reload();

// Check demo mode status
console.log('Demo mode:', localStorage.getItem('demo_mode'));
```

---

## Contact & Support

For questions or issues with the API integration:

1. Check backend logs: `npm run server:dev`
2. Check browser console for frontend errors
3. Review API endpoint documentation in `CLAUDE.md`
4. Test endpoints with Postman or curl

---

## Changelog

### January 2025 - Initial API Integration

- ✅ Created centralized `soulApi.ts` service
- ✅ Replaced demo data in Dashboard.tsx
- ✅ Integrated real insights in Insights.tsx
- ✅ Connected twin chat to real API
- ✅ Marked demo mode clearly in AuthContext
- ✅ Added loading/error/empty states throughout
- ✅ Documented all changes in this guide

### Next Steps

- [ ] Add real-time WebSocket updates
- [ ] Implement React Query caching
- [ ] Complete soul signature extraction with Claude AI
- [ ] Add optimistic UI updates for better UX
- [ ] Create automated API integration tests
