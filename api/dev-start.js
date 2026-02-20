/**
 * Development entry point that works around Cloudflare blocking.
 *
 * Cloudflare blocks requests with the `apikey` header (and now also
 * Authorization Bearer JWTs) from certain IPs/TLS fingerprints.
 *
 * This override routes all Supabase REST/Auth API calls through a
 * Supabase Edge Function (`db-proxy`) that makes the actual API call
 * from inside Supabase's internal network, bypassing Cloudflare WAF.
 *
 * Usage: USE_CURL_FETCH=true node api/dev-start.js
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (process.env.USE_CURL_FETCH === 'true') {
  let interceptCount = 0;
  const originalFetch = globalThis.fetch;
  const supabaseUrl = process.env.SUPABASE_URL;
  const proxyUrl = `${supabaseUrl}/functions/v1/db-proxy`;

  globalThis.fetch = (url, options = {}) => {
    const urlStr = url.toString();

    // Only intercept Supabase REST and Auth API requests
    if (urlStr.includes('supabase.co') && (urlStr.includes('/rest/v1/') || urlStr.includes('/auth/v1/'))) {
      const headers = options.headers || {};
      let apikey = null;

      // Extract apikey from headers
      if (headers instanceof Headers) {
        apikey = headers.get('apikey');
      } else if (typeof headers === 'object') {
        apikey = headers.apikey || headers.Apikey;
      }

      // Also check Authorization header for the key
      if (!apikey) {
        let authHeader = null;
        if (headers instanceof Headers) {
          authHeader = headers.get('authorization');
        } else if (typeof headers === 'object') {
          authHeader = headers.authorization || headers.Authorization;
        }
        if (authHeader?.startsWith('Bearer ')) {
          apikey = authHeader.slice(7);
        }
      }

      if (apikey) {
        // Extract path + query from original URL
        const urlObj = new URL(urlStr);
        const originalPath = urlObj.pathname + urlObj.search;

        // Collect safe headers to forward
        const fwdHeaders = {};
        const safeHeaders = ['prefer', 'accept', 'range', 'content-type', 'content-profile'];
        if (headers instanceof Headers) {
          headers.forEach((value, key) => {
            if (safeHeaders.includes(key.toLowerCase())) {
              fwdHeaders[key] = value;
            }
          });
        } else if (typeof headers === 'object') {
          for (const [key, value] of Object.entries(headers)) {
            if (safeHeaders.includes(key.toLowerCase())) {
              fwdHeaders[key] = value;
            }
          }
        }

        // Build proxy request body
        const proxyBody = {
          path: originalPath,
          method: options.method || 'GET',
          apikey,
          headers: fwdHeaders,
        };

        // Forward request body for non-GET methods
        if (options.body && options.method !== 'GET') {
          try {
            proxyBody.body = typeof options.body === 'string'
              ? JSON.parse(options.body)
              : options.body;
          } catch {
            proxyBody.body = options.body;
          }
        }

        interceptCount++;
        if (interceptCount <= 5) {
          console.log(`🔧 [Proxy] Intercepted #${interceptCount}: ${proxyBody.method} ${urlObj.pathname}`);
        }

        return originalFetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proxyBody),
        });
      }
    }

    return originalFetch(url, options);
  };

  console.log(`🔧 [Dev] Global fetch override: routing Supabase API through Edge Function proxy`);
  console.log(`🔧 [Dev] Proxy URL: ${proxyUrl}`);
}

// Now import and start the real server
await import('./server.js');
