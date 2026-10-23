// StudySync Focus Shield - Block Page Controller

document.addEventListener('DOMContentLoaded', async () => {
  const domainEl = document.getElementById('blocked-domain');
  const timerEl = document.getElementById('block-timer');
  const attemptCountEl = document.getElementById('attempt-count');
  const returnBtn = document.getElementById('return-studysync-btn');
  const closeBtn = document.getElementById('close-tab-btn');
  const emergencyPauseLink = document.getElementById('emergency-pause-link');

  // Parse URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const domain = urlParams.get('domain') || 'This Website';
  const attempt = urlParams.get('attempt') || '1';

  if (domainEl) domainEl.innerText = domain;
  if (attemptCountEl) attemptCountEl.innerText = attempt;

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Fetch initial background state
  async function syncState() {
    try {
      const state = await chrome.storage.local.get([
        'focusLockActive',
        'remainingSeconds',
        'distractionCount',
        'studyTabId',
        'studyWindowId'
      ]);

      if (!state.focusLockActive) {
        // If focus session ended, allow navigation or return
        if (timerEl) timerEl.innerText = '00:00';
        return;
      }

      if (timerEl && typeof state.remainingSeconds === 'number') {
        timerEl.innerText = formatTime(state.remainingSeconds);
      }

      if (attemptCountEl && state.distractionCount) {
        attemptCountEl.innerText = String(state.distractionCount);
      }
    } catch (e) {
      console.warn('Error reading extension state:', e);
    }
  }

  await syncState();

  // Listen for timer ticks / storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.remainingSeconds && timerEl) {
        timerEl.innerText = formatTime(changes.remainingSeconds.newValue);
      }
      if (changes.distractionCount && attemptCountEl) {
        attemptCountEl.innerText = String(changes.distractionCount.newValue);
      }
      if (changes.focusLockActive && changes.focusLockActive.newValue === false) {
        if (timerEl) timerEl.innerText = 'Unlocked ✓';
      }
    }
  });

  // Action: Return to StudySync
  if (returnBtn) {
    returnBtn.addEventListener('click', async () => {
      try {
        const { studyTabId, studyWindowId } = await chrome.storage.local.get(['studyTabId', 'studyWindowId']);
        
        let tabFound = false;
        if (studyTabId) {
          try {
            await chrome.tabs.update(studyTabId, { active: true });
            if (studyWindowId) {
              await chrome.windows.update(studyWindowId, { focused: true });
            }
            tabFound = true;
          } catch (tabErr) {}
        }

        if (!tabFound) {
          // Open StudySync dashboard
          await chrome.tabs.create({ url: 'http://localhost:5000/dashboard.html' });
        }

        // Close this blocked tab
        const currentTab = await chrome.tabs.getCurrent();
        if (currentTab?.id) {
          chrome.tabs.remove(currentTab.id);
        }
      } catch (err) {
        console.error('Failed to return to StudySync:', err);
      }
    });
  }

  // Action: Close this tab
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab?.id) {
        chrome.tabs.remove(currentTab.id);
      } else {
        window.close();
      }
    });
  }

  // Action: Emergency Pause
  if (emergencyPauseLink) {
    emergencyPauseLink.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to pause your focus session and release the Focus Shield?')) {
        chrome.runtime.sendMessage({ type: 'EMERGENCY_UNLOCK' }, () => {
          window.location.reload();
        });
      }
    });
  }
});
