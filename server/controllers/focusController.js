const { dbAll, dbRun, dbGet } = require('../config/db');
const { calculateStudentProgress, getOrUpdateUserStreak } = require('../config/gamification');

// Start a server-registered focus session
exports.startSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { durationMinutes, mode, soundTrack } = req.body;

    const duration = Number(durationMinutes) || 25;
    const sessionMode = mode || 'Pomodoro';
    const track = soundTrack || 'None';

    await dbRun(
      'INSERT OR REPLACE INTO active_focus_sessions (user_id, duration_minutes, mode, sound_track, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [userId, duration, sessionMode, track]
    );

    const activeSession = await dbGet('SELECT * FROM active_focus_sessions WHERE user_id = ?', [userId]);

    res.status(200).json({
      success: true,
      message: 'Focus session started on server.',
      activeSession
    });
  } catch (err) {
    console.error('Start Focus Session Error:', err);
    res.status(500).json({ success: false, message: 'Failed to start focus session.' });
  }
};

// Get current active focus session (for browser reload recovery)
exports.getActiveSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const activeSession = await dbGet('SELECT * FROM active_focus_sessions WHERE user_id = ?', [userId]);

    res.status(200).json({
      success: true,
      hasActiveSession: !!activeSession,
      activeSession: activeSession || null
    });
  } catch (err) {
    console.error('Get Active Focus Session Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch active focus session.' });
  }
};

// Log a completed focus session & update user stats, streak, level with server-side duration verification
exports.logSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { durationMinutes, distractionsCount, mode, soundTrack } = req.body;

    let duration = Number(durationMinutes) || 25;
    const distractions = Number(distractionsCount) || 0;
    const sessionMode = mode || 'Pomodoro';
    const track = soundTrack || 'None';

    // Verify against server-registered active session if present
    const activeSession = await dbGet('SELECT * FROM active_focus_sessions WHERE user_id = ?', [userId]);
    if (activeSession) {
      const startTime = new Date(activeSession.start_time);
      const now = new Date();
      const elapsedMins = Math.floor((now - startTime) / (1000 * 60));

      // Sanity cap: duration awarded cannot exceed elapsed time + 2 mins tolerance
      if (elapsedMins < duration) {
        duration = Math.max(1, elapsedMins);
      }

      // Remove active session
      await dbRun('DELETE FROM active_focus_sessions WHERE user_id = ?', [userId]);
    } else {
      // Limit unverified client sessions to max 120 mins
      duration = Math.min(120, Math.max(1, duration));
    }

    // Insert focus session
    const result = await dbRun(
      'INSERT INTO focus_sessions (user_id, duration_minutes, distractions_count, mode, sound_track) VALUES (?, ?, ?, ?, ?)',
      [userId, duration, distractions, sessionMode, track]
    );

    // Calculate XP earned
    const xpEarned = duration * 2 + (distractions === 0 ? 30 : 10);

    // Update streak via unified helper!
    const newStreak = await getOrUpdateUserStreak(userId, true);

    // Fetch current user stats
    let stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]);

    const newTotalMinutes = (stats.total_focus_minutes || 0) + duration;
    const newXP = (stats.xp_points || 0) + xpEarned;
    const gamification = calculateStudentProgress(newXP);
    const newLevel = gamification.level;

    // Update stats table
    await dbRun(
      'UPDATE user_stats SET total_focus_minutes = ?, xp_points = ?, level = ? WHERE user_id = ?',
      [newTotalMinutes, newXP, newLevel, userId]
    );

    // Companion Growth & Vitality Progression
    let companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    if (!companion) {
      await dbRun(
        'INSERT INTO user_companion (user_id, stage, growth_points, vitality) VALUES (?, 1, 0, 100)',
        [userId]
      );
      companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    }

    const growthEarned = duration * 2 + (distractions === 0 ? 15 : 5);
    const newGrowth = (companion.growth_points || 0) + growthEarned;
    let newStage = 1;
    if (newGrowth >= 500) newStage = 5;
    else if (newGrowth >= 300) newStage = 4;
    else if (newGrowth >= 150) newStage = 3;
    else if (newGrowth >= 50) newStage = 2;

    let newVitality = (companion.vitality || 100) + 20;
    if (distractions > 2) newVitality -= 15;
    newVitality = Math.max(10, Math.min(100, newVitality));

    await dbRun(
      'UPDATE user_companion SET growth_points = ?, stage = ?, vitality = ?, last_active_date = date("now") WHERE user_id = ?',
      [newGrowth, newStage, newVitality, userId]
    );

    res.status(201).json({
      success: true,
      message: 'Focus session logged successfully!',
      sessionId: result.lastID,
      session: {
        duration,
        distractions,
        mode: sessionMode,
        soundTrack: track,
        completedAt: new Date().toISOString()
      },
      stats: {
        streak: newStreak,
        totalFocusMinutes: newTotalMinutes,
        xp: newXP,
        level: newLevel,
        xpEarned,
        gamification
      },
      companion: {
        stage: newStage,
        growthPoints: newGrowth,
        growthEarned,
        vitality: newVitality
      }
    });
  } catch (err) {
    console.error('Log Focus Session Error:', err);
    res.status(500).json({ success: false, message: 'Failed to log focus session.' });
  }
};

