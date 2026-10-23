// StudySync Focus & Screen Time Companion - Content Script (Manifest V3)
// Bridges communication between StudySync web application and background extension service worker.

(function () {
  // Check if this page is a StudySync web app instance
  function isStudySyncInstance() {
    return Boolean(
      document.querySelector('meta[name="studysync-app"]') ||
      document.title.includes('StudySync') ||
      window.location.pathname.includes('dashboard.html') ||
      window.location.pathname.includes('index.html') ||
      window.location.pathname.includes('auth.html') ||
      document.getElementById('studysync-root') ||
      document.querySelector('.brand')
    );
  }

  // If not a StudySync page, do not attach listeners
  if (!isStudySyncInstance()) {
    return;
  }

  // Mark DOM so the webpage knows the companion extension is installed
  document.documentElement.setAttribute('data-studysync-extension-installed', 'true');

  // Automatically synchronize user authentication token with extension for telemetry sync
  function syncAuthToken() {
    try {
      const token = localStorage.getItem('studysync_token');
      if (token) {
        chrome.runtime.sendMessage({
          type: 'SYNC_AUTH_TOKEN',
          token,
          serverUrl: window.location.origin
        });
      }
    } catch (e) {}
  }

  // Broadcast extension availability to the web page
  function announceExtension() {
    window.postMessage({
      source: 'studysync-extension',
      type: 'EXTENSION_AVAILABLE',
      version: '1.2.0',
      capabilities: [
        'hard-tab-lock',
        'auto-return',
        'window-guard',
        'desktop-notifications',
        'automatic-screentime-tracking',
        'active-distraction-blocking'
      ]
    }, '*');

    syncAuthToken();
  }

  // Announce immediately and when DOM is loaded
  announceExtension();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceExtension);
  }

  // Listen for login/logout in other tabs or current page
  window.addEventListener('storage', (e) => {
    if (e.key === 'studysync_token') {
      syncAuthToken();
    }
  });

  // Listen to messages from the StudySync web app
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window || !event.data || event.data.source !== 'studysync-web') {
      return;
    }

    const { type, payload } = event.data;

    if (type === 'PING') {
      chrome.runtime.sendMessage({
        type: 'PING',
        token: payload?.token || localStorage.getItem('studysync_token'),
        serverUrl: payload?.serverUrl || window.location.origin
      }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            source: 'studysync-extension',
            type: 'PING_RESPONSE',
            connected: false,
            error: chrome.runtime.lastError.message
          }, '*');
          return;
        }
        window.postMessage({
          source: 'studysync-extension',
          type: 'PING_RESPONSE',
          connected: true,
          data: response
        }, '*');
      });
      return;
    }

    if (type === 'FOCUS_START') {
      chrome.runtime.sendMessage({
        type: 'FOCUS_START',
        durationMinutes: payload?.durationMinutes || 25,
        remainingSeconds: payload?.remainingSeconds || 1500,
        mode: payload?.mode || 'Pomodoro'
      }, (response) => {
        window.postMessage({
          source: 'studysync-extension',
          type: 'FOCUS_START_ACK',
          success: !chrome.runtime.lastError && response?.success,
          locked: response?.locked
        }, '*');
      });
      return;
    }

    if (type === 'FOCUS_STOP' || type === 'FOCUS_PAUSE' || type === 'FOCUS_COMPLETE') {
      chrome.runtime.sendMessage({ type: 'FOCUS_STOP' }, (response) => {
        window.postMessage({
          source: 'studysync-extension',
          type: 'FOCUS_STOP_ACK',
          success: !chrome.runtime.lastError && response?.success
        }, '*');
      });
      return;
    }

    if (type === 'FOCUS_TICK') {
      chrome.runtime.sendMessage({
        type: 'FOCUS_TICK',
        remainingSeconds: payload?.remainingSeconds
      });
      return;
    }

    if (type === 'GET_SCREEN_TIME') {
      chrome.runtime.sendMessage({ type: 'GET_SCREEN_TIME' }, (response) => {
        window.postMessage({
          source: 'studysync-extension',
          type: 'SCREEN_TIME_RESPONSE',
          success: !chrome.runtime.lastError && response?.success,
          screenTime: response?.screenTime
        }, '*');
      });
      return;
    }

    if (type === 'FORCE_TELEMETRY_SYNC') {
      const token = payload?.token || localStorage.getItem('studysync_token');
      const serverUrl = payload?.serverUrl || window.location.origin;

      chrome.runtime.sendMessage({
        type: 'FORCE_TELEMETRY_SYNC',
        token,
        serverUrl
      }, (response) => {
        window.postMessage({
          source: 'studysync-extension',
          type: 'TELEMETRY_SYNC_ACK',
          success: !chrome.runtime.lastError && response?.success,
          count: response?.count,
          error: response?.error || (chrome.runtime.lastError ? chrome.runtime.lastError.message : null)
        }, '*');
      });
      return;
    }

    if (type === 'RELOAD_EXTENSION') {
      chrome.runtime.sendMessage({ type: 'RELOAD_EXTENSION' }, (response) => {
        window.postMessage({
          source: 'studysync-extension',
          type: 'RELOAD_EXTENSION_ACK',
          success: !chrome.runtime.lastError && response?.success
        }, '*');
      });
      return;
    }
  });

  // Listen for messages from background service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STUDYSYNC_DISTRACTION_INTERCEPTED') {
      window.postMessage({
        source: 'studysync-extension',
        type: 'DISTRACTION_INTERCEPTED',
        count: message.count
      }, '*');
    }

    if (message.type === 'STUDYSYNC_REMOTE_PAUSE') {
      window.postMessage({
        source: 'studysync-extension',
        type: 'REMOTE_PAUSE'
      }, '*');
    }
  });
})();
