# Manual Production Testing Guide
## Testing All Platform Connectors (Except GitHub)

**Date:** October 24, 2025
**Platform:** https://twin-ai-learn.vercel.app
**Objective:** Test all platform connections and verify full platform functionality

---

## 🔐 Initial Finding from Automated Test

**Status:** ⚠️ **Authentication Required**

The automated Playwright test revealed that the platform **requires user login** to access platform connectors and dashboard features. This is correct security behavior.

**What the automated test found:**
- ✅ Landing page loads correctly
- ✅ Backend health endpoint is operational (database connected)
- ⚠️ Platform connectors page requires authentication
- ⚠️ Dashboard shows "Sign in to discover your soul signature" (login prompt)

---

## 📋 Manual Testing Checklist

### Step 1: Log In to the Platform ✓

1. Open browser and navigate to: https://twin-ai-learn.vercel.app
2. Click "Sign in" or "Login" button
3. Complete authentication (Google OAuth or email/password)
4. Verify you're redirected to the dashboard

**Expected Result:** You should see your personal dashboard with existing connections displayed

---

### Step 2: Navigate to Platform Connections

1. Go to: https://twin-ai-learn.vercel.app/get-started
2. Verify the page loads correctly
3. Look for platform connection cards

**What to Check:**
- [ ] Page loads without errors
- [ ] Platform cards are visible
- [ ] Current connection status is displayed for each platform
- [ ] "Connect" buttons visible for disconnected platforms
- [ ] "Connected ✓" badges visible for connected platforms

**Take Screenshot:** `manual-get-started-logged-in.png`

---

### Step 3: Test Gmail Connection

**Current Status (from database):** Connected, but needs_reauth (token expired Oct 22)

**Steps:**
1. Find Gmail card on /get-started page
2. Click "Reconnect" or "Connect" button
3. Follow Google OAuth flow:
   - Select your Google account
   - Grant permissions for Gmail access
   - Wait for redirect back to Twin AI Learn

**Expected Result:**
- ✅ OAuth popup opens
- ✅ Permissions requested clearly
- ✅ Redirect back to platform
- ✅ Status changes to "Connected ✓"

**Verification:**
- [ ] Connection status shows "Connected"
- [ ] Token expiration date is updated (check dashboard)
- [ ] No error messages

**Take Screenshot:** `manual-gmail-connected.png`

---

### Step 4: Test Google Calendar Connection

**Current Status (from database):** Connected, but needs_reauth (token expired Oct 22)

**Steps:**
1. Find Google Calendar card
2. Click "Reconnect" button
3. Follow Google OAuth flow
4. Grant Calendar permissions

**Expected Result:**
- ✅ OAuth successful
- ✅ Status shows "Connected ✓"
- ✅ Token refreshes

**Verification:**
- [ ] Connection successful
- [ ] Can view calendar data in dashboard (if available)

**Take Screenshot:** `manual-calendar-connected.png`

---

### Step 5: Test Discord Connection

**Current Status (from database):** ✅ Connected (fixed in Option 1)

**Steps:**
1. Find Discord card
2. Verify it shows "Connected ✓" badge
3. Click on Discord card to see details (if available)

**Expected Result:**
- ✅ Already connected
- ✅ No action needed
- ✅ Shows green/success indicator

**Verification:**
- [ ] Shows as connected
- [ ] Token expires: Oct 30 (valid)
- [ ] Can disconnect and reconnect if desired

**Take Screenshot:** `manual-discord-status.png`

---

### Step 6: Test Reddit Connection

**Current Status (from database):** ✅ Connected (fresh token, expires Oct 25)

**Steps:**
1. Find Reddit card
2. Verify "Connected ✓" status
3. Optional: Disconnect and reconnect to test OAuth flow

**Expected Result:**
- ✅ Shows as connected
- ✅ Token valid until tomorrow

**Verification:**
- [ ] Connection status correct
- [ ] Reddit data being extracted (check dashboard)

**Take Screenshot:** `manual-reddit-status.png`

---

### Step 7: Test Spotify Connection

**Current Status (from database):** needs_reauth (encryption_key_mismatch)

**Steps:**
1. Find Spotify card
2. Click "Reconnect" button
3. Follow Spotify OAuth flow:
   - Log in to Spotify (if needed)
   - Authorize Twin AI Learn
   - Grant permissions for listening history

**Expected Result:**
- ✅ OAuth popup opens
- ✅ Spotify login page loads
- ✅ Permissions clearly listed
- ✅ Redirect back successful
- ✅ Status changes to "Connected ✓"

