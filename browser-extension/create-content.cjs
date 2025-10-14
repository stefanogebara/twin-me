const fs = require('fs');

const content = `/**
 * Soul Observer Content Script  
 * Captures behavioral events on every web page
 */

const BATCH_SIZE = 50;
const SESSION_TIMEOUT = 30 * 60 * 1000;

let eventBuffer = [];
let sessionId = null;
let isTracking = false;
let lastActivity = Date.now();

let typingState = { startTime: null, charCount: 0, corrections: 0, lastKeyTime: null };
let mouseState = { lastX: 0, lastY: 0, lastTime: Date.now() };
let scrollState = { lastY: 0, lastTime: Date.now() };
let focusState = { focusStart: null, totalFocusTime: 0 };

(function init() {
  chrome.storage.local.get(['soulObserverEnabled'], (data) => {
    isTracking = data.soulObserverEnabled !== false;
  });
  
  sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  setupEventListeners();
  startBatchSending();
})();

function setupEventListeners() {
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mousedown', handleMouseClick, true);
  document.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('focus', () => {
    if (!isTracking) return;
    focusState.focusStart = Date.now();
    captureEvent({ type: 'window_focus', data: { timestamp: Date.now() } });
  });
  window.addEventListener('blur', () => {
    if (!isTracking || !focusState.focusStart) return;
    const duration = Date.now() - focusState.focusStart;
    focusState.totalFocusTime += duration;
    captureEvent({ type: 'window_blur', data: { duration, totalFocusTime: focusState.totalFocusTime } });
    focusState.focusStart = null;
  });
}

function handleKeyDown(e) {
  if (!isTracking) return;
  const now = Date.now();
  if (!typingState.startTime) typingState.startTime = now;
  if (e.key === 'Backspace' || e.key === 'Delete') typingState.corrections++;
  if (e.key.length === 1) typingState.charCount++;
  typingState.lastKeyTime = now;
}

function handleKeyUp(e) {
  if (!isTracking || typingState.charCount === 0) return;
  const now = Date.now();
  const duration = now - typingState.startTime;
  captureEvent({
    type: 'typing',
    data: {
      chars: typingState.charCount,
      duration,
      corrections: typingState.corrections,
      isCorrection: e.key === 'Backspace' || e.key === 'Delete'
    }
  });
}

function handleMouseMove(e) {
  if (!isTracking) return;
  const now = Date.now();
  const timeDelta = now - mouseState.lastTime;
  if (timeDelta > 50) {
    const dx = e.clientX - mouseState.lastX;
    const dy = e.clientY - mouseState.lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 5) {
      captureEvent({
        type: 'mouse_move',
        data: { x: e.clientX, y: e.clientY, distance, speed: distance / (timeDelta / 1000) }
      });
      mouseState.lastX = e.clientX;
      mouseState.lastY = e.clientY;
      mouseState.lastTime = now;
    }
  }
}

function handleMouseClick(e) {
  if (!isTracking) return;
  captureEvent({
    type: 'mouse_click',
    data: { x: e.clientX, y: e.clientY, button: e.button, target: e.target.tagName.toLowerCase() }
  });
}

function handleScroll(e) {
  if (!isTracking) return;
  const now = Date.now();
  const timeDelta = now - scrollState.lastTime;
  if (timeDelta > 100) {
    const scrollY = window.scrollY;
    const distance = scrollY - scrollState.lastY;
    if (Math.abs(distance) > 10) {
      captureEvent({
        type: 'scroll',
        data: { y: scrollY, distance, direction: distance > 0 ? 'down' : 'up', speed: Math.abs(distance) / (timeDelta / 1000) }
      });
      scrollState.lastY = scrollY;
      scrollState.lastTime = now;
    }
  }
}

function captureEvent(event) {
  lastActivity = Date.now();
  eventBuffer.push({
    ...event,
    sessionId,
    url: window.location.href,
    pageTitle: document.title,
    timestamp: new Date().toISOString(),
    viewportSize: { width: window.innerWidth, height: window.innerHeight }
  });
  if (eventBuffer.length >= BATCH_SIZE) sendBatch();
}

function sendBatch() {
  if (eventBuffer.length === 0) return;
  const batch = [...eventBuffer];
  eventBuffer = [];
  chrome.runtime.sendMessage({ type: 'SOUL_OBSERVER_EVENT', data: batch }, (response) => {
    if (!response?.success) eventBuffer.unshift(...batch);
  });
}

function startBatchSending() {
  setInterval(() => {
    if (eventBuffer.length > 0) sendBatch();
    if (Date.now() - lastActivity > SESSION_TIMEOUT) {
      sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      lastActivity = Date.now();
    }
  }, 30000);
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.soulObserverEnabled) {
    isTracking = changes.soulObserverEnabled.newValue;
  }
});

console.log('[Soul Observer] Content script loaded');
`;

fs.writeFileSync('content.js', content);
console.log('content.js created');
