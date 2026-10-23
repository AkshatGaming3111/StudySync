const { dbAll, dbRun, dbGet } = require('../config/db');

// Map of common domain patterns to official brand/website names
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

// Reverse lookup: Map friendly names to default domains
const REVERSE_SITE_DOMAINS = {};
for (const [dom, name] of Object.entries(KNOWN_SITE_NAMES)) {
  REVERSE_SITE_DOMAINS[name.toLowerCase()] = dom;
}

const GENERIC_NAMES = new Set(['general activity', 'web browsing', 'home', 'student portal', 'localhost', 'dashboard', 'index', 'welcome', 'login']);

function resolveFriendlySiteAndUrl(inputSite, inputUrl) {
  let site = (inputSite || '').trim();
  let url = (inputUrl || '').trim();

  // If URL wasn't provided but site looks like a URL
  if (!url && (site.startsWith('http://') || site.startsWith('https://'))) {
    url = site;
  }

  // Extract domain
  let domain = '';
  if (url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
      domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (!url.startsWith('http')) url = 'https://' + url;
    } catch (e) {
      domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    }
  } else if (site.includes('.') && !site.includes(' ')) {
    domain = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    url = 'https://' + domain;
  } else if (site && REVERSE_SITE_DOMAINS[site.toLowerCase()]) {
    domain = REVERSE_SITE_DOMAINS[site.toLowerCase()];
    url = 'https://' + domain;
  }

  // If site name is generic or missing or is a domain, look up friendly name
  if (!site || GENERIC_NAMES.has(site.toLowerCase()) || site === domain || site.includes('.')) {
    if (domain && KNOWN_SITE_NAMES[domain]) {
      site = KNOWN_SITE_NAMES[domain];
    } else if (domain) {
      const parts = domain.split('.');
      const mainPart = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      site = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    } else {
      site = site || 'General Activity';
    }
  } else if (domain && KNOWN_SITE_NAMES[domain]) {
    site = KNOWN_SITE_NAMES[domain];
  }

  return { site, url: url || (domain ? 'https://' + domain : null) };
}

function isInternalOrExcludedDomain(site, url) {
  const s = (site || '').trim().toLowerCase();
  const u = (url || '').trim().toLowerCase();

  // Exclude internal StudySync pages
  if (u.includes('dashboard.html') || u.includes('auth.html') || u.includes('index.html') || u.includes('/classes/c_')) {
    return true;
  }
  // Exclude focus lock or title indicators
  if (s.includes('pomodoro') || s.includes('studysync') || s.includes('focus lock')) {
    return true;
  }
  // Exclude localhost and loopback
  if (s === 'localhost' || u.includes('localhost') || u.includes('127.0.0.1') || u.includes('0.0.0.0') || u.includes('::1')) {
    return true;
  }
  // Exclude private LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/(?:^https?:\/\/)?(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u) ||
      /(?:^https?:\/\/)?(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(s)) {
    return true;
  }
  // Exclude pure numeric hostnames/fragments (e.g. '31' from 192.168.31.29)
  if (/^\d+$/.test(s)) {
    return true;
  }
  return false;
}

