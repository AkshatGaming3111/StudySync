const { dbGet, dbRun, dbAll } = require('./db');

function calculateStudentProgress(totalXP) {
  let xp = Math.max(0, Number(totalXP) || 0);
  let level = 1;
  let reqForNextLevel = 100; // Base requirement for Lvl 1 -> Lvl 2

  // Each proceeding level increases XP requirement by 50
  while (xp >= reqForNextLevel) {
    xp -= reqForNextLevel;
    level++;
    reqForNextLevel += 50;
  }

  const currentLevelXP = xp;
  const nextLevelXP = reqForNextLevel;
  const progressPercent = Math.min(100, Math.round((currentLevelXP / nextLevelXP) * 100));

  // Determine Title based on Student Level
  let title = 'Backbencher 🛋️';
  let titleShort = 'Backbencher';
  let badgeColor = '#a855f7'; // Purple

  if (level >= 100) {
    title = 'Topper 👑';
    titleShort = 'Topper';
    badgeColor = '#f59e0b'; // Amber Gold
  } else if (level >= 75) {
    title = 'Academic Master 🧠';
    titleShort = 'Master';
    badgeColor = '#c084fc'; // Light Purple Glow
  } else if (level >= 50) {
    title = 'Frontbencher 🌟';
    titleShort = 'Frontbencher';
    badgeColor = '#10b981'; // Emerald Green
  } else if (level >= 35) {
    title = 'Focused Researcher 🔬';
    titleShort = 'Researcher';
    badgeColor = '#06b6d4'; // Cyan
  } else if (level >= 20) {
    title = 'Intermediate ⚡';
    titleShort = 'Intermediate';
    badgeColor = '#6366f1'; // Electric Indigo
  } else if (level >= 10) {
    title = 'Novice Scholar 📘';
    titleShort = 'Novice Scholar';
    badgeColor = '#3b82f6'; // Blue
  } else {
    title = 'Backbencher 🛋️';
    titleShort = 'Backbencher';
    badgeColor = '#a855f7';
  }

  return {
    level,
    title,
    titleShort,
    badgeColor,
    currentLevelXP,
    nextLevelXP,
    progressPercent,
    totalXP: Number(totalXP) || 0
  };
}

// Helper to check & update daily streak for a user
async function getOrUpdateUserStreak(userId, isActivityCompleted = false) {
  const now = new Date();
  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatYMD(now);
  const utcTodayStr = now.toISOString().split('T')[0];

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatYMD(yesterday);
  const utcYesterdayStr = yesterday.toISOString().split('T')[0];

  // Fetch all completed activity dates across tasks, focus sessions, and screen time
  const taskDates = await dbAll('SELECT DISTINCT date FROM tasks WHERE user_id = ? AND completed = 1', [userId]);
  const focusDates = await dbAll('SELECT DISTINCT substr(completed_at, 1, 10) as date FROM focus_sessions WHERE user_id = ?', [userId]);
  const screenDates = await dbAll('SELECT DISTINCT date FROM screentime_logs WHERE user_id = ? AND (category = "Study" OR minutes >= 15)', [userId]);

  const activitySet = new Set();
  taskDates.forEach(r => r.date && activitySet.add(r.date));
  focusDates.forEach(r => r.date && activitySet.add(r.date));
  screenDates.forEach(r => r.date && activitySet.add(r.date));

  if (isActivityCompleted) {
    activitySet.add(todayStr);
    activitySet.add(utcTodayStr);
  }

  const isTodayActive = activitySet.has(todayStr) || activitySet.has(utcTodayStr);
  const isYesterdayActive = activitySet.has(yesterdayStr) || activitySet.has(utcYesterdayStr);

  let streak = 0;
  let checkDate = new Date(now);

  if (isTodayActive) {
    streak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
    while (activitySet.has(formatYMD(checkDate)) || activitySet.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else if (isYesterdayActive) {
    // Yesterday had activity -> streak is preserved, pending today's session
    streak = 1;
    checkDate = new Date(yesterday);
    checkDate.setDate(checkDate.getDate() - 1);
    while (activitySet.has(formatYMD(checkDate)) || activitySet.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else {
    // Neither today nor yesterday had verified activity
    streak = 0;
  }

  let stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);
  if (!stats) {
    await dbRun(
      'INSERT INTO user_stats (user_id, current_streak, last_study_date, total_focus_minutes, xp_points, level, longest_streak) VALUES (?, ?, ?, 0, 0, 1, ?)',
      [userId, streak, isTodayActive ? todayStr : (isYesterdayActive ? yesterdayStr : null), streak]
    );
  } else {
    // If stats had a previous streak preserved and diffDays from last_study_date is <= 1, don't lower it arbitrarily
    if (stats.last_study_date && stats.current_streak > streak) {
      const lastD = new Date(stats.last_study_date + 'T00:00:00');
      const todayD = new Date(todayStr + 'T00:00:00');
      const diff = Math.round((todayD - lastD) / (1000 * 60 * 60 * 24));
      if (diff === 0) {
        streak = stats.current_streak;
      } else if (diff === 1) {
        streak = isActivityCompleted ? stats.current_streak + 1 : stats.current_streak;
      }
    }

    const longest = Math.max(stats.longest_streak || 0, stats.current_streak || 0, streak);
    const lastDate = isTodayActive ? todayStr : (isYesterdayActive ? yesterdayStr : stats.last_study_date);

    await dbRun(
      'UPDATE user_stats SET current_streak = ?, longest_streak = ?, last_study_date = ? WHERE user_id = ?',
      [streak, longest, lastDate, userId]
    );
  }

  return streak;
}

module.exports = {
  calculateStudentProgress,
  getOrUpdateUserStreak
};
