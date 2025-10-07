# OAuth Issue - Root Cause Identified

**Date**: 2025-10-07
**Status**: 🔴 **CRITICAL - Service Role Key Truncated**

## Root Cause

The `SUPABASE_SERVICE_ROLE_KEY` environment variable in Vercel Production is being **truncated to 101 characters** instead of the required **219 characters**.

### Evidence

```json
{
  "SUPABASE_SERVICE_ROLE_KEY_length": 101  // Should be 219
}
```

This causes:
- ❌ "Invalid API key" error on ALL Supabase queries
- ❌ Cannot find existing users
- ❌ Cannot create new users
- ❌ OAuth fails with "User creation failed"

### Verification

Diagnostic endpoint: `https://twin-ai-learn.vercel.app/api/diagnostics/supabase-test`

Shows all Supabase operations failing with:
```json
{
  "error": {
    "message": "Invalid API key",
    "hint": "Double check your Supabase `anon` or `service_role` API key."
  }
}
```

### Direct SQL Test

Testing with the Supabase MCP (using the correct 219-character key) proves the database is working correctly:

```sql
INSERT INTO public.users (email, first_name, last_name, oauth_provider, picture_url)
VALUES ('test-oauth-insert@example.com', 'Test', 'User', 'google', 'https://example.com/pic.jpg')
RETURNING id, email;
```

✅ **Result**: Successfully inserted user with ID `a3df1dd4-1417-4c75-863b-2cfd859b6486`

This confirms:
- ✅ Database is accessible
- ✅ Table structure is correct
- ✅ Service role key works (when full 219 characters)
- ❌ Vercel environment variable is truncated

## Attempted Fixes

1. **Removed and re-added via CLI**: Still truncated to 101 chars
2. **Used `printf '%s'` to avoid newlines**: Still truncated
3. **Used temporary file as input**: Still truncated
4. **Multiple redeployments**: Still truncated

## Next Steps

The issue appears to be either:
1. **Vercel CLI bug** - The `vercel env add` command might have a 101-character limit
2. **Shell escaping issue** - Some character in the key is being interpreted as end-of-string
3. **Vercel platform limit** - There might be an undocumented limit on environment variable length

**Recommended Solution**: Add the `SUPABASE_SERVICE_ROLE_KEY` manually through the Vercel Dashboard web interface:
1. Go to: https://vercel.com/datalake-9521s-projects/twin-ai-learn/settings/environment-variables
2. Click "Add New"
3. Name: `SUPABASE_SERVICE_ROLE_KEY`
4. Value: [Paste the full 219-character key]
5. Environment: Production
6. Save and redeploy

## The Full Story

1. **OAuth redirect_uri was fixed** ✅ - Now uses production domain
2. **Token exchange with Google works** ✅ - Successfully gets user data
3. **Database query fails** ❌ - Truncated service role key causes "Invalid API key"
4. **User creation fails** ❌ - Can't insert into database
5. **Frontend shows** ❌ - "Authentication Failed - 500 error"

The OAuth flow itself is 100% working. The only issue is the truncated Supabase service role key preventing database operations.