// Get screen time logs and limits for user analytics (supports optional startDate & endDate filtering)
exports.getLogsAndLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const todayStr = new Date().toISOString().split('T')[0];
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT 
        MIN(id) as id,
        user_id,
        site,
        MAX(url) as url,
        date,
        category,
        SUM(minutes) as minutes,
        MAX(created_at) as created_at
      FROM screentime_logs 
      WHERE user_id = ?
    `;
    const params = [userId];

    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY date, site, category ORDER BY date DESC, MAX(created_at) DESC';

    const logs = await dbAll(sql, params);

    // Fetch limits
    const limits = await dbAll(
      'SELECT category, limit_minutes FROM screentime_limits WHERE user_id = ?',
      [userId]
    );

    const logsByDate = {};
    const todayCategoryTotals = {};
    const categoryTotals = {};
    const dateTotals = {};
    const filteredLogs = [];

    logs.forEach(log => {
      if (isInternalOrExcludedDomain(log.site, log.url)) {
        return;
      }
      const resolved = resolveFriendlySiteAndUrl(log.site, log.url);
      log.site = resolved.site;
      log.url = resolved.url;
      filteredLogs.push(log);

      if (!logsByDate[log.date]) {
        logsByDate[log.date] = {};
      }
      logsByDate[log.date][log.category] = (logsByDate[log.date][log.category] || 0) + log.minutes;
      categoryTotals[log.category] = (categoryTotals[log.category] || 0) + log.minutes;
      dateTotals[log.date] = (dateTotals[log.date] || 0) + log.minutes;

      if (log.date === todayStr) {
        todayCategoryTotals[log.category] = (todayCategoryTotals[log.category] || 0) + log.minutes;
      }
    });

    res.status(200).json({
      success: true,
      todayStr,
      todayCategoryTotals,
      dateTotals,
      logsByDate,
      categoryTotals,
      logs: filteredLogs,
      limits
    });
  } catch (err) {
    console.error('Get Screentime Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch screen time data.' });
  }
};

// Log a screen time entry
exports.logScreentime = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, minutes, date, site, url } = req.body;

    if (!category || !minutes) {
      return res.status(400).json({ success: false, message: 'Category and minutes are required.' });
    }

    const logDate = date || new Date().toISOString().split('T')[0];
    const resolved = resolveFriendlySiteAndUrl(site, url);

    if (isInternalOrExcludedDomain(site, url) || isInternalOrExcludedDomain(resolved.site, resolved.url)) {
      return res.status(400).json({ success: false, message: 'Internal application activity cannot be logged as screen time.' });
    }

    const result = await dbRun(
      'INSERT INTO screentime_logs (user_id, site, url, date, category, minutes) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, resolved.site, resolved.url, logDate, category, Number(minutes)]
    );

    // Check if category limit was exceeded today
    const limitRow = await dbGet(
      'SELECT limit_minutes FROM screentime_limits WHERE user_id = ? AND category = ?',
      [userId, category]
    );

    let isOverLimit = false;
    let totalMinutesToday = 0;

    if (limitRow) {
      const todayTotal = await dbGet(
        'SELECT SUM(minutes) as total FROM screentime_logs WHERE user_id = ? AND category = ? AND date = ?',
        [userId, category, logDate]
      );
      totalMinutesToday = todayTotal?.total || 0;
      isOverLimit = totalMinutesToday > limitRow.limit_minutes;
    }

    res.status(201).json({
      success: true,
      message: 'Screen time logged successfully.',
      logId: result.lastID,
      entry: { site: resolved.site, url: resolved.url, category, minutes: Number(minutes), date: logDate },
      limitAlert: isOverLimit ? {
        category,
        totalToday: totalMinutesToday,
        limit: limitRow.limit_minutes,
        exceededBy: totalMinutesToday - limitRow.limit_minutes
      } : null
    });
  } catch (err) {
    console.error('Log Screentime Error:', err);
    res.status(500).json({ success: false, message: 'Failed to log screen time.' });
  }
};

// Automated Telemetry Webhook Endpoint (For Browser Extensions or Desktop Tracking Agents)
exports.logTelemetry = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { events } = req.body; // Array of { site, url, category, minutes, date }

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ success: false, message: 'events array is required.' });
    }

    const insertedIds = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const item of events) {
      if (item.category && item.minutes) {
        const logDate = item.date || todayStr;
        const resolved = resolveFriendlySiteAndUrl(item.site, item.url);

        // Ignore StudySync local application / localhost / private IPs
        if (isInternalOrExcludedDomain(item.site, item.url) || isInternalOrExcludedDomain(resolved.site, resolved.url)) {
          continue;
        }

        // Check if an entry for this user, date, site, and category already exists today
        const existing = await dbGet(
          'SELECT id, minutes FROM screentime_logs WHERE user_id = ? AND date = ? AND site = ? AND category = ?',
          [userId, logDate, resolved.site, item.category]
        );

        if (existing) {
          await dbRun(
            'UPDATE screentime_logs SET minutes = minutes + ?, url = COALESCE(?, url), created_at = CURRENT_TIMESTAMP WHERE id = ?',
            [Number(item.minutes), resolved.url, existing.id]
          );
          insertedIds.push(existing.id);
        } else {
          const result = await dbRun(
            'INSERT INTO screentime_logs (user_id, site, url, date, category, minutes) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, resolved.site, resolved.url, logDate, item.category, Number(item.minutes)]
          );
          insertedIds.push(result.lastID);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Ingested ${insertedIds.length} telemetry records successfully.`,
      count: insertedIds.length
    });
  } catch (err) {
    console.error('Log Telemetry Error:', err);
    res.status(500).json({ success: false, message: 'Failed to ingest telemetry data.' });
  }
};

// Set or Update category screen time limits
exports.setLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limits } = req.body;

    if (!limits) {
      return res.status(400).json({ success: false, message: 'Limits payload is required.' });
    }

    const limitsArray = Array.isArray(limits) ? limits : [limits];

    for (const item of limitsArray) {
      if (item.category && item.limit_minutes !== undefined) {
        await dbRun(
          'INSERT INTO screentime_limits (user_id, category, limit_minutes) VALUES (?, ?, ?) ON CONFLICT(user_id, category) DO UPDATE SET limit_minutes = excluded.limit_minutes',
          [userId, item.category, Number(item.limit_minutes)]
        );
      }
    }

    const updatedLimits = await dbAll(
      'SELECT category, limit_minutes FROM screentime_limits WHERE user_id = ?',
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Screen time limits updated.',
      limits: updatedLimits
    });
  } catch (err) {
    console.error('Set Screentime Limits Error:', err);
    res.status(500).json({ success: false, message: 'Failed to set screen time limits.' });
  }
};

// Delete a screen time log entry
exports.deleteLog = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const target = await dbGet('SELECT date, site, category FROM screentime_logs WHERE id = ? AND user_id = ?', [id, userId]);
    if (target) {
      await dbRun('DELETE FROM screentime_logs WHERE user_id = ? AND date = ? AND site = ? AND category = ?', [userId, target.date, target.site, target.category]);
    } else {
      await dbRun('DELETE FROM screentime_logs WHERE id = ? AND user_id = ?', [id, userId]);
    }

    res.status(200).json({ success: true, message: 'Screen time log entry deleted.' });
  } catch (err) {
    console.error('Delete Screentime Log Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete log entry.' });
  }
};
