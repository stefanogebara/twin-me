/**
 * Extension Auth Page Content Script
 * Listens for auth messages from the web page and forwards to service worker
 */

console.log('[Extension Auth Listener] ✅ Content script loaded on:', window.location.href);
console.log('[Extension Auth Listener] Chrome runtime available:', !!chrome.runtime);
console.log('[Extension Auth Listener] Extension ID:', chrome.runtime?.id);

// Listen for messages from the web page
window.addEventListener('message', (event) => {
  // Only accept messages from our own window
  if (event.source !== window) {
    console.log('[Extension Auth Listener] ⚠️ Ignored message from different source');
    return;
  }

  console.log('[Extension Auth Listener] 📨 Received message:', event.data);

  if (event.data.type === 'TWIN_AI_EXTENSION_AUTH') {
    console.log('[Extension Auth Listener] 🔑 Auth message detected! Data:', event.data.data);
    console.log('[Extension Auth Listener] 📤 Forwarding to service worker...');

    // Forward to service worker
    chrome.runtime.sendMessage({
      type: 'EXTENSION_AUTH_SUCCESS',
      data: event.data.data
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Extension Auth Listener] ❌ Error sending to service worker:', chrome.runtime.lastError);
        window.postMessage({
          type: 'TWIN_AI_EXTENSION_AUTH_RECEIVED',
          success: false,
          error: chrome.runtime.lastError.message
        }, window.location.origin);
        return;
      }

      console.log('[Extension Auth Listener] ✅ Service worker response:', response);

      // Send confirmation back to the web page
      window.postMessage({
        type: 'TWIN_AI_EXTENSION_AUTH_RECEIVED',
        success: response?.success || false
      }, window.location.origin);

      console.log('[Extension Auth Listener] 📬 Confirmation sent back to page');
    });
  }
});

console.log('[Extension Auth Listener] 👂 Now listening for auth messages on window.postMessage');