**Verification:**
- [ ] Connection successful
- [ ] Encryption key issue resolved
- [ ] Token stored correctly
- [ ] Can see Spotify data in dashboard

**Take Screenshot:** `manual-spotify-connected.png`

**Test Data Extraction:**
- [ ] Check if recent listening history appears in dashboard
- [ ] Verify personality insights from music taste

---

### Step 8: Test YouTube Connection

**Current Status (from database):** needs_reauth (encryption_key_mismatch)

**Steps:**
1. Find YouTube card
2. Click "Reconnect" button
3. Follow Google OAuth flow for YouTube
4. Grant YouTube permissions (view subscriptions, watch history)

**Expected Result:**
- ✅ Google account selection
- ✅ YouTube-specific permissions requested
- ✅ Redirect successful
- ✅ Status shows "Connected ✓"

**Verification:**
- [ ] Connection successful
- [ ] Encryption issue resolved
- [ ] YouTube subscriptions visible (if feature exists)
- [ ] Watch history being extracted

**Take Screenshot:** `manual-youtube-connected.png`

---

### Step 9: Test Slack Connection

**Current Status (from database):** Disconnected (no refresh token)

**Steps:**
1. Find Slack card
2. Click "Connect" button
3. Follow Slack OAuth flow:
   - Select Slack workspace
   - Authorize app
   - Grant permissions

**Expected Result:**
- ✅ Slack workspace selection page
- ✅ Permissions clearly listed
- ✅ Redirect successful
- ✅ Refresh token stored this time

**Verification:**
- [ ] Connection successful
- [ ] Refresh token stored (check database)
- [ ] Slack messages/activity can be extracted

**Take Screenshot:** `manual-slack-connected.png`

**Note:** This is a fresh connection, so refresh token should be stored properly now.

---

### Step 10: Test LinkedIn Connection

**Current Status (from database):** Disconnected (no refresh token)

**Steps:**
1. Find LinkedIn card
2. Click "Connect" button
3. Follow LinkedIn OAuth flow:
   - Log in to LinkedIn
   - Authorize app
   - Grant profile access

**Expected Result:**
- ✅ LinkedIn login page
- ✅ Authorization successful
- ✅ Refresh token stored

**Verification:**
- [ ] Connection successful
- [ ] Profile data visible
- [ ] Connection persists after page refresh

**Take Screenshot:** `manual-linkedin-connected.png`

---

### Step 11: Test Dashboard with All Connections

**URL:** https://twin-ai-learn.vercel.app/soul-signature

**Steps:**
1. Navigate to Soul Signature dashboard
2. Verify all connection stats are updated
3. Check data points count
4. Look for recent activity

**What to Check:**
- [ ] Connection count shows 8/8 or 9/9 (excluding GitHub)
- [ ] Data points number is displayed
- [ ] Soul signature progress shows percentage
- [ ] Recent activity feed is populated
- [ ] Personality insights visible (if data extracted)

**Expected Results:**
- ✅ Dashboard loads without errors
- ✅ All stats are accurate
- ✅ Visual indicators for each platform
- ✅ Data from all platforms is being processed

**Take Screenshot:** `manual-dashboard-all-connected.png`

---

### Step 12: Test Data Extraction

For each connected platform, verify data is being extracted:

**Gmail:**
- [ ] Communication style analysis
- [ ] Response patterns
- [ ] Email frequency

**Calendar:**
- [ ] Schedule patterns
- [ ] Work-life balance
- [ ] Meeting frequency

**Discord:**
- [ ] Server participation
- [ ] Message activity
- [ ] Community involvement

**Reddit:**
- [ ] Subreddit interests
- [ ] Comment style
- [ ] Discussion topics

**Spotify:**
- [ ] Music taste
- [ ] Listening patterns
- [ ] Mood analysis

**YouTube:**
- [ ] Watch history
- [ ] Subscriptions
- [ ] Content preferences

**Slack:**
- [ ] Work communication
- [ ] Team dynamics
- [ ] Response time

**LinkedIn:**
- [ ] Professional network
- [ ] Skills
- [ ] Career trajectory

**Take Screenshots:** One per platform showing extracted data

---

### Step 13: Test Browser Extension Integration

**Steps:**
1. Ensure browser extension is installed
2. Visit a few websites (GitHub, Discord, etc.)
3. Perform some actions (type, click, scroll)
4. Wait 30 seconds for batch send
5. Check dashboard for new events

