// StudySync Focus & Screen Time Companion - Background Service Worker (Manifest V3)
// Features:
// 1. Strict Focus Lock & Tab Auto-Return
// 2. Real-Time Automatic Screen Time Tracking with Domain Categorization
// 3. Active Distraction Website Blocking (Instagram, YouTube, Reddit, etc.)
// 4. Automated StudySync Server Telemetry Sync

const DEFAULT_BLOCKED_DOMAINS = [
  'instagram.com',
  'youtube.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'netflix.com',
  'twitch.tv',
  'facebook.com',
  'discord.com'
];

const DEFAULT_SETTINGS = {
  focusLockActive: false,
  studyTabId: null,
  studyWindowId: null,
  studyUrl: null,
  mode: 'Pomodoro',
  remainingSeconds: 1500,
  endTime: null,
  autoReturnEnabled: true,
  notificationsEnabled: true,
  distractionCount: 0,
  lastNotificationTime: 0,
  screenTimeTrackingEnabled: true,
  blockedDomains: DEFAULT_BLOCKED_DOMAINS,
  authToken: null,
  lastSyncTime: 0
};

// Domain Categorization Rules
const CATEGORY_RULES = {
  Study: [
    'github.com', 'gitlab.com', 'stackoverflow.com', 'stackexchange.com',
    'wikipedia.org', 'notion.so', 'coursera.org', 'edx.org', 'khanacademy.org',
    'leetcode.com', 'hackerrank.com', 'codecademy.com', 'chatgpt.com',
    'openai.com', 'claude.ai', 'gemini.google.com', 'docs.google.com',
    'drive.google.com', 'overleaf.com', 'arxiv.org', 'canvas.net',
    'instructure.com', 'blackboard.com', 'quizlet.com', 'chegg.com',
    'sciencedirect.com', 'jstor.org', 'nih.gov', 'ncbi.nlm.nih.gov',
    'duolingo.com', 'w3schools.com', 'developer.mozilla.org', 'localhost', '127.0.0.1'
  ],
  'Social Media': [
    'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'reddit.com',
    'tiktok.com', 'snapchat.com', 'linkedin.com', 'pinterest.com',
    'threads.net', 'tumblr.com', 'weibo.com'
  ],
  Entertainment: [
    'youtube.com', 'netflix.com', 'twitch.tv', 'disneyplus.com',
    'hulu.com', 'primevideo.com', 'spotify.com', 'crunchyroll.com',
    'vimeo.com', 'hotstar.com', 'max.com', 'hbomax.com', 'soundcloud.com'
  ],
  Gaming: [
    'roblox.com', 'steamcommunity.com', 'steampowered.com', 'chess.com',
    'lichess.org', 'epicgames.com', 'ign.com', 'discord.com', 'ea.com'
  ]
};

// Helper: Extract clean hostname
function extractDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (['chrome:', 'chrome-extension:', 'about:', 'edge:', 'devtools:'].includes(parsed.protocol)) {
      return null;
    }
    // Filter out StudySync internal pages
    if (parsed.pathname.includes('dashboard.html') || parsed.pathname.includes('index.html') || parsed.pathname.includes('auth.html')) {
      return null;
    }
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
      return null;
    }
    // Filter private local network IP ranges
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
      return null;
    }
    return host;
  } catch (e) {
    return null;
  }
}

// Helper: Determine category from domain
function categorizeDomain(domain) {
  if (!domain) return 'Other';
  if (domain.endsWith('.edu') || domain.endsWith('.ac.uk')) return 'Study';

  for (const [category, domains] of Object.entries(CATEGORY_RULES)) {
    if (domains.some(d => domain === d || domain.endsWith('.' + d))) {
      return category;
    }
  }
  return 'Other';
}

// Helper: Check if domain is in blocked list
function isDomainBlocked(domain, blockedList = []) {
  if (!domain) return false;
  return blockedList.some(b => domain === b || domain.endsWith('.' + b));
}

