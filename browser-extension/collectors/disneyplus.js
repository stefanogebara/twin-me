/**
 * Disney+ Data Collector
 * Extracts watch history, watchlist, and content preferences
 */

console.log('[Soul Signature] Disney+ collector loaded');

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
    console.log('[Soul Signature] Authenticated - starting Disney+ collection');
    collectDisneyPlusData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectDisneyPlusData();
    sendResponse({ success: true });
  }
});

/**
 * Main collection function
 */
async function collectDisneyPlusData() {
  try {
    console.log('[Soul Signature] Collecting Disney+ data...');

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
      platform: 'disneyplus',
      data: collectedData
    }, (response) => {
      if (response.success) {
        console.log('[Soul Signature] Disney+ data sent successfully');
      } else {
        console.error('[Soul Signature] Failed to send data:', response.error);
      }
    });
  } catch (error) {
    console.error('[Soul Signature] Disney+ collection error:', error);
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  // Extract profile name
  const profileName = document.querySelector('[data-testid="profile-name"], .profile-name');

  if (profileName) {
    collectedData.profileInfo = {
      name: profileName.textContent.trim(),
      extractedAt: new Date().toISOString()
    };
  }

  // Extract profile avatar info
  const profileAvatar = document.querySelector('[data-testid="profile-avatar"] img, .profile-avatar img');
  if (profileAvatar) {
    collectedData.profileInfo.avatarUrl = profileAvatar.src;
    collectedData.profileInfo.avatarAlt = profileAvatar.alt;
  }

  console.log('[Soul Signature] Extracted profile info:', collectedData.profileInfo);
}

/**
 * Extract watchlist
 */
async function extractWatchlist() {
  // If on watchlist page
  if (window.location.href.includes('/watchlist')) {
    const watchlistItems = document.querySelectorAll('[data-testid="set-item"], .set-item, [class*="WatchlistItem"]');

    watchlistItems.forEach(item => {
      const titleElement = item.querySelector('[data-testid="set-item-title"], .set-item-title, h3, h4');
      const imgElement = item.querySelector('img');
      const linkElement = item.querySelector('a');

      if (titleElement) {
        collectedData.watchlist.push({
          title: titleElement.textContent.trim(),
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
  const continueWatchingSection = document.querySelector('[data-testid="set-ContinueWatchingSet"], [class*="ContinueWatching"]');

  if (continueWatchingSection) {
    const items = continueWatchingSection.querySelectorAll('[data-testid="set-item"], .set-item');

    items.forEach(item => {
      const titleElement = item.querySelector('[data-testid="set-item-title"], h3, h4');
      const imgElement = item.querySelector('img');
      const progressElement = item.querySelector('[data-testid="progress-bar"], .progress-bar, [role="progressbar"]');

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
  // Look for favorited content (heart icon or favorite marker)
  const favoriteItems = document.querySelectorAll('[data-testid="favorite-item"], [class*="Favorite"][class*="Item"]');

  favoriteItems.forEach(item => {
    const titleElement = item.querySelector('[data-testid="set-item-title"], h3, h4');
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
  // Extract genres from collection pages
  const genreLinks = document.querySelectorAll('[data-testid="genre-link"], a[href*="/genre/"], a[href*="/collection/"]');

  genreLinks.forEach(link => {
    const genreText = link.textContent.trim();
    if (genreText && !collectedData.genres.includes(genreText)) {
      collectedData.genres.push(genreText);
    }
  });

  // Extract from meta tags
  const metaGenre = document.querySelector('meta[property="genre"], meta[name="genre"]');
  if (metaGenre) {
    const genres = metaGenre.getAttribute('content').split(',');
    genres.forEach(genre => {
      const trimmedGenre = genre.trim();
      if (trimmedGenre && !collectedData.genres.includes(trimmedGenre)) {
        collectedData.genres.push(trimmedGenre);
      }
    });
  }

  console.log(`[Soul Signature] Extracted ${collectedData.genres.length} genre preferences`);
}

/**
 * Intercept Disney+ API calls for richer data
 */
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;

  // Intercept Disney+ GraphQL or REST API calls
  if (typeof url === 'string' && (url.includes('/graph/') || url.includes('/api/'))) {
    return originalFetch.apply(this, args).then(response => {
      const clonedResponse = response.clone();
      clonedResponse.json().then(data => {
        // Extract watchlist from API response
        if (data?.data?.Watchlist?.items) {
          data.data.Watchlist.items.forEach(item => {
            collectedData.watchlist.push({
              title: item.text?.title?.full?.program?.default?.content || item.title,
              contentId: item.contentId,
              type: item.type,
              imageUrl: item.image?.tile?.['1.78']?.program?.default?.url || null,
              addedAt: item.addedDate || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted watchlist from API');
        }

        // Extract continue watching from API
        if (data?.data?.ContinueWatchingSet?.items) {
          data.data.ContinueWatchingSet.items.forEach(item => {
            collectedData.continueWatching.push({
              title: item.text?.title?.full?.program?.default?.content || item.title,
              contentId: item.contentId,
              progress: item.progress?.percentComplete || null,
              imageUrl: item.image?.tile?.['1.78']?.program?.default?.url || null,
              lastWatchedAt: item.lastWatched || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted continue watching from API');
        }

        // Extract watch history if available
        if (data?.data?.WatchHistory?.items || data?.items) {
          const items = data?.data?.WatchHistory?.items || data?.items;
          items.forEach(item => {
            collectedData.watchHistory.push({
              title: item.text?.title?.full?.program?.default?.content || item.title,
              contentId: item.contentId,
              type: item.type,
              watchedAt: item.watchedDate || new Date().toISOString(),
              duration: item.runtime || null
            });
          });
          console.log('[Soul Signature] Intercepted watch history from API');
        }
      }).catch(e => console.error('[Soul Signature] Error parsing Disney+ API response:', e));

      return response;
    });
  }

  return originalFetch.apply(this, args);
};

console.log('[Soul Signature] Disney+ API interceptor installed');
