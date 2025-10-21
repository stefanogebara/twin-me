/**
 * Netflix Content Script
 * Scrapes viewing history, watch patterns, and preferences
 */

console.log('[Soul Signature] Netflix scraper loaded');

let extractionInProgress = false;

/**
 * Extract Netflix viewing activity
 */
async function extractNetflixData() {
  if (extractionInProgress) {
    console.log('[Netflix] Extraction already in progress');
    return;
  }
  
  extractionInProgress = true;
  console.log('[Netflix] Starting data extraction...');
  
  try {
    const data = {
      currentlyWatching: extractCurrentlyWatching(),
      viewingActivity: await extractViewingActivity(),
      preferences: extractPreferences(),
      ratings: extractRatings(),
      timestamp: new Date().toISOString()
    };
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'NETFLIX_DATA',
      data
    }, (response) => {
      if (response?.success) {
        console.log('[Netflix] Data sent successfully');
      } else {
        console.error('[Netflix] Failed to send data');
      }
    });
    
  } catch (error) {
    console.error('[Netflix] Extraction error:', error);
  } finally {
    extractionInProgress = false;
  }
}

/**
 * Extract "Continue Watching" section
 */
function extractCurrentlyWatching() {
  console.log('[Netflix] Extracting currently watching...');
  
  const items = [];
  
  // Find "Continue Watching" row
  const rows = document.querySelectorAll('.lolomoRow, .rowContainer');
  
  for (const row of rows) {
    const title = row.querySelector('.rowTitle, .row-header-title');
    if (title && title.textContent.toLowerCase().includes('continue')) {
      // Extract items from this row
      const cards = row.querySelectorAll('.slider-item, .title-card');
      
      for (const card of cards) {
        const titleElement = card.querySelector('.fallback-text, .title-card-title');
        const imgElement = card.querySelector('img');
        const progressBar = card.querySelector('.progress, .progress-bar');
        
        if (titleElement) {
          items.push({
            title: titleElement.textContent.trim(),
            image: imgElement?.src || null,
            progress: progressBar ? parseFloat(progressBar.style.width) || 0 : 0,
            type: card.classList.contains('movie') ? 'movie' : 'series'
          });
        }
      }
      
      break;
    }
  }
  
  console.log(`[Netflix] Found ${items.length} items in Continue Watching`);
  return items;
}

/**
 * Extract viewing activity from Netflix page
 */
async function extractViewingActivity() {
  console.log('[Netflix] Extracting viewing activity...');
  
  // Check if we're on the viewing activity page
  if (!window.location.href.includes('/viewingactivity')) {
    // Navigate to viewing activity page
    console.log('[Netflix] Not on viewing activity page - navigating...');
    // Return empty for now - would need to navigate in real implementation
    return [];
  }
  
  const activities = [];
  const rows = document.querySelectorAll('.retableRow, .activity-row');
  
  for (const row of rows) {
    const titleElement = row.querySelector('.title, .activity-title');
    const dateElement = row.querySelector('.date, .activity-date');
    
    if (titleElement && dateElement) {
      activities.push({
        title: titleElement.textContent.trim(),
        date: dateElement.textContent.trim(),
        watched: new Date(dateElement.textContent.trim()).toISOString()
      });
    }
  }
  
  console.log(`[Netflix] Found ${activities.length} viewing activities`);
  return activities;
}

/**
 * Extract user preferences
 */
function extractPreferences() {
  console.log('[Netflix] Extracting preferences...');
  
  const preferences = {
    language: document.documentElement.lang || 'en',
    maturityLevel: null,
    audioPreferences: [],
    subtitlePreferences: []
  };
  
  // Try to extract from page metadata
  const metaData = document.querySelectorAll('meta');
  for (const meta of metaData) {
    const property = meta.getAttribute('property') || meta.getAttribute('name');
    if (property && property.includes('language')) {
      preferences.language = meta.getAttribute('content');
    }
  }
  
  return preferences;
}

/**
 * Extract ratings and liked content
 */
function extractRatings() {
  console.log('[Netflix] Extracting ratings...');
  
  const ratings = [];
  
  // Look for thumbs up/down indicators
  const ratedItems = document.querySelectorAll('[data-ui-tracking-context*="rating"]');
  
  for (const item of ratedItems) {
    const titleElement = item.querySelector('.title, .fallback-text');
    const ratingElement = item.querySelector('.thumb, .rating-thumb');
    
    if (titleElement && ratingElement) {
      ratings.push({
        title: titleElement.textContent.trim(),
        rating: ratingElement.classList.contains('thumb-up') ? 'like' : 'dislike'
      });
    }
  }
  
  console.log(`[Netflix] Found ${ratings.length} ratings`);
  return ratings;
}

/**
 * Observe DOM changes for dynamic content
 */
const observer = new MutationObserver((mutations) => {
  // Check if Continue Watching section loaded
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      const hasContinueWatching = Array.from(mutation.addedNodes).some(node => 
        node.textContent && node.textContent.toLowerCase().includes('continue')
      );
      
      if (hasContinueWatching && !extractionInProgress) {
        // Wait a bit for content to fully load
        setTimeout(extractNetflixData, 2000);
        break;
      }
    }
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial extraction after page load
window.addEventListener('load', () => {
  setTimeout(extractNetflixData, 3000);
});

// Also try immediate extraction if page already loaded
if (document.readyState === 'complete') {
  setTimeout(extractNetflixData, 2000);
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_NETFLIX') {
    extractNetflixData();
    sendResponse({ success: true });
  }
});