// Setup persistent tracking alarms
function setupCompanionAlarms() {
  chrome.alarms.create('screenTimeCommit', { periodInMinutes: 1 });
  chrome.alarms.create('telemetrySync', { periodInMinutes: 2 });
}

// Initialize settings upon install/update
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const initialized = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(initialized);
  setupCompanionAlarms();
  console.log('StudySync Focus & Screen Time Companion initialized.');
});

// Re-arm alarms on browser startup
chrome.runtime.onStartup.addListener(() => {
  setupCompanionAlarms();
});

// Helper: Show desktop distraction notification
async function showDistractionAlert(count, blockedSite = null) {
  const { lastNotificationTime = 0 } = await chrome.storage.local.get('lastNotificationTime');
  const now = Date.now();
  if (now - lastNotificationTime < 3000) return; // 3-second debounce

  await chrome.storage.local.set({ lastNotificationTime: now });

  const iconUrl = chrome.runtime.getURL('icons/icon-128.png');
  const siteText = blockedSite ? `Access to ${blockedSite} is blocked!` : 'Tab switching is restricted!';

  chrome.notifications.create(`studysync-distraction-${now}`, {
    type: 'basic',
    iconUrl,
    title: '🛑 StudySync Focus Shield Engaged!',
    message: `${siteText} Reverting to StudySync. (Attempt #${count})`,
    priority: 2,
    requireInteraction: false
  });
}

// ========================================================
// AUTOMATIC SCREEN TIME TRACKER ENGINE
// ========================================================
const KNOWN_SITE_NAMES = {
  'youtube.com': 'YouTube',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'stackoverflow.com': 'Stack Overflow',
  'stackexchange.com': 'Stack Exchange',
  'reddit.com': 'Reddit',
  'instagram.com': 'Instagram',
  'twitter.com': 'Twitter',
  'x.com': 'X (Twitter)',
  'facebook.com': 'Facebook',
  'linkedin.com': 'LinkedIn',
  'tiktok.com': 'TikTok',
  'snapchat.com': 'Snapchat',
  'pinterest.com': 'Pinterest',
  'threads.net': 'Threads',
  'leetcode.com': 'LeetCode',
  'hackerrank.com': 'HackerRank',
  'codecademy.com': 'Codecademy',
  'chatgpt.com': 'ChatGPT',
  'openai.com': 'OpenAI',
  'claude.ai': 'Claude AI',
  'gemini.google.com': 'Google Gemini',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'mail.google.com': 'Gmail',
  'google.com': 'Google Search',
  'wikipedia.org': 'Wikipedia',
  'notion.so': 'Notion',
  'coursera.org': 'Coursera',
  'edx.org': 'edX',
  'khanacademy.org': 'Khan Academy',
  'quizlet.com': 'Quizlet',
  'duolingo.com': 'Duolingo',
  'w3schools.com': 'W3Schools',
  'geeksforgeeks.org': 'GeeksforGeeks',
  'developer.mozilla.org': 'MDN Web Docs',
  'overleaf.com': 'Overleaf',
  'arxiv.org': 'arXiv',
  'netflix.com': 'Netflix',
  'spotify.com': 'Spotify',
  'twitch.tv': 'Twitch',
  'disneyplus.com': 'Disney+',
  'primevideo.com': 'Amazon Prime Video',
  'hulu.com': 'Hulu',
  'discord.com': 'Discord',
  'roblox.com': 'Roblox',
  'chess.com': 'Chess.com',
  'lichess.org': 'Lichess',
  'steampowered.com': 'Steam',
  'canvas.net': 'Canvas LMS',
  'instructure.com': 'Canvas LMS',
  'blackboard.com': 'Blackboard',
  'canva.com': 'Canva',
  'nexttoppers.com': 'Nexttoppers',
  'medium.com': 'Medium',
  'substack.com': 'Substack',
  'figma.com': 'Figma'
};

const GENERIC_PAGE_TITLES = new Set([
  'home', 'dashboard', 'index', 'welcome', 'login', 'sign in', 'signin', 'signup',
  'sign up', 'register', 'untitled', 'new tab', 'feed', 'watch', 'search', 'inbox',
  'profile', 'cart', 'checkout', 'settings', 'account', 'student portal', 'portal'
]);