// Get focus room stats & history
exports.getFocusStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const streak = await getOrUpdateUserStreak(userId, false);
    const stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]) || {
      current_streak: 0,
      total_focus_minutes: 0,
      xp_points: 0,
      level: 1,
      last_study_date: null
    };

    const recentSessions = await dbAll(
      'SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT 10',
      [userId]
    );

    const totalDistractions = await dbGet(
      'SELECT SUM(distractions_count) as total FROM focus_sessions WHERE user_id = ?',
      [userId]
    );

    res.status(200).json({
      success: true,
      stats: {
        streak: streak,
        totalFocusMinutes: stats.total_focus_minutes,
        xp: stats.xp_points,
        level: stats.level,
        lastStudyDate: stats.last_study_date,
        totalDistractions: totalDistractions?.total || 0
      },
      recentSessions
    });
  } catch (err) {
    console.error('Get Focus Stats Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch focus stats.' });
  }
};

// Available Desk Decor Catalog with unlock levels matching student rank tags
const DECOR_CATALOG = [
  { id: 'pot_clay', name: 'Terracotta Planter', emoji: '🏺', unlockLevel: 1, rankTag: 'Backbencher 🛋️', type: 'pot', slot: 'slot-pot' },
  { id: 'mug_tea', name: 'Steaming Matcha', emoji: '🍵', unlockLevel: 5, rankTag: 'Habit Starter 🌱', type: 'beverage', slot: 'slot-tea' },
  { id: 'lamp_desk', name: 'Warm Retro Lamp', emoji: '💡', unlockLevel: 10, rankTag: 'Novice Scholar 📘', type: 'lighting', slot: 'slot-lamp' },
  { id: 'cat_cozy', name: 'Sleeping Calico Cat', emoji: '🐱', unlockLevel: 20, rankTag: 'Intermediate ⚡', type: 'pet', slot: 'slot-cat' },
  { id: 'books_grimoire', name: 'Grimoire Stack', emoji: '📚', unlockLevel: 35, rankTag: 'Focused Researcher 🔬', type: 'books', slot: 'slot-books' },
  { id: 'crystal_float', name: 'Focus Crystal', emoji: '🔮', unlockLevel: 50, rankTag: 'Frontbencher 🌟', type: 'magic', slot: 'slot-crystal' },
  { id: 'trophy_gold', name: 'Golden Scholar Trophy', emoji: '🏆', unlockLevel: 75, rankTag: 'Academic Master 🧠', type: 'trophy', slot: 'slot-trophy' }
];

// Get Virtual Companion State & Decor
exports.getCompanion = async (req, res) => {
  try {
    const userId = req.user.userId;

    let companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    if (!companion) {
      await dbRun(
        'INSERT INTO user_companion (user_id, stage, growth_points, vitality, companion_type, equipped_decor) VALUES (?, 1, 0, 100, "bonsai", "[]")',
        [userId]
      );
      companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    }

    const stats = await dbGet('SELECT level FROM user_stats WHERE user_id = ?', [userId]) || { level: 1 };
    const userLevel = stats.level || 1;

    let equipped = [];
    try {
      equipped = JSON.parse(companion.equipped_decor || '[]');
    } catch (e) {
      equipped = [];
    }

    // Strict validation: Only items the user is currently high enough level to unlock can be equipped
    const validEquipped = equipped.filter(id => {
      const item = DECOR_CATALOG.find(d => d.id === id);
      return item && userLevel >= item.unlockLevel;
    });

    // If there are orphaned/unlocked decor items from earlier, automatically sanitize DB
    if (validEquipped.length !== equipped.length) {
      await dbRun(
        'UPDATE user_companion SET equipped_decor = ? WHERE user_id = ?',
        [JSON.stringify(validEquipped), userId]
      );
      equipped = validEquipped;
    }

    const decorWithUnlockStatus = DECOR_CATALOG.map(item => ({
      ...item,
      isUnlocked: userLevel >= item.unlockLevel,
      isEquipped: equipped.includes(item.id)
    }));

    let decorPositions = {};
    try {
      decorPositions = JSON.parse(companion.decor_positions || '{}');
    } catch (e) {
      decorPositions = {};
    }

    res.status(200).json({
      success: true,
      companion: {
        stage: companion.stage || 1,
        growthPoints: companion.growth_points || 0,
        vitality: companion.vitality || 100,
        companionType: companion.companion_type || 'bonsai',
        hydrationGlasses: companion.hydration_glasses || 0,
        equippedDecor: equipped,
        decorPositions
      },
      decorCatalog: decorWithUnlockStatus,
      userLevel
    });
  } catch (err) {
    console.error('Get Companion Error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve companion data.' });
  }
};