**Expected Results:**
- ✅ Extension captures behavioral events
- ✅ Events sent to backend (HTTP 200)
- ✅ Events stored in database
- ✅ Dashboard shows updated event count

**Verification Query (if you have database access):**
```sql
SELECT COUNT(*) FROM soul_observer_events
WHERE user_id = 'your-user-id'
AND created_at > NOW() - INTERVAL '10 minutes';
```

**Expected:** Should show new events from the last 10 minutes

---

### Step 14: Test Error Handling

**Tests to Perform:**

**Test 1: Token Expiration**
1. Wait for a token to expire naturally OR manually expire one in database
2. Try to use that connection
3. Verify error message is clear
4. Verify "Reconnect" button appears

**Test 2: Network Interruption**
1. Disconnect internet briefly
2. Try to connect a platform
3. Verify error message is user-friendly
4. Verify retry mechanism works

**Test 3: OAuth Cancellation**
1. Start OAuth flow
2. Click "Cancel" or "Deny" on OAuth page
3. Verify platform handles gracefully
4. Verify can retry connection

**Expected Results:**
- ✅ Clear error messages
- ✅ No crashes or white screens
- ✅ Easy recovery options
- ✅ Helpful guidance for users

---

### Step 15: Test Responsive Design

**Desktop (1440px):**
1. View dashboard on large screen
2. Verify layout is optimal
3. All cards visible
4. No overflow or scroll issues

**Tablet (768px):**
1. Resize browser to tablet width
2. Verify responsive grid
3. Touch targets adequate
4. No horizontal scroll

**Mobile (375px):**
1. View on mobile device or resize browser
2. Verify single column layout
3. All features accessible
4. Touch-friendly buttons

**Take Screenshots:** Desktop, tablet, mobile for both dashboard and connections page

---

### Step 16: Test Disconnection

**Steps:**
1. Choose one connected platform (e.g., Reddit)
2. Click "Disconnect" button
3. Confirm disconnection
4. Verify status updates
5. Reconnect to verify OAuth still works

**Expected Results:**
- ✅ Disconnect confirmation dialog
- ✅ Status changes to "Disconnected"
- ✅ Data stops being extracted
- ✅ Can reconnect successfully

---

## 📊 Testing Checklist Summary

### Platform Connections (8 platforms)
- [ ] Gmail - Connect/Reconnect
- [ ] Google Calendar - Connect/Reconnect
- [ ] Discord - Verify connected
- [ ] Reddit - Verify connected
- [ ] Spotify - Reconnect (fix encryption)
- [ ] YouTube - Reconnect (fix encryption)
- [ ] Slack - Fresh connect
- [ ] LinkedIn - Fresh connect

### Dashboard Features
- [ ] Connection count accurate
- [ ] Data points displayed
- [ ] Soul signature progress
- [ ] Recent activity feed
- [ ] Personality insights
- [ ] Visual indicators

### Data Extraction
- [ ] Gmail data extracted
- [ ] Calendar data extracted
- [ ] Discord data extracted
- [ ] Reddit data extracted
- [ ] Spotify data extracted
- [ ] YouTube data extracted
- [ ] Slack data extracted
- [ ] LinkedIn data extracted

### Browser Extension
- [ ] Events captured
- [ ] Events sent successfully
- [ ] Events stored in database
- [ ] Dashboard updated

### Error Handling
- [ ] Token expiration handled
- [ ] Network errors handled
- [ ] OAuth cancellation handled
- [ ] Clear error messages

### Responsive Design
- [ ] Desktop (1440px) working
- [ ] Tablet (768px) working
- [ ] Mobile (375px) working

### User Experience
- [ ] Disconnect/reconnect flow
- [ ] OAuth flows smooth
- [ ] No console errors
- [ ] Fast page loads

---

## 🐛 Issues to Watch For

### Common Issues to Check:

**1. Token Refresh Failures**
- Symptom: Platforms disconnect after 1 hour
- Check: `token_expires_at` in database
- Fix: Verify cron service is running every 5 minutes

**2. Encryption Key Mismatches**
- Symptom: "encryption_key_mismatch" status
- Affected: Spotify, YouTube (currently)
- Fix: Reconnect to re-encrypt with current key

**3. Missing Refresh Tokens**
- Symptom: Platforms disconnect and can't auto-refresh
- Affected: Slack, LinkedIn (currently)
- Fix: Fresh OAuth flow to capture refresh token