function getFriendlySiteName(domain, title) {
  if (!domain) return 'General Activity';
  if (KNOWN_SITE_NAMES[domain]) return KNOWN_SITE_NAMES[domain];

  // Capitalize main domain part for clean fallback
  const parts = domain.split('.');
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  const brandFromDomain = name.charAt(0).toUpperCase() + name.slice(1);

  // Try extracting brand from title if clean and not generic
  if (title && typeof title === 'string' && title.length < 50 && !title.startsWith('http')) {
    const cleaned = title.split(' - ')[0].split(' | ')[0].split(' : ')[0].trim();
    const cleanedLower = cleaned.toLowerCase();
    if (cleaned.length > 2 && !GENERIC_PAGE_TITLES.has(cleanedLower) && !cleanedLower.startsWith('http')) {
      return cleaned;
    }
  }

  return brandFromDomain;
}

let isUserIdle = false;

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// Persist active tracking session across service worker restarts
async function getActiveTrackingSession() {
  try {
    const { activeTrackingSession } = await chrome.storage.local.get('activeTrackingSession');
    return activeTrackingSession || null;
  } catch (e) {
    return null;
  }
}

async function setActiveTrackingSession(session) {
  try {
    if (session) {
      await chrome.storage.local.set({ activeTrackingSession: session });
    } else {
      await chrome.storage.local.remove('activeTrackingSession');
    }
  } catch (e) {}
}

async function commitActiveTime(tabInfo = null) {
  const now = Date.now();
  const activeSession = await getActiveTrackingSession();

  const newDomain = typeof tabInfo === 'object' ? tabInfo?.domain : tabInfo;
  const newUrl = typeof tabInfo === 'object' ? tabInfo?.url : null;
  const newTitle = typeof tabInfo === 'object' ? tabInfo?.title : null;

  // Credit browsing time from previous session if valid
  if (activeSession && activeSession.domain && activeSession.timestamp) {
    const elapsedSeconds = Math.round((now - activeSession.timestamp) / 1000);
    // If tracking was active and elapsed time is realistic (between 1s and 10 mins)
    if (!isUserIdle && elapsedSeconds > 0 && elapsedSeconds < 600) {
      try {
        const todayStr = getTodayStr();
        const stored = await chrome.storage.local.get('screenTimeToday');
        let data = stored.screenTimeToday;

        if (!data || data.date !== todayStr) {
          data = {
            date: todayStr,
            categories: { Study: 0, 'Social Media': 0, Entertainment: 0, Gaming: 0, Other: 0 },
            domains: {},
            domainMeta: {}
          };
        }
        if (!data.domains) data.domains = {};
        if (!data.domainMeta) data.domainMeta = {};

        // Increment category seconds
        const cat = activeSession.category || categorizeDomain(activeSession.domain) || 'Other';
        data.categories[cat] = (data.categories[cat] || 0) + elapsedSeconds;

        // Increment domain seconds
        data.domains[activeSession.domain] = (data.domains[activeSession.domain] || 0) + elapsedSeconds;

        // Update domain metadata (Real Name & Real URL)
        const friendlyName = getFriendlySiteName(activeSession.domain, activeSession.title);
        data.domainMeta[activeSession.domain] = {
          name: friendlyName,
          url: activeSession.url || ('https://' + activeSession.domain),
          title: activeSession.title || friendlyName
        };

        await chrome.storage.local.set({ screenTimeToday: data });
      } catch (err) {
        console.warn('Error saving screen time metrics:', err);
      }
    }
  }

  // Set new active session in storage so it survives service worker sleep
  if (newDomain) {
    await setActiveTrackingSession({
      domain: newDomain,
      url: newUrl,
      title: newTitle,
      category: categorizeDomain(newDomain),
      timestamp: now
    });
  } else {
    await setActiveTrackingSession(null);
  }
}

