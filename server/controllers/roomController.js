const { dbAll, dbGet, dbRun } = require('../config/db');

// List all study rooms with live active member counts
exports.listRooms = async (req, res) => {
  try {
    const rooms = await dbAll('SELECT * FROM study_rooms ORDER BY is_official DESC, name ASC');

    // Count active members (heartbeat within last 3 minutes)
    const activeThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    for (const room of rooms) {
      const activeCount = await dbGet(
        'SELECT COUNT(*) as count FROM room_participants WHERE room_id = ? AND last_heartbeat >= ?',
        [room.id, activeThreshold]
      );
      room.activeMembersCount = activeCount?.count || 0;
    }

    res.status(200).json({
      success: true,
      rooms
    });
  } catch (err) {
    console.error('List Rooms Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch study rooms.' });
  }
};

// Join a study room
exports.joinRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: roomId } = req.params;
    const { currentTask, timerMode = 'Pomodoro', remainingSeconds = 1500 } = req.body;

    const user = await dbGet('SELECT name FROM users WHERE id = ?', [userId]);
    const userName = user ? user.name : 'Fellow Student';

    const room = await dbGet('SELECT * FROM study_rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Study room not found.' });
    }

    // Upsert participant
    await dbRun(
      `INSERT INTO room_participants 
        (room_id, user_id, user_name, current_task, timer_mode, remaining_seconds, last_heartbeat) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(room_id, user_id) DO UPDATE SET 
        current_task = excluded.current_task,
        timer_mode = excluded.timer_mode,
        remaining_seconds = excluded.remaining_seconds,
        last_heartbeat = CURRENT_TIMESTAMP`,
      [roomId, userId, userName, currentTask || 'Deep Work Session', timerMode, Number(remainingSeconds)]
    );

    res.status(200).json({
      success: true,
      message: `Joined ${room.name}!`,
      room
    });
  } catch (err) {
    console.error('Join Room Error:', err);
    res.status(500).json({ success: false, message: 'Failed to join study room.' });
  }
};

// Get active participants in a room
exports.getRoomMembers = async (req, res) => {
  try {
    const { id: roomId } = req.params;
    const activeThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const members = await dbAll(
      `SELECT user_id, user_name, current_task, timer_mode, remaining_seconds, last_heartbeat 
       FROM room_participants 
       WHERE room_id = ? AND last_heartbeat >= ? 
       ORDER BY last_heartbeat DESC`,
      [roomId, activeThreshold]
    );

    res.status(200).json({
      success: true,
      count: members.length,
      members
    });
  } catch (err) {
    console.error('Get Room Members Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch room members.' });
  }
};

// Heartbeat to keep presence active
exports.heartbeat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: roomId } = req.params;
    const { remainingSeconds, currentTask } = req.body;

    await dbRun(
      `UPDATE room_participants 
       SET last_heartbeat = CURRENT_TIMESTAMP, 
           remaining_seconds = COALESCE(?, remaining_seconds),
           current_task = COALESCE(?, current_task)
       WHERE room_id = ? AND user_id = ?`,
      [remainingSeconds, currentTask, roomId, userId]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// Leave a study room
exports.leaveRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: roomId } = req.params;

    await dbRun('DELETE FROM room_participants WHERE room_id = ? AND user_id = ?', [roomId, userId]);

    res.status(200).json({ success: true, message: 'Left study room.' });
  } catch (err) {
    console.error('Leave Room Error:', err);
    res.status(500).json({ success: false, message: 'Failed to leave study room.' });
  }
};