// Interact with Virtual Companion (Water / Equip Decor / Switch Pet / Drag Move Decor)
exports.interactCompanion = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { action, decorId, companionType, positions } = req.body;

    let companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    if (!companion) {
      await dbRun('INSERT INTO user_companion (user_id) VALUES (?)', [userId]);
      companion = await dbGet('SELECT * FROM user_companion WHERE user_id = ?', [userId]);
    }

    if (action === 'water') {
      const newVitality = Math.min(100, (companion.vitality || 100) + 25);
      const newHydration = (companion.hydration_glasses || 0) + 1;
      const todayStr = new Date().toISOString().split('T')[0];

      await dbRun(
        'UPDATE user_companion SET vitality = ?, hydration_glasses = ?, last_watered_date = ? WHERE user_id = ?',
        [newVitality, newHydration, todayStr, userId]
      );

      return res.status(200).json({
        success: true,
        message: '💧 You watered your companion! Vitality restored (+25%).',
        vitality: newVitality,
        hydrationGlasses: newHydration
      });
    }

    if (action === 'decor') {
      const stats = await dbGet('SELECT level FROM user_stats WHERE user_id = ?', [userId]) || { level: 1 };
      const userLevel = stats.level || 1;

      const item = DECOR_CATALOG.find(d => d.id === decorId);
      if (!item) {
        return res.status(400).json({ success: false, message: 'Invalid decor item.' });
      }

      if (userLevel < item.unlockLevel) {
        return res.status(403).json({ success: false, message: `Requires Level ${item.unlockLevel} to unlock this decor!` });
      }

      let equipped = [];
      try {
        equipped = JSON.parse(companion.equipped_decor || '[]');
      } catch (e) {
        equipped = [];
      }

      if (equipped.includes(decorId)) {
        equipped = equipped.filter(id => id !== decorId);
      } else {
        equipped.push(decorId);
      }

      await dbRun(
        'UPDATE user_companion SET equipped_decor = ? WHERE user_id = ?',
        [JSON.stringify(equipped), userId]
      );

      return res.status(200).json({
        success: true,
        message: equipped.includes(decorId) ? `Equipped ${item.name}!` : `Unequipped ${item.name}.`,
        equippedDecor: equipped
      });
    }

    if (action === 'save_positions') {
      if (!positions || typeof positions !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid positions payload.' });
      }

      const cleanPositions = {};
      for (const [key, coords] of Object.entries(positions)) {
        if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
          cleanPositions[key] = {
            x: Math.max(0, Math.min(95, Number(coords.x.toFixed(1)))),
            y: Math.max(0, Math.min(90, Number(coords.y.toFixed(1))))
          };
        }
      }

      await dbRun(
        'UPDATE user_companion SET decor_positions = ? WHERE user_id = ?',
        [JSON.stringify(cleanPositions), userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Desk decor positions saved.',
        decorPositions: cleanPositions
      });
    }

    if (action === 'reset_positions') {
      await dbRun(
        'UPDATE user_companion SET decor_positions = ? WHERE user_id = ?',
        ['{}', userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Desk decor positions reset to default slots.',
        decorPositions: {}
      });
    }

    if (action === 'switch_type' && companionType) {
      await dbRun('UPDATE user_companion SET companion_type = ? WHERE user_id = ?', [companionType, userId]);
      return res.status(200).json({
        success: true,
        message: `Switched companion to ${companionType}!`,
        companionType
      });
    }

    res.status(400).json({ success: false, message: 'Unknown interaction action.' });
  } catch (err) {
    console.error('Interact Companion Error:', err);
    res.status(500).json({ success: false, message: 'Failed to interact with companion.' });
  }
};

