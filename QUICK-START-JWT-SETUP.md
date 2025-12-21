# Quick Start: JWT Secret Setup

> **TL;DR:** Generate a secure JWT secret and add it to your environment variables. Takes 2 minutes.

---

## For Local Development

**Step 1:** Generate a secure secret (copy the output)
```bash
node api/utils/generateSecret.js
```

**Step 2:** Add to your `.env` file
```bash
# Open .env or api/.env in your editor
# Add this line (replace with YOUR generated secret):
JWT_SECRET=w_hzTXT3rD2anee19-p7whr5k1_6p6WotPDbpoB9TJQ
```

**Step 3:** Start the server
```bash
npm run server:dev
```

**Step 4:** Verify it works
```
✅ JWT_SECRET validation passed: JWT_SECRET meets security requirements
🚀 Secure API server running on port 3001
```

✅ **Done!** Your development environment is secure.

---

## For Production (Vercel)

**Step 1:** Generate a DIFFERENT secret (copy the output)
```bash
node api/utils/generateSecret.js --bytes 64
```

**Step 2:** Add to Vercel
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to: Settings → Environment Variables
4. Click "Add New"
5. Name: `JWT_SECRET`
6. Value: Paste your generated secret
7. Environment: **Production** ✓
8. Save

**Step 3:** Deploy
```bash
git push origin main
```

**Step 4:** Verify deployment logs
```
✅ JWT_SECRET validation passed: JWT_SECRET meets security requirements
```

✅ **Done!** Your production is secure.

---

## Common Issues

### Issue: Server won't start

**Error:**
```
🚨 CRITICAL SECURITY ERROR: JWT_SECRET VALIDATION FAILED
❌ JWT_SECRET is not set
```

**Fix:**
```bash
# 1. Generate secret
node api/utils/generateSecret.js

# 2. Add to .env
echo "JWT_SECRET=<paste-here>" >> .env

# 3. Restart server
npm run server:dev
```

### Issue: "Insecure default value" error

**Error:**
```
❌ JWT_SECRET contains insecure default value: "your-secret-key"
```

**Fix:**
```bash
# Don't use default values! Generate a real secret:
node api/utils/generateSecret.js

# Then update your .env with the generated secret
```

### Issue: "Too short" error

**Error:**
```
❌ JWT_SECRET is too short (15 characters). Must be at least 32 characters.
```

**Fix:**
```bash
# Generate a proper cryptographic secret:
node api/utils/generateSecret.js

# Don't make up your own - use the generator!
```

---

## Test Your Setup

**Run validation tests:**
```bash
node test-jwt-validation.js
```

**Expected output:**
```
📊 Test Results: 7 passed, 0 failed
✅ All tests passed! JWT validation is working correctly.
```

---

## Security Rules

1. ✅ **DO:** Use different secrets for dev/staging/prod
2. ✅ **DO:** Generate secrets using `node api/utils/generateSecret.js`
3. ✅ **DO:** Store production secrets in Vercel environment variables
4. ❌ **DON'T:** Commit `.env` files to git
5. ❌ **DON'T:** Share secrets in Slack/email/Discord
6. ❌ **DON'T:** Reuse secrets across environments

---

## Need Help?

- **Detailed docs:** See `SECURITY-JWT-FIX.md`
- **Full guide:** See `SECURITY.md`
- **Test validation:** Run `node test-jwt-validation.js`

---

**Last Updated:** January 4, 2025