// Detect idle state (pauses tracking if user steps away)
if (chrome.idle) {
  chrome.idle.setDetectionInterval(60); // 60 seconds of inactivity
  chrome.idle.onStateChanged.addListener(async (state) => {
    if (state === 'idle' || state === 'locked') {
      await commitActiveTime(null);
      isUserIdle = true;
    } else if (state === 'active') {
      isUserIdle = false;
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        const domain = extractDomain(activeTab.url);
        await commitActiveTime(domain ? { domain, url: activeTab.url, title: activeTab.title } : null);
      }
    }
  });
}

// Periodic Screen Time commit & Telemetry Sync
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'screenTimeCommit') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = tab?.url ? extractDomain(tab.url) : null;
    await commitActiveTime(domain ? { domain, url: tab.url, title: tab.title } : null);
  }

  if (alarm.name === 'telemetrySync') {
    await syncTelemetryToServer();
  }

  if (alarm.name === 'focusSessionAlarm') {
    await chrome.storage.local.set({ focusLockActive: false });
    await chrome.action.setBadgeText({ text: '' });

    const iconUrl = chrome.runtime.getURL('icons/icon-128.png');
    chrome.notifications.create('studysync-session-complete', {
      type: 'basic',
      iconUrl,
      title: '🎉 Focus Session Complete!',
      message: 'Great job maintaining strict focus! Focus Shield is now relaxed.',
      priority: 2
    });
  }
});

