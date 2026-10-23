// Screen Time Analytics & Chart.js Module

document.addEventListener('DOMContentLoaded', () => {
  let categoryChartInstance = null;
  let screentimeBarChartInstance = null;

  let screentimeLogs = [];
  let categoryLimits = [];
  let todayCategoryTotals = {};
  let dateTotals = {};
  let todayStr = new Date().toISOString().split('T')[0];

  // Modal Elements
  const modal = document.getElementById('screentime-modal');
  const openModalBtn = document.getElementById('open-screentime-modal-btn');
  const closeModalBtn = document.getElementById('close-screentime-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-screentime-modal-btn');
  const logForm = document.getElementById('screentime-log-form');
  const logSiteInput = document.getElementById('log-site-input');
  const logUrlInput = document.getElementById('log-url-input');
  const logCategoryInput = document.getElementById('log-category-input');
  const logMinutesInput = document.getElementById('log-minutes-input');
  const logDateInput = document.getElementById('log-date-input');

  // Table & Badge Elements
  const todayTotalBadge = document.getElementById('screentime-today-total-badge');
  const logsTbody = document.getElementById('screentime-logs-tbody');

  // Limit Form Elements
  const limitsForm = document.getElementById('screentime-limits-form');
  const limitSocialInput = document.getElementById('limit-social-input');
  const limitEntertainmentInput = document.getElementById('limit-entertainment-input');
  const limitGamingInput = document.getElementById('limit-gaming-input');

  const alertBanner = document.getElementById('screentime-limit-alert');
  const alertText = document.getElementById('screentime-alert-text');

  // Set default date to today
  if (logDateInput) logDateInput.value = todayStr;

  // Modal Listeners
  if (openModalBtn) openModalBtn.addEventListener('click', () => modal.classList.add('active'));
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => modal.classList.remove('active'));
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => modal.classList.remove('active'));

  // Screen Time Table Skeleton Loader
  function renderScreentimeSkeletons(count = 4) {
    if (!logsTbody) return;
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <tr class="skeleton-row">
          <td>
            <div class="skeleton-site-cell">
              <div class="skeleton skeleton-favicon"></div>
              <div class="skeleton-site-texts">
                <div class="skeleton skeleton-site-title" style="width: ${90 + (i % 3) * 25}px;"></div>
                <div class="skeleton skeleton-site-url"></div>
              </div>
            </div>
          </td>
          <td><div class="skeleton skeleton-pill" style="width: 80px; height: 22px; border-radius: 9999px;"></div></td>
          <td><div class="skeleton" style="width: 45px; height: 18px; border-radius: 4px;"></div></td>
          <td><div class="skeleton" style="width: 75px; height: 14px; border-radius: 4px;"></div></td>
          <td style="text-align: right;"><div class="skeleton skeleton-btn" style="width: 28px; height: 28px; border-radius: 6px;"></div></td>
        </tr>
      `;
    }
    logsTbody.innerHTML = html;
  }

  // Load Analytics Data
  async function fetchScreentimeData() {
    if (!screentimeLogs || screentimeLogs.length === 0) {
      renderScreentimeSkeletons();
    }
    try {
      const data = await ApiClient.get('/screentime');
      if (data.success) {
        screentimeLogs = data.logs || [];
        todayCategoryTotals = data.todayCategoryTotals || {};
        dateTotals = data.dateTotals || {};
        categoryLimits = data.limits || [];
        if (data.todayStr) todayStr = data.todayStr;

        populateLimitInputs();
        renderTodayBadge();
        renderCharts();
        renderLogsTable();
        checkCategoryLimits();
      }
    } catch (err) {
      console.error('Failed to fetch screen time data:', err);
      if (window.Toast) Toast.error('Screen Time Error', 'Failed to fetch screen time data.');
    }
  }

  function renderTodayBadge() {
    if (!todayTotalBadge) return;
    const totalMins = Object.values(todayCategoryTotals).reduce((a, b) => a + b, 0);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    todayTotalBadge.innerText = `Today (${todayStr}): ${timeStr}`;
  }

  function populateLimitInputs() {
    categoryLimits.forEach(l => {
      if (l.category === 'Social Media' && limitSocialInput) limitSocialInput.value = l.limit_minutes;
      if (l.category === 'Entertainment' && limitEntertainmentInput) limitEntertainmentInput.value = l.limit_minutes;
      if (l.category === 'Gaming' && limitGamingInput) limitGamingInput.value = l.limit_minutes;
    });
  }

  function checkCategoryLimits() {
    let warningMessages = [];

    categoryLimits.forEach(l => {
      const totalToday = todayCategoryTotals[l.category] || 0;
      if (totalToday > l.limit_minutes) {
        const exceeded = totalToday - l.limit_minutes;
        warningMessages.push(`<strong>${l.category}</strong>: Spent ${totalToday}m today (Limit: ${l.limit_minutes}m, +${exceeded}m over daily threshold)`);
      }
    });

    if (warningMessages.length > 0 && alertBanner && alertText) {
      alertBanner.style.display = 'block';
      alertText.innerHTML = warningMessages.join('<br>');
    } else if (alertBanner) {
      alertBanner.style.display = 'none';
    }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // 1. TODAY'S DAILY CATEGORY ALLOCATION (Pie / Doughnut Chart)
    const todayCategories = Object.keys(todayCategoryTotals);
    const todayTotals = Object.values(todayCategoryTotals);

    // Fallback if no logs today yet
    const displayCategories = todayCategories.length > 0 ? todayCategories : ['No Logs Today Yet'];
    const displayTotals = todayTotals.length > 0 ? todayTotals : [1];

    const categoryColors = {
      'Study': '#10b981',
      'Social Media': '#ef4444',
      'Entertainment': '#f59e0b',
      'Gaming': '#a855f7',
      'Productive Utilities': '#6366f1',
      'No Logs Today Yet': '#475569'
    };

    const backgroundColors = displayCategories.map(cat => categoryColors[cat] || '#64748b');

    const ctx1 = document.getElementById('category-chart');
    if (ctx1) {
      if (categoryChartInstance) categoryChartInstance.destroy();

      categoryChartInstance = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: displayCategories,
          datasets: [{
            data: displayTotals,
            backgroundColor: backgroundColors,
            borderColor: 'rgba(15, 23, 42, 0.8)',
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  if (context.label === 'No Logs Today Yet') return ' No screen time logged today yet';
                  return ` ${context.label}: ${context.raw} mins`;
                }
              }
            }
          }
        }
      });
    }

    // 2. DATE-BY-DATE SCREEN TIME COMPARISON BAR CHART
    const sortedDates = Object.keys(dateTotals).sort();
    
    // Default last 7 dates display or fallback if empty
    const displayDates = sortedDates.length > 0 ? sortedDates.slice(-7) : [todayStr];
    const displayDateTotals = sortedDates.length > 0 ? displayDates.map(d => dateTotals[d] || 0) : [0];

    const ctx2 = document.getElementById('screentime-bar-chart');
    if (ctx2) {
      if (screentimeBarChartInstance) screentimeBarChartInstance.destroy();

      screentimeBarChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: displayDates,
          datasets: [
            {
              label: 'Total Screen Time (Minutes)',
              data: displayDateTotals,
              backgroundColor: 'rgba(99, 102, 241, 0.75)',
              hoverBackgroundColor: 'rgba(99, 102, 241, 0.95)',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { 
              title: { display: true, text: 'Date', color: '#64748b' },
              ticks: { color: '#94a3b8' }, 
              grid: { color: 'rgba(255, 255, 255, 0.05)' } 
            },
            y: { 
              title: { display: true, text: 'Minutes Spent', color: '#64748b' },
              ticks: { color: '#94a3b8' }, 
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              beginAtZero: true
            }
          },
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
            tooltip: {
              callbacks: {
                label: (context) => ` ${context.raw} mins logged on ${context.label}`
              }
            }
          }
        }
      });
    }
  }

  // Helper: Format duration in minutes to readable hours and minutes
  function formatMinutes(minutes) {
    const m = Number(minutes) || 0;
    if (m >= 60) {
      const hrs = Math.floor(m / 60);
      const rem = m % 60;
      return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
    }
    return `${m}m`;
  }

  // Helper: Generate category badge element
  function getCategoryBadge(category) {
    const cat = (category || 'Other').toLowerCase();
    if (cat.includes('study') || cat.includes('academic')) {
      return `<span class="badge-category badge-cat-study"><i data-lucide="book-open" style="width:12px; height:12px;"></i> Study</span>`;
    }
    if (cat.includes('social')) {
      return `<span class="badge-category badge-cat-social"><i data-lucide="message-circle" style="width:12px; height:12px;"></i> Social Media</span>`;
    }
    if (cat.includes('entertainment') || cat.includes('video')) {
      return `<span class="badge-category badge-cat-entertainment"><i data-lucide="tv" style="width:12px; height:12px;"></i> Entertainment</span>`;
    }
    if (cat.includes('game') || cat.includes('gaming')) {
      return `<span class="badge-category badge-cat-gaming"><i data-lucide="gamepad-2" style="width:12px; height:12px;"></i> Gaming</span>`;
    }
    return `<span class="badge-category badge-cat-other"><i data-lucide="layers" style="width:12px; height:12px;"></i> ${escapeHtml(category || 'Other')}</span>`;
  }

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

  const REVERSE_SITE_DOMAINS = {};
  for (const [dom, name] of Object.entries(KNOWN_SITE_NAMES)) {
    REVERSE_SITE_DOMAINS[name.toLowerCase()] = dom;
  }

  // Helper: Generate site/domain cell with real name, favicon, and clickable URL
  function getSiteCell(site, url) {
    let rawSite = (site || '').trim();
    let targetUrl = (url || '').trim();

    // If targetUrl is missing but rawSite looks like a URL
    if (!targetUrl && (rawSite.startsWith('http://') || rawSite.startsWith('https://'))) {
      targetUrl = rawSite;
    }

    let domain = '';
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
        domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
      } catch (e) {
        domain = targetUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      }
    } else if (rawSite.includes('.') && !rawSite.includes(' ')) {
      domain = rawSite.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      targetUrl = 'https://' + domain;
    } else if (rawSite && REVERSE_SITE_DOMAINS[rawSite.toLowerCase()]) {
      domain = REVERSE_SITE_DOMAINS[rawSite.toLowerCase()];
      targetUrl = 'https://' + domain;
    }

    // Determine clean friendly display name
    let displayName = rawSite;
    if (!displayName || displayName === 'General Activity' || displayName === 'Web Browsing' || displayName === domain || displayName.includes('.')) {
      if (domain && KNOWN_SITE_NAMES[domain]) {
        displayName = KNOWN_SITE_NAMES[domain];
      } else if (domain) {
        const parts = domain.split('.');
        const mainPart = parts.length > 1 ? parts[parts.length - 2] : parts[0];
        displayName = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      } else {
        displayName = displayName || 'General Activity';
      }
    } else if (domain && KNOWN_SITE_NAMES[domain]) {
      displayName = KNOWN_SITE_NAMES[domain];
    }

    const isManual = displayName.toLowerCase().includes('manual');

    let iconHtml = '';
    if (domain) {
      iconHtml = `
        <div class="site-icon-wrapper" title="${escapeHtml(domain)}">
          <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" 
               alt="${escapeHtml(displayName)}" 
               class="site-favicon" 
               onerror="this.style.display='none'; this.parentElement.innerHTML='<i data-lucide=\\'globe\\' style=\\'width:14px;height:14px;color:var(--primary);\\'></i>';">
        </div>
      `;
    } else {
      const iconName = isManual ? 'pen-tool' : 'layout';
      iconHtml = `
        <div class="site-icon-wrapper">
          <i data-lucide="${iconName}" style="width:14px; height:14px; color: var(--primary);"></i>
        </div>
      `;
    }

    let urlHtml = '';
    if (targetUrl) {
      const displayUrl = targetUrl.length > 36 ? targetUrl.substring(0, 33) + '...' : targetUrl;
      urlHtml = `
        <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" class="site-url-link" title="Open ${escapeHtml(targetUrl)}">
          <span>${escapeHtml(displayUrl)}</span>
          <i data-lucide="external-link" style="width:11px; height:11px; opacity: 0.7;"></i>
        </a>
      `;
    } else {
      const subTag = isManual ? 'Manual Entry' : 'Local Application';
      urlHtml = `<span class="site-source-tag">${subTag}</span>`;
    }

    return `
      <div class="site-domain-cell">
        ${iconHtml}
        <div class="site-info">
          <span class="site-name">${escapeHtml(displayName)}</span>
          ${urlHtml}
        </div>
      </div>
    `;
  }

  // RENDER SITES VISITED & ALLOTTED CATEGORIES TABLE
  function renderLogsTable() {
    if (!logsTbody) return;
    logsTbody.innerHTML = '';

    if (!screentimeLogs || screentimeLogs.length === 0) {
      logsTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 1.75rem; color: var(--text-muted);">No site visits or screen time logs recorded yet.</td>
        </tr>
      `;
      return;
    }

    screentimeLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';

      const isToday = log.date === todayStr;
      const dateBadge = isToday ? `<span class="badge badge-low" style="margin-left:0.4rem; font-size:0.7rem;">Today</span>` : '';

      tr.innerHTML = `
        <td style="padding: 0.75rem;">${getSiteCell(log.site, log.url)}</td>
        <td style="padding: 0.75rem;">${getCategoryBadge(log.category)}</td>
        <td style="padding: 0.75rem; font-weight: 600; color: var(--primary); font-family: monospace; font-size: 0.95rem;">${formatMinutes(log.minutes)}</td>
        <td style="padding: 0.75rem; color: var(--text-muted); font-size: 0.85rem;">${log.date}${dateBadge}</td>
        <td style="padding: 0.75rem; text-align: right;">
          <button class="btn btn-glass btn-sm delete-screentime-log-btn" data-id="${log.id}" title="Delete site record" style="color: var(--danger); padding: 0.25rem 0.5rem;">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
          </button>
        </td>
      `;

      logsTbody.appendChild(tr);
    });

    // Attach Delete Action Listeners
    document.querySelectorAll('.delete-screentime-log-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const logId = btn.getAttribute('data-id');
        const confirmed = window.Toast ? await Toast.confirm({
          title: 'Remove Screen Time Log?',
          message: 'Are you sure you want to remove this website visit entry from your logs?',
          confirmText: 'Remove Entry',
          danger: true,
          icon: 'trash-2'
        }) : confirm('Are you sure you want to remove this screen time entry?');

        if (!confirmed) return;

        try {
          const res = await ApiClient.delete(`/screentime/log/${logId}`);
          if (res.success) {
            if (window.Toast) Toast.info('Entry Removed', 'Screen time visit removed.');
            fetchScreentimeData();
          }
        } catch (err) {
          if (window.Toast) Toast.error('Delete Failed', err.message);
          else alert('Failed to delete log entry: ' + err.message);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Log Screen Time Submit Form
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const site = logSiteInput ? logSiteInput.value.trim() : '';
      const url = logUrlInput ? logUrlInput.value.trim() : '';
      const category = logCategoryInput.value;
      const minutes = Number(logMinutesInput.value);
      const date = logDateInput.value;

      if (!category || !minutes) return;

      try {
        const res = await ApiClient.post('/screentime/log', { site, url, category, minutes, date });
        if (res.success) {
          modal.classList.remove('active');
          logMinutesInput.value = '';
          if (logSiteInput) logSiteInput.value = '';
          if (logUrlInput) logUrlInput.value = '';
          if (window.Toast) Toast.success('Activity Logged! ⏱️', `${minutes}m logged under ${category}.`);
          fetchScreentimeData();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Log Error', err.message);
        else alert('Failed to log screen time: ' + err.message);
      }
    });
  }

  // Save Limits Submit Form
  if (limitsForm) {
    limitsForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const limits = [
        { category: 'Social Media', limit_minutes: Number(limitSocialInput.value) || 60 },
        { category: 'Entertainment', limit_minutes: Number(limitEntertainmentInput.value) || 90 },
        { category: 'Gaming', limit_minutes: Number(limitGamingInput.value) || 45 }
      ];

      try {
        const res = await ApiClient.post('/screentime/limits', { limits });
        if (res.success) {
          if (window.Toast) Toast.success('Limits Saved! 🛡️', 'Daily screen time thresholds updated.');
          else alert('Screen time limit thresholds updated successfully!');
          fetchScreentimeData();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Limits Error', err.message);
        else alert('Failed to update limits: ' + err.message);
      }
    });
  }

  // Sync Live Browsing Button Listener
  const syncNowBtn = document.getElementById('sync-screentime-now-btn');
  let syncTimeout = null;

  function triggerTelemetrySync(isManualClick = false) {
    const token = ApiClient.getToken();
    if (!token) return;

    window.postMessage({
      source: 'studysync-web',
      type: 'FORCE_TELEMETRY_SYNC',
      payload: {
        token,
        serverUrl: window.location.origin
      }
    }, '*');

    if (isManualClick && syncNowBtn) {
      syncNowBtn.disabled = true;
      syncNowBtn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:13px;height:13px;"></i> <span>Syncing...</span>`;
      if (window.lucide) window.lucide.createIcons();

      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        await fetchScreentimeData();
        syncNowBtn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;color:#10b981;"></i> <span>Synced!</span>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
          syncNowBtn.disabled = false;
          syncNowBtn.innerHTML = `<i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i> <span>Sync Live Browsing</span>`;
          if (window.lucide) window.lucide.createIcons();
        }, 1500);
      }, 1400);
    }
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      triggerTelemetrySync(true);
    });
  }

  // Auto-refresh when Companion Extension announces a telemetry sync ack
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.source === 'studysync-extension' && event.data.type === 'TELEMETRY_SYNC_ACK') {
      await fetchScreentimeData();
      if (syncNowBtn && syncNowBtn.disabled) {
        clearTimeout(syncTimeout);
        syncNowBtn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;color:#10b981;"></i> <span>Synced!</span>`;
        if (window.lucide) window.lucide.createIcons();

        const count = event.data.count || 0;
        if (window.Toast) {
          if (count > 0) {
            Toast.success('Browsing Synced! 🌐', `Captured ${count} live browsing record${count === 1 ? '' : 's'} from Companion extension.`);
          } else {
            Toast.info('Telemetry Up to Date', 'All browsing records are already synchronized with your portal.');
          }
        }

        setTimeout(() => {
          syncNowBtn.disabled = false;
          syncNowBtn.innerHTML = `<i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i> <span>Sync Live Browsing</span>`;
          if (window.lucide) window.lucide.createIcons();
        }, 1500);
      }
    }
  });

  // Initial Fetch & background companion telemetry sync
  fetchScreentimeData();
  triggerTelemetrySync(false);

  window.ScreentimeModule = {
    refresh: () => {
      fetchScreentimeData();
      triggerTelemetrySync(false);
    }
  };
});
