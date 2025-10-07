# 🚀 Quick Start: Enable Auto-Deployment

**Goal**: Make Git pushes automatically deploy to Vercel

---

## ⚡ 3-Step Setup (5 minutes)

### 1️⃣ Create Deploy Hook in Vercel
1. Visit: https://vercel.com/datalake-9521s-projects/twin-ai-learn/settings/git
2. Scroll to "Deploy Hooks" section
3. Click "Create Hook"
   - Name: `GitHub Main Branch Auto-Deploy`
   - Branch: `main`
4. **Copy the URL** (looks like: `https://api.vercel.com/v1/integrations/deploy/...`)

### 2️⃣ Add to GitHub Secrets
1. Visit: https://github.com/stefanogebara/twin-ai-learn/settings/secrets/actions
2. Click "New repository secret"
   - Name: `VERCEL_DEPLOY_HOOK_URL`
   - Value: *Paste the URL from step 1*
3. Click "Add secret"

### 3️⃣ Push the Workflow File
```bash
cd twin-ai-learn
git add .github/workflows/vercel-deploy.yml
git add DEPLOY_HOOK_SETUP.md
git add QUICK_START_DEPLOYMENT.md
git add scripts/test-deploy-hook.sh
git commit -m "Add automated Vercel deployment workflow"
git push origin main
```

---

## ✅ Verify It's Working

1. **Watch GitHub Actions**: https://github.com/stefanogebara/twin-ai-learn/actions
   - Should see "Deploy to Vercel" workflow running
   - Should complete with green checkmark ✅

2. **Check Vercel**: https://vercel.com/datalake-9521s-projects/twin-ai-learn
   - Should see new deployment from Git
   - Should include OAuth fix (commit `0b5f26e`)

3. **Test OAuth**: https://twin-ai-learn.vercel.app
   - Click "Get Started" → "Continue with Google"
   - Should work! 🎉

---

## 🧪 Test Deploy Hook (Optional)

Before pushing, test the deploy hook manually:

```bash
# Linux/Mac:
cd twin-ai-learn
./scripts/test-deploy-hook.sh "YOUR_DEPLOY_HOOK_URL"

# Windows (Git Bash):
cd twin-ai-learn
bash scripts/test-deploy-hook.sh "YOUR_DEPLOY_HOOK_URL"
```

Expected output:
```
✅ SUCCESS: Deployment triggered!
🆔 Deployment Job ID: ...
```

---

## 📚 Full Documentation

- **Setup Guide**: `DEPLOY_HOOK_SETUP.md` (detailed instructions)
- **Investigation Report**: `WEBHOOK_INVESTIGATION_REPORT.md` (why this was needed)
- **OAuth Status**: `OAUTH_STATUS_SUMMARY.md` (what was fixed)

---

## 🎯 What This Achieves

✅ Every Git push to `main` → Automatic Vercel deployment
✅ OAuth fix (commit `0b5f26e`) will be deployed
✅ No more manual `vercel redeploy` commands
✅ Full automation with GitHub Actions

---

**Next**: After completing these 3 steps, every code change you push will automatically deploy to production! 🚀