**4. RLS Policy Issues**
- Symptom: Seeing other users' connections or none at all
- Fix: Should be fixed in migration 008, but verify

**5. Browser Extension Not Capturing**
- Symptom: Event count not increasing
- Check: Extension enabled in Chrome
- Check: Backend returning HTTP 200

---

## 📸 Screenshots to Capture

Save all screenshots with descriptive names:

1. `manual-login.png` - Login page
2. `manual-get-started-logged-in.png` - Platform connections page
3. `manual-gmail-connected.png` - Gmail connected
4. `manual-calendar-connected.png` - Calendar connected
5. `manual-discord-status.png` - Discord status
6. `manual-reddit-status.png` - Reddit status
7. `manual-spotify-connected.png` - Spotify reconnected
8. `manual-youtube-connected.png` - YouTube reconnected
9. `manual-slack-connected.png` - Slack freshly connected
10. `manual-linkedin-connected.png` - LinkedIn freshly connected
11. `manual-dashboard-all-connected.png` - Dashboard with all 8 connected
12. `manual-desktop-1440.png` - Desktop view
13. `manual-tablet-768.png` - Tablet view
14. `manual-mobile-375.png` - Mobile view

---

## 📝 Testing Report Template

After completing all tests, fill out this report:

### Platform Connection Results

| Platform | Initial Status | Test Result | Issues Found | Notes |
|----------|---------------|-------------|--------------|-------|
| Gmail | needs_reauth | ☐ Pass ☐ Fail | | |
| Calendar | needs_reauth | ☐ Pass ☐ Fail | | |
| Discord | connected | ☐ Pass ☐ Fail | | |
| Reddit | connected | ☐ Pass ☐ Fail | | |
| Spotify | needs_reauth | ☐ Pass ☐ Fail | | |
| YouTube | needs_reauth | ☐ Pass ☐ Fail | | |
| Slack | disconnected | ☐ Pass ☐ Fail | | |
| LinkedIn | disconnected | ☐ Pass ☐ Fail | | |

### Dashboard Features Results

| Feature | Works? | Issues | Notes |
|---------|--------|--------|-------|
| Connection count | ☐ Yes ☐ No | | |
| Data points | ☐ Yes ☐ No | | |
| Soul signature progress | ☐ Yes ☐ No | | |
| Recent activity | ☐ Yes ☐ No | | |
| Personality insights | ☐ Yes ☐ No | | |

### Overall Assessment

**Platform Health:** ___/100

**Critical Issues Found:**
-

**Medium Issues Found:**
-

**Low Issues Found:**
-

**Recommendations:**
-

---

## 🚀 Next Steps After Testing

**If all tests pass:**
1. Platform is production-ready
2. All 8 platforms connected and working
3. Data extraction operational
4. Dashboard displaying correctly

**If issues found:**
1. Document each issue with screenshots
2. Note reproduction steps
3. Check browser console for errors (F12)
4. Check network tab for failed API calls
5. Report issues for fixing

---

## ⚙️ Advanced Testing (Optional)

### Test Token Refresh Service

**Check if cron is running:**
1. Wait 5-10 minutes with platform open
2. Check if expired tokens refresh automatically
3. Verify `token_expires_at` updates in database

**Database Query:**
```sql
SELECT platform, token_expires_at, last_sync_status, updated_at
FROM platform_connections
WHERE user_id = 'your-user-id'
ORDER BY updated_at DESC;
```

### Test Pattern Detection

**After collecting events for a while:**
1. Check `behavioral_patterns` table
2. Verify patterns are being detected
3. Check personality trait correlations

### Test RAG/AI Features

**If implemented:**
1. Test chat with your digital twin
2. Verify responses use your actual data
3. Check personality consistency

---

## 📞 Support & Debugging

**If you encounter issues:**

1. **Check Browser Console (F12)**
   - Look for JavaScript errors
   - Note any failed network requests

2. **Check Network Tab**
   - Filter by `/api/` to see API calls
   - Look for 400/500 status codes
   - Check request/response payloads

3. **Check Database (Supabase)**
   - Verify connection entries
   - Check token expiration dates
   - Look at `last_sync_status` field

4. **Common Fixes**
   - Clear browser cache
   - Reload extension
   - Re-authenticate
   - Check internet connection

---

**Testing Guide Version:** 1.0
**Date Created:** October 24, 2025
**Platform:** https://twin-ai-learn.vercel.app

**Good luck with testing!** 🚀
