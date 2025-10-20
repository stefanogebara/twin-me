#!/usr/bin/env python3
"""
Script to integrate automatic token refresh into dataExtractionService.js
"""

def main():
    # Read the file
    with open('api/services/dataExtractionService.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add import for getValidAccessToken
    old_import = "import { decryptToken } from './encryption.js';"
    new_import = "import { decryptToken } from './encryption.js';\nimport { getValidAccessToken } from './tokenRefresh.js';"

    if "import { getValidAccessToken }" not in content:
        content = content.replace(old_import, new_import)
        print("[OK] Added getValidAccessToken import")
    else:
        print("[INFO] getValidAccessToken already imported")

    # 2. Replace manual token expiry check with automatic refresh
    old_block = """      // Check if token has expired
      if (connector.expires_at && new Date(connector.expires_at) < new Date()) {
        console.warn(`[DataExtraction] Token expired for ${platform}`);

        // Mark job as failed
        if (jobId) {
          await supabase
            .from('data_extraction_jobs')
            .update({
              status: 'failed',
              error_message: 'Token expired - requires re-authentication',
              completed_at: new Date().toISOString()
            })
            .eq('id', jobId);
        }

        // Mark connector as needing re-authentication
        await supabase
          .from('platform_connections')
          .update({
            metadata: {
              ...connector.metadata,
              token_expired: true,
              expired_at: new Date().toISOString()
            }
          })
          .eq('id', connector.id);

        return {
          success: false,
          platform,
          error: 'TOKEN_EXPIRED',
          message: `Your ${platform} connection has expired. Please reconnect your account.`,
          itemsExtracted: 0,
          requiresReauth: true
        };
      }

      // Update job to 'running' status
      if (jobId) {
        await supabase
          .from('data_extraction_jobs')
          .update({ status: 'running' })
          .eq('id', jobId);
      }

      // Decrypt access token
      const accessToken = decryptToken(connector.access_token);"""

    new_block = """      // Update job to 'running' status
      if (jobId) {
        await supabase
          .from('data_extraction_jobs')
          .update({ status: 'running' })
          .eq('id', jobId);
      }

      // Get valid access token (auto-refresh if expired)
      console.log(`[DataExtraction] Getting valid access token for ${platform}...`);
      const tokenResult = await getValidAccessToken(userId, platform);

      if (!tokenResult.success) {
        console.warn(`[DataExtraction] Failed to get valid token for ${platform}: ${tokenResult.error}`);

        // Mark job as failed
        if (jobId) {
          await supabase
            .from('data_extraction_jobs')
            .update({
              status: 'failed',
              error_message: tokenResult.error || 'Token refresh failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', jobId);
        }

        return {
          success: false,
          platform,
          error: 'TOKEN_REFRESH_FAILED',
          message: `${tokenResult.error} Please reconnect your account.`,
          itemsExtracted: 0,
          requiresReauth: true
        };
      }

      const accessToken = tokenResult.accessToken;
      console.log(`[DataExtraction] [OK] Valid access token obtained for ${platform}`);"""

    if old_block in content:
        content = content.replace(old_block, new_block)
        print("[OK] Replaced manual token expiry check with automatic refresh")
    else:
        print("[INFO] Token refresh logic may already be integrated or file structure changed")

    # Write the file back
    with open('api/services/dataExtractionService.js', 'w', encoding='utf-8') as f:
        f.write(content)

    print("\n[OK] Successfully updated dataExtractionService.js with token refresh integration")

if __name__ == '__main__':
    main()
