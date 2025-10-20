/**
 * Netflix Data Collector
 * Extracts watch history, ratings, and preferences
 */

console.log('[Soul Signature] Netflix collector loaded');

let collectedData = {
  watchHistory: [],
  ratings: [],
  watchlist: [],
  profiles: [],
  genres: []
};

// Check authentication
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response.authenticated) {
    console.log('[Soul Signature] Authenticated - starting Netflix collection');
    collectNetflixData();
  } else {
    console.log('[Soul Signature] Not authenticated - waiting for login');
  }
});

// Listen for collection trigger
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COLLECT_DATA') {
    collectNetflixData();
    sendResponse({ success: true });
  }
});

/**
 * Main collection function
 */
async function collectNetflixData() {
  try {
    console.log('[Soul Signature] Collecting Netflix data...');

    // Extract viewing activity
    await extractViewingActivity();

    // Extract ratings
    await extractRatings();

    // Extract My List
    await extractWatchlist();

    // Extract profile info
    await extractProfileInfo();

    // Send to backend
    chrome.runtime.sendMessage({
      type: 'SEND_PLATFORM_DATA',
      platform: 'netflix',
      data: collectedData
    }, (response) => {
      if (response.success) {
        console.log('[Soul Signature] Netflix data sent successfully');
      } else {
        console.error('[Soul Signature] Failed to send data:', response.error);
      }
    });
  } catch (error) {
    console.error('[Soul Signature] Netflix collection error:', error);
  }
}

/**
 * Extract viewing activity
 */
async function extractViewingActivity() {
  // Method 1: Intercept Netflix API calls
  const viewingActivityUrl = 'https://www.netflix.com/api/shakti/*/viewingactivity';
  
  // Method 2: Parse from DOM if on viewing activity page
  if (window.location.href.includes('/viewingactivity')) {
    const activityItems = document.querySelectorAll('.retableRow');
    
    activityItems.forEach(item => {
      const titleElement = item.querySelector('.title a');
      const dateElement = item.querySelector('.date');
      
      if (titleElement && dateElement) {
        collectedData.watchHistory.push({
          title: titleElement.textContent.trim(),
          url: titleElement.href,
          date: dateElement.textContent.trim(),
          timestamp: new Date(dateElement.textContent.trim()).toISOString()
        });
      }
    });
    
    console.log(`[Soul Signature] Extracted ${collectedData.watchHistory.length} viewing history items`);
  }
}

/**
 * Extract ratings
 */
async function extractRatings() {
  // Look for rated content in DOM
  const ratedItems = document.querySelectorAll('.userRating');
  
  ratedItems.forEach(item => {
    const titleElement = item.closest('.title-card')?.querySelector('.fallback-text');
    const ratingElement = item.querySelector('.rating-stars');
    
    if (titleElement && ratingElement) {
      const rating = ratingElement.getAttribute('data-rating') || 
                    (ratingElement.querySelectorAll('.rating-star-full').length);
      
      collectedData.ratings.push({
        title: titleElement.textContent.trim(),
        rating: parseInt(rating),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  console.log(`[Soul Signature] Extracted ${collectedData.ratings.length} ratings`);
}

/**
 * Extract watchlist (My List)
 */
async function extractWatchlist() {
  // If on My List page
  if (window.location.href.includes('/browse/my-list')) {
    const listItems = document.querySelectorAll('.title-card');
    
    listItems.forEach(item => {
      const titleElement = item.querySelector('.fallback-text');
      const imgElement = item.querySelector('img');
      
      if (titleElement) {
        collectedData.watchlist.push({
          title: titleElement.textContent.trim(),
          imageUrl: imgElement?.src || null,
          addedDate: new Date().toISOString() // Approximate
        });
      }
    });
    
    console.log(`[Soul Signature] Extracted ${collectedData.watchlist.length} watchlist items`);
  }
}

/**
 * Extract profile information
 */
async function extractProfileInfo() {
  // Get active profile
  const activeProfile = document.querySelector('.profile-name, .account-dropdown-button');
  
  if (activeProfile) {
    collectedData.profiles.push({
      name: activeProfile.textContent.trim(),
      isActive: true
    });
  }
  
  // Extract preferences from page metadata
  const genreLinks = document.querySelectorAll('.genre');
  genreLinks.forEach(link => {
    const genre = link.textContent.trim();
    if (genre && !collectedData.genres.includes(genre)) {
      collectedData.genres.push(genre);
    }
  });
  
  console.log('[Soul Signature] Extracted profile info');
}

/**
 * Intercept Netflix API calls for richer data
 */
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url] = args;
  
  // Intercept viewing activity API
  if (typeof url === 'string' && url.includes('/viewingactivity')) {
    return originalFetch.apply(this, args).then(response => {
      const clonedResponse = response.clone();
      clonedResponse.json().then(data => {
        if (data.viewedItems) {
          data.viewedItems.forEach(item => {
            collectedData.watchHistory.push({
              title: item.title,
              videoId: item.movieID,
              series: item.seriesTitle,
              date: item.dateStr,
              duration: item.bookmark,
              timestamp: new Date(item.date * 1000).toISOString()
            });
          });
          console.log('[Soul Signature] Intercepted viewing activity API');
        }
      }).catch(e => console.error('[Soul Signature] Error parsing API response:', e));
      
      return response;
    });
  }
  
  return originalFetch.apply(this, args);
};

console.log('[Soul Signature] Netflix API interceptor installed');
