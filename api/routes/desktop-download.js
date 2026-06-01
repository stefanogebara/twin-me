/**
 * Desktop installer download proxy.
 * ==================================
 * Same-origin proxy for TwinMe desktop release assets, so the /download buttons
 * always save a correctly-named file.
 *
 * Why this exists: GitHub serves release assets via a cross-origin 302 redirect
 * to a GUID-named CDN object (release-assets.githubusercontent.com/...<uuid>).
 * Some browsers (notably Brave) follow that redirect and name the saved file
 * after the URL's last path segment — the GUID — dropping the `.exe`/`.dmg`
 * extension, leaving users with an unrunnable file. The `download` attribute and
 * the CDN's own Content-Disposition don't reliably survive the cross-origin hop.
 *
 * Streaming the bytes back from twinme.me itself (same origin as /download) with
 * an explicit `Content-Disposition: attachment; filename="..."` sidesteps the
 * whole problem: the browser saves exactly what we name.
 *
 * Security: this is a CLOSED proxy, never an open relay. The `file` query param
 * is validated against the TwinMe installer naming pattern, and the upstream URL
 * is taken from our OWN repo's GitHub release metadata (resolved by asset name) —
 * the caller can never make it fetch an arbitrary host.
 */
import express from 'express';
import { Readable } from 'node:stream';

const router = express.Router();

const REPO = 'stefanogebara/twin-me';
// Installer names look like: TwinMe_0.1.4_x64-setup.exe, TwinMe_0.1.4_aarch64.dmg,
// TwinMe_0.1.4_amd64.AppImage, TwinMe_0.1.4_amd64.deb, TwinMe_0.1.4_x64_en-US.msi
const ALLOWED_FILE = /^TwinMe_\d+\.\d+\.\d+[A-Za-z0-9._-]*\.(exe|msi|dmg|AppImage|deb)$/;
const ALLOWED_TAG = /^desktop-v\d+\.\d+\.\d+$/;
const UA = 'twinme-desktop-download-proxy';

router.get('/', async (req, res) => {
  const file = String(req.query.file || '');
  const tag = String(req.query.tag || '').trim();

  if (!ALLOWED_FILE.test(file)) {
    return res.status(400).json({ success: false, error: 'Invalid or missing file parameter' });
  }
  if (tag && !ALLOWED_TAG.test(tag)) {
    return res.status(400).json({ success: false, error: 'Invalid tag parameter' });
  }

  try {
    // Resolve the asset's real download URL from our release metadata. Default to
    // the latest release; honor an explicit (validated) tag so the proxy matches
    // whatever version the /download page rendered.
    const releaseUrl = tag
      ? `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
      : `https://api.github.com/repos/${REPO}/releases/latest`;
    const ghHeaders = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
    if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const relResp = await fetch(releaseUrl, { headers: ghHeaders });
    if (!relResp.ok) {
      console.error(`[desktop-download] release lookup ${relResp.status} for ${releaseUrl}`);
      return res.status(502).json({ success: false, error: 'Could not resolve the release' });
    }
    const release = await relResp.json();
    const asset = (release.assets || []).find((a) => a.name === file);
    if (!asset || !asset.browser_download_url) {
      return res.status(404).json({ success: false, error: 'Asset not found in release' });
    }

    // Stream the bytes back with a forced filename (follows GitHub's CDN redirect).
    const upstream = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    if (!upstream.ok || !upstream.body) {
      console.error(`[desktop-download] asset fetch ${upstream.status} for ${file}`);
      return res.status(502).json({ success: false, error: 'Could not fetch the installer' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', (err) => {
      console.error('[desktop-download] stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
      else res.destroy(err);
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error('[desktop-download] proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: 'Download proxy failed' });
    } else {
      res.end();
    }
  }
});

export default router;
