// StudySync Focus & Screen Time Companion - Popup Controller (Manifest V3)

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const pane = document.getElementById(`pane-${target}`);
      if (pane) pane.classList.add('active');

      if (target === 'screentime') loadScreenTimeData();
      if (target === 'blocklist') loadBlocklist();
    });
  });

  // Tab 1 Elements: Focus Shield
  const statusPill = document.getElementById('status-pill');
  const popupTimer = document.getElementById('popup-timer');
  const statusDesc = document.getElementById('status-description');
  const distractionCountEl = document.getElementById('distraction-count');
  const iconStandby = document.getElementById('icon-standby');
  const iconLocked = document.getElementById('icon-locked');
  const statusCard = document.getElementById('status-card');
  const statusIconBox = document.getElementById('status-icon-box');

  const toggleAutoReturn = document.getElementById('toggle-auto-return');
  const toggleNotifications = document.getElementById('toggle-notifications');

  const openStudySyncBtn = document.getElementById('open-studysync-btn');
  const emergencyUnlockBtn = document.getElementById('emergency-unlock-btn');

  // Tab 2 Elements: Screen Time
  const stTotalBadge = document.getElementById('st-total-badge');
  const categoryBarsContainer = document.getElementById('category-bars-container');
  const topSitesContainer = document.getElementById('top-sites-container');
  const syncServerBtn = document.getElementById('sync-server-btn');
  const syncStatusMsg = document.getElementById('sync-status-msg');

  // Tab 3 Elements: Blocklist
  const addDomainForm = document.getElementById('add-domain-form');
  const newDomainInput = document.getElementById('new-domain-input');
  const domainsListContainer = document.getElementById('domains-list-container');
  const resetBlocklistBtn = document.getElementById('reset-blocklist-btn');

  // Format seconds to MM:SS
  function formatSeconds(secs) {
    if (typeof secs !== 'number' || isNaN(secs) || secs < 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Format seconds into "Xh Ym" or "Xm"
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 60) return '< 1m';
    const mins = Math.floor(totalSeconds / 60);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) {
      return `${hours}h ${remMins}m`;
    }
    return `${mins}m`;
  }

  // Render Focus Shield State
  function renderFocusState(state) {
    const isLocked = Boolean(state.focusLockActive);
    const count = state.distractionCount || 0;
    const remaining = state.remainingSeconds;
    const mode = state.mode || 'Pomodoro';

    if (distractionCountEl) {
      distractionCountEl.innerText = String(count);
    }

    if (isLocked) {
      statusPill.innerText = 'Shield Active';
      statusPill.className = 'pill pill-locked';

      statusCard.classList.add('locked-border');
      statusIconBox.classList.add('locked-icon');

      iconStandby.style.display = 'none';
      iconLocked.style.display = 'block';

      popupTimer.innerText = formatSeconds(remaining);
      statusDesc.innerText = `🔒 Focus Shield ACTIVE (${mode}). Distracting websites and tab switching are blocked.`;

      emergencyUnlockBtn.style.display = 'inline-flex';
    } else {
      statusPill.innerText = 'Standby';
      statusPill.className = 'pill pill-standby';

      statusCard.classList.remove('locked-border');
      statusIconBox.classList.remove('locked-icon');

      iconStandby.style.display = 'block';
      iconLocked.style.display = 'none';

      popupTimer.innerText = '--:--';
      statusDesc.innerText = 'Start a timer in StudySync to engage Hard Tab Lock & Distraction Blocker.';

      emergencyUnlockBtn.style.display = 'none';
    }

    if (typeof state.autoReturnEnabled === 'boolean') {
      toggleAutoReturn.checked = state.autoReturnEnabled;
    }
    if (typeof state.notificationsEnabled === 'boolean') {
      toggleNotifications.checked = state.notificationsEnabled;
    }
  }

  // ========================================================
  // SCREEN TIME TELEMETRY RENDERING
  // ========================================================
  async function loadScreenTimeData() {
    try {
      chrome.runtime.sendMessage({ type: 'GET_SCREEN_TIME' }, (res) => {
        if (!res || !res.success || !res.screenTime) return;

        const data = res.screenTime;
        const categories = data.categories || {};
        const domains = data.domains || {};

        let totalSeconds = 0;
        Object.values(categories).forEach(secs => totalSeconds += secs);

        if (stTotalBadge) {
          stTotalBadge.innerText = `${formatDuration(totalSeconds)} Total`;
        }

        // Render Category Progress Bars
        if (categoryBarsContainer) {
          categoryBarsContainer.innerHTML = '';
          const categoryMeta = [
            { key: 'Study', label: '📘 Study / Productive', class: 'fill-study' },
            { key: 'Social Media', label: '💬 Social Media', class: 'fill-social' },
            { key: 'Entertainment', label: '🍿 Entertainment', class: 'fill-entertainment' },
            { key: 'Gaming', label: '🎮 Gaming', class: 'fill-gaming' },
            { key: 'Other', label: '🌐 Other Browsing', class: 'fill-other' }
          ];

          categoryMeta.forEach(cat => {
            const secs = categories[cat.key] || 0;
            const pct = totalSeconds > 0 ? Math.round((secs / totalSeconds) * 100) : 0;

            const item = document.createElement('div');
            item.className = 'cat-bar-item';
            item.innerHTML = `
              <div class="cat-label-row">
                <span>${cat.label}</span>
                <span>${formatDuration(secs)} (${pct}%)</span>
              </div>
              <div class="track-bg">
                <div class="fill-bar ${cat.class}" style="width: ${pct}%;"></div>
              </div>
            `;
            categoryBarsContainer.appendChild(item);
          });
        }

        // Render Top Visited Sites
        if (topSitesContainer) {
          topSitesContainer.innerHTML = '';
          const sortedDomains = Object.entries(domains).sort((a, b) => b[1] - a[1]);

          if (sortedDomains.length === 0) {
            topSitesContainer.innerHTML = '<div class="empty-hint">Browsing stats will appear as you visit websites.</div>';
          } else {
            sortedDomains.slice(0, 5).forEach(([domain, secs]) => {
              const row = document.createElement('div');
              row.className = 'site-row';
              row.innerHTML = `
                <span class="domain" title="${domain}">${domain}</span>
                <strong>${formatDuration(secs)}</strong>
              `;
              topSitesContainer.appendChild(row);
            });
          }
        }
      });
    } catch (err) {
      console.warn('Error loading screen time:', err);
    }
  }

  // Sync Telemetry Button
  if (syncServerBtn) {
    syncServerBtn.addEventListener('click', () => {
      syncStatusMsg.innerText = 'Syncing telemetry with StudySync server...';
      chrome.runtime.sendMessage({ type: 'FORCE_TELEMETRY_SYNC' }, (res) => {
        if (res?.success) {
          syncStatusMsg.innerText = res.count > 0 
            ? `✓ Synced ${res.count} site${res.count === 1 ? '' : 's'} with StudySync!`
            : '✓ Browsing telemetry is already up to date.';
          syncStatusMsg.style.color = '#34d399';
          loadScreenTimeData(); // Refresh popup metrics immediately
        } else if (res?.reason === 'NOT_AUTHENTICATED') {
          syncStatusMsg.innerText = '⚠️ Please sign into StudySync first.';
          syncStatusMsg.style.color = '#f59e0b';
        } else {
          syncStatusMsg.innerText = res?.error || 'Could not sync. Ensure StudySync server is running.';
          syncStatusMsg.style.color = '#f87171';
        }
        setTimeout(() => {
          syncStatusMsg.innerText = 'Auto-syncs every 2 minutes';
          syncStatusMsg.style.color = '#94a3b8';
        }, 4500);
      });
    });
  }

  // ========================================================
  // DISTRACTION BLOCKLIST RENDERING
  // ========================================================
  let currentBlocklist = [];

  function loadBlocklist() {
    chrome.runtime.sendMessage({ type: 'GET_BLOCKLIST' }, (res) => {
      if (res?.success && Array.isArray(res.blockedDomains)) {
        currentBlocklist = res.blockedDomains;
        renderBlocklist();
      }
    });
  }

  function renderBlocklist() {
    if (!domainsListContainer) return;
    domainsListContainer.innerHTML = '';

    if (currentBlocklist.length === 0) {
      domainsListContainer.innerHTML = '<div class="empty-hint">No sites blocked. Add domains above.</div>';
      return;
    }

    currentBlocklist.forEach((domain, index) => {
      const chip = document.createElement('div');
      chip.className = 'domain-chip';
      chip.innerHTML = `
        <span>🚫 ${domain}</span>
        <button class="btn-del-domain" data-index="${index}" title="Remove domain">✕</button>
      `;
      domainsListContainer.appendChild(chip);
    });

    // Wire delete buttons
    domainsListContainer.querySelectorAll('.btn-del-domain').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (!isNaN(idx)) {
          currentBlocklist.splice(idx, 1);
          chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKLIST', blockedDomains: currentBlocklist }, () => {
            renderBlocklist();
          });
        }
      });
    });
  }

  // Add Domain
  if (addDomainForm) {
    addDomainForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = newDomainInput.value.trim().toLowerCase();
      if (!val) return;

      // Clean domain formatting
      const cleanDomain = val.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (cleanDomain && !currentBlocklist.includes(cleanDomain)) {
        currentBlocklist.unshift(cleanDomain);
        chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKLIST', blockedDomains: currentBlocklist }, () => {
          renderBlocklist();
          newDomainInput.value = '';
        });
      }
    });
  }

  // Reset Blocklist Defaults
  if (resetBlocklistBtn) {
    resetBlocklistBtn.addEventListener('click', () => {
      const defaults = [
        'instagram.com', 'youtube.com', 'reddit.com', 'twitter.com',
        'x.com', 'tiktok.com', 'netflix.com', 'twitch.tv', 'facebook.com', 'discord.com'
      ];
      currentBlocklist = defaults;
      chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKLIST', blockedDomains: defaults }, () => {
        renderBlocklist();
      });
    });
  }

  // ========================================================
  // INITIAL LOAD & STORAGE LISTENER
  // ========================================================
  const state = await chrome.storage.local.get([
    'focusLockActive',
    'mode',
    'remainingSeconds',
    'distractionCount',
    'autoReturnEnabled',
    'notificationsEnabled'
  ]);
  renderFocusState(state);

  // Live-sync state changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      chrome.storage.local.get([
        'focusLockActive',
        'mode',
        'remainingSeconds',
        'distractionCount',
        'autoReturnEnabled',
        'notificationsEnabled'
      ]).then(renderFocusState);
    }
  });

  // Settings Toggles
  toggleAutoReturn.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { autoReturnEnabled: toggleAutoReturn.checked }
    });
  });

  toggleNotifications.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { notificationsEnabled: toggleNotifications.checked }
    });
  });

  // Open StudySync Button
  openStudySyncBtn.addEventListener('click', async () => {
    const { studyTabId, studyWindowId } = await chrome.storage.local.get(['studyTabId', 'studyWindowId']);
    let tabFound = false;

    if (studyTabId) {
      try {
        await chrome.tabs.update(studyTabId, { active: true });
        if (studyWindowId) {
          await chrome.windows.update(studyWindowId, { focused: true });
        }
        tabFound = true;
      } catch (err) {}
    }

    if (!tabFound) {
      await chrome.tabs.create({ url: 'http://localhost:5000/dashboard.html' });
    }
    window.close();
  });

  // Emergency Unlock Button
  emergencyUnlockBtn.addEventListener('click', () => {
    if (confirm('Emergency Unlock: Pause focus timer and disengage tab & website restrictions?')) {
      chrome.runtime.sendMessage({ type: 'EMERGENCY_UNLOCK' }, (res) => {
        if (res?.success) {
          window.close();
        }
      });
    }
  });
});
