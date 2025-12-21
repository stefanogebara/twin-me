# Cofounder Gmail OAuth Flow - Complete Documentation

## Overview
Cofounder's Step 6 implements Gmail OAuth authentication using **Pipedream** as an OAuth proxy service. This allows Cofounder to securely connect to users' Gmail accounts without managing OAuth infrastructure directly.

## Flow Architecture

### **Step 1: Initial Gmail Connection Screen**
**URL**: `https://app.cofounder.co/new-onboarding/step6`

**UI Components**:
- **Heading**: "Connect your Gmail account" (large, centered)
- **Trust-building section**: "Why do we need Gmail?"
  - Bullet points explaining use cases:
    - "Understand your writing style and your business"
    - "Understand people you're connected to"
    - "Manage your email and tasks"
- **Privacy Statements** (bolded for emphasis):
  - "Cofounder **will not** send emails to external users without approval."
  - "We **don't train on your data.**"
- **Connect Button**: White card with Gmail logo + arrow, hover shadow effect

**Screenshot**: `cofounder-step6-gmail-connect.png`

---

### **Step 2: Pipedream OAuth Modal**
**Trigger**: Clicking "Connect Gmail" button

**Modal Content**:
- **Header**: "We use Pipedream to connect your account"
- **Logos**: Pipedream logo + Gmail logo with animated connector
- **Trust Signals**:
  - ⚡ "Connect instantly" - "Pipedream lets you securely connect your account in seconds."
  - 🛡️ "Connect securely" - "More than a million developers trust Pipedream to keep their data safe."
- **Legal Links**: Terms of Service + Privacy Policy
- **CTA Button**: "Continue" (dark, prominent)

**Technical Details**:
- Modal implemented as an `<iframe>`
- Modal appears as overlay with backdrop
- Cannot be closed without action (no X button)

**Screenshot**: `cofounder-step6-pipedream-modal.png`

---

### **Step 3: Google Account Selection**
**URL**: `https://accounts.google.com/v3/signin/accountchooser`

**OAuth Parameters** (from URL):
```
access_type=offline
client_id=380257408515-aitl3rkgan90o7talpl6dnprr5tbh307.apps.googleusercontent.com
prompt=consent
redirect_uri=https://api.pipedream.com/connect/oauth/oa_1Mi0r8/callback
response_type=code
scope=email profile openid
  https://www.googleapis.com/auth/gmail.labels
  https://www.googleapis.com/auth/gmail.send
  https://www.googleapis.com/auth/gmail.modify
  https://www.googleapis.com/auth/gmail.compose
state=<random_state_token>
```

**Key Observations**:
- **OAuth Scopes Requested**:
  - `email`, `profile`, `openid` - Basic profile info
  - `gmail.labels` - Read Gmail labels
  - `gmail.send` - Send emails on behalf of user
  - `gmail.modify` - Modify emails (archive, star, etc.)
  - `gmail.compose` - Draft emails
- **Redirect URI**: Points to `api.pipedream.com` (OAuth proxy)
- **Access Type**: `offline` (requests refresh token for persistent access)

**UI Components**:
- **Header**: "Choose an account"
- **Subheader**: "to continue to Cofounder"
- **Account List**: Shows all Google accounts on device
- **Privacy Links**: "Before using this app, you can review Cofounder's privacy policy and terms of service."

**Screenshot**: `cofounder-google-oauth-account-selection.png`

---

### **Step 4: Passkey/2FA Verification**
**URL**: `https://accounts.google.com/v3/signin/challenge/pk`

**UI Components**:
- **Header**: "Verify it's you"
- **Explanation**: "To help keep your account safe, Google wants to make sure it's really you"
- **Account Display**: Shows selected email (with switch account option)
- **Primary Action**: "Complete sign-in using your passkey"
- **Fallback**: "More ways to verify" button

**Authentication Methods** (typical Google flow):
- Passkey (WebAuthn)
- Security key
- Phone verification
- Authenticator app
- Backup codes

**Screenshot**: `cofounder-google-passkey-verification.png`

---

## Technical Implementation Details

### **Pipedream OAuth Proxy**
- **Purpose**: Handles OAuth token exchange without exposing client secrets
- **Benefits**:
  - No backend OAuth implementation needed
  - Managed token refresh
  - Secure credential storage
  - Rate limiting and security built-in
- **Drawbacks**:
  - Third-party dependency
  - Additional privacy considerations (Pipedream sees tokens)
  - Requires user trust in Pipedream

