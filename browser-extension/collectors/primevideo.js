/**
 * Prime Video Data Collector
 * Extracts watch history, watchlist, and viewing preferences
 */

console.log('[Soul Signature] Prime Video collector loaded');

let collectedData = {
  watchHistory: [],
  watchlist: [],
  favorites: [],
  profileInfo: {},
  genres: [],
  continueWatching: [],
  rentals: [],
  purchases: []
};

// Check authentication
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response.authenticated) {
    console.log('[Soul Signature] Authenticated - starting Prime Video collection');
    collectPrimeVideoData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectPrimeVideoData();
    sendResponse({ success: true });
  }
});

/**
 * Main collection function
 */
async function collectPrimeVideoData() {
  try {
    console.log('[Soul Signature] Collecting Prime Video data...');

    // Extract profile information
    await extractProfileInfo();

    // Extract watchlist
    await extractWatchlist();

    // Extract continue watching
    await extractContinueWatching();

    // Extract watch history
    await extractWatchHistory();

    // Extract purchases and rentals
    await extractPurchasesAndRentals();

    // Extract genre preferences
    await extractGenrePreferences();

    // Send to backend
    chrome.runtime.sendMessage({
      type: 'SEND_PLATFORM_DATA',
      platform: 'primevideo',
      data: collectedData
    }, (response) => {
      if (response.success) {
        console.log('[Soul Signature] Prime Video data sent successfully');
      } else {
        console.error('[Soul Signature] Failed to send data:', response.error);
      }
    });
  } catch (error) {
    console.error('[Soul Signature] Prime Video collection error:', error);
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  // Extract profile/account name
  const profileName = document.querySelector('[data-testid="profile-name"], .profile-name, #nav-link-accountList-nav-line-1');

  if (profileName) {
    collectedData.profileInfo = {
      name: profileName.textContent.trim().replace('Hello,', '').trim(),
      extractedAt: new Date().toISOString()
    };
  }

  console.log('[Soul Signature] Extracted profile info:', collectedData.profileInfo);
}

/**
 * Extract watchlist
 */
async function extractWatchlist() {
  // If on watchlist page
  if (window.location.href.includes('/watchlist')) {
    const watchlistItems = document.querySelectorAll('[data-testid="card"], [class*="Card"], [class*="TitleItem"]');

    watchlistItems.forEach(item => {
      const titleElement = item.querySelector('[data-testid="title"], [class*="Title"], h3, h4, .av-detail-section h1');
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
  // Look for continue watching carousel
  const continueWatchingSection = document.querySelector('[data-testid="continue-watching"], [class*="ContinueWatching"], div[class*="continue-watching"]');

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
 * Extract watch history
 */
async function extractWatchHistory() {
  // If on watch history page
  if (window.location.href.includes('/watchhistory') || window.location.href.includes('/activity')) {
    const historyItems = document.querySelectorAll('[data-testid="history-item"], [class*="HistoryItem"]');

    historyItems.forEach(item => {
      const titleElement = item.querySelector('[data-testid="title"], h3, h4');
      const dateElement = item.querySelector('[data-testid="date"], [class*="Date"]');
      const imgElement = item.querySelector('img');

      if (titleElement) {
        collectedData.watchHistory.push({
          title: titleElement.textContent.trim(),
          imageUrl: imgElement?.src || null,
          watchedAt: dateElement ? new Date(dateElement.textContent.trim()).toISOString() : new Date().toISOString()
        });
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.watchHistory.length} watch history items`);
  }
}

/**
 * Extract purchases and rentals
 */
async function extractPurchasesAndRentals() {
  // If on purchases or library page
  if (window.location.href.includes('/library') || window.location.href.includes('/purchases')) {
    const libraryItems = document.querySelectorAll('[data-testid="library-item"], [class*="LibraryItem"]');

    libraryItems.forEach(item => {
      const titleElement = item.querySelector('[data-testid="title"], h3, h4');
      const typeElement = item.querySelector('[data-testid="type"], [class*="Type"]');
      const imgElement = item.querySelector('img');

      if (titleElement) {
        const type = typeElement?.textContent.trim().toLowerCase();

        const itemData = {
          title: titleElement.textContent.trim(),
          imageUrl: imgElement?.src || null,
          purchasedAt: new Date().toISOString()
        };

        if (type?.includes('rental') || type?.includes('rent')) {
          collectedData.rentals.push(itemData);
        } else {
          collectedData.purchases.push(itemData);
        }
      }
    });

    console.log(`[Soul Signature] Extracted ${collectedData.purchases.length} purchases and ${collectedData.rentals.length} rentals`);
  }
}

/**
 * Extract genre preferences
 */
async function extractGenrePreferences() {
  // Extract genres from navigation
  const genreLinks = document.querySelectorAll('a[href*="/genre/"], a[href*="/category/"], a[href*="/collections/"]');

  genreLinks.forEach(link => {
    const genreText = link.textContent.trim();
    if (genreText && !collectedData.genres.includes(genreText)) {
      collectedData.genres.push(genreText);
    }
  });

  // Extract from page categories
  const categoryElements = document.querySelectorAll('[data-testid="genre"], [class*="Genre"]');
  categoryElements.forEach(element => {
    const genreText = element.textContent.trim();
    if (genreText && !collectedData.genres.includes(genreText)) {
      collectedData.genres.push(genreText);
    }
  });

  console.log(`[Soul Signature] Extracted ${collectedData.genres.length} genre preferences`);
}

/**
 * Intercept Prime Video API calls for richer data
 */
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;

  // Intercept Prime Video API calls
  if (typeof url === 'string' && (url.includes('/api/') || url.includes('/gp/video/api/') || url.includes('/cdp/catalog/'))) {
    return originalFetch.apply(this, args).then(response => {
      const clonedResponse = response.clone();
      clonedResponse.json().then(data => {
        // Extract watchlist from API
        if (data?.watchlist?.items || data?.items) {
          const items = data?.watchlist?.items || data?.items;
          items.forEach(item => {
            collectedData.watchlist.push({
              title: item.title || item.name,
              contentId: item.id || item.asin,
              type: item.type,
              imageUrl: item.images?.[0]?.url || item.image || null,
              addedAt: item.addedDate || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted watchlist from Prime Video API');
        }

        // Extract continue watching
        if (data?.continueWatching?.items) {
          data.continueWatching.items.forEach(item => {
            collectedData.continueWatching.push({
              title: item.title || item.name,
              contentId: item.id || item.asin,
              progress: item.playbackProgress?.percentComplete || null,
              imageUrl: item.images?.[0]?.url || item.image || null,
              lastWatchedAt: item.lastWatched || new Date().toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted continue watching from Prime Video API');
        }

        // Extract watch history
        if (data?.watchHistory?.items || data?.viewHistory) {
          const items = data?.watchHistory?.items || data?.viewHistory;
          items.forEach(item => {
            collectedData.watchHistory.push({
              title: item.title || item.name,
              contentId: item.id || item.asin,
              type: item.type,
              watchedAt: item.viewedDate || item.timestamp || new Date().toISOString(),
              duration: item.runtime || null,
              episodeInfo: item.episodeNumber ? {
                seasonNumber: item.seasonNumber,
                episodeNumber: item.episodeNumber,
                seriesTitle: item.seriesTitle
              } : null
            });
          });
          console.log('[Soul Signature] Intercepted watch history from Prime Video API');
        }

        // Extract purchases
        if (data?.purchases?.items || data?.library) {
          const items = data?.purchases?.items || data?.library;
          items.forEach(item => {
            const itemData = {
              title: item.title || item.name,
              contentId: item.id || item.asin,
              imageUrl: item.images?.[0]?.url || item.image || null,
              purchasedAt: item.purchaseDate || new Date().toISOString()
            };

            if (item.rentalPeriod || item.isRental) {
              collectedData.rentals.push(itemData);
            } else {
              collectedData.purchases.push(itemData);
            }
          });
          console.log('[Soul Signature] Intercepted purchases/rentals from Prime Video API');
        }

        // Extract recommendations (for genre inference)
        if (data?.recommendations?.items) {
          data.recommendations.items.forEach(item => {
            if (item.genres && Array.isArray(item.genres)) {
              item.genres.forEach(genre => {
                if (!collectedData.genres.includes(genre)) {
                  collectedData.genres.push(genre);
                }
              });
            }
          });
          console.log('[Soul Signature] Intercepted genre preferences from recommendations');
        }
      }).catch(e => console.error('[Soul Signature] Error parsing Prime Video API response:', e));

      return response;
    });
  }

  return originalFetch.apply(this, args);
};

console.log('[Soul Signature] Prime Video API interceptor installed');
