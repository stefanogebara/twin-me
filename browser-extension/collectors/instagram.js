/**
 * Instagram Data Collector
 * Extracts posts liked, accounts followed, stories viewed, and user interests.
 *
 * v3.9.0: added LIVE LIKE DETECTION — listens for clicks on heart-shaped
 * "Like" buttons across feed/profile/post pages and captures each like as
 * it happens (no need to visit /your_activity/likes/ first). Capture is
 * batched and ships via SEND_PLATFORM_DATA every 30s.
 */

console.log('[Soul Signature] Instagram collector loaded');

let collectedData = {
  likedPosts: [],
  savedPosts: [],
  following: [],
  followers: [],
  storiesViewed: [],
  userPosts: [],
  profileInfo: {},
  interests: [],
  searchHistory: []
};

// Check authentication
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response.authenticated) {
    console.log('[Soul Signature] Authenticated - starting Instagram collection');
    collectInstagramData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectInstagramData();
    sendResponse({ success: true });
  }
});

/**
 * Main collection function
 */
async function collectInstagramData() {
  try {
    console.log('[Soul Signature] Collecting Instagram data...');

    // Extract profile information
    await extractProfileInfo();

    // Extract followed accounts
    await extractFollowing();

    // Extract saved posts
    await extractSavedPosts();

    // Extract user's own posts
    await extractUserPosts();

    // Extract interests from explore page
    await extractInterests();

    // Send to backend
    chrome.runtime.sendMessage({
      type: 'SEND_PLATFORM_DATA',
      platform: 'instagram',
      data: collectedData
    }, (response) => {
      if (response.success) {
        console.log('[Soul Signature] Instagram data sent successfully');
      } else {
        console.error('[Soul Signature] Failed to send data:', response.error);
      }
    });
  } catch (error) {
    console.error('[Soul Signature] Instagram collection error:', error);
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  // Extract from page metadata
  const metaDescription = document.querySelector('meta[property="og:description"]');
  const metaTitle = document.querySelector('meta[property="og:title"]');

  if (metaDescription) {
    const descriptionText = metaDescription.getAttribute('content');
    const followersMatch = descriptionText.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Followers/);
    const followingMatch = descriptionText.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Following/);
    const postsMatch = descriptionText.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*Posts/);

    collectedData.profileInfo = {
      username: metaTitle?.getAttribute('content')?.split('•')[0]?.trim() || null,
      followers: followersMatch ? followersMatch[1] : null,
      following: followingMatch ? followingMatch[1] : null,
      posts: postsMatch ? postsMatch[1] : null,
      extractedAt: new Date().toISOString()
    };
  }

  // Extract bio and profile picture
  const bioElement = document.querySelector('div.-vDIg span, header section div span');
  const profilePicElement = document.querySelector('header img[alt*="profile picture"]');

  if (bioElement) {
    collectedData.profileInfo.bio = bioElement.textContent.trim();
  }

  if (profilePicElement) {
    collectedData.profileInfo.profilePicUrl = profilePicElement.src;
  }

  console.log('[Soul Signature] Extracted profile info:', collectedData.profileInfo);
}

/**
 * Extract followed accounts
 */