### **OAuth Flow Sequence**
1. User clicks "Connect Gmail" on Cofounder
2. Cofounder opens Pipedream modal (iframe)
3. User clicks "Continue" in Pipedream modal
4. New tab opens with Google OAuth (`accounts.google.com`)
5. User selects Google account
6. Google requires 2FA/passkey verification
7. After verification, Google redirects to `api.pipedream.com/callback`
8. Pipedream exchanges authorization code for access + refresh tokens
9. Pipedream redirects back to Cofounder with success/failure
10. Cofounder closes OAuth tab and updates Step 6 UI

### **Security Considerations**
- **State Parameter**: Prevents CSRF attacks
- **Offline Access**: Allows Cofounder to access Gmail even when user is offline
- **Consent Prompt**: Forces re-consent every time (due to `prompt=consent`)
- **2FA Required**: Google enforces passkey/2FA for sensitive scopes like Gmail

---

## UI/UX Design Patterns

### **Trust-Building Strategy**
1. **Explicit Permission**: Clear explanation of why Gmail is needed
2. **Bold Privacy Statements**: Emphasize "will not" and "don't train on your data"
3. **Third-Party Transparency**: Explicitly mention Pipedream usage
4. **Professional Branding**: Real Gmail logo, clean design

### **Button Design** (Cofounder Style)
```tsx
<button className="
  group w-full max-w-lg mx-auto flex items-center justify-between
  bg-white border border-gray-200 rounded-md px-6 py-6
  hover:shadow-md transition-all duration-200
">
  <div className="flex items-center gap-3">
    <GmailLogo className="w-6 h-6" />
    <span className="font-medium">Connect Gmail</span>
  </div>
  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
</button>
```

### **Pipedream Modal Design**
- **Background**: Light modal overlay
- **Modal**: White card with rounded corners
- **Icons**: Large, colorful brand logos
- **Trust Signals**: Icon + heading + description pattern
- **CTA**: Full-width dark button at bottom

---

## Implementation for Twin Me

### **1. Backend Requirements**
```javascript
// api/routes/gmail-oauth.js
POST /api/oauth/gmail/connect
  - Returns Pipedream OAuth URL or direct Google OAuth URL

GET /api/oauth/gmail/callback
  - Handles OAuth callback
  - Exchanges code for tokens
  - Stores tokens in database
  - Redirects to onboarding success page
```

### **2. Frontend Components**
```typescript
// src/components/onboarding/GmailConnect.tsx
- Display trust-building UI
- Open OAuth modal/popup
- Handle OAuth success/failure
- Update UI based on connection status

// src/components/onboarding/OAuthModal.tsx (if using Pipedream approach)
- Display Pipedream explanation
- Handle iframe communication
- Manage modal state
```

### **3. Database Schema**
```sql
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  platform TEXT, -- 'gmail'
  access_token TEXT ENCRYPTED,
  refresh_token TEXT ENCRYPTED,
  token_expiry TIMESTAMP,
  scopes TEXT[], -- Array of granted scopes
  connected_at TIMESTAMP,
  last_sync TIMESTAMP
);
```

### **4. Environment Variables**
```env
# Option 1: Direct Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://your-app.com/api/oauth/gmail/callback

# Option 2: Pipedream OAuth Proxy
PIPEDREAM_OAUTH_APP_ID=your-pipedream-app-id
PIPEDREAM_API_KEY=your-pipedream-api-key
```

---

## Next Steps After Gmail Connection

Based on Cofounder's 18-step onboarding flow, after Gmail OAuth completes:

1. **Step 7**: Loading state - "Analyzing your Gmail..."
2. **Step 8**: Results screen - Show discovered insights
   - Writing style summary
   - Key contacts identified
   - Email patterns
3. **Step 9**: Calendar connection (similar OAuth flow)
4. **Step 10**: Calendar analysis results
5. **Step 11-18**: Additional platform connections and explanations

---

## Screenshots Reference

All screenshots saved in: `C:\Users\stefa\.playwright-mcp\`

- `cofounder-step6-gmail-connect.png` - Initial connection screen
- `cofounder-step6-pipedream-modal.png` - Pipedream OAuth modal
- `cofounder-google-oauth-account-selection.png` - Google account chooser
- `cofounder-google-passkey-verification.png` - 2FA/passkey verification

---

## Key Takeaways

1. **Pipedream Proxy**: Cofounder uses Pipedream to avoid managing OAuth infrastructure
2. **Trust-First Approach**: Bold privacy statements build user confidence
3. **Progressive Disclosure**: Explain each step before asking for permissions
4. **Real Branding**: Use official Gmail logo, not icons or emojis
5. **Smooth UX**: Modal + new tab pattern keeps user in flow
6. **Security**: 2FA required for Gmail access (cannot be bypassed)
7. **Comprehensive Scopes**: Requests send, modify, compose permissions upfront

---

**Documentation Date**: January 2025
**Cofounder Version**: Production onboarding flow
**Status**: ✅ Complete OAuth flow documented up to 2FA verification