// Sync accumulated screen time telemetry to StudySync backend
async function syncTelemetryToServer(forceToken = null, forceServerUrl = null) {
  try {
    // 1. Commit active tab browsing time right before syncing
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) {
      const activeDomain = extractDomain(activeTab.url);
      if (activeDomain) {
        await commitActiveTime({ domain: activeDomain, url: activeTab.url, title: activeTab.title });
      }
    }

    const stored = await chrome.storage.local.get([
      'authToken',
      'serverUrl',
      'screenTimeToday',
      'lastSyncedMinutes'
    ]);

    let authToken = forceToken || stored.authToken;
    let serverUrl = forceServerUrl || stored.serverUrl || 'http://localhost:5000';
    let screenTimeToday = stored.screenTimeToday;
    const lastSyncedMinutes = stored.lastSyncedMinutes || {};

    // 2. Fallback: If authToken is not yet in storage, attempt to grab from an open StudySync tab
    if (!authToken) {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && (tab.url.includes('localhost') || tab.url.includes('127.0.0.1') || tab.url.includes('dashboard.html') || tab.url.includes('index.html'))) {
            if (chrome.scripting && chrome.scripting.executeScript) {
              const res = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                  token: localStorage.getItem('studysync_token'),
                  origin: window.location.origin
                })
              });
              if (res?.[0]?.result?.token) {
                authToken = res[0].result.token;
                serverUrl = res[0].result.origin || serverUrl;
                await chrome.storage.local.set({ authToken, serverUrl });
                break;
              }
            }
          }
        }
      } catch (scriptErr) {
        console.warn('Scripting fallback token check:', scriptErr.message);
      }
    }

    if (!authToken) {
      console.warn('StudySync Telemetry Sync: No authToken found. Ensure user is logged into StudySync.');
      return { success: false, reason: 'NOT_AUTHENTICATED', message: 'Please sign into StudySync first.' };
    }

    if (!screenTimeToday || !screenTimeToday.domains) {
      return { success: true, count: 0, message: 'No browsing activity recorded today.' };
    }

    const todayStr = getTodayStr();
    if (screenTimeToday.date !== todayStr) return { success: true, count: 0, message: 'Date mismatch.' };

    // Build event list for newly accumulated minutes per domain
    const events = [];
    const updatedSyncRecord = { ...lastSyncedMinutes };
    const domainMeta = screenTimeToday.domainMeta || {};

    for (const [domain, seconds] of Object.entries(screenTimeToday.domains)) {
      // Any recorded domain browsing of 5 seconds or more gets recorded (at least 1 minute)
      const totalMinutes = Math.floor(seconds / 60);
      const effectiveMinutes = totalMinutes > 0 ? totalMinutes : (seconds >= 5 ? 1 : 0);
      const previouslySynced = updatedSyncRecord[domain] || 0;
      const newMinutes = effectiveMinutes - previouslySynced;

      if (newMinutes > 0) {
        const category = categorizeDomain(domain);
        const meta = domainMeta[domain] || {};
        const realName = meta.name || getFriendlySiteName(domain);
        const realUrl = meta.url || ('https://' + domain);

        events.push({
          site: realName,
          url: realUrl,
          category,
          minutes: newMinutes,
          date: todayStr
        });
        updatedSyncRecord[domain] = effectiveMinutes;
      }
    }

    if (events.length === 0) {
      return { success: true, count: 0, message: 'All browsing activity is already up to date.' };
    }

    const endpoint = `${serverUrl.replace(/\/+$/, '')}/api/screentime/telemetry`;
    console.log(`StudySync Sync: Posting ${events.length} telemetry records to ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ events })
    });

    if (response.ok) {
      await chrome.storage.local.set({
        lastSyncedMinutes: updatedSyncRecord,
        lastSyncTime: Date.now()
      });
      console.log(`StudySync Sync: Successfully ingested ${events.length} records.`);
      return { success: true, count: events.length, message: `Successfully synced ${events.length} sites.` };
    } else {
      const errorText = await response.text();
      console.warn(`StudySync Telemetry Sync Error HTTP ${response.status}:`, errorText);
      if (response.status === 401) {
        await chrome.storage.local.remove('authToken');
      }
      return { success: false, status: response.status, error: errorText };
    }
  } catch (err) {
    console.error('StudySync Telemetry Sync Exception:', err);
    return { success: false, error: err.message };
  }
}

// ========================================================
// ACTIVE DISTRACTION BLOCKER & TAB INTERCEPTOR
// ========================================================

// Check tab and block if distraction site during active focus session
async function inspectAndBlockTab(tabId, url) {
  try {
    const domain = extractDomain(url);
    if (!domain) return false;

    const data = await chrome.storage.local.get([
      'focusLockActive',
      'blockedDomains',
      'distractionCount',
      'autoReturnEnabled',
      'studyTabId',
      'studyWindowId',
      'notificationsEnabled'
    ]);

    const {
      focusLockActive = false,
      blockedDomains = DEFAULT_BLOCKED_DOMAINS,
      distractionCount = 0,
      autoReturnEnabled = true,
      studyTabId,
      studyWindowId,
      notificationsEnabled = true
    } = data;

    if (!focusLockActive) return false;

    // Check if target domain matches the blocklist
    if (isDomainBlocked(domain, blockedDomains)) {
      const newCount = distractionCount + 1;
      await chrome.storage.local.set({ distractionCount: newCount });

      // 1. Redirect tab to StudySync Focus Shield block page
      const blockUrl = chrome.runtime.getURL(
        `block.html?domain=${encodeURIComponent(domain)}&attempt=${newCount}`
      );
      await chrome.tabs.update(tabId, { url: blockUrl });

      // 2. Send desktop alert notification
      if (notificationsEnabled) {
        await showDistractionAlert(newCount, domain);
      }

      // 3. Optionally refocus StudySync study tab
      if (autoReturnEnabled && studyTabId) {
        try {
          await chrome.tabs.update(studyTabId, { active: true });
          if (studyWindowId) {
            await chrome.windows.update(studyWindowId, { focused: true });
          }
        } catch (e) {}
      }

      return true; // Intercepted
    }

    return false;
  } catch (err) {
    console.error('Error inspecting tab:', err);
    return false;
  }
}

// Intercept Tab Activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = extractDomain(tab.url);

    // 1. Commit active screen time
    await commitActiveTime(domain ? { domain, url: tab.url, title: tab.title } : null);

    // 2. Check for blocked distracting site during focus
    const blocked = await inspectAndBlockTab(activeInfo.tabId, tab.url);
    if (blocked) return;

    // 3. Strict Tab Lock return logic (if user switched away from Study tab)
    const { focusLockActive, autoReturnEnabled, studyTabId, studyWindowId, distractionCount = 0, notificationsEnabled = true } =
      await chrome.storage.local.get([
        'focusLockActive',
        'autoReturnEnabled',
        'studyTabId',
        'studyWindowId',
        'distractionCount',
        'notificationsEnabled'
      ]);

    if (focusLockActive && autoReturnEnabled && studyTabId && activeInfo.tabId !== studyTabId) {
      const newCount = distractionCount + 1;
      await chrome.storage.local.set({ distractionCount: newCount });

      await chrome.tabs.update(studyTabId, { active: true });
      if (studyWindowId) {
        try {
          await chrome.windows.update(studyWindowId, { focused: true, drawAttention: true });
        } catch (e) {}
      }

      if (notificationsEnabled) {
        await showDistractionAlert(newCount);
      }

      try {
        await chrome.tabs.sendMessage(studyTabId, {
          type: 'STUDYSYNC_DISTRACTION_INTERCEPTED',
          count: newCount
        });
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error in onActivated:', err);
  }
});

// Intercept Tab Navigation / URL Updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Check if navigating to a blocked site during focus session
    const blocked = await inspectAndBlockTab(tabId, changeInfo.url);
    if (blocked) return;

    // If active tab URL changed, update screen time tracking domain
    if (tab.active) {
      const activeUrl = tab.url || changeInfo.url;
      const domain = extractDomain(activeUrl);
      await commitActiveTime(domain ? { domain, url: activeUrl, title: tab.title } : null);
    }
  }
});

// Intercept Window Focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  try {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await commitActiveTime(null);
      return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    const domain = activeTab?.url ? extractDomain(activeTab.url) : null;
    await commitActiveTime(domain ? { domain, url: activeTab.url, title: activeTab.title } : null);

    const { focusLockActive, studyWindowId, studyTabId, autoReturnEnabled, distractionCount = 0, notificationsEnabled = true } =
      await chrome.storage.local.get([
        'focusLockActive',
        'studyWindowId',
        'studyTabId',
        'autoReturnEnabled',
        'distractionCount',
        'notificationsEnabled'
      ]);

    if (focusLockActive && autoReturnEnabled && studyWindowId && windowId !== studyWindowId) {
      const newCount = distractionCount + 1;
      await chrome.storage.local.set({ distractionCount: newCount });

      try {
        await chrome.windows.update(studyWindowId, { focused: true, drawAttention: true });
        if (studyTabId) {
          await chrome.tabs.update(studyTabId, { active: true });
        }
      } catch (e) {}

      if (notificationsEnabled) {
        await showDistractionAlert(newCount);
      }
    }
  } catch (err) {
    console.error('Error in window focus changed:', err);
  }
});

// ========================================================
// RUNTIME MESSAGE CONTROLLER
// ========================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const type = message.type;

      if (type === 'PING') {
        const state = await chrome.storage.local.get([
          'focusLockActive',
          'mode',
          'remainingSeconds',
          'distractionCount',
          'autoReturnEnabled',
          'notificationsEnabled',
          'blockedDomains',
          'lastSyncTime'
        ]);
        sendResponse({ success: true, ...state, isExtension: true });
        return;
      }

      if (type === 'FOCUS_START') {
        const tabId = sender.tab ? sender.tab.id : message.tabId;
        const windowId = sender.tab ? sender.tab.windowId : message.windowId;
        const seconds = message.remainingSeconds || (message.durationMinutes ? message.durationMinutes * 60 : 1500);
        const endTime = Date.now() + (seconds * 1000);

        await chrome.storage.local.set({
          focusLockActive: true,
          studyTabId: tabId,
          studyWindowId: windowId,
          studyUrl: sender.tab ? sender.tab.url : null,
          mode: message.mode || 'Pomodoro',
          remainingSeconds: seconds,
          endTime,
          distractionCount: 0
        });

        await chrome.action.setBadgeText({ text: 'LOCK' });
        await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });

        await chrome.alarms.clear('focusSessionAlarm');
        chrome.alarms.create('focusSessionAlarm', { when: endTime });

        sendResponse({ success: true, locked: true });
        return;
      }

      if (type === 'FOCUS_STOP' || type === 'FOCUS_PAUSE' || type === 'FOCUS_COMPLETE') {
        await chrome.storage.local.set({ focusLockActive: false });
        await chrome.action.setBadgeText({ text: '' });
        await chrome.alarms.clear('focusSessionAlarm');

        // Trigger telemetry sync on session completion
        await syncTelemetryToServer();

        sendResponse({ success: true, locked: false });
        return;
      }

      if (type === 'FOCUS_TICK') {
        if (typeof message.remainingSeconds === 'number') {
          await chrome.storage.local.set({ remainingSeconds: message.remainingSeconds });
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'PING') {
        if (message.token || message.serverUrl) {
          const updates = {};
          if (message.token) updates.authToken = message.token;
          if (message.serverUrl) updates.serverUrl = message.serverUrl;
          await chrome.storage.local.set(updates);
        }
        sendResponse({ success: true, version: '1.2.0' });
        return;
      }

      if (type === 'SYNC_AUTH_TOKEN') {
        if (message.token) {
          const updates = { authToken: message.token };
          if (message.serverUrl) updates.serverUrl = message.serverUrl;
          await chrome.storage.local.set(updates);
          const syncRes = await syncTelemetryToServer(message.token, message.serverUrl);
          sendResponse({ success: true, count: syncRes.count });
        } else {
          sendResponse({ success: true });
        }
        return;
      }

      if (type === 'GET_SCREEN_TIME') {
        const todayStr = getTodayStr();
        const stored = await chrome.storage.local.get('screenTimeToday');
        let data = stored.screenTimeToday;

        if (!data || data.date !== todayStr) {
          data = {
            date: todayStr,
            categories: { Study: 0, 'Social Media': 0, Entertainment: 0, Gaming: 0, Other: 0 },
            domains: {}
          };
        }

        sendResponse({ success: true, screenTime: data });
        return;
      }

      if (type === 'GET_BLOCKLIST') {
        const { blockedDomains = DEFAULT_BLOCKED_DOMAINS } = await chrome.storage.local.get('blockedDomains');
        sendResponse({ success: true, blockedDomains });
        return;
      }

      if (type === 'UPDATE_BLOCKLIST') {
        if (Array.isArray(message.blockedDomains)) {
          await chrome.storage.local.set({ blockedDomains: message.blockedDomains });
        }
        sendResponse({ success: true });
        return;
      }

      if (type === 'FORCE_TELEMETRY_SYNC') {
        if (message.token || message.serverUrl) {
          const updates = {};
          if (message.token) updates.authToken = message.token;
          if (message.serverUrl) updates.serverUrl = message.serverUrl;
          await chrome.storage.local.set(updates);
        }
        const syncRes = await syncTelemetryToServer(message.token, message.serverUrl);
        sendResponse(syncRes);
        return;
      }

      if (type === 'RELOAD_EXTENSION') {
        sendResponse({ success: true });
        setTimeout(() => {
          try {
            chrome.runtime.reload();
          } catch (e) {}
        }, 150);
        return;
      }

      if (type === 'EMERGENCY_UNLOCK') {
        await chrome.storage.local.set({ focusLockActive: false });
        await chrome.action.setBadgeText({ text: '' });
        await chrome.alarms.clear('focusSessionAlarm');

        const { studyTabId } = await chrome.storage.local.get('studyTabId');
        if (studyTabId) {
          try {
            await chrome.tabs.sendMessage(studyTabId, { type: 'STUDYSYNC_REMOTE_PAUSE' });
          } catch (e) {}
        }

        sendResponse({ success: true, unlocked: true });
        return;
      }

      sendResponse({ success: false, error: 'Unknown message type' });
    } catch (err) {
      console.error('Error handling message:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
