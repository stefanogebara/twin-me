# Azure OpenAI Configuration

## Summary

Successfully migrated from OpenAI.com to Azure OpenAI (free with student account). The code has been updated and the embedding model is deployed and ready to use.

## Azure OpenAI Credentials

Configure these environment variables in Vercel:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your-azure-openai-api-key-here
AZURE_OPENAI_ENDPOINT=https://twinme.openai.azure.com
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_API_VERSION=2024-02-01
```

**NOTE:** The actual API key is stored securely in `AZURE_CREDENTIALS.txt` (not committed to git).
See Azure Portal → twinme resource → Keys and Endpoint for the real key.

## Deployed Models

### ✅ text-embedding-3-small (READY)
- **Deployment Name:** text-embedding-3-small
- **Model Version:** 1
- **Deployment Type:** Global Standard
- **Rate Limit:** 150,000 tokens/minute, 900 requests/minute
- **Status:** Succeeded
- **Endpoint:** `https://twinme.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-02-01`

### ❌ Chat Model (gpt-4o / gpt-35-turbo) - BLOCKED
- **Status:** Not deployed
- **Blocker:** Azure student account cannot create new AI resources (policy violation)
- **Attempted Models:** gpt-4o, gpt-35-turbo
- **Error:** `InvalidTemplateDeployment: The template deployment failed because of policy violation`
- **Required Action:** Needs account with resource creation permissions to deploy chat model

## Code Changes Completed

### 1. api/services/embeddingGenerator.js
**Changed from OpenAI.com to Azure OpenAI:**
```javascript
// Before
constructor() {
  this.openaiApiKey = process.env.OPENAI_API_KEY;
  this.embeddingModel = 'text-embedding-3-small';
}

async generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    headers: {
      'Authorization': `Bearer ${this.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: this.embeddingModel,
      input: text
    })
  });
}

// After
constructor() {
  this.azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  this.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://twinme.openai.azure.com';
  this.azureDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
  this.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';
}

async generateEmbedding(text) {
  const url = `${this.azureEndpoint}/openai/deployments/${this.azureDeployment}/embeddings?api-version=${this.azureApiVersion}`;

  const response = await fetch(url, {
    headers: {
      'api-key': this.azureApiKey,  // Changed from Authorization Bearer
    },
    body: JSON.stringify({
      input: text,  // No model field - it's in the URL path
      encoding_format: 'float'
    })
  });
}
```

### 2. api/services/ragService.js
**Changed from OpenAI.com to Azure OpenAI:**
```javascript
// Before
constructor() {
  this.openaiApiKey = process.env.OPENAI_API_KEY;
  this.model = 'gpt-4o';
}

