/**
 * HBO Max Data Collector
 * Extracts watch history, watchlist, and viewing preferences
 */

console.log('[Soul Signature] HBO Max collector loaded');

let collectedData = {
  watchHistory: [],
  watchlist: [],
  favorites: [],
  profileInfo: {},
  genres: [],
  continueWatching: []
};

// Check authentication
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response.authenticated) {
    console.log('[Soul Signature] Authenticated - starting HBO Max collection');
    collectHBOMaxData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectHBOMaxData();
    sendResponse({ success: true });
  }
});

/**
 * Main collection function
 */
async function collectHBOMaxData() {
  try {
    console.log('[Soul Signature] Collecting HBO Max data...');

    // Extract profile information
    await extractProfileInfo();

    // Extract watchlist
    await extractWatchlist();

    // Extract continue watching
    await extractContinueWatching();

    // Extract favorites
    await extractFavorites();

    // Extract genre preferences
    await extractGenrePreferences();

    // Send to backend
    chrome.runtime.sendMessage({
      type: 'SEND_PLATFORM_DATA',
      platform: 'hbomax',
      data: collectedData
    }, (response) => {
      if (response.success) {
        console.log('[Soul Signature] HBO Max data sent successfully');
      } else {
        console.error('[Soul Signature] Failed to send data:', response.error);
      }
    });
  } catch (error) {
    console.error('[Soul Signature] HBO Max collection error:', error);
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  // Extract profile name from page
  const profileName = document.querySelector('[data-testid="profile-name"], .profile-name, [class*="ProfileName"]');

  if (profileName) {
    collectedData.profileInfo = {
      name: profileName.textContent.trim(),
      extractedAt: new Date().toISOString()
    };
  }

  // Extract from meta tags
  const metaUser = document.querySelector('meta[property="user:profile_name"], meta[name="user:profile_name"]');
  if (metaUser) {
    collectedData.profileInfo.name = metaUser.getAttribute('content');
  }

  console.log('[Soul Signature] Extracted profile info:', collectedData.profileInfo);
}

/**
 * Extract watchlist
 */
async function extractWatchlist() {
  // If on watchlist/my list page
  if (window.location.href.includes('/list') || window.location.href.includes('/watchlist')) {
    const watchlistItems = document.querySelectorAll('[data-testid="card"], [class*="Card"], [class*="TileItem"]');

    watchlistItems.forEach(item => {
      const titleElement = item.querySelector('[data-testid="title"], [class*="Title"], h3, h4');
      const imgElement = item.querySelector('img');
      const linkElement = item.querySelector('a');

      if (titleElement) {
        const title = titleElement.textContent.trim();

        collectedData.watchlist.push({
          title: title,
          imageUrl: imgElement?.src || null,
          url: linkElement?.href || null,
          addedAt: new Date().toISOString()
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.watchlist.length} watchlist items`);
  }
}

/**
 * Extract continue watching
 */
async function extractContinueWatching() {
  // Look for continue watching section
  const continueWatchingSection = document.querySelector('[data-testid="continue-watching"], [class*="ContinueWatching"]');

  if (continueWatchingSection) {
    const items = continueWatchingSection.querySelectorAll('[data-testid="card"], [class*="Card"]');

    items.forEach(item => {
      const titleElement = item.querySelector('[data-testid="title"], h3, h4');
      const imgElement = item.querySelector('img');
      const progressElement = item.querySelector('[data-testid="progress"], [class*="Progress"], [role="progressbar"]');

      if (titleElement) {
        collectedData.continueWatching.push({
          title: titleElement.textContent.trim(),
          imageUrl: imgElement?.src || null,
          progress: progressElement?.getAttribute('aria-valuenow') || progressElement?.style?.width || null,
          lastWatchedAt: new Date().toISOString()
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.continueWatching.length} continue watching items`);
  }
}

/**
 * Extract favorites
 */
async function extractFavorites() {
  // Look for favorited content
  const favoriteItems = document.querySelectorAll('[data-testid="favorite"], [class*="Favorite"][class*="Item"]');

  favoriteItems.forEach(item => {
    const titleElement = item.querySelector('[data-testid="title"], h3, h4');
    const imgElement = item.querySelector('img');

    if (titleElement) {
      collectedData.favorites.push({
        title: titleElement.textContent.trim(),
        imageUrl: imgElement?.src || null,
        favoritedAt: new Date().toISOString()
      });
    }
  });

  console.log(`[Soul Signature] Extracted ${collectedData.favorites.length} favorites`);
}

/**
 * Extract genre preferences
 */
async function extractGenrePreferences() {
  // Extract genres from navigation or category links
  const genreLinks = document.querySelectorAll('[data-testid="genre"], a[href*="/genre/"], a[href*="/collection/"], a[href*="/category/"]');

  genreLinks.forEach(link => {
    const genreText = link.textContent.trim();
    if (genreText && !collectedData.genres.includes(genreText)) {
      collectedData.genres.push(genreText);
    }
  });

  // Extract from breadcrumbs
  const breadcrumbs = document.querySelectorAll('[class*="Breadcrumb"] a, nav a');
  breadcrumbs.forEach(breadcrumb => {
    const genreText = breadcrumb.textContent.trim();
    const genres = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Documentary', 'Animation', 'Romance', 'Crime'];

    if (genres.some(genre => genreText.toLowerCase().includes(genre.toLowerCase()))) {
      if (!collectedData.genres.includes(genreText)) {
        collectedData.genres.push(genreText);
      }
    }
  });

  console.log(`[Soul Signature] Extracted ${collectedData.genres.length} genre preferences`);
}

/**
 * Intercept HBO Max API calls for richer data
 */
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;

  // Intercept HBO Max API calls (GraphQL or REST)
  if (typeof url === 'string' && (url.includes('/api/') || url.includes('/graphql') || url.includes('/cms/'))) {
    return originalFetch.apply(this, args).then(response => {
      const clonedResponse = response.clone();
      clonedResponse.json().then(data => {
        // Extract watchlist from API
        if (data?.data?.watchlist?.items || data?.watchlist) {
          const items = data?.data?.watchlist?.items || data?.watchlist;
          items.forEach(item => {
            collectedData.watchlist.push({
              title: item.title || item.name,
              contentId: item.id,
              type: item.type,
              imageUrl: item.images?.[0]?.url || item.image || null,
              addedAt: item.addedDate || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted watchlist from HBO Max API');
        }

        // Extract continue watching
        if (data?.data?.continueWatching?.items || data?.continueWatching) {
          const items = data?.data?.continueWatching?.items || data?.continueWatching;
          items.forEach(item => {
            collectedData.continueWatching.push({
              title: item.title || item.name,
              contentId: item.id,
              progress: item.progress?.percentComplete || null,
              imageUrl: item.images?.[0]?.url || item.image || null,
              lastWatchedAt: item.lastWatched || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted continue watching from HBO Max API');
        }

        // Extract viewing history if available
        if (data?.data?.viewingHistory?.items || data?.viewingHistory) {
          const items = data?.data?.viewingHistory?.items || data?.viewingHistory;
          items.forEach(item => {
            collectedData.watchHistory.push({
              title: item.title || item.name,
              contentId: item.id,
              type: item.type,
              watchedAt: item.viewedDate || new Date().toISOString(),
              duration: item.runtime || null,
              seriesInfo: item.seriesTitle ? {
                seriesTitle: item.seriesTitle,
                seasonNumber: item.seasonNumber,
                episodeNumber: item.episodeNumber
              } : null
            });
          });
          console.log('[Soul Signature] Intercepted viewing history from HBO Max API');
        }

        // Extract profile data
        if (data?.data?.profile || data?.profile) {
          const profile = data?.data?.profile || data?.profile;
          collectedData.profileInfo = {
            ...collectedData.profileInfo,
            name: profile.name || collectedData.profileInfo.name,
            avatarUrl: profile.avatar || collectedData.profileInfo.avatarUrl,
            preferences: profile.preferences || null
          };
          console.log('[Soul Signature] Intercepted profile data from HBO Max API');
        }
      }).catch(e => console.error('[Soul Signature] Error parsing HBO Max API response:', e));

      return response;
    });
  }

  return originalFetch.apply(this, args);
};

console.log('[Soul Signature] HBO Max API interceptor installed');
