const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll } = require('../config/db');
const { calculateStudentProgress, getOrUpdateUserStreak } = require('../config/gamification');

const JWT_SECRET = process.env.JWT_SECRET || 'studysync_secret_key_2026_super_secure';

// Helper to generate token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Register User
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'User with this email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), cleanEmail, passwordHash]
    );

    const userId = result.lastID;

    // Initialize user stats
    await dbRun(
      'INSERT INTO user_stats (user_id, current_streak, last_study_date, total_focus_minutes, xp_points, level) VALUES (?, 0, NULL, 0, 0, 1)',
      [userId]
    );

    const userPayload = { id: userId, name: name.trim(), email: cleanEmail };
    const token = generateToken(userPayload);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // process.env.NODE_ENV === 'production'
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        streak: 0,
        level: 1,
        xp: 0,
        totalFocusMinutes: 0
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Get user stats & evaluate streak
    const streak = await getOrUpdateUserStreak(user.id, false);
    const stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [user.id]) || {
      current_streak: 0,
      level: 1,
      xp_points: 0,
      total_focus_minutes: 0
    };

    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const gamification = calculateStudentProgress(stats.xp_points || 0);

    res.status(200).json({
      success: true,
      message: 'Welcome back!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        streak: streak,
        level: gamification.level,
        xp: stats.xp_points,
        totalFocusMinutes: stats.total_focus_minutes,
        gamification
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
};

// Get Current User Profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await dbGet('SELECT id, name, email, created_at FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    const streak = await getOrUpdateUserStreak(userId, false);
    let stats = await dbGet('SELECT * FROM user_stats WHERE user_id = ?', [userId]) || {
      current_streak: 0, level: 1, xp_points: 0, total_focus_minutes: 0
    };

    const gamification = calculateStudentProgress(stats.xp_points || 0);

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
        hasApiKey: !!user.gemini_api_key,
        streak: streak,
        level: gamification.level,
        xp: stats.xp_points,
        totalFocusMinutes: stats.total_focus_minutes,
        lastStudyDate: stats.last_study_date,
        gamification
      }
    });
  } catch (err) {
    console.error('Get Profile Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error fetching profile.' });
  }
};

// Update User Profile (Name, Email, or Password)
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, email, newPassword } = req.body;

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let updatedName = user.name;
    let updatedEmail = user.email;
    let updatedPasswordHash = user.password_hash;

    if (name && name.trim()) {
      updatedName = name.trim();
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail !== user.email) {
        const existing = await dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, userId]);
        if (existing) {
          return res.status(409).json({ success: false, message: 'Email address already in use by another account.' });
        }
        updatedEmail = cleanEmail;
      }
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
      }
      const salt = await bcrypt.genSalt(10);
      updatedPasswordHash = await bcrypt.hash(newPassword, salt);
    }

    await dbRun(
      'UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?',
      [updatedName, updatedEmail, updatedPasswordHash, userId]
    );

    const newToken = generateToken({ id: userId, name: updatedName, email: updatedEmail });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      token: newToken,
      user: { id: userId, name: updatedName, email: updatedEmail }
    });
  } catch (err) {
    console.error('Update Profile Error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// Request Password Reset 6-Digit OTP Code
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await dbGet('SELECT id, name FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address. Please check your spelling or create an account.'
      });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await dbRun('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    await dbRun(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, otp, expiresAt]
    );

    console.log(`==================================================`);
    console.log(`📧 STUDYSYNC OTP EMAIL SENT TO: ${cleanEmail}`);
    console.log(`🔑 6-DIGIT OTP CODE: ${otp} (Expires in 10 mins)`);
    console.log(`==================================================`);

    res.status(200).json({
      success: true,
      message: `A 6-digit OTP code has been dispatched to ${cleanEmail}. Please check your inbox.`,
      email: cleanEmail,
      expiresAt
    });
  } catch (err) {
    console.error('Request Password Reset Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process password reset request.' });
  }
};

// Reset Password with 6-Digit OTP Code
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, token, newPassword } = req.body;
    const otpCode = (otp || token || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!otpCode || !newPassword) {
      return res.status(400).json({ success: false, message: 'OTP code and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    let user = null;
    if (cleanEmail) {
      user = await dbGet('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    }

    let resetRow = null;
    if (user) {
      resetRow = await dbGet('SELECT * FROM password_resets WHERE user_id = ? AND token = ?', [user.id, otpCode]);
    } else {
      resetRow = await dbGet('SELECT * FROM password_resets WHERE token = ?', [otpCode]);
    }

    if (!resetRow) {
      return res.status(400).json({ success: false, message: 'Invalid 6-digit OTP code. Please check and try again.' });
    }

    if (new Date(resetRow.expires_at) < new Date()) {
      await dbRun('DELETE FROM password_resets WHERE id = ?', [resetRow.id]);
      return res.status(400).json({ success: false, message: 'OTP code has expired (valid for 10 mins). Please request a new OTP.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRow.user_id]);
    await dbRun('DELETE FROM password_resets WHERE id = ?', [resetRow.id]);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.'
    });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// Global Student Leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const topStudents = await dbAll(`
      SELECT u.id, u.name, s.xp_points, s.current_streak, s.total_focus_minutes, s.level
      FROM user_stats s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.xp_points DESC, s.current_streak DESC
      LIMIT 20
    `);

    const leaderboard = topStudents.map((student, idx) => {
      const g = calculateStudentProgress(student.xp_points || 0);
      return {
        rank: idx + 1,
        name: student.name,
        xp: student.xp_points || 0,
        streak: student.current_streak || 0,
        totalFocusMinutes: student.total_focus_minutes || 0,
        level: g.level,
        title: g.title,
        badgeColor: g.badgeColor
      };
    });

    res.status(200).json({
      success: true,
      count: leaderboard.length,
      leaderboard
    });
  } catch (err) {
    console.error('Leaderboard Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard.' });
  }
};

// Delete User Account
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    await dbRun('DELETE FROM users WHERE id = ?', [userId]);
    res.clearCookie('token');
    res.status(200).json({ success: true, message: 'Account deleted successfully.' });
  } catch (err) {
    console.error('Delete Account Error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete account.' });
  }
};

// Logout User
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
};
