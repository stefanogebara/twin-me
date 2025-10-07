# Deploy Hook Setup Instructions
**Solution**: Automated Vercel deployments using Deploy Hooks + GitHub Actions

---

## 🎯 What This Does

This solution ensures that **every push to the `main` branch automatically deploys to Vercel** by using:
1. **Vercel Deploy Hook**: A webhook URL that triggers deployments
2. **GitHub Actions**: Workflow that calls the deploy hook on every push

---

## 📋 Step-by-Step Setup

### Step 1: Create Vercel Deploy Hook

1. **Go to Vercel Project Settings**:
   - Visit: https://vercel.com/datalake-9521s-projects/twin-ai-learn/settings/git

2. **Scroll to "Deploy Hooks" section** (near the bottom of the Git settings)

3. **Click "Create Hook"**:
   - **Name**: `GitHub Main Branch Auto-Deploy`
   - **Git Branch**: `main`
   - Click **"Create Hook"**

4. **Copy the Hook URL**:
   - You'll get a URL like: `https://api.vercel.com/v1/integrations/deploy/prj_xxx/xxx`
   - ⚠️ **Keep this URL secret** - treat it like a password
   - 📋 Copy it to your clipboard

### Step 2: Add Deploy Hook to GitHub Secrets

1. **Go to GitHub Repository Settings**:
   - Visit: https://github.com/stefanogebara/twin-ai-learn/settings/secrets/actions

2. **Click "New repository secret"**:
   - **Name**: `VERCEL_DEPLOY_HOOK_URL`
   - **Value**: Paste the deploy hook URL from Step 1
   - Click **"Add secret"**

### Step 3: Commit and Push GitHub Actions Workflow

The workflow file has already been created at `.github/workflows/vercel-deploy.yml`.

**Commit and push it:**

```bash
cd twin-ai-learn
git add .github/workflows/vercel-deploy.yml
git commit -m "Add GitHub Actions workflow for Vercel auto-deployment"
git push origin main
```

### Step 4: Verify Setup

1. **Check GitHub Actions**:
   - Go to: https://github.com/stefanogebara/twin-ai-learn/actions
   - You should see the "Deploy to Vercel" workflow running
   - Wait for it to complete (green checkmark ✅)

2. **Check Vercel Deployments**:
   - Go to: https://vercel.com/datalake-9521s-projects/twin-ai-learn
   - You should see a new deployment triggered by the workflow
   - This deployment should include the OAuth fix (commit `0b5f26e`)

3. **Test OAuth**:
   - Visit: https://twin-ai-learn.vercel.app
   - Click "Get Started" → "Continue with Google"
   - Authorize with `stefanogebara@gmail.com`
   - **Expected**: OAuth should now work! ✅

---

## 🧪 Testing the Workflow

### Test 1: Manual Trigger
You can manually trigger the workflow from GitHub:
1. Go to: https://github.com/stefanogebara/twin-ai-learn/actions
2. Click "Deploy to Vercel" workflow
3. Click "Run workflow" dropdown
4. Click "Run workflow" button
5. Verify deployment is triggered in Vercel

### Test 2: Git Push
Make a small change and push:
```bash
cd twin-ai-learn
echo "# Test deployment" >> README.md
git add README.md
git commit -m "Test auto-deployment"
git push origin main
```

Check GitHub Actions and Vercel to confirm deployment.

---

## 🔧 How It Works

### GitHub Actions Workflow (`.github/workflows/vercel-deploy.yml`)

**Triggers**:
- On every push to `main` branch
- Can also be triggered manually from GitHub UI

**What it does**:
1. Checks out the code
2. Reads the `VERCEL_DEPLOY_HOOK_URL` secret
3. Sends a POST request to the deploy hook
4. Verifies the deployment was triggered successfully
5. Logs the deployment job ID

**Security**:
- Deploy hook URL is stored as an encrypted GitHub Secret
- Never exposed in logs or public workflow files

### Deploy Hook Flow

```
Git Push → GitHub Actions → POST to Deploy Hook → Vercel Deployment
```

Detailed flow:
1. You push code to `main` branch
2. GitHub detects push and triggers workflow
3. Workflow sends POST request to Vercel deploy hook
4. Vercel receives request and triggers deployment
5. Vercel builds and deploys latest code from GitHub
6. Deployment completes and goes live

---

## 📊 Monitoring Deployments

### GitHub Actions Logs
- View workflow runs: https://github.com/stefanogebara/twin-ai-learn/actions
- Each run shows:
  - Commit SHA
  - Author
  - Branch
  - HTTP response from deploy hook
  - Deployment job ID

### Vercel Deployment Logs
- View deployments: https://vercel.com/datalake-9521s-projects/twin-ai-learn
- Each deployment shows:
  - Git commit
  - Build logs
  - Runtime logs
  - Deployment status

---

## 🚨 Troubleshooting

### Workflow Fails: "VERCEL_DEPLOY_HOOK_URL secret is not set"
**Fix**: Go back to Step 2 and add the secret to GitHub

### Workflow Fails: HTTP 404 or 401
**Fix**: Deploy hook URL is invalid. Create a new hook in Vercel (Step 1)

### Deployment Triggered but Fails
**Fix**: Check Vercel deployment logs for build errors

### Workflow Doesn't Run on Push
**Fix**:
1. Ensure `.github/workflows/vercel-deploy.yml` is committed to `main` branch
2. Check GitHub Actions is enabled: Settings → Actions → General

---

## 🎯 Benefits of This Solution

✅ **Fully Automated**: No manual intervention needed
✅ **Secure**: Deploy hook URL stored as encrypted secret
✅ **Reliable**: GitHub Actions has 99.9% uptime
✅ **Transparent**: Full logs in GitHub Actions and Vercel
✅ **Flexible**: Can trigger manually or on push
✅ **Fast**: Deployments start within seconds of push

---

## 🔄 Alternative: Direct GitHub Webhook (Original Solution)

If you prefer the native Vercel Git integration instead of this workaround:

1. **Disconnect Git Integration**:
   - Vercel: Settings → Git → Disconnect

2. **Reconnect Git Integration**:
   - Vercel: Connect Git Repository
   - Select `stefanogebara/twin-ai-learn`
   - Grant "Read and write" permissions

3. **Verify Webhook Created**:
   - GitHub: https://github.com/stefanogebara/twin-ai-learn/settings/hooks
   - Should see webhook with URL containing `vercel.com`

4. **If using this method, you can delete**:
   - `.github/workflows/vercel-deploy.yml`
   - GitHub Secret `VERCEL_DEPLOY_HOOK_URL`

---

## 📝 Summary

**Current Status**:
- ✅ OAuth fix committed to Git (commit `0b5f26e`)
- ✅ GitHub Actions workflow created
- ⏳ Waiting for you to create deploy hook in Vercel
- ⏳ Waiting for you to add secret to GitHub
- ⏳ Waiting for push to trigger first automated deployment

**Next Steps**:
1. Create deploy hook in Vercel (Step 1)
2. Add secret to GitHub (Step 2)
3. Push workflow file (Step 3)
4. Watch deployment happen automatically! 🎉

Once complete, the OAuth fix will be live and you can test Google authentication.

---

**Questions or issues?** Check the Troubleshooting section or review Vercel's official docs:
- Deploy Hooks: https://vercel.com/docs/deploy-hooks
- GitHub Actions: https://docs.github.com/actions