async callOpenAI(...) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    headers: {
      'Authorization': `Bearer ${this.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: this.model,
      messages,
      max_tokens: 4096
    })
  });
}

// After
constructor() {
  this.azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  this.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://twinme.openai.azure.com';
  this.azureChatDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
  this.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';
}

async callOpenAI(...) {
  const url = `${this.azureEndpoint}/openai/deployments/${this.azureChatDeployment}/chat/completions?api-version=${this.azureApiVersion}`;

  const response = await fetch(url, {
    headers: {
      'api-key': this.azureApiKey,  // Changed from Authorization Bearer
    },
    body: JSON.stringify({
      messages,  // No model field - it's in the URL path
      max_tokens: 4096
    })
  });
}
```

## Key Differences: OpenAI.com vs Azure OpenAI

| Aspect | OpenAI.com | Azure OpenAI |
|--------|-----------|--------------|
| **Authentication** | `Authorization: Bearer {token}` | `api-key: {key}` |
| **Endpoint Format** | `https://api.openai.com/v1/embeddings` | `{endpoint}/openai/deployments/{deployment}/embeddings?api-version={version}` |
| **Model Specification** | In request body (`model: "text-embedding-3-small"`) | In URL path (deployment name) |
| **Model Availability** | Pre-available | Must be deployed first |
| **API Version** | Not required | Required query parameter |
| **Cost** | Pay-per-token | Included with Azure for Students |

## Vercel Configuration Steps

### Option 1: Vercel Dashboard (Recommended)
1. Go to https://vercel.com/dashboard
2. Select your project: `twin-ai-learn`
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - Click **Add New**
   - Enter variable name (e.g., `AZURE_OPENAI_API_KEY`)
   - Enter value
   - Select environment: **Production**, **Preview**, **Development** (check all)
   - Click **Save**
5. Repeat for all 4 variables
6. Redeploy the project:
   - Go to **Deployments**
   - Click "..." on latest deployment
   - Click **Redeploy**

### Option 2: Vercel CLI
```bash
# From project directory
vercel env add AZURE_OPENAI_API_KEY production
vercel env add AZURE_OPENAI_ENDPOINT production
vercel env add AZURE_OPENAI_EMBEDDING_DEPLOYMENT production
vercel env add AZURE_OPENAI_API_VERSION production

# Trigger redeploy
vercel --prod
```

### Option 3: Remove Old Variables (Optional)
If you had OpenAI.com API key configured, you can remove it (no longer needed):
- Remove: `OPENAI_API_KEY`

## Testing After Configuration

### 1. Test Embedding Generation
```bash
curl -X POST "https://twin-ai-learn.vercel.app/api/soul-data/generate-embeddings" \
  -H "Content-Type: application/json" \
  -d '{"userId": "a483a979-cf85-481d-b65b-af396c2c513a", "limit": 3}'
```

**Expected Response:**
```json
{
  "success": true,
  "generated": 3,
  "errors": 0,
  "total": 3
}
```

### 2. Check Embedding Stats
```bash
curl "https://twin-ai-learn.vercel.app/api/soul-data/embedding-stats?userId=a483a979-cf85-481d-b65b-af396c2c513a"
```

### 3. Test Style Analysis
```bash
curl -X POST "https://twin-ai-learn.vercel.app/api/soul-data/analyze-style" \
  -H "Content-Type: application/json" \
  -d '{"userId": "a483a979-cf85-481d-b65b-af396c2c513a"}'
```

## Known Limitations

### Chat Functionality (RAG) - Currently Unavailable
- **Affected Endpoint:** `/api/soul-data/rag/chat`
- **Status:** Will fail until chat model is deployed
- **Error:** Model deployment not found or API error
- **Solution Required:** Deploy gpt-4o or gpt-35-turbo model (requires account with resource creation permissions)

### Temporary Workaround
If chat functionality is critical before model deployment:
1. **Option A:** Use OpenAI.com API temporarily:
   - Add `OPENAI_API_KEY` back to Vercel
   - Update `ragService.js` to fallback to OpenAI.com if Azure deployment fails
2. **Option B:** Request IT/Admin to deploy chat model:
   - Contact Azure admin with resource creation permissions
   - Ask them to deploy gpt-35-turbo to the "twinme" resource
   - No code changes needed once deployed

## Azure Resource Details

- **Resource Name:** twinme
- **Resource Group:** stefano
- **Location:** East US
- **Subscription:** Azure for Students
- **API Kind:** OpenAI
- **Pricing Tier:** Standard (S0)

## Monitoring & Logs

### Check Deployment Logs
```bash
# View Vercel deployment logs
vercel logs --follow

# Or in Vercel Dashboard → Deployments → View Logs
```

### Check Azure OpenAI Usage
1. Go to Azure Portal: https://portal.azure.com
2. Navigate to: **twinme** resource
3. Check **Monitoring** → **Metrics**
4. View token usage, request counts, error rates

## Support & Troubleshooting

### Common Issues

**Issue 1: 401 Unauthorized**
- Check API key is correctly configured in Vercel
- Verify no extra spaces or line breaks in the key

**Issue 2: 404 Model Not Found**
- Verify deployment name matches exactly: `text-embedding-3-small`
- Check endpoint URL format

**Issue 3: Rate Limiting**
- Current limit: 150K tokens/minute, 900 requests/minute
- Monitor usage in Azure Portal

**Issue 4: Chat API Fails**
- Expected until chat model is deployed
- Deploy gpt-35-turbo or gpt-4o to fix

## Next Steps

1. ✅ Configure environment variables in Vercel (this document)
2. ✅ Test embedding generation endpoint
3. ⏳ Deploy chat model (requires permissions)
4. ⏳ Test full RAG chat functionality

## Files Modified

- `api/services/embeddingGenerator.js` - Migrated to Azure OpenAI
- `api/services/ragService.js` - Migrated to Azure OpenAI
- `OPENAI_KEY_SETUP.md` - Outdated (replaced by this document)

## Commit History

- Latest commit: Migration to Azure OpenAI API
- Previous: Enhanced error logging for OpenAI API
