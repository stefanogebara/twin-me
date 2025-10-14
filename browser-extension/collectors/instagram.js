/**
 * Instagram Data Collector
 * Extracts posts liked, accounts followed, stories viewed, and user interests
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