async function extractFollowing() {
  // If on following page
  if (window.location.href.includes('/following')) {
    const followingItems = document.querySelectorAll('div[role="dialog"] a[href^="/"]');

    followingItems.forEach(item => {
      const username = item.getAttribute('href').replace('/', '');
      const nameElement = item.querySelector('div > div > div:last-child span');

      if (username && username !== 'explore' && username !== 'direct') {
        collectedData.following.push({
          username: username,
          displayName: nameElement?.textContent.trim() || username,
          profileUrl: `https://www.instagram.com/${username}`,
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.following.length} following accounts`);
  }
}

/**
 * Extract saved posts
 */
async function extractSavedPosts() {
  // If on saved/collections page
  if (window.location.href.includes('/saved')) {
    const savedItems = document.querySelectorAll('article a[href^="/p/"]');

    savedItems.forEach(item => {
      const postUrl = item.getAttribute('href');
      const imgElement = item.querySelector('img');

      if (postUrl) {
        collectedData.savedPosts.push({
          postUrl: `https://www.instagram.com${postUrl}`,
          imageUrl: imgElement?.src || null,
          altText: imgElement?.alt || null,
          savedAt: new Date().toISOString()
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.savedPosts.length} saved posts`);
  }
}

/**
 * Extract user's own posts
 */
async function extractUserPosts() {
  // If on user's own profile
  const isOwnProfile = document.querySelector('a[href*="/accounts/edit/"]');

  if (isOwnProfile) {
    const postLinks = document.querySelectorAll('article a[href^="/p/"]');

    postLinks.forEach(link => {
      const postUrl = link.getAttribute('href');
      const imgElement = link.querySelector('img');
      const likeCountElement = link.parentElement?.querySelector('span[class*="like"]');

      if (postUrl) {
        collectedData.userPosts.push({
          postUrl: `https://www.instagram.com${postUrl}`,
          imageUrl: imgElement?.src || null,
          altText: imgElement?.alt || null,
          caption: imgElement?.alt || null,
          likeCount: likeCountElement?.textContent.trim() || null,
          postedAt: new Date().toISOString() // Approximate
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.userPosts.length} user posts`);
  }
}

/**
 * Extract interests from explore page
 */
async function extractInterests() {
  // If on explore page
  if (window.location.href.includes('/explore')) {
    const explorePosts = document.querySelectorAll('article a[href^="/p/"]');

    explorePosts.forEach(link => {
      const imgElement = link.querySelector('img');
      const altText = imgElement?.alt || '';

      // Extract hashtags and keywords from alt text
      const hashtags = altText.match(/#\w+/g) || [];

      hashtags.forEach(tag => {
        if (!collectedData.interests.includes(tag)) {
          collectedData.interests.push(tag);
        }
      });
    });

    console.log(`[Soul Signature] Extracted ${collectedData.interests.length} interests from explore`);
  }
}

/**
 * Intercept Instagram GraphQL API calls for richer data
 */
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;

  // Intercept GraphQL queries
  if (typeof url === 'string' && url.includes('/graphql/query')) {
    return originalFetch.apply(this, args).then(response => {
      const clonedResponse = response.clone();
      clonedResponse.json().then(data => {
        // Extract liked posts from feed
        if (data?.data?.user?.edge_liked_media?.edges) {
          data.data.user.edge_liked_media.edges.forEach(edge => {
            collectedData.likedPosts.push({
              postId: edge.node.id,
              shortcode: edge.node.shortcode,
              caption: edge.node.edge_media_to_caption?.edges[0]?.node?.text || null,
              imageUrl: edge.node.display_url,
              likedAt: new Date(edge.node.taken_at_timestamp * 1000).toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted liked posts from GraphQL API');
        }

        // Extract following list
        if (data?.data?.user?.edge_follow?.edges) {
          data.data.user.edge_follow.edges.forEach(edge => {
            collectedData.following.push({
              username: edge.node.username,
              displayName: edge.node.full_name,
              profilePicUrl: edge.node.profile_pic_url,
              isVerified: edge.node.is_verified,
              timestamp: new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted following list from GraphQL API');
        }

        // Extract stories viewed
        if (data?.data?.reels_media) {
          data.data.reels_media.forEach(story => {
            collectedData.storiesViewed.push({
              userId: story.user?.id,
              username: story.user?.username,
              storyId: story.id,
              timestamp: new Date(story.taken_at_timestamp * 1000).toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted stories viewed from GraphQL API');
        }
      }).catch(e => console.error('[Soul Signature] Error parsing GraphQL response:', e));

      return response;
    });
  }

  return originalFetch.apply(this, args);
};

console.log('[Soul Signature] Instagram API interceptor installed');

/**
 * Live like detection (v3.9.0)
 * =============================
 * Hooks every click on the page. If the click target is IG's heart-button
 * (aria-label contains "Like" in any locale) AND the button is about to
 * transition from unliked-to-liked, we capture the post URL + caption.
 *
 * Why bubble-phase: IG re-renders the button after click. By the time
 * the next paint happens, the article might be in a different state.
 * We capture during the click bubble so we have the post context.
 *
 * Why we trust the aria-label: IG localizes it ("Like", "Curtir",
 * "Me gusta", "いいね") but always sets it on the heart icon's parent
 * button. We match a wide regex.
 */
const LIVE_LIKE_BATCH = new Map(); // postUrl -> { caption, likedAt }
const LIKE_LABEL_RX = /^(like|curtir|me gusta|j'aime|gefällt mir|いいね|좋아요|赞|likar|jaa|tykkää|любить|нравится)$/i;

function isLikeButton(el) {
  if (!el || el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false;
  const label = (el.getAttribute('aria-label') || '').trim();
  if (!label) return false;
  return LIKE_LABEL_RX.test(label);
}

function recordLiveLike(button) {
  try {
    const article = button.closest('article');
    if (!article) return;
    const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    if (!postLink) return;
    const href = postLink.getAttribute('href');
    if (!href) return;
    const postUrl = href.startsWith('/') ? `https://www.instagram.com${href}` : href;
    // Caption: first <span> with non-empty text inside the article
    let caption = null;
    const captionEl = article.querySelector('h1, [data-testid="caption"], div._a9zs, span');
    if (captionEl) caption = (captionEl.textContent || '').trim().slice(0, 500) || null;
    const img = article.querySelector('img');
    const altText = img?.getAttribute('alt') || null;
    if (LIVE_LIKE_BATCH.has(postUrl)) return; // dedup within session
    LIVE_LIKE_BATCH.set(postUrl, {
      postUrl,
      caption,
      altText,
      likedAt: new Date().toISOString(),
    });
    console.log('[Soul Signature] live like captured:', postUrl);
  } catch (e) {
    console.warn('[Soul Signature] recordLiveLike error:', e);
  }
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('button, [role="button"]');
  if (!button) return;
  if (!isLikeButton(button)) return;
  // Capture BEFORE React re-renders — schedule with rAF so the click goes through first
  requestAnimationFrame(() => recordLiveLike(button));
}, { capture: true, passive: true });

/**
 * Periodically flush live likes batch into collectedData and ship to backend.
 * Runs every 30s; only fires SEND if there are new items.
 */
setInterval(() => {
  if (LIVE_LIKE_BATCH.size === 0) return;
  const items = Array.from(LIVE_LIKE_BATCH.values());
  LIVE_LIKE_BATCH.clear();
  // Merge into collectedData.likedPosts (avoiding dup with GraphQL-intercepted likes)
  const existing = new Set((collectedData.likedPosts || []).map(p => p.postUrl || `https://www.instagram.com/p/${p.shortcode}/`));
  for (const item of items) {
    if (existing.has(item.postUrl)) continue;
    collectedData.likedPosts.push(item);
  }
  // Trigger an early ship (in addition to whatever the rest of the collector does)
  try {
    // Per-item events (NOT a single {likedPosts:[...]} blob): background.js does
    // `message.events || [message.data]`, and extension-data.js B2 reads title/url
    // off each event — a blob collapses to one useless "Unknown" observation.
    chrome.runtime.sendMessage({
      type: 'SEND_PLATFORM_DATA',
      platform: 'instagram',
      events: items.map((it) => ({
        eventType: 'like',
        platform: 'instagram',
        timestamp: it.likedAt || new Date().toISOString(),
        data: {
          title: it.caption ? String(it.caption).slice(0, 140) : 'Liked an Instagram post',
          type: 'like',
          url: it.postUrl || (it.shortcode ? `https://www.instagram.com/p/${it.shortcode}/` : ''),
        },
      })),
    }, () => { void chrome.runtime.lastError; });
    console.log(`[Soul Signature] shipped ${items.length} live likes`);
  } catch (e) {
    console.warn('[Soul Signature] live-like ship error:', e);
  }
}, 30_000);

console.log('[Soul Signature] live like detection installed');
