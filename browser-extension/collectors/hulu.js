/**
 * Hulu Data Collector
 * Extracts watch history, watchlist, and viewing preferences from Hulu
 */

console.log('[Soul Signature] Hulu collector loaded');

let collectedData = {
  watchHistory: [],
  watchlist: [],
  favorites: [],
  profiles: [],
  genres: [],
  continueWatching: [],
  liveTV: []
};

// Check authentication
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response && response.authenticated) {
    console.log('[Soul Signature] Authenticated - starting Hulu collection');
    collectHuluData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectHuluData();
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});

/**
 * Main collection function
 */
async function collectHuluData() {
  try {
    console.log('[Soul Signature] Collecting Hulu data...');

    // Extract profile information
    await extractProfileInfo();

    // Extract continue watching
    await extractContinueWatching();

    // Extract watchlist ("My Stuff")
    await extractWatchlist();

    // Extract watch history
    await extractWatchHistory();

    // Extract favorites/liked content
    await extractFavorites();

    // Extract genre preferences
    await extractGenrePreferences();

    // Extract Live TV if available
    await extractLiveTVActivity();

    console.log('[Soul Signature] Hulu data collected:', collectedData);

    // Send collected data to background script
    chrome.runtime.sendMessage({
      type: 'DATA_COLLECTED',
      platform: 'hulu',
      data: collectedData,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[Soul Signature] Error collecting Hulu data:', error);
    chrome.runtime.sendMessage({
      type: 'COLLECTION_ERROR',
      platform: 'hulu',
      error: error.message
    });
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  try {
    // Hulu profile selector: .ProfileMenu, .profile-avatar, .MasterworksProfile
    const profileElements = document.querySelectorAll('.ProfileMenu, .profile-avatar, [data-automationid="profile-button"]');

    profileElements.forEach(profile => {
      const nameElement = profile.querySelector('.ProfileMenu__name, .profile-name, [class*="ProfileName"]');
      const avatarElement = profile.querySelector('img[alt], .avatar img');

      if (nameElement || avatarElement) {
        collectedData.profiles.push({
          name: nameElement?.textContent?.trim() || 'Unknown',
          avatar: avatarElement?.src || null,
          isActive: profile.classList.contains('active') || profile.getAttribute('aria-pressed') === 'true'
        });
      }
    });

    console.log(`[Hulu] Extracted ${collectedData.profiles.length} profiles`);
  } catch (error) {
    console.error('[Hulu] Error extracting profiles:', error);
  }
}

/**
 * Extract Continue Watching section
 */
async function extractContinueWatching() {
  try {
    // Hulu selectors: .Masthead__continue-watching, .keepWatching, [data-automationid="keep-watching"]
    const continueWatchingSection = document.querySelector('.Masthead__continue-watching, .keepWatching, [data-automationid="keep-watching"], [class*="KeepWatching"]');

    if (!continueWatchingSection) {
      console.log('[Hulu] No continue watching section found');
      return;
    }

    const items = continueWatchingSection.querySelectorAll('.card, .entity-card, [class*="Card"], [data-automationid="entity-card"]');

    items.forEach(item => {
      const titleElement = item.querySelector('.card__title, .entity-title, [class*="Title"]');
      const imageElement = item.querySelector('img[alt], .card__image img, .thumbnail img');
      const progressBar = item.querySelector('.progress-bar, [class*="Progress"], [role="progressbar"]');
      const metadataElement = item.querySelector('.metadata, .card__metadata, [class*="Metadata"]');

      if (titleElement) {
        const title = titleElement.textContent?.trim();
        const imageUrl = imageElement?.src || imageElement?.getAttribute('data-src');
        const progress = progressBar?.style?.width || progressBar?.getAttribute('aria-valuenow') || '0';
        const metadata = metadataElement?.textContent?.trim();

        // Determine content type from metadata or class
        const isMovie = metadata?.toLowerCase().includes('movie') || item.classList.contains('movie');
        const isSeries = metadata?.toLowerCase().includes('episode') || metadata?.includes('S') && metadata?.includes('E') || item.classList.contains('series');

        collectedData.continueWatching.push({
          title,
          imageUrl,
          progress: parseFloat(progress) || 0,
          type: isMovie ? 'movie' : (isSeries ? 'series' : 'unknown'),
          metadata,
          timestamp: Date.now()
        });
      }
    });

    console.log(`[Hulu] Extracted ${collectedData.continueWatching.length} continue watching items`);
  } catch (error) {
    console.error('[Hulu] Error extracting continue watching:', error);
  }
}

/**
 * Extract Watchlist ("My Stuff")
 */
async function extractWatchlist() {
  try {
    // Hulu watchlist is called "My Stuff"
    // Selectors: .MyStuff, [data-automationid="my-stuff"], .watchlist
    const watchlistSection = document.querySelector('.MyStuff, [data-automationid="my-stuff"], .watchlist, [class*="MyStuff"]');

    if (!watchlistSection) {
      console.log('[Hulu] No watchlist section found on this page');
      return;
    }

    const items = watchlistSection.querySelectorAll('.entity-card, .card, [data-automationid="entity-card"], [class*="Card"]');

    items.forEach(item => {
      const titleElement = item.querySelector('.card__title, .entity-title, [class*="Title"]');
      const imageElement = item.querySelector('img[alt], .card__image img');
      const typeElement = item.querySelector('.badge, .type-badge, [class*="Badge"]');
      const addedDateElement = item.querySelector('.date-added, [class*="DateAdded"]');

      if (titleElement) {
        collectedData.watchlist.push({
          title: titleElement.textContent?.trim(),
          imageUrl: imageElement?.src || imageElement?.getAttribute('data-src'),
          type: typeElement?.textContent?.trim() || 'unknown',
          addedDate: addedDateElement?.textContent?.trim() || null,
          timestamp: Date.now()
        });
      }
    });

    console.log(`[Hulu] Extracted ${collectedData.watchlist.length} watchlist items`);
  } catch (error) {
    console.error('[Hulu] Error extracting watchlist:', error);
  }
}

/**
 * Extract Watch History
 */
async function extractWatchHistory() {
  try {
    // Navigate to watch history page if not already there
    const currentUrl = window.location.href;
    if (!currentUrl.includes('/manage-dvr/recordings') && !currentUrl.includes('/profiles')) {
      console.log('[Hulu] Not on watch history page, extracting from current page');
    }

    // Extract from Hub collections, Recently Watched, etc.
    const historySelectors = [
      '.recently-watched',
      '[data-automationid="recently-watched"]',
      '[class*="RecentlyWatched"]',
      '.viewing-history'
    ];

    for (const selector of historySelectors) {
      const historySection = document.querySelector(selector);
      if (!historySection) continue;

      const items = historySection.querySelectorAll('.entity-card, .card, [data-automationid="entity-card"]');

      items.forEach(item => {
        const titleElement = item.querySelector('.card__title, .entity-title, [class*="Title"]');
        const watchedDateElement = item.querySelector('.date-watched, .timestamp, [class*="Date"]');
        const episodeElement = item.querySelector('.episode-info, [class*="Episode"]');

        if (titleElement) {
          collectedData.watchHistory.push({
            title: titleElement.textContent?.trim(),
            watchedDate: watchedDateElement?.textContent?.trim() || null,
            episodeInfo: episodeElement?.textContent?.trim() || null,
            timestamp: Date.now()
          });
        }
      });
    }

    console.log(`[Hulu] Extracted ${collectedData.watchHistory.length} watch history items`);
  } catch (error) {
    console.error('[Hulu] Error extracting watch history:', error);
  }
}

/**
 * Extract Favorites/Liked Content
 */
async function extractFavorites() {
  try {
    // Hulu favorites are items with a "heart" icon or "favorite" badge
    const favoriteItems = document.querySelectorAll('[data-favorite="true"], .favorited, [class*="Favorite"]');

    favoriteItems.forEach(item => {
      const titleElement = item.querySelector('.card__title, .entity-title, [class*="Title"]');
      const imageElement = item.querySelector('img[alt]');

      if (titleElement) {
        collectedData.favorites.push({
          title: titleElement.textContent?.trim(),
          imageUrl: imageElement?.src || imageElement?.getAttribute('data-src'),
          timestamp: Date.now()
        });
      }
    });

    console.log(`[Hulu] Extracted ${collectedData.favorites.length} favorites`);
  } catch (error) {
    console.error('[Hulu] Error extracting favorites:', error);
  }
}

/**
 * Extract Genre Preferences
 */
async function extractGenrePreferences() {
  try {
    // Extract from Hub carousel labels, genre badges, collection headers
    const genreElements = document.querySelectorAll('.hub-title, .collection-title, .genre-badge, [class*="Genre"], [data-automationid="collection-title"]');

    const genreSet = new Set();

    genreElements.forEach(element => {
      const genreText = element.textContent?.trim();
      if (genreText && genreText.length > 0 && genreText.length < 50) {
        // Filter out non-genre text (too long or contains special chars)
        const isGenre = !genreText.match(/\d{4}/) && // not a year
                       !genreText.toLowerCase().includes('continue') &&
                       !genreText.toLowerCase().includes('recommended');

        if (isGenre) {
          genreSet.add(genreText);
        }
      }
    });

    collectedData.genres = Array.from(genreSet);
    console.log(`[Hulu] Extracted ${collectedData.genres.length} genre preferences`);
  } catch (error) {
    console.error('[Hulu] Error extracting genres:', error);
  }
}

/**
 * Extract Live TV Activity (if user has Live TV subscription)
 */
async function extractLiveTVActivity() {
  try {
    // Check if Live TV is available
    const liveTVSection = document.querySelector('.live-tv, [data-automationid="live-tv"], [class*="LiveTV"]');

    if (!liveTVSection) {
      console.log('[Hulu] No Live TV section found (user may not have subscription)');
      return;
    }

    // Extract currently watching or DVR recordings
    const liveItems = liveTVSection.querySelectorAll('.channel-card, .recording-card, [class*="Channel"], [data-automationid="channel"]');

    liveItems.forEach(item => {
      const channelElement = item.querySelector('.channel-name, [class*="ChannelName"]');
      const programElement = item.querySelector('.program-title, [class*="ProgramTitle"]');
      const timeElement = item.querySelector('.time, .timestamp, [class*="Time"]');

      if (channelElement || programElement) {
        collectedData.liveTV.push({
          channel: channelElement?.textContent?.trim() || 'Unknown',
          program: programElement?.textContent?.trim() || 'Unknown',
          time: timeElement?.textContent?.trim() || null,
          timestamp: Date.now()
        });
      }
    });

    console.log(`[Hulu] Extracted ${collectedData.liveTV.length} Live TV items`);
  } catch (error) {
    console.error('[Hulu] Error extracting Live TV:', error);
  }
}

/**
 * Observe DOM changes to re-collect when new content loads
 */
const observer = new MutationObserver((mutations) => {
  // Debounce: only re-collect if significant DOM changes occurred
  const significantChange = mutations.some(mutation =>
    mutation.addedNodes.length > 3 ||
    mutation.type === 'childList' && mutation.target.classList.contains('hub')
  );

  if (significantChange) {
    console.log('[Hulu] Significant DOM change detected, re-collecting data');
    setTimeout(() => collectHuluData(), 2000); // Wait 2s for content to fully load
  }
});

// Start observing the document body for changes
observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('[Soul Signature] Hulu collector initialized and observing DOM changes');