// Get Smart Burnout Detection & Wellness Radar
exports.getWellnessRadar = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch today's focus minutes
    const todaySessions = await dbAll(
      `SELECT duration_minutes, completed_at FROM focus_sessions 
       WHERE user_id = ? AND date(completed_at) = date('now')`,
      [userId]
    );

    const totalFocusMinutesToday = todaySessions.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);

    // Detect late night sessions (between 23:00 and 05:00)
    let lateNightSessionsCount = 0;
    todaySessions.forEach(s => {
      const hour = new Date(s.completed_at).getHours();
      if (hour >= 23 || hour < 5) lateNightSessionsCount++;
    });

    // Fetch hydration from companion
    const companion = await dbGet('SELECT hydration_glasses, vitality FROM user_companion WHERE user_id = ?', [userId]);
    const hydrationCount = companion?.hydration_glasses || 0;
    const vitality = companion?.vitality || 100;

    // Calculate Burnout Index (0 = Severe Burnout, 100 = Peak Wellness)
    let wellnessScore = 100;
    const recommendations = [];

    if (totalFocusMinutesToday > 300) {
      wellnessScore -= 35;
      recommendations.push({
        type: 'fatigue',
        icon: 'battery-warning',
        text: 'Heavy Study Load: You have focused over 5 hours today. Step away from the screen for at least 20 minutes.'
      });
    } else if (totalFocusMinutesToday > 180) {
      wellnessScore -= 15;
      recommendations.push({
        type: 'break',
        icon: 'coffee',
        text: 'Pacing Check: Great effort! Remember the 20-20-20 rule to rest your eyes.'
      });
    }

    if (lateNightSessionsCount > 0) {
      wellnessScore -= 25;
      recommendations.push({
        type: 'sleep',
        icon: 'moon',
        text: 'Late Night Cramming: Sleep solidifies memory consolidation. Avoid studying past 11:00 PM.'
      });
    }

    if (hydrationCount < 4) {
      wellnessScore -= 10;
      recommendations.push({
        type: 'hydration',
        icon: 'droplets',
        text: 'Hydration Needed: Staying hydrated boosts cognitive recall by up to 14%.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'optimal',
        icon: 'sparkles',
        text: 'Peak Performance: Balanced study pace and great cognitive rhythm. Keep it up!'
      });
    }

    wellnessScore = Math.max(15, Math.min(100, wellnessScore));

    let riskLevel = 'Optimal';
    if (wellnessScore < 60) riskLevel = 'Burnout Risk';
    else if (wellnessScore < 85) riskLevel = 'Moderate Fatigue';

    res.status(200).json({
      success: true,
      wellnessScore,
      riskLevel,
      focusMinutesToday: totalFocusMinutesToday,
      lateNightSessionsCount,
      hydrationCount,
      vitality,
      recommendations
    });
  } catch (err) {
    console.error('Get Wellness Radar Error:', err);
    res.status(500).json({ success: false, message: 'Failed to calculate wellness metrics.' });
  }
};

// Log a glass of water
exports.logHydration = async (req, res) => {
  try {
    const userId = req.user.userId;

    let companion = await dbGet('SELECT hydration_glasses, vitality FROM user_companion WHERE user_id = ?', [userId]);
    if (!companion) {
      await dbRun('INSERT INTO user_companion (user_id) VALUES (?)', [userId]);
      companion = await dbGet('SELECT hydration_glasses, vitality FROM user_companion WHERE user_id = ?', [userId]);
    }

    const newCount = (companion.hydration_glasses || 0) + 1;
    const newVitality = Math.min(100, (companion.vitality || 100) + 10);
    const todayStr = new Date().toISOString().split('T')[0];

    await dbRun(
      'UPDATE user_companion SET hydration_glasses = ?, vitality = ?, last_watered_date = ? WHERE user_id = ?',
      [newCount, newVitality, todayStr, userId]
    );

    res.status(200).json({
      success: true,
      message: `💧 Logged glass of water! (${newCount}/8 today). Vitality +10%.`,
      hydrationCount: newCount,
      vitality: newVitality
    });
  } catch (err) {
    console.error('Log Hydration Error:', err);
    res.status(500).json({ success: false, message: 'Failed to log hydration.' });
  }
};
