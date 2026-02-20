/**
 * Development-only fetch wrapper that uses curl (schannel) instead of Node.js OpenSSL.
 *
 * Workaround for Cloudflare JA3 TLS fingerprint blocking that affects Node.js
 * connections to Supabase REST API on some Windows machines.
 *
 * Only used when NODE_ENV !== 'production'.
 */
import { execFileSync } from 'child_process';

/**
 * Custom fetch implementation using curl
 */
export function curlFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};

  const args = [
    '-s',           // silent
    '-S',           // show errors
    '--max-time', '15',
    '-X', method,
    '-w', '\n__STATUS__%{http_code}',
  ];

  // Add headers
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      args.push('-H', `${key}: ${value}`);
    });
  } else if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) {
        args.push('-H', `${key}: ${value}`);
      }
    }
  }

  // Add body
  if (options.body) {
    args.push('-d', typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
  }

  args.push(url.toString());

  try {
    const result = execFileSync('curl', args, {
      encoding: 'utf-8',
      timeout: 20000,
      windowsHide: true,
    });

    // Parse status code from the end of output
    const statusMatch = result.match(/__STATUS__(\d+)$/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const body = result.replace(/__STATUS__\d+$/, '').trim();

    // Return a Response-like object
    return Promise.resolve({
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      statusText: statusCode === 200 ? 'OK' : String(statusCode),
      headers: new Map(),
      json: () => Promise.resolve(JSON.parse(body || '{}')),
      text: () => Promise.resolve(body),
    });
  } catch (err) {
    return Promise.reject(new Error(`curlFetch failed: ${err.message}`));
  }
}
