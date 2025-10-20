# Soul Observer Extension - Loading Instructions

## ✅ Prerequisites Met

- ✅ Backend server running on http://localhost:3001
- ✅ Supabase configured
- ✅ Extension icons created
- ✅ All files in place

## 📦 Load Extension in Chrome

### Method 1: Quick Launch Script (Recommended) ⚡

**Easiest way - Extension loads automatically!**

1. Run the batch file:
   ```
   C:\Users\stefa\twin-me\browser-extension\launch-chrome-with-extension.bat
   ```
2. Chrome will open with the extension pre-loaded
3. Skip to "Test the Extension" section below

### Method 2: Manual Loading 📂

#### Step 1: Open Chrome Extensions Page

```
chrome://extensions
```

Or click: **Menu (⋮) → Extensions → Manage Extensions**

#### Step 2: Enable Developer Mode

Toggle the **"Developer mode"** switch in the top-right corner

#### Step 3: Load Unpacked Extension

1. Click **"Load unpacked"** button
2. Navigate to: `C:\Users\stefa\twin-me\browser-extension`
3. Click **"Select Folder"**

#### Step 4: Verify Installation

You should see:
- ✅ Soul Observer extension card
- ✅ Orange "SS" icon in toolbar
- ✅ No errors

## 🧪 Test the Extension

### Test 1: Open Popup

1. Click the **SS icon** in Chrome toolbar
2. You should see the popup with:
   - Header "Soul Signature"
   - Connection status
   - Soul Observer toggle
   - Platform toggles (Netflix, Disney+, etc.)

### Test 2: Enable Soul Observer

1. Click the **Soul Observer Mode toggle**
2. Confirm the dialog (reads all features)
3. Toggle should turn orange/active
4. Features section should expand

### Test 3: Verify Event Capture

1. Open any website (e.g., google.com)
2. Type something in search box
3. Move your mouse around
4. Scroll the page
5. Wait 30 seconds

### Test 4: Check Backend Logs

In the backend server output, you should see:
```
[Soul Observer] Received X activities from user: ...
[Soul Observer] Successfully stored X events
```

### Test 5: Verify Database

Check Supabase:
```sql
SELECT * FROM soul_observer_events 
ORDER BY timestamp DESC 
LIMIT 10;
```

You should see your typing, mouse, and scroll events!

## 🔧 Troubleshooting

### Extension Won't Load
- **Error**: "Manifest file is missing or unreadable"
  - **Fix**: Make sure you selected the `browser-extension` folder, not a file

### No Events Being Captured
1. Check console: Right-click extension → Inspect popup
2. Look for errors in popup console
3. Check page console (F12) for content script errors
4. Verify Soul Observer is enabled (toggle is active)

### Backend Not Receiving Events
1. Check backend is running: http://localhost:3001
2. Verify CORS settings allow localhost:8086
3. Check backend logs for errors
4. Ensure Supabase is configured

### Events Sent But Not Stored
1. Check Supabase connection in backend logs
2. Verify migration was applied:
   ```sql
   SELECT * FROM soul_observer_events LIMIT 1;
   ```
3. Check RLS policies allow inserts

## 📊 Success Indicators

When everything is working:

1. ✅ Extension loads without errors
2. ✅ Popup opens and shows UI
3. ✅ Soul Observer toggle works
4. ✅ Events captured on page interaction
5. ✅ Backend logs show received events
6. ✅ Database contains event records
7. ✅ No console errors

## 🎯 Next Steps

Once loaded and working:
1. Browse different websites for 5+ minutes
2. Check `soul_observer_sessions` for your session
3. Wait for AI analysis (happens automatically)
4. Check `behavioral_patterns` for detected patterns
5. View insights in Soul Dashboard

## 📝 Notes

- Extension auto-sends events every 30 seconds
- Session times out after 30 minutes of inactivity
- All data is stored locally until sent to backend
- Backend requires authentication (will add user auth later)
- AI analysis runs in background after session ends

---

**Extension is ready to use! 🚀**
